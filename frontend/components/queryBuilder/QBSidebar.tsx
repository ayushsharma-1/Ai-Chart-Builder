'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, LayoutGrid, Plus, Search, X } from 'lucide-react';

import { AggregateFunction, ColumnStep, QueryPlan } from '@/types/queryBuilder';
import { SchemaTableDefinition, getTableDefinition } from '@/lib/dataModel';
import QBJoinPanel from './QBJoinPanel';
import { QBFieldRow, defaultAlias, prettyColumn, tableLabel } from './QBFieldList';

interface QBSidebarProps {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  schema: readonly SchemaTableDefinition[];
}

function emptyPlan(table: string | null = null): QueryPlan {
  return {
    table,
    joins: [],
    columns: [],
    filters: [],
    groupBy: [],
    orderBy: [],
    limit: 1000,
  };
}

function matchesSearch(value: string, search: string) {
  const normalized = search.trim().toLowerCase();
  return normalized === '' || value.toLowerCase().includes(normalized) || prettyColumn(value).toLowerCase().includes(normalized);
}

export default function QBSidebar({ plan, onChange, schema }: Readonly<QBSidebarProps>) {
  const [search, setSearch] = useState('');
  const [joinPanelOpen, setJoinPanelOpen] = useState(false);
  const [joinsOpen, setJoinsOpen] = useState(true);

  const currentTable = getTableDefinition(plan.table) ?? schema.find((table) => table.name === plan.table) ?? null;
  const tableSearchResults = useMemo(
    () => schema.filter((table) => matchesSearch(table.name, search) || matchesSearch(tableLabel(table.name), search)),
    [schema, search],
  );

  const selectedColumns = useMemo<Map<string, ColumnStep>>(
    () => new Map(plan.columns.map((column) => [`${column.table}.${column.column}`, column])),
    [plan.columns],
  );

  function toggleColumn(column: string) {
    if (!plan.table) return;

    const key = `${plan.table}.${column}`;
    const selected = selectedColumns.get(key);

    if (selected) {
      onChange({
        ...plan,
        columns: plan.columns.filter((item) => !(item.table === plan.table && item.column === column)),
      });
      return;
    }

    const nextColumn: ColumnStep = {
      table: plan.table,
      column,
      alias: defaultAlias(plan.table, column),
      aggregate: 'none',
    };

    onChange({ ...plan, columns: [...plan.columns, nextColumn] });
  }

  function updateColumn(table: string, column: string, updater: (current: ColumnStep) => ColumnStep) {
    onChange({
      ...plan,
      columns: plan.columns.map((item) => (item.table === table && item.column === column ? updater(item) : item)),
    });
  }

  function removeColumn(table: string, column: string) {
    onChange({
      ...plan,
      columns: plan.columns.filter((item) => !(item.table === table && item.column === column)),
    });
  }

  function selectAllColumns() {
    if (!plan.table || !currentTable) return;

    const existing = new Set(plan.columns.filter((column) => column.table === plan.table).map((column) => column.column));
    const additions: ColumnStep[] = currentTable.columns
      .filter((column) => !existing.has(column))
      .map((column) => ({
        table: plan.table as string,
        column,
        alias: defaultAlias(plan.table as string, column),
        aggregate: 'none',
      }));

    if (additions.length > 0) {
      onChange({ ...plan, columns: [...plan.columns, ...additions] });
    }
  }

  function removeJoin(index: number) {
    onChange({ ...plan, joins: plan.joins.filter((_, joinIndex) => joinIndex !== index) });
  }

  if (!plan.table) {
    return (
      <aside className="h-full w-72 shrink-0 overflow-y-auto border-r border-white/5 bg-[#0A0A0F]">
        <div className="border-b border-white/5 px-4 py-4">
          <h1 className="font-syne text-base font-semibold text-[#F0F0FF]">Tables</h1>
          <div className="relative mt-3">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#44445E]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tables"
              className="h-9 w-full rounded-lg border border-white/10 bg-[#111118] pl-9 pr-3 text-sm text-[#F0F0FF] outline-none placeholder:text-[#44445E] focus:border-[#6366F1]/50"
            />
          </div>
        </div>

        <div className="p-3">
          {tableSearchResults.map((table) => (
            <button
              key={table.name}
              type="button"
              onClick={() => {
                setSearch('');
                onChange(emptyPlan(table.name));
              }}
              className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-[#D6D6EA] transition-colors hover:bg-white/[0.03] hover:text-[#F0F0FF]"
            >
              <LayoutGrid size={14} className="text-[#6366F1]" />
              <span>{tableLabel(table.name)}</span>
            </button>
          ))}
        </div>
      </aside>
    );
  }

  const filteredColumns = (currentTable?.columns ?? []).filter((column) => matchesSearch(column, search));
  const dimensions = filteredColumns.filter((column) => selectedColumns.get(`${plan.table}.${column}`)?.aggregate !== 'COUNT'
    && selectedColumns.get(`${plan.table}.${column}`)?.aggregate !== 'SUM'
    && selectedColumns.get(`${plan.table}.${column}`)?.aggregate !== 'AVG'
    && selectedColumns.get(`${plan.table}.${column}`)?.aggregate !== 'MAX'
    && selectedColumns.get(`${plan.table}.${column}`)?.aggregate !== 'MIN');
  const metrics = plan.columns.filter((column) => column.table === plan.table && column.aggregate !== 'none' && matchesSearch(column.column, search));

  return (
    <aside className="h-full w-72 shrink-0 overflow-y-auto border-r border-white/5 bg-[#0A0A0F]">
      <div className="border-b border-white/5 px-4 py-4">
        <div className="flex items-center gap-1.5 text-sm">
          <button
            type="button"
            onClick={() => {
              setSearch('');
              onChange(emptyPlan());
            }}
            className="text-[#7B7B9A] hover:text-[#F0F0FF]"
          >
            Tables
          </button>
          <span className="text-[#44445E]">›</span>
          <span className="min-w-0 truncate font-semibold text-[#F0F0FF]">{tableLabel(plan.table)}</span>
        </div>

        <div className="relative mt-3">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#44445E]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search dimensions + metrics"
            className="h-9 w-full rounded-lg border border-white/10 bg-[#111118] pl-9 pr-3 text-sm text-[#F0F0FF] outline-none placeholder:text-[#44445E] focus:border-[#6366F1]/50"
          />
        </div>
      </div>

      <section className="border-b border-white/5 px-3 py-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="font-syne text-xs uppercase tracking-[0.14em] text-[#7B7B9A]">Dimensions</h2>
          <button type="button" onClick={selectAllColumns} className="text-xs font-medium text-[#6366F1] hover:text-[#A5B4FC]">
            Select All
          </button>
        </div>

        <div className="max-h-[38vh] space-y-1 overflow-y-auto pr-1">
          {dimensions.length === 0 ? (
            <p className="px-2 py-4 text-sm text-[#44445E]">No dimensions found.</p>
          ) : (
            dimensions.map((column) => {
              const selected = selectedColumns.get(`${plan.table}.${column}`);
              return (
                <QBFieldRow
                  key={column}
                  table={plan.table as string}
                  column={column}
                  selected={selected}
                  onToggle={() => toggleColumn(column)}
                  onAliasChange={(alias) => updateColumn(plan.table as string, column, (current) => ({ ...current, alias }))}
                  onAggregateChange={(aggregate: AggregateFunction) =>
                    updateColumn(plan.table as string, column, (current) => ({
                      ...current,
                      aggregate,
                      alias: defaultAlias(current.table, current.column, aggregate),
                    }))
                  }
                  onRemove={() => removeColumn(plan.table as string, column)}
                />
              );
            })
          )}
        </div>
      </section>

      <section className="border-b border-white/5 px-3 py-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="font-syne text-xs uppercase tracking-[0.14em] text-[#7B7B9A]">Metrics</h2>
          <span className="text-xs text-[#44445E]">{metrics.length}</span>
        </div>

        <div className="max-h-[22vh] space-y-1 overflow-y-auto pr-1">
          {metrics.length === 0 ? (
            <p className="px-2 py-4 text-sm text-[#44445E]">No metrics selected.</p>
          ) : (
            metrics.map((column) => (
              <QBFieldRow
                key={`${column.table}.${column.column}`}
                table={column.table}
                column={column.column}
                selected={column}
                onToggle={() =>
                  updateColumn(column.table, column.column, (current) => ({
                    ...current,
                    aggregate: 'none',
                    alias: defaultAlias(current.table, current.column, 'none'),
                  }))
                }
                onAliasChange={(alias) => updateColumn(column.table, column.column, (current) => ({ ...current, alias }))}
                onAggregateChange={(aggregate) =>
                  updateColumn(column.table, column.column, (current) => ({
                    ...current,
                    aggregate,
                    alias: defaultAlias(current.table, current.column, aggregate),
                  }))
                }
                onRemove={() => removeColumn(column.table, column.column)}
              />
            ))
          )}
        </div>
      </section>

      <section className="px-3 py-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setJoinsOpen((current) => !current)}
            className="flex items-center gap-1 font-syne text-xs uppercase tracking-[0.14em] text-[#7B7B9A]"
          >
            <ChevronDown size={14} className={`transition-transform duration-200 ${joinsOpen ? '' : '-rotate-90'}`} />
            Joins
          </button>
          <button
            type="button"
            onClick={() => setJoinPanelOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#7B7B9A] hover:bg-white/5 hover:text-[#F0F0FF]"
            aria-label="Add join"
          >
            <Plus size={14} />
          </button>
        </div>

        {joinsOpen && (
          <div className="space-y-2">
            {plan.joins.length === 0 ? (
              <p className="px-2 py-3 text-sm text-[#44445E]">No joins added.</p>
            ) : (
              plan.joins.map((join, index) => (
                <div key={`${join.table}-${join.leftCol}-${join.rightCol}-${index}`} className="flex items-center gap-2 rounded-lg border border-white/5 bg-[#111118] px-2 py-2">
                  <span className="rounded bg-[#6366F1]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#A5B4FC]">{join.joinType}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-[#D6D6EA]">{tableLabel(join.table)}</span>
                  <button
                    type="button"
                    onClick={() => removeJoin(index)}
                    className="text-[#44445E] hover:text-[#F87171]"
                    aria-label={`Remove ${tableLabel(join.table)} join`}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {joinPanelOpen && <QBJoinPanel plan={plan} onChange={onChange} schema={schema} onClose={() => setJoinPanelOpen(false)} />}
    </aside>
  );
}
