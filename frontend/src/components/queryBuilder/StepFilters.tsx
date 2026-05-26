'use client';

import { Plus, X } from 'lucide-react';

import { QueryPlan, FilterStep } from '@/src/types/queryBuilder';
import { SchemaTableDefinition, getTableColumns, isDateLikeColumn } from '@/src/lib/dataModel';

interface Props {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  schema: readonly SchemaTableDefinition[];
}

const OPERATORS: FilterStep['operator'][] = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'];

function getActiveTables(plan: QueryPlan): string[] {
  return Array.from(new Set(
    [plan.table, ...plan.joins.map((j) => j.table)].filter((t): t is string => Boolean(t))
  ));
}

function getAvailableColumns(plan: QueryPlan): string[] {
  return getActiveTables(plan).flatMap((t) => getTableColumns(t).map((c) => `${t}.${c}`));
}

function prettyCol(name: string): string {
  const clean = name.startsWith('tbl') && name.includes('_') ? name.slice(name.indexOf('_') + 1) : name;
  return clean.split('_').filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export default function StepFilters({ plan, onChange }: Readonly<Props>) {
  if (!plan.table) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#0E0E15] px-5 py-4">
        <p className="text-sm text-[#7B7B9A]">Choose a base table first.</p>
      </div>
    );
  }

  const availableColumns = getAvailableColumns(plan);

  function addFilter() {
    const first = availableColumns[0] ?? `${plan.table}.id`;
    const [table, column] = first.split('.');
    onChange({ ...plan, filters: [...plan.filters, { table, column, operator: '=', value: '' }] });
  }

  function updateFilter(index: number, next: FilterStep) {
    onChange({ ...plan, filters: plan.filters.map((f, i) => (i === index ? next : f)) });
  }

  function removeFilter(index: number) {
    onChange({ ...plan, filters: plan.filters.filter((_, i) => i !== index) });
  }

  return (
    <div className="rounded-xl border border-white/5 bg-[#0E0E15]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6366F1]">Step 4</p>
          <h2 className="mt-1 text-lg font-semibold text-[#F0F0FF]">Filter rows</h2>
          <p className="mt-1 text-sm text-[#7B7B9A]">All filters are AND-combined.</p>
        </div>
        <button
          type="button"
          onClick={addFilter}
          className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-[#111118] px-3 py-2 text-xs text-[#7B7B9A] transition-colors hover:text-[#F0F0FF] hover:border-white/15"
        >
          <Plus size={12} />
          Add filter
        </button>
      </div>

      {/* Filter rows */}
      {plan.filters.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-[#44445E]">No filters — all rows will be returned.</p>
        </div>
      ) : (
        <div>
          {plan.filters.map((filter, index) => {
            const colKey = `${filter.table}.${filter.column}`;
            const isLast = index === plan.filters.length - 1;
            return (
              <div
                key={`${colKey}-${index}`}
                className={`flex flex-wrap items-center gap-3 px-5 py-4 ${!isLast ? 'border-b border-white/5' : ''}`}
              >
                {/* Column */}
                <select
                  value={colKey}
                  onChange={(e) => {
                    const [t, c] = e.target.value.split('.');
                    updateFilter(index, { ...filter, table: t, column: c });
                  }}
                  className="h-10 flex-[2] min-w-[160px] rounded-md border border-white/8 bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none focus:border-[#6366F1]/40 transition-colors"
                >
                  {availableColumns.map((ck) => (
                    <option key={ck} value={ck}>{prettyCol(ck.split('.').pop() ?? ck)}</option>
                  ))}
                </select>

                {/* Operator */}
                <select
                  value={filter.operator}
                  onChange={(e) => updateFilter(index, { ...filter, operator: e.target.value as FilterStep['operator'] })}
                  className="h-10 w-24 rounded-md border border-white/8 bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none focus:border-[#6366F1]/40 transition-colors"
                >
                  {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
                </select>

                {/* Value */}
                <input
                  value={Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateFilter(index, {
                      ...filter,
                      value: filter.operator === 'IN' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v,
                    });
                  }}
                  placeholder={
                    filter.operator === 'IN' ? 'val1, val2, …'
                    : isDateLikeColumn(filter.column) ? 'Unix timestamp'
                    : filter.operator === 'LIKE' ? '%pattern%'
                    : 'Value'
                  }
                  className="h-10 flex-[2] min-w-[140px] rounded-md border border-white/8 bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none placeholder:text-[#3F3F5C] focus:border-[#6366F1]/40 transition-colors"
                />

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeFilter(index)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/8 text-[#44445E] transition-colors hover:border-[#F87171]/30 hover:text-[#F87171]"
                  aria-label="Remove filter"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
