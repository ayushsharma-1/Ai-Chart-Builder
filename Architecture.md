# How the AI Analytics Pipeline Works

## The Short Version

```text
User prompt
    ↓
intent_analysis  [llama — cheap]
    ↓
sql_generation   [gpt-oss-120b — expensive, full prompt]
    ↓
node-sql-parser AST validation  [zero cost, deterministic]
    ├── PASS → AST injection (post-validation rewrite)
    │              ├── injectAccountIdFilter() — when `accountId` is supplied, add `table_alias.accountid = <id>` predicates to the root SELECT WHERE for each allowed table
    │              ├── the injector emits a compact structured trace (tables discovered, injected targets, duplicate aliases skipped)
    │              ├── execute query
    │              │    ├── success → write executed SQL and metrics to ai-metrics log → return chart
    │              │    └── DB error → fix_agent [gpt-oss-120b, small prompt: sql+error only] → re-execute once
    │              └── ALL executed SQLs (happy and error paths) are persisted to ai-metrics.ndjson with `executedSql` and `accountId`
    └── FAIL → fix_agent [gpt-oss-120b, small prompt: sql+reason+rules]
                   ↓
              AST validation again
                   ├── PASS → proceed with AST injection + execution
                   └── FAIL → return error to user (no more retries)

If anything breaks along the way, we either fix it automatically or tell the user why we couldn't answer.
```

---

## Stage 1 — Understanding the Prompt

**Model:** `llama-3.1-8b-instant`

The user sends a plain text message. Before we call any LLM, two cheap synchronous checks run first — no tokens spent, no API calls.

**Pre-flight check 1 — Is it too short or meaningless?**
If the prompt has fewer than 4 words, we stop immediately and ask the user to be more specific. Examples that get caught here: `"What job is"`, `"Show me"`.

**Pre-flight check 2 — Is it a system question, not a data question?**
Prompts like `"How many tables do you have"` or `"What can you query"` are about the tool, not the data. We return a friendly non-analytics response without touching the LLM.

If both checks pass, we call the LLM with:
- The user's prompt
- Any prior conversation context (last 4 messages if a session exists)
- A short instruction to classify intent and select relevant tables

**What comes back (Zod-validated JSON):**
```
tables:         which of the 4 tables are needed
metricType:     count / sum / average / trend / ratio / distribution / scalar
timeRange:      last_30d / last_12m / this_month / etc.
dimensions:     month / owner / company / stage / etc.
isAnalytics:    true or false
confidence:     0.0 to 1.0
clarificationQuestion: what to ask the user if confidence is low
intent:         one-sentence summary of what the user wants
```

**If confidence is below 0.65** → pipeline stops here. We return the clarification question to the user. No SQL is generated, no tokens spent on SQL gen.

**If the LLM call itself fails** (timeout after 6 seconds, rate limit) → `buildIntentFallback()` runs. It uses keyword matching on the prompt to guess which tables are needed, then continues the pipeline with that guess.

---

## Stage 2 — Getting the Schema

**Engine:** MySQL INFORMATION_SCHEMA + in-memory cache

We take the table list from Stage 1 and fetch the live column definitions from `INFORMATION_SCHEMA`. This gives us actual column names, data types, nullable flags, and foreign keys — not a manually maintained list.

**Cache behavior:** Once fetched, schema is cached for 10 minutes keyed by the sorted table set. A second request for the same tables in that window costs zero database calls.

**What we do with it:**
`buildTableRulesFromSchema()` scans the fetched columns and generates table-specific rules automatically. For example:
- If it finds a `VARCHAR` column called `billingamount` → it adds a rule telling the SQL agent to sanitize it with `CAST(REPLACE(...) AS DECIMAL(15,2))`
- If it finds a `deleted` column → it adds `WHERE table.deleted = 0` as a required filter for that table
- If `tblassignjobcandidate` is in scope → it adds a note that this table has no deleted/archived column and no filter should be applied to it

These rules get injected directly into the SQL generation prompt in Stage 3.

**If INFORMATION_SCHEMA fails** (permissions issue, connection problem) → falls back to the static schema definitions in `dataModel.ts`. The pipeline continues, just with slightly less precise column information.

---

## Stage 3 — Writing the SQL

**Model:** `openai/gpt-oss-120b`

This is the main LLM call. It receives everything we know and produces a SQL query plus chart configuration.

**How the system prompt is assembled** (order matters for provider-side prompt caching):

```
1. FROZEN_IDENTITY           ← always the same, cached by the provider
2. FROZEN_SQL_RULES          ← always the same, cached
3. FROZEN_FILTER_RULES       ← always the same, cached
4. FROZEN_COLUMN_CORRECTIONS ← always the same, cached
5. FROZEN_FK_LABEL_RULES     ← always the same, cached
6. FROZEN_WINDOW_RULES       ← always the same, cached
7. FROZEN_OUTPUT_FORMAT      ← always the same, cached
──────────────────────────── cache boundary ────────────────────────────
8. Live schema from Stage 2  ← changes per query
9. Semantic metrics          ← changes per query intent
```

Frozen blocks go first because the provider caches the prefix. If the first 7 blocks are identical across calls (they always are), the provider skips re-processing them and only handles the dynamic tail. This saves tokens and latency.

**What goes in the user message:**
- User request (the original prompt)
- Detected intent from Stage 1
- Relevant tables
- Metric type and time range
- Follow-up context if this is a refinement of a previous query
- Table-specific rules from Stage 2 (the VARCHAR warnings, filter requirements)

**What comes back (Zod-validated JSON):**
```
sql:                the SELECT query
chartType:          bar / line / pie / table
title:              human-readable chart title
xAxis:              column alias for the x-axis
yAxis:              column alias for the primary metric
reasoning:          one sentence explaining what the query measures
isAnalyticsQuery:   true or false
clarificationNeeded: specific question if the LLM couldn't determine intent
```

