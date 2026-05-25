import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { deleteChart, duplicateChart, getAllCharts, getChart, saveChart, updateChart, updateChartPosition } from '../services/chart.service';
import { generateSqlExplanation } from '../services/llm.service';
import Chart from '../models/Chart';
import { runQuery } from '../services/sql.service';

const router = Router();

const SaveChartSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  prompt: z.string().trim().min(1, 'prompt is required'),
  sql: z.string().trim().min(1, 'sql is required'),
  chartType: z.enum(['bar', 'line', 'pie', 'table']),
  chartConfig: z.object({
    xAxis: z.string().trim().min(1, 'chartConfig.xAxis is required'),
    yAxis: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)]),
    dataKey: z.string().optional(),
    seriesKeys: z.array(z.string().trim().min(1)).optional(),
  }),
  reasoning: z.string().optional(),
  aiExplanation: z.string().optional(),
  queryConfidence: z.any().optional(),
  metricLineage: z.any().optional(),
  chartOverrideReason: z.string().optional(),
  chartConfidence: z.enum(['high', 'medium', 'low']).optional(),
  dataSnapshot: z.array(z.any()).optional(),
  executionMetadata: z.any().optional(),
  gridPosition: z.any().optional(),
});

function handleChartRouteError(res: Response, error: unknown, fallback: string) {
  const err = error as any;
  const isValidation = err?.name === 'ZodError';
  const isMongooseValidation = err?.name === 'ValidationError';
  let message = err?.message || fallback;

  if (isValidation) {
    message = 'Invalid chart payload.';
  } else if (isMongooseValidation) {
    message = err?.message || 'Chart payload failed validation.';
  }

  console.error('Chart route error:', err?.message || err);

  return res.status(isValidation || isMongooseValidation ? 400 : 500).json({
    success: false,
    message,
  });
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const charts = await getAllCharts();
    res.json({ success: true, charts });
  } catch (err: any) {
    console.error('Charts fetch error:', err?.message || err);
    res.status(500).json({ success: false, message: 'Unable to load saved charts.' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const payload = SaveChartSchema.parse(req.body);
    const chart = await saveChart(payload as any);
    res.json({ success: true, chart });
  } catch (err: any) {
    return handleChartRouteError(res, err, 'Unable to save chart.');
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const chart = await getChart(req.params.id);

    if (!chart) {
      return res.status(404).json({ success: false, message: 'Chart not found.' });
    }

    return res.json({ success: true, chart });
  } catch (err: any) {
    console.error('Chart fetch error:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Unable to load chart.' });
  }
});

router.post('/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const chart = await duplicateChart(req.params.id);

    if (!chart) {
      return res.status(404).json({ success: false, message: 'Chart not found.' });
    }

    return res.json({ success: true, chart });
  } catch (err: any) {
    console.error('Chart duplicate error:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Unable to duplicate chart.' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const chart = await updateChart(req.params.id, req.body);

    if (!chart) {
      return res.status(404).json({ success: false, message: 'Chart not found.' });
    }

    return res.json({ success: true, chart });
  } catch (err: any) {
    console.error('Chart update error:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Unable to update chart.' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteChart(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Chart delete error:', err?.message || err);
    res.status(500).json({ success: false, message: 'Unable to delete chart.' });
  }
});

router.patch('/:id/position', async (req: Request, res: Response) => {
  try {
    const chart = await updateChartPosition(req.params.id, req.body.gridPosition);
    res.json({ success: true, chart });
  } catch (err: any) {
    console.error('Chart position update error:', err?.message || err);
    res.status(500).json({ success: false, message: 'Unable to update chart position.' });
  }
});

router.post('/:id/explain', async (req: Request, res: Response) => {
  try {
    const chart = await Chart.findById(req.params.id);

    if (!chart) {
      return res.status(404).json({ success: false, message: 'Chart not found.' });
    }

    if (chart.aiExplanation) {
      return res.json({ success: true, explanation: chart.aiExplanation });
    }

    const explanation = await generateSqlExplanation(chart.sql, chart.title);
    chart.aiExplanation = explanation;
    await chart.save();

    return res.json({ success: true, explanation });
  } catch (err: any) {
    console.error('Chart explain error:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Unable to generate explanation.' });
  }
});

router.post('/:id/refresh', async (req: Request, res: Response) => {
  try {
    const { accountId } = z.object({
      accountId: z.string().regex(/^\d+$/, 'accountId must be a numeric string').min(1),
    }).parse(req.body);

    const chart = await Chart.findById(req.params.id);

    if (!chart) {
      return res.status(404).json({ success: false, message: 'Chart not found.' });
    }

    const result = await runQuery(chart.sql, [], {
      ttlSeconds: 0,
      accountId,
      userPrompt: `Chart refresh: ${chart.title}`,
      originalSql: chart.sql,
      retryCount: 0,
    });

    chart.dataSnapshot = result.data;
    chart.executionMetadata = {
      rowCount: result.rowCount,
      queryDurationMs: result.executionTimeMs,
      lastRunAt: new Date(),
      cacheStatus: result.cacheStatus || 'miss',
    };
    await chart.save();

    return res.json({
      success: true,
      chart,
      data: result.data,
      rowCount: result.rowCount,
      executionTimeMs: result.executionTimeMs,
    });
  } catch (err: any) {
    console.error('Chart refresh error:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Refresh failed.' });
  }
});

router.get('/:id/comments', async (req: Request, res: Response) => {
  try {
    const chart = await Chart.findById(req.params.id).select('comments');

    if (!chart) {
      return res.status(404).json({ success: false, message: 'Chart not found.' });
    }

    return res.json({ success: true, comments: chart.comments || [] });
  } catch (err: any) {
    console.error('Chart comments fetch error:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Unable to load comments.' });
  }
});

router.post('/:id/comments', async (req: Request, res: Response) => {
  try {
    const chart = await Chart.findById(req.params.id);

    if (!chart) {
      return res.status(404).json({ success: false, message: 'Chart not found.' });
    }

    const content = String(req.body?.content || '').trim();
    const author = String(req.body?.author || 'Analyst').trim() || 'Analyst';

    if (!content) {
      return res.status(400).json({ success: false, message: 'Comment cannot be empty.' });
    }

    const comment = {
      id: randomUUID(),
      author,
      content,
      createdAt: new Date(),
      resolved: false,
    };

    chart.comments.push(comment);
    await chart.save();

    return res.json({ success: true, comment });
  } catch (err: any) {
    console.error('Chart comment create error:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Unable to add comment.' });
  }
});

router.patch('/:id/comments/:commentId', async (req: Request, res: Response) => {
  try {
    const resolved = Boolean(req.body?.resolved);
    const result = await Chart.updateOne(
      { _id: req.params.id, 'comments.id': req.params.commentId },
      { $set: { 'comments.$.resolved': resolved } },
    );

    return res.json({ success: true, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
  } catch (err: any) {
    console.error('Chart comment update error:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Unable to update comment.' });
  }
});

router.delete('/:id/comments/:commentId', async (req: Request, res: Response) => {
  try {
    const chart = await Chart.findByIdAndUpdate(
      req.params.id,
      { $pull: { comments: { id: req.params.commentId } } },
      { new: true },
    );

    if (!chart) {
      return res.status(404).json({ success: false, message: 'Chart not found.' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Chart comment delete error:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Unable to delete comment.' });
  }
});

export default router;
