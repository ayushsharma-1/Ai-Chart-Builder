import { z } from 'zod';
import { Parser } from 'node-sql-parser';
import groq from '../config/groq';
import {
  FROZEN_IDENTITY,
  FROZEN_SQL_RULES,
  FROZEN_DISTINCT_RULES,
  FROZEN_COLUMN_CORRECTIONS,
  FROZEN_FK_LABEL_RULES,
  FROZEN_WINDOW_FUNCTION_RULES,
  FROZEN_FILTER_RULES,
  FROZEN_ALLOWED_FUNCTIONS,
  FROZEN_CHART_RULES,
  FROZEN_OUTPUT_FORMAT,
} from '../utils/promptTokens';
import { SchemaSnapshot, formatSchemaForPrompt } from '../services/schemaService';
import { getRelevantSemanticMetricPrompt } from '../utils/semanticMetrics';
import { IntentAnalysis } from './intentAgent';
import { normalizeReservedAliases, rewriteSemanticAliases, rewriteGroupByAliases } from '../utils/sqlGuard';
import { logAICall } from '../utils/aiMetricsLogger';

const SQL_KEYWORDS = new Set(['asc', 'desc', 'null', 'true', 'false', 'as', 'on', 'and', 'or', 'not', 'in', 'is', 'by', 'from', 'where', 'join', 'inner', 'left', 'right', 'outer', 'group', 'order', 'having', 'limit', 'union', 'all', 'distinct', 'case', 'when', 'then', 'else', 'end']);
const parser = new Parser();
const SEMANTIC_ALIAS_BY_TABLE: Record<string, string> = {
  tbljob: 'job',
  tblassignjobcandidate: 'assignment',
  tblcandidate: 'candidate',
  tbldeals: 'deal',
};

// ── Zod schema for SQL agent output ────────────────────────────────────────
const ChartAgentResponseSchema = z.object({
  sql: z.string().nullable(),
  chartType: z.enum(['bar', 'line', 'pie', 'table']).nullable(),
  title: z.string().nullable(),
  xAxis: z.string().nullable(),
  yAxis: z.string().nullable(),
  reasoning: z.string().nullable(),
  isAnalyticsQuery: z.boolean(),
  clarificationNeeded: z.string().nullable(),
});

export type ChartAgentResponse = z.infer<typeof ChartAgentResponseSchema>;

export interface SqlAgentInput {
  userPrompt: string;
  intent: IntentAnalysis;
  schema: SchemaSnapshot;
  sessionId?: string;
  previousContext?: {
    previousPrompt?: string;
    previousTitle?: string;
    previousSql?: string;
    previousChartType?: string;
  };
}

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
function buildSqlAgentSystemPrompt(schema: SchemaSnapshot, intent: IntentAnalysis): string {
  const schemaContext = formatSchemaForPrompt(schema);
  const metricContext = getRelevantSemanticMetricPrompt(intent.intent);
  const aliasPlanContext = formatSemanticAliasPlan(buildSemanticAliasPlan(schema, intent));
  const tableRules = buildTableRulesFromSchema(schema);

  return [
    // FROZEN FIRST (cache-optimized prefix)
    FROZEN_IDENTITY,
    FROZEN_SQL_RULES,
    FROZEN_DISTINCT_RULES,
    FROZEN_COLUMN_CORRECTIONS,
    FROZEN_FK_LABEL_RULES,
    FROZEN_WINDOW_FUNCTION_RULES,
    FROZEN_FILTER_RULES,
    FROZEN_ALLOWED_FUNCTIONS,
    FROZEN_CHART_RULES,
    FROZEN_OUTPUT_FORMAT,
    // DYNAMIC AFTER (not cached, varies per query)
    aliasPlanContext,
    tableRules,
    schemaContext,
    metricContext || '',
  ].filter(Boolean).join('\n\n');
}

