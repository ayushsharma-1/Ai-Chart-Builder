'use client';

import { useState } from 'react';
import { Link2, Plus, X, ChevronDown } from 'lucide-react';

import { QueryPlan, JoinStep, JoinType } from '@/src/types/queryBuilder';
import { RelationCard, SchemaTableDefinition, getAvailableJoins, getTableColumns, SCHEMA_TABLES } from '@/src/lib/dataModel';

interface Props {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  schema: readonly SchemaTableDefinition[];
}

type Mode = 'recommended' | 'custom';

const JOIN_TYPES: { type: JoinType; desc: string }[] = [
  { type: 'INNER', desc: 'Matching rows only' },
  { type: 'LEFT',  desc: 'All left + matching right' },
  { type: 'RIGHT', desc: 'All right + matching left' },
  { type: 'FULL',  desc: 'All rows from both' },
];

const JOIN_COLOR: Record<JoinType, string> = {
  INNER: 'text-[#818CF8]',
  LEFT:  'text-[#34D399]',
  RIGHT: 'text-[#FBBF24]',
  FULL:  'text-[#F87171]',
};

const TABLE_LABELS: Record<string, string> = {
  tblcandidate: 'Candidates',
  tblassignjobcandidate: 'Pipeline',
  tbldeals: 'Deals',
  tbljob: 'Jobs',
};

function tableLabel(n: string) { return TABLE_LABELS[n] ?? n; }

function joinKey(j: JoinStep) { return `${j.table}:${j.leftCol}:${j.rightCol}`; }

function isActive(plan: QueryPlan, r: RelationCard) {
  return plan.joins.some((j) => j.table === r.table && j.leftCol === r.leftCol && j.rightCol === r.rightCol);
}

interface CustomForm { targetTable: string; joinType: JoinType; leftCol: string; rightCol: string }

