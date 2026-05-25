import { analyzeIntent, buildIntentFallback, IntentAnalysis } from '../agents/intentAgent';
import { runFixAgent } from '../agents/fixAgent';
import { generateSqlFromAgent } from '../agents/sqlAgent';
import { getSchemaForTables } from '../services/schemaService';
import { runQuery } from '../services/sql.service';
import { buildDataProfile } from './dataTransformer';
import { recommendChart } from './chartRecommender';
import { logAICall } from './aiMetricsLogger';
import { validateSql } from './sqlGuard';

const CONFIDENCE_THRESHOLD = 0.65;

export interface OrchestratorInput {
  userPrompt: string;
  accountId: string;
  previousContext?: {
    previousPrompt?: string;
    previousTitle?: string;
    previousSql?: string;
    previousChartType?: string;
  };
  sessionId?: string;
}

export interface OrchestratorResult {
  success: true;
  title: string;
  chartType: 'bar' | 'line' | 'pie' | 'table';
  renderAs?: 'chart' | 'text';
  chartConfig: {
    xAxis: string;
    yAxis: string[];
    seriesKeys?: string[];
  };
  data: unknown[];
  rowCount: number;
  executionTimeMs: number;
  sql: string;
  reasoning: string;
  chartOverrideReason?: string;
  chartConfidence: 'high' | 'medium' | 'low';
  pieDisabled?: boolean;
  pieDisabledReason?: string;
  fromCache?: boolean;
  wasAutoFixed?: boolean;
  pipeline: {
    intentMs: number;
    schemaMs: number;
    sqlGenMs: number;
    executionMs: number;
    totalMs: number;
  };
}

export interface OrchestratorError {
  success: false;
  type: 'non_analytics' | 'clarification' | 'validation_error' | 'empty_result' | 'error' | 'rate_limit';
  message: string;
  clarificationNeeded?: string;
  confidence?: number;
  confidenceReason?: string;
}

export type OrchestratorResponse = OrchestratorResult | OrchestratorError;

function isAnalyticalPrompt(userPrompt: string): boolean {
  const normalized = userPrompt.toLowerCase();
  const analyticsKeywords = [
    'top',
    'per',
    'group by',
    'rank',
    'ranking',
    'average',
    'avg',
    'mean',
    'sum',
    'total',
    'count',
    'trend',
    'distribution',
    'stddev',
    'standard deviation',
    'variance',
    'outlier',
    'deviation',
    'revenue',
    'billing',
  ];

  return analyticsKeywords.some((keyword) => normalized.includes(keyword));
}

function stringifyErrorValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return 'Unknown error';
    }
  }
  return 'Unknown error';
}

export function isGroqRateLimitError(err: unknown): boolean {
  const message = stringifyErrorValue(
    (err as { message?: string; error?: { message?: string } })?.message ||
      (err as { error?: { message?: string } })?.error?.message ||
      err,
  );
  return /rate\s*limit\s*reached|tokens per day|\bTPD\b/i.test(message);
}

function buildNonAnalyticsError(): OrchestratorError {
  return {
    success: false,
    type: 'non_analytics',
    message: 'I can only answer analytics questions about your recruitment data. Try asking about candidates, jobs, pipeline stages, or deals.',
  };
}

function buildClarificationError(intent: IntentAnalysis): OrchestratorError {
  const clarification = intent.clarificationQuestion || 'Could you be more specific? What metric would you like to see - placements, revenue, conversion rate, or something else?';
  return {
    success: false,
    type: 'clarification',
    message: clarification,
    clarificationNeeded: clarification,
    confidence: intent.confidence,
    confidenceReason: intent.confidenceReason || undefined,
  };
}

async function fetchSchemaForIntent(intent: IntentAnalysis) {
  try {
    const schema = await getSchemaForTables(intent.tables);
    return { schema };
  } catch (err: any) {
    console.error('[Pipeline] Schema stage failed:', err.message);
    return { error: { success: false, type: 'error', message: 'Something went wrong. Please try again.' } as OrchestratorError };
  }
}

async function generateAgentSql(
  input: OrchestratorInput,
  intent: IntentAnalysis,
  schema: Awaited<ReturnType<typeof getSchemaForTables>>,
) {
  try {
    const agentResponse = await generateSqlFromAgent({
      userPrompt: input.userPrompt,
      intent,
      schema,
      sessionId: input.sessionId,
      previousContext: input.previousContext,
    });
    return { agentResponse };
  } catch (err: any) {
    console.error('[Pipeline] SQL agent failed:', err.message);
    if (isGroqRateLimitError(err)) {
      return { error: { success: false, type: 'rate_limit', message: err.message || String(err) } as OrchestratorError };
    }

    const isValidation =
      err.message?.includes('validation failed') ||
      err.message?.includes('Query blocked') ||
      err.message?.includes('invalid response structure') ||
      err.message?.includes('returned empty response') ||
      err.message?.includes('JSON');
    return {
      error: {
        success: false,
        type: isValidation ? 'validation_error' : 'error',
        message: isValidation
          ? 'I could not read that query cleanly. Please simplify your prompt and try again.'
          : 'Something went wrong generating your query. Please try again.',
      } as OrchestratorError,
    };
  }
}

