import { z } from 'zod';
import groq from '../config/groq';
import { logAICall } from '../utils/aiMetricsLogger';
import { validateSqlForOnlyFullGroupBy } from '../utils/sqlGuard';

export { validateSqlForOnlyFullGroupBy };

interface InsightChartInput {
  id: string;
  title: string;
  chartType: string;
  rowCount: number;
  xAxis?: string;
  yAxis?: string;
  sampleRows: unknown[];
}

export async function generateDashboardInsights(reportTitle: string, charts: InsightChartInput[]) {
  const start = Date.now();
  let usage: any;
  let success = false;
  let errorMessage: string | undefined;

  try {
    const completion = await groq.chat.completions.create({
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
    return JSON.parse(raw) as {
      summary: string;
      insights: Array<{
        type: 'trend' | 'anomaly' | 'change' | 'metric';
        title: string;
        detail: string;
        severity: 'info' | 'warning' | 'success';
        chartId?: string;
      }>;
    };
  } catch (err: any) {
    errorMessage = err?.message || String(err);
    throw err;
  } finally {
    logAICall({
      callType: 'dashboard_insights',
      model: 'llama-3.3-70b-versatile',
      success,
      errorMessage,
      latencyMs: Date.now() - start,
      usage,
    });
  }
}

export async function generateSqlExplanation(sql: string, chartTitle: string): Promise<string> {
  const start = Date.now();
  let usage: any;
  let success = false;
  let errorMessage: string | undefined;

  try {
    const completion = await groq.chat.completions.create({
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
  } catch (err: any) {
    errorMessage = err?.message || String(err);
    throw err;
  } finally {
    logAICall({
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

// Group-by validation moved to `sqlGuard.validateSqlForOnlyFullGroupBy`