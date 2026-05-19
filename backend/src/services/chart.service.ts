import Chart, { IChart } from '../models/Chart';
import { buildChartExplainability } from '../utils/chartExplainability';

function withExplainability(payload: Partial<IChart>) {
  const explainability = buildChartExplainability({
    title: payload.title,
    prompt: payload.prompt,
    sql: payload.sql,
    reasoning: payload.reasoning,
    chartType: payload.chartType,
    chartConfig: payload.chartConfig,
  });

  return {
    ...payload,
    aiExplanation: payload.aiExplanation || explainability.aiExplanation,
    queryConfidence: payload.queryConfidence || explainability.queryConfidence,
    metricLineage: payload.metricLineage || explainability.metricLineage,
  };
}

export async function saveChart(payload: Partial<IChart>) {
  const chart = new Chart(withExplainability(payload));
  return chart.save();
}

export async function getAllCharts() {
  return Chart.find().sort({ createdAt: -1 });
}

export async function getChart(id: string) {
  return Chart.findById(id);
}

export async function deleteChart(id: string) {
  return Chart.findByIdAndDelete(id);
}

export async function updateChartPosition(id: string, gridPosition: IChart['gridPosition']) {
  return Chart.findByIdAndUpdate(id, { gridPosition }, { new: true });
}

export async function updateChart(id: string, payload: Partial<IChart>) {
  const existing = await Chart.findById(id).lean();

  if (!existing) {
    return null;
  }

  const merged: Partial<IChart> = {
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

  return Chart.findByIdAndUpdate(id, withExplainability(merged), { new: true, runValidators: true });
}

export async function duplicateChart(id: string) {
  const chart = await Chart.findById(id).lean();

  if (!chart) {
    return null;
  }

  const { _id, createdAt, updatedAt, reportIds, ...copy } = chart as any;

  return new Chart({
    ...copy,
    title: `${chart.title} copy`,
    reportIds: [],
  }).save();
}

export async function attachChartToReport(chartId: string, reportId: string) {
  return Chart.findByIdAndUpdate(chartId, { $addToSet: { reportIds: reportId } }, { new: true });
}

export async function detachChartFromReport(chartId: string, reportId: string) {
  return Chart.findByIdAndUpdate(chartId, { $pull: { reportIds: reportId } }, { new: true });
}
