import { z } from 'zod';
import groq from '../config/groq';
import { logAICall } from '../utils/aiMetricsLogger';
import { buildFrozenIntentPrefix } from '../utils/promptTokens';

// Zod schema for structured output validation
const FIXED_TIME_RANGES = ['last_7d', 'last_30d', 'last_90d', 'last_12m', 'this_month', 'this_year', 'all_time', 'custom'] as const;

const IntentAnalysisSchema = z.object({
  tables: z.array(z.enum(['tblcandidate', 'tblassignjobcandidate', 'tbldeals', 'tbljob'])).min(0),
  metricType: z.enum(['count', 'sum', 'average', 'ratio', 'trend', 'distribution', 'scalar', 'lookup']),
  timeRange: z.union([
    z.enum(FIXED_TIME_RANGES),
    z.string().refine(isSupportedDynamicTimeRange),
    z.enum(['weekly', 'quarterly', 'this_quarter']),
  ]).nullable(),
  normalizedTimeRange: z.string().nullable().optional(),
  dimensions: z.array(z.string()),
  isAnalytics: z.boolean(),
  needsClarification: z.string().nullable(),
  chartHint: z.enum(['bar', 'line', 'pie', 'table', 'none']).nullable(),
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  confidenceReason: z.string().nullable(),
  clarificationQuestion: z.string().nullable(),
});

export type IntentAnalysis = z.infer<typeof IntentAnalysisSchema>;

interface ParsedTimeRange {
  normalizedTimeRange: string;
  rangeType: 'relative' | 'rolling' | 'quarterly' | 'weekly';
}

// FROZEN — do not generate at runtime
const FROZEN_INTENT_SYSTEM = buildFrozenIntentPrefix();

// Table selection hints for the intent agent
const TABLE_HINTS = `
TABLE SELECTION GUIDE:
- tblcandidate       → candidate profiles, skills, experience, location, source
- tblassignjobcandidate → pipeline stages, assignments, billing, placements, funnel
- tbldeals           → deals, revenue, deal value, CRM, close dates
- tbljob             → job openings, requisitions, job status, remote, company, department
- Use tblassignjobcandidate as bridge when query involves BOTH candidates AND jobs
- Include tblassignjobcandidate if query mentions: pipeline, funnel, placement, billing, stage, conversion
`.trim();

function parseTimeRange(userPrompt: string): ParsedTimeRange | null {
  const normalized = userPrompt.toLowerCase();

  const explicitRelative = matchExplicitRelativeRange(normalized);
  if (explicitRelative) {
    return explicitRelative;
  }

  const rollingRelative = matchRollingRange(normalized);
  if (rollingRelative) {
    return rollingRelative;
  }

  const namedRange = matchNamedTimeRange(normalized);
  if (namedRange) {
    return namedRange;
  }

  return null;
}

function matchExplicitRelativeRange(normalized: string): ParsedTimeRange | null {
  const explicitRelative = /\blast[_\s-]?([1-9]\d*)\s*([dmy])\b/i.exec(normalized);
  if (!explicitRelative?.[1] || !explicitRelative[2]) {
    return null;
  }

  return {
    normalizedTimeRange: `last_${explicitRelative[1]}${explicitRelative[2].toLowerCase()}`,
    rangeType: 'relative',
  };
}

function matchRollingRange(normalized: string): ParsedTimeRange | null {
  const rollingRelative = /\brolling(?:[_\s-]+)?([1-9]\d*)\s*(day|days|week|weeks|month|months|year|years)\b/i.exec(normalized);
  if (!rollingRelative?.[1] || !rollingRelative[2]) {
    return null;
  }

  const unitMap: Record<string, string> = {
    day: 'd',
    days: 'd',
    week: 'w',
    weeks: 'w',
    month: 'm',
    months: 'm',
    year: 'y',
    years: 'y',
  };

  return {
    normalizedTimeRange: `rolling_${rollingRelative[1]}${unitMap[rollingRelative[2].toLowerCase()]}`,
    rangeType: 'rolling',
  };
}