**Before passing the SQL to the validator**, three rewrites run in order:
1. `rewriteGroupByAliases()` — if GROUP BY references SELECT aliases, replaces them with full expressions
2. `fixOrderByAliases()` — same for ORDER BY
3. `normalizeReservedAliases()` — renames reserved words used as column aliases (rank → row_rank, group → group_name, etc.)

## Stage 4 — Validating the SQL

**Engine:** `node-sql-parser`

Every SQL string goes through this gate regardless of where it came from. No LLM involved. Pure deterministic logic.

**`validateSql()` — the main gate runs these checks in order:**

1. Must start with SELECT (no INSERT, UPDATE, DELETE, DROP, etc.)
2. No forbidden output clauses (INTO OUTFILE, INTO DUMPFILE)
3. No dangerous functions (SLEEP, LOAD_FILE, BENCHMARK, GET_LOCK, etc.)
4. No information disclosure functions (CURRENT_USER, VERSION, DATABASE)
5. No system variable access (@@datadir, @@basedir, etc.)
6. No SQL comments (—, /\*, #) — comment injection vector
7. No stacked queries (semicolon not at the end)
8. No PII columns in SELECT (emailid, contactnumber, formatted_contact_number)
9. Table whitelist check — only tblcandidate, tblassignjobcandidate, tbldeals, tbljob allowed
10. GROUP BY must not contain aggregate functions
11. LIMIT auto-injected if missing (capped at 10,000 rows)

**`collectValidationIssues()` — secondary checks:**
- Prefixed column references (e.g. `tbljob.deleted`) are verified against the live schema columns to catch hallucinated column names

**Validation outcomes:**

- **Pass** → `sanitizedSql` returned, pipeline continues to Stage 5a
- **Fail** → issues collected, pipeline routes to Stage 5b (Fix Agent)

---

## Stage 5a — Running the Query

 **Engine:** mysql2

The validated SQL runs against the MySQL database with a 10-second execution timeout per query (`SET SESSION MAX_EXECUTION_TIME=10000`).

**What comes back:**
```
data:           array of row objects
rowCount:       number of rows returned
executionTimeMs: how long MySQL took
cacheStatus:    hit / miss / stale (in-memory cache)
```

**Outcomes:**
- **Success with rows** → continues to Stage 6
- **rowCount is 0** → pipeline returns `type: "empty_result"`. No chart rendered. User sees "query ran successfully but returned no data"
- **MySQL error** → routes to Stage 5b (Fix Agent)

---

## Stage 5b — Fixing a Broken Query

**Model:** `openai/gpt-oss-120b` | **Max 1 attempt**

Invoked in two situations: AST validation failed (Stage 4) or MySQL threw an execution error (Stage 5a).

**Mode A — Validation failure:**
System prompt includes the full SQL rules, window function rules, and column correction rules. User message contains the broken SQL and the exact validation issues from `collectValidationIssues()`. The LLM returns only corrected SQL — no explanation, no markdown.

**Mode B — MySQL execution error:**
System prompt is a compact repair guide with the most common error patterns and their fixes (deal.deleted → archived, job.jobid → id, assignment.placementdate → joiningdate, etc.). User message contains the broken SQL and the exact MySQL error string.

**After the fix agent responds:**
The returned SQL goes through the exact same validation path as in Stage 4 — `validateSql()` runs again. If it passes, the query executes. If it fails, the entire attempt is abandoned and the user gets a generic error message. We do not retry the fix agent.

---

## Stage 6 — Picking the Right Chart

**Engine:** deterministic logic, no LLM

The actual query results are analyzed to decide what chart type makes sense. The LLM's `chartType` suggestion from Stage 3 is used as a hint, not a command.

**`dataTransformer.ts` profiles the data:**
- Detects column types (number, string, date, boolean)
- Identifies date-like columns (YYYY-MM pattern)
- Measures cardinality per column
- Flags identifier columns (anything ending in `_id` — these are dimensions, not metrics)
- Computes `isHighCardinality`, `hasTimeSeriesColumn`, `hasNumericMetric`, `isSingleRow`

**`chartRecommender.ts` makes the final call:**

| Condition | Result |
|---|---|
| Zero rows | table (handled upstream, shouldn't reach here) |
| No numeric column | force table |
| Single row | honor LLM suggestion |
| x-axis is date-like AND LLM said bar | override to line |
| Pie AND more than 8 slices | override to bar, set `pieDisabled: true` |
| Row count > 50 AND bar or line | keep chart type, add `densityWarning` message |
| Multiple numeric columns | enable multi-series with `seriesKeys` |
| High cardinality (> 30 unique string values) | add `densityWarning`, do not force table |

**What comes back:**
```
chartType:       final chart type (may differ from LLM's suggestion)
xAxis:           column for the x-axis
yAxis:           primary metric column
seriesKeys:      all metric columns for multi-series charts
overrideReason:  plain English explanation if the chart type was changed
pieDisabled:     true if pie tab should be hidden in the UI
densityWarning:  amber notice shown when data is dense
confidence:      high / medium / low
```

## Hard Limits

| Thing | Limit |
|---|---|
| Query row cap | 10,000 rows (LIMIT auto-injected) |
| MySQL execution timeout | 10 seconds |
| Intent agent timeout | 6 seconds |
| Fix agent attempts | 1 per request |
| SQL generation retries | 1 (on 400 json_validate_failed only) |
| Schema cache TTL | 10 minutes |
| Session context window | Last 4 messages |
| Confidence threshold for clarification | 0.65 |
| Pie chart max slices | 8 (above this, `pieDisabled: true`) |
| Density warning threshold | 50+ rows on bar or line |