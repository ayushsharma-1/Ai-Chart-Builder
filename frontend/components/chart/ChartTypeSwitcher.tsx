'use client';

import { BarChart2, PieChart, Table2, TrendingUp } from 'lucide-react';

import { ChartType } from '@/types';

interface Props {
  active: ChartType;
  onChange: (type: ChartType) => void;
  hiddenTypes?: ChartType[];
}

const types: { type: ChartType; icon: any; label: string }[] = [
  { type: 'bar', icon: BarChart2, label: 'Bar' },
  { type: 'line', icon: TrendingUp, label: 'Line' },
  { type: 'pie', icon: PieChart, label: 'Pie' },
  { type: 'table', icon: Table2, label: 'Table' },
];

export default function ChartTypeSwitcher({ active, onChange, hiddenTypes = [] }: Props) {
  const visibleTypes = types.filter(({ type }) => !hiddenTypes.includes(type));

  return (
    <div className="flex gap-1 bg-[#0A0A0F] rounded-lg p-1 border border-[#1E1E2E]">
      {visibleTypes.map(({ type, icon: Icon, label }) => (
        <button
          key={type}
          onClick={() => onChange(type)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            active === type
              ? 'bg-[#6366F1] text-white shadow-lg shadow-indigo-500/20'
              : 'text-[#7B7B9A] hover:text-[#F0F0FF] hover:bg-[#16161F]'
          }`}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );
}