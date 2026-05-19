'use client';

import { useState, useEffect } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatMetricLabel } from './ChartRenderer';
import {
  formatCompactNumber,
  buildAxisLabel,
  formatTooltipValue,
  getSeriesYAxisAssignment,
  calculateAxisWidths,
  truncateLabel,
} from '@/lib/chartUtils';

interface Props {
  data: any[];
  xAxis: string;
  yAxis: string;
  colors: string[];
  seriesKeys: string[];
  stacked?: boolean;
  chartWidth?: number | string;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) {
    return null;
  }

  const orderedPayload = [...payload].sort((left, right) => Number(right?.value || 0) - Number(left?.value || 0));

  return (
    <div className="bg-[#16161F] border border-[#1E1E2E] rounded-lg p-3 shadow-xl">
      <p className="text-[#7B7B9A] text-xs mb-1 font-sans">{label}</p>
      <div className="space-y-1.5 font-sans">
        {orderedPayload.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-2 text-[#7B7B9A]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {formatMetricLabel(String(entry.name || entry.dataKey))}
            </span>
            <span className="font-semibold text-[#F0F0FF]">
              {formatTooltipValue(Number(entry.value || 0), String(entry.dataKey))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BarChartView({ data, xAxis, yAxis, colors, seriesKeys, stacked = false, chartWidth = '100%' }: Props) {
  const [windowWidth, setWindowWidth] = useState<number>(1200);

  // Monitor resize for responsiveness
  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  const isComparative = seriesKeys.length > 1;
  const visibleSeries = isComparative ? seriesKeys : [yAxis];
  const barCategoryGap = stacked ? '14%' : isComparative ? '18%' : data.length > 24 ? '16%' : '22%';

  // Stacking bars on different axes is mathematically incorrect; force single axis when stacked.
  const { useDualAxes, assignments } = !stacked
    ? getSeriesYAxisAssignment(data, visibleSeries)
    : {
        useDualAxes: false,
        assignments: visibleSeries.reduce<Record<string, 'left' | 'right'>>((acc, key) => {
          acc[key] = 'left';
          return acc;
        }, {}),
      };

  const { leftWidth, rightWidth } = calculateAxisWidths(data, assignments, useDualAxes);
    const leftAxisLabel = useDualAxes ? buildAxisLabel(visibleSeries, assignments, 'left') : undefined;
    const rightAxisLabel = useDualAxes ? buildAxisLabel(visibleSeries, assignments, 'right') : undefined;

  // X-axis label adjustments
  const shouldRotateLabels = data.length > (isMobile ? 5 : 10);
  const tickInterval = isMobile ? (data.length > 8 ? 'preserveStartEnd' : 0) : 0;

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden no-scrollbar">
      <div style={{ width: chartWidth, minWidth: '100%', height: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{
              top: 12,
              right: useDualAxes ? 8 : 20,
              left: 8,
              bottom: 8,
            }}
            barCategoryGap={barCategoryGap}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
            <XAxis
              dataKey={xAxis}
              tick={{ fill: '#7B7B9A', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval={tickInterval}
              minTickGap={10}
              angle={shouldRotateLabels ? -30 : 0}
              textAnchor={shouldRotateLabels ? 'end' : 'middle'}
              height={shouldRotateLabels ? 56 : 28}
              tickMargin={12}
              padding={{ left: 12, right: 12 }}
              tickFormatter={(v) => truncateLabel(v, isMobile ? 8 : 14)}
            />
            {/* Primary Left Y-axis */}
            <YAxis
              yAxisId="left"
              tick={{ fill: '#7B7B9A', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={leftWidth}
              tickFormatter={formatCompactNumber}
              tickCount={isMobile ? 4 : 5}
              label={
                leftAxisLabel
                  ? {
                      value: leftAxisLabel,
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: '#7B7B9A', fontSize: 11, fontWeight: 600 },
                      offset: 6,
                    }
                  : undefined
              }
            />
            {/* Secondary Right Y-axis for scaling divergent series */}
            {useDualAxes && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: '#7B7B9A', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={rightWidth}
                tickFormatter={formatCompactNumber}
                tickCount={isMobile ? 4 : 5}
                label={
                  rightAxisLabel
                    ? {
                        value: rightAxisLabel,
                        angle: 90,
                        position: 'insideRight',
                        style: { fill: '#7B7B9A', fontSize: 11, fontWeight: 600 },
                        offset: 6,
                      }
                    : undefined
                }
              />
            )}
            <Tooltip content={<CustomTooltip />} />
            {isComparative && (
              <Legend
                verticalAlign="top"
                height={28}
                iconType="circle"
                wrapperStyle={{ paddingTop: 2, paddingBottom: 4, color: '#7B7B9A', fontSize: '11px' }}
                formatter={(value) => <span style={{ color: '#7B7B9A', fontSize: '11px' }}>{formatMetricLabel(String(value))}</span>}
              />
            )}
            {visibleSeries.map((metricKey, index) => {
              const axisId = assignments[metricKey] || 'left';
              return (
                <Bar
                  key={metricKey}
                  dataKey={metricKey}
                  yAxisId={axisId}
                  radius={stacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                  stackId={stacked ? 'comparative' : undefined}
                  fill={colors[index % colors.length]}
                  fillOpacity={0.88}
                  barSize={isComparative ? 16 : undefined}
                >
                  {data.map((_, cellIndex) => (
                    <Cell key={cellIndex} fill={colors[index % colors.length]} fillOpacity={0.88} />
                  ))}
                </Bar>
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}