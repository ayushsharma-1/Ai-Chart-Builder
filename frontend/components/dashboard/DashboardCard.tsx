'use client';

import { Trash2 } from 'lucide-react';

import { SavedChart } from '@/types';

import ChartRenderer from '../chart/ChartRenderer';

interface Props {
  readonly chart: SavedChart;
  readonly onDelete: (id: string) => void;
}

export default function DashboardCard(props: Props) {
  const { chart, onDelete } = props;
  return (
    <div className="h-full flex flex-col bg-[#111118] border border-[#1E1E2E] rounded-xl overflow-hidden hover:border-[#6366F1]/30 transition-colors group">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E1E2E]">
        <h3 className="font-syne font-semibold text-[#F0F0FF] text-sm truncate pr-2">{chart.title}</h3>
        <button onMouseDown={(e) => e.stopPropagation()} onClick={() => onDelete(chart._id)} className="opacity-0 group-hover:opacity-100 text-[#7B7B9A] hover:text-[#F87171] transition-all">
          <Trash2 size={13} />
        </button>
      </div>
      <div className="flex-1 p-3">
        <ChartRenderer
          type={chart.chartType}
          data={chart.dataSnapshot}
          xAxis={chart.chartConfig.xAxis}
          yAxis={chart.chartConfig.yAxis}
          seriesKeys={chart.chartConfig.seriesKeys}
        />
      </div>
    </div>
  );
}