function buildTableRulesFromSchema(schema: SchemaSnapshot): string {
  if (!schema?.tables?.length) return '';

  const lines: string[] = ['TABLE-SPECIFIC RULES:'];

  for (const t of schema.tables) {
    const cols = new Set(t.columns.map((c) => c.columnName.toLowerCase()));
    if (cols.has('deleted')) {
      lines.push(`- ${t.tableName}: when filtering for active rows, use ${t.tableName}.deleted = 0`);
    } else if (cols.has('is_deleted')) {
      lines.push(`- ${t.tableName}: when filtering for active rows, use ${t.tableName}.is_deleted = 0`);
    } else {
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

function buildSemanticAliasPlan(schema: SchemaSnapshot, intent: IntentAnalysis): Record<string, string> {
  const orderedTableNames = [...new Set([
    ...intent.tables,
    ...schema.tables.map((table) => table.tableName),
  ])];

  const aliasPlan: Record<string, string> = {};

  for (const tableName of orderedTableNames) {
    const normalizedTableName = tableName.toLowerCase();
    aliasPlan[normalizedTableName] = SEMANTIC_ALIAS_BY_TABLE[normalizedTableName] || deriveSemanticAlias(normalizedTableName);
  }

  return aliasPlan;
}

function formatSemanticAliasPlan(aliasPlan: Record<string, string>): string {
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

function deriveSemanticAlias(tableName: string): string {
  const stripped = tableName.replace(/^tbl/i, '').replace(/[^a-z0-9]+/gi, '').toLowerCase();

  if (!stripped) {
    return 'entity';
  }

  if (stripped.endsWith('s') && stripped.length > 3) {
    return stripped.slice(0, -1);
  }

  return stripped;
}

function buildSqlAgentUserMessage(input: SqlAgentInput, correctionNote?: string): string {
  const promptSpecificConstraints = buildPromptSpecificConstraints(input.userPrompt);
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
    lines.push(
      '',
      'FOLLOW-UP CONTEXT:',
      `Prior chart: ${input.previousContext.previousTitle || 'unknown'}`,
      `Prior SQL: ${input.previousContext.previousSql}`,
      `Prior chart type: ${input.previousContext.previousChartType || 'unknown'}`,
      'If this is a refinement, adapt the prior SQL while generating a fresh valid SELECT.',
    );
  }

  if (correctionNote) {
    lines.push('', correctionNote.trim());
  }

  lines.push(
    '',
    'BEFORE GENERATING SQL: verify every column name against the live schema above.',
    'If you need a company name, use the integer FK (companyid/relatedcompany) and JOIN if needed, or use denormalized companyname from tblassignjobcandidate only.',
    'tbldeals has NO deleted column - only archived.',
    'tbljob and tblcandidate use deleted, NOT archived.',
    'Never select raw integer FK columns as analytical output labels.',
    'For company labels: use tblassignjobcandidate.companyname.',
    'For job labels: use tblassignjobcandidate.jobname or tbljob.name.',
    'For candidate labels: use tblassignjobcandidate.candidatename.',
    'tblcompany, tblrecruiter, tbluser — none of these exist in the allowed table set.',
  );

  if (promptSpecificConstraints.length > 0) {
    lines.push('', 'PROMPT-SPECIFIC SQL CONSTRAINTS:', ...promptSpecificConstraints.map((rule) => `- ${rule}`));
  }

  return lines.join('\n');
}

function buildPromptSpecificConstraints(userPrompt: string): string[] {
  const normalizedPrompt = userPrompt.toLowerCase();
  const constraints: string[] = [];

  const asksTopNPerGroup = /\b(top\s*\d+|top)\b/.test(normalizedPrompt) && /\bper\b/.test(normalizedPrompt);
  const mentionsWindow = /\brow_number|dense_rank|rank\s*\(|over\s*\(/.test(normalizedPrompt);
  const asksDependencyRatio = /highest dependency on a single company|single company.*revenue|revenue dependency|revenue share|ratio/i.test(normalizedPrompt);

  if (asksTopNPerGroup || mentionsWindow || asksDependencyRatio) {
    constraints.push(
      'Do not use CTEs (WITH), window functions (ROW_NUMBER, RANK, DENSE_RANK, OVER), or PARTITION BY.',
      'Use flat subqueries only: pre-aggregate metrics in one subquery, then join or filter with correlated subquery logic.',
      'For top-N per group, use GROUP BY + HAVING with a correlated subquery.',
      'For running totals or ratios, use a self-join subquery.',
    );
  }

  const asksStdDevOutlier = /\bstandard deviation|stddev|deviation|2\s*standard\s*deviations?\b/.test(normalizedPrompt);
  if (asksStdDevOutlier) {
    constraints.push(
      'Override generic multi-stage guidance for this query: use a flat SELECT only.',
      'Do not use WITH clauses, derived tables, or subqueries in the FROM clause.',
      'Use one SELECT with GROUP BY recruiter_id and HAVING AVG(clean_amount) > (global_avg + 2 * global_stddev).',
      'Global statistics may be provided via a single-level CROSS JOIN aggregate block (no deeper nesting than one level).',
      "Keep amount cleaning as CAST(REPLACE(assignment.billingamount, ',', '') AS DECIMAL(15,2)).",
      'Return recruiter_id and total/average metric aliases suitable for chart rendering.',
      'In ORDER BY, repeat the full aggregate expression instead of relying on alias-only references.',
    );
  }

  const asksCompanyLabels = /\bcompany|companies|client|clients|organization|firm\b/i.test(normalizedPrompt);
  if (asksCompanyLabels) {
    constraints.push(
      'To show company names, use companyname from tblassignjobcandidate. Do NOT use companyid.',
      'If querying tbljob, join tblassignjobcandidate on tbljob.id = tblassignjobcandidate.jobid to access companyname.',
      'GROUP BY and ORDER BY must use companyname (string), not companyid (integer).',
    );
  }

  const asksCandidateNames = /candidate name|candidates by name|top candidates/i.test(normalizedPrompt);
  if (asksCandidateNames) {
    constraints.push(
      'Use candidatename from tblassignjobcandidate for candidate display names.',
      'Do NOT select candidateid as a label column.',
    );
  }

  const asksJobNames = /job name|jobs by name|which jobs|top jobs/i.test(normalizedPrompt);
  if (asksJobNames) {
    constraints.push(
      'Use jobname from tblassignjobcandidate for job display names.',
      'If querying tbljob directly, use tbljob.name AS job_name.',
      'Do NOT select jobid as a label column.',
    );
  }

  return constraints;
}

/**
 * Validates ORDER BY references are valid SELECT aliases or expressions.
 * If ORDER BY references something not in SELECT aliases, keeps it but warns so
 * the database can surface an explicit validation error rather than a silent rewrite.
 */
function fixOrderByAliases(sql: string): string {
  const selectMatch = /^\s*SELECT\s+([\s\S]+?)\s+FROM\b/i.exec(sql);
  if (!selectMatch) return sql;

  const aliases = new Set<string>();
  for (const item of splitTopLevelCommaSeparated(selectMatch[1])) {
    const m = /\bAS\s+([`"]?[a-z_][a-z0-9_]*[`"]?)\s*$/i.exec(item.trim());
    if (m) aliases.add(m[1].replace(/[`"]/g, '').toLowerCase());
  }

  return sql.replace(/\bORDER\s+BY\s+([\s\S]+?)(?=\s*(?:LIMIT|$))/i, (full, orderBody) => {
    const fixed = splitTopLevelCommaSeparated(orderBody).map((item: string, index: number) => {
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

function detectWindowFunctionMisuse(sql: string): boolean {
  return /\bwith\b/i.test(sql) || /\bover\s*\(/i.test(sql);
}

function containsCaseWhen(node: any): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }

  if (node.type === 'case' || node.type === 'case_expr') {
    return true;
  }

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      if (child.some((item) => containsCaseWhen(item))) {
        return true;
      }
    } else if (child && typeof child === 'object') {
      if (containsCaseWhen(child)) {
        return true;
      }
    }
  }

  return false;
}

function collectTableNamesFromAst(node: any, results = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') {
    return results;
  }

  if (node.type === 'table') {
    const tableName = String(node.table || '').toLowerCase().split('.').pop() || '';
    if (tableName) {
      results.add(tableName);
    }
  }

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => collectTableNamesFromAst(item, results));
    } else if (child && typeof child === 'object') {
      collectTableNamesFromAst(child, results);
    }
  }

  return results;
}

function collectSelectNodes(node: any, results: any[] = []): any[] {
  if (!node || typeof node !== 'object') {
    return results;
  }

  if (node.type === 'select') {
    results.push(node);
  }

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => collectSelectNodes(item, results));
    } else if (child && typeof child === 'object') {
      collectSelectNodes(child, results);
    }
  }

  return results;
}

function getCountArgumentName(expr: any): string {
  const arg = expr?.args;
  if (arg === '*') {
    return '*';
  }

  if (typeof arg === 'object' && arg !== null) {
    return String(arg.column || arg.value || '').toLowerCase();
  }

  return String(arg || '').toLowerCase();
}

function isDuplicateProneCount(expr: any): boolean {
  if (expr?.type !== 'aggr_func') {
    return false;
  }

  if (String(expr.name || '').toUpperCase() !== 'COUNT') {
    return false;
  }

  if (expr.distinct || expr.distinct === true) {
    return false;
  }

  if (containsCaseWhen(expr)) {
    return false;
  }

  const argName = getCountArgumentName(expr);
  return argName === '*' || argName === 'candidateid' || argName === 'jobid';
}

function auditDistinctUsage(sql: string): void {
  let ast: any;
  try {
    const result = parser.astify(sql, { database: 'MySQL' });
    ast = Array.isArray(result) ? result[0] : result;
  } catch {
    return;
  }

  if (!ast) {
    return;
  }

  const tables = collectTableNamesFromAst(ast);
  if (!tables.has('tblassignjobcandidate')) {
    return;
  }

  const selectNodes = collectSelectNodes(ast);

  for (const selectNode of selectNodes) {
    const hasDuplicateProneCount = (selectNode?.columns || []).some((column) => isDuplicateProneCount(column?.expr));

    if (hasDuplicateProneCount) {
      console.warn('[SQLAgent] Potential duplicate count — COUNT without DISTINCT on tblassignjobcandidate');
        return;
    }
  }
}

function logSqlAgentEvent(input: SqlAgentInput, payload: {
  model: string;
  callType: 'sql_generation';
  success: boolean;
  latencyMs: number;
  usage?: any;
  errorMessage?: string;
  sqlFlow?: import('../utils/aiMetricsLogger').AIMetricsEntry['sqlFlow'];
  query?: import('../utils/aiMetricsLogger').AIMetricsEntry['query'];
}): void {
  logAICall({
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

function splitTopLevelCommaSeparated(input: string): string[] {
  const parts: string[] = [];
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

function extractSelectAlias(selectItem: string): string | null {
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

function isSqlIdentifier(value: string): boolean {
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

function stripIdentifierQuotes(value: string): string {
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

function readQuotedSection(sql: string, startIndex: number, quote: string): { text: string; nextIndex: number } {
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

export async function generateSqlFromAgent(input: SqlAgentInput): Promise<ChartAgentResponse> {
  const systemPrompt = buildSqlAgentSystemPrompt(input.schema, input.intent);
  const baseUserMessage = buildSqlAgentUserMessage(input);
  const semanticAliasPlan = buildSemanticAliasPlan(input.schema, input.intent);

  const parseCompletion = async (userMessage: string) => {
    const start = Date.now();
    let usage: any;
    let success = false;
    let errorMessage: string | undefined;
    let generatedSql: string | undefined;

    try {
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 1800,
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
    } catch (err: any) {
      errorMessage = err?.message || String(err);
      throw err;
    } finally {
      logSqlAgentEvent(input, {
        model: 'openai/gpt-oss-120b',
        callType: 'sql_generation',
        success,
        errorMessage,
        latencyMs: Date.now() - start,
        usage,
        sqlFlow: {
          stage: 'generation',
          sql: generatedSql,
          structuralValidationPassed: success,
        },
        query: generatedSql ? { sql: generatedSql, stage: 'generation' } : undefined,
      });
    }
  };

  const callParseCompletion = async (userMessage: string) => {
    return parseCompletion(userMessage);
  };

  const response = await callParseCompletion(baseUserMessage);

  if (response.sql) {
    let currentSql = response.sql;
    const semanticAliasRewrite = rewriteSemanticAliases(currentSql, semanticAliasPlan);
    currentSql = semanticAliasRewrite.sql;
    currentSql = rewriteGroupByAliases(currentSql);
    currentSql = fixOrderByAliases(currentSql);

    const normalization = normalizeReservedAliases(currentSql);
    currentSql = normalization.sql;

    auditDistinctUsage(currentSql);

    if (response.xAxis && normalization.aliasMap[response.xAxis.toLowerCase()]) {
      response.xAxis = normalization.aliasMap[response.xAxis.toLowerCase()];
    }
    if (response.yAxis && normalization.aliasMap[response.yAxis.toLowerCase()]) {
      response.yAxis = normalization.aliasMap[response.yAxis.toLowerCase()];
    }

    response.sql = currentSql;
  }

  return response;
}