export default function StepJoins({ plan, onChange }: Readonly<Props>) {
  const [mode, setMode] = useState<Mode>('recommended');
  const [form, setForm] = useState<CustomForm>({ targetTable: '', joinType: 'LEFT', leftCol: '', rightCol: '' });
  const [error, setError] = useState<string | null>(null);

  if (!plan.table) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#0E0E15] px-5 py-4">
        <p className="text-sm text-[#7B7B9A]">Choose a base table first.</p>
      </div>
    );
  }

  const baseTable = plan.table;
  const schemaRelations = getAvailableJoins(baseTable);
  const otherTables = SCHEMA_TABLES.filter((t) => t.name !== baseTable);
  const baseColumns = getTableColumns(baseTable);
  const targetColumns = form.targetTable ? getTableColumns(form.targetTable) : [];

  function toggleSchemaJoin(r: RelationCard) {
    if (isActive(plan, r)) {
      onChange({ ...plan, joins: plan.joins.filter((j) => !(j.table === r.table && j.leftCol === r.leftCol && j.rightCol === r.rightCol)) });
    } else {
      onChange({ ...plan, joins: [...plan.joins, { table: r.table, leftCol: r.leftCol, rightCol: r.rightCol, joinType: 'LEFT', custom: false }] });
    }
  }

  function addCustomJoin() {
    setError(null);
    if (!form.targetTable) { setError('Select a target table.'); return; }
    if (!form.leftCol)     { setError('Select a column from the base table.'); return; }
    if (!form.rightCol)    { setError('Select a column from the target table.'); return; }
    onChange({ ...plan, joins: [...plan.joins, { table: form.targetTable, leftCol: form.leftCol, rightCol: form.rightCol, joinType: form.joinType, custom: true }] });
    setForm({ targetTable: '', joinType: 'LEFT', leftCol: '', rightCol: '' });
  }

  return (
    <div className="rounded-xl border border-white/5 bg-[#0E0E15]">
      {/* Header */}
      <div className="border-b border-white/5 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6366F1]">Step 3</p>
        <h2 className="mt-1 text-lg font-semibold text-[#F0F0FF]">Add joins</h2>
        <p className="mt-1 text-sm text-[#7B7B9A]">Link related tables to expand your data.</p>
      </div>

      {/* Mode tabs */}
      <div className="flex border-b border-white/5">
        {(['recommended', 'custom'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors
              ${mode === m ? 'border-b-2 border-[#6366F1] text-[#818CF8]' : 'text-[#7B7B9A] hover:text-[#F0F0FF]'}`}
          >
            {m === 'recommended' ? `Recommended${schemaRelations.length ? ` (${schemaRelations.length})` : ''}` : 'Custom'}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-4">
        {/* ── Recommended ── */}
        {mode === 'recommended' && (
          schemaRelations.length === 0 ? (
            <p className="rounded-lg border border-white/5 bg-[#111118] px-4 py-3 text-sm text-[#44445E]">
              No schema relations for <span className="font-mono text-[#7B7B9A]">{baseTable}</span>. Use the Custom tab.
            </p>
          ) : (
            <div className="space-y-2">
              {schemaRelations.map((rel) => {
                const active = isActive(plan, rel);
                return (
                  <button
                    key={`${rel.leftTable}-${rel.table}-${rel.leftCol}-${rel.rightCol}`}
                    type="button"
                    onClick={() => toggleSchemaJoin(rel)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all duration-150
                      ${active ? 'border-[#22D3A3]/25 bg-[#22D3A3]/5' : 'border-white/5 bg-[#111118] hover:border-white/10'}`}
                  >
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${active ? 'bg-[#22D3A3]/15 text-[#34D399]' : 'bg-white/5 text-[#44445E]'}`}>
                      <Link2 size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="text-[#F0F0FF]">{tableLabel(rel.leftTable)}</span>
                        <span className="text-[#44445E]">→</span>
                        <span className="text-[#F0F0FF]">{tableLabel(rel.rightTable)}</span>
                        <span className="font-mono text-[10px] text-[#44445E]">{rel.leftCol} = {rel.rightCol}</span>
                      </div>
                    </div>
                    <div className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center transition-all
                      ${active ? 'border-[#22D3A3] bg-[#22D3A3]' : 'border-[#3F3F5C]'}`}>
                      {active && (
                        <svg viewBox="0 0 10 8" className="h-2 w-2" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke="#0A0A0F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )
        )}

        {/* ── Custom ── */}
        {mode === 'custom' && (
          <div className="space-y-4">
            {/* Join type */}
            <div>
              <p className="mb-2 text-xs text-[#7B7B9A]">Join type</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {JOIN_TYPES.map((opt) => (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, joinType: opt.type }))}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-all duration-150
                      ${form.joinType === opt.type
                        ? 'border-[#6366F1]/30 bg-[#6366F1]/8'
                        : 'border-white/5 bg-[#111118] hover:border-white/10'}`}
                  >
                    <span className={`block text-xs font-semibold ${form.joinType === opt.type ? JOIN_COLOR[opt.type] : 'text-[#F0F0FF]'}`}>
                      {opt.type}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-[#44445E]">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Target table */}
            <div>
              <p className="mb-2 text-xs text-[#7B7B9A]">Target table</p>
              <div className="flex flex-wrap gap-1.5">
                {otherTables.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, targetTable: t.name, leftCol: '', rightCol: '' }))}
                    className={`rounded-md border px-3 py-1.5 text-xs transition-all duration-150
                      ${form.targetTable === t.name
                        ? 'border-[#6366F1]/30 bg-[#6366F1]/8 text-[#818CF8]'
                        : 'border-white/5 bg-[#111118] text-[#7B7B9A] hover:text-[#F0F0FF] hover:border-white/10'}`}
                  >
                    {tableLabel(t.name)}
                  </button>
                ))}
              </div>
            </div>

            {/* Columns */}
            {form.targetTable && (
              <div>
                <p className="mb-2 text-xs text-[#7B7B9A]">Join condition</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex-1 min-w-[130px]">
                    <p className="mb-1 font-mono text-[10px] text-[#44445E]">{baseTable}</p>
                    <div className="relative">
                      <select
                        value={form.leftCol}
                        onChange={(e) => setForm((f) => ({ ...f, leftCol: e.target.value }))}
                        className="h-8 w-full appearance-none rounded-md border border-white/8 bg-[#0A0A0F] pl-3 pr-7 text-sm text-[#F0F0FF] outline-none focus:border-[#6366F1]/40 transition-colors"
                      >
                        <option value="">Column…</option>
                        {baseColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#7B7B9A]" />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[#3F3F5C] mt-4">=</span>
                  <div className="flex-1 min-w-[130px]">
                    <p className="mb-1 font-mono text-[10px] text-[#44445E]">{form.targetTable}</p>
                    <div className="relative">
                      <select
                        value={form.rightCol}
                        onChange={(e) => setForm((f) => ({ ...f, rightCol: e.target.value }))}
                        className="h-8 w-full appearance-none rounded-md border border-white/8 bg-[#0A0A0F] pl-3 pr-7 text-sm text-[#F0F0FF] outline-none focus:border-[#6366F1]/40 transition-colors"
                      >
                        <option value="">Column…</option>
                        {targetColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#7B7B9A]" />
                    </div>
                  </div>
                </div>

                {form.leftCol && form.rightCol && (
                  <p className="mt-2 font-mono text-[11px] text-[#44445E]">
                    <span className={JOIN_COLOR[form.joinType]}>{form.joinType} JOIN</span>
                    {' '}{form.targetTable} ON {baseTable}.{form.leftCol} = {form.targetTable}.{form.rightCol}
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-xs text-[#F87171]">{error}</p>}

            <button
              type="button"
              onClick={addCustomJoin}
              className="flex items-center gap-1.5 rounded-lg border border-[#6366F1]/25 bg-[#6366F1]/8 px-3 py-2 text-xs font-medium text-[#818CF8] transition-all hover:bg-[#6366F1]/15"
            >
              <Plus size={12} />
              Add join
            </button>
          </div>
        )}

        {/* Active joins */}
        {plan.joins.length > 0 && (
          <div className="border-t border-white/5 pt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#7B7B9A]">Active ({plan.joins.length})</p>
            <div className="space-y-1.5">
              {plan.joins.map((j) => (
                <div key={joinKey(j)} className="flex items-center gap-2 rounded-lg border border-white/5 bg-[#111118] px-3 py-2">
                  <span className={`text-[10px] font-bold uppercase ${JOIN_COLOR[j.joinType]}`}>{j.joinType}</span>
                  <span className="flex-1 min-w-0 truncate font-mono text-xs text-[#7B7B9A]">
                    {baseTable}.{j.leftCol} = {j.table}.{j.rightCol}
                  </span>
                  {j.custom && <span className="rounded bg-[#F59E0B]/10 px-1 py-0.5 text-[10px] text-[#F59E0B]">custom</span>}
                  <button
                    type="button"
                    onClick={() => onChange({ ...plan, joins: plan.joins.filter((x) => joinKey(x) !== joinKey(j)) })}
                    className="shrink-0 text-[#3F3F5C] transition-colors hover:text-[#F87171]"
                    aria-label="Remove join"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
