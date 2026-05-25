import { Router, Request, Response } from 'express';
import { z } from 'zod';

import {
  addChartToReport,
  addReportComment,
  createReport,
  deleteReport,
  duplicateReport,
  enableReportShare,
  generateReportSummary,
  getReport,
  listReports,
  refreshReportCharts,
  removeChartFromReport,
  restoreReportVersion,
  updateReport,
  updateReportLayout,
  updateReportChartLayout,
} from '../services/report.service';

const router = Router();

const LayoutSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});

const CreateReportSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  owner: z.string().max(120).optional(),
  visibility: z.enum(['private', 'internal', 'public']).optional(),
  charts: z.array(z.object({
    chartId: z.string(),
    layout: LayoutSchema.optional(),
  })).optional(),
});

const UpdateReportSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  owner: z.string().max(120).optional(),
  visibility: z.enum(['private', 'internal', 'public']).optional(),
  layout: z.record(z.unknown()).optional(),
  refreshPolicy: z.object({
    mode: z.enum(['manual', 'scheduled']),
    intervalMinutes: z.number().int().min(1).optional(),
    staleAfterSeconds: z.number().int().min(30).max(86400),
  }).optional(),
});

function handleReportError(res: Response, error: unknown, fallback: string) {
  const err = error as any;
  const isValidation = err?.name === 'ZodError';
  let status = 500;

  if (/not found/i.test(err?.message || '')) {
    status = 404;
  } else if (/share|access|token/i.test(err?.message || '')) {
    status = 403;
  } else if (isValidation) {
    status = 400;
  }

  console.error('Report route error:', err?.message || err);
  return res.status(status).json({
    success: false,
    message: isValidation ? 'Invalid report payload.' : err?.message || fallback,
  });
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const reports = await listReports();
    return res.json({ success: true, reports });
  } catch (error) {
    return handleReportError(res, error, 'Unable to load reports.');
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const payload = CreateReportSchema.parse(req.body);
    const report = await createReport(payload as any);
    return res.status(201).json({ success: true, report });
  } catch (error) {
    return handleReportError(res, error, 'Unable to create report.');
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const report = await getReport(req.params.id, {
      shareToken: typeof req.query.shareToken === 'string' ? req.query.shareToken : undefined,
      requireEdit: req.query.mode === 'edit',
    });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.json({ success: true, report });
  } catch (error) {
    return handleReportError(res, error, 'Unable to load report.');
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const payload = UpdateReportSchema.parse(req.body);
    const report = await updateReport(req.params.id, payload as any);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.json({ success: true, report });
  } catch (error) {
    return handleReportError(res, error, 'Unable to update report.');
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteReport(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    return handleReportError(res, error, 'Unable to delete report.');
  }
});

router.post('/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const report = await duplicateReport(req.params.id);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.json({ success: true, report });
  } catch (error) {
    return handleReportError(res, error, 'Unable to duplicate report.');
  }
});

router.post('/:id/charts', async (req: Request, res: Response) => {
  try {
    const { chartId } = z.object({ chartId: z.string() }).parse(req.body);
    const report = await addChartToReport(req.params.id, chartId);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report or chart not found.' });
    }

    return res.json({ success: true, report });
  } catch (error) {
    return handleReportError(res, error, 'Unable to add chart to report.');
  }
});

router.delete('/:id/charts/:chartId', async (req: Request, res: Response) => {
  try {
    const report = await removeChartFromReport(req.params.id, req.params.chartId);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.json({ success: true, report });
  } catch (error) {
    return handleReportError(res, error, 'Unable to remove chart from report.');
  }
});

router.patch('/:id/charts/:chartId/layout', async (req: Request, res: Response) => {
  try {
    const layout = LayoutSchema.parse(req.body.layout);
    const report = await updateReportChartLayout(req.params.id, req.params.chartId, layout);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report chart not found.' });
    }

    return res.json({ success: true, report });
  } catch (error) {
    return handleReportError(res, error, 'Unable to update chart layout.');
  }
});

router.patch('/:id/layout', async (req: Request, res: Response) => {
  try {
    const payload = z.object({
      layout: z.array(z.object({
        chartId: z.string(),
        gridPosition: LayoutSchema,
      })),
    }).parse(req.body);

    const report = await updateReportLayout(req.params.id, payload.layout);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.json({ success: true, report });
  } catch (error) {
    return handleReportError(res, error, 'Unable to update report layout.');
  }
});

router.post('/:id/share', async (req: Request, res: Response) => {
  try {
    const { enabled } = z.object({ enabled: z.boolean().default(true) }).parse(req.body);
    const report = await enableReportShare(req.params.id, enabled);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.json({ success: true, report });
  } catch (error) {
    return handleReportError(res, error, 'Unable to update share settings.');
  }
});

router.post('/:id/refresh', async (req: Request, res: Response) => {
  try {
    const payload = z.object({
      persistSnapshots: z.boolean().optional(),
      accountId: z.string().regex(/^\d+$/, 'accountId must be a numeric string').min(1),
    }).parse(req.body);
    const result = await refreshReportCharts(req.params.id, {
      persistSnapshots: payload.persistSnapshots,
      accountId: payload.accountId,
    });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.json({ success: true, ...result });
  } catch (error) {
    return handleReportError(res, error, 'Unable to refresh report.');
  }
});

router.post('/:id/insights', async (req: Request, res: Response) => {
  try {
    const report = await generateReportSummary(req.params.id);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.json({ success: true, report });
  } catch (error) {
    return handleReportError(res, error, 'Unable to generate report insights.');
  }
});

router.post('/:id/comments', async (req: Request, res: Response) => {
  try {
    const payload = z.object({
      author: z.string().optional(),
      body: z.string().trim().min(1).max(1000),
      chartId: z.string().optional(),
    }).parse(req.body);
    const report = await addReportComment(req.params.id, payload);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.json({ success: true, report });
  } catch (error) {
    return handleReportError(res, error, 'Unable to add comment.');
  }
});

router.post('/:id/versions/:version/restore', async (req: Request, res: Response) => {
  try {
    const version = Number.parseInt(req.params.version, 10);
    const report = await restoreReportVersion(req.params.id, version);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.json({ success: true, report });
  } catch (error) {
    return handleReportError(res, error, 'Unable to restore report version.');
  }
});

export default router;
