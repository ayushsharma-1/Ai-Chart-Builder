import { DataProfile } from './dataTransformer';

export type ChartType = 'bar' | 'line' | 'pie' | 'table';

export interface ChartRecommendation {
  chartType: ChartType;
  xAxis: string;
  yAxis: string[];
  overrideReason?: string;
  confidence: 'high' | 'medium' | 'low';
  seriesKeys?: string[];
  densityWarning?: string;
  pieDisabled: boolean;
  pieDisabledReason?: string;
}

interface RecommendationInput {
  llmChartType: ChartType | null;
  llmXAxis: string | null;
  llmYAxis: string | null;
  data: Record<string, unknown>[];
  dataProfile: DataProfile;
}

interface ChartTypeDecision {
  type: ChartType;
  overrideReason?: string;
  densityWarning?: string;
}

export function recommendChartType(
  data: Record<string, unknown>[],
  suggestedType: ChartType,
  xAxis: string,
  columns: string[],
): ChartTypeDecision {
  if (!data || data.length === 0) return { type: 'table', overrideReason: 'No data returned' };

  const totalRows = data.length;
  const yColumns = columns.filter((column) => column !== xAxis);
  const numericYColumns = yColumns.filter((column) => data.slice(0, 5).every((row) => row[column] !== null && !Number.isNaN(Number(row[column]))));

  const TIME_AXIS_NAMES = /^(month|date|week|year|day|period|quarter)/i;
  const ISO_MONTH = /^\d{4}-\d{2}$/;
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  const firstXVal = toComparableValue(data[0]?.[xAxis]);
  const isTimeSeries = TIME_AXIS_NAMES.test(xAxis) || ISO_MONTH.test(firstXVal) || ISO_DATE.test(firstXVal);

  if (isTimeSeries) {
    const chartType: ChartType = 'line';
    let overrideReason: string | undefined;

    if (numericYColumns.length >= 2) {
      overrideReason = `Multi-metric time series (${numericYColumns.length} metrics) → multi-line`;
    } else if (suggestedType !== 'line') {
      overrideReason = 'Time-series axis → line chart';
    }

    const densityWarning = totalRows > 50
      ? `${totalRows} data points — labels are sampled. Switch to Table for full data.`
      : undefined;

    return {
      type: chartType,
      overrideReason,
      densityWarning,
    };
  }

  const uniqueXCount = new Set(data.map((row) => toComparableValue(row[xAxis]))).size;

  if (numericYColumns.length === 0) {
    return {
      type: 'table',
      overrideReason: 'No numeric metric found — table view only',
      densityWarning: undefined,
    };
  }

  if (numericYColumns.length >= 2) {
    const densityWarning = uniqueXCount > 50
      ? `${uniqueXCount} data points — labels are sampled. Switch to Table for full data.`
      : undefined;

    return { type: 'bar', overrideReason: `${numericYColumns.length} metrics → grouped bar`, densityWarning };
  }

  const densityWarning = (suggestedType === 'bar' || suggestedType === 'line') && uniqueXCount > 50
    ? `${uniqueXCount} data points — labels are sampled. Switch to Table for full data.`
    : undefined;

  return { type: suggestedType, densityWarning };
}

export function recommendChart(input: RecommendationInput): ChartRecommendation {
  const columns = input.dataProfile.columns.map((column) => column.name);
  const suggestedType = input.llmChartType || 'bar';
  const xAxis = chooseXAxis(input);
  const decision = recommendChartType(input.data, suggestedType, xAxis, columns);
  const yAxis = chooseYAxisList(input, xAxis);
  const seriesKeys = buildSeriesKeys(input.dataProfile, input.data, xAxis, yAxis);
  const xColumn = input.dataProfile.columns.find((column) => column.name === xAxis);
  const sliceCount = xColumn?.cardinality ?? input.dataProfile.rowCount;
  const comparative = Array.isArray(seriesKeys) && seriesKeys.length > 1;

  // Disable pie for high-cardinality, comparative (multi-series), or time-series (line) decisions
  const pieDisabledByCount = sliceCount > 15;
  const pieDisabledByComparative = comparative;
  const pieDisabledByChartType = decision.type === 'line';

  const pieDisabled = pieDisabledByCount || pieDisabledByComparative || pieDisabledByChartType;

  let pieDisabledReason: string | undefined;
  if (pieDisabledByCount) {
    pieDisabledReason = `${sliceCount} categories — pie requires 15 or fewer`;
  } else if (pieDisabledByComparative) {
    pieDisabledReason = `${(seriesKeys || []).length} series detected — pie is not suitable for multi-series comparisons`;
  } else if (pieDisabledByChartType) {
    pieDisabledReason = 'Time-series data (line) — pie charts are not appropriate for trends';
  }

  return {
    chartType: decision.type,
    xAxis,
    yAxis,
    seriesKeys,
    overrideReason: decision.overrideReason,
    densityWarning: decision.densityWarning,
    confidence: decision.overrideReason ? 'medium' : 'high',
    pieDisabled,
    pieDisabledReason,
  };
}

function chooseXAxis(input: RecommendationInput): string {
  const columnNames = new Set(input.dataProfile.columns.map((column) => column.name));

  if (input.llmXAxis && columnNames.has(input.llmXAxis)) {
    return input.llmXAxis;
  }

  const dateColumn = input.dataProfile.columns.find((column) => column.isDateLike);
  if (dateColumn) {
    return dateColumn.name;
  }

  const stringColumns = input.dataProfile.columns
    .filter((column) => column.type === 'string')
    .sort((left, right) => left.cardinality - right.cardinality);

  return stringColumns[0]?.name || input.dataProfile.columns[0]?.name || '';
}

function chooseYAxisList(input: RecommendationInput, xAxis: string): string[] {
  const columnNames = new Set(input.dataProfile.columns.map((column) => column.name));
  const requestedYAxis = input.llmYAxis && columnNames.has(input.llmYAxis) ? [input.llmYAxis] : [];

  if (requestedYAxis.length > 0) {
    return requestedYAxis;
  }

  const numericColumns = input.dataProfile.columns
    .filter((column) => column.type === 'number' && !column.isIdentifier && column.name !== xAxis)
    .map((column) => column.name);

  return numericColumns.length > 0 ? numericColumns : input.dataProfile.columns.filter((column) => column.name !== xAxis).map((column) => column.name).slice(0, 1);
}

function buildSeriesKeys(dataProfile: DataProfile, data: Record<string, unknown>[], xAxis: string, yAxis: string[]): string[] | undefined {
  if (data.length === 0) {
    return yAxis.length > 0 ? yAxis : undefined;
  }

  const numericCols = dataProfile.columns
    .filter((column) => column.type === 'number' && !column.isIdentifier && column.name !== xAxis)
    .map((column) => column.name);

  if (numericCols.length >= 2) {
    return numericCols;
  }

  return yAxis.length > 0 ? yAxis : undefined;
}

function toComparableValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (value === null || value === undefined) {
    return '';
  }

  try {
    return JSON.stringify(value) || '';
  } catch {
    return '';
  }
}
