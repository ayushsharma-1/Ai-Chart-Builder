import { getRelevantSchemaContext } from './dataModel';
import { getRelevantSemanticMetricPrompt } from './semanticMetrics';

export interface LLMRuntimeContext {
  previousPrompt?: string;
  previousTitle?: string;
  previousSql?: string;
  previousChartType?: string;
}

export const BASE_SYSTEM_PROMPT = `
You are a read-only analytics assistant for an internal HR and recruitment platform.
Convert natural language requests into MySQL 8 analytical queries and chart configurations.
Prioritize token-efficient, reusable instruction blocks and prefer compact analytical context over verbose schema dumps.
`.trim();

export const CORE_SQL_RULES = `
CORE SQL RULES:
- Generate only read-only MySQL 8 SELECT analytics queries.
- Never generate INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, EXECUTE, or system-level operations.
- Use only the schema and semantic metrics provided in the prompt context.
- Always explicitly select columns; never use SELECT *.
- All timestamps are UNIX timestamps, so use FROM_UNIXTIME() before date formatting or time bucketing.
- Use safe, non-reserved aliases and avoid keywords such as rank, group, order, key, index, table, column, and rows.
- Prefer denormalized analytical fields from tblassignjobcandidate when they reduce join cost or preserve funnel context.
- For grouped date analytics, repeat the full expression in GROUP BY instead of using a SELECT alias.
- If the request is for a single scalar metric, return chartType = "table".
- If the request is unrelated to analytics, return isAnalyticsQuery = false.
`.trim();

export const FAILURE_PREVENTION_RULES = `
FAILURE PREVENTION RULES:
Aggregation Safety Rules:
- Preserve MySQL ONLY_FULL_GROUP_BY compatibility.
- Every non-aggregated selected field must appear in GROUP BY.
- Never mix row-level fields with aggregated metrics in SELECT, HAVING, ORDER BY, or arithmetic expressions.
- Never nest aggregate functions or apply arithmetic to raw grouped values; aggregate first, then calculate.
- Validate every SELECT branch independently inside UNION or UNION ALL queries.

Alias Safety Rules:
- Never use SELECT aliases inside GROUP BY.
- Repeat the full expression instead of grouping by an alias.
- Keep aliases readable and avoid reserved keywords or ambiguous names.

Statistical Calculation Rules:
- VARIANCE, STDDEV, STDDEV_POP, and STDDEV_SAMP must operate on already-aggregated datasets.
- For trend analysis, first group by the business dimension and time grain, then apply statistical calculations in an outer query.
- Calculate durations from grouped or aggregated timestamps rather than mixing raw row values with summary metrics.

Visualization Rules:
- Avoid high-cardinality identifiers and near-unique grouping patterns in charts.
- Use low-cardinality dimensions for pie charts and time-series grouping for line charts.
- Keep chart output visualization-friendly with one primary dimension and one or more aggregated numeric metrics.
- Use HAVING only for aggregated thresholds that make sense for the chart and do not depend on aliases.

Derived Table Rules:
- When using subqueries or derived tables, explicitly select every column referenced by the outer query.
- Maintain column lineage across nested queries and do not rely on hidden or implicit fields.

Monetary Aggregation Rules:
- billingamount and billingvalue are VARCHAR fields that must be sanitized before numeric operations.
- Use CAST(REPLACE(column_name, ',', '') AS DECIMAL(15,2)) inside SUM, AVG, or other numeric aggregations.
- dealvalue is already DECIMAL and does not need sanitization.
`.trim();

export const CHART_RULES = `
CHART RULES:
- line charts should prefer time-series grouping.
- bar charts should compare grouped business dimensions.
- pie charts should use a small number of low-cardinality categories.
- tables should be used for detailed or scalar results.
- If the model cannot produce a clean chart-friendly aggregate shape, it should ask for clarification instead of inventing one.
`.trim();

export const OUTPUT_FORMAT_RULES = `
OUTPUT FORMAT RULES:
- Respond only with valid JSON.
- Use the exact keys: sql, chartType, title, xAxis, yAxis, reasoning, isAnalyticsQuery, clarificationNeeded.
- For non-analytics queries, return null for sql, chartType, title, xAxis, yAxis, and reasoning, with isAnalyticsQuery = false.
- Do not add markdown, prose, or extra wrapper text.
`.trim();

export function buildRuntimeUserContext(userPrompt: string, context?: LLMRuntimeContext) {
  const lines = [
    'USER QUERY CONTEXT:',
    `User request: ${userPrompt}`,
  ];

  if (context?.previousTitle || context?.previousPrompt || context?.previousChartType || context?.previousSql) {
    lines.push(
      'Follow-up context:',
      `Previous chart title: ${context.previousTitle || 'unknown'}`,
      `Previous prompt: ${context.previousPrompt || 'unknown'}`,
      `Previous chart type: ${context.previousChartType || 'unknown'}`,
      `Previous SQL: ${context.previousSql || 'unknown'}`,
      'If this is a refinement, preserve useful intent from the prior query while generating a fresh safe SELECT statement.'
    );
  }

  return lines.join('\n');
}

function buildPromptIntent(userPrompt: string, context?: LLMRuntimeContext) {
  return [userPrompt, context?.previousPrompt, context?.previousTitle, context?.previousChartType].filter(Boolean).join(' ');
}

export function buildLLMSystemPrompt(userPrompt: string, context?: LLMRuntimeContext) {
  const intent = buildPromptIntent(userPrompt, context);
  const schemaContext = getRelevantSchemaContext(intent);
  const metricContext = getRelevantSemanticMetricPrompt(intent);

  return [BASE_SYSTEM_PROMPT, schemaContext, metricContext, CORE_SQL_RULES, FAILURE_PREVENTION_RULES, CHART_RULES, OUTPUT_FORMAT_RULES].filter(Boolean).join('\n\n');
}

export function buildLLMMessages(userPrompt: string, context?: LLMRuntimeContext) {
  return {
    systemPrompt: buildLLMSystemPrompt(userPrompt, context),
    userPrompt: buildRuntimeUserContext(userPrompt, context),
  };
}