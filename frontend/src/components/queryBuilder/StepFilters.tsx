'use client';

import { Plus, Trash2 } from 'lucide-react';

import { QueryPlan, FilterStep } from '@/src/types/queryBuilder';
import { SchemaTableDefinition, getTableColumns, isDateLikeColumn } from '@/src/lib/dataModel';

interface Props {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  schema: readonly SchemaTableDefinition[];
}

const OPERATORS: FilterStep['operator'][] = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'];

function getActiveTables(plan: QueryPlan) {
  return Array.from(new Set([plan.table, ...plan.joins.map((join) => join.table)].filter((table): table is string => Boolean(table))));
}

function getAvailableColumns(plan: QueryPlan) {
  return getActiveTables(plan).flatMap((tableName) => getTableColumns(tableName).map((columnName) => `${tableName}.${columnName}`));
}

function formatColumnName(columnName: string) {
  const withoutTablePrefix = columnName.startsWith('tbl') && columnName.includes('_') ? columnName.slice(columnName.indexOf('_') + 1) : columnName;

  return withoutTablePrefix
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function updateFilter(plan: QueryPlan, nextFilter: FilterStep, index: number) {
  return {
    ...plan,
    filters: plan.filters.map((filter, filterIndex) => (filterIndex === index ? nextFilter : filter)),
  };
}

export default function StepFilters({ plan, onChange }: Readonly<Props>) {
  if (!plan.table) {
    return (
      <section className="rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] px-6 py-4 shadow-xl shadow-black/20">
        <p className="text-sm text-[#7B7B9A]">Choose a base table first.</p>
      </section>
    );
  }

  const availableColumns = getAvailableColumns(plan);

  const addFilter = () => {
    const defaultColumn = availableColumns[0] || `${plan.table}.id`;
    const [tableName, columnName] = defaultColumn.split('.');

    onChange({
      ...plan,
      filters: [
        ...plan.filters,
        {
          table: tableName,
          column: columnName,
          operator: '=',
          value: '',
        },
      ],
    });
  };

  return (
    <section className="space-y-6 rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] px-6 py-4 shadow-xl shadow-black/20">
      <div className="mb-8">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#6366F1]">STEP 4</p>
        <h2 className="text-2xl font-bold text-[#F0F0FF]">Filter the data</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#7B7B9A]">Add as many filters as you need. Every filter is combined with AND logic.</p>
      </div>

      <button
        type="button"
        onClick={addFilter}
        className="inline-flex items-center gap-2 rounded-xl border border-[#1E1E2E] bg-[#111118] px-3 py-2 text-sm text-[#F0F0FF] transition-colors hover:border-[#6366F1]/40 hover:bg-[#141420]"
      >
        <Plus size={14} />
        Add filter
      </button>

      {plan.filters.length > 0 && (
        <div className="space-y-3">
          {plan.filters.map((filter, index) => {
            const currentKey = `${filter.table}.${filter.column}`;
            return (
              <div key={`${currentKey}-${index}`} className="mb-3 rounded-xl border border-white/5 bg-[#16161F] p-4">
                <div className="flex flex-row items-end gap-3">
                  <label className="flex-1 grid gap-1.5 text-xs font-medium text-[#7B7B9A]">
                    Column
                    <select
                      value={currentKey}
                      onChange={(event) => {
                        const [tableName, columnName] = event.target.value.split('.');
                        onChange(updateFilter(plan, { ...filter, table: tableName, column: columnName }, index));
                      }}
                      className="h-10 rounded-xl border border-[#1E1E2E] bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none focus:border-[#6366F1]/50"
                    >
                      {availableColumns.map((columnKey) => (
                        <option key={columnKey} value={columnKey}>
                          {formatColumnName(columnKey.split('.').pop() || columnKey)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="w-[140px] grid gap-1.5 text-xs font-medium text-[#7B7B9A]">
                    Operator
                    <select
                      value={filter.operator}
                      onChange={(event) => onChange(updateFilter(plan, { ...filter, operator: event.target.value as FilterStep['operator'] }, index))}
                      className="h-10 rounded-xl border border-[#1E1E2E] bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none focus:border-[#6366F1]/50"
                    >
                      {OPERATORS.map((operator) => (
                        <option key={operator} value={operator}>
                          {operator}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex-1 grid gap-1.5 text-xs font-medium text-[#7B7B9A]">
                    Value
                    <input
                      value={Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        onChange(
                          updateFilter(plan, {
                            ...filter,
                            value: filter.operator === 'IN' ? nextValue.split(',').map((item) => item.trim()).filter(Boolean) : nextValue,
                          }, index),
                        );
                      }}
                      placeholder={isDateLikeColumn(filter.column) ? 'Unix timestamp or date string' : 'Filter value'}
                      className="h-10 rounded-xl border border-[#1E1E2E] bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none placeholder:text-[#3F3F5C] focus:border-[#6366F1]/50"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => onChange({ ...plan, filters: plan.filters.filter((_, filterIndex) => filterIndex !== index) })}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#1E1E2E] bg-[#0A0A0F] text-[#F87171] transition-colors hover:border-[#F87171]/40 hover:bg-[#2A1216]"
                    aria-label="Remove filter"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
