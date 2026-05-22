'use client';

import { useEffect, useState } from 'react';

import { ChartResult, ChartType } from '@/types';
import { Bookmark, Clock, Database } from 'lucide-react';
import { useSaveChart } from '@/hooks/useSaveChart';

import EmptyState from '../ui/EmptyState';
import ChartRenderer, { inferChartDataset } from '../chart/ChartRenderer';
import ChartTypeSwitcher from '../chart/ChartTypeSwitcher';

interface Props {
  readonly result: ChartResult;
  readonly onSave: (result: ChartResult, type: ChartType) => Promise<void>;
}

function InlineChartEmptyCard({ result }: Readonly<{ result: ChartResult }>) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[#1E1E2E] bg-[#111118] shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <div className="flex min-h-[340px] items-center justify-center p-4 sm:min-h-[380px]">
        <EmptyState
          title="No data found"
          message="Your query ran successfully but returned no matching records. Try changing filters, date ranges, or query wording."
        />
      </div>
    </div>
  );
}

function InlineChartTextResult({ result, isSaving, isSaved, error, onRunSave }: Readonly<{
  result: ChartResult;
  isSaving: boolean;
  isSaved: boolean;
  error: string | null;
  onRunSave: () => Promise<void>;
}>) {
  const rows = result.data.slice(0, 10) as Record<string, unknown>[];
  let saveButtonLabel = 'Save';
  let saveButtonClassName = 'border-[#6366F1]/30 bg-[#6366F1]/10 text-[#6366F1] hover:border-[#6366F1]/50 hover:bg-[#6366F1]/20';

  if (error) {
    saveButtonLabel = 'Save failed';
    saveButtonClassName = 'border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]';
  } else if (isSaving) {
    saveButtonLabel = 'Saving';
  } else if (isSaved) {
    saveButtonLabel = 'Saved';
    saveButtonClassName = 'border-[#22D3A3]/30 bg-[#22D3A3]/10 text-[#22D3A3]';
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[#1E1E2E] bg-[#111118] shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <div className="flex flex-col gap-3 border-b border-[#1E1E2E] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-syne text-sm font-semibold text-[#F0F0FF] sm:text-base">{result.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#7B7B9A]">
            <span className="flex items-center gap-1.5">
              <Database size={10} className="text-[#6366F1]" />
              {result.rowCount.toLocaleString()} rows
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={10} className="text-[#22D3A3]" />
              {result.executionTimeMs}ms
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onRunSave()}
          disabled={isSaving || isSaved}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${saveButtonClassName}`}
        >
          <Bookmark size={14} />
          {saveButtonLabel}
        </button>
      </div>

      {error && <div className="px-4 pb-2 text-xs text-[#F87171]">{error}</div>}

      <div className="max-h-[380px] overflow-auto p-4 text-sm leading-relaxed text-[#D6D6F2]">
        <p className="mb-3 text-[#7B7B9A]">Here are the matching records:</p>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={`${result.title}-${index}`} className="rounded-xl border border-[#1E1E2E] bg-[#0F0F16] px-3 py-2">
              <div className="mb-1 text-xs uppercase tracking-wide text-[#7B7B9A]">Record {index + 1}</div>
              <div className="whitespace-pre-wrap text-[#F0F0FF]">
                {Object.entries(row).map(([key, value]) => `${key}: ${formatLookupValue(value)}`).join(' · ')}
              </div>
            </div>
          ))}
        </div>
        {result.rowCount > rows.length && (
          <p className="mt-3 text-xs text-[#7B7B9A]">Showing {rows.length} of {result.rowCount} rows.</p>
        )}
      </div>
    </div>
  );
}

function formatLookupValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

export default function InlineChartCard(props: Props) {
  const { result, onSave } = props;
  const isEmptyResult = !result.data?.length;
  const isTextLookup = result.renderAs === 'text';

  const isSingleRowSummary = result.rowCount <= 1;
  const isDenseDataset = result.rowCount > 24;
  const chartDataset = inferChartDataset(result.chartType, result.data, result.chartConfig.xAxis, result.chartConfig.yAxis);
  const isPieDisabled = Boolean(result.pieDisabled);
  const isTabularOnlyData = chartDataset.tableOnly;
  const isComparativeDataset = chartDataset.comparative;
  let preferredType: ChartType = result.chartType;

  if (isSingleRowSummary || isTabularOnlyData) {
    preferredType = 'table';
  } else if (isPieDisabled && result.chartType === 'pie') {
    preferredType = 'bar';
  }
  const [activeType, setActiveType] = useState<ChartType>(preferredType);
  const { runSave, isSaving, isSaved, error, reset } = useSaveChart(async () => onSave(result, activeType));

  useEffect(() => {
    setActiveType(preferredType);
  }, [preferredType]);

  useEffect(() => {
    reset();
  }, [result.title, result.sql, reset]);

  if (isTextLookup) {
    return (
      <InlineChartTextResult
        result={result}
        isSaving={isSaving}
        isSaved={isSaved}
        error={error}
        onRunSave={async () => runSave()}
      />
    );
  }

  if (isEmptyResult) {
    return <InlineChartEmptyCard result={result} />;
  }

  const handleSave = async () => {
    await runSave();
  };

  let saveButtonLabel = 'Save';
  let saveButtonClassName = 'border-[#6366F1]/30 bg-[#6366F1]/10 text-[#6366F1] hover:border-[#6366F1]/50 hover:bg-[#6366F1]/20';

  if (error) {
    saveButtonLabel = 'Save failed';
    saveButtonClassName = 'border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]';
  } else if (isSaving) {
    saveButtonLabel = 'Saving';
  } else if (isSaved) {
    saveButtonLabel = 'Saved';
    saveButtonClassName = 'border-[#22D3A3]/30 bg-[#22D3A3]/10 text-[#22D3A3]';
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[#1E1E2E] bg-[#111118] shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <div className="flex flex-col gap-3 border-b border-[#1E1E2E] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-syne text-sm font-semibold text-[#F0F0FF] sm:text-base">{result.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#7B7B9A]">
            <span className="flex items-center gap-1.5">
              <Database size={10} className="text-[#6366F1]" />
              {result.rowCount.toLocaleString()} rows
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={10} className="text-[#22D3A3]" />
              {result.executionTimeMs}ms
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isSingleRowSummary && !isTabularOnlyData && (
            <ChartTypeSwitcher
              active={activeType}
              onChange={setActiveType}
              disabledTypes={isPieDisabled ? ['pie'] : []}
              disabledReasons={result.pieDisabledReason ? { pie: result.pieDisabledReason } : {}}
            />
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || isSaved}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${saveButtonClassName}`}
          >
            <Bookmark size={14} />
            {saveButtonLabel}
          </button>
        </div>
      </div>

      {error && <div className="px-4 pb-2 text-xs text-[#F87171]">{error}</div>}

      {(isSingleRowSummary || isTabularOnlyData || isComparativeDataset || (isDenseDataset && activeType !== 'table')) && (
        <div className="flex flex-wrap gap-2 border-b border-[#1E1E2E] bg-[#0F0F16] px-4 py-2">
          {isSingleRowSummary && <span className="rounded-full border border-[#1E1E2E] px-2 py-1 text-xs text-[#7B7B9A]">single-row summary</span>}
          {isTabularOnlyData && !isSingleRowSummary && <span className="rounded-full border border-[#1E1E2E] px-2 py-1 text-xs text-[#7B7B9A]">table-safe result</span>}
          {isComparativeDataset && !isTabularOnlyData && <span className="rounded-full border border-[#1E1E2E] px-2 py-1 text-xs text-[#7B7B9A]">multi-metric</span>}
          {isDenseDataset && !isSingleRowSummary && activeType !== 'table' && <span className="rounded-full border border-[#1E1E2E] px-2 py-1 text-xs text-[#7B7B9A]">scrollable dense data</span>}
        </div>
      )}

      <div className="h-[340px] p-4 sm:h-[380px]">
        <ChartRenderer
          type={activeType}
          data={result.data}
          xAxis={result.chartConfig.xAxis}
          yAxis={result.chartConfig.yAxis}
          seriesKeys={result.chartConfig.seriesKeys}
        />
      </div>
    </div>
  );
}
