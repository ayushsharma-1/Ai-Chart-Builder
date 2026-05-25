import { createHash, randomBytes, randomUUID } from 'node:crypto';

import Chart from '../models/Chart';
import Report, { IReport } from '../models/Report';
import { attachChartToReport, detachChartFromReport } from './chart.service';
import { generateDashboardInsights } from './llm.service';
import { runQuery } from './sql.service';

function serializeSnapshot(report: IReport) {
  const object = report.toObject();
  const { versions, ...snapshot } = object;

  return snapshot;
}

async function appendVersion(report: IReport, reason: string, actor = 'system') {
  const version = (report.versions?.length || 0) + 1;

  report.versions.push({
    version,
    actor,
    reason,
    snapshot: serializeSnapshot(report),
    createdAt: new Date(),
  });
}

async function hydrateReport(report: any) {
  const chartRefs = report.charts || [];
  const chartIds = chartRefs.map((ref: any) => ref.chartId);
  const charts = await Chart.find({ _id: { $in: chartIds } }).lean();
  const chartById = new Map(charts.map((chart: any) => [String(chart._id), chart]));

  return {
    ...report,
    charts: chartRefs
      .map((ref: any) => {
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

function getNextReportLayout(report: IReport, preferredWidth = 6) {
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

export async function listReports() {
  return Report.find().select('-versions.snapshot').sort({ updatedAt: -1 }).lean();
}

export async function createReport(payload: Partial<IReport>) {
  const report = new Report({
    title: payload.title || 'Untitled report',
    description: payload.description || '',
    owner: payload.owner || 'analytics',
    charts: [],
    visibility: payload.visibility || 'private',
  });

  (payload.charts || []).forEach((chartRef: any) => {
    report.charts.push({
      chartId: chartRef.chartId,
      layout: chartRef.layout || getNextReportLayout(report),
      addedAt: chartRef.addedAt || new Date(),
    });
  });

  await report.save();

  await Promise.all((report.charts || []).map((chartRef) => attachChartToReport(String(chartRef.chartId), String(report._id))));

  return hydrateReport(report.toObject());
}

export async function getReport(id: string, options: { shareToken?: string; requireEdit?: boolean } = {}) {
  const report = await Report.findById(id).lean();

  if (!report) {
    return null;
  }

  const shareAccessAllowed = Boolean(
    report.share?.enabled &&
    report.share?.token &&
    options.shareToken &&
    report.share.token === options.shareToken &&
    (!report.share.expiresAt || new Date(report.share.expiresAt).getTime() > Date.now()),
  );

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
      canShare: !options.shareToken,
    },
  };
}

export async function updateReport(id: string, payload: Partial<IReport>, reason = 'report update') {
  const report = await Report.findById(id);

  if (!report) {
    return null;
  }

  await appendVersion(report, reason, payload.owner || 'analytics');

  if (payload.title !== undefined) report.title = payload.title;
  if (payload.description !== undefined) report.description = payload.description;
  if (payload.owner !== undefined) report.owner = payload.owner;
  if (payload.visibility !== undefined) report.visibility = payload.visibility;
  if (payload.layout !== undefined) report.layout = payload.layout;
  if (payload.refreshPolicy !== undefined) report.refreshPolicy = payload.refreshPolicy as any;

  await report.save();

  return hydrateReport(report.toObject());
}

export async function deleteReport(id: string) {
  const report = await Report.findByIdAndDelete(id);

  if (report) {
    await Promise.all((report.charts || []).map((chartRef) => detachChartFromReport(String(chartRef.chartId), id)));
  }

  return report;
}

export async function duplicateReport(id: string) {
  const report = await Report.findById(id).lean();

  if (!report) {
    return null;
  }

  const copy = new Report({
    ...report,
    _id: undefined,
    title: `${report.title} copy`,
    visibility: 'private',
    share: { enabled: false },
    versions: [],
    createdAt: undefined,
    updatedAt: undefined,
  });

  await copy.save();
  await Promise.all((copy.charts || []).map((chartRef) => attachChartToReport(String(chartRef.chartId), String(copy._id))));

  return hydrateReport(copy.toObject());
}

export async function addChartToReport(reportId: string, chartId: string) {
  const report = await Report.findById(reportId);
  const chart = await Chart.findById(chartId);

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
  await attachChartToReport(chartId, reportId);

  return hydrateReport(report.toObject());
}

export async function removeChartFromReport(reportId: string, chartId: string) {
  const report = await Report.findById(reportId);

  if (!report) {
    return null;
  }

  await appendVersion(report, 'chart removed');
  report.charts = report.charts.filter((ref) => String(ref.chartId) !== chartId) as any;
  await report.save();
  await detachChartFromReport(chartId, reportId);

  return hydrateReport(report.toObject());
}

export async function updateReportChartLayout(reportId: string, chartId: string, layout: { x: number; y: number; w: number; h: number }) {
  const report = await Report.findOneAndUpdate(
    { _id: reportId, 'charts.chartId': chartId },
    { $set: { 'charts.$.layout': layout } },
    { new: true },
  ).lean();

  return report ? hydrateReport(report) : null;
}

export async function updateReportLayout(reportId: string, layout: { chartId: string; gridPosition: { x: number; y: number; w: number; h: number } }[]) {
  const report = await Report.findById(reportId);

  if (!report) {
    return null;
  }

  const layoutByChartId = new Map(layout.map((entry) => [String(entry.chartId), entry.gridPosition]));

  report.charts = report.charts.map((entry) => {
    const nextLayout = layoutByChartId.get(String(entry.chartId));

    if (nextLayout) {
      entry.layout = nextLayout as any;
    }

    return entry;
  });

  await report.save();

  return hydrateReport(report.toObject());
}

export async function enableReportShare(reportId: string, enabled = true) {
  const report = await Report.findById(reportId);

  if (!report) {
    return null;
  }

  await appendVersion(report, enabled ? 'share enabled' : 'share disabled');

  report.share.enabled = enabled;
  report.share.token = enabled ? report.share.token || randomBytes(24).toString('hex') : report.share.token;
  report.share.createdAt = enabled ? report.share.createdAt || new Date() : report.share.createdAt;
  report.visibility = enabled ? 'public' : 'private';

  await report.save();

  return hydrateReport(report.toObject());
}

export async function addReportComment(reportId: string, payload: { author?: string; body: string; chartId?: string }) {
  const report = await Report.findById(reportId);

  if (!report) {
    return null;
  }

  report.comments.push({
    id: randomUUID(),
    author: payload.author || 'analytics',
    body: payload.body,
    chartId: payload.chartId as any,
    createdAt: new Date(),
  });

  await report.save();

  return hydrateReport(report.toObject());
}

export async function restoreReportVersion(reportId: string, version: number) {
  const report = await Report.findById(reportId);

  if (!report) {
    return null;
  }

  const versionRecord = report.versions.find((entry) => entry.version === version);

  if (!versionRecord) {
    throw new Error('Version not found.');
  }

  await appendVersion(report, `restore version ${version}`);

  const snapshot = versionRecord.snapshot as any;
  report.title = snapshot.title || report.title;
  report.description = snapshot.description || '';
  report.owner = snapshot.owner || report.owner;
  report.charts = snapshot.charts || report.charts;
  report.layout = snapshot.layout || {};
  report.visibility = snapshot.visibility || 'private';
  report.share = snapshot.share || report.share;
  report.aiSummary = snapshot.aiSummary || report.aiSummary;
  report.refreshPolicy = snapshot.refreshPolicy || report.refreshPolicy;

  await report.save();

  return hydrateReport(report.toObject());
}

export async function refreshReportCharts(reportId: string, options: { persistSnapshots?: boolean; accountId: string }) {
  const report = await Report.findById(reportId);

  if (!report) {
    return null;
  }

  const chartIds = report.charts.map((ref) => ref.chartId);
  const charts = await Chart.find({ _id: { $in: chartIds } });
  const results = [];
  const refreshedSnapshots = new Map<string, { dataSnapshot: unknown[]; executionMetadata: Record<string, unknown> }>();
  const persistSnapshots = options.persistSnapshots !== false;

  for (const chart of charts) {
    try {
      const result = await runQuery(chart.sql, [], {
        ttlSeconds: report.refreshPolicy?.staleAfterSeconds || 300,
        staleWhileRevalidateSeconds: 60,
        accountId: options.accountId,
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
      } else {
        refreshedSnapshots.set(String(chart._id), {
          dataSnapshot: result.data,
          executionMetadata,
        });
      }

      results.push({
        chartId: chart._id,
        title: chart.title,
        success: true,
      });
    } catch (error: any) {
      results.push({ chartId: chart._id, title: chart.title, success: false, message: error?.message || 'Refresh failed' });
    }
  }

  const hydratedReport = await getReport(reportId);

  if (hydratedReport && !persistSnapshots) {
    hydratedReport.charts = (hydratedReport.charts || []).map((chart: any) => {
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

function fallbackInsights(reportTitle: string, charts: any[]) {
  const insights = charts.slice(0, 4).map((chart: any) => ({
    id: randomUUID(),
    type: 'metric' as const,
    title: chart.title,
    detail: `${chart.dataSnapshot?.length || 0} rows are currently captured for this widget.`,
    severity: 'info' as const,
    chartId: chart._id,
  }));

  return {
    summary: `${reportTitle} contains ${charts.length} charts with the latest saved query snapshots.`,
    insights,
  };
}

export async function generateReportSummary(reportId: string) {
  const report = await Report.findById(reportId);

  if (!report) {
    return null;
  }

  const hydrated = await hydrateReport(report.toObject());
  const charts = hydrated.charts || [];
  const sourceHash = createHash('sha1').update(JSON.stringify(charts.map((chart: any) => ({
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
    generated = await generateDashboardInsights(report.title, charts.map((chart: any) => ({
      id: String(chart._id),
      title: chart.title,
      chartType: chart.chartType,
      rowCount: chart.dataSnapshot?.length || 0,
      xAxis: chart.chartConfig?.xAxis,
      yAxis: chart.chartConfig?.yAxis,
      sampleRows: (chart.dataSnapshot || []).slice(0, 8),
    })));
  } catch (error) {
    console.warn('[Report] Falling back to local insights:', (error as any)?.message || error);
    generated = fallbackInsights(report.title, charts);
  }

  report.aiSummary = {
    status: 'ready',
    summary: generated.summary,
    insights: generated.insights.map((insight) => ({
      ...insight,
      id: randomUUID(),
      chartId: insight.chartId,
    })),
    generatedAt: new Date(),
    sourceHash,
  };

  await report.save();

  return hydrateReport(report.toObject());
}
