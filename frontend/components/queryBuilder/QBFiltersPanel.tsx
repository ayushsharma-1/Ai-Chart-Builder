'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';

import { FilterStep, QueryPlan } from '@/types/queryBuilder';
import { getTableColumns, isDateLikeColumn } from '@/lib/dataModel';
import { prettyColumn, tableLabel } from './QBFieldList';

interface QBFiltersPanelProps {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
}

const OPERATORS: Array<{ value: FilterStep['operator']; label: string }> = [
  { value: '=', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: '>', label: 'greater than' },
  { value: '<', label: 'less than' },
  { value: '>=', label: 'at least' },
  { value: '<=', label: 'at most' },
  { value: 'LIKE', label: 'contains' },
  { value: 'IN', label: 'in list' },
];

function activeTables(plan: QueryPlan) {
  return Array.from(new Set([plan.table, ...plan.joins.map((join) => join.table)].filter((table): table is string => Boolean(table))));
}

function availableColumns(plan: QueryPlan) {
  return activeTables(plan).flatMap((table) => getTableColumns(table).map((column) => ({ table, column })));
}

function filterValueToInput(value: FilterStep['value']) {
  return Array.isArray(value) ? value.join(', ') : String(value ?? '');
}

  function filterPlaceholder(filter: FilterStep) {
    if (filter.operator === 'IN') {
      return 'val1, val2, val3';
    }

    if (isDateLikeColumn(filter.column)) {
      return 'YYYY-MM-DD';
    }

    return 'Value';
  }

export default function QBFiltersPanel({ plan, onChange }: Readonly<QBFiltersPanelProps>) {
  const [open, setOpen] = useState(plan.filters.length > 0);
  const columns = availableColumns(plan);

  function addFilter() {
    const firstColumn = columns[0] ?? (plan.table ? { table: plan.table, column: 'id' } : null);
    if (!firstColumn) return;

    setOpen(true);
    onChange({
      ...plan,
      filters: [...plan.filters, { table: firstColumn.table, column: firstColumn.column, operator: '=', value: '' }],
    });
  }

  function updateFilter(index: number, next: FilterStep) {
    onChange({
      ...plan,
      filters: plan.filters.map((filter, filterIndex) => (filterIndex === index ? next : filter)),
    });
  }

  function removeFilter(index: number) {
    onChange({
      ...plan,
      filters: plan.filters.filter((_, filterIndex) => filterIndex !== index),
    });
  }

  return (
    <section className="border-b border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full select-none items-center gap-2 border-b border-slate-200 px-6 py-3 text-left transition-colors hover:bg-slate-50"
      >
        {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
        <span className="font-syne text-sm font-semibold text-slate-900">Filters</span>
        {plan.filters.length > 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{plan.filters.length}</span>}
        <span className="flex-1" />
        <button
          type="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            addFilter();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              addFilter();
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
        >
          <Plus size={13} />
          Add filter
        </button>
      </button>

      {open && (
        <div className="px-6 py-4">
          {plan.filters.length === 0 ? (
            <p className="text-sm text-slate-500">No filters applied</p>
          ) : (
            <div className="space-y-2">
              {plan.filters.map((filter, index) => {
                const columnKey = `${filter.table}.${filter.column}`;
                const value = filterValueToInput(filter.value);

                return (
                  <div key={`${columnKey}-${index}`}>
                    {index > 0 && <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">AND</div>}
                    <div className="grid grid-cols-[minmax(160px,1.4fr)_minmax(130px,0.8fr)_minmax(140px,1fr)_auto] gap-2">
                      <select
                        value={columnKey}
                        onChange={(event) => {
                          const [table, column] = event.target.value.split('.');
                          updateFilter(index, { ...filter, table, column });
                        }}
                        className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-400"
                      >
                        {columns.map(({ table, column }) => (
                          <option key={`${table}.${column}`} value={`${table}.${column}`}>
                            {tableLabel(table)} / {prettyColumn(column)}
                          </option>
                        ))}
                      </select>

                      <select
                        value={filter.operator}
                        onChange={(event) => updateFilter(index, { ...filter, operator: event.target.value as FilterStep['operator'] })}
                        className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-400"
                      >
                        {OPERATORS.map((operator) => (
                          <option key={operator.value} value={operator.value}>
                            {operator.label}
                          </option>
                        ))}
                      </select>

                      <input
                        value={value}
                        onChange={(event) => {
                          const nextValue = filter.operator === 'IN'
                            ? event.target.value.split(',').map((item) => item.trim()).filter(Boolean)
                            : event.target.value;

                          updateFilter(index, { ...filter, value: nextValue });
                        }}
                        placeholder={filterPlaceholder(filter)}
                        className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400"
                      />

                      <button
                        type="button"
                        onClick={() => removeFilter(index)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-200 hover:text-red-500"
                        aria-label="Remove filter"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
