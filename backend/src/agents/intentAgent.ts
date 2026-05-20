import { z } from 'zod';
import groq from '../config/groq';
import { buildFrozenIntentPrefix } from '../utils/promptTokens';

// Zod schema for structured output validation
const FIXED_TIME_RANGES = ['last_7d', 'last_30d', 'last_90d', 'last_12m', 'this_month', 'this_year', 'all_time', 'custom'] as const;

const IntentAnalysisSchema = z.object({
  tables: z.array(z.enum(['tblcandidate', 'tblassignjobcandidate', 'tbldeals', 'tbljob'])).min(1),
  metricType: z.enum(['count', 'sum', 'average', 'ratio', 'trend', 'distribution', 'scalar']),
  timeRange: z.union([
    z.enum(FIXED_TIME_RANGES),
    z.string().refine(isSupportedDynamicTimeRange),
    z.enum(['weekly', 'quarterly', 'this_quarter']),
  ]).nullable(),
  normalizedTimeRange: z.string().nullable().optional(),
  dimensions: z.array(z.string()),
  isAnalytics: z.boolean(),
  needsClarification: z.string().nullable(),
  chartHint: z.enum(['bar', 'line', 'pie', 'table']).nullable(),
  intent: z.string(),
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

/** Default fallback when intent analysis fails or times out */
export function buildIntentFallback(userPrompt: string): IntentAnalysis {
  const parsedTimeRange = parseTimeRange(userPrompt);

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
  };
}

export async function analyzeIntent(
  userPrompt: string,
  previousContext?: { previousPrompt?: string; previousTitle?: string }
): Promise<IntentAnalysis> {
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

  // 3-second timeout to prevent pipeline stalls if intent agent hangs
  const completion = await Promise.race([
    groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        // FROZEN system prompt goes first — maximizes token cache hit rate
        { role: 'system', content: [FROZEN_INTENT_SYSTEM, TABLE_HINTS].join('\n\n') },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 300,    // intent analysis is small
      response_format: { type: 'json_object' },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Intent agent timeout (3s)')), 3000)
    ),
  ]);

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Intent agent returned empty response');

  // Parse JSON first (guaranteed by response_format)
  const parsed = JSON.parse(raw);

  // Then validate shape with Zod (catches missing/wrong-type fields)
  const result = IntentAnalysisSchema.safeParse(parsed);

  if (!result.success) {
    console.warn('[IntentAgent] Zod validation failed, using fallback:', result.error.flatten());
    return buildIntentFallback(userPrompt);
  }

  return {
    ...result.data,
    timeRange: result.data.timeRange ?? parsedTimeRange?.normalizedTimeRange ?? null,
    normalizedTimeRange: parsedTimeRange?.normalizedTimeRange || result.data.normalizedTimeRange || null,
  };
}
