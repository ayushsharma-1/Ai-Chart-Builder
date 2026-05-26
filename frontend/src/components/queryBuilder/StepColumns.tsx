"use client";

import { useState } from "react";
import { Search, Hash, Calendar, Type, Key, ChevronDown } from "lucide-react";

import {
  QueryPlan,
  AggregateFunction,
  ColumnStep,
} from "@/src/types/queryBuilder";
import {
  SchemaTableDefinition,
  getTableDefinition,
  isNumericColumn,
  isDateLikeColumn,
} from "@/src/lib/dataModel";

interface Props {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  schema: readonly SchemaTableDefinition[];
}

const TABLE_LABELS: Record<string, string> = {
  tblcandidate: "Candidates",
  tblassignjobcandidate: "Pipeline",
  tbldeals: "Deals",
  tbljob: "Jobs",
};

function defaultAlias(
  table: string,
  col: string,
  agg: AggregateFunction,
): string {
  if (agg === "COUNT") return `count_${table}`;
  if (agg !== "none") return `${agg.toLowerCase()}_${table}_${col}`;
  return `${table}_${col}`;
}

function prettyCol(name: string): string {
  const clean =
    name.startsWith("tbl") && name.includes("_")
      ? name.slice(name.indexOf("_") + 1)
      : name;
  return clean
    .split("_")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function colType(col: string): "id" | "numeric" | "date" | "text" {
  if (col === "id" || col.endsWith("id")) return "id";
  if (isDateLikeColumn(col)) return "date";
  if (isNumericColumn(col)) return "numeric";
  return "text";
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  id: <Key size={11} className="text-[#F59E0B]" />,
  numeric: <Hash size={11} className="text-[#6366F1]" />,
  date: <Calendar size={11} className="text-[#22D3A3]" />,
  text: <Type size={11} className="text-[#7B7B9A]" />,
};

const AGG_OPTIONS: AggregateFunction[] = [
  "none",
  "COUNT",
  "SUM",
  "AVG",
  "MAX",
  "MIN",
];

function getActiveTables(plan: QueryPlan): string[] {
  return Array.from(
    new Set(
      [plan.table, ...plan.joins.map((j) => j.table)].filter((t): t is string =>
        Boolean(t),
      ),
    ),
  );
}

export default function StepColumns({
  plan,
  onChange,
  schema,
}: Readonly<Props>) {
  const [search, setSearch] = useState("");
  const [activeTable, setActiveTable] = useState<string | null>(null);

  if (!plan.table) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#0E0E15] px-5 py-4">
        <p className="text-sm text-[#7B7B9A]">Choose a base table first.</p>
      </div>
    );
  }

  const tables = getActiveTables(plan);
  const displayTable = activeTable ?? tables[0] ?? plan.table;
  const tableDef =
    getTableDefinition(displayTable) ||
    schema.find((s) => s.name === displayTable);
  const allCols = tableDef?.columns ?? [];
  const filteredCols = allCols.filter(
    (c) =>
      search === "" ||
      c.toLowerCase().includes(search.toLowerCase()) ||
      prettyCol(c).toLowerCase().includes(search.toLowerCase()),
  );

  const totalSelected = plan.columns.length;
  const totalAvailable = tables.reduce(
    (n, t) => n + (getTableDefinition(t)?.columns.length ?? 0),
    0,
  );
  const selectedInTable = plan.columns.filter(
    (c) => c.table === displayTable,
  ).length;

  function toggle(col: string) {
    const exists = plan.columns.find(
      (c) => c.table === displayTable && c.column === col,
    );
    if (exists) {
      onChange({
        ...plan,
        columns: plan.columns.filter(
          (c) => !(c.table === displayTable && c.column === col),
        ),
      });
    } else {
      onChange({
        ...plan,
        columns: [
          ...plan.columns,
          {
            table: displayTable,
            column: col,
            alias: defaultAlias(displayTable, col, "none"),
            aggregate: "none",
          },
        ],
      });
    }
  }

  function updateCol(next: ColumnStep) {
    onChange({
      ...plan,
      columns: plan.columns.map((c) =>
        c.table === next.table && c.column === next.column ? next : c,
      ),
    });
  }

  function selectAll() {
    const already = new Set(
      plan.columns.filter((c) => c.table === displayTable).map((c) => c.column),
    );
    const toAdd = allCols
      .filter((c) => !already.has(c))
      .map((col) => ({
        table: displayTable,
        column: col,
        alias: defaultAlias(displayTable, col, "none"),
        aggregate: "none" as AggregateFunction,
      }));
    onChange({ ...plan, columns: [...plan.columns, ...toAdd] });
  }

  return (
    <div className="rounded-xl border border-white/5 bg-[#0E0E15]">
      {/* Header */}
      <div className="border-b border-white/5 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6366F1]">
          Step 2
        </p>
        <h2 className="mt-1 text-lg font-semibold text-[#F0F0FF]">
          Select columns
        </h2>
        <p className="mt-1 text-sm text-[#7B7B9A]">
          Pick fields for your results. Numeric columns support aggregate
          functions.
        </p>
      </div>

      {/* Table tabs */}
      {tables.length > 1 && (
        <div className="flex gap-1 border-b border-white/5 px-5 py-2">
          {tables.map((t) => {
            const cnt = plan.columns.filter((c) => c.table === t).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTable(t)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all
                  ${displayTable === t ? "bg-[#6366F1]/10 text-[#818CF8]" : "text-[#7B7B9A] hover:text-[#F0F0FF]"}`}
              >
                {TABLE_LABELS[t] ?? t}
                {cnt > 0 && (
                  <span className="rounded-full bg-[#6366F1]/20 px-1.5 text-[10px] text-[#818CF8]">
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
        <div className="relative flex-1 min-w-0">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder=" Search columns..."
            className="
              h-11 w-full
              rounded-lg
              border border-white/10
              bg-[#111118]
              pl-12 pr-4
              text-sm text-[#F0F0FF]
              outline-none
              placeholder:text-[#5A5A78]
              focus:border-[#6366F1]/50
              transition-colors
            "
          />
        </div>

        {/* Count */}
        <span className="text-sm text-[#7B7B9A] whitespace-nowrap">
          <span className="font-semibold text-[#F0F0FF]">{totalSelected}</span>/
          {totalAvailable}
        </span>

        {/* All */}
        <button
          type="button"
          onClick={selectAll}
          className="
            h-10
            rounded-lg
            border border-white/10
            px-4
            text-sm
            text-[#B0B0D0]
            hover:text-[#F0F0FF]
            hover:border-[#6366F1]/30
            transition-colors
          "
        >
          All
        </button>

        {/* Clear current table */}
        {selectedInTable > 0 && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...plan,
                columns: plan.columns.filter((c) => c.table !== displayTable),
              })
            }
            className="
              h-10
              rounded-lg
              border border-[#F87171]/20
              px-4
              text-sm
              text-[#F87171]
              hover:border-[#F87171]/40
              transition-colors
            "
          >
            Clear
          </button>
        )}

        {/* Clear all */}
        {totalSelected > 0 && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...plan,
                columns: [],
              })
            }
            className="
              h-10
              rounded-lg
              px-3
              text-sm
              text-[#7B7B9A]
              hover:text-[#F87171]
              transition-colors
            "
          >
            Clear all
          </button>
        )}
      </div>
      {/* Column rows */}
      <div className="max-h-[500px] overflow-y-auto pb-1">
        {filteredCols.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-[#44445E]">
            No columns match &quot;{search}&quot;
          </p>
        ) : (
          filteredCols.map((col, i) => {
            const selected = plan.columns.find(
              (c) => c.table === displayTable && c.column === col,
            );
            const ct = colType(col);
            const isNumeric = isNumericColumn(col);
            const isLast = i === filteredCols.length - 1;

            return (
              <div
                key={`${displayTable}.${col}`}
                className={`flex items-center gap-3 px-5 py-2.5 transition-colors
                ${selected ? "bg-[#6366F1]/5" : "hover:bg-white/2"}
                ${!isLast ? "border-b border-white/4" : ""}
              `}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={Boolean(selected)}
                  onChange={() => toggle(col)}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded accent-[#6366F1]"
                />

                {/* Type icon */}
                <span className="shrink-0 w-4 flex items-center justify-center">
                  {TYPE_ICON[ct]}
                </span>

                {/* Column name */}
                <span
                  className={`flex-1 min-w-0 truncate text-sm ${selected ? "text-[#F0F0FF]" : "text-[#D6D6EA]"}`}
                >
                  {prettyCol(col)}
                </span>

                {/* Inline alias + aggregate when selected */}
                {selected ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      value={selected.alias}
                      onChange={(e) =>
                        updateCol({ ...selected, alias: e.target.value })
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 w-40 rounded-md border border-white/8 bg-[#0A0A0F] px-2 text-xs text-[#F0F0FF] outline-none focus:border-[#6366F1]/40 transition-colors"
                      placeholder="Alias"
                    />
                    {isNumeric && (
                      <div className="relative">
                        <select
                          value={selected.aggregate}
                          onChange={(e) => {
                            const agg = e.target.value as AggregateFunction;
                            updateCol({
                              ...selected,
                              aggregate: agg,
                              alias: defaultAlias(displayTable, col, agg),
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-7 w-24 appearance-none rounded-md border border-white/8 bg-[#0A0A0F] pl-2 pr-6 text-xs text-[#F0F0FF] outline-none focus:border-[#6366F1]/40 transition-colors"
                        >
                          {AGG_OPTIONS.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={10}
                          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[#7B7B9A]"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="shrink-0 font-mono text-[10px] text-[#3F3F5C]">
                    {col}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
