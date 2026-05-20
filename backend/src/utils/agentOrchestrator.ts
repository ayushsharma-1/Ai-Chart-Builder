import { analyzeIntent, buildIntentFallback, IntentAnalysis } from '../agents/intentAgent';
import { generateSqlFromAgent } from '../agents/sqlAgent';
import { getSchemaForTables } from '../services/schemaService';
import { runQuery } from '../services/sql.service';
import { buildDataProfile } from './dataTransformer';
import { recommendChart } from './chartRecommender';

export interface OrchestratorInput {
  userPrompt: string;
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
  chartConfig: {
    xAxis: string;
    yAxis: string[];
    seriesKeys?: string[];
  };
  data: unknown[];
  rowCount: number;
  executionTimeMs: number;
  sql: string;                          // stored internally, never shown to user
  reasoning: string;
  chartOverrideReason?: string;         // set if engine overrode LLM chart type
  chartConfidence: 'high' | 'medium' | 'low';
  pieDisabled?: boolean;
  pieDisabledReason?: string;
  fromCache?: boolean;
  pipeline: {                           // observability — stages and timing
    intentMs: number;
    schemaMs: number;
    sqlGenMs: number;
    executionMs: number;
    totalMs: number;
  };
}

export interface OrchestratorError {
  success: false;
  type: 'non_analytics' | 'clarification' | 'validation_error' | 'empty_result' | 'error';
  message: string;
  clarificationNeeded?: string;
}

export type OrchestratorResponse = OrchestratorResult | OrchestratorError;

export async function runAnalyticsPipeline(input: OrchestratorInput): Promise<OrchestratorResponse> {
  const pipelineStart = Date.now();
  const timings = { intentMs: 0, schemaMs: 0, sqlGenMs: 0, executionMs: 0 };

  console.info('[Pipeline] Starting for prompt:', input.userPrompt);

  // ── STAGE 1: Intent Analysis ────────────────────────────────────────────
  const intentStart = Date.now();
  let intent: IntentAnalysis;

  try {
    intent = await analyzeIntent(input.userPrompt, input.previousContext);
    timings.intentMs = Date.now() - intentStart;
    console.info('[Pipeline] Intent:', intent.intent, '| Tables:', intent.tables.join(', '));
  } catch (err: any) {
    // Timeout or Groq rate limit — use full-schema fallback instead of failing
    console.warn('[Pipeline] Intent agent failed, using full-schema fallback:', err.message);
    timings.intentMs = Date.now() - intentStart;
    intent = buildIntentFallback(input.userPrompt);
  }

  // Handle non-analytics queries early
  if (!intent.isAnalytics) {
    return {
      success: false,
      type: 'non_analytics',
      message: "I can only answer analytics questions about your recruitment data. Try asking about candidates, jobs, pipeline stages, or deals.",
    };
  }

  if (intent.needsClarification) {
    return {
      success: false,
      type: 'clarification',
      message: intent.needsClarification,
      clarificationNeeded: intent.needsClarification,
    };
  }

  // ── STAGE 2: Schema Fetch ───────────────────────────────────────────────
  const schemaStart = Date.now();
  let schema;

  try {
    schema = await getSchemaForTables(intent.tables);
    timings.schemaMs = Date.now() - schemaStart;
    console.info('[Pipeline] Schema fetched for tables:', intent.tables.join(', '), '| Cache age:', Date.now() - schema.fetchedAt, 'ms');
  } catch (err: any) {
    console.error('[Pipeline] Schema stage failed:', err.message);
    return { success: false, type: 'error', message: 'Something went wrong. Please try again.' };
  }

  // ── STAGE 3: SQL Generation ─────────────────────────────────────────────
  const sqlGenStart = Date.now();
  let agentResponse;

  try {
    agentResponse = await generateSqlFromAgent({
      userPrompt: input.userPrompt,
      intent,
      schema,
      previousContext: input.previousContext,
    });
    timings.sqlGenMs = Date.now() - sqlGenStart;
  } catch (err: any) {
    console.error('[Pipeline] SQL agent failed:', err.message);

    // Distinguish validation blocks from server errors
    const isValidation = err.message?.includes('validation failed') || err.message?.includes('Query blocked');
    return {
      success: false,
      type: isValidation ? 'validation_error' : 'error',
      message: isValidation
        ? 'I generated a query that our security system blocked. Please try rephrasing.'
        : 'Something went wrong generating your query. Please try again.',
    };
  }

  if (!agentResponse.isAnalyticsQuery || !agentResponse.sql) {
    return {
      success: false,
      type: agentResponse.clarificationNeeded ? 'clarification' : 'non_analytics',
      message: agentResponse.clarificationNeeded || "I can only answer analytics questions about your recruitment data.",
      clarificationNeeded: agentResponse.clarificationNeeded || undefined,
    };
  }

  // ── STAGE 4: SQL Execution ──────────────────────────────────────────────
  const executionStart = Date.now();
  let queryResult;

  try {
    queryResult = await runQuery(agentResponse.sql);
    timings.executionMs = Date.now() - executionStart;
  } catch (err: any) {
    console.error('[Pipeline] Execution failed:', err.message);
    return { success: false, type: 'error', message: 'Something went wrong. Please try again.' };
  }

  if (queryResult.rowCount === 0) {
    return {
      success: false,
      type: 'empty_result',
      message: 'No matching analytical data found for selected filters/time range.',
    };
  }

  // ── STAGE 5: Data Transformation + Profile ──────────────────────────────
  const dataProfile = buildDataProfile(queryResult.data);

  // ── STAGE 6: Chart Recommendation ──────────────────────────────────────
  const recommendation = recommendChart({
    llmChartType: agentResponse.chartType,
    llmXAxis: agentResponse.xAxis,
    llmYAxis: agentResponse.yAxis,
    data: queryResult.data as Record<string, unknown>[],
    dataProfile,
  });

  if (recommendation.overrideReason) {
    console.info('[Pipeline] Chart engine override:', recommendation.overrideReason);
  }

  const totalMs = Date.now() - pipelineStart;

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
    sql: agentResponse.sql,
    reasoning: agentResponse.reasoning || '',
    chartOverrideReason: recommendation.overrideReason,
    chartConfidence: recommendation.confidence,
    pieDisabled: recommendation.pieDisabled,
    pieDisabledReason: recommendation.pieDisabledReason,
    fromCache: queryResult.cacheStatus === 'hit' || queryResult.cacheStatus === 'stale',
    pipeline: {
      intentMs: timings.intentMs,
      schemaMs: timings.schemaMs,
      sqlGenMs: timings.sqlGenMs,
      executionMs: timings.executionMs,
      totalMs,
    },
  };
}
