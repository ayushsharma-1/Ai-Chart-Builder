'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

import { Responsive, WidthProvider } from '@eleung/react-grid-layout';
import { Copy, Eye, MoreHorizontal, Trash2 } from 'lucide-react';

import api from '@/lib/api';
import { SavedChart } from '@/types';

import ChartRenderer from '../chart/ChartRenderer';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface Props {
  readonly reportId?: string;
  readonly charts: SavedChart[];
  readonly readOnly?: boolean;
  readonly onInspect: (chart: SavedChart) => void;
  readonly onExplain?: (chart: SavedChart) => void;
  readonly onRemove: (chartId: string) => void;
  readonly onLayoutCommit: (layout: Array<{ chartId: string; gridPosition: SavedChart['gridPosition'] }>) => void;
}

export default function ReportGrid({ reportId, charts, readOnly = false, onInspect, onExplain, onRemove, onLayoutCommit }: Props) {
  const layout = useMemo(() => charts.map((chart) => {
    const position = chart.reportLayout || chart.gridPosition || { x: 0, y: 0, w: 6, h: 4 };

    return {
      i: chart._id,
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      minW: 3,
      minH: 3,
    };
  }), [charts]);

  const lastSyncedLayoutKey = useRef('');
  const lastSavedPositions = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const openMenuChartId = useRef<string | null>(null);
  const [activeMenuChartId, setActiveMenuChartId] = useState<string | null>(null);
  const [menuDirection, setMenuDirection] = useState<'up' | 'down'>('down');

  useEffect(() => {
    const nextPositions: Record<string, { x: number; y: number; w: number; h: number }> = {};

    layout.forEach((item) => {
      nextPositions[item.i] = { x: item.x, y: item.y, w: item.w, h: item.h };
    });

    lastSavedPositions.current = nextPositions;
    lastSyncedLayoutKey.current = buildLayoutKey(layout);
  }, [layout]);

  useEffect(() => {
    openMenuChartId.current = activeMenuChartId;
  }, [activeMenuChartId]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!openMenuChartId.current) {
        return;
      }

      const target = event.target as HTMLElement | null;

      if (target?.closest?.('[data-report-menu-root="true"]')) {
        return;
      }

      setActiveMenuChartId(null);
    };

    globalThis.window.addEventListener('pointerdown', handlePointerDown);
    return () => globalThis.window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const buildLayoutKey = (items: any[]) => items
    .slice()
    .sort((left, right) => String(left.i).localeCompare(String(right.i)))
    .map((item) => `${item.i}:${item.x},${item.y},${item.w},${item.h}`)
    .join('|');

  const commitLayout = (currentLayout: any[]) => {
    if (readOnly) {
      return;
    }

    const nextLayoutKey = buildLayoutKey(currentLayout);

    if (nextLayoutKey === lastSyncedLayoutKey.current) {
      return;
    }

    lastSyncedLayoutKey.current = nextLayoutKey;

    const changedLayout = currentLayout
      .map((item) => {
        const nextPosition = { x: item.x, y: item.y, w: item.w, h: item.h };
        const previous = lastSavedPositions.current[item.i];

        if (previous && previous.x === nextPosition.x && previous.y === nextPosition.y && previous.w === nextPosition.w && previous.h === nextPosition.h) {
          return null;
        }

        lastSavedPositions.current[item.i] = nextPosition;
        return { chartId: item.i, gridPosition: nextPosition };
      })
      .filter((item): item is { chartId: string; gridPosition: SavedChart['gridPosition'] } => Boolean(item));

    if (changedLayout.length > 0) {
      onLayoutCommit(changedLayout);
    }
  };

  const handleViewDetails = (chart: SavedChart) => {
    setActiveMenuChartId(null);
    (onExplain || onInspect)(chart);
  };

  const handleDuplicate = async (chart: SavedChart) => {
    try {
      await api.post(`/api/charts/${chart._id}/duplicate`);
    } catch (error) {
      console.error('Unable to duplicate chart:', error);
    } finally {
      setActiveMenuChartId(null);
    }
  };

  const handleRemove = async (chart: SavedChart) => {
    try {
      if (reportId) {
        await api.delete(`/api/reports/${reportId}/charts/${chart._id}`);
      } else {
        await api.delete(`/api/charts/${chart._id}`);
      }

      onRemove(chart._id);
    } catch (error) {
      console.error('Unable to remove chart:', error);
    } finally {
      setActiveMenuChartId(null);
    }
  };

  const handleMenuToggle = (event: MouseEvent<HTMLButtonElement>, chart: SavedChart) => {
    const nextId = activeMenuChartId === chart._id ? null : chart._id;

    if (nextId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setMenuDirection(spaceBelow < 220 && spaceAbove > spaceBelow ? 'up' : 'down');
    }

    setActiveMenuChartId(nextId);
  };

  if (charts.length === 0) {
    return (
      <div className="flex h-72 flex-col items-center justify-center text-center">
        <p className="text-sm text-[#7B7B9A]">This report has no charts yet.</p>
        <p className="mt-1 text-xs text-[#3F3F5C]">Add saved charts from the report toolbar.</p>
      </div>
    );
  }

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={{ lg: layout }}
      breakpoints={{ lg: 1200, md: 996, sm: 768 }}
      cols={{ lg: 12, md: 10, sm: 6 }}
      rowHeight={82}
      onDragStop={commitLayout}
      onResizeStop={commitLayout}
      isDraggable={!readOnly}
      isResizable={!readOnly}
      draggableHandle=".report-drag-handle"
    >
      {charts.map((chart) => (
        <div key={chart._id}>
          <article className="group flex h-full flex-col overflow-visible rounded-lg border border-[#1E1E2E] bg-[#111118] transition-colors hover:border-[#6366F1]/40">
            <div className={`report-drag-handle flex items-center justify-between gap-3 border-b border-[#1E1E2E] px-4 py-3 ${readOnly ? '' : 'cursor-move'}`}>
              <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => onInspect(chart)} className="min-w-0 text-left">
                <h3 className="truncate text-sm font-semibold text-[#F0F0FF]">{chart.title}</h3>
                <p className="mt-1 text-xs text-[#7B7B9A]">
                  {(chart.executionMetadata?.rowCount || chart.dataSnapshot.length).toLocaleString()} rows
                  {chart.executionMetadata?.cacheStatus ? ` - ${chart.executionMetadata.cacheStatus}` : ''}
                </p>
              </button>
              <div className="relative flex items-center gap-1" data-report-menu-root="true">
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(event) => handleMenuToggle(event, chart)}
                  className="rounded-md p-1.5 text-[#7B7B9A] transition-colors hover:bg-[#16161F] hover:text-[#F0F0FF]"
                  aria-haspopup="menu"
                  aria-expanded={activeMenuChartId === chart._id}
                >
                  <MoreHorizontal size={14} />
                </button>
                {!readOnly && (
                  <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => void handleRemove(chart)} className="rounded-md p-1.5 text-[#7B7B9A] opacity-0 transition-all hover:bg-[#16161F] hover:text-[#F87171] group-hover:opacity-100">
                    <Trash2 size={14} />
                  </button>
                )}
                {activeMenuChartId === chart._id && (
                  <div className={`absolute right-0 z-50 w-52 rounded-xl border border-[#1E1E2E] bg-[#0D0D13] p-2 shadow-2xl ${menuDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}`} role="menu">
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => handleViewDetails(chart)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#F0F0FF] transition-colors hover:bg-[#16161F]"
                    >
                      <Eye size={14} className="text-[#6366F1]" />
                      View details
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => void handleDuplicate(chart)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#F0F0FF] transition-colors hover:bg-[#16161F]"
                    >
                      <Copy size={14} className="text-[#22D3A3]" />
                      Duplicate to library
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => void handleRemove(chart)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#F87171] transition-colors hover:bg-[#1F1114]"
                      >
                        <Trash2 size={14} />
                        Remove from report
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 p-3">
              <ChartRenderer
                type={chart.chartType}
                data={chart.dataSnapshot}
                xAxis={chart.chartConfig.xAxis}
                yAxis={chart.chartConfig.yAxis}
                seriesKeys={chart.chartConfig.seriesKeys}
              />
            </div>
          </article>
        </div>
      ))}
    </ResponsiveGridLayout>
  );
}
