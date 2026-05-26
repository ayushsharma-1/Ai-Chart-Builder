'use client';

import { useState } from 'react';
import { GripVertical, Plus, X, ArrowUp, ArrowDown } from 'lucide-react';

import { QueryPlan, OrderByStep } from '@/src/types/queryBuilder';
import { SchemaTableDefinition } from '@/src/lib/dataModel';

interface Props {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  schema: readonly SchemaTableDefinition[];
}

function prettyAlias(alias: string): string {
  const clean = alias.startsWith('tbl') && alias.includes('_') ? alias.slice(alias.indexOf('_') + 1) : alias;
  return clean.split('_').filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export default function StepGroupSort({ plan, onChange }: Readonly<Props>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  if (!plan.table) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#0E0E15] px-5 py-4">
        <p className="text-sm text-[#7B7B9A]">Choose a base table first.</p>
      </div>
    );
  }

  const groupableCols = plan.columns.filter((c) => c.aggregate === 'none');
  const sortedSet = new Set(plan.orderBy.map((o) => o.alias));
  const sortableCols = groupableCols.filter((c) => !sortedSet.has(c.alias || `${c.table}_${c.column}`));

  function toggleGroupBy(key: string, checked: boolean) {
    onChange({ ...plan, groupBy: checked ? [...new Set([...plan.groupBy, key])] : plan.groupBy.filter((k) => k !== key) });
  }

  function addSort(alias: string) {
    onChange({ ...plan, orderBy: [...plan.orderBy, { alias, direction: 'ASC' }] });
  }

  function toggleDir(index: number) {
    onChange({ ...plan, orderBy: plan.orderBy.map((o, i) => i === index ? { ...o, direction: o.direction === 'ASC' ? 'DESC' : 'ASC' } : o) });
  }

  function removeSort(index: number) {
    onChange({ ...plan, orderBy: plan.orderBy.filter((_, i) => i !== index) });
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...plan.orderBy];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ ...plan, orderBy: next });
  }

  return (
    <div className="rounded-xl border border-white/5 bg-[#0E0E15]">
      {/* Header */}
      <div className="border-b border-white/5 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6366F1]">Step 5</p>
        <h2 className="mt-1 text-lg font-semibold text-[#F0F0FF]">Group &amp; sort</h2>
        <p className="mt-1 text-sm text-[#7B7B9A]">Group rows by fields and control the sort order of results.</p>
      </div>

      <div className="grid gap-0 divide-x divide-white/5 md:grid-cols-2">
        {/* GROUP BY */}
        <div className="p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7B7B9A]">Group by</p>
          {groupableCols.length === 0 ? (
            <p className="text-sm text-[#44445E]">Select non-aggregate columns first.</p>
          ) : (
            <div className="space-y-1">
              {groupableCols.map((col) => {
                const key = `${col.table}.${col.column}`;
                const checked = plan.groupBy.includes(key);
                const label = col.alias || `${col.table}_${col.column}`;
                return (
                  <label key={key} className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-white/3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleGroupBy(key, e.target.checked)}
                      className="h-4 w-4 shrink-0 rounded accent-[#6366F1]"
                    />
                    <span className="text-sm text-[#D6D6EA]">{prettyAlias(label)}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* ORDER BY */}
        <div className="p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7B7B9A]">Sort order</p>

          {plan.orderBy.length === 0 && sortableCols.length === 0 ? (
            <p className="text-sm text-[#44445E]">Select columns first.</p>
          ) : (
            <div className="space-y-3">
              {/* Current sorts */}
              {plan.orderBy.length > 0 && (
                <div className="space-y-1.5">
                  {plan.orderBy.map((item, index) => (
                    <div
                      key={`${item.alias}-${index}`}
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => { if (dragIndex !== null) { reorder(dragIndex, index); setDragIndex(null); } }}
                      className="flex items-center gap-2.5 rounded-md border border-white/5 bg-[#111118] px-3 py-2.5"
                    >
                      <GripVertical size={14} className="shrink-0 cursor-grab text-[#3F3F5C]" />
                      <span className="flex-1 min-w-0 truncate text-sm text-[#D6D6EA]">{prettyAlias(item.alias)}</span>
                      <button
                        type="button"
                        onClick={() => toggleDir(index)}
                        className="flex items-center gap-1 rounded border border-white/8 px-2 py-1 text-xs font-medium text-[#7B7B9A] transition-colors hover:text-[#F0F0FF]"
                      >
                        {item.direction === 'ASC' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                        {item.direction}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSort(index)}
                        className="shrink-0 text-[#3F3F5C] transition-colors hover:text-[#F87171]"
                        aria-label="Remove sort"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add sort */}
              {sortableCols.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sortableCols.map((col) => {
                    const alias = col.alias || `${col.table}_${col.column}`;
                    return (
                      <button
                        key={alias}
                        type="button"
                        onClick={() => addSort(alias)}
                        className="flex items-center gap-1.5 rounded-md border border-white/8 px-3 py-1.5 text-sm text-[#7B7B9A] transition-colors hover:text-[#F0F0FF] hover:border-white/15"
                      >
                        <Plus size={12} />
                        {prettyAlias(alias)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
