"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIntentFallback = buildIntentFallback;
exports.analyzeIntent = analyzeIntent;
const zod_1 = require("zod");
const groq_1 = __importDefault(require("../config/groq"));
const aiMetricsLogger_1 = require("../utils/aiMetricsLogger");
const promptTokens_1 = require("../utils/promptTokens");
// Zod schema for structured output validation
const FIXED_TIME_RANGES = ['last_7d', 'last_30d', 'last_90d', 'last_12m', 'this_month', 'this_year', 'all_time', 'custom'];
const IntentAnalysisSchema = zod_1.z.object({
    tables: zod_1.z.array(zod_1.z.enum(['tblcandidate', 'tblassignjobcandidate', 'tbldeals', 'tbljob'])).min(1),
    metricType: zod_1.z.enum(['count', 'sum', 'average', 'ratio', 'trend', 'distribution', 'scalar']),
    timeRange: zod_1.z.union([
        zod_1.z.enum(FIXED_TIME_RANGES),
        zod_1.z.string().refine(isSupportedDynamicTimeRange),
        zod_1.z.enum(['weekly', 'quarterly', 'this_quarter']),
    ]).nullable(),
    normalizedTimeRange: zod_1.z.string().nullable().optional(),
    dimensions: zod_1.z.array(zod_1.z.string()),
    isAnalytics: zod_1.z.boolean(),
    needsClarification: zod_1.z.string().nullable(),
    chartHint: zod_1.z.enum(['bar', 'line', 'pie', 'table']).nullable(),
    intent: zod_1.z.string(),
    confidence: zod_1.z.number().min(0).max(1),
    confidenceReason: zod_1.z.string().nullable(),
    clarificationQuestion: zod_1.z.string().nullable(),
});
// FROZEN — do not generate at runtime
const FROZEN_INTENT_SYSTEM = (0, promptTokens_1.buildFrozenIntentPrefix)();
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
function parseTimeRange(userPrompt) {
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
function matchExplicitRelativeRange(normalized) {
    const explicitRelative = /\blast[_\s-]?([1-9]\d*)\s*([dmy])\b/i.exec(normalized);
    if (!explicitRelative?.[1] || !explicitRelative[2]) {
        return null;
    }
    return {
        normalizedTimeRange: `last_${explicitRelative[1]}${explicitRelative[2].toLowerCase()}`,
        rangeType: 'relative',
    };
}
function matchRollingRange(normalized) {
    const rollingRelative = /\brolling(?:[_\s-]+)?([1-9]\d*)\s*(day|days|week|weeks|month|months|year|years)\b/i.exec(normalized);
    if (!rollingRelative?.[1] || !rollingRelative[2]) {
        return null;
    }
    const unitMap = {
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
function matchNamedTimeRange(normalized) {
    if (/\bweekly\b/i.test(normalized)) {
        return { normalizedTimeRange: 'weekly', rangeType: 'weekly' };
    }
    if (/\bquarterly\b/i.test(normalized)) {
        return { normalizedTimeRange: 'quarterly', rangeType: 'quarterly' };
    }
    const shorthandAliases = [
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
function getRangeTypeForAlias(value) {
    if (value === 'weekly') {
        return 'weekly';
    }
    if (value === 'quarterly') {
        return 'quarterly';
    }
    return 'relative';
}
function isSupportedDynamicTimeRange(value) {
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
function buildClarificationQuestion(userPrompt) {
    const normalized = userPrompt.toLowerCase();
    const isJobQuery = /\b(job|jobs|hiring|hiring role|opening|openings|requisition|requisitions)\b/i.test(normalized);
    if (isJobQuery) {
        return 'Should I show active jobs by department, by recruiter, or just the total count?';
    }
    if (/compare|performance|trend|show me something|something interesting|chart/i.test(normalized)) {
        return 'Which metric should I show - total, average, or trend?';
    }
    if (/time|month|week|year|recent|latest|last|right now|now|current|active|open/i.test(normalized)) {
        return 'Which time range - last 30 days, 3 months, or 12 months?';
    }
    return 'What would you like to see - total, average, trend, or something else?';
}
function estimateConfidence(userPrompt) {
    const normalized = userPrompt.toLowerCase();
    const isJobQuery = /\b(job|jobs|hiring|hiring role|opening|openings|requisition|requisitions)\b/i.test(normalized);
    const isCandidateQuery = /\b(candidate|candidates|applicant|applicants|talent)\b/i.test(normalized);
    const isDealQuery = /\b(deal|deals|revenue|billing|deal value)\b/i.test(normalized);
    const isAssignmentQuery = /\b(assignment|assignments|pipeline|placement|funnel)\b/i.test(normalized);
    const hasEntity = isJobQuery || isCandidateQuery || isDealQuery || isAssignmentQuery;
    const hasMetric = /\b(total|count|how many|average|avg|mean|trend|change|growth|variance|dropout|turnaround|cumulative|running total|active)\b/i.test(normalized);
    const hasScope = /\b(right now|now|current|active|open|closed|last|today|yesterday|week|month|year|recent|latest|rolling|this month|this year|last 30 days|last 3 months|last 12 months)\b/i.test(normalized);
    const vague = /\b(draw a chart|show me something|something interesting|compare performance|show trends|show performance)\b/i.test(normalized);
    if (hasEntity && hasMetric && hasScope) {
        return {
            confidence: 0.95,
            confidenceReason: null,
            clarificationQuestion: null,
        };
    }
    if (hasEntity && hasMetric && !hasScope) {
        return {
            confidence: 0.82,
            confidenceReason: 'The request names a clear entity and metric, but the scope or time window is only implied.',
            clarificationQuestion: null,
        };
    }
    if (hasEntity && hasScope && !hasMetric) {
        return {
            confidence: 0.78,
            confidenceReason: 'The request names a clear entity and scope, but the metric is implicit.',
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
    if (!hasEntity && !hasMetric && !hasScope) {
        return {
            confidence: 0.2,
            confidenceReason: 'The request does not clearly identify a metric or time window.',
            clarificationQuestion: buildClarificationQuestion(userPrompt),
        };
    }
    if (hasEntity && hasMetric) {
        return {
            confidence: 0.85,
            confidenceReason: null,
            clarificationQuestion: null,
        };
    }
    return {
        confidence: 0.6,
        confidenceReason: 'The request has partial structure but still leaves ambiguity in the entity, metric, or scope.',
        clarificationQuestion: buildClarificationQuestion(userPrompt),
    };
}
/** Default fallback when intent analysis fails or times out */
function buildIntentFallback(userPrompt) {
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
async function analyzeIntent(userPrompt, previousContext, options) {
    const start = Date.now();
    let usage;
    let success = false;
    let errorMessage;
    const parsedTimeRange = parseTimeRange(userPrompt);
    const contextLines = [];
    if (previousContext?.previousTitle || previousContext?.previousPrompt) {
        contextLines.push('Follow-up context:', `Prior chart: ${previousContext.previousTitle || 'unknown'}`, `Prior prompt: ${previousContext.previousPrompt || 'unknown'}`);
    }
    const userMessage = [
        `User request: ${userPrompt}`,
        parsedTimeRange ? `Detected time range hint: ${parsedTimeRange.normalizedTimeRange}` : '',
        ...contextLines,
        'Identify which tables are needed and what the user wants to measure.',
    ].join('\n');
    // 6-second timeout to prevent pipeline stalls if intent agent hangs
    try {
        const completion = await Promise.race([
            groq_1.default.chat.completions.create({
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
            new Promise((_, reject) => setTimeout(() => reject(new Error('Intent agent timeout (6s)')), 6000)),
        ]);
        usage = completion.usage;
        const raw = completion.choices[0]?.message?.content;
        if (!raw)
            throw new Error('Intent agent returned empty response');
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
        return {
            ...result.data,
            timeRange: result.data.timeRange ?? parsedTimeRange?.normalizedTimeRange ?? null,
            normalizedTimeRange: parsedTimeRange?.normalizedTimeRange || result.data.normalizedTimeRange || null,
        };
    }
    catch (err) {
        errorMessage = err?.message || String(err);
        throw err;
    }
    finally {
        (0, aiMetricsLogger_1.logAICall)({
            callType: 'intent_analysis',
            model: 'llama-3.3-70b-versatile',
            sessionId: options?.sessionId,
            userPrompt,
            success,
            errorMessage,
            latencyMs: Date.now() - start,
            usage,
        });
    }
}
