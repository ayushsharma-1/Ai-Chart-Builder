import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { generateChartConfig } from '../services/llm.service';
import { runQuery } from '../services/sql.service';
import { buildChartExplainability } from '../utils/chartExplainability';

const router = Router();

function isBlockedSqlError(error: unknown) {
  return Boolean((error as any)?.message?.startsWith('Query blocked:'));
}

function isNumericLike(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return true;
  }

  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return true;
  }

  return false;
}

function isLikelyDimensionKey(key: string) {
  const normalized = key.toLowerCase();

  return (
    normalized === 'id' ||
    normalized.endsWith('_id') ||
    /(uuid|guid|timestamp|createdon|updatedon|deletedon|archivedon|rownum|ordinal|position|index|year|month|day|week|date|time)$/i.test(normalized)
  );
}

function deriveSeriesKeys(rows: unknown[], xAxis: string, yAxis: string) {
  const objectRows = rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
  const allKeys = Array.from(new Set(objectRows.flatMap((row) => Object.keys(row)))).filter((key) => key !== xAxis);

  const diagnostics = allKeys.map((key) => {
    const values = objectRows.map((row) => row[key]);
    const numericValues = values.filter(isNumericLike).map(Number);
    const numericCount = numericValues.length;
    const coverage = objectRows.length ? numericCount / objectRows.length : 0;

    return {
      key,
      numericCount,
      nullCount: values.filter((value) => value === null || value === undefined || value === '').length,
      coverage,
      min: numericValues.length ? Math.min(...numericValues) : null,
      max: numericValues.length ? Math.max(...numericValues) : null,
      isDimensionLike: isLikelyDimensionKey(key) && key !== yAxis,
    };
  });

  const validMetrics = diagnostics.filter((metric) => metric.numericCount > 0 && metric.coverage >= 0.5 && !metric.isDimensionLike);
  const preferred = validMetrics.find((metric) => metric.key === yAxis) || validMetrics[0] || diagnostics.find((metric) => metric.key === yAxis) || diagnostics[0];
  const orderedSeriesKeys = preferred
    ? [preferred.key, ...validMetrics.filter((metric) => metric.key !== preferred.key).map((metric) => metric.key)]
    : [];

  if (process.env.NODE_ENV === 'development') {
    console.info('[Query] Derived series keys', {
      xAxis,
      yAxis,
      rowCount: objectRows.length,
      seriesKeys: orderedSeriesKeys,
      diagnostics,
    });
  }

  return orderedSeriesKeys;
}

function hasValidChartConfig(chartType: string, sql: string | null, title: string | null, xAxis: string | null, yAxis: string | null) {
  if (!sql || !title) {
    return false;
  }

  if (chartType === 'table') {
    return true;
  }

  return Boolean(xAxis && yAxis);
}

function buildSuccessPayload(prompt: string, llmResponse: Awaited<ReturnType<typeof generateChartConfig>>, chartType: string, xAxis: string, yAxis: string, result: Awaited<ReturnType<typeof runQuery>>) {
  const chartConfig = {
    xAxis,
    yAxis,
    seriesKeys: deriveSeriesKeys(result.data, xAxis, yAxis),
  };
  const explainability = buildChartExplainability({
    title: llmResponse.title,
    prompt,
    sql: llmResponse.sql,
    reasoning: llmResponse.reasoning,
    chartType,
    chartConfig,
  });

  return {
    success: true,
    title: llmResponse.title,
    chartType,
    chartConfig,
    data: result.data,
    rowCount: result.rowCount,
    executionTimeMs: result.executionTimeMs,
    sql: llmResponse.sql,
    reasoning: llmResponse.reasoning,
    aiExplanation: explainability.aiExplanation,
    queryConfidence: explainability.queryConfidence,
    metricLineage: explainability.metricLineage,
    executionMetadata: {
      rowCount: result.rowCount,
      queryDurationMs: result.executionTimeMs,
      lastRunAt: new Date().toISOString(),
      cacheStatus: result.cacheStatus || 'miss',
    },
  };
}