function matchNamedTimeRange(normalized: string): ParsedTimeRange | null {
  if (/\bweekly\b/i.test(normalized)) {
    return { normalizedTimeRange: 'weekly', rangeType: 'weekly' };
  }

  if (/\bquarterly\b/i.test(normalized)) {
    return { normalizedTimeRange: 'quarterly', rangeType: 'quarterly' };
  }

  const shorthandAliases: Array<[RegExp, string]> = [
    [/\blast\s+6\s+months?\b/i, 'last_6m'],
    [/\blast\s+3\s+months?\b/i, 'last_3m'],
    [/\blast\s+1\s+year\b/i, 'last_1y'],
    [/\blast\s+quarter\b/i, 'last_3m'],
    [/\bthis\s+quarter\b/i, 'this_quarter'],
  ];

  for (const [pattern, value] of shorthandAliases) {
    if (!pattern.test(normalized)) {
      continue;
    }

    const rangeType = getRangeTypeForAlias(value);

    return { normalizedTimeRange: value, rangeType };
  }

  return null;
}

function getRangeTypeForAlias(value: string): ParsedTimeRange['rangeType'] {
  if (value === 'weekly') {
    return 'weekly';
  }

  if (value === 'quarterly') {
    return 'quarterly';
  }

  return 'relative';
}

function isSupportedDynamicTimeRange(value: string): boolean {
  if (!value) {
    return false;
  }

  if (value === 'weekly' || value === 'quarterly' || value === 'this_quarter') {
    return true;
  }

  if (/^last_\d+[dmy]$/i.test(value)) {
    return true;
  }

  if (/^rolling_\d+[dwmy]$/i.test(value)) {
    return true;
  }

  return false;
}

function buildClarificationQuestion(userPrompt: string): string {
  const normalized = userPrompt.toLowerCase();
  const hasJobEntity = /\b(job|jobs|hiring|hiring role|opening|openings|requisition|requisitions)\b/i.test(normalized);
  const hasCandidateEntity = /\b(candidate|candidates|applicant|applicants|talent)\b/i.test(normalized);
  const hasDealEntity = /\b(deal|deals|revenue|billing|deal value)\b/i.test(normalized);
  const hasAssignmentEntity = /\b(assignment|assignments|pipeline|placement|funnel)\b/i.test(normalized);
  const hasAnyEntity = hasJobEntity || hasCandidateEntity || hasDealEntity || hasAssignmentEntity;
  const lookupVerb = /\b(list|show|find|get|give me|who|which|available|active|search)\b/i.test(normalized);
  const metricVerb = /\b(total|count|how many|average|avg|mean|trend|compare|comparison|growth|variance|sum|ratio)\b/i.test(normalized);
  const timeHint = /\b(time|month|week|year|recent|latest|last|right now|now|current|today|yesterday|active|open|closed|this month|this year|last 30 days|last 3 months|last 12 months)\b/i.test(normalized);

  if (hasAnyEntity && lookupVerb) {
    return 'Which records should I list?';
  }

  if (hasAnyEntity && metricVerb && !timeHint) {
    return 'Which time range should I use?';
  }

  if (hasAnyEntity) {
    if (hasJobEntity) {
      return 'What should I show for jobs - a count, a list, or a trend?';
    }

    if (hasCandidateEntity) {
      return 'What should I show for candidates - a count, a list, or a trend?';
    }

    if (hasDealEntity) {
      return 'What should I show for deals - a count, a list, or a trend?';
    }

    if (hasAssignmentEntity) {
      return 'What should I show for assignments - a count, a list, or a trend?';
    }
  }

  return 'What would you like me to look up or summarize?';
}

function buildVagueClarificationQuestion(): string {
  return 'What would you like to analyze, which entity should I use, and what time range?';
}

function includesAnyPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function hasEntitySignal(normalized: string): boolean {
  return includesAnyPhrase(normalized, [
    'job', 'jobs', 'hiring', 'hiring role', 'opening', 'openings', 'requisition', 'requisitions',
    'candidate', 'candidates', 'applicant', 'applicants', 'talent', 'recruiter', 'recruiters',
    'deal', 'deals', 'revenue', 'billing', 'assignment', 'assignments', 'pipeline', 'placement', 'funnel',
  ]);
}

function hasMetricSignal(normalized: string): boolean {
  return includesAnyPhrase(normalized, [
    'total', 'count', 'how many', 'average', 'avg', 'mean', 'trend', 'compare', 'comparison',
    'growth', 'variance', 'sum', 'ratio', 'top', 'most', 'least', 'highest', 'lowest', 'chart',
    'charting', 'distribution', 'breakdown', 'revenue', 'billing', 'applicants', 'placements',
    'submitted', 'interview', 'offered', 'placed',
  ]);
}

function hasTimeSignal(normalized: string): boolean {
  return includesAnyPhrase(normalized, [
    'time', 'month', 'week', 'year', 'recent', 'latest', 'last', 'right now', 'now', 'current',
    'today', 'yesterday', 'active', 'open', 'closed', 'this month', 'this year', 'last 30 days',
    'last 3 months', 'last 12 months', 'last 7 days', 'last 90 days', 'last 6 months',
  ]);
}

function isMetaSystemQuestion(normalized: string): boolean {
  return [
    'how many tables',
    'what tables',
    'what databases',
    'what can you',
    'who are you',
    'what is this',
    'list tables',
    'show tables',
    'describe',
  ].some((phrase) => normalized.includes(phrase));
}

function shouldClarifyBeforeLLM(userPrompt: string): boolean {
  const normalized = userPrompt.toLowerCase();

  const entity = hasEntitySignal(normalized);
  const metric = hasMetricSignal(normalized);
  const time = hasTimeSignal(normalized);

  return !entity && !metric && !time;
}

function estimateConfidence(userPrompt: string): { confidence: number; confidenceReason: string | null; clarificationQuestion: string | null } {
  const normalized = userPrompt.toLowerCase();
  const hasJobEntity = /\b(job|jobs|hiring|hiring role|opening|openings|requisition|requisitions)\b/i.test(normalized);
  const hasCandidateEntity = /\b(candidate|candidates|applicant|applicants|talent)\b/i.test(normalized);
  const hasDealEntity = /\b(deal|deals|revenue|billing|deal value)\b/i.test(normalized);
  const hasAssignmentEntity = /\b(assignment|assignments|pipeline|placement|funnel)\b/i.test(normalized);
  const hasEntity = hasJobEntity || hasCandidateEntity || hasDealEntity || hasAssignmentEntity;

  const hasLookupVerb = /\b(list|show|find|get|give me|who|which|available|active|search)\b/i.test(normalized);
  const hasMetricVerb = /\b(total|count|how many|average|avg|mean|trend|change|growth|variance|dropout|turnaround|cumulative|running total|compare|comparison|sum|ratio)\b/i.test(normalized);
  const hasScope = /\b(right now|now|current|active|open|closed|last|today|yesterday|week|month|year|recent|latest|rolling|this month|this year|last 30 days|last 3 months|last 12 months)\b/i.test(normalized);
  const vague = /\b(draw a chart|show me something|something interesting|compare performance|show trends|show performance)\b/i.test(normalized) || (!hasEntity && !hasLookupVerb && !hasMetricVerb);

  if (hasEntity && (hasLookupVerb || hasMetricVerb)) {
    return {
      confidence: 0.95,
      confidenceReason: null,
      clarificationQuestion: null,
    };
  }

  if (hasEntity && hasScope) {
    return {
      confidence: 0.9,
      confidenceReason: null,
      clarificationQuestion: null,
    };
  }

  if (hasEntity) {
    return {
      confidence: 0.8,
      confidenceReason: 'The request names a clear entity, but the metric or listing intent is only partly specified.',
      clarificationQuestion: null,
    };
  }

  if (vague) {
    return {
      confidence: 0.1,
      confidenceReason: 'The request is vague and does not specify a metric, table, or time range.',
      clarificationQuestion: buildClarificationQuestion(userPrompt),
    };
  }

  if (!hasEntity && !hasLookupVerb && !hasMetricVerb && !hasScope) {
    return {
      confidence: 0.2,
      confidenceReason: 'The request does not clearly identify a recruitment entity, metric, or time window.',
      clarificationQuestion: buildClarificationQuestion(userPrompt),
    };
  }

  return {
    confidence: 0.6,
    confidenceReason: 'The request has partial structure but still leaves ambiguity in the entity, metric, or scope.',
    clarificationQuestion: buildClarificationQuestion(userPrompt),
  };
}