function logSqlValidationEvent(input: OrchestratorInput, sql: string, validation: ReturnType<typeof validateSql>, latencyMs: number): void {
  logAICall({
    callType: 'sql_validation',
    model: 'node-sql-parser',
    sessionId: input.sessionId,
    userPrompt: input.userPrompt,
    success: validation.safe,
    errorMessage: validation.safe ? undefined : validation.reason,
    errorDetails: validation.safe
      ? undefined
      : {
          reason: validation.reason,
          category: 'VALIDATION_ERROR',
        },
    sqlFlow: {
      stage: 'validation',
      sql,
      structuralValidationPassed: validation.safe,
      validationIssues: validation.safe ? undefined : [validation.reason || 'SQL failed validation'],
      transformations: validation.transformations || (validation.sanitizedSql && validation.sanitizedSql !== sql ? ['validateSqlSanitized'] : undefined),
    },
    query: {
      sql,
      sanitizedSql: validation.sanitizedSql,
      stage: 'validation',
    },
    latencyMs,
  });
}

async function repairSqlAfterValidationFailure(input: OrchestratorInput, sql: string, validationReason: string): Promise<{ sql: string | null; error?: OrchestratorError }> {
  const fix = await runFixAgent({
    sql,
    mode: 'validation',
    validationIssues: [validationReason],
    sessionId: input.sessionId,
    userPrompt: input.userPrompt,
  });

  if (!fix.fixed || !fix.fixedSql) {
    console.error('[Pipeline] Validation fix agent did not return a usable query');
    return { sql: null, error: { success: false, type: 'validation_error', message: 'I could not repair the SQL query. Please simplify the request and try again.' } };
  }

  const repairedValidation = validateSql(fix.fixedSql);
  if (!repairedValidation.safe || !repairedValidation.sanitizedSql) {
    console.error('[Pipeline] Validation fix agent returned SQL that still failed AST validation');
    return { sql: null, error: { success: false, type: 'validation_error', message: 'I could not repair the SQL query. Please simplify the request and try again.' } };
  }

  return { sql: repairedValidation.sanitizedSql };
}

async function repairSqlAfterExecutionFailure(input: OrchestratorInput, originalSql: string, currentSql: string, mysqlError: string): Promise<{ sql: string | null; error?: OrchestratorError }> {
  const fix = await runFixAgent({
    sql: currentSql,
    mode: 'execution',
    mysqlError,
    sessionId: input.sessionId,
    userPrompt: input.userPrompt,
  });

  if (!fix.fixed || !fix.fixedSql) {
    console.error('[Pipeline] Fix agent did not return a usable query');
    return { sql: null, error: { success: false, type: 'error', message: 'Something went wrong. Please try again.' } };
  }

  const repairedValidation = validateSql(fix.fixedSql);
  if (!repairedValidation.safe || !repairedValidation.sanitizedSql) {
    console.error('[Pipeline] Execution fix agent returned SQL that failed AST validation');
    return { sql: null, error: { success: false, type: 'error', message: 'Something went wrong. Please try again.' } };
  }

  return { sql: repairedValidation.sanitizedSql };
}

