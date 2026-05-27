'use client';

import { useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';

import { AggregateFunction, ColumnStep } from '@/types/queryBuilder';
import { isDateLikeColumn, isNumericColumn } from '@/lib/dataModel';

export const TABLE_LABELS: Record<string, string> = {
  tblcandidate: 'Candidates',
  tblassignjobcandidate: 'Pipeline',
  tbldeals: 'Deals',
  tbljob: 'Jobs',
};

const AGGREGATES: AggregateFunction[] = ['none', 'SUM', 'AVG', 'COUNT', 'MAX', 'MIN'];

export function tableLabel(table: string | null | undefined) {
  if (!table) return 'No table selected';
  return TABLE_LABELS[table] ?? table;
}

export function prettyColumn(name: string) {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function defaultAlias(table: string, column: string, aggregate: AggregateFunction = 'none') {
  if (aggregate === 'COUNT') return `count_${table}`;
  if (aggregate !== 'none') return `${aggregate.toLowerCase()}_${table}_${column}`;
  return `${table}_${column}`;
}

function fieldKind(column: string): 'id' | 'numeric' | 'date' | 'text' {
  if (column === 'id' || column.endsWith('id')) return 'id';
  if (isDateLikeColumn(column)) return 'date';
  if (isNumericColumn(column)) return 'numeric';
  return 'text';
}

function TypeBadge({ column }: Readonly<{ column: string }>) {
  const kind = fieldKind(column);

  if (kind === 'numeric') {
    return <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">123</span>;
  }

  if (kind === 'date') {
    return <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">📅</span>;
  }

  if (kind === 'id') {
    return <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">🔑</span>;
  }

  return <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">Abc</span>;
}

interface QBFieldRowProps {
  table: string;
  column: string;
  selected?: ColumnStep;
  onToggle: () => void;
  onAliasChange?: (alias: string) => void;
  onAggregateChange?: (aggregate: AggregateFunction) => void;
  onRemove?: () => void;
}

export function QBFieldRow({
  table,
  column,
  selected,
  onToggle,
  onAliasChange,
  onAggregateChange,
  onRemove,
}: Readonly<QBFieldRowProps>) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-9 w-full items-center gap-2 rounded-lg border-l-2 px-2 text-left text-sm transition-colors hover:bg-slate-50 ${
            selected ? 'border-l-blue-600 bg-blue-50 text-slate-900' : 'border-l-transparent text-slate-500'
        }`}
      >
        <TypeBadge column={column} />
        <span className="min-w-0 flex-1 truncate">{prettyColumn(column)}</span>
        {selected && selected.aggregate !== 'none' && (
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
            {selected.aggregate}
          </span>
        )}
        {selected ? (
          <button
            type="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((current) => !current);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                setMenuOpen((current) => !current);
              }
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-900"
            aria-label={`Edit ${prettyColumn(column)}`}
          >
            <MoreHorizontal size={15} />
          </button>
        ) : (
          <span className="font-mono text-[10px] text-slate-400">{table}</span>
        )}
      </button>

      {selected && menuOpen && (
        <div className="absolute right-1 top-9 z-30 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-200/70">
          <label className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <span>Alias</span>
            <div className="mt-1">
            <input
              value={selected.alias}
              onChange={(event) => onAliasChange?.(event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-2 font-dm-sans text-xs normal-case tracking-normal text-slate-900 outline-none focus:border-blue-400"
            />
            </div>
          </label>

          <label className="mt-3 block text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <span>Aggregate</span>
            <div className="mt-1">
              <select
              value={selected.aggregate}
              onChange={(event) => onAggregateChange?.(event.target.value as AggregateFunction)}
              className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-2 font-dm-sans text-xs normal-case tracking-normal text-slate-900 outline-none focus:border-blue-400"
            >
              {AGGREGATES.map((aggregate) => (
                <option key={aggregate} value={aggregate}>
                  {aggregate}
                </option>
              ))}
              </select>
            </div>
          </label>

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onRemove?.();
            }}
            className="mt-3 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-red-500 hover:bg-red-50"
          >
            Remove
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
