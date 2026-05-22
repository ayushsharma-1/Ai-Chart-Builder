"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveChart = saveChart;
exports.getAllCharts = getAllCharts;
exports.getChart = getChart;
exports.deleteChart = deleteChart;
exports.updateChartPosition = updateChartPosition;
exports.updateChart = updateChart;
exports.duplicateChart = duplicateChart;
exports.attachChartToReport = attachChartToReport;
exports.detachChartFromReport = detachChartFromReport;
const Chart_1 = __importDefault(require("../models/Chart"));
const chartExplainability_1 = require("../utils/chartExplainability");
function normalizeChartConfig(payload) {
    const rawYAxis = payload.chartConfig?.yAxis;
    const yAxisList = Array.isArray(rawYAxis)
        ? rawYAxis.filter(Boolean)
        : [rawYAxis].filter(Boolean);
    const primaryYAxis = yAxisList[0] || '';
    const seriesKeys = payload.chartConfig?.seriesKeys?.length ? payload.chartConfig.seriesKeys : yAxisList.slice(0, 1);
    return {
        ...payload.chartConfig,
        yAxis: primaryYAxis,
        seriesKeys,
    };
}
function withExplainability(payload) {
    const chartConfig = payload.chartConfig ? normalizeChartConfig(payload) : payload.chartConfig;
    const explainability = (0, chartExplainability_1.buildChartExplainability)({
        title: payload.title,
        prompt: payload.prompt,
        sql: payload.sql,
        reasoning: payload.reasoning,
        chartType: payload.chartType,
        chartConfig,
    });
    return {
        ...payload,
        chartConfig,
        aiExplanation: payload.aiExplanation || explainability.aiExplanation,
        queryConfidence: payload.queryConfidence || explainability.queryConfidence,
        metricLineage: payload.metricLineage || explainability.metricLineage,
    };
}
async function saveChart(payload) {
    const chart = new Chart_1.default(withExplainability(payload));
    return chart.save();
}
async function getAllCharts() {
    return Chart_1.default.find().sort({ createdAt: -1 });
}
async function getChart(id) {
    return Chart_1.default.findById(id);
}
async function deleteChart(id) {
    return Chart_1.default.findByIdAndDelete(id);
}
async function updateChartPosition(id, gridPosition) {
    return Chart_1.default.findByIdAndUpdate(id, { gridPosition }, { new: true });
}
async function updateChart(id, payload) {
    const existing = await Chart_1.default.findById(id).lean();
    if (!existing) {
        return null;
    }
    const merged = {
        title: payload.title ?? existing.title,
        prompt: payload.prompt ?? existing.prompt,
        sql: payload.sql ?? existing.sql,
        reasoning: payload.reasoning ?? existing.reasoning,
        aiExplanation: payload.aiExplanation,
        queryConfidence: payload.queryConfidence,
        metricLineage: payload.metricLineage,
        chartType: payload.chartType ?? existing.chartType,
        chartConfig: payload.chartConfig ?? existing.chartConfig,
        dataSnapshot: payload.dataSnapshot ?? existing.dataSnapshot,
        gridPosition: payload.gridPosition ?? existing.gridPosition,
        executionMetadata: payload.executionMetadata ?? existing.executionMetadata,
    };
    return Chart_1.default.findByIdAndUpdate(id, withExplainability(merged), { new: true, runValidators: true });
}
async function duplicateChart(id) {
    const chart = await Chart_1.default.findById(id).lean();
    if (!chart) {
        return null;
    }
    const { _id, createdAt, updatedAt, reportIds, ...copy } = chart;
    return new Chart_1.default({
        ...copy,
        title: `${chart.title} copy`,
        reportIds: [],
    }).save();
}
async function attachChartToReport(chartId, reportId) {
    return Chart_1.default.findByIdAndUpdate(chartId, { $addToSet: { reportIds: reportId } }, { new: true });
}
async function detachChartFromReport(chartId, reportId) {
    return Chart_1.default.findByIdAndUpdate(chartId, { $pull: { reportIds: reportId } }, { new: true });
}
