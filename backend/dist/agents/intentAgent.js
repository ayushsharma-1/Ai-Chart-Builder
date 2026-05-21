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
/** Default fallback when intent analysis fails or times out */
function buildIntentFallback(userPrompt) {
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
    // 3-second timeout to prevent pipeline stalls if intent agent hangs
    try {
        const completion = await Promise.race([
            groq_1.default.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    // FROZEN system prompt goes first — maximizes token cache hit rate
                    { role: 'system', content: [FROZEN_INTENT_SYSTEM, TABLE_HINTS].join('\n\n') },
                    { role: 'user', content: userMessage },
                ],
                temperature: 0.1,
                max_tokens: 300, // intent analysis is small
                response_format: { type: 'json_object' },
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Intent agent timeout (3s)')), 3000)),
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