async function executeSqlWithRepair(input: OrchestratorInput, sql: string) {
  const validationStart = Date.now();
  const validation = validateSql(sql);

  logSqlValidationEvent(input, sql, validation, Date.now() - validationStart);

  let currentSql = validation.sanitizedSql || sql;
  let fixAttempted = false;
  let fixAgentCalls = 0; // cap fix agent LLM calls to 1 per request

  if (!validation.safe || !validation.sanitizedSql) {
    const repairResult = await repairSqlAfterValidationFailure(input, sql, validation.reason || 'SQL failed validation');
    if (!repairResult.sql) {
      return { fixAttempted: true, error: repairResult.error ?? { success: false, type: 'validation_error', message: 'I could not repair the SQL query. Please simplify the request and try again.' } };
    }

    currentSql = repairResult.sql;
    fixAttempted = true;
    fixAgentCalls += 1;
  }

  try {
    const correctedSql = currentSql === sql ? undefined : currentSql;
    const queryResult = await runQuery(currentSql, [], {
      accountId: input.accountId,
      sessionId: input.sessionId,
      userPrompt: input.userPrompt,
      originalSql: sql,
      correctedSql,
      retryCount: fixAttempted ? 1 : 0,
    });
    return { queryResult, fixAttempted };
  } catch (err: any) {
    const mysqlError = err?.message || String(err);
    console.warn('[Pipeline] Execution failed, attempting fix agent:', mysqlError);

    // Only allow one fix-agent LLM call per request to avoid unbounded retries
    if (fixAgentCalls >= 1) {
      console.error('[Pipeline] Execution failed and fix agent quota exhausted. Bailing.');
      return { fixAttempted: true, error: { success: false, type: 'error', message: 'Execution failed and automated repairs exhausted.' } as OrchestratorError };
    }

    const repairResult = await repairSqlAfterExecutionFailure(input, sql, currentSql, mysqlError);
    if (!repairResult.sql) {
      return { fixAttempted: true, error: repairResult.error ?? { success: false, type: 'error', message: 'Something went wrong. Please try again.' } };
    }

    fixAgentCalls += 1;

    try {
      const queryResult = await runQuery(repairResult.sql, [], {
        accountId: input.accountId,
        sessionId: input.sessionId,
        userPrompt: input.userPrompt,
        originalSql: sql,
        correctedSql: repairResult.sql,
        retryCount: 1,
      });
      return { queryResult, fixAttempted: true };
    } catch (fixErr: any) {
      console.error('[Pipeline] Fix agent attempt also failed', {
        sql: repairResult.sql,
        error: {
          name: fixErr?.name,
          message: fixErr?.message,
          stack: fixErr?.stack,
          code: fixErr?.code,
          errno: fixErr?.errno,
          sqlState: fixErr?.sqlState,
        },
      });
      return { fixAttempted: false, error: { success: false, type: 'error', message: 'Something went wrong. Please try again.' } as OrchestratorError };
    }
  }
}

function buildLookupSuccessResult(
  agentResponse: Awaited<ReturnType<typeof generateSqlFromAgent>>,
  queryResult: Awaited<ReturnType<typeof runQuery>>,
  timings: { intentMs: number; schemaMs: number; sqlGenMs: number; executionMs: number },
  pipelineStart: number,
  fixAttempted: boolean,
): OrchestratorResult {
  const firstRow = (queryResult.data[0] as Record<string, unknown> | undefined) || {};
  const columns = Object.keys(firstRow);

  return {
    success: true,
    title: agentResponse.title || 'Lookup result',
    chartType: 'table',
    renderAs: 'text',
    chartConfig: {
      xAxis: columns[0] || 'result',
      yAxis: columns.slice(1),
    },
    data: queryResult.data,
    rowCount: queryResult.rowCount,
    executionTimeMs: queryResult.executionTimeMs,
    sql: agentResponse.sql || '',
    reasoning: agentResponse.reasoning || '',
    chartOverrideReason: 'Lookup queries are rendered as text',
    chartConfidence: 'low',
    fromCache: queryResult.cacheStatus === 'hit' || queryResult.cacheStatus === 'stale',
    wasAutoFixed: fixAttempted,
    pipeline: {
      intentMs: timings.intentMs,
      schemaMs: timings.schemaMs,
      sqlGenMs: timings.sqlGenMs,
      executionMs: timings.executionMs,
      totalMs: Date.now() - pipelineStart,
    },
  };
}

function buildAnalyticsSuccessResult(
  agentResponse: Awaited<ReturnType<typeof generateSqlFromAgent>>,
  queryResult: Awaited<ReturnType<typeof runQuery>>,
  recommendation: ReturnType<typeof recommendChart>,
  timings: { intentMs: number; schemaMs: number; sqlGenMs: number; executionMs: number },
  pipelineStart: number,
  fixAttempted: boolean,
): OrchestratorResult {
  return {
    success: true,
    title: agentResponse.title || 'Analytics result',
    chartType: recommendation.chartType,
    chartConfig: {
      xAxis: recommendation.xAxis,
      yAxis: recommendation.yAxis,
      seriesKeys: recommendation.seriesKeys,
    },
    data: queryResult.data,
    rowCount: queryResult.rowCount,
    executionTimeMs: queryResult.executionTimeMs,
    sql: agentResponse.sql || '',
    reasoning: agentResponse.reasoning || '',
    chartOverrideReason: recommendation.overrideReason,
    chartConfidence: recommendation.confidence,
    pieDisabled: recommendation.pieDisabled,
    pieDisabledReason: recommendation.pieDisabledReason,
    fromCache: queryResult.cacheStatus === 'hit' || queryResult.cacheStatus === 'stale',
    wasAutoFixed: fixAttempted,
    pipeline: {
      intentMs: timings.intentMs,
      schemaMs: timings.schemaMs,
      sqlGenMs: timings.sqlGenMs,
      executionMs: timings.executionMs,
      totalMs: Date.now() - pipelineStart,
    },
  };
}

