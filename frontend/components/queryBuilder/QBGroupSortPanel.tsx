'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Plus, X } from 'lucide-react';

import { QueryPlan } from '@/types/queryBuilder';
import { prettyColumn } from './QBFieldList';

interface QBGroupSortPanelProps {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
}

function columnAlias(table: string, column: string, alias?: string) {
  return alias || `${table}_${column}`;
}

function prettyAlias(alias: string) {
  const clean = alias.startsWith('tbl') && alias.includes('_') ? alias.slice(alias.indexOf('_') + 1) : alias;
  return prettyColumn(clean);
}

export default function QBGroupSortPanel({ plan, onChange }: Readonly<QBGroupSortPanelProps>) {
  const [open, setOpen] = useState(() => plan.groupBy.length > 0 || plan.orderBy.length > 0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const groupableColumns = plan.columns.filter((column) => column.aggregate === 'none');
  const sortedAliases = new Set(plan.orderBy.map((item) => item.alias));
  const sortableColumns = plan.columns.filter((column) => !sortedAliases.has(columnAlias(column.table, column.column, column.alias)));
  const activeCount = plan.groupBy.length + plan.orderBy.length;

  function toggleGroupBy(key: string, checked: boolean) {
    onChange({
      ...plan,
      groupBy: checked ? Array.from(new Set([...plan.groupBy, key])) : plan.groupBy.filter((item) => item !== key),
    });
  }

  function addSort(alias: string) {
    if (plan.orderBy.some((item) => item.alias === alias)) return;
    onChange({ ...plan, orderBy: [...plan.orderBy, { alias, direction: 'ASC' }] });
  }

  function toggleSortDirection(index: number) {
    onChange({
      ...plan,
      orderBy: plan.orderBy.map((item, itemIndex) =>
        itemIndex === index ? { ...item, direction: item.direction === 'ASC' ? 'DESC' : 'ASC' } : item,
      ),
    });
  }

  function removeSort(index: number) {
    onChange({ ...plan, orderBy: plan.orderBy.filter((_, itemIndex) => itemIndex !== index) });
  }

  function reorder(from: number, to: number) {
    if (from === to) return;

    const nextOrder = [...plan.orderBy];
    const [moved] = nextOrder.splice(from, 1);
    nextOrder.splice(to, 0, moved);
    onChange({ ...plan, orderBy: nextOrder });
  }

  return (
    <section className="border-b border-white/5 bg-[#0A0A0F]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full select-none items-center gap-2 border-b border-white/5 px-6 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <ChevronDown size={16} className={`text-[#7B7B9A] transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
        <span className="font-syne text-sm font-semibold text-[#F0F0FF]">Group &amp; Sort</span>
        {activeCount > 0 && (
          <span className="rounded bg-[#6366F1]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#A5B4FC]">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="grid gap-6 px-6 py-5 md:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7B7B9A]">Group By</p>
            {groupableColumns.length === 0 ? (
              <p className="text-sm text-[#44445E]">Select dimensions from the sidebar first.</p>
            ) : (
              <div className="space-y-1">
                {groupableColumns.map((column) => {
                  const key = `${column.table}.${column.column}`;
                  const checked = plan.groupBy.includes(key);
                  const label = columnAlias(column.table, column.column, column.alias);

                  return (
                    <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-[#D6D6EA] transition-colors hover:bg-white/[0.03]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleGroupBy(key, event.target.checked)}
                        className="h-4 w-4 shrink-0 rounded accent-[#6366F1]"
                      />
                      <span className="min-w-0 truncate">{prettyAlias(label)}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7B7B9A]">Sort Order</p>
              <span className="rounded-full border border-white/5 px-2 py-0.5 text-[10px] text-[#44445E]">Drag to reorder</span>
            </div>

            <div className="space-y-3">
              {plan.orderBy.length === 0 ? (
                <p className="text-sm text-[#44445E]">No sort applied.</p>
              ) : (
                <div className="space-y-1.5">
                  {plan.orderBy.map((item, index) => (
                    <div
                      key={`${item.alias}-${index}`}
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (dragIndex !== null) {
                          reorder(dragIndex, index);
                          setDragIndex(null);
                        }
                      }}
                      className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-[#111118] px-3 py-2.5"
                    >
                      <GripVertical size={14} className="shrink-0 cursor-grab text-[#44445E]" />
                      <span className="min-w-0 flex-1 truncate text-sm text-[#D6D6EA]">{prettyAlias(item.alias)}</span>
                      <button
                        type="button"
                        onClick={() => toggleSortDirection(index)}
                        className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-[#7B7B9A] hover:text-[#F0F0FF]"
                      >
                        {item.direction === 'ASC' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                        {item.direction}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSort(index)}
                        className="shrink-0 text-[#44445E] hover:text-[#F87171]"
                        aria-label="Remove sort"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {sortableColumns.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sortableColumns.map((column) => {
                    const alias = columnAlias(column.table, column.column, column.alias);

                    return (
                      <button
                        key={`${column.table}.${column.column}`}
                        type="button"
                        onClick={() => addSort(alias)}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/8 px-3 py-1.5 text-xs text-[#7B7B9A] transition-colors hover:border-white/15 hover:text-[#F0F0FF]"
                      >
                        <Plus size={12} />
                        <span className="truncate">{prettyAlias(alias)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
