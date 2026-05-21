'use client';

import { useState, useEffect } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatMetricLabel } from './ChartRenderer';
import {
  buildAxisLabel,
  formatChartMetricValue,
  getSeriesYAxisAssignment,
  calculateAxisWidths,
  truncateLabel,
} from '@/lib/chartUtils';

interface Props {
  readonly data: any[];
  readonly xAxis: string;
  readonly yAxis: string;
  readonly colors: string[];
  readonly seriesKeys: string[];
  readonly chartWidth?: number | string;
}

function LegendLabel({ value }: Readonly<{ value: string }>) {
  return <span style={{ color: '#7B7B9A', fontSize: '11px' }}>{formatMetricLabel(String(value))}</span>;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) {
    return null;
  }

  const orderedPayload = [...payload].sort((left, right) => Number(right?.value ?? 0) - Number(left?.value ?? 0));

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
              {formatChartMetricValue(Number(entry.value || 0), String(entry.dataKey))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LineChartView(props: Readonly<Props>) {
  const { data, xAxis, yAxis, colors, seriesKeys, chartWidth = '100%' } = props;
  const [windowWidth, setWindowWidth] = useState<number>(1200);

  // Monitor window resize to support fully responsive layout
  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  const isComparative = seriesKeys.length > 1;
  const visibleSeries = isComparative ? seriesKeys : [yAxis];
  const renderedSeries = isComparative ? [...visibleSeries].reverse() : visibleSeries;
  const strokePatterns = ['0', '8 4', '4 4', '12 4', '2 2'];
  const lineType = isComparative ? 'linear' : 'monotone';
  const bottomMargin = 12;

  // Dynamic Y-axis assignment and width calculation
  const { useDualAxes, assignments } = getSeriesYAxisAssignment(data, visibleSeries);
  const { leftWidth, rightWidth } = calculateAxisWidths(data, assignments, useDualAxes);
  const leftAxisLabel = useDualAxes ? buildAxisLabel(visibleSeries, assignments, 'left') : undefined;
  const rightAxisLabel = useDualAxes ? buildAxisLabel(visibleSeries, assignments, 'right') : undefined;
  const leftAxisMetricKey = visibleSeries.find((key) => assignments[key] === 'left') || yAxis;
  const rightAxisMetricKey = visibleSeries.find((key) => assignments[key] === 'right') || yAxis;

  // X-axis label adjustments
  const shouldRotateLabels = data.length > (isMobile ? 5 : 10);
  const tickInterval = isMobile ? (data.length > 8 ? 'preserveStartEnd' : 0) : 0;

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden no-scrollbar">
      <div style={{ width: chartWidth, minWidth: '100%', height: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{
              top: 12,
              right: useDualAxes ? 8 : 20,
              left: 8,
              bottom: bottomMargin,
            }}
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
              tickFormatter={(value) => formatChartMetricValue(value, leftAxisMetricKey)}
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
            {/* Secondary Right Y-axis for scale balancing */}
            {useDualAxes && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: '#7B7B9A', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={rightWidth}
                tickFormatter={(value) => formatChartMetricValue(value, rightAxisMetricKey)}
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
                formatter={LegendLabel}
              />
            )}
            {renderedSeries.map((metricKey) => {
              const originalIndex = visibleSeries.indexOf(metricKey);
              const dash = isComparative ? strokePatterns[originalIndex % strokePatterns.length] : undefined;
              const dashProp = dash === '0' ? undefined : dash;
              const axisId = assignments[metricKey] || 'left';

              // Visual distinction: Secondary scale line gets a slightly thicker stroke
              const strokeWidth = axisId === 'right' ? 3.5 : 3.0;

              return (
                <Line
                  key={metricKey}
                  type={lineType}
                  dataKey={metricKey}
                  yAxisId={axisId}
                  name={metricKey}
                  stroke={colors[originalIndex % colors.length]}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity={0.98}
                  strokeDasharray={dashProp}
                  dot={
                    data.length > 30
                      ? false
                      : { fill: colors[originalIndex % colors.length], r: 4, stroke: '#111118', strokeWidth: 2 }
                  }
                  activeDot={{ r: 6, strokeWidth: 2, stroke: '#111118', fill: colors[originalIndex % colors.length] }}
                  connectNulls
                  isAnimationActive={data.length <= 80}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
