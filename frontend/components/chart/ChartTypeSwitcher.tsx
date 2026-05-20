'use client';

import { useEffect } from 'react';

import { BarChart2, PieChart, Table2, TrendingUp } from 'lucide-react';

import { ChartType } from '@/types';

interface Props {
  active: ChartType;
  onChange: (type: ChartType) => void;
  disabledTypes?: ChartType[];
  disabledReasons?: Partial<Record<ChartType, string>>;
}

const types: { type: ChartType; icon: any; label: string }[] = [
  { type: 'bar', icon: BarChart2, label: 'Bar' },
  { type: 'line', icon: TrendingUp, label: 'Line' },
  { type: 'pie', icon: PieChart, label: 'Pie' },
  { type: 'table', icon: Table2, label: 'Table' },
];

export default function ChartTypeSwitcher({ active, onChange, disabledTypes = [], disabledReasons = {} }: Readonly<Props>) {
  useEffect(() => {
    if (disabledTypes.includes(active)) {
      onChange('bar');
    }
  }, [active, disabledTypes, onChange]);

  return (
    <div className="flex gap-1 bg-[#0A0A0F] rounded-lg p-1 border border-[#1E1E2E]">
      {types.map(({ type, icon: Icon, label }) => {
        const isDisabled = disabledTypes.includes(type);

        if (isDisabled) {
          return null;
        }

        return (
        <button
          key={type}
          onClick={() => onChange(type)}
          title={disabledReasons[type]}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            active === type
              ? 'bg-[#6366F1] text-white shadow-lg shadow-indigo-500/20'
              : 'text-[#7B7B9A] hover:text-[#F0F0FF] hover:bg-[#16161F]'
          }`}
        >
          <Icon size={13} />
          {label}
        </button>
        );
      })}
    </div>
  );
}