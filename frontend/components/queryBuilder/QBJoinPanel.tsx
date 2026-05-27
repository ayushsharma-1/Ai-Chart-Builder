'use client';

import { useMemo, useState } from 'react';
import { Link2, Plus, X } from 'lucide-react';

import { JoinStep, JoinType, QueryPlan } from '@/types/queryBuilder';
import { getAvailableJoins, getTableColumns, RelationCard, SchemaTableDefinition } from '@/lib/dataModel';
import { prettyColumn, tableLabel } from './QBFieldList';

interface QBJoinPanelProps {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  schema: readonly SchemaTableDefinition[];
  onClose: () => void;
}

type JoinMode = 'recommended' | 'custom';

const JOIN_TYPES: JoinType[] = ['INNER', 'LEFT', 'RIGHT', 'FULL'];

const JOIN_COLORS: Record<JoinType, string> = {
  INNER: 'text-[var(--accent)]',
  LEFT: 'text-[var(--success)]',
  RIGHT: 'text-[var(--accent)]',
  FULL: 'text-[var(--destructive)]',
};

function joinKey(join: Pick<JoinStep, 'table' | 'leftCol' | 'rightCol'>) {
  return `${join.table}:${join.leftCol}:${join.rightCol}`;
}

function relationKey(relation: RelationCard) {
  return `${relation.table}:${relation.leftCol}:${relation.rightCol}`;
}

function isRelationActive(plan: QueryPlan, relation: RelationCard) {
  return plan.joins.some((join) => joinKey(join) === relationKey(relation));
}

interface CustomJoinForm {
  targetTable: string;
  joinType: JoinType;
  leftCol: string;
  rightCol: string;
}

