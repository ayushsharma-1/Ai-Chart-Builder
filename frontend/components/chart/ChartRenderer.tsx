'use client';

import { ChartType } from '@/types';

import EmptyState from '../ui/EmptyState';

import BarChartView from './BarChartView';
import LineChartView from './LineChartView';
import PieChartView from './PieChartView';
import TableView from './TableView';

export const CHART_COLOR_PALETTE = [
  '#6366F1',
  '#22D3A3',
  '#F59E0B',
  '#F87171',
  '#A78BFA',
  '#34D399',
  '#38BDF8',
  '#FB7185',
  '#F472B6',
  '#FBBF24',
  '#60A5FA',
  '#4ADE80',
  '#C084FC',
  '#2DD4BF',
  '#818CF8',
  '#F97316',
  '#14B8A6',
  '#8B5CF6',
  '#06B6D4',
  '#E879F9',
  '#84CC16',
  '#EF4444',
  '#10B981',
  '#3B82F6',
];

export const MAX_PIE_POINTS = 15;

interface Props {
  type: ChartType;
  data: unknown[];
  xAxis: string;
  yAxis: string;
  seriesKeys?: string[];
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

export function formatMetricLabel(key: string) {
  return key
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export interface InferredChartDataset {
  tableOnly: boolean;
  tableReason?: 'empty' | 'missing_axis' | 'single_row' | 'no_numeric_metric' | 'explicit_table';
  comparative: boolean;
  stacked: boolean;
  seriesKeys: string[];
  chartWidth: number | string;
  data: any[];
}

interface SeriesDiagnostic {
  key: string;
  numericCount: number;
  nullCount: number;
  coverage: number;
  min: number | null;
  max: number | null;
}

function getRowKeys(data: any[]) {
  const keys = new Set<string>();

  data.forEach((row) => {
    Object.keys(row || {}).forEach((key) => keys.add(key));
  });

  return Array.from(keys);
}

function isLikelyDimensionKey(key: string) {
  const normalized = key.toLowerCase();

  return (
    normalized === 'id' ||
    normalized.endsWith('_id') ||
    /(uuid|guid|timestamp|createdon|updatedon|deletedon|archivedon|rownum|ordinal|position|index|year|month|day|week|date|time)$/i.test(normalized)
  );
}

function buildSeriesDiagnostics(data: any[], keys: string[]): SeriesDiagnostic[] {
  return keys.map((key) => {
    let numericCount = 0;
    let nullCount = 0;
    const numericValues: number[] = [];

    data.forEach((row) => {
      const value = row?.[key];

      if (value === null || value === undefined || value === '') {
        nullCount += 1;
        return;
      }

      if (isNumericLike(value)) {
        numericCount += 1;
        numericValues.push(Number(value));
      }
    });

    return {
      key,
      numericCount,
      nullCount,
      coverage: data.length ? numericCount / data.length : 0,
      min: numericValues.length ? Math.min(...numericValues) : null,
      max: numericValues.length ? Math.max(...numericValues) : null,
    };
  });
}

function resolveSeriesKeys(data: any[], xAxis: string, yAxis: string, preferredSeriesKeys?: string[]) {
  const allKeys = getRowKeys(data);
  const explicitKeys = (preferredSeriesKeys || []).filter((key) => allKeys.includes(key) && key !== xAxis);
  const candidateKeys = explicitKeys.length ? explicitKeys : allKeys.filter((key) => key !== xAxis && !isLikelyDimensionKey(key));
  const diagnostics = buildSeriesDiagnostics(data, candidateKeys);
  const validMetrics = diagnostics.filter((metric) => metric.numericCount > 0 && metric.coverage >= 0.5);
  const preferredPrimary = validMetrics.find((metric) => metric.key === yAxis) || validMetrics[0] || diagnostics.find((metric) => metric.key === yAxis) || diagnostics[0];
  const orderedSeriesKeys = preferredPrimary
    ? [preferredPrimary.key, ...validMetrics.filter((metric) => metric.key !== preferredPrimary.key).map((metric) => metric.key)]
    : [];

  return {
    diagnostics,
    seriesKeys: Array.from(new Set(orderedSeriesKeys.length ? orderedSeriesKeys : [yAxis].filter(Boolean))),
  };
}

export function inferChartDataset(type: ChartType, data: any[], xAxis: string, yAxis: string, preferredSeriesKeys?: string[]): InferredChartDataset {
  const { diagnostics, seriesKeys } = resolveSeriesKeys(data, xAxis, yAxis, preferredSeriesKeys);
  const orderedSeriesKeys = seriesKeys.length ? seriesKeys : [yAxis].filter(Boolean);
  const normalizedData = data.map((row) => {
    const nextRow = { ...row };

    orderedSeriesKeys.forEach((key) => {
      if (isNumericLike(nextRow[key])) {
        nextRow[key] = Number(nextRow[key]);
      }
    });

    return nextRow;
  });
  const chartWidthMultiplier = orderedSeriesKeys.length > 1 ? 58 : type === 'line' ? 52 : 36;
  const chartWidthCandidate = data.length > 24 ? data.length * chartWidthMultiplier : undefined;
  const hasNumericMetric = orderedSeriesKeys.some((key) => diagnostics.some((metric) => metric.key === key && metric.numericCount > 0 && metric.coverage >= 0.5));
  const tableReason =
    type === 'table'
      ? 'explicit_table'
      : data.length === 0
        ? 'empty'
        : !xAxis
          ? 'missing_axis'
          : data.length <= 1
            ? 'single_row'
            : !hasNumericMetric
              ? 'no_numeric_metric'
              : undefined;
  const tableOnly = Boolean(tableReason);
  const comparative = !tableOnly && orderedSeriesKeys.length > 1;
  const stacked = comparative && orderedSeriesKeys.length >= 4;
  const chartWidth = chartWidthCandidate ? Math.max(type === 'line' ? 1200 : 900, chartWidthCandidate) : '100%';

  if (process.env.NODE_ENV === 'development') {
    const invalidSeries = diagnostics.filter((metric) => metric.numericCount === 0 || metric.coverage < 0.5).map((metric) => ({
      key: metric.key,
      numericCount: metric.numericCount,
      nullCount: metric.nullCount,
      coverage: metric.coverage,
      min: metric.min,
      max: metric.max,
    }));

    console.info('[ChartRenderer] Dataset diagnostics', {
      type,
      xAxis,
      yAxis,
      rowCount: data.length,
      seriesKeys: orderedSeriesKeys,
      invalidSeries,
      sampleRowKeys: Object.keys((data[0] as Record<string, unknown>) || {}),
      sampleRow: data[0],
    });
  }

  return {
    tableOnly,
    tableReason,
    comparative,
    stacked,
    seriesKeys: orderedSeriesKeys.length ? orderedSeriesKeys : [yAxis],
    chartWidth,
    data: normalizedData,
  };
}

export default function ChartRenderer(props: Readonly<Props>) {
  const { type, data, xAxis, yAxis, seriesKeys } = props;
  const colors = CHART_COLOR_PALETTE;
  const rowCount = Array.isArray(data) ? data.length : 0;

  if (rowCount === 0) {
    return (
      <div className="flex h-full items-center justify-center overflow-hidden">
        <EmptyState
          title="No data found"
          message="Your query ran successfully but returned no matching records. Try changing filters, date ranges, or query wording."
        />
      </div>
    );
  }

  const chartDataset = inferChartDataset(type, data as any[], xAxis, yAxis, seriesKeys);
  const primaryMetric = chartDataset.seriesKeys[0] || yAxis;
  const chartProps = { data: chartDataset.data, xAxis, yAxis: primaryMetric, colors, seriesKeys: chartDataset.seriesKeys, stacked: chartDataset.stacked } as any;

  if (chartDataset.tableOnly) {
    return <TableView {...chartProps} />;
  }

  switch (type) {
    case 'line':
      return <LineChartView {...chartProps} chartWidth={chartDataset.chartWidth} />;
    case 'pie':
      if (chartDataset.comparative) {
        return <BarChartView {...chartProps} chartWidth={chartDataset.chartWidth} />;
      }

      return <PieChartView {...chartProps} />;
    case 'table':
      return <TableView {...chartProps} />;
    case 'bar':
    default:
      return <BarChartView {...chartProps} chartWidth={chartDataset.chartWidth} />;
  }
}
