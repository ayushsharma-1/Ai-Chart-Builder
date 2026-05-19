'use client';

import { useEffect, useState } from 'react';

import { ChartResult, ChartType } from '@/types';
import { Bookmark, Clock, Database } from 'lucide-react';

import EmptyState from '../ui/EmptyState';
import ChartRenderer, { inferChartDataset } from '../chart/ChartRenderer';
import ChartTypeSwitcher from '../chart/ChartTypeSwitcher';

interface Props {
  readonly result: ChartResult;
  readonly onSave: (result: ChartResult, type: ChartType) => void;
}

export default function InlineChartCard(props: Props) {
  const { result, onSave } = props;
  const isEmptyResult = !result.data?.length;

  const isSingleRowSummary = result.rowCount <= 1;
  const isDenseDataset = result.rowCount > 24;
  const chartDataset = inferChartDataset(result.chartType, result.data, result.chartConfig.xAxis, result.chartConfig.yAxis);
  const isPieDisabled = chartDataset.comparative;
  const isTabularOnlyData = chartDataset.tableOnly;
  const isComparativeDataset = chartDataset.comparative;
  let preferredType: ChartType = result.chartType;

  if (isSingleRowSummary || isTabularOnlyData) {
    preferredType = 'table';
  } else if (isPieDisabled && result.chartType === 'pie') {
    preferredType = 'bar';
  }
  const [activeType, setActiveType] = useState<ChartType>(preferredType);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setActiveType(preferredType);
  }, [preferredType]);

  if (isEmptyResult) {
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

  const handleSave = () => {
    onSave(result, activeType);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

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

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {!isSingleRowSummary && !isTabularOnlyData && (
            <ChartTypeSwitcher active={activeType} onChange={setActiveType} hiddenTypes={isPieDisabled ? ['pie'] : []} />
          )}
          <button
            type="button"
            onClick={handleSave}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
              saved
                ? 'border-[#22D3A3]/30 bg-[#22D3A3]/10 text-[#22D3A3]'
                : 'border-[#6366F1]/30 bg-[#6366F1]/10 text-[#6366F1] hover:border-[#6366F1]/50 hover:bg-[#6366F1]/20'
            }`}
          >
            <Bookmark size={14} />
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

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
