"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listReports = listReports;
exports.createReport = createReport;
exports.getReport = getReport;
exports.updateReport = updateReport;
exports.deleteReport = deleteReport;
exports.duplicateReport = duplicateReport;
exports.addChartToReport = addChartToReport;
exports.removeChartFromReport = removeChartFromReport;
exports.updateReportChartLayout = updateReportChartLayout;
exports.updateReportLayout = updateReportLayout;
exports.enableReportShare = enableReportShare;
exports.addReportComment = addReportComment;
exports.restoreReportVersion = restoreReportVersion;
exports.refreshReportCharts = refreshReportCharts;
exports.generateReportSummary = generateReportSummary;
const node_crypto_1 = require("node:crypto");
const Chart_1 = __importDefault(require("../models/Chart"));
const Report_1 = __importStar(require("../models/Report"));
const filter_service_1 = require("./filter.service");
const chart_service_1 = require("./chart.service");
const llm_service_1 = require("./llm.service");
const sql_service_1 = require("./sql.service");
function serializeSnapshot(report) {
    const object = report.toObject();
    const { versions, ...snapshot } = object;
    return snapshot;
}
async function appendVersion(report, reason, actor = 'system') {
    const version = (report.versions?.length || 0) + 1;
    report.versions.push({
        version,
        actor,
        reason,
        snapshot: serializeSnapshot(report),
        createdAt: new Date(),
    });
}
async function hydrateReport(report) {
    const chartRefs = report.charts || [];
    const chartIds = chartRefs.map((ref) => ref.chartId);
    const charts = await Chart_1.default.find({ _id: { $in: chartIds } }).lean();
    const chartById = new Map(charts.map((chart) => [String(chart._id), chart]));
    return {
        ...report,
        charts: chartRefs
            .map((ref) => {
            const chart = chartById.get(String(ref.chartId));
            if (!chart) {
                return null;
            }
            return {
                ...chart,
                reportLayout: ref.layout,
                addedAt: ref.addedAt,
            };
        })
            .filter(Boolean),
    };
}
function normalizeFilters(filters) {
    return Array.isArray(filters) && filters.length > 0 ? filters : Report_1.DEFAULT_REPORT_FILTERS;
}
function getNextReportLayout(report, preferredWidth = 6) {
    if (!report.charts.length) {
        return { x: 0, y: 0, w: preferredWidth, h: 4 };
    }
    const lowestPoint = report.charts.reduce((max, ref) => {
        const layout = ref.layout || { y: 0, h: 4 };
        return Math.max(max, Number(layout.y || 0) + Number(layout.h || 4));
    }, 0);
    const nextIndex = report.charts.length;
    return {
        x: nextIndex % 2 === 0 ? 0 : 6,
        y: lowestPoint,
        w: preferredWidth,
        h: 4,
    };
}
async function listReports() {
    return Report_1.default.find().select('-versions.snapshot').sort({ updatedAt: -1 }).lean();
}
async function createReport(payload) {
    const report = new Report_1.default({
        title: payload.title || 'Untitled report',
        description: payload.description || '',
        owner: payload.owner || 'analytics',
        charts: [],
        filters: normalizeFilters(payload.filters),
        visibility: payload.visibility || 'private',
    });
    (payload.charts || []).forEach((chartRef) => {
        report.charts.push({
            chartId: chartRef.chartId,
            layout: chartRef.layout || getNextReportLayout(report),
            addedAt: chartRef.addedAt || new Date(),
        });
    });
    await report.save();
    await Promise.all((report.charts || []).map((chartRef) => (0, chart_service_1.attachChartToReport)(String(chartRef.chartId), String(report._id))));
    return hydrateReport(report.toObject());
}
async function getReport(id, options = {}) {
    const report = await Report_1.default.findById(id).lean();
    if (!report) {
        return null;
    }
    const shareAccessAllowed = Boolean(report.share?.enabled &&
        report.share?.token &&
        options.shareToken &&
        report.share.token === options.shareToken &&
        (!report.share.expiresAt || new Date(report.share.expiresAt).getTime() > Date.now()));
    if (options.shareToken && !shareAccessAllowed) {
        throw new Error('Invalid or expired share token.');
    }
    if (options.shareToken && options.requireEdit) {
        throw new Error('Shared report links are read-only.');
    }
    const hydrated = await hydrateReport(report);
    return {
        ...hydrated,
        access: {
            mode: options.requireEdit ? 'edit' : 'view',
            source: options.shareToken ? 'share' : 'internal',
            canEdit: !options.shareToken && Boolean(options.requireEdit),
            canFilter: !options.shareToken || report.share?.allowFilters !== false,
            canShare: !options.shareToken,
        },
    };
}
async function updateReport(id, payload, reason = 'report update') {
    const report = await Report_1.default.findById(id);
    if (!report) {
        return null;
    }
    await appendVersion(report, reason, payload.owner || 'analytics');
    if (payload.title !== undefined)
        report.title = payload.title;
    if (payload.description !== undefined)
        report.description = payload.description;
    if (payload.owner !== undefined)
        report.owner = payload.owner;
    if (payload.filters !== undefined)
        report.filters = payload.filters;
    if (payload.visibility !== undefined)
        report.visibility = payload.visibility;
    if (payload.layout !== undefined)
        report.layout = payload.layout;
    if (payload.refreshPolicy !== undefined)
        report.refreshPolicy = payload.refreshPolicy;
    await report.save();
    return hydrateReport(report.toObject());
}
async function deleteReport(id) {
    const report = await Report_1.default.findByIdAndDelete(id);
    if (report) {
        await Promise.all((report.charts || []).map((chartRef) => (0, chart_service_1.detachChartFromReport)(String(chartRef.chartId), id)));
    }
    return report;
}
async function duplicateReport(id) {
    const report = await Report_1.default.findById(id).lean();
    if (!report) {
        return null;
    }
    const copy = new Report_1.default({
        ...report,
        _id: undefined,
        title: `${report.title} copy`,
        visibility: 'private',
        share: { enabled: false, allowFilters: true },
        versions: [],
        createdAt: undefined,
        updatedAt: undefined,
    });
    await copy.save();
    await Promise.all((copy.charts || []).map((chartRef) => (0, chart_service_1.attachChartToReport)(String(chartRef.chartId), String(copy._id))));
    return hydrateReport(copy.toObject());
}
async function addChartToReport(reportId, chartId) {
    const report = await Report_1.default.findById(reportId);
    const chart = await Chart_1.default.findById(chartId);
    if (!report || !chart) {
        return null;
    }
    await appendVersion(report, 'chart added');
    const exists = report.charts.some((ref) => String(ref.chartId) === chartId);
    if (!exists) {
        report.charts.push({
            chartId: chart._id,
            layout: getNextReportLayout(report, Math.min(Math.max(chart.gridPosition?.w || 6, 3), 12)),
            addedAt: new Date(),
        });
    }
    await report.save();
    await (0, chart_service_1.attachChartToReport)(chartId, reportId);
    return hydrateReport(report.toObject());
}
async function removeChartFromReport(reportId, chartId) {
    const report = await Report_1.default.findById(reportId);
    if (!report) {
        return null;
    }
    await appendVersion(report, 'chart removed');
    report.charts = report.charts.filter((ref) => String(ref.chartId) !== chartId);
    await report.save();
    await (0, chart_service_1.detachChartFromReport)(chartId, reportId);
    return hydrateReport(report.toObject());
}
async function updateReportChartLayout(reportId, chartId, layout) {
    const report = await Report_1.default.findOneAndUpdate({ _id: reportId, 'charts.chartId': chartId }, { $set: { 'charts.$.layout': layout } }, { new: true }).lean();
    return report ? hydrateReport(report) : null;
}
async function updateReportLayout(reportId, layout) {
    const report = await Report_1.default.findById(reportId);
    if (!report) {
        return null;
    }
    const layoutByChartId = new Map(layout.map((entry) => [String(entry.chartId), entry.gridPosition]));
    report.charts = report.charts.map((entry) => {
        const nextLayout = layoutByChartId.get(String(entry.chartId));
        if (nextLayout) {
            entry.layout = nextLayout;
        }
        return entry;
    });
    await report.save();
    return hydrateReport(report.toObject());
}
async function enableReportShare(reportId, enabled = true) {
    const report = await Report_1.default.findById(reportId);
    if (!report) {
        return null;
    }
    await appendVersion(report, enabled ? 'share enabled' : 'share disabled');
    report.share.enabled = enabled;
    report.share.allowFilters = true;
    report.share.token = enabled ? report.share.token || (0, node_crypto_1.randomBytes)(24).toString('hex') : report.share.token;
    report.share.createdAt = enabled ? report.share.createdAt || new Date() : report.share.createdAt;
    report.visibility = enabled ? 'public' : 'private';
    await report.save();
    return hydrateReport(report.toObject());
}
async function addReportComment(reportId, payload) {
    const report = await Report_1.default.findById(reportId);
    if (!report) {
        return null;
    }
    report.comments.push({
        id: (0, node_crypto_1.randomUUID)(),
        author: payload.author || 'analytics',
        body: payload.body,
        chartId: payload.chartId,
        createdAt: new Date(),
    });
    await report.save();
    return hydrateReport(report.toObject());
}
async function restoreReportVersion(reportId, version) {
    const report = await Report_1.default.findById(reportId);
    if (!report) {
        return null;
    }
    const versionRecord = report.versions.find((entry) => entry.version === version);
    if (!versionRecord) {
        throw new Error('Version not found.');
    }
    await appendVersion(report, `restore version ${version}`);
    const snapshot = versionRecord.snapshot;
    report.title = snapshot.title || report.title;
    report.description = snapshot.description || '';
    report.owner = snapshot.owner || report.owner;
    report.charts = snapshot.charts || report.charts;
    report.layout = snapshot.layout || {};
    report.filters = snapshot.filters || Report_1.DEFAULT_REPORT_FILTERS;
    report.visibility = snapshot.visibility || 'private';
    report.share = snapshot.share || report.share;
    report.aiSummary = snapshot.aiSummary || report.aiSummary;
    report.refreshPolicy = snapshot.refreshPolicy || report.refreshPolicy;
    await report.save();
    return hydrateReport(report.toObject());
}
async function refreshReportCharts(reportId, filters, options = {}) {
    const report = await Report_1.default.findById(reportId);
    if (!report) {
        return null;
    }
    const reportFilters = filters || report.filters || [];
    const chartIds = report.charts.map((ref) => ref.chartId);
    const charts = await Chart_1.default.find({ _id: { $in: chartIds } });
    const results = [];
    const refreshedSnapshots = new Map();
    const persistSnapshots = options.persistSnapshots !== false;
    for (const chart of charts) {
        try {
            const filtered = (0, filter_service_1.applyDashboardFilters)(chart.sql, reportFilters);
            const result = await (0, sql_service_1.runQuery)(filtered.sql, filtered.params, {
                cacheKey: `${String(chart._id)}:${(0, node_crypto_1.createHash)('sha1').update(JSON.stringify(reportFilters)).digest('hex')}`,
                ttlSeconds: report.refreshPolicy?.staleAfterSeconds || 300,
                staleWhileRevalidateSeconds: 60,
            });
            const executionMetadata = {
                rowCount: result.rowCount,
                queryDurationMs: result.executionTimeMs,
                lastRunAt: new Date(),
                cacheStatus: result.cacheStatus || 'miss',
            };
            if (persistSnapshots) {
                chart.dataSnapshot = result.data;
                chart.executionMetadata = executionMetadata;
                await chart.save();
            }
            else {
                refreshedSnapshots.set(String(chart._id), {
                    dataSnapshot: result.data,
                    executionMetadata,
                });
            }
            results.push({
                chartId: chart._id,
                title: chart.title,
                success: true,
                appliedFilterCount: filtered.appliedFilterCount,
                appliedFilters: filtered.appliedFilters,
                skippedFilters: filtered.skippedFilters,
                projectedAliases: filtered.projectedAliases,
            });
        }
        catch (error) {
            results.push({ chartId: chart._id, title: chart.title, success: false, message: error?.message || 'Refresh failed' });
        }
    }
    const hydratedReport = await getReport(reportId);
    if (hydratedReport && !persistSnapshots) {
        hydratedReport.charts = (hydratedReport.charts || []).map((chart) => {
            const refreshed = refreshedSnapshots.get(String(chart._id));
            if (!refreshed) {
                return chart;
            }
            return {
                ...chart,
                dataSnapshot: refreshed.dataSnapshot,
                executionMetadata: refreshed.executionMetadata,
            };
        });
    }
    return {
        report: hydratedReport,
        results,
    };
}
function fallbackInsights(reportTitle, charts) {
    const insights = charts.slice(0, 4).map((chart) => ({
        id: (0, node_crypto_1.randomUUID)(),
        type: 'metric',
        title: chart.title,
        detail: `${chart.dataSnapshot?.length || 0} rows are currently captured for this widget.`,
        severity: 'info',
        chartId: chart._id,
    }));
    return {
        summary: `${reportTitle} contains ${charts.length} charts with the latest saved query snapshots.`,
        insights,
    };
}
async function generateReportSummary(reportId) {
    const report = await Report_1.default.findById(reportId);
    if (!report) {
        return null;
    }
    const hydrated = await hydrateReport(report.toObject());
    const charts = hydrated.charts || [];
    const sourceHash = (0, node_crypto_1.createHash)('sha1').update(JSON.stringify(charts.map((chart) => ({
        id: chart._id,
        updatedAt: chart.updatedAt,
        rowCount: chart.dataSnapshot?.length || 0,
    })))).digest('hex');
    if (report.aiSummary?.status === 'ready' && report.aiSummary.sourceHash === sourceHash) {
        return hydrateReport(report.toObject());
    }
    report.aiSummary.status = 'generating';
    await report.save();
    let generated;
    try {
        generated = await (0, llm_service_1.generateDashboardInsights)(report.title, charts.map((chart) => ({
            id: String(chart._id),
            title: chart.title,
            chartType: chart.chartType,
            rowCount: chart.dataSnapshot?.length || 0,
            xAxis: chart.chartConfig?.xAxis,
            yAxis: chart.chartConfig?.yAxis,
            sampleRows: (chart.dataSnapshot || []).slice(0, 8),
        })));
    }
    catch (error) {
        console.warn('[Report] Falling back to local insights:', error?.message || error);
        generated = fallbackInsights(report.title, charts);
    }
    report.aiSummary = {
        status: 'ready',
        summary: generated.summary,
        insights: generated.insights.map((insight) => ({
            ...insight,
            id: (0, node_crypto_1.randomUUID)(),
            chartId: insight.chartId,
        })),
        generatedAt: new Date(),
        sourceHash,
    };
    await report.save();
    return hydrateReport(report.toObject());
}
