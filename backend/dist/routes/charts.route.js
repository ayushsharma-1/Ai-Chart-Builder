"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const node_crypto_1 = require("node:crypto");
const chart_service_1 = require("../services/chart.service");
const llm_service_1 = require("../services/llm.service");
const Chart_1 = __importDefault(require("../models/Chart"));
const sql_service_1 = require("../services/sql.service");
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    try {
        const charts = await (0, chart_service_1.getAllCharts)();
        res.json({ success: true, charts });
    }
    catch (err) {
        console.error('Charts fetch error:', err?.message || err);
        res.status(500).json({ success: false, message: 'Unable to load saved charts.' });
    }
});
router.post('/', async (req, res) => {
    try {
        const chart = await (0, chart_service_1.saveChart)(req.body);
        res.json({ success: true, chart });
    }
    catch (err) {
        console.error('Chart save error:', err?.message || err);
        res.status(500).json({ success: false, message: 'Unable to save chart.' });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const chart = await (0, chart_service_1.getChart)(req.params.id);
        if (!chart) {
            return res.status(404).json({ success: false, message: 'Chart not found.' });
        }
        return res.json({ success: true, chart });
    }
    catch (err) {
        console.error('Chart fetch error:', err?.message || err);
        return res.status(500).json({ success: false, message: 'Unable to load chart.' });
    }
});
router.post('/:id/duplicate', async (req, res) => {
    try {
        const chart = await (0, chart_service_1.duplicateChart)(req.params.id);
        if (!chart) {
            return res.status(404).json({ success: false, message: 'Chart not found.' });
        }
        return res.json({ success: true, chart });
    }
    catch (err) {
        console.error('Chart duplicate error:', err?.message || err);
        return res.status(500).json({ success: false, message: 'Unable to duplicate chart.' });
    }
});
router.patch('/:id', async (req, res) => {
    try {
        const chart = await (0, chart_service_1.updateChart)(req.params.id, req.body);
        if (!chart) {
            return res.status(404).json({ success: false, message: 'Chart not found.' });
        }
        return res.json({ success: true, chart });
    }
    catch (err) {
        console.error('Chart update error:', err?.message || err);
        return res.status(500).json({ success: false, message: 'Unable to update chart.' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        await (0, chart_service_1.deleteChart)(req.params.id);
        res.json({ success: true });
    }
    catch (err) {
        console.error('Chart delete error:', err?.message || err);
        res.status(500).json({ success: false, message: 'Unable to delete chart.' });
    }
});
router.patch('/:id/position', async (req, res) => {
    try {
        const chart = await (0, chart_service_1.updateChartPosition)(req.params.id, req.body.gridPosition);
        res.json({ success: true, chart });
    }
    catch (err) {
        console.error('Chart position update error:', err?.message || err);
        res.status(500).json({ success: false, message: 'Unable to update chart position.' });
    }
});
router.post('/:id/explain', async (req, res) => {
    try {
        const chart = await Chart_1.default.findById(req.params.id);
        if (!chart) {
            return res.status(404).json({ success: false, message: 'Chart not found.' });
        }
        if (chart.aiExplanation) {
            return res.json({ success: true, explanation: chart.aiExplanation });
        }
        const explanation = await (0, llm_service_1.generateSqlExplanation)(chart.sql, chart.title);
        chart.aiExplanation = explanation;
        await chart.save();
        return res.json({ success: true, explanation });
    }
    catch (err) {
        console.error('Chart explain error:', err?.message || err);
        return res.status(500).json({ success: false, message: 'Unable to generate explanation.' });
    }
});
router.post('/:id/refresh', async (req, res) => {
    try {
        const chart = await Chart_1.default.findById(req.params.id);
        if (!chart) {
            return res.status(404).json({ success: false, message: 'Chart not found.' });
        }
        const result = await (0, sql_service_1.runQuery)(chart.sql, [], {
            ttlSeconds: 0,
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
    }
    catch (err) {
        console.error('Chart refresh error:', err?.message || err);
        return res.status(500).json({ success: false, message: 'Refresh failed.' });
    }
});
router.get('/:id/comments', async (req, res) => {
    try {
        const chart = await Chart_1.default.findById(req.params.id).select('comments');
        if (!chart) {
            return res.status(404).json({ success: false, message: 'Chart not found.' });
        }
        return res.json({ success: true, comments: chart.comments || [] });
    }
    catch (err) {
        console.error('Chart comments fetch error:', err?.message || err);
        return res.status(500).json({ success: false, message: 'Unable to load comments.' });
    }
});
router.post('/:id/comments', async (req, res) => {
    try {
        const chart = await Chart_1.default.findById(req.params.id);
        if (!chart) {
            return res.status(404).json({ success: false, message: 'Chart not found.' });
        }
        const content = String(req.body?.content || '').trim();
        const author = String(req.body?.author || 'Analyst').trim() || 'Analyst';
        if (!content) {
            return res.status(400).json({ success: false, message: 'Comment cannot be empty.' });
        }
        const comment = {
            id: (0, node_crypto_1.randomUUID)(),
            author,
            content,
            createdAt: new Date(),
            resolved: false,
        };
        chart.comments.push(comment);
        await chart.save();
        return res.json({ success: true, comment });
    }
    catch (err) {
        console.error('Chart comment create error:', err?.message || err);
        return res.status(500).json({ success: false, message: 'Unable to add comment.' });
    }
});
router.patch('/:id/comments/:commentId', async (req, res) => {
    try {
        const resolved = Boolean(req.body?.resolved);
        const result = await Chart_1.default.updateOne({ _id: req.params.id, 'comments.id': req.params.commentId }, { $set: { 'comments.$.resolved': resolved } });
        return res.json({ success: true, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
    }
    catch (err) {
        console.error('Chart comment update error:', err?.message || err);
        return res.status(500).json({ success: false, message: 'Unable to update comment.' });
    }
});
router.delete('/:id/comments/:commentId', async (req, res) => {
    try {
        const chart = await Chart_1.default.findByIdAndUpdate(req.params.id, { $pull: { comments: { id: req.params.commentId } } }, { new: true });
        if (!chart) {
            return res.status(404).json({ success: false, message: 'Chart not found.' });
        }
        return res.json({ success: true });
    }
    catch (err) {
        console.error('Chart comment delete error:', err?.message || err);
        return res.status(500).json({ success: false, message: 'Unable to delete comment.' });
    }
});
exports.default = router;