export default function QBJoinPanel({ plan, onChange, schema, onClose }: Readonly<QBJoinPanelProps>) {
  const [mode, setMode] = useState<JoinMode>('recommended');
  const [form, setForm] = useState<CustomJoinForm>({
    targetTable: '',
    joinType: 'LEFT',
    leftCol: '',
    rightCol: '',
  });
  const [error, setError] = useState<string | null>(null);

  const baseTable = plan.table;
  const recommended = useMemo(() => getAvailableJoins(baseTable), [baseTable]);
  const otherTables = schema.filter((table) => table.name !== baseTable);
  const baseColumns = getTableColumns(baseTable);
  const targetColumns = getTableColumns(form.targetTable);

  if (!baseTable) return null;

  function toggleRecommended(relation: RelationCard) {
    const active = isRelationActive(plan, relation);

    if (active) {
      onChange({ ...plan, joins: plan.joins.filter((join) => joinKey(join) !== relationKey(relation)) });
      return;
    }

    onChange({
      ...plan,
      joins: [
        ...plan.joins,
        {
          table: relation.table,
          leftCol: relation.leftCol,
          rightCol: relation.rightCol,
          joinType: 'LEFT',
          custom: false,
        },
      ],
    });
  }

  function updateRecommendedType(relation: RelationCard, joinType: JoinType) {
    onChange({
      ...plan,
      joins: plan.joins.map((join) =>
        joinKey(join) === relationKey(relation) ? { ...join, joinType } : join,
      ),
    });
  }

  function addCustomJoin() {
    setError(null);

    if (!form.targetTable) {
      setError('Select a target table.');
      return;
    }

    if (!form.leftCol || !form.rightCol) {
      setError('Choose both columns for the join condition.');
      return;
    }

    onChange({
      ...plan,
      joins: [
        ...plan.joins,
        {
          table: form.targetTable,
          leftCol: form.leftCol,
          rightCol: form.rightCol,
          joinType: form.joinType,
          custom: true,
        },
      ],
    });
    setForm({ targetTable: '', joinType: 'LEFT', leftCol: '', rightCol: '' });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[var(--surface-elevated)] shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="font-syne text-lg font-semibold text-[var(--accent-foreground)]">Add join</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{tableLabel(baseTable)} as the base table</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--accent-foreground)]"
            aria-label="Close join panel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-white/5 px-5">
          {(['recommended', 'custom'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMode(tab)}
              className={`border-b-2 px-4 py-3 text-sm capitalize transition-colors ${
                mode === tab ? 'border-[var(--accent)] text-[var(--accent-foreground)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--accent-foreground)]'
              }`}
            >
              {tab === 'recommended' ? 'Recommended' : 'Custom'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto p-5">
          {mode === 'recommended' && (
            <div className="space-y-3">
              {recommended.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-sm text-[var(--text-muted)]">
                  No recommended joins for this table.
                </div>
              ) : (
                recommended.map((relation) => {
                  const active = isRelationActive(plan, relation);
                  const activeJoin = plan.joins.find((join) => joinKey(join) === relationKey(relation));

                  return (
                    <div
                      key={relationKey(relation)}
                      className={`rounded-lg border p-3 transition-colors ${
                        active ? 'border-[var(--success)]/25 bg-[var(--success)]/5' : 'border-white/5 bg-[var(--surface-elevated)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleRecommended(relation)}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${active ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-white/5 text-[var(--text-muted)]'}`}>
                          <Link2 size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-[var(--accent-foreground)]">
                            {tableLabel(relation.leftTable)} ↔ {tableLabel(relation.rightTable)}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--text-muted)]">
                            via {relation.leftCol} → {relation.rightCol}
                          </span>
                        </span>
                        <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${active ? 'border-[var(--success)]/20 text-[var(--success)]' : 'border-white/10 text-[var(--text-secondary)]'}`}>
                          {active ? 'ACTIVE' : 'ADD'}
                        </span>
                      </button>

                      {active && (
                        <label className="mt-3 block text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          Join type
                          <select
                            value={activeJoin?.joinType ?? 'LEFT'}
                            onChange={(event) => updateRecommendedType(relation, event.target.value as JoinType)}
                            className="mt-1 h-8 w-36 rounded-md border border-white/10 bg-[var(--surface-elevated)] px-2 font-dm-sans text-xs normal-case tracking-normal text-[var(--accent-foreground)] outline-none focus:border-[var(--accent)]/50"
                          >
                            {JOIN_TYPES.map((joinType) => (
                              <option key={joinType} value={joinType}>
                                {joinType}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {mode === 'custom' && (
                <div className="space-y-5">
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Target table</p>
                <select
                  value={form.targetTable}
                  onChange={(event) => setForm({ ...form, targetTable: event.target.value, leftCol: '', rightCol: '' })}
                  className="h-10 w-full rounded-lg border border-white/10 bg-[var(--surface-elevated)] px-3 text-sm text-[var(--accent-foreground)] outline-none focus:border-[var(--accent)]/50"
                >
                  <option value="">Select table</option>
                  {otherTables.map((table) => (
                    <option key={table.name} value={table.name}>
                      {tableLabel(table.name)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Join type</p>
                <div className="grid grid-cols-4 gap-2">
                  {JOIN_TYPES.map((joinType) => (
                    <button
                      key={joinType}
                      type="button"
                      onClick={() => setForm({ ...form, joinType })}
                      className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${
                          form.joinType === joinType
                          ? 'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]'
                          : 'border-white/5 bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--accent-foreground)]'
                      }`}
                    >
                      {joinType}
                    </button>
                  ))}
                </div>
              </div>

              {form.targetTable && (
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Condition</p>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                    <label className="min-w-0 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      {tableLabel(baseTable)}
                      <select
                        value={form.leftCol}
                        onChange={(event) => setForm({ ...form, leftCol: event.target.value })}
                        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[var(--surface-elevated)] px-3 font-dm-sans text-sm normal-case tracking-normal text-[var(--accent-foreground)] outline-none focus:border-[var(--accent)]/50"
                      >
                        <option value="">Column</option>
                        {baseColumns.map((column) => (
                          <option key={column} value={column}>
                            {prettyColumn(column)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="pb-2 text-sm font-semibold text-[var(--text-muted)]">=</span>
                    <label className="min-w-0 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      {tableLabel(form.targetTable)}
                      <select
                        value={form.rightCol}
                        onChange={(event) => setForm({ ...form, rightCol: event.target.value })}
                        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[var(--surface-elevated)] px-3 font-dm-sans text-sm normal-case tracking-normal text-[var(--accent-foreground)] outline-none focus:border-[var(--accent)]/50"
                      >
                        <option value="">Column</option>
                        {targetColumns.map((column) => (
                          <option key={column} value={column}>
                            {prettyColumn(column)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              )}

              {form.targetTable && form.leftCol && form.rightCol && (
                <div className="rounded-lg border border-white/5 bg-[var(--surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-muted)]">
                  <span className={JOIN_COLORS[form.joinType]}>{form.joinType} JOIN</span> {form.targetTable} ON {baseTable}.{form.leftCol} = {form.targetTable}.{form.rightCol}
                </div>
              )}

              {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

              <button
                type="button"
                onClick={addCustomJoin}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] hover:bg-[var(--accent)]/90"
              >
                <Plus size={14} />
                Add Join
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