function handleQueryError(res: Response, error: unknown) {
  const err = error as any;
  const isValidationError = err?.name === 'ZodError';

  console.error('Query error:', isValidationError ? 'Invalid request payload' : err?.stack || err?.message || err);

  if (err?.message?.includes('GROQ_API_KEY')) {
    return res.status(500).json({
      success: false,
      type: 'llm_error',
      message: 'GROQ_API_KEY is not configured. Set GROQ_API_KEY in backend/.env to enable LLM calls.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }

  return res.status(500).json({
    success: false,
    type: 'error',
    message: isValidationError
      ? 'Invalid request payload. Please send a prompt string.'
      : 'Something went wrong processing your request. Please try again.',
  });
}

const QuerySchema = z.object({
  prompt: z.string().trim().min(3).max(500),
  context: z.object({
    previousPrompt: z.string().optional(),
    previousTitle: z.string().optional(),
    previousSql: z.string().optional(),
    previousChartType: z.string().optional(),
  }).optional(),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { prompt, context } = QuerySchema.parse(req.body);
    const llmResponse = await generateChartConfig(prompt, context);

    console.info('[Query] LLM parsed response:', {
      isAnalyticsQuery: llmResponse.isAnalyticsQuery,
      chartType: llmResponse.chartType,
      hasSql: Boolean(llmResponse.sql),
      hasTitle: Boolean(llmResponse.title),
      hasXAxis: Boolean(llmResponse.xAxis),
      hasYAxis: Boolean(llmResponse.yAxis),
      clarificationNeeded: llmResponse.clarificationNeeded,
    });

    if (!llmResponse.isAnalyticsQuery) {
      return res.status(200).json({
        success: false,
        type: 'non_analytics',
        message:
          "I can only answer analytics questions about your recruitment data. Try asking something like 'Show me candidates hired this month'.",
      });
    }

    if (llmResponse.clarificationNeeded) {
      return res.status(200).json({
        success: false,
        type: 'clarification',
        message: llmResponse.clarificationNeeded,
      });
    }

    const chartType = llmResponse.chartType || 'table';
    const fallbackXAxis = chartType === 'table' ? llmResponse.xAxis || 'metric' : llmResponse.xAxis;
    const fallbackYAxis = chartType === 'table' ? llmResponse.yAxis || 'value' : llmResponse.yAxis;

    if (!hasValidChartConfig(chartType, llmResponse.sql, llmResponse.title, fallbackXAxis, fallbackYAxis)) {
      console.error('[Query] Incomplete LLM response:', llmResponse);

      return res.status(200).json({
        success: false,
        type: 'clarification',
        message:
          'I could generate the query, but I need a clearer grouping dimension for the chart. Try asking for a breakdown by candidate, job, month, or stage.',
      });
    }

    const sql = llmResponse.sql;
    const xAxis = fallbackXAxis || '';
    const yAxis = fallbackYAxis || '';

    if (!sql || !xAxis || !yAxis) {
      return res.status(200).json({
        success: false,
        type: 'clarification',
        message: 'I could not generate a complete chart configuration for that request. Please try asking with a clearer metric and grouping.',
      });
    }

    let result;

    try {
      result = await runQuery(sql);
    } catch (queryError: any) {
      console.error('[Query] SQL execution failed:', {
        prompt,
        sql,
        error: queryError?.message,
      });

      if (isBlockedSqlError(queryError)) {
        return res.status(422).json({
          success: false,
          type: 'validation_error',
          message: 'I generated a query that our security system blocked. Please try rephrasing your question.',
        });
      }

      return res.status(500).json({
        success: false,
        type: 'error',
        message: 'Something went wrong. Please try again.',
      });
    }

    return res.json(buildSuccessPayload(prompt, llmResponse, chartType, xAxis, yAxis, result));
  } catch (err: any) {
    return handleQueryError(res, err);
  }
});

export default router;
