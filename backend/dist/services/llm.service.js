"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateChartConfig = generateChartConfig;
exports.generateDashboardInsights = generateDashboardInsights;
exports.generateSqlExplanation = generateSqlExplanation;
const groq_1 = __importDefault(require("../config/groq"));
const dataModel_1 = require("../utils/dataModel");
const semanticMetrics_1 = require("../utils/semanticMetrics");
const SYSTEM_PROMPT = `
You are a read-only analytics assistant for an internal HR and recruitment platform.
Your job is to convert natural language questions into MySQL SELECT queries and chart configurations.

${(0, dataModel_1.getDataModel)()}

${(0, semanticMetrics_1.getSemanticMetricPrompt)()}

STRICT RULES:
1. ONLY generate SELECT queries. Never INSERT, UPDATE, DELETE, DROP, or modify data.
2. ONLY use the tables listed above. Never reference any other table.
3. Always name columns explicitly — never use SELECT *.
4. Always add sensible column aliases for readability.
5. All dates are stored as UNIX timestamps. Always wrap them with FROM_UNIXTIME() before date formatting.
6. For date grouping, use DATE_FORMAT(FROM_UNIXTIME(createdon), '%Y-%m') or the equivalent timestamp column.
7. Always filter tblcandidate and tbljob with deleted = 0.
8. Always filter tbldeals with archived = 0.
9. Never return PII: emailid, contactnumber, formatted_contact_number.
10. Prefer denormalized columns on tblassignjobcandidate for display fields when possible.
11. Use tblassignjobcandidate for candidate-job pipeline analytics and JOINs to tblcandidate and tbljob when needed.
12. If multiple aggregated metrics are requested in one result, alias them clearly, keep one primary dimension column, and return the metrics as separate numeric columns.
13. If the prompt asks for a single total count, sum, or metric, return chartType "table" and still provide xAxis/yAxis aliases such as "metric" and "value".
14. If the user asks something unrelated to analytics or data, set isAnalyticsQuery to false.
15. If the query is ambiguous, set clarificationNeeded with a specific question.
16. For dashboard compatibility, when selecting fields that match report filters, use these aliases exactly where possible:
    date/month fields: "date", "created_date", or "created_month"
    owner fields: "owner" or "ownerid"
    company fields: "company", "company_name", or "companyname"
    stage fields: "stage", "deal_stage", or "candidate_stage"
    job status fields: "job_status" or "status"

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown, no explanation:
{
  "sql": "SELECT ...",
  "chartType": "bar" | "line" | "pie" | "table",
  "title": "Human readable chart title",
  "xAxis": "column name for x axis",
  "yAxis": "column name for y axis",
  "reasoning": "brief explanation of what the query does",
  "isAnalyticsQuery": true,
  "clarificationNeeded": null
}

For non-analytics queries:
{
  "sql": null,
  "chartType": null,
  "title": null,
  "xAxis": null,
  "yAxis": null,
  "reasoning": null,
  "isAnalyticsQuery": false,
  "clarificationNeeded": null
}
`.trim();
async function generateChartConfig(userPrompt, context) {
    console.info('[LLM] Generating chart config for prompt:', userPrompt);
    const contextualPrompt = context?.previousSql
        ? [
            'The user may be asking a follow-up analytics question.',
            `Previous chart title: ${context.previousTitle || 'unknown'}`,
            `Previous prompt: ${context.previousPrompt || 'unknown'}`,
            `Previous chart type: ${context.previousChartType || 'unknown'}`,
            `Previous SQL: ${context.previousSql}`,
            `New user request: ${userPrompt}`,
            'If this is a refinement, preserve useful intent from the previous SQL while producing a fresh safe SELECT query.',
        ].join('\n')
        : userPrompt;
    const completion = await groq_1.default.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: contextualPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
        throw new Error('LLM returned empty response');
    }
    console.info('[LLM] Raw response received');
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new Error('LLM returned invalid JSON');
    }
}
async function generateDashboardInsights(reportTitle, charts) {
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
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
        throw new Error('LLM returned empty insight response');
    }
    return JSON.parse(raw);
}
async function generateSqlExplanation(sql, chartTitle) {
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
    return completion.choices[0]?.message?.content || 'No explanation available.';
}
