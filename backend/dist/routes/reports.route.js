"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const report_service_1 = require("../services/report.service");
const router = (0, express_1.Router)();
const LayoutSchema = zod_1.z.object({
    x: zod_1.z.number().int().min(0),
    y: zod_1.z.number().int().min(0),
    w: zod_1.z.number().int().min(1),
    h: zod_1.z.number().int().min(1),
});
const FilterSchema = zod_1.z.object({
    id: zod_1.z.string(),
    label: zod_1.z.string(),
    field: zod_1.z.string(),
    type: zod_1.z.enum(['dateRange', 'select', 'text']),
    operator: zod_1.z.enum(['equals', 'contains', 'between', 'gte', 'lte']),
    value: zod_1.z.any().optional(),
    enabled: zod_1.z.boolean(),
});
const CreateReportSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(120),
    description: zod_1.z.string().max(500).optional(),
    owner: zod_1.z.string().max(120).optional(),
    visibility: zod_1.z.enum(['private', 'internal', 'public']).optional(),
    charts: zod_1.z.array(zod_1.z.object({
        chartId: zod_1.z.string(),
        layout: LayoutSchema.optional(),
    })).optional(),
});
const UpdateReportSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(120).optional(),
    description: zod_1.z.string().max(500).optional(),
    owner: zod_1.z.string().max(120).optional(),
    visibility: zod_1.z.enum(['private', 'internal', 'public']).optional(),
    filters: zod_1.z.array(FilterSchema).optional(),
    layout: zod_1.z.record(zod_1.z.unknown()).optional(),
    refreshPolicy: zod_1.z.object({
        mode: zod_1.z.enum(['manual', 'scheduled']),
        intervalMinutes: zod_1.z.number().int().min(1).optional(),
        staleAfterSeconds: zod_1.z.number().int().min(30).max(86400),
    }).optional(),
});
function handleReportError(res, error, fallback) {
    const err = error;
    const isValidation = err?.name === 'ZodError';
    let status = 500;
    if (/not found/i.test(err?.message || '')) {
        status = 404;
    }
    else if (/share|access|token/i.test(err?.message || '')) {
        status = 403;
    }
    else if (isValidation) {
        status = 400;
    }
    console.error('Report route error:', err?.message || err);
    return res.status(status).json({
        success: false,
        message: isValidation ? 'Invalid report payload.' : err?.message || fallback,
    });
}
router.get('/', async (_req, res) => {
    try {
        const reports = await (0, report_service_1.listReports)();
        return res.json({ success: true, reports });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to load reports.');
    }
});
router.post('/', async (req, res) => {
    try {
        const payload = CreateReportSchema.parse(req.body);
        const report = await (0, report_service_1.createReport)(payload);
        return res.status(201).json({ success: true, report });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to create report.');
    }
});
router.get('/:id', async (req, res) => {
    try {
        const report = await (0, report_service_1.getReport)(req.params.id, {
            shareToken: typeof req.query.shareToken === 'string' ? req.query.shareToken : undefined,
            requireEdit: req.query.mode === 'edit',
        });
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found.' });
        }
        return res.json({ success: true, report });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to load report.');
    }
});
router.patch('/:id', async (req, res) => {
    try {
        const payload = UpdateReportSchema.parse(req.body);
        const report = await (0, report_service_1.updateReport)(req.params.id, payload);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found.' });
        }
        return res.json({ success: true, report });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to update report.');
    }
});
router.delete('/:id', async (req, res) => {
    try {
        await (0, report_service_1.deleteReport)(req.params.id);
        return res.json({ success: true });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to delete report.');
    }
});
router.post('/:id/duplicate', async (req, res) => {
    try {
        const report = await (0, report_service_1.duplicateReport)(req.params.id);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found.' });
        }
        return res.json({ success: true, report });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to duplicate report.');
    }
});
router.post('/:id/charts', async (req, res) => {
    try {
        const { chartId } = zod_1.z.object({ chartId: zod_1.z.string() }).parse(req.body);
        const report = await (0, report_service_1.addChartToReport)(req.params.id, chartId);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report or chart not found.' });
        }
        return res.json({ success: true, report });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to add chart to report.');
    }
});
router.delete('/:id/charts/:chartId', async (req, res) => {
    try {
        const report = await (0, report_service_1.removeChartFromReport)(req.params.id, req.params.chartId);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found.' });
        }
        return res.json({ success: true, report });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to remove chart from report.');
    }
});
router.patch('/:id/charts/:chartId/layout', async (req, res) => {
    try {
        const layout = LayoutSchema.parse(req.body.layout);
        const report = await (0, report_service_1.updateReportChartLayout)(req.params.id, req.params.chartId, layout);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report chart not found.' });
        }
        return res.json({ success: true, report });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to update chart layout.');
    }
});
router.patch('/:id/layout', async (req, res) => {
    try {
        const payload = zod_1.z.object({
            layout: zod_1.z.array(zod_1.z.object({
                chartId: zod_1.z.string(),
                gridPosition: LayoutSchema,
            })),
        }).parse(req.body);
        const report = await (0, report_service_1.updateReportLayout)(req.params.id, payload.layout);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found.' });
        }
        return res.json({ success: true, report });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to update report layout.');
    }
});
router.post('/:id/share', async (req, res) => {
    try {
        const { enabled } = zod_1.z.object({ enabled: zod_1.z.boolean().default(true) }).parse(req.body);
        const report = await (0, report_service_1.enableReportShare)(req.params.id, enabled);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found.' });
        }
        return res.json({ success: true, report });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to update share settings.');
    }
});
router.post('/:id/refresh', async (req, res) => {
    try {
        const payload = zod_1.z.object({
            filters: zod_1.z.array(FilterSchema).optional(),
            persistSnapshots: zod_1.z.boolean().optional(),
        }).parse(req.body);
        const result = await (0, report_service_1.refreshReportCharts)(req.params.id, payload.filters, { persistSnapshots: payload.persistSnapshots });
        if (!result) {
            return res.status(404).json({ success: false, message: 'Report not found.' });
        }
        return res.json({ success: true, ...result });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to refresh report.');
    }
});
router.post('/:id/insights', async (req, res) => {
    try {
        const report = await (0, report_service_1.generateReportSummary)(req.params.id);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found.' });
        }
        return res.json({ success: true, report });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to generate report insights.');
    }
});
router.post('/:id/comments', async (req, res) => {
    try {
        const payload = zod_1.z.object({
            author: zod_1.z.string().optional(),
            body: zod_1.z.string().trim().min(1).max(1000),
            chartId: zod_1.z.string().optional(),
        }).parse(req.body);
        const report = await (0, report_service_1.addReportComment)(req.params.id, payload);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found.' });
        }
        return res.json({ success: true, report });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to add comment.');
    }
});
router.post('/:id/versions/:version/restore', async (req, res) => {
    try {
        const version = Number.parseInt(req.params.version, 10);
        const report = await (0, report_service_1.restoreReportVersion)(req.params.id, version);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found.' });
        }
        return res.json({ success: true, report });
    }
    catch (error) {
        return handleReportError(res, error, 'Unable to restore report version.');
    }
});
exports.default = router;
