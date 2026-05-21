"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSqlForOnlyFullGroupBy = validateSqlForOnlyFullGroupBy;
exports.generateDashboardInsights = generateDashboardInsights;
exports.generateSqlExplanation = generateSqlExplanation;
const groq_1 = __importDefault(require("../config/groq"));
const aiMetricsLogger_1 = require("../utils/aiMetricsLogger");
function validateSqlForOnlyFullGroupBy(sql) {
    if (!sql || typeof sql !== 'string')
        return null;
    const branches = splitUnionAllBranches(sql);
    for (const branch of branches) {
        const branchError = validateSingleSelectBranch(branch);
        if (branchError)
            return branchError;
    }
    return null;
}
function splitUnionAllBranches(sql) {
    const branches = [];
    const parts = sql.split(/\bUNION\s+ALL\b/i);
    for (const part of parts) {
        const trimmed = part.trim().replace(/^\(+/, '').replace(/\)+$/, '');
        if (trimmed)
            branches.push(trimmed);
    }
    return branches.length > 0 ? branches : [sql];
}
function validateSingleSelectBranch(sql) {
    const hasAggregate = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(sql);
    const selectClause = extractSelectClause(sql);
    const groupBy = extractGroupByClause(sql);
    const aliases = findAliases(selectClause);
    if (hasAggregate && !groupBy.trim()) {
        const selectPieces = selectClause
            .replace(/\b(COUNT|SUM|AVG|MIN|MAX)\s*\([\s\S]*?\)/gi, '')
            .split(',')
            .map((piece) => piece.trim())
            .filter(Boolean);
        if (selectPieces.length > 1) {
            return 'Aggregates present but no GROUP BY — non-aggregated fields detected.';
        }
    }
    if (groupBy && /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(groupBy)) {
        return 'GROUP BY clause cannot contain aggregate functions (COUNT, SUM, AVG, MIN, MAX). Remove the aggregate expression from the GROUP BY clause.';
    }
    if (aliases.length && groupBy) {
        for (const alias of aliases) {
            const re = new RegExp(String.raw `\b${alias}\b`, 'i');
            if (re.test(groupBy)) {
                return `GROUP BY references SELECT alias '${alias}'. Use the full expression instead: repeat the source expression from SELECT.`;
            }
        }
    }
    return null;
}
async function generateDashboardInsights(reportTitle, charts) {
    const start = Date.now();
    let usage;
    let success = false;
    let errorMessage;
    try {
        const completion = await groq_1.default.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
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
            model: 'llama-3.3-70b-versatile',
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
            model: 'llama-3.3-70b-versatile',
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
            model: 'llama-3.3-70b-versatile',
            userPrompt: `Chart title: "${chartTitle}"`,
            success,
            errorMessage,
            latencyMs: Date.now() - start,
            usage,
        });
    }
}
function extractSelectClause(s) {
    const m = /select([\s\S]*?)from/i.exec(s);
    return m ? m[1] : '';
}
function extractGroupByClause(s) {
    const m = /group\s+by\s+([\s\S]*?)(order\s+by|limit|$)/i.exec(s);
    return m ? m[1] : '';
}
function findAliases(selectClause) {
    const re = /\bAS\s+((?!\d)\w+)/gi;
    const out = [];
    let am;
    while ((am = re.exec(selectClause)) !== null) {
        if (am[1])
            out.push(am[1]);
    }
    return out;
}
