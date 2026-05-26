'use client';

import EmptyState from '@/components/ui/EmptyState';

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

function renderCell(value: unknown) {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatColumnName(columnName: string) {
  const lowerName = columnName.toLowerCase();
  const withoutTablePrefix = lowerName.startsWith('tbl') && columnName.includes('_') 
    ? columnName.slice(columnName.indexOf('_') + 1) 
    : columnName;

  return withoutTablePrefix
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export default function PreviewPane({ hasTable, previewData, previewLoading, previewError, rowCount, executionTimeMs, sql, onRetry }: Readonly<Props>) {
  const visibleRows = previewData.slice(0, 10);
  const columns = visibleRows.length > 0 ? Object.keys(visibleRows[0]) : [];

  return (
    <aside className="sticky top-0 h-screen overflow-hidden bg-[#0A0A0F] p-6 mt-6 pt-4 border-t border-[#1E1E2E] px-6 lg:mt-0 lg:border-t-0 lg:pt-6">
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 pb-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#6366F1]">LIVE PREVIEW</p>
          <p className="text-sm text-[#7B7B9A]">Intermediate results update automatically as you edit the plan.</p>
        </div>

        <div className={`flex-1 overflow-y-auto pt-6 ${!hasTable || previewData.length === 0 ? 'flex flex-col items-center justify-center' : ''}`}>
          {!hasTable ? (
            <EmptyState title="Select a table to start" message="Choose a base table to unlock columns, joins, filters, and preview results." />
          ) : previewLoading ? (
            <div className="space-y-3 rounded-2xl border border-[#1E1E2E] bg-[#111118] p-4">
              <div className="h-4 w-1/2 animate-pulse rounded bg-[#1E1E2E]" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-[#1E1E2E]" />
              <div className="space-y-2 pt-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-10 animate-pulse rounded-lg bg-[#171722]" />
                ))}
              </div>
            </div>
          ) : previewError ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center text-center text-sm text-[#7B7B9A]">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="mb-4 h-7 w-7 text-[#7B7B9A]" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3l-8.47-14.14a2 2 0 0 0-3.42 0Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <p className="max-w-xs">Preview temporarily unavailable</p>
              <p className="mt-2 max-w-md">{previewError}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-6 rounded-xl border border-[#F87171]/30 bg-[#111118] px-3 py-2 text-xs font-medium text-[#FECACA] transition-colors hover:border-[#F87171]/50 hover:bg-[#2A1216]"
                >
                  Retry preview
                </button>
              )}
            </div>
          ) : previewData.length === 0 ? (
            <EmptyState title="No preview rows yet" message="Add columns, filters, or joins to see live preview data." />
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border border-[#1E1E2E] bg-[#111118] p-5 shadow-lg">
                <div className="mb-3 text-sm font-medium text-[#D6D6EA]">{rowCount} rows · {executionTimeMs}ms</div>
                <details className="mb-2 rounded-xl bg-[#16161F] px-5 py-3 text-[#D6D6EA] transition-all">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-[#F0F0FF]">SQL</summary>
                  <pre className="mt-4 whitespace-pre-wrap break-all font-mono text-sm leading-relaxed text-[#22D3A3]">{sql}</pre>
                </details>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#1E1E2E] bg-[#111118] shadow-lg">
                <div className="max-h-[26rem] overflow-auto">
                  <table className="min-w-full border-collapse text-center text-sm text-[#F0F0FF]">
                    <thead className="sticky top-0 bg-[#141420] text-xs uppercase tracking-[0.12em] text-[#7B7B9A]">
                      <tr>
                        {columns.map((column) => (
                          <th key={column} className="border-b border-white/5 px-3 py-2 font-medium uppercase tracking-wider">
                            {formatColumnName(column)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-[#0A0A0F]' : 'bg-[#16161F]'}>
                          {columns.map((column) => (
                            <td key={`${rowIndex}-${column}`} className="border-b border-white/5 px-3 py-2 align-top text-[#D6D6EA]">
                              {renderCell(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
