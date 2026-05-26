'use client';

import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { QueryPlan, OrderByStep } from '@/src/types/queryBuilder';
import { SchemaTableDefinition } from '@/src/lib/dataModel';

interface Props {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  schema: readonly SchemaTableDefinition[];
}

function selectedColumnKey(tableName: string, columnName: string) {
  return `${tableName}.${columnName}`;
}

function selectedColumnLabel(tableName: string, columnName: string, alias: string) {
  return alias || `${tableName}_${columnName}`;
}

function formatColumnName(columnName: string) {
  const withoutTablePrefix = columnName.startsWith('tbl') && columnName.includes('_') ? columnName.slice(columnName.indexOf('_') + 1) : columnName;

  return withoutTablePrefix
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function updateGroupBy(plan: QueryPlan, key: string, checked: boolean) {
  const nextGroupBy = checked
    ? Array.from(new Set([...plan.groupBy, key]))
    : plan.groupBy.filter((entry) => entry !== key);

  return {
    ...plan,
    groupBy: nextGroupBy,
  };
}

function updateOrderBy(plan: QueryPlan, nextOrderBy: OrderByStep[]) {
  return {
    ...plan,
    orderBy: nextOrderBy,
  };
}

export default function StepGroupSort({ plan, onChange }: Readonly<Props>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  if (!plan.table) {
    return (
      <section className="rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] px-6 py-4 shadow-xl shadow-black/20">
        <p className="text-sm text-[#7B7B9A]">Choose a base table first.</p>
      </section>
    );
  }

  const selectableColumns = plan.columns.filter((column) => column.aggregate === 'none');
  const availableSortColumns = selectableColumns.filter((column) => !plan.orderBy.some((order) => order.alias === (column.alias || `${column.table}_${column.column}`)));

  const reorderSort = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return;
    }

    const nextOrderBy = [...plan.orderBy];
    const [moved] = nextOrderBy.splice(fromIndex, 1);
    nextOrderBy.splice(toIndex, 0, moved);
    onChange(updateOrderBy(plan, nextOrderBy));
  };

  return (
    <section className="space-y-6 rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] px-6 py-4 shadow-xl shadow-black/20">
      <div className="mb-8">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#6366F1]">STEP 5</p>
        <h2 className="text-2xl font-bold text-[#F0F0FF]">Group and sort</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#7B7B9A]">Group by raw selected columns, then arrange the output order with drag-and-drop sorting.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-[#F0F0FF]">Group by</h3>
          <div className="my-6 border-t border-white/10" />
          <div className="mt-3 space-y-2">
            {selectableColumns.length > 0 &&
              selectableColumns.map((column) => {
                const key = selectedColumnKey(column.table, column.column);
                const checked = plan.groupBy.includes(key);

                return (
                  <label key={key} className="mb-2 flex items-center gap-3 rounded-lg border border-white/5 bg-[#16161F] p-3 text-sm text-[#D6D6EA]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => onChange(updateGroupBy(plan, key, event.target.checked))}
                      className="h-4 w-4 rounded border-[#3F3F5C] bg-[#111118] text-[#6366F1] focus:ring-[#6366F1]"
                    />
                    <span className="min-w-0 flex-1 truncate">{formatColumnName(selectedColumnLabel(column.table, column.column, column.alias))}</span>
                  </label>
                );
              })
            }
          </div>
        </div>

        <div className="mt-6 lg:mt-0">
          <h3 className="text-sm font-medium text-[#F0F0FF]">Sort order</h3>
          <div className="my-6 border-t border-white/10" />
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-[#171722] px-2.5 py-1 text-[11px] text-[#7B7B9A]">Drag to reorder</span>
          </div>

          <div className="mt-3 space-y-2">
            {plan.orderBy.length > 0 &&
              plan.orderBy.map((sortItem, index) => (
                <div
                  key={`${sortItem.alias}-${index}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex === null) {
                      return;
                    }

                    reorderSort(dragIndex, index);
                    setDragIndex(null);
                  }}
                  className="mb-2 flex items-center gap-3 rounded-lg border border-white/5 bg-[#16161F] p-3"
                >
                  <GripVertical size={14} className="text-[#7B7B9A]" />
                  <span className="min-w-0 flex-1 truncate text-sm text-[#D6D6EA]">{formatColumnName(sortItem.alias)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextDirection = sortItem.direction === 'ASC' ? 'DESC' : 'ASC';
                      onChange(updateOrderBy(plan, plan.orderBy.map((item, itemIndex) => (itemIndex === index ? { ...item, direction: nextDirection } : item))));
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#1E1E2E] bg-[#111118] px-2.5 text-xs text-[#F0F0FF] transition-colors hover:border-[#6366F1]/40"
                  >
                    {sortItem.direction === 'ASC' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    {sortItem.direction}
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(updateOrderBy(plan, plan.orderBy.filter((_, itemIndex) => itemIndex !== index)))}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#1E1E2E] bg-[#111118] text-[#F87171] transition-colors hover:border-[#F87171]/40 hover:bg-[#2A1216]"
                    aria-label="Remove sort"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            }
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {availableSortColumns.map((column) => {
              const alias = column.alias || `${column.table}_${column.column}`;

              return (
                <button
                  key={alias}
                  type="button"
                  onClick={() => {
                    onChange(
                      updateOrderBy(plan, [
                        ...plan.orderBy,
                        {
                          alias,
                          direction: 'ASC',
                        },
                      ]),
                    );
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-[#1E1E2E] bg-[#0A0A0F] px-3 py-1.5 text-xs text-[#7B7B9A] transition-colors hover:border-[#6366F1]/40 hover:text-[#F0F0FF]"
                >
                  <Plus size={12} />
                  {formatColumnName(alias)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