export async function runAnalyticsPipeline(input: OrchestratorInput): Promise<OrchestratorResponse> {
  const pipelineStart = Date.now();
  const timings = { intentMs: 0, schemaMs: 0, sqlGenMs: 0, executionMs: 0 };

  console.info('[Pipeline] Starting for prompt:', input.userPrompt);

  const intentStart = Date.now();
  let intent: IntentAnalysis;

  try {
    intent = await analyzeIntent(input.userPrompt, input.previousContext, { sessionId: input.sessionId });
    timings.intentMs = Date.now() - intentStart;
    console.info('[Pipeline] Intent:', intent.intent, '| Tables:', intent.tables.join(', '));
  } catch (err: any) {
    console.warn('[Pipeline] Intent agent failed, using full-schema fallback:', err.message);
    timings.intentMs = Date.now() - intentStart;
    intent = buildIntentFallback(input.userPrompt);
  }

  if (!intent.isAnalytics) {
    return buildNonAnalyticsError();
  }

  if (intent.confidence < CONFIDENCE_THRESHOLD) {
    return buildClarificationError(intent);
  }

  if (intent.needsClarification) {
    return {
      success: false,
      type: 'clarification',
      message: intent.needsClarification,
      clarificationNeeded: intent.needsClarification,
      confidence: intent.confidence,
      confidenceReason: intent.confidenceReason || undefined,
    };
  }

  const schemaStart = Date.now();
  const schemaResult = await fetchSchemaForIntent(intent);
  timings.schemaMs = Date.now() - schemaStart;
  if (schemaResult.error || !schemaResult.schema) {
    return schemaResult.error || { success: false, type: 'error', message: 'Something went wrong. Please try again.' };
  }

  const schema = schemaResult.schema;
  console.info('[Pipeline] Schema fetched for tables:', intent.tables.join(', '), '| Cache age:', Date.now() - schema.fetchedAt, 'ms');

  const sqlGenStart = Date.now();
  const agentResult = await generateAgentSql(input, intent, schema);
  timings.sqlGenMs = Date.now() - sqlGenStart;
  if (agentResult.error || !agentResult.agentResponse) {
    return agentResult.error || { success: false, type: 'error', message: 'Something went wrong generating your query. Please try again.' };
  }

  const agentResponse = agentResult.agentResponse;

  if (!agentResponse.isAnalyticsQuery || !agentResponse.sql) {
    return {
      success: false,
      type: agentResponse.clarificationNeeded ? 'clarification' : 'non_analytics',
      message: agentResponse.clarificationNeeded || 'I can only answer analytics questions about your recruitment data.',
      clarificationNeeded: agentResponse.clarificationNeeded || undefined,
    };
  }

  const executionStart = Date.now();
  const executionResult = await executeSqlWithRepair(input, agentResponse.sql);
  timings.executionMs = Date.now() - executionStart;
  if (executionResult.error || !executionResult.queryResult) {
    return executionResult.error || { success: false, type: 'error', message: 'Something went wrong. Please try again.' };
  }

  const queryResult = executionResult.queryResult;

  if (queryResult.rowCount === 0) {
    try {
      logAICall({
        callType: 'sql_execution',
        model: 'mysql2',
        sessionId: input.sessionId,
        userPrompt: input.userPrompt,
        success: false,
        errorMessage: 'EMPTY_ANALYTICAL_RESULT',
        errorDetails: { reason: 'No rows returned for non-table chart', name: 'EMPTY_ANALYTICAL_RESULT', category: 'EMPTY_RESULT' },
        query: { sql: agentResponse.sql, sanitizedSql: agentResponse.sql, stage: 'execution' },
        latencyMs: timings.executionMs,
      });
    } catch (e) {
      console.warn('[Pipeline] Failed to log empty analytical result', (e as Error)?.message || e);
    }

    return {
      success: false,
      type: 'empty_result',
      message: 'No matching analytical data found for selected filters/time range.',
    };
  }

  if (intent.metricType === 'lookup' && !isAnalyticalPrompt(input.userPrompt)) {
    return buildLookupSuccessResult(agentResponse, queryResult, timings, pipelineStart, executionResult.fixAttempted);
  }

  const dataProfile = buildDataProfile(queryResult.data);
  const recommendation = recommendChart({
    llmChartType: agentResponse.chartType,
    llmXAxis: agentResponse.xAxis,
    llmYAxis: agentResponse.yAxis,
    data: queryResult.data as Record<string, unknown>[],
    dataProfile,
  });

  return buildAnalyticsSuccessResult(agentResponse, queryResult, recommendation, timings, pipelineStart, executionResult.fixAttempted);
}
