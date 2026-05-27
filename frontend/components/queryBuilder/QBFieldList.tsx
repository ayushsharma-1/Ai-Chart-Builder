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
    return <span className="rounded-md bg-[#6366F1]/10 px-1.5 py-0.5 text-[10px] text-[#A5B4FC]">123</span>;
  }

  if (kind === 'date') {
    return <span className="rounded-md bg-[#22D3A3]/10 px-1.5 py-0.5 text-[10px] text-[#22D3A3]">📅</span>;
  }

  if (kind === 'id') {
    return <span className="rounded-md bg-[#F59E0B]/10 px-1.5 py-0.5 text-[10px] text-[#FBBF24]">🔑</span>;
  }

  return <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-[#7B7B9A]">Abc</span>;
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
        className={`flex h-9 w-full items-center gap-2 rounded-lg border-l-2 px-2 text-left text-sm transition-colors hover:bg-white/[0.03] ${
          selected ? 'border-l-[#6366F1] bg-[#6366F1]/10 text-[#F0F0FF]' : 'border-l-transparent text-[#7B7B9A]'
        }`}
      >
        <TypeBadge column={column} />
        <span className="min-w-0 flex-1 truncate">{prettyColumn(column)}</span>
        {selected && selected.aggregate !== 'none' && (
          <span className="rounded bg-[#6366F1]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#A5B4FC]">
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
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#7B7B9A] hover:bg-white/5 hover:text-[#F0F0FF]"
            aria-label={`Edit ${prettyColumn(column)}`}
          >
            <MoreHorizontal size={15} />
          </button>
        ) : (
          <span className="font-mono text-[10px] text-[#7B7B9A]">{table}</span>
        )}
      </button>

      {selected && menuOpen && (
        <div className="absolute right-1 top-9 z-30 w-56 rounded-lg border border-white/5 bg-[#111118] p-3 shadow-2xl shadow-black/40">
          <label className="block text-[10px] uppercase tracking-[0.14em] text-[#7B7B9A]">
            <span>Alias</span>
            <div className="mt-1">
            <input
              value={selected.alias}
              onChange={(event) => onAliasChange?.(event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-white/10 bg-[#0A0A0F] px-2 font-dm-sans text-xs normal-case tracking-normal text-[#F0F0FF] outline-none focus:border-[#6366F1]/50"
            />
            </div>
          </label>

          <label className="mt-3 block text-[10px] uppercase tracking-[0.14em] text-[#7B7B9A]">
            <span>Aggregate</span>
            <div className="mt-1">
              <select
              value={selected.aggregate}
              onChange={(event) => onAggregateChange?.(event.target.value as AggregateFunction)}
              className="mt-1 h-8 w-full rounded-md border border-white/10 bg-[#0A0A0F] px-2 font-dm-sans text-xs normal-case tracking-normal text-[#F0F0FF] outline-none focus:border-[#6366F1]/50"
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
            className="mt-3 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-[#F87171] hover:bg-[#F87171]/10"
          >
            Remove
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
