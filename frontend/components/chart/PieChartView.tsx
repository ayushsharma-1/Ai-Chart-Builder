'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatTooltipValue } from '@/lib/chartUtils';

interface Props {
  data: any[];
  xAxis: string;
  yAxis: string;
  colors: string[];
}

const MAX_RENDERED_PIE_POINTS = 15;

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) {
    return null;
  }
  const entry = payload[0];
  const dataKey = entry.dataKey || '';
  return (
    <div className="bg-[#16161F] border border-[#1E1E2E] rounded-lg p-3 shadow-xl font-sans">
      <div className="flex items-center gap-2 text-xs">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.payload.fill || entry.color }} />
        <span className="text-[#7B7B9A]">{entry.name}:</span>
        <span className="font-semibold text-[#F0F0FF]">
          {formatTooltipValue(Number(entry.value || 0), String(dataKey))}
        </span>
      </div>
    </div>
  );
}

export default function PieChartView({ data, xAxis, yAxis, colors }: Props) {
  const sortedData = data.slice().sort((left, right) => Number(right?.[yAxis] || 0) - Number(left?.[yAxis] || 0));
  const pieData = sortedData.length <= MAX_RENDERED_PIE_POINTS
    ? data
    : [
        ...sortedData.slice(0, MAX_RENDERED_PIE_POINTS - 1),
        {
          [xAxis]: 'Other',
          [yAxis]: sortedData.slice(MAX_RENDERED_PIE_POINTS - 1).reduce((sum, row) => sum + Number(row?.[yAxis] || 0), 0),
        },
      ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={pieData} dataKey={yAxis} nameKey={xAxis} cx="50%" cy="50%" outerRadius="70%" innerRadius="40%" paddingAngle={4} stroke="rgba(0, 0, 0, 0.08)">
          {pieData.map((_, index) => (
            <Cell key={index} fill={colors[index % colors.length]} stroke="rgba(255, 255, 255, 0.08)" strokeWidth={1} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span style={{ color: '#7B7B9A', fontSize: '11px' }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
