"use client";

import { useState } from "react";
import { Search, Hash, Calendar, Type, Key, ChevronDown, Plus, X } from "lucide-react";

import {
  AggregateFunction,
  ColumnStep,
  ComputedColumn,
  ComputedColumnType,
  QueryPlan,
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

const AGG_OPTIONS: AggregateFunction[] = ["none", "COUNT", "SUM", "AVG", "MAX", "MIN"];

const COMPUTED_OPTIONS: Array<{ value: ComputedColumnType; label: string }> = [
  { value: "concat", label: "Full Name (concat)" },
  { value: "coalesce", label: "Coalesce" },
  { value: "date_format", label: "Date Format" },
  { value: "cast", label: "Cast" },
];

function defaultAlias(table: string, col: string, agg: AggregateFunction): string {
  if (agg === "COUNT") return `count_${table}`;
  if (agg !== "none") return `${agg.toLowerCase()}_${table}_${col}`;
  return `${table}_${col}`;
}

function prettyCol(name: string): string {
  const clean = name.startsWith("tbl") && name.includes("_") ? name.slice(name.indexOf("_") + 1) : name;
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

function getActiveTables(plan: QueryPlan): string[] {
  return Array.from(new Set([plan.table, ...plan.joins.map((j) => j.table)].filter((t): t is string => Boolean(t))));
}

function normalizeColumnName(columnName: string) {
  return columnName.toLowerCase().replaceAll("_", "");
}

function getColumnToken(reference: string) {
  return reference.split(".").pop() ?? reference;
}

function isFirstLastPair(inputs: string[]) {
  const tokens = inputs.map((input) => normalizeColumnName(getColumnToken(input)));
  return tokens.length === 2 && ((tokens[0] === "firstname" && tokens[1] === "lastname") || (tokens[0] === "lastname" && tokens[1] === "firstname"));
}

function getAutoAlias(type: ComputedColumnType, inputs: string[]) {
  const tokens = inputs.map((input) => normalizeColumnName(getColumnToken(input)));

  if (type === "concat") {
    if (isFirstLastPair(inputs)) {
      return "full_name";
    }

    return tokens.filter(Boolean).join("_") || "combined_value";
  }

  if (type === "coalesce") {
    return tokens.filter(Boolean).join("_") || "coalesced_value";
  }

  if (type === "date_format") {
    return `${tokens[0] || "date"}_formatted`;
  }

  return `${tokens[0] || "value"}_cast`;
}

function formatInputLabel(reference: string) {
  const [table, column] = reference.split(".");
  return `${TABLE_LABELS[table] ?? table} · ${prettyCol(column)}`;
}

function getSelectedRawInputs(plan: QueryPlan) {
  return plan.columns
    .filter((column) => column.aggregate === "none")
    .map((column) => `${column.table}.${column.column}`);
}

function getFullNameSuggestionTable(plan: QueryPlan) {
  const grouped = new Map<string, string[]>();

  for (const column of plan.columns.filter((item) => item.aggregate === "none")) {
    const key = column.table;
    const list = grouped.get(key) ?? [];
    list.push(column.column);
    grouped.set(key, list);
  }

  for (const [table, columns] of grouped.entries()) {
    const normalized = new Set(columns.map((column) => normalizeColumnName(column)));
    const hasFirst = normalized.has("firstname");
    const hasLast = normalized.has("lastname");

    if (hasFirst && hasLast) {
      return table;
    }
  }

  return null;
}

function hasFullNameComputed(plan: QueryPlan, table: string) {
  return (plan.computed ?? []).some((computed) => {
    if (computed.type !== "concat" || computed.alias !== "full_name") {
      return false;
    }

    const inputs = computed.inputs.map((input) => input.split(".").pop() ?? input);
    return computed.inputs.length === 2 && computed.inputs.every((input) => input.startsWith(`${table}.`)) && isFirstLastPair(computed.inputs) && inputs.every(Boolean);
  });
}

function buildComputedColumn(type: ComputedColumnType, inputs: string[] = []): ComputedColumn {
  const alias = getAutoAlias(type, inputs);

  return {
    type,
    inputs,
    aggregate: "none",
    separator: type === "concat" ? " " : undefined,
    format: type === "date_format" ? "%Y-%m" : undefined,
    castType: type === "cast" ? "DECIMAL(15,2)" : undefined,
    sourceVisibility: "both",
    alias,
  };
}

export default function StepColumns({ plan, onChange, schema }: Readonly<Props>) {
  const [search, setSearch] = useState("");
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [computedExpanded, setComputedExpanded] = useState(false);

  if (!plan.table) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#0E0E15] px-5 py-4">
        <p className="text-sm text-[#7B7B9A]">Choose a base table first.</p>
      </div>
    );
  }

  const tables = getActiveTables(plan);
  const displayTable = activeTable ?? tables[0] ?? plan.table;
  const tableDef = getTableDefinition(displayTable) || schema.find((s) => s.name === displayTable);
  const allCols = tableDef?.columns ?? [];
  const filteredCols = allCols.filter(
    (c) => search === "" || c.toLowerCase().includes(search.toLowerCase()) || prettyCol(c).toLowerCase().includes(search.toLowerCase()),
  );

  const totalSelected = plan.columns.length;
  const totalAvailable = tables.reduce((n, t) => n + (getTableDefinition(t)?.columns.length ?? 0), 0);
  const selectedInTable = plan.columns.filter((c) => c.table === displayTable).length;
  const computedColumns = plan.computed ?? [];
  const availableInputs = getSelectedRawInputs(plan);
  const suggestionTable = getFullNameSuggestionTable(plan);

  function toggle(col: string) {
    const exists = plan.columns.find((c) => c.table === displayTable && c.column === col);

    if (exists) {
      onChange({
        ...plan,
        columns: plan.columns.filter((c) => !(c.table === displayTable && c.column === col)),
      });
      return;
    }

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

  function updateCol(next: ColumnStep) {
    onChange({
      ...plan,
      columns: plan.columns.map((c) => (c.table === next.table && c.column === next.column ? next : c)),
    });
  }

  function selectAll() {
    const already = new Set(plan.columns.filter((c) => c.table === displayTable).map((c) => c.column));
    const toAdd: ColumnStep[] = allCols
      .filter((c) => !already.has(c))
      .map((col): ColumnStep => ({
        table: displayTable,
        column: col,
        alias: defaultAlias(displayTable, col, "none"),
        aggregate: "none",
      }));

    onChange({ ...plan, columns: [...plan.columns, ...toAdd] });
  }

  function updateComputed(index: number, updater: (current: ComputedColumn) => ComputedColumn) {
    onChange({
      ...plan,
      computed: computedColumns.map((current, currentIndex) => (currentIndex === index ? updater(current) : current)),
    });
  }

  function addComputedRow(next?: Partial<ComputedColumn>) {
    const type = next?.type ?? "concat";
    const inputs = next?.inputs ?? [];
    const row = buildComputedColumn(type, inputs);

    onChange({
      ...plan,
      computed: [...computedColumns, { ...row, ...next, alias: next?.alias ?? row.alias }],
    });
    setComputedExpanded(true);
  }

  function removeComputedRow(index: number) {
    onChange({
      ...plan,
      computed: computedColumns.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  function toggleComputedInput(index: number, input: string, checked: boolean) {
    updateComputed(index, (current) => {
      const inputs = checked ? Array.from(new Set([...current.inputs, input])) : current.inputs.filter((value) => value !== input);
      const next = { ...current, inputs };
      const currentAlias = current.alias.trim();
      if (!currentAlias || currentAlias === getAutoAlias(current.type, current.inputs)) {
        next.alias = getAutoAlias(next.type, next.inputs);
      }
      return next;
    });
  }

  function changeComputedType(index: number, type: ComputedColumnType) {
    updateComputed(index, (current) => {
      const next = { ...current, type };
      const currentAlias = current.alias.trim();
      if (!currentAlias || currentAlias === getAutoAlias(current.type, current.inputs)) {
        next.alias = getAutoAlias(type, current.inputs);
      }
      if (type === "concat" && next.separator === undefined) next.separator = " ";
      if (type === "date_format" && next.format === undefined) next.format = "%Y-%m";
      if (type === "cast" && next.castType === undefined) next.castType = "DECIMAL(15,2)";
      if (type === "concat" && next.sourceVisibility === undefined) next.sourceVisibility = "both";
      return next;
    });
  }

  function changeComputedAggregate(index: number, aggregate: AggregateFunction) {
    updateComputed(index, (current) => ({ ...current, aggregate }));
  }

  function setComputedSourceVisibility(index: number, sourceVisibility: 'both' | 'computed_only') {
    updateComputed(index, (current) => ({ ...current, sourceVisibility }));
  }

  function addFullNameSuggestion() {
    if (!suggestionTable) {
      return;
    }

    const inputs = plan.columns
      .filter((column) => column.table === suggestionTable && column.aggregate === "none")
      .filter((column) => normalizeColumnName(column.column) === "firstname" || normalizeColumnName(column.column) === "lastname")
      .map((column) => `${column.table}.${column.column}`);

    if (inputs.length < 2) {
      return;
    }

    if (hasFullNameComputed(plan, suggestionTable)) {
      setComputedExpanded(true);
      return;
    }

    const firstNameInput = inputs.find((input) => normalizeColumnName(getColumnToken(input)) === "firstname");
    const lastNameInput = inputs.find((input) => normalizeColumnName(getColumnToken(input)) === "lastname");

    addComputedRow({ type: "concat", inputs: [firstNameInput, lastNameInput].filter((value): value is string => Boolean(value)), separator: " ", alias: "full_name" });
  }

  return (
    <div className="rounded-xl border border-white/5 bg-[#0E0E15]">
      <div className="border-b border-white/5 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6366F1]">Step 2</p>
        <h2 className="mt-1 text-lg font-semibold text-[#F0F0FF]">Select columns</h2>
        <p className="mt-1 text-sm text-[#7B7B9A]">Pick fields for your results. Numeric columns support aggregate functions.</p>
      </div>

      {tables.length > 1 && (
        <div className="flex gap-1 border-b border-white/5 px-5 py-2">
          {tables.map((t) => {
            const cnt = plan.columns.filter((c) => c.table === t).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTable(t)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all ${displayTable === t ? "bg-[#6366F1]/10 text-[#818CF8]" : "text-[#7B7B9A] hover:text-[#F0F0FF]"}`}
              >
                {TABLE_LABELS[t] ?? t}
                {cnt > 0 && <span className="rounded-full bg-[#6366F1]/20 px-1.5 text-[10px] text-[#818CF8]">{cnt}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
        <div className="relative flex-1 min-w-0">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="   Search columns..."
            className="h-11 w-full rounded-lg border border-white/10 bg-[#111118] pl-12 pr-4 text-sm text-[#F0F0FF] outline-none placeholder:text-[#5A5A78] focus:border-[#6366F1]/50 transition-colors"
          />
        </div>

        <span className="whitespace-nowrap text-sm text-[#7B7B9A]"><span className="font-semibold text-[#F0F0FF]">{totalSelected}</span>/{totalAvailable}</span>

        <button
          type="button"
          onClick={selectAll}
          className="h-10 rounded-lg border border-white/10 px-4 text-sm text-[#B0B0D0] transition-colors hover:border-[#6366F1]/30 hover:text-[#F0F0FF]"
        >
          All
        </button>

        {selectedInTable > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...plan, columns: plan.columns.filter((c) => c.table !== displayTable) })}
            className="h-10 rounded-lg border border-[#F87171]/20 px-4 text-sm text-[#F87171] transition-colors hover:border-[#F87171]/40"
          >
            Clear
          </button>
        )}

        {totalSelected > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...plan, columns: [] })}
            className="h-10 rounded-lg px-3 text-sm text-[#7B7B9A] transition-colors hover:text-[#F87171]"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="max-h-[500px] overflow-y-auto pb-1">
        {filteredCols.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-[#44445E]">No columns match &quot;{search}&quot;</p>
        ) : (
          filteredCols.map((col, i) => {
            const selected = plan.columns.find((c) => c.table === displayTable && c.column === col);
            const ct = colType(col);
            const isNumeric = isNumericColumn(col);
            const isLast = i === filteredCols.length - 1;

            return (
              <div
                key={`${displayTable}.${col}`}
                className={`flex items-center gap-3 px-5 py-2.5 transition-colors ${selected ? "bg-[#6366F1]/5" : "hover:bg-white/2"} ${isLast ? "" : "border-b border-white/4"}`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(selected)}
                  onChange={() => toggle(col)}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded accent-[#6366F1]"
                />

                <span className="flex w-4 shrink-0 items-center justify-center">{TYPE_ICON[ct]}</span>

                <span className={`min-w-0 flex-1 truncate text-sm ${selected ? "text-[#F0F0FF]" : "text-[#D6D6EA]"}`}>{prettyCol(col)}</span>

                {selected ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <input
                      value={selected.alias}
                      onChange={(e) => updateCol({ ...selected, alias: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 w-40 rounded-md border border-white/8 bg-[#0A0A0F] px-2 text-xs text-[#F0F0FF] outline-none transition-colors focus:border-[#6366F1]/40"
                      placeholder="Alias"
                    />
                    {isNumeric && (
                      <div className="relative">
                        <select
                          value={selected.aggregate}
                          onChange={(e) => {
                            const agg = e.target.value as AggregateFunction;
                            updateCol({ ...selected, aggregate: agg, alias: defaultAlias(displayTable, col, agg) });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-7 w-24 appearance-none rounded-md border border-white/8 bg-[#0A0A0F] pl-2 pr-6 text-xs text-[#F0F0FF] outline-none transition-colors focus:border-[#6366F1]/40"
                        >
                          {AGG_OPTIONS.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={10} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[#7B7B9A]" />
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="shrink-0 font-mono text-[10px] text-[#3F3F5C]">{col}</span>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-white/5 px-5 py-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-[#111118] px-4 py-3">
          <button
            type="button"
            onClick={() => setComputedExpanded((current) => !current)}
            className="flex min-w-0 flex-1 items-center justify-between text-left"
          >
            <div>
              <p className="text-sm font-medium text-[#F0F0FF]">Computed columns</p>
              <p className="mt-1 text-xs text-[#7B7B9A]">Create combined, derived, or formatted output fields.</p>
            </div>
            <ChevronDown size={14} className={`ml-3 shrink-0 text-[#7B7B9A] transition-transform ${computedExpanded ? "rotate-180" : ""}`} />
          </button>

          <button
            type="button"
            onClick={() => addComputedRow({ type: "concat", separator: " " })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#6366F1]/25 bg-[#6366F1]/8 px-3 py-2 text-xs font-medium text-[#818CF8] transition-colors hover:bg-[#6366F1]/15"
          >
            <Plus size={12} />
            Add computed column
          </button>
        </div>

        {suggestionTable && !hasFullNameComputed(plan, suggestionTable) && (
          <button
            type="button"
            onClick={addFullNameSuggestion}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#22D3A3]/20 bg-[#22D3A3]/8 px-3 py-1.5 text-xs font-medium text-[#34D399] transition-colors hover:border-[#22D3A3]/35 hover:bg-[#22D3A3]/12"
          >
            Combine as Full Name →
          </button>
        )}

        {computedExpanded && (
          <div className="mt-4 space-y-3">
            {computedColumns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/8 px-4 py-5 text-sm text-[#7B7B9A]">
                No computed columns yet. Add one to combine or format selected fields.
              </div>
            ) : (
              computedColumns.map((computed, index) => {
                return (
                  <div key={`${computed.type}-${index}`} className="rounded-xl border border-white/5 bg-[#111118] p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-[170px] flex-1">
                          <span className="mb-1 block text-[11px] uppercase tracking-widest text-[#7B7B9A]">Type</span>
                        <select
                          value={computed.type}
                          onChange={(e) => changeComputedType(index, e.target.value as ComputedColumnType)}
                          className="h-10 w-full rounded-md border border-white/8 bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none transition-colors focus:border-[#6366F1]/40"
                        >
                          {COMPUTED_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="min-w-[220px] flex-[2]">
                        <span className="mb-1 block text-[11px] uppercase tracking-widest text-[#7B7B9A]">Alias</span>
                        <input
                          value={computed.alias}
                          onChange={(e) => updateComputed(index, (current) => ({ ...current, alias: e.target.value }))}
                          className="h-10 w-full rounded-md border border-white/8 bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none transition-colors focus:border-[#6366F1]/40"
                          placeholder="full_name"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => removeComputedRow(index)}
                        className="mt-5 flex h-10 w-10 items-center justify-center rounded-md border border-white/8 text-[#44445E] transition-colors hover:border-[#F87171]/30 hover:text-[#F87171]"
                        aria-label="Remove computed column"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <span className="mb-1 block text-[11px] uppercase tracking-widest text-[#7B7B9A]">Aggregate</span>
                        <div className="relative">
                          <select
                            value={computed.aggregate ?? "none"}
                            onChange={(e) => changeComputedAggregate(index, e.target.value as AggregateFunction)}
                            className="h-10 w-full appearance-none rounded-md border border-white/8 bg-[#0A0A0F] px-3 pr-8 text-sm text-[#F0F0FF] outline-none transition-colors focus:border-[#6366F1]/40"
                          >
                            {AGG_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#7B7B9A]" />
                        </div>
                      </div>

                      <div className="rounded-md border border-white/5 bg-[#0A0A0F] px-3 py-2 text-xs text-[#7B7B9A]">
                        Use this to count or summarize the computed value, like COUNT(full name).
                      </div>
                    </div>

                    {computed.type === "concat" && (
                      <div className="mt-4">
                        <p className="mb-2 text-[11px] uppercase tracking-widest text-[#7B7B9A]">Source columns</p>
                        <div className="inline-flex rounded-lg border border-white/8 bg-[#0A0A0F] p-1">
                          {(() => {
                            const showBoth = computed.sourceVisibility !== "computed_only";

                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setComputedSourceVisibility(index, "both")}
                                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${showBoth ? "bg-[#6366F1]/10 text-[#818CF8]" : "text-[#7B7B9A] hover:text-[#F0F0FF]"}`}
                                >
                                  Show both
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setComputedSourceVisibility(index, "computed_only")}
                                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${showBoth ? "text-[#7B7B9A] hover:text-[#F0F0FF]" : "bg-[#6366F1]/10 text-[#818CF8]"}`}
                                >
                                  Only concat
                                </button>
                              </>
                            );
                          })()}
                        </div>
                        <p className="mt-2 text-xs text-[#44445E]">
                          Keep the source columns in the builder, or hide them from the output when the concatenated field is enough.
                        </p>
                      </div>
                    )}

                    <div className="mt-4">
                      <p className="mb-2 text-[11px] uppercase tracking-widest text-[#7B7B9A]">Inputs</p>
                      {availableInputs.length === 0 ? (
                        <p className="rounded-md border border-white/5 bg-[#0A0A0F] px-3 py-2 text-sm text-[#44445E]">Select at least one raw column first.</p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {availableInputs.map((input) => {
                            const checked = computed.inputs.includes(input);
                            return (
                              <label key={input} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${checked ? "border-[#6366F1]/30 bg-[#6366F1]/8 text-[#F0F0FF]" : "border-white/5 bg-[#0A0A0F] text-[#D6D6EA] hover:border-white/10"}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => toggleComputedInput(index, input, e.target.checked)}
                                  className="h-3.5 w-3.5 shrink-0 rounded accent-[#6366F1]"
                                />
                                <span className="min-w-0 truncate">{formatInputLabel(input)}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {computed.type === "concat" && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <span className="mb-1 block text-[11px] uppercase tracking-widest text-[#7B7B9A]">Separator</span>
                          <input
                            value={computed.separator ?? ""}
                            onChange={(e) => updateComputed(index, (current) => ({ ...current, separator: e.target.value }))}
                            className="h-10 w-full rounded-md border border-white/8 bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none transition-colors focus:border-[#6366F1]/40"
                            placeholder=" "
                          />
                        </div>
                        <div className="rounded-md border border-white/5 bg-[#0A0A0F] px-3 py-2 text-xs text-[#7B7B9A]">
                          Example: CONCAT(col1, ' ', col2)
                        </div>
                      </div>
                    )}

                    {computed.type === "date_format" && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <span className="mb-1 block text-[11px] uppercase tracking-widest text-[#7B7B9A]">Format</span>
                          <input
                            value={computed.format ?? "%Y-%m"}
                            onChange={(e) => updateComputed(index, (current) => ({ ...current, format: e.target.value }))}
                            className="h-10 w-full rounded-md border border-white/8 bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none transition-colors focus:border-[#6366F1]/40"
                            placeholder="%Y-%m"
                          />
                        </div>
                        <div className="rounded-md border border-white/5 bg-[#0A0A0F] px-3 py-2 text-xs text-[#7B7B9A]">
                          Example: DATE_FORMAT(FROM_UNIXTIME(col), '%Y-%m')
                        </div>
                      </div>
                    )}

                    {computed.type === "cast" && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <span className="mb-1 block text-[11px] uppercase tracking-widest text-[#7B7B9A]">Cast type</span>
                          <input
                            value={computed.castType ?? "DECIMAL(15,2)"}
                            onChange={(e) => updateComputed(index, (current) => ({ ...current, castType: e.target.value }))}
                            className="h-10 w-full rounded-md border border-white/8 bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none transition-colors focus:border-[#6366F1]/40"
                            placeholder="DECIMAL(15,2)"
                          />
                        </div>
                        <div className="rounded-md border border-white/5 bg-[#0A0A0F] px-3 py-2 text-xs text-[#7B7B9A]">
                          Example: CAST(col AS DECIMAL(15,2))
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

          </div>
        )}
      </div>
    </div>
  );
}
