"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSqlFromAgent = generateSqlFromAgent;
const zod_1 = require("zod");
const groq_1 = __importDefault(require("../config/groq"));
const promptTokens_1 = require("../utils/promptTokens");
const schemaService_1 = require("../services/schemaService");
const semanticMetrics_1 = require("../utils/semanticMetrics");
const sqlGuard_1 = require("../utils/sqlGuard");
const aiMetricsLogger_1 = require("../utils/aiMetricsLogger");
const SQL_KEYWORDS = new Set(['asc', 'desc', 'null', 'true', 'false', 'as', 'on', 'and', 'or', 'not', 'in', 'is', 'by', 'from', 'where', 'join', 'inner', 'left', 'right', 'outer', 'group', 'order', 'having', 'limit', 'union', 'all', 'distinct', 'case', 'when', 'then', 'else', 'end']);
const SEMANTIC_ALIAS_BY_TABLE = {
    tbljob: 'job',
    tblassignjobcandidate: 'assignment',
    tblcandidate: 'candidate',
    tbldeals: 'deal',
};
// ── Zod schema for SQL agent output ────────────────────────────────────────
const ChartAgentResponseSchema = zod_1.z.object({
    sql: zod_1.z.string().nullable(),
    chartType: zod_1.z.enum(['bar', 'line', 'pie', 'table']).nullable(),
    title: zod_1.z.string().nullable(),
    xAxis: zod_1.z.string().nullable(),
    yAxis: zod_1.z.string().nullable(),
    reasoning: zod_1.z.string().nullable(),
    isAnalyticsQuery: zod_1.z.boolean(),
    clarificationNeeded: zod_1.z.string().nullable().optional(),
});
/**
 * Builds the SQL agent system prompt.
 *
 * TOKEN CACHE STRATEGY:
 * The FROZEN blocks (identity, rules, functions, chart rules, output format)
 * go FIRST and are identical across all calls → cached by LLM provider.
 * Dynamic content (live schema, semantic metrics) goes AFTER the frozen prefix.
 *
 * Prompt order:
 * [FROZEN IDENTITY]           ← cached
 * [FROZEN SQL RULES]          ← cached
 * [FROZEN FILTER RULES]       ← cached
 * [FROZEN ALLOWED FUNCTIONS]  ← cached
 * [FROZEN CHART RULES]        ← cached
 * [FROZEN OUTPUT FORMAT]      ← cached
 * ─────────────────────────── cache boundary ───────────────────────────────
 * [LIVE SCHEMA]               ← dynamic, varies per query
 * [SEMANTIC METRICS]          ← dynamic, varies per query intent
 */
