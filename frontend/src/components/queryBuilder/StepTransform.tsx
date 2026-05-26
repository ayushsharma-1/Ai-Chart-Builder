'use client';

import { ArrowDown, ArrowUp, Play, Plus, X } from 'lucide-react';

import ChartRenderer from '@/components/chart/ChartRenderer';
import { ChartType } from '@/types';
import { DerivedFilterStep, QueryBuilderExecuteResult, TransformPlan } from '@/src/types/queryBuilder';
import { isDateLikeColumn } from '@/src/lib/dataModel';

interface Props {
  baseResult: QueryBuilderExecuteResult;
  transform: TransformPlan;
  onChange: (t: TransformPlan) => void;
  onRun: () => void;
  isRunning: boolean;
  error: string | null;
  derivedResult: QueryBuilderExecuteResult | null;
}

const OPERATORS: DerivedFilterStep['operator'][] = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'];

function prettyCol(c: string): string {
  const clean = c.startsWith('tbl') && c.includes('_') ? c.slice(c.indexOf('_') + 1) : c;
  return clean.split('_').filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function inferChartType(rows: Record<string, unknown>[], xAxis: string): ChartType {
  if (rows.length === 0) return 'table';
  if (isDateLikeColumn(xAxis)) return 'line';
  if (rows.length <= 8) return 'pie';
  if (rows.length > 30) return 'table';
  return 'bar';
}

export default function StepTransform({
  baseResult, transform, onChange, onRun, isRunning, error, derivedResult,
}: Readonly<Props>) {
  const columns = baseResult.data.length > 0 ? Object.keys(baseResult.data[0]) : [];

  function addFilter() {
    const col = columns[0] ?? '';
    onChange({ ...transform, filters: [...transform.filters, { column: col, operator: '=', value: '' }] });
  }

  function updateFilter(i: number, next: DerivedFilterStep) {
    onChange({ ...transform, filters: transform.filters.map((f, idx) => (idx === i ? next : f)) });
  }

  function removeFilter(i: number) {
    onChange({ ...transform, filters: transform.filters.filter((_, idx) => idx !== i) });
  }

  function addSort(col: string) {
    if (transform.orderBy.find((o) => o.column === col)) return;
    onChange({ ...transform, orderBy: [...transform.orderBy, { column: col, direction: 'ASC' }] });
  }

  function toggleDir(i: number) {
    onChange({
      ...transform,
      orderBy: transform.orderBy.map((o, idx) =>
        idx === i ? { ...o, direction: o.direction === 'ASC' ? 'DESC' : 'ASC' } : o,
      ),
    });
  }

  function removeSort(i: number) {
    onChange({ ...transform, orderBy: transform.orderBy.filter((_, idx) => idx !== i) });
  }

  const displayResult = derivedResult ?? null;
  const chartType = displayResult
    ? inferChartType(displayResult.data, displayResult.chartConfig.xAxis)
    : 'table';

  return (
    <div className="space-y-4">
      {/* Form card */}
      <div className="rounded-xl border border-white/5 bg-[#0E0E15]">
        {/* Header */}
        <div className="border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6366F1]">Step 8</p>
            <span className="rounded-full bg-[#22D3A3]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#22D3A3]">Optional</span>
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[#F0F0FF]">Transform results</h2>
          <p className="mt-1 text-sm text-[#7B7B9A]">
            Filter, sort, or limit the{' '}
            <span className="font-medium text-[#F0F0FF]">{baseResult.rowCount} rows</span>{' '}
            returned above. This compiles as a derived subquery — the original query is never modified.
          </p>
        </div>

        <div className="divide-y divide-white/5">
          {/* ── Filters ─────────────────────────────────────────────────── */}
          <div className="px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#7B7B9A]">Filter</p>
              <button
                type="button"
                onClick={addFilter}
                disabled={columns.length === 0}
                className="flex items-center gap-1.5 rounded-md border border-white/8 px-2.5 py-1 text-xs text-[#7B7B9A] transition-colors hover:text-[#F0F0FF] disabled:opacity-40"
              >
                <Plus size={11} />
                Add
              </button>
            </div>
            {transform.filters.length === 0 ? (
              <p className="text-sm text-[#44445E]">No filters — all rows pass through.</p>
            ) : (
              <div className="space-y-2">
                {transform.filters.map((f, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select
                      value={f.column}
                      onChange={(e) => updateFilter(i, { ...f, column: e.target.value })}
                      className="h-10 flex-[2] min-w-[140px] rounded-md border border-white/8 bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none focus:border-[#6366F1]/40 transition-colors"
                    >
                      {columns.map((c) => <option key={c} value={c}>{prettyCol(c)}</option>)}
                    </select>
                    <select
                      value={f.operator}
                      onChange={(e) => updateFilter(i, { ...f, operator: e.target.value as DerivedFilterStep['operator'] })}
                      className="h-10 w-24 rounded-md border border-white/8 bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none focus:border-[#6366F1]/40 transition-colors"
                    >
                      {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
                    </select>
                    <input
                      value={Array.isArray(f.value) ? f.value.join(', ') : String(f.value)}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateFilter(i, {
                          ...f,
                          value: f.operator === 'IN' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v,
                        });
                      }}
                      placeholder={f.operator === 'IN' ? 'val1, val2…' : 'Value'}
                      className="h-10 flex-[2] min-w-[120px] rounded-md border border-white/8 bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none placeholder:text-[#3F3F5C] focus:border-[#6366F1]/40 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => removeFilter(i)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/8 text-[#44445E] transition-colors hover:border-[#F87171]/30 hover:text-[#F87171]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Sort ─────────────────────────────────────────────────────── */}
          <div className="px-5 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7B7B9A]">Sort</p>
            <div className="space-y-2">
              {transform.orderBy.map((o, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-md border border-white/5 bg-[#111118] px-3 py-2.5">
                  <span className="flex-1 min-w-0 truncate text-sm text-[#D6D6EA]">{prettyCol(o.column)}</span>
                  <button
                    type="button"
                    onClick={() => toggleDir(i)}
                    className="flex items-center gap-1 rounded border border-white/8 px-2 py-1 text-xs font-medium text-[#7B7B9A] transition-colors hover:text-[#F0F0FF]"
                  >
                    {o.direction === 'ASC' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                    {o.direction}
                  </button>
                  <button type="button" onClick={() => removeSort(i)} className="shrink-0 text-[#3F3F5C] transition-colors hover:text-[#F87171]">
                    <X size={13} />
                  </button>
                </div>
              ))}
              {columns.filter((c) => !transform.orderBy.find((o) => o.column === c)).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {columns
                    .filter((c) => !transform.orderBy.find((o) => o.column === c))
                    .map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => addSort(c)}
                        className="flex items-center gap-1.5 rounded-md border border-white/8 px-3 py-1.5 text-sm text-[#7B7B9A] transition-colors hover:border-white/15 hover:text-[#F0F0FF]"
                      >
                        <Plus size={12} />
                        {prettyCol(c)}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Limit ────────────────────────────────────────────────────── */}
          <div className="px-5 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7B7B9A]">Limit</p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={5000}
                value={transform.limit}
                onChange={(e) => onChange({ ...transform, limit: Number(e.target.value) })}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/8 accent-[#6366F1]"
              />
              <input
                type="number"
                min={1}
                max={5000}
                value={transform.limit}
                onChange={(e) => onChange({ ...transform, limit: Math.max(1, Math.min(5000, Number(e.target.value) || 1000)) })}
                className="h-9 w-20 rounded-md border border-white/8 bg-[#0A0A0F] px-2 text-center text-sm text-[#F0F0FF] outline-none focus:border-[#6366F1]/40 transition-colors"
              />
            </div>
            <p className="mt-2 text-xs text-[#44445E]">Caps at 5000 rows</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-4 rounded-lg border border-[#F87171]/15 bg-[#F87171]/5 px-4 py-3 text-sm text-[#F87171]">
            {error}
          </div>
        )}

        {/* Apply button */}
        <div className="flex justify-center px-5 pb-5 pt-1">
          <button
            type="button"
            onClick={onRun}
            disabled={isRunning}
            className="flex items-center gap-2 rounded-lg bg-[#6366F1] px-8 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#5558E8] disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.99]"
          >
            <Play size={14} />
            {isRunning ? 'Running…' : 'Apply Transform'}
          </button>
        </div>
      </div>

      {/* Derived result card */}
      {displayResult && (
        <div className="rounded-xl border border-[#22D3A3]/15 bg-[#0E0E15]">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#22D3A3]">Derived Result</p>
              <h2 className="mt-1 text-lg font-semibold text-[#F0F0FF]">Transformed query results</h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#7B7B9A]">
              <span className="rounded-md bg-[#22D3A3]/10 px-2 py-1 text-[#34D399]">{displayResult.rowCount} rows</span>
              <span>{displayResult.executionTimeMs}ms</span>
            </div>
          </div>
          <div className="p-5">
            <ChartRenderer
              type={chartType}
              data={displayResult.data}
              xAxis={displayResult.chartConfig.xAxis}
              yAxis={displayResult.chartConfig.yAxis}
              seriesKeys={displayResult.chartConfig.seriesKeys}
            />
          </div>
          {displayResult.sql && (
            <div className="border-t border-white/5 px-5 py-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#44445E]">Derived SQL</p>
              <pre className="rounded-md bg-[#0A0A0F] px-4 py-3 font-mono text-[11px] leading-relaxed text-[#22D3A3] whitespace-pre-wrap break-all">
                {displayResult.sql}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
