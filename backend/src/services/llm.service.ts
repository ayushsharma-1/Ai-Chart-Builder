import { startObservation } from '@langfuse/tracing';
import groq from '../config/groq';
import { logAICall } from '../utils/aiMetricsLogger';
// Group-by validation moved into `sqlGuard.validateSql()` and no longer
// exported separately.

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
  const observation = startObservation('generate-dashboard-insights', {
    input: {
      reportTitle,
      chartCount: charts.length,
    },
    model: '@thinkdeck/openai/gpt-oss-120b',
    modelParameters: { provider: 'groq' },
  }, { asType: 'generation' });

  const start = Date.now();
  let usage: any;
  let success = false;
  let errorMessage: string | undefined;

  try {
    const completion = await groq.chat.completions.create({
      model: '@thinkdeck/openai/gpt-oss-120b',
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
    }, {
      ...(observation.traceId ? { traceId: observation.traceId } : {})
    });

    usage = completion.usage;
    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error('LLM returned empty insight response');
    }

    success = true;
    observation.update({
      output: {
        chartCount: charts.length,
        summaryPreview: String(JSON.parse(raw).summary || '').slice(0, 200),
      },
      usageDetails: {
        input: usage?.prompt_tokens || 0,
        output: usage?.completion_tokens || 0,
        total: usage?.total_tokens || 0,
      },
    });
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
    observation.update({ output: { error: errorMessage } });
    throw err;
  } finally {
    observation.end();
    logAICall({
      callType: 'dashboard_insights',
      model: '@thinkdeck/openai/gpt-oss-120b',
      success,
      errorMessage,
      latencyMs: Date.now() - start,
      usage,
    });
  }
}

export async function generateSqlExplanation(sql: string, chartTitle: string): Promise<string> {
  const observation = startObservation('generate-sql-explanation', {
    input: {
      chartTitle,
      sql,
    },
    model: '@thinkdeck/openai/gpt-oss-120b',
    modelParameters: { provider: 'groq' },
  }, { asType: 'generation' });

  const start = Date.now();
  let usage: any;
  let success = false;
  let errorMessage: string | undefined;

  try {
    const completion = await groq.chat.completions.create({
      model: '@thinkdeck/openai/gpt-oss-120b',
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
    }, {
      ...(observation.traceId ? { traceId: observation.traceId } : {})
    });

    usage = completion.usage;
    success = true;
    const explanation = completion.choices[0]?.message?.content || 'No explanation available.';
    observation.update({
      output: {
        explanation,
      },
      usageDetails: {
        input: usage?.prompt_tokens || 0,
        output: usage?.completion_tokens || 0,
        total: usage?.total_tokens || 0,
      },
    });
    return explanation;
  } catch (err: any) {
    errorMessage = err?.message || String(err);
    observation.update({ output: { error: errorMessage } });
    throw err;
  } finally {
    observation.end();
    logAICall({
      callType: 'sql_explanation',
      model: '@thinkdeck/openai/gpt-oss-120b',
      userPrompt: `Chart title: "${chartTitle}"`,
      success,
      errorMessage,
      latencyMs: Date.now() - start,
      usage,
    });
  }
}

// Group-by validation moved to `sqlGuard.validateSqlForOnlyFullGroupBy`