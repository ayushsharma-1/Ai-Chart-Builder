'use client';

import { useState } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';

interface Props {
  hasTable: boolean;
  previewData: Record<string, unknown>[];
  previewLoading: boolean;
  previewError: string | null;
  rowCount: number;
  executionTimeMs: number;
  sql: string;
  onRetry?: () => void;
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  const s = String(value);
  return s.length > 28 ? `${s.slice(0, 28)}…` : s;
}

function prettyHeader(col: string): string {
  const clean = col.startsWith('tbl') && col.includes('_') ? col.slice(col.indexOf('_') + 1) : col;
  return clean.split('_').filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export default function PreviewPane({
  hasTable, previewData, previewLoading, previewError,
  rowCount, executionTimeMs, sql, onRetry,
}: Readonly<Props>) {
  const [sqlOpen, setSqlOpen] = useState(false);
  const visibleRows = previewData.slice(0, 10);
  const columns = visibleRows.length > 0 ? Object.keys(visibleRows[0]) : [];

  return (
    <div className="flex h-full flex-col rounded-xl border border-white/5 bg-[#0E0E15] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#6366F1]">Live Preview</span>
        <div className="flex items-center gap-2">
          {previewLoading && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#6366F1]" />
          )}
          {!previewLoading && rowCount > 0 && (
            <span className="text-xs text-[#7B7B9A]">{rowCount} rows · {executionTimeMs}ms</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {/* Empty — no table selected */}
        {!hasTable && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#2A2A3E]" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            <p className="text-sm font-medium text-[#44445E]">Select a table to start</p>
            <p className="text-xs text-[#2A2A3E]">Preview updates as you build</p>
          </div>
        )}

        {/* Loading skeleton */}
        {hasTable && previewLoading && (
          <div className="p-4 space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="h-8 animate-pulse rounded-md bg-[#111118]"
                style={{ opacity: 1 - i * 0.1, animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
        )}

        {/* Error */}
        {hasTable && !previewLoading && previewError && (
          <div className="m-4 rounded-lg border border-[#F87171]/15 bg-[#F87171]/5 p-4">
            <p className="text-xs font-semibold text-[#F87171]">Preview error</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#F87171]/70">{previewError}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 flex items-center gap-1.5 rounded-md border border-white/8 px-2.5 py-1.5 text-xs text-[#7B7B9A] transition-colors hover:text-[#F0F0FF]"
              >
                <RotateCcw size={11} />
                Retry
              </button>
            )}
          </div>
        )}

        {/* No data yet */}
        {hasTable && !previewLoading && !previewError && previewData.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <p className="text-sm text-[#44445E]">No preview data yet</p>
            <p className="text-xs text-[#2A2A3E]">Add columns to see results</p>
          </div>
        )}

        {/* Data */}
        {hasTable && !previewLoading && !previewError && previewData.length > 0 && (
          <div>
            {/* SQL toggle */}
            {sql && (
              <div className="border-b border-white/5">
                <button
                  type="button"
                  onClick={() => setSqlOpen((o) => !o)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-white/2"
                >
                  <ChevronRight
                    size={12}
                    className={`shrink-0 text-[#7B7B9A] transition-transform duration-150 ${sqlOpen ? 'rotate-90' : ''}`}
                  />
                  <span className="text-xs text-[#7B7B9A]">SQL</span>
                </button>
                {sqlOpen && (
                  <pre className="border-t border-white/5 bg-[#0A0A0F] px-4 pb-3 pt-2 font-mono text-[11px] leading-relaxed text-[#22D3A3] whitespace-pre-wrap break-all">
                    {sql}
                  </pre>
                )}
              </div>
            )}

            {/* Data table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-[#7B7B9A] whitespace-nowrap"
                      >
                        {prettyHeader(col)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, ri) => (
                    <tr key={ri} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                      {columns.map((col) => (
                        <td key={`${ri}-${col}`} className="px-4 py-2 text-center text-[#D6D6EA]">
                          {renderCell(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rowCount > 10 && (
              <p className="border-t border-white/5 px-4 py-2 text-center text-[10px] text-[#44445E]">
                Showing 10 of {rowCount} rows
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
