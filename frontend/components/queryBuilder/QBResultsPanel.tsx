'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Table2 } from 'lucide-react';

import { QueryBuilderExecuteResult, QueryPlan } from '@/types/queryBuilder';
import { prettyColumn } from './QBFieldList';

interface QBResultsPanelProps {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  previewData: Record<string, unknown>[];
  previewRowCount: number;
  previewExecutionTimeMs: number;
  previewLoading: boolean;
  previewError: string | null;
  finalResult: QueryBuilderExecuteResult | null;
  finalLoading: boolean;
  finalError: string | null;
  onRetry: () => void;
  openSignal?: number;
}

type ViewMode = 'pages' | 'scroll';

const PAGE_SIZE = 50;

function isNumericValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

  function SkeletonRows() {
  return (
    <div className="space-y-2 p-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="grid animate-pulse grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((__, cellIndex) => (
            <div key={cellIndex} className="h-9 rounded-lg bg-white/5" />
          ))}
        </div>
      ))}
    </div>
  );
}

  function EmptyState({ title, subtitle }: Readonly<{ title: string; subtitle: string }>) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/5 bg-[var(--surface-elevated)] text-[var(--accent)]">
        <Table2 size={24} />
      </div>
      <h3 className="mt-4 font-syne text-lg font-semibold text-[var(--foreground)]">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-[var(--text-secondary)]">{subtitle}</p>
    </div>
  );
}

export default function QBResultsPanel({
  plan,
  onChange,
  previewData,
  previewRowCount,
  previewExecutionTimeMs,
  previewLoading,
  previewError,
  finalResult,
  finalLoading,
  finalError,
  onRetry,
  openSignal,
}: Readonly<QBResultsPanelProps>) {
  const [open, setOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('pages');
  const [page, setPage] = useState(1);

  const mode = finalResult ? 'final' : 'preview';
  const data = finalResult?.data ?? previewData;
  const rowCount = finalResult?.rowCount ?? previewRowCount;
  const executionTime = finalResult?.executionTimeMs ?? previewExecutionTimeMs;
  const loading = finalLoading || (!finalResult && previewLoading);
  const error = finalError ?? (!finalResult ? previewError : null);
  const columns = data.length > 0 ? Object.keys(data[0]) : [];
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [data]);

  useEffect(() => {
    if (openSignal !== undefined) {
      setOpen(true);
    }
  }, [openSignal]);

  const pageData = useMemo(() => {
    if (viewMode === 'scroll') return data;
    const start = (page - 1) * PAGE_SIZE;
    return data.slice(start, start + PAGE_SIZE);
  }, [data, page, viewMode]);

  const numericColumns = columns.filter((column) => pageData.some((row) => isNumericValue(row[column])));
  const sort = plan.orderBy[0] ?? null;

  function toggleSort(alias: string) {
    const direction = sort?.alias === alias && sort.direction === 'ASC' ? 'DESC' : 'ASC';
    onChange({ ...plan, orderBy: [{ alias, direction }] });
  }

  function renderBody() {
    if (!plan.table) {
      return (
        <EmptyState
          title="Select a table"
          subtitle="To run a query, first select the table you want to explore."
        />
      );
    }

    if (plan.columns.length === 0) {
      return (
        <EmptyState
          title="Pick dimensions & metrics"
          subtitle="Select the fields you want from the sidebar on the left."
        />
      );
    }

    if (loading) return <SkeletonRows />;

    if (error) {
      return (
        <div className="p-6">
          <div className="rounded-lg border border-[var(--error)]/20 bg-[var(--error)]/5 p-4">
            <p className="text-sm text-[var(--error)]">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-lg border border-[var(--error)]/25 px-3 py-1.5 text-sm font-medium text-[var(--error)] hover:bg-[var(--error)]/10"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    if (data.length === 0) {
      return (
        <div className="flex min-h-[260px] items-center justify-center px-6 text-sm text-[var(--text-muted)]">
          No rows returned.
        </div>
      );
    }

    return (
      <div className="flex min-h-0 flex-col">
        <div className={viewMode === 'scroll' ? 'max-h-[620px] overflow-auto' : 'overflow-auto'}>
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--surface-elevated)]">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="border-b border-white/5 px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className="flex max-w-[220px] items-center gap-1.5 truncate hover:text-[var(--accent-foreground)]"
                      title={`Sort by ${prettyColumn(column)}`}
                    >
                      <span className="truncate">{prettyColumn(column)}</span>
                      {sort?.alias === column && (
                        sort.direction === 'ASC' ? <ArrowUp size={12} className="shrink-0 text-[var(--accent)]" /> : <ArrowDown size={12} className="shrink-0 text-[var(--accent)]" />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-[var(--background)]' : 'bg-white/[0.015]'}>
                  {columns.map((column) => {
                    const value = row[column];
                    const numeric = isNumericValue(value);

                    return (
                      <td key={column} className={`border-b border-white/[0.03] px-4 py-2.5 ${numeric ? 'text-right tabular-nums text-[var(--foreground)]' : 'text-left text-[var(--muted-foreground)]'}`}>
                        {value === null || value === undefined ? (
                          <span className="text-[var(--text-muted)]">—</span>
                        ) : (
                          <span className="block max-w-[280px] truncate" title={cellText(value)}>
                            {cellText(value)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {numericColumns.length > 0 && (
                <tr className="bg-[var(--surface-elevated)] font-semibold">
                  {columns.map((column, columnIndex) => {
                    const isNumericColumn = numericColumns.includes(column);
                    const total = isNumericColumn
                      ? pageData.reduce((sum, row) => sum + (isNumericValue(row[column]) ? Number(row[column]) : 0), 0)
                      : null;

                    return (
                      <td key={column} className={`border-t border-white/10 px-4 py-3 ${isNumericColumn ? 'text-right tabular-nums text-[var(--success)]' : 'text-left text-[var(--text-secondary)]'}`}>
                        {columnIndex === 0 ? 'Total' : isNumericColumn ? total?.toLocaleString() : ''}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-white/5 px-4 py-3 text-sm text-[var(--text-secondary)]">
          <div className="inline-flex rounded-lg border border-white/10 bg-[var(--surface-elevated)] p-1">
            {(['pages', 'scroll'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setViewMode(option)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${viewMode === option ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--foreground)]'}`}
              >
                {option === 'pages' ? 'Pages' : 'Scroll'}
              </button>
            ))}
          </div>
          {viewMode === 'pages' && (
            <>
              <span className="ml-auto">Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[var(--text-secondary)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous page"
              >
                <ArrowLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[var(--text-secondary)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next page"
              >
                <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="border-b border-white/5 bg-[var(--background)]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full select-none items-center gap-2 border-b border-white/5 px-6 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <ChevronDown size={16} className={`text-[var(--text-secondary)] transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
        <span className="font-syne text-sm font-semibold text-[var(--foreground)]">Results</span>
        {data.length > 0 && (
          <span className="rounded bg-[var(--success)]/10 px-2 py-0.5 text-xs font-medium text-[var(--success)]">
            {mode === 'final' ? 'Results' : 'Preview'} · {rowCount} rows · {executionTime}ms
          </span>
        )}
        <span className="flex-1" />
        <span className="rounded-lg border border-white/5 px-2.5 py-1.5 text-xs text-[var(--text-muted)] opacity-60">
          Table calculation
        </span>
      </button>

      {open && renderBody()}
    </section>
  );
}
