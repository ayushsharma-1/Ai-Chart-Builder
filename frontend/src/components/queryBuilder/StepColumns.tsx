'use client';

import { ChevronDown } from 'lucide-react';

import { QueryPlan, AggregateFunction, ColumnStep } from '@/src/types/queryBuilder';
import { SchemaTableDefinition, getTableDefinition, isNumericColumn } from '@/src/lib/dataModel';

interface Props {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  schema: readonly SchemaTableDefinition[];
}

function defaultAlias(tableName: string, columnName: string, aggregate: AggregateFunction) {
  if (aggregate === 'COUNT') {
    return `count_${tableName}`;
  }

  if (aggregate !== 'none') {
    return `${aggregate.toLowerCase()}_${tableName}_${columnName}`;
  }

  return `${tableName}_${columnName}`;
}

function formatColumnName(columnName: string) {
  const withoutTablePrefix = columnName.startsWith('tbl') && columnName.includes('_') ? columnName.slice(columnName.indexOf('_') + 1) : columnName;

  return withoutTablePrefix
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getActiveTables(plan: QueryPlan) {
  return Array.from(new Set([plan.table, ...plan.joins.map((join) => join.table)].filter((table): table is string => Boolean(table))));
}

function updateColumns(plan: QueryPlan, nextColumns: ColumnStep[]) {
  return {
    ...plan,
    columns: nextColumns,
  };
}

function toggleColumn(plan: QueryPlan, tableName: string, columnName: string) {
  const exists = plan.columns.find((column) => column.table === tableName && column.column === columnName);

  if (exists) {
    return updateColumns(plan, plan.columns.filter((column) => !(column.table === tableName && column.column === columnName)));
  }

  return updateColumns(plan, [
    ...plan.columns,
    {
      table: tableName,
      column: columnName,
      aggregate: 'none',
      alias: defaultAlias(tableName, columnName, 'none'),
    },
  ]);
}

function updateColumn(plan: QueryPlan, nextColumn: ColumnStep) {
  return updateColumns(
    plan,
    plan.columns.map((column) =>
      column.table === nextColumn.table && column.column === nextColumn.column ? nextColumn : column,
    ),
  );
}

function ColumnSection({
  plan,
  tableName,
  schema,
  onChange,
}: Readonly<{
  plan: QueryPlan;
  tableName: string;
  schema: readonly SchemaTableDefinition[];
  onChange: (plan: QueryPlan) => void;
}>) {
  const table = getTableDefinition(tableName) || schema.find((item) => item.name === tableName);

  if (!table) {
    return null;
  }

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-[#16161F] p-6 shadow-md transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xl font-bold text-[#F0F0FF]">{table.name}</h3>
          <p className="mt-1 text-sm font-medium text-[#7B7B9A]">{table.columns.length} columns</p>
        </div>
        <span className="rounded-full border border-[#1E1E2E] px-3 py-1 text-xs font-semibold text-[#7B7B9A]">
          {plan.columns.filter((column) => column.table === tableName).length} selected
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        {table.columns.map((columnName) => {
          const selectedColumn = plan.columns.find((column) => column.table === tableName && column.column === columnName);
          const aggregateOptions: AggregateFunction[] = isNumericColumn(columnName)
            ? ['none', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN']
            : ['none'];
          const isSelected = Boolean(selectedColumn);

          return (
            <div key={`${tableName}.${columnName}`} className={`rounded-xl border p-3 transition-colors ${isSelected ? 'border-[#6366F1]/50 bg-[#6366F1]/10' : 'border-white/10 bg-[#16161F]'}`}>
              <label className="flex items-center gap-3 rounded-lg border border-white/5 bg-[#16161F] p-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {
                    onChange(updateColumns(plan, toggleColumn(plan, tableName, columnName).columns));
                  }}
                  className="mt-1 h-4 w-4 rounded border-[#3F3F5C] bg-[#111118] text-[#6366F1] focus:ring-[#6366F1]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-[#F0F0FF]">{formatColumnName(columnName)}</span>
                    {isNumericColumn(columnName) && (
                      <span className="rounded-full bg-[#171722] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#7B7B9A]">numeric</span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-[#7B7B9A]">{isSelected ? 'Included in SELECT' : 'Not selected'}</p>
                </div>
              </label>

              {isSelected && selectedColumn && (
                <div className="ml-8 mt-3 grid grid-cols-2 gap-3">
                  <label className="grid gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[#7B7B9A]">
                    Alias
                    <input
                      value={selectedColumn.alias}
                      onChange={(event) => {
                        onChange(
                          updateColumn(plan, {
                            ...selectedColumn,
                            alias: event.target.value,
                          }),
                        );
                      }}
                      className="h-9 w-full rounded-lg border border-[#1E1E2E] bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none focus:border-[#6366F1]/50"
                    />
                  </label>

                  <label className="grid gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[#7B7B9A]">
                    Aggregate
                    <div className="relative">
                      <select
                        value={selectedColumn.aggregate}
                        onChange={(event) => {
                          const nextAggregate = event.target.value as AggregateFunction;
                          onChange(
                            updateColumn(plan, {
                              ...selectedColumn,
                              aggregate: nextAggregate,
                              alias: event.target.value === 'none' ? defaultAlias(tableName, columnName, 'none') : selectedColumn.alias || defaultAlias(tableName, columnName, nextAggregate),
                            }),
                          );
                        }}
                        className="h-9 w-full appearance-none rounded-lg border border-[#1E1E2E] bg-[#0A0A0F] pl-3 pr-8 text-sm text-[#F0F0FF] outline-none focus:border-[#6366F1]/50"
                      >
                        {aggregateOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#7B7B9A]" />
                    </div>
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StepColumns({ plan, onChange, schema }: Readonly<Props>) {
  const activeTables = getActiveTables(plan);

  if (!plan.table) {
    return (
      <section className="rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] px-6 py-4 shadow-xl shadow-black/20">
        <p className="text-sm text-[#7B7B9A]">Choose a base table first.</p>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] px-6 py-4 shadow-xl shadow-black/20">
      <div className="mb-8">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#6366F1]">STEP 2</p>
        <h2 className="text-2xl font-bold text-[#F0F0FF]">Select columns and aggregates</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#7B7B9A]">Pick the fields you want to see. Numeric columns can be summarized with aggregates.</p>
      </div>

      <div className="space-y-3">
        {activeTables.map((tableName) => (
          <ColumnSection key={tableName} plan={plan} tableName={tableName} schema={schema} onChange={onChange} />
        ))}
      </div>
    </section>
  );
}
