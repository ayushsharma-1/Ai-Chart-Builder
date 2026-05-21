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
const llm_service_1 = require("../services/llm.service");
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
    return [
        // FROZEN FIRST (cache-optimized prefix)
        promptTokens_1.FROZEN_IDENTITY,
        promptTokens_1.FROZEN_SQL_RULES,
        promptTokens_1.FROZEN_FILTER_RULES,
        promptTokens_1.FROZEN_ALLOWED_FUNCTIONS,
        promptTokens_1.FROZEN_CHART_RULES,
        promptTokens_1.FROZEN_OUTPUT_FORMAT,
        // DYNAMIC AFTER (not cached, varies per query)
        aliasPlanContext,
        schemaContext,
        metricContext || '',
    ].filter(Boolean).join('\n\n');
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
    return lines.join('\n');
}
function collectValidationIssues(sql) {
    const issues = [];
    const guard = (0, sqlGuard_1.validateSql)(sql);
    if (!guard.safe) {
        issues.push(guard.reason || 'SQL failed safety validation');
    }
    const groupByError = (0, llm_service_1.validateSqlForOnlyFullGroupBy)(sql);
    if (groupByError) {
        issues.push(groupByError);
    }
    if (hasNestedAggregates(sql)) {
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
function stripAggregatesFromGroupBy(sql) {
    return sql.replace(/\bGROUP BY\s+(.*?)(?=ORDER BY|LIMIT|HAVING|$)/is, (_match, groupByClause) => {
        const cleanedCols = String(groupByClause)
            .split(',')
            .map((column) => column.trim())
            .filter((column) => !/\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(column))
            .filter((column) => !/FROM_UNIXTIME\s*\(\s*(COUNT|SUM|AVG|MIN|MAX)/i.test(column))
            .join(', ');
        return cleanedCols ? `GROUP BY ${cleanedCols} ` : '';
    });
}
function hasNestedAggregates(sql) {
    const aggregateNames = ['count', 'sum', 'avg', 'min', 'max', 'variance', 'stddev'];
    const lowerSql = sql.toLowerCase();
    for (const name of aggregateNames) {
        let searchIndex = 0;
        while (searchIndex < lowerSql.length) {
            const startIndex = lowerSql.indexOf(`${name}(`, searchIndex);
            if (startIndex === -1) {
                break;
            }
            const inner = readBalancedParentheses(lowerSql, startIndex + name.length);
            if (inner?.content && containsAggregateCall(inner.content, aggregateNames)) {
                return true;
            }
            searchIndex = startIndex + name.length + 1;
        }
    }
    return false;
}
function containsAggregateCall(sql, aggregateNames) {
    return aggregateNames.some((name) => new RegExp(String.raw `\b${name}\s*\(`, 'i').test(sql));
}
function readBalancedParentheses(input, openParenIndex) {
    if (input[openParenIndex] !== '(') {
        return null;
    }
    let depth = 0;
    for (let index = openParenIndex; index < input.length; index += 1) {
        const char = input[index];
        if (char === '(') {
            depth += 1;
        }
        else if (char === ')') {
            depth -= 1;
            if (depth === 0) {
                return {
                    content: input.slice(openParenIndex + 1, index),
                    endIndex: index,
                };
            }
        }
    }
    return null;
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
/**
 * Rewrites GROUP BY clauses that reference SELECT aliases.
 * Builds a map of alias -> full expression from the SELECT clause,
 * then replaces alias usage in GROUP BY with its source expression.
 */
function rewriteGroupByAliases(sql) {
    const selectMatch = /^\s*SELECT\s+([\s\S]+?)\s+FROM\b/i.exec(sql);
    if (!selectMatch)
        return sql;
    const selectClause = selectMatch[1];
    const aliasMap = new Map();
    const items = splitTopLevelCommaSeparated(selectClause);
    for (const item of items) {
        const trimmed = item.trim();
        const explicitMatch = /^([\s\S]+?)\s+AS\s+([`"]?[a-z_][a-z0-9_]*[`"]?)\s*$/i.exec(trimmed);
        if (explicitMatch) {
            const expr = explicitMatch[1].trim();
            const alias = explicitMatch[2].replace(/[`"]/g, '').toLowerCase();
            aliasMap.set(alias, expr);
            continue;
        }
        const implicitMatch = /^([\s\S]+)\s+([a-z_][a-z0-9_]*)$/i.exec(trimmed);
        if (implicitMatch) {
            const lastWord = implicitMatch[2].toLowerCase();
            if (!SQL_KEYWORDS.has(lastWord)) {
                aliasMap.set(lastWord, implicitMatch[1].trim());
            }
        }
    }
    if (aliasMap.size === 0)
        return sql;
    return sql.replace(/\bGROUP\s+BY\s+([\s\S]+?)(?=\s+(?:HAVING|ORDER|LIMIT|UNION|$))/i, (fullMatch, groupByBody) => {
        const rewrittenItems = splitTopLevelCommaSeparated(groupByBody).map((item) => {
            const key = item.trim().replace(/[`"]/g, '').toLowerCase();
            return aliasMap.get(key) ?? item.trim();
        });
        return `GROUP BY ${rewrittenItems.join(', ')}`;
    });
}
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
    const createCompletion = (userMessage) => groq_1.default.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
    });
    const parseCompletion = async (userMessage) => {
        const start = Date.now();
        let usage;
        let success = false;
        let errorMessage;
        try {
            const completion = await createCompletion(userMessage);
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
            success = true;
            return validated.data;
        }
        catch (err) {
            errorMessage = err?.message || String(err);
            throw err;
        }
        finally {
            (0, aiMetricsLogger_1.logAICall)({
                callType: 'sql_generation',
                model: 'llama-3.3-70b-versatile',
                sessionId: input.sessionId,
                userPrompt: input.userPrompt,
                success,
                errorMessage,
                latencyMs: Date.now() - start,
                usage,
            });
        }
    };
    let response = await parseCompletion(baseUserMessage);
    if (response.sql) {
        const semanticAliasRewrite = (0, sqlGuard_1.rewriteSemanticAliases)(response.sql, semanticAliasPlan);
        response.sql = semanticAliasRewrite.sql;
        response.sql = rewriteGroupByAliases(response.sql);
        const normalization = (0, sqlGuard_1.normalizeReservedAliases)(response.sql);
        response.sql = normalization.sql;
        if (response.xAxis && normalization.aliasMap[response.xAxis.toLowerCase()]) {
            response.xAxis = normalization.aliasMap[response.xAxis.toLowerCase()];
        }
        if (response.yAxis && normalization.aliasMap[response.yAxis.toLowerCase()]) {
            response.yAxis = normalization.aliasMap[response.yAxis.toLowerCase()];
        }
        let issues = collectValidationIssues(response.sql);
        if (issues.length > 0) {
            const validationMessage = issues.join(' | ');
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
                const retried = await parseCompletion(buildSqlAgentUserMessage(input, correctionNote));
                if (retried.sql) {
                    const retriedSemanticRewrite = (0, sqlGuard_1.rewriteSemanticAliases)(retried.sql, semanticAliasPlan);
                    retried.sql = retriedSemanticRewrite.sql;
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
            if (issues.length === 0) {
                return response;
            }
            const guardReason = issues.find((issue) => isMechanicalValidationError(issue));
            if (guardReason && response.sql) {
                const fixedSql = stripAggregatesFromGroupBy(response.sql);
                const revalidation = (0, sqlGuard_1.validateSql)(fixedSql);
                if (revalidation.safe && revalidation.sanitizedSql) {
                    console.warn('[SQLAgent] Auto-fixed mechanical SQL error', {
                        original: response.sql,
                        fixed: fixedSql,
                        reason: validationMessage,
                    });
                    response.sql = revalidation.sanitizedSql;
                }
                else {
                    throw new Error(`SQL validation failed: ${validationMessage}`);
                }
            }
            else {
                throw new Error(`SQL validation failed: ${validationMessage}`);
            }
        }
        else {
            const guard = (0, sqlGuard_1.validateSql)(response.sql);
            if (guard.sanitizedSql) {
                response.sql = guard.sanitizedSql;
            }
        }
    }
    return response;
}