/** Default fallback when intent analysis fails or times out */
export function buildIntentFallback(userPrompt: string): IntentAnalysis {
  const parsedTimeRange = parseTimeRange(userPrompt);
  const confidence = estimateConfidence(userPrompt);

  return {
    tables: ['tblcandidate', 'tblassignjobcandidate', 'tbldeals', 'tbljob'],
    metricType: 'count',
    timeRange: parsedTimeRange?.normalizedTimeRange || null,
    normalizedTimeRange: parsedTimeRange?.normalizedTimeRange || null,
    dimensions: [],
    isAnalytics: true,
    needsClarification: null,
    chartHint: null,
    intent: userPrompt,
    confidence: confidence.confidence,
    confidenceReason: confidence.confidenceReason,
    clarificationQuestion: confidence.clarificationQuestion,
  };
}

function hasAnalyticalSignals(userPrompt: string): boolean {
  const normalized = userPrompt.toLowerCase();

  const patterns = [
    /\btop\s*\d+/,
    /\btop\b/,
    /\bper\b/,
    /\bgroup by\b/,
    /\bbased on\b/,
    /\brank(ing)?\b/,
    /\baverage\b/,
    /\bavg\b/,
    /\bmean\b/,
    /\bsum\b/,
    /\btotal\b/,
    /\bcount\b/,
    /\btrend\b/,
    /\bdistribution\b/,
    /\bstddev\b/,
    /\bstandard deviation\b/,
    /\bvariance\b/,
    /\boutlier\b/,
    /\bdeviation\b/,
  ];

  return patterns.some((r) => r.test(normalized));
}

function coerceIntentForChartability(intent: IntentAnalysis, userPrompt: string): IntentAnalysis {
  if (intent.metricType !== 'lookup') {
    return intent;
  }

  if (!hasAnalyticalSignals(userPrompt)) {
    return intent;
  }

  return {
    ...intent,
    metricType: 'distribution',
    chartHint: intent.chartHint === 'none' || intent.chartHint === null ? 'bar' : intent.chartHint,
  };
}

