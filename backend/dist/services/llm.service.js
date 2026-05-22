"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDashboardInsights = generateDashboardInsights;
exports.generateSqlExplanation = generateSqlExplanation;
const groq_1 = __importDefault(require("../config/groq"));
const aiMetricsLogger_1 = require("../utils/aiMetricsLogger");
async function generateDashboardInsights(reportTitle, charts) {
    const start = Date.now();
    let usage;
    let success = false;
    let errorMessage;
    try {
        const completion = await groq_1.default.chat.completions.create({
            model: 'openai/gpt-oss-120b',
            messages: [
                {
                    role: 'system',
                    content: [
                        'You are an analytics narrator. Summarize dashboard-level insights from chart metadata and row samples.',
                        'Do not invent numbers not present in the input. If evidence is thin, say what changed qualitatively.',
                        'Return only valid JSON with shape {"summary":"...","insights":[{"type":"trend|anomaly|change|metric","title":"...","detail":"...","severity":"info|warning|success","chartId":"..."}]}.',
                    ].join(' '),
                },
                { role: 'user', content: JSON.stringify({ reportTitle, charts }) },
            ],
            temperature: 0.2,
            max_tokens: 900,
            response_format: { type: 'json_object' },
        });
        usage = completion.usage;
        const raw = completion.choices[0]?.message?.content;
        if (!raw) {
            throw new Error('LLM returned empty insight response');
        }
        success = true;
        return JSON.parse(raw);
    }
    catch (err) {
        errorMessage = err?.message || String(err);
        throw err;
    }
    finally {
        (0, aiMetricsLogger_1.logAICall)({
            callType: 'dashboard_insights',
            model: 'openai/gpt-oss-120b',
            success,
            errorMessage,
            latencyMs: Date.now() - start,
            usage,
        });
    }
}
async function generateSqlExplanation(sql, chartTitle) {
    const start = Date.now();
    let usage;
    let success = false;
    let errorMessage;
    try {
        const completion = await groq_1.default.chat.completions.create({
            model: 'openai/gpt-oss-120b',
            messages: [
                {
                    role: 'system',
                    content: [
                        'You are a data analyst explaining SQL queries to non-technical business users.',
                        'Explain what this SQL query does in 2-3 plain English sentences.',
                        'Focus on what data is being retrieved, what time range is applied, and what grouping or aggregation is happening.',
                        'Do not mention SQL syntax. Do not say "the query". Start directly with what the data shows.',
                    ].join(' '),
                },
                {
                    role: 'user',
                    content: `Chart title: "${chartTitle}"\nSQL: ${sql}`,
                },
            ],
            temperature: 0.3,
            max_tokens: 200,
        });
        usage = completion.usage;
        success = true;
        return completion.choices[0]?.message?.content || 'No explanation available.';
    }
    catch (err) {
        errorMessage = err?.message || String(err);
        throw err;
    }
    finally {
        (0, aiMetricsLogger_1.logAICall)({
            callType: 'sql_explanation',
            model: 'openai/gpt-oss-120b',
            userPrompt: `Chart title: "${chartTitle}"`,
            success,
            errorMessage,
            latencyMs: Date.now() - start,
            usage,
        });
    }
}
// Group-by validation moved to `sqlGuard.validateSqlForOnlyFullGroupBy`
