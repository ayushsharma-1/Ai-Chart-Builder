import fs from 'node:fs';
import path from 'node:path';

export type AICallType =
  | 'intent_analysis'
  | 'sql_generation'
  | 'sql_validation'
  | 'sql_retry'
  | 'sql_execution'
  | 'sql_explanation'
  | 'dashboard_insights'
  | 'fix_agent'
  | 'other';

export interface AIMetricsEntry {
  timestamp: string;
  date: string;
  callType: AICallType;
  model: string;
  sessionId?: string;
  userPrompt?: string;
  success: boolean;
  errorMessage?: string;
  sqlFlow?: {
    stage: 'generation' | 'validation' | 'retry' | 'execution' | 'blocked' | 'final';
    sql?: string;
    executedSql?: string;
    previousSql?: string;
    correctionNote?: string;
    structuralValidationPassed?: boolean;
    validationIssues?: string[];
    transformations?: string[];
    retried?: boolean;
    originalSql?: string;
    correctedSql?: string;
    retryCount?: number;
  };
  query?: {
    sql?: string;
    sanitizedSql?: string;
    executedSql?: string;
    params?: unknown[];
    cacheKey?: string | null;
    stage?: string;
  };
  errorDetails?: {
    name?: string;
    message?: string;
    stack?: string;
    code?: string | number;
    errno?: number;
    sqlState?: string;
    sqlMessage?: string;
    fatal?: boolean;
    reason?: string;
    category?: string;
    mode?: 'validation' | 'execution';
  };
  latencyMs: number;
  tokens: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: {
    inputCostUsd: number;
    outputCostUsd: number;
    totalCostUsd: number;
  };
  pipeline?: {
    intentMs?: number;
    schemaMs?: number;
    sqlGenMs?: number;
    executionMs?: number;
    totalMs?: number;
  };
}

const GROQ_PRICING: Record<string, { input: number; output: number }> = {
  'openai/gpt-oss-120b': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  default: { input: 0.59, output: 0.79 },
};

function calculateCost(model: string, promptTokens: number, completionTokens: number) {
  if (model === 'node-sql-parser') {
    return {
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
    };
  }
  const pricing = GROQ_PRICING[model] || GROQ_PRICING.default;
  const inputCostUsd = (promptTokens / 1_000_000) * pricing.input;
  const outputCostUsd = (completionTokens / 1_000_000) * pricing.output;

  return {
    inputCostUsd: Number.parseFloat(inputCostUsd.toFixed(8)),
    outputCostUsd: Number.parseFloat(outputCostUsd.toFixed(8)),
    totalCostUsd: Number.parseFloat((inputCostUsd + outputCostUsd).toFixed(8)),
  };
}

const LOG_DIR = path.resolve(process.cwd(), 'logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogFilePath(date: string): string {
  return path.join(LOG_DIR, `ai-metrics-${date}.ndjson`);
}

function writeEntry(entry: AIMetricsEntry): void {
  try {
    ensureLogDir();
    fs.appendFileSync(getLogFilePath(entry.date), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error: any) {
    console.error('[AIMetrics] Failed to write log entry:', error?.message || error);
  }
}

export interface LogAICallInput {
  callType: AICallType;
  model: string;
  sessionId?: string;
  userPrompt?: string;
  success: boolean;
  errorMessage?: string;
  sqlFlow?: AIMetricsEntry['sqlFlow'];
  query?: AIMetricsEntry['query'];
  errorDetails?: AIMetricsEntry['errorDetails'];
  latencyMs: number;
  accountId?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  pipeline?: AIMetricsEntry['pipeline'];
}

export function logAICall(input: LogAICallInput): void {
  const now = new Date();
  const promptTokens = input.usage?.prompt_tokens || 0;
  const completionTokens = input.usage?.completion_tokens || 0;
  const totalTokens = input.usage?.total_tokens || 0;

  const entry: AIMetricsEntry = {
    timestamp: now.toISOString(),
    date: now.toISOString().slice(0, 10),
    callType: input.callType,
    model: input.model,
    sessionId: input.sessionId,
    userPrompt: input.userPrompt ? input.userPrompt.slice(0, 200) : undefined,
    success: input.success,
    errorMessage: input.errorMessage,
    accountId: input.accountId,
    sqlFlow: input.sqlFlow,
    query: input.query,
    errorDetails: input.errorDetails,
    latencyMs: input.latencyMs,
    tokens: {
      promptTokens,
      completionTokens,
      totalTokens,
    },
    cost: calculateCost(input.model, promptTokens, completionTokens),
    pipeline: input.pipeline,
  };

  writeEntry(entry);

  if (process.env.NODE_ENV !== 'production') {
    console.info(
      `[AI] ${entry.callType} | ${entry.model} | ${totalTokens} tokens ($${entry.cost.totalCostUsd.toFixed(6)}) | ${entry.latencyMs}ms | ${entry.success ? '✅' : '❌'}`,
    );
  }
}