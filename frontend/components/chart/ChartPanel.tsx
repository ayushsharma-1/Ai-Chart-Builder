'use client';

import { useEffect, useState } from 'react';

import { ChartResult, ChartType } from '@/types';
import { Bookmark, Clock, Database, Info } from 'lucide-react';

import EmptyState from '../ui/EmptyState';
import ChartRenderer from './ChartRenderer';
import ChartTypeSwitcher from './ChartTypeSwitcher';

interface Props {
  readonly chart: ChartResult | null;
  readonly onSave: (result: ChartResult, type: ChartType) => void;
}

export default function ChartPanel(props: Props) {
  const { chart, onSave } = props;
  const [activeType, setActiveType] = useState<ChartType>('bar');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (chart?.chartType) {
      setActiveType(chart.chartType === 'pie' && chart.pieDisabled ? 'bar' : chart.chartType);
    }
  }, [chart]);

  const handleSave = () => {
    if (!chart) {
      return;
    }

    onSave(chart, activeType);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!chart) {
    return (
      <div className="flex-1 flex items-center justify-center border-r border-[#1E1E2E]">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col border-r border-[#1E1E2E] overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E2E]">
        <div>
          <h2 className="font-syne font-bold text-[#F0F0FF] text-lg leading-tight">{chart.title}</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-[#7B7B9A] text-xs">
              <Database size={10} /> {chart.rowCount.toLocaleString()} rows
            </span>
            <span className="flex items-center gap-1 text-[#7B7B9A] text-xs">
              <Clock size={10} /> {chart.executionTimeMs}ms
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ChartTypeSwitcher
            active={activeType}
            onChange={setActiveType}
            disabledTypes={chart.pieDisabled ? ['pie'] : []}
            disabledReasons={chart.pieDisabledReason ? { pie: chart.pieDisabledReason } : {}}
          />
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              saved
                ? 'bg-[#22D3A3]/10 text-[#22D3A3] border border-[#22D3A3]/30'
                : 'bg-[#6366F1]/10 text-[#6366F1] border border-[#6366F1]/30 hover:bg-[#6366F1]/20'
            }`}
          >
            <Bookmark size={14} />
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {chart.chartOverrideReason && (
        <div className="px-6 pb-2 pt-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#6366F1]/[0.08] border border-[#6366F1]/20 rounded-full w-fit">
            <Info size={11} className="text-[#6366F1] flex-shrink-0" />
            <span className="text-[#6366F1] text-xs">{chart.chartOverrideReason}</span>
          </div>
        </div>
      )}

      <div className="flex-1 p-6 animate-fade-slide">
        <ChartRenderer
          type={activeType}
          data={chart.data}
          xAxis={chart.chartConfig.xAxis}
          yAxis={chart.chartConfig.yAxis}
          seriesKeys={chart.chartConfig.seriesKeys}
        />
      </div>
    </div>
  );
}