function buildSqlAgentSystemPrompt(schema, intent) {
    const schemaContext = (0, schemaService_1.formatSchemaForPrompt)(schema);
    const metricContext = (0, semanticMetrics_1.getRelevantSemanticMetricPrompt)(intent.intent);
    const aliasPlanContext = formatSemanticAliasPlan(buildSemanticAliasPlan(schema, intent));
    const tableRules = buildTableRulesFromSchema(schema);
    return [
        // FROZEN FIRST (cache-optimized prefix)
        promptTokens_1.FROZEN_IDENTITY,
        promptTokens_1.FROZEN_SQL_RULES,
        promptTokens_1.FROZEN_COLUMN_CORRECTIONS,
        promptTokens_1.FROZEN_WINDOW_FUNCTION_RULES,
        promptTokens_1.FROZEN_FILTER_RULES,
        promptTokens_1.FROZEN_ALLOWED_FUNCTIONS,
        promptTokens_1.FROZEN_CHART_RULES,
        promptTokens_1.FROZEN_OUTPUT_FORMAT,
        // DYNAMIC AFTER (not cached, varies per query)
        aliasPlanContext,
        tableRules,
        schemaContext,
        metricContext || '',
    ].filter(Boolean).join('\n\n');
}
function buildTableRulesFromSchema(schema) {
    if (!schema?.tables?.length)
        return '';
    const lines = ['TABLE-SPECIFIC RULES:'];
    for (const t of schema.tables) {
        const cols = new Set(t.columns.map((c) => c.columnName.toLowerCase()));
        if (cols.has('deleted')) {
            lines.push(`- ${t.tableName}: when filtering for active rows, use ${t.tableName}.deleted = 0`);
        }
        else if (cols.has('is_deleted')) {
            lines.push(`- ${t.tableName}: when filtering for active rows, use ${t.tableName}.is_deleted = 0`);
        }
        else {
            lines.push(`- ${t.tableName}: NO soft-delete column detected. Do NOT add deleted/is_deleted/archived filters to this table.`);
        }
        // suggest sanitization only when varchar monetary fields detected in schema warnings
        const monetaryVarchar = t.columns.find((c) => c.dataType === 'varchar' && /(amount|value|billing)/i.test(c.columnName));
        if (monetaryVarchar) {
            lines.push(`- ${t.tableName}: ${monetaryVarchar.columnName} is VARCHAR — LLM should sanitize with CAST(REPLACE(${monetaryVarchar.columnName},',','') AS DECIMAL(15,2)) before numeric ops.`);
        }
    }
    return lines.join('\n');
}
function buildSemanticAliasPlan(schema, intent) {
    const orderedTableNames = [...new Set([
            ...intent.tables,
            ...schema.tables.map((table) => table.tableName),
        ])];
    const aliasPlan = {};
    for (const tableName of orderedTableNames) {
        const normalizedTableName = tableName.toLowerCase();
        aliasPlan[normalizedTableName] = SEMANTIC_ALIAS_BY_TABLE[normalizedTableName] || deriveSemanticAlias(normalizedTableName);
    }
    return aliasPlan;
}
function formatSemanticAliasPlan(aliasPlan) {
    const entries = Object.entries(aliasPlan);
    if (entries.length === 0) {
        return '';
    }
    return [
        'SEMANTIC ALIAS PLAN:',
        ...entries.map(([tableName, alias]) => `- ${tableName} -> ${alias}`),
        'RULE: Use these aliases exactly in FROM/JOIN clauses, and qualify each joined column with the matching alias.',
        'RULE: Never use generic aliases such as t1, t2, t3, or other numeric placeholders.',
    ].join('\n');
}
function deriveSemanticAlias(tableName) {
    const stripped = tableName.replace(/^tbl/i, '').replace(/[^a-z0-9]+/gi, '').toLowerCase();
    if (!stripped) {
        return 'entity';
    }
    if (stripped.endsWith('s') && stripped.length > 3) {
        return stripped.slice(0, -1);
    }
    return stripped;
}
function buildSqlAgentUserMessage(input, correctionNote) {
    const lines = [
        `USER REQUEST: ${input.userPrompt}`,
        `DETECTED INTENT: ${input.intent.intent}`,
        `RELEVANT TABLES: ${input.intent.tables.join(', ')}`,
        `METRIC TYPE: ${input.intent.metricType}`,
        `TIME RANGE: ${input.intent.timeRange || 'not specified'}`,
        `NORMALIZED TIME RANGE: ${input.intent.normalizedTimeRange || 'not specified'}`,
        `DIMENSIONS: ${input.intent.dimensions.join(', ') || 'not specified'}`,
        `CHART HINT FROM INTENT: ${input.intent.chartHint || 'not specified'}`,
    ];
    if (input.previousContext?.previousSql) {
        lines.push('', 'FOLLOW-UP CONTEXT:', `Prior chart: ${input.previousContext.previousTitle || 'unknown'}`, `Prior SQL: ${input.previousContext.previousSql}`, `Prior chart type: ${input.previousContext.previousChartType || 'unknown'}`, 'If this is a refinement, adapt the prior SQL while generating a fresh valid SELECT.');
    }
    if (correctionNote) {
        lines.push('', correctionNote.trim());
    }
    lines.push('', 'BEFORE GENERATING SQL: verify every column name against the live schema above.', 'If you need a company name, use the integer FK (companyid/relatedcompany) and JOIN if needed, or use denormalized companyname from tblassignjobcandidate only.', 'tbldeals has NO deleted column - only archived.', 'tbljob and tblcandidate use deleted, NOT archived.');
    return lines.join('\n');
}
function buildMinimalRetryUserMessage(input, correctionNote, affectedTables) {
    const lines = [
        `USER REQUEST: ${input.userPrompt}`,
        `DETECTED INTENT: ${input.intent.intent}`,
        '',
        'CORRECTION REQUIRED:',
        correctionNote.trim(),
        '',
        'Relevant tables and valid columns:',
    ];
    for (const tbl of affectedTables) {
        const tableMeta = input.schema.tables.find((t) => t.tableName.toLowerCase() === tbl.toLowerCase());
        const cols = tableMeta ? tableMeta.columns.map((c) => c.columnName).join(', ') : '(unknown)';
        lines.push(`- ${tbl}: [${cols}]`);
    }
    lines.push('', 'Regenerate the SQL using ONLY the valid columns shown above. Preserve original aggregation intent and chart hint.');
    return lines.join('\n');
}
/**
 * Validates ORDER BY references are valid SELECT aliases or expressions.
 * If ORDER BY references something not in SELECT aliases, keeps it but warns so
 * the database can surface an explicit validation error rather than a silent rewrite.
 */