export async function analyzeIntent(
  userPrompt: string,
  previousContext?: { previousPrompt?: string; previousTitle?: string },
  options?: { sessionId?: string }
): Promise<IntentAnalysis> {
  const start = Date.now();
  let usage: any;
  let success = false;
  let errorMessage: string | undefined;

  const parsedTimeRange = parseTimeRange(userPrompt);
  const contextLines: string[] = [];

  if (previousContext?.previousTitle || previousContext?.previousPrompt) {
    contextLines.push(
      'Follow-up context:',
      `Prior chart: ${previousContext.previousTitle || 'unknown'}`,
      `Prior prompt: ${previousContext.previousPrompt || 'unknown'}`,
    );
  }

  const userMessage = [
    `User request: ${userPrompt}`,
    parsedTimeRange ? `Detected time range hint: ${parsedTimeRange.normalizedTimeRange}` : '',
    ...contextLines,
    'Identify which tables are needed and what the user wants to measure.',
  ].join('\n');

  // Pre-flight checks (zero-token) — catch obvious short or meta-system prompts
  const normalizedPrompt = (userPrompt || '').toLowerCase();

  if (isMetaSystemQuestion(normalizedPrompt)) {
    const resp: IntentAnalysis = {
      tables: [],
      metricType: 'lookup',
      timeRange: null,
      normalizedTimeRange: null,
      dimensions: [],
      isAnalytics: false,
      needsClarification: null,
      chartHint: 'none',
      intent: userPrompt,
      confidence: 0.95,
      confidenceReason: 'Pre-flight: detected meta/system question',
      clarificationQuestion: null,
    };

    logAICall({
      callType: 'intent_analysis',
      model: 'none',
      sessionId: options?.sessionId,
      userPrompt,
      success: true,
      errorMessage: undefined,
      latencyMs: Date.now() - start,
      usage: undefined,
    });

    return resp;
  }

  if (shouldClarifyBeforeLLM(userPrompt)) {
    const clarificationQuestion = buildVagueClarificationQuestion();
    const hasEntity = hasEntitySignal(normalizedPrompt);
    const hasMetric = hasMetricSignal(normalizedPrompt);
    const hasTime = hasTimeSignal(normalizedPrompt);

    const preflightResp: IntentAnalysis = {
      tables: [],
      metricType: 'lookup',
      timeRange: null,
      normalizedTimeRange: null,
      dimensions: [],
      isAnalytics: true,
      needsClarification: null,
      chartHint: 'none',
      intent: userPrompt,
      confidence: 0.1,
      confidenceReason: !hasEntity || !hasMetric || !hasTime ? 'Pre-flight: prompt missing entity, metric, or time range' : 'Pre-flight: prompt too short',
      clarificationQuestion,
    };

    logAICall({
      callType: 'intent_analysis',
      model: 'none',
      sessionId: options?.sessionId,
      userPrompt,
      success: true,
      errorMessage: undefined,
      latencyMs: Date.now() - start,
      usage: undefined,
    });

    return preflightResp;
  }

  // 6-second timeout to prevent pipeline stalls if intent agent hangs
  try {
    const completion = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          // FROZEN system prompt goes first — maximizes token cache hit rate
          { role: 'system', content: [FROZEN_INTENT_SYSTEM, TABLE_HINTS].join('\n\n') },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 250,
        response_format: { type: 'json_object' },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Intent agent timeout (6s)')), 6000)
      ),
    ]);

    usage = completion.usage;
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('Intent agent returned empty response');

    // Parse JSON first (guaranteed by response_format)
    const parsed = JSON.parse(raw);

    // Then validate shape with Zod (catches missing/wrong-type fields)
    const result = IntentAnalysisSchema.safeParse(parsed);

    if (!result.success) {
      console.warn('[IntentAgent] Zod validation failed, using fallback:', result.error.flatten());
      success = true;
      return buildIntentFallback(userPrompt);
    }

    success = true;
    const normalizedIntent = {
      ...result.data,
      timeRange: result.data.timeRange ?? parsedTimeRange?.normalizedTimeRange ?? null,
      normalizedTimeRange: parsedTimeRange?.normalizedTimeRange || result.data.normalizedTimeRange || null,
    };

    return coerceIntentForChartability(normalizedIntent, userPrompt);
  } catch (err: any) {
    errorMessage = err?.message || String(err);
    throw err;
  } finally {
    logAICall({
      callType: 'intent_analysis',
      model: 'llama-3.1-8b-instant',
      sessionId: options?.sessionId,
      userPrompt,
      success,
      errorMessage,
      latencyMs: Date.now() - start,
      usage,
    });
  }
}