function fixOrderByAliases(sql) {
    const selectMatch = /^\s*SELECT\s+([\s\S]+?)\s+FROM\b/i.exec(sql);
    if (!selectMatch)
        return sql;
    const aliases = new Set();
    for (const item of splitTopLevelCommaSeparated(selectMatch[1])) {
        const m = /\bAS\s+([`"]?[a-z_][a-z0-9_]*[`"]?)\s*$/i.exec(item.trim());
        if (m)
            aliases.add(m[1].replace(/[`"]/g, '').toLowerCase());
    }
    return sql.replace(/\bORDER\s+BY\s+([\s\S]+?)(?=\s*(?:LIMIT|$))/i, (full, orderBody) => {
        const fixed = splitTopLevelCommaSeparated(orderBody).map((item, index) => {
            const trimmed = item.trim();
            const base = trimmed.replace(/\s+(ASC|DESC)\s*$/i, '').trim();
            const directionMatch = /\s+(ASC|DESC)\s*$/i.exec(trimmed);
            const direction = directionMatch?.[1] || '';
            const baseLower = base.replace(/[`"]/g, '').toLowerCase();
            if (aliases.has(baseLower)) {
                return trimmed;
            }
            if (/[(.)]/.test(base) || /\b(FROM_UNIXTIME|DATE_FORMAT|CAST|COALESCE|COUNT|SUM|AVG)\b/i.test(base)) {
                return trimmed;
            }
            console.warn(`[sqlAgent] ORDER BY may reference unknown alias: ${base}`);
            return direction ? `${index + 1} ${direction}` : `${index + 1}`;
        }).join(', ');
        return `ORDER BY ${fixed}`;
    });
}
function detectWindowFunctionMisuse(sql) {
    const hasWindow = /\b(over)\s*\(/i.test(sql);
    const hasWith = /\bwith\b\s+/i.test(sql);
    if (hasWindow && !hasWith)
        return true; // require WITH aggregated staging
    return false;
}
function logSqlAgentEvent(input, payload) {
    (0, aiMetricsLogger_1.logAICall)({
        callType: payload.callType,
        model: payload.model,
        sessionId: input.sessionId,
        userPrompt: input.userPrompt,
        success: payload.success,
        errorMessage: payload.errorMessage,
        sqlFlow: payload.sqlFlow,
        query: payload.query,
        latencyMs: payload.latencyMs,
        usage: payload.usage,
    });
}
function collectValidationIssues(sql) {
    const issues = [];
    const guard = (0, sqlGuard_1.validateSql)(sql);
    if (!guard.safe) {
        issues.push(guard.reason || 'SQL failed safety validation');
    }
    const groupByError = (0, sqlGuard_1.validateSqlForOnlyFullGroupBy)(sql);
    if (groupByError) {
        issues.push(groupByError);
    }
    if ((0, sqlGuard_1.hasNestedAggregates)(sql)) {
        issues.push('Nested aggregate functions are not allowed. Move the inner aggregation into a subquery before applying the outer aggregate.');
    }
    if (hasDuplicateSelectAliases(sql)) {
        issues.push('Duplicate SELECT aliases detected. Each projected column must use a unique alias.');
    }
    const orderByAliasError = findInvalidOrderByAlias(sql);
    if (orderByAliasError) {
        issues.push(orderByAliasError);
    }
    return issues;
}
function isMechanicalValidationError(reason) {
    const MECHANICAL_ERRORS = [
        'GROUP BY clause must not contain aggregate functions',
        'Missing LIMIT clause',
    ];
    return MECHANICAL_ERRORS.some((error) => reason.includes(error));
}
function hasDuplicateSelectAliases(sql) {
    const aliases = new Set();
    const selectClause = /select([\s\S]*?)from/i.exec(sql)?.[1] || '';
    for (const item of splitTopLevelCommaSeparated(selectClause)) {
        const alias = extractSelectAlias(item);
        if (!alias) {
            continue;
        }
        const normalizedAlias = alias.toLowerCase();
        if (aliases.has(normalizedAlias)) {
            return true;
        }
        aliases.add(normalizedAlias);
    }
    return false;
}
function findInvalidOrderByAlias(sql) {
    const orderByMatch = /\bORDER\s+BY\b([\s\S]*?)(?=\bLIMIT\b|$)/i.exec(sql);
    if (!orderByMatch?.[1]) {
        return null;
    }
    const selectClause = /select([\s\S]*?)from/i.exec(sql)?.[1] || '';
    const projectedColumns = getProjectedSelectColumns(selectClause);
    const orderByClause = orderByMatch[1];
    for (const item of splitTopLevelCommaSeparated(orderByClause)) {
        const trimmed = item.trim();
        if (!trimmed)
            continue;
        const identifier = stripIdentifierQuotes(trimmed.split(/\s+/)[0].replace(/[`,]/g, '')).toLowerCase();
        if (isSqlIdentifier(identifier) && projectedColumns.size > 0 && !projectedColumns.has(identifier) && !/\./.test(identifier)) {
            return `ORDER BY references '${identifier}', which is not a projected SELECT alias. Use a real output column or repeat the full expression.`;
        }
    }
    return null;
}
function getProjectedSelectColumns(selectClause) {
    const projectedColumns = new Set();
    for (const item of splitTopLevelCommaSeparated(selectClause)) {
        const alias = extractSelectAlias(item);
        if (alias) {
            projectedColumns.add(alias.toLowerCase());
        }
        const trimmed = item.trim();
        if (isSqlIdentifier(stripIdentifierQuotes(trimmed))) {
            projectedColumns.add(stripIdentifierQuotes(trimmed).toLowerCase());
            continue;
        }
        const qualifiedParts = trimmed.split('.');
        if (qualifiedParts.length === 2) {
            const columnPart = stripIdentifierQuotes(qualifiedParts[1].trim());
            if (isSqlIdentifier(columnPart)) {
                projectedColumns.add(columnPart.toLowerCase());
            }
        }
    }
    return projectedColumns;
}
function splitTopLevelCommaSeparated(input) {
    const parts = [];
    let current = '';
    let depth = 0;
    let index = 0;
    while (index < input.length) {
        const char = input[index];
        if (char === '\'' || char === '"' || char === '`') {
            const quoted = readQuotedSection(input, index, char);
            current += quoted.text;
            index = quoted.nextIndex;
            continue;
        }
        if (char === '(') {
            depth += 1;
            current += char;
            index += 1;
            continue;
        }
        if (char === ')') {
            depth = Math.max(0, depth - 1);
            current += char;
            index += 1;
            continue;
        }
        if (char === ',' && depth === 0) {
            parts.push(current);
            current = '';
            index += 1;
            continue;
        }
        current += char;
        index += 1;
    }
    if (current) {
        parts.push(current);
    }
    return parts;
}
// Group-by alias rewrites and aggregate removals are handled by the AST-based
// helpers in `sqlGuard.ts`.
function extractSelectAlias(selectItem) {
    const trimmed = selectItem.trim();
    if (!trimmed || !/\s/.test(trimmed)) {
        return null;
    }
    const upper = trimmed.toUpperCase();
    const asIndex = upper.lastIndexOf(' AS ');
    if (asIndex >= 0) {
        const aliasCandidate = stripIdentifierQuotes(trimmed.slice(asIndex + 4).trim());
        return isSqlIdentifier(aliasCandidate) ? aliasCandidate : null;
    }
    const implicitCandidate = stripIdentifierQuotes(trimmed.slice(trimmed.lastIndexOf(' ') + 1).trim());
    return isSqlIdentifier(implicitCandidate) ? implicitCandidate : null;
}
function isSqlIdentifier(value) {
    if (!value || !/^[A-Za-z_]/.test(value)) {
        return false;
    }
    for (let index = 1; index < value.length; index += 1) {
        if (!/[A-Za-z0-9_$]/.test(value[index])) {
            return false;
        }
    }
    return true;
}
function stripIdentifierQuotes(value) {
    if (!value) {
        return value;
    }
    const firstChar = value[0];
    const lastChar = value[value.length - 1];
    if ((firstChar === '`' && lastChar === '`') || (firstChar === '"' && lastChar === '"')) {
        return value.slice(1, -1);
    }
    return value;
}
function readQuotedSection(sql, startIndex, quote) {
    let index = startIndex + 1;
    while (index < sql.length) {
        if (sql[index] === '\\' && quote !== '`') {
            index += 2;
            continue;
        }
        if (sql[index] === quote) {
            if (quote === '`' || sql[index + 1] !== quote) {
                index += 1;
                break;
            }
            index += 2;
            continue;
        }
        index += 1;
    }
    return {
        text: sql.slice(startIndex, index),
        nextIndex: index,
    };
}
async function generateSqlFromAgent(input) {
    const systemPrompt = buildSqlAgentSystemPrompt(input.schema, input.intent);
    const baseUserMessage = buildSqlAgentUserMessage(input);
    const semanticAliasPlan = buildSemanticAliasPlan(input.schema, input.intent);
    const parseCompletion = async (userMessage) => {
        const start = Date.now();
        let usage;
        let success = false;
        let errorMessage;
        let generatedSql;
        try {
            const completion = await groq_1.default.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                temperature: 0.1,
                max_tokens: 1200,
                response_format: { type: 'json_object' },
            });
            usage = completion.usage;
            const raw = completion.choices[0]?.message?.content;
            if (!raw) {
                throw new Error('SQL agent returned empty response');
            }
            const parsed = JSON.parse(raw);
            const validated = ChartAgentResponseSchema.safeParse(parsed);
            if (!validated.success) {
                console.error('[SQLAgent] Zod validation failed:', validated.error.flatten());
                throw new Error('SQL agent returned invalid response structure');
            }
            generatedSql = validated.data.sql || undefined;
            success = true;
            return validated.data;
        }
        catch (err) {
            errorMessage = err?.message || String(err);
            throw err;
        }
        finally {
            logSqlAgentEvent(input, {
                model: 'llama-3.3-70b-versatile',
                callType: 'sql_generation',
                success,
                errorMessage,
                latencyMs: Date.now() - start,
                usage,
                sqlFlow: {
                    stage: 'generation',
                    sql: generatedSql,
                    validationPassed: success,
                },
                query: generatedSql ? { sql: generatedSql, stage: 'generation' } : undefined,
            });
        }
    };
    let llmRetries = 0;
    const callParseCompletion = async (userMessage, isRetry = false) => {
        if (isRetry) {
            llmRetries += 1;
            if (llmRetries > 2) {
                throw new Error('Max LLM retries exceeded');
            }
        }
        return parseCompletion(userMessage);
    };
    let response = await callParseCompletion(baseUserMessage, false);
    if (response.sql) {
        const currentSql = response.sql;
        const semanticAliasRewrite = (0, sqlGuard_1.rewriteSemanticAliases)(response.sql, semanticAliasPlan);
        response.sql = semanticAliasRewrite.sql;
        response.sql = (0, sqlGuard_1.rewriteGroupByAliases)(response.sql);
        response.sql = fixOrderByAliases(response.sql);
        const normalization = (0, sqlGuard_1.normalizeReservedAliases)(response.sql);
        response.sql = normalization.sql;
        if (response.xAxis && normalization.aliasMap[response.xAxis.toLowerCase()]) {
            response.xAxis = normalization.aliasMap[response.xAxis.toLowerCase()];
        }
        if (response.yAxis && normalization.aliasMap[response.yAxis.toLowerCase()]) {
            response.yAxis = normalization.aliasMap[response.yAxis.toLowerCase()];
        }
        const schemaColumnMap = {};
        const schemaTypeMap = {};
        for (const t of input.schema.tables) {
            const name = t.tableName.toLowerCase();
            schemaColumnMap[name] = new Set(t.columns.map((c) => c.columnName.toLowerCase()));
            schemaTypeMap[name] = {};
            for (const c of t.columns) {
                schemaTypeMap[name][c.columnName.toLowerCase()] = c.dataType;
            }
        }
        const columnRefs = (0, sqlGuard_1.getColumnRefsFromSql)(response.sql);
        const missingColumns = [];
        const sanitizationMismatches = [];
        for (const ref of columnRefs) {
            const tbl = ref.table ? ref.table.toLowerCase() : null;
            const col = ref.column ? ref.column.toLowerCase() : '';
            if (tbl && !schemaColumnMap[tbl]?.has(col)) {
                missingColumns.push({ table: tbl, column: col });
            }
        }
        const lowerSql = response.sql.toLowerCase();
        const replaceMatches = [...(lowerSql.matchAll(/replace\s*\(\s*([^,)]+)\s*,\s*'\s*,\s*'\s*\)/gi))];
        for (const m of replaceMatches) {
            const colRef = String(m[1]).replace(/[`"\s]/g, '');
            const parts = colRef.split('.');
            if (parts.length === 2) {
                const tbl = parts[0].toLowerCase();
                const col = parts[1].toLowerCase();
                const dtype = schemaTypeMap[tbl]?.[col];
                if (dtype && dtype !== 'varchar' && dtype !== 'text' && dtype !== 'char') {
                    sanitizationMismatches.push(`${tbl}.${col} is ${dtype} but was wrapped in REPLACE/CLEANUP sanitization`);
                }
            }
        }
        let issues = collectValidationIssues(response.sql);
        if (detectWindowFunctionMisuse(currentSql)) {
            issues.push('Window function used without aggregated staging; wrap base aggregation in a CTE and apply window functions in an outer query.');
        }
        if (missingColumns.length > 0) {
            const missingSoftDeletes = missingColumns.filter((m) => ['deleted', 'archived'].includes(m.column));
            if (missingSoftDeletes.length > 0) {
                const notes = missingSoftDeletes.map((m) => `${m.table}.${m.column}`).join(', ');
                const correctionNote = `CORRECTION REQUIRED: The following referenced soft-delete columns do NOT exist: ${notes}. Remove these filters and regenerate a valid query referencing only existing columns.`;
                console.warn('[SQLAgent] Missing soft-delete columns detected:', notes);
                const affectedTables = [...new Set(missingSoftDeletes.map((m) => String(m.table).toLowerCase()))];
                console.info('[SQLAgent] Sending minimal retry prompt for tables:', affectedTables.join(', '));
                logSqlAgentEvent(input, {
                    model: 'llama-3.3-70b-versatile',
                    callType: 'sql_retry',
                    success: true,
                    latencyMs: 0,
                    sqlFlow: {
                        stage: 'retry',
                        previousSql: currentSql,
                        correctionNote,
                        retried: true,
                    },
                });
                const retried = await callParseCompletion(buildMinimalRetryUserMessage(input, correctionNote, affectedTables), true);
                if (retried.sql) {
                    const retriedSemanticRewrite = (0, sqlGuard_1.rewriteSemanticAliases)(retried.sql, semanticAliasPlan);
                    retried.sql = retriedSemanticRewrite.sql;
                    retried.sql = (0, sqlGuard_1.rewriteGroupByAliases)(retried.sql);
                    retried.sql = fixOrderByAliases(retried.sql);
                    const retriedNormalization = (0, sqlGuard_1.normalizeReservedAliases)(retried.sql);
                    retried.sql = retriedNormalization.sql;
                    if (retried.xAxis && retriedNormalization.aliasMap[retried.xAxis.toLowerCase()]) {
                        retried.xAxis = retriedNormalization.aliasMap[retried.xAxis.toLowerCase()];
                    }
                    if (retried.yAxis && retriedNormalization.aliasMap[retried.yAxis.toLowerCase()]) {
                        retried.yAxis = retriedNormalization.aliasMap[retried.yAxis.toLowerCase()];
                    }
                    const retriedIssues = collectValidationIssues(retried.sql);
                    if (retriedIssues.length === 0) {
                        response = retried;
                        issues = retriedIssues;
                    }
                    else {
                        throw new Error(`SQL validation failed: ${retriedIssues.join(' | ')}`);
                    }
                }
            }
            else {
                for (const m of missingColumns) {
                    issues.push(`Column '${m.column}' does not exist on table '${m.table || 'unknown'}'`);
                }
            }
        }
        if (sanitizationMismatches.length > 0) {
            for (const s of sanitizationMismatches)
                issues.push(s);
        }
        if (issues.length > 0) {
            const validationMessage = issues.join(' | ');
            logSqlAgentEvent(input, {
                model: 'llama-3.3-70b-versatile',
                callType: 'sql_validation',
                success: false,
                latencyMs: 0,
                errorMessage: validationMessage,
                sqlFlow: {
                    stage: 'validation',
                    sql: currentSql,
                    validationPassed: false,
                    validationIssues: [...issues],
                },
                query: currentSql ? { sql: currentSql, stage: 'validation' } : undefined,
            });
            console.error(`[SQLAgent] SQL validation failed. Reason: ${validationMessage}`);
            console.error(`[SQLAgent] Generated SQL was:\n${response.sql}`);
            let correctionNote;
            const forbiddenColumnIssue = issues.find((issue) => /tblassignjobcandidate/i.test(issue) && /(deleted|archived)/i.test(issue));
            const invalidColumnIssue = issues.find((issue) => /Column '.*?' does not exist on table '.*?'/i.test(issue));
            if (forbiddenColumnIssue) {
                correctionNote = `CORRECTION REQUIRED: Your previous query used column 'deleted' or 'archived' on tblassignjobcandidate. This column does NOT exist on tblassignjobcandidate. DO NOT add any deleted/archived filter to tblassignjobcandidate. Regenerate the query without any deleted or archived filter on tblassignjobcandidate.`;
            }
            else if (invalidColumnIssue) {
                correctionNote = `CORRECTION REQUIRED: ${invalidColumnIssue} In JOIN queries, validate column ownership before assigning an alias. For example, 'name' belongs to tbljob, not tblassignjobcandidate. Regenerate the query with corrected column table aliases.`;
            }
            if (correctionNote) {
                const affectedTables = [...new Set(missingColumns.map((m) => String(m.table).toLowerCase()))];
                console.info('[SQLAgent] Sending minimal retry prompt for tables:', affectedTables.join(', '));
                logSqlAgentEvent(input, {
                    model: 'llama-3.3-70b-versatile',
                    callType: 'sql_retry',
                    success: true,
                    latencyMs: 0,
                    sqlFlow: {
                        stage: 'retry',
                        previousSql: currentSql,
                        correctionNote,
                        retried: true,
                    },
                });
                const retried = await callParseCompletion(buildMinimalRetryUserMessage(input, correctionNote, affectedTables), true);
                if (retried.sql) {
                    const retriedSql = retried.sql;
                    const retriedSemanticRewrite = (0, sqlGuard_1.rewriteSemanticAliases)(retried.sql, semanticAliasPlan);
                    retried.sql = retriedSemanticRewrite.sql;
                    retried.sql = (0, sqlGuard_1.rewriteGroupByAliases)(retried.sql);
                    retried.sql = fixOrderByAliases(retried.sql);
                    const retriedNormalization = (0, sqlGuard_1.normalizeReservedAliases)(retried.sql);
                    retried.sql = retriedNormalization.sql;
                    if (retried.xAxis && retriedNormalization.aliasMap[retried.xAxis.toLowerCase()]) {
                        retried.xAxis = retriedNormalization.aliasMap[retried.xAxis.toLowerCase()];
                    }
                    if (retried.yAxis && retriedNormalization.aliasMap[retried.yAxis.toLowerCase()]) {
                        retried.yAxis = retriedNormalization.aliasMap[retried.yAxis.toLowerCase()];
                    }
                    const retriedIssues = collectValidationIssues(retried.sql);
                    logSqlAgentEvent(input, {
                        model: 'llama-3.3-70b-versatile',
                        callType: 'sql_retry',
                        success: retriedIssues.length === 0,
                        latencyMs: 0,
                        errorMessage: retriedIssues.length > 0 ? retriedIssues.join(' | ') : undefined,
                        sqlFlow: {
                            stage: 'retry',
                            sql: retried.sql,
                            previousSql: currentSql,
                            correctionNote,
                            validationPassed: retriedIssues.length === 0,
                            validationIssues: [...retriedIssues],
                            retried: true,
                        },
                        query: { sql: retriedSql, stage: 'retry' },
                    });
                    if (retriedIssues.length === 0) {
                        response = retried;
                        issues = retriedIssues;
                    }
                    else {
                        throw new Error(`SQL validation failed: ${retriedIssues.join(' | ')}`);
                    }
                }
            }
            if (issues.length === 0) {
                return response;
            }
            const guardReason = issues.find((issue) => isMechanicalValidationError(issue));
            if (guardReason && response.sql) {
                const fixedSql = (0, sqlGuard_1.stripAggregatesFromGroupBy)(response.sql);
                const revalidation = (0, sqlGuard_1.validateSql)(fixedSql);
                if (revalidation.safe && revalidation.sanitizedSql) {
                    console.warn('[SQLAgent] Auto-fixed mechanical SQL error', {
                        original: response.sql,
                        fixed: fixedSql,
                        reason: validationMessage,
                    });
                    response.sql = revalidation.sanitizedSql;
                    logSqlAgentEvent(input, {
                        model: 'llama-3.3-70b-versatile',
                        callType: 'sql_validation',
                        success: true,
                        latencyMs: 0,
                        errorMessage: undefined,
                        sqlFlow: {
                            stage: 'final',
                            sql: response.sql,
                            previousSql: currentSql,
                            validationPassed: true,
                            validationIssues: [...issues],
                            transformations: ['stripAggregatesFromGroupBy'],
                        },
                        query: { sql: response.sql, sanitizedSql: revalidation.sanitizedSql, stage: 'final' },
                    });
                }
                else {
                    logSqlAgentEvent(input, {
                        model: 'llama-3.3-70b-versatile',
                        callType: 'sql_validation',
                        success: false,
                        latencyMs: 0,
                        errorMessage: validationMessage,
                        sqlFlow: {
                            stage: 'validation',
                            sql: response.sql,
                            previousSql: currentSql,
                            validationPassed: false,
                            validationIssues: [...issues],
                        },
                        query: { sql: response.sql, stage: 'validation' },
                    });
                    throw new Error(`SQL validation failed: ${validationMessage}`);
                }
            }
            else {
                logSqlAgentEvent(input, {
                    model: 'llama-3.3-70b-versatile',
                    callType: 'sql_validation',
                    success: false,
                    latencyMs: 0,
                    errorMessage: validationMessage,
                    sqlFlow: {
                        stage: 'validation',
                        sql: currentSql,
                        previousSql: currentSql,
                        validationPassed: false,
                        validationIssues: [...issues],
                    },
                    query: { sql: currentSql, stage: 'validation' },
                });
                throw new Error(`SQL validation failed: ${validationMessage}`);
            }
        }
        else {
            const guard = (0, sqlGuard_1.validateSql)(currentSql);
            if (guard.sanitizedSql) {
                response.sql = guard.sanitizedSql;
            }
            logSqlAgentEvent(input, {
                model: 'llama-3.3-70b-versatile',
                callType: 'sql_validation',
                success: true,
                latencyMs: 0,
                sqlFlow: {
                    stage: 'final',
                    sql: response.sql ?? currentSql,
                    validationPassed: true,
                    transformations: guard.sanitizedSql && guard.sanitizedSql !== currentSql ? ['validateSqlSanitized'] : undefined,
                },
                query: { sql: response.sql ?? currentSql, sanitizedSql: guard.sanitizedSql, stage: 'final' },
            });
        }
    }
    return response;
}
