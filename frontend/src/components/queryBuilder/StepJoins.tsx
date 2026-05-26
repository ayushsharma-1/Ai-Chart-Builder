'use client';

import { Link2 } from 'lucide-react';

import { QueryPlan, JoinStep } from '@/src/types/queryBuilder';
import { RelationCard, SchemaTableDefinition, getAvailableJoins } from '@/src/lib/dataModel';

interface Props {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  schema: readonly SchemaTableDefinition[];
}

function toggleJoin(plan: QueryPlan, relation: RelationCard) {
  const exists = plan.joins.find((join) => join.table === relation.table && join.leftCol === relation.leftCol && join.rightCol === relation.rightCol);

  if (exists) {
    return {
      ...plan,
      joins: plan.joins.filter((join) => !(join.table === relation.table && join.leftCol === relation.leftCol && join.rightCol === relation.rightCol)),
    };
  }

  const nextJoin: JoinStep = {
    table: relation.table,
    leftCol: relation.leftCol,
    rightCol: relation.rightCol,
  };

  return {
    ...plan,
    joins: [...plan.joins, nextJoin],
  };
}

export default function StepJoins({ plan, onChange }: Readonly<Props>) {
  if (!plan.table) {
    return (
      <section className="rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] px-6 py-4 shadow-xl shadow-black/20">
        <p className="text-sm text-[#7B7B9A]">Choose a base table first.</p>
      </section>
    );
  }

  const relations = getAvailableJoins(plan.table);

  return (
    <section className="space-y-4 rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] px-6 py-4 shadow-xl shadow-black/20">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[#7B7B9A]">Step 3</p>
        <h2 className="mt-1 font-syne text-2xl font-bold text-[#F0F0FF]">Add joins</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#7B7B9A]">Choose related tables to broaden the query. Each relation comes from the schema metadata.</p>
      </div>

      {relations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#1E1E2E] bg-[#111118] p-6 text-sm text-[#7B7B9A]">
          No schema relations were found for this table.
        </div>
      ) : (
        <div className="grid gap-3">
          {relations.map((relation) => {
            const selected = plan.joins.some((join) => join.table === relation.table && join.leftCol === relation.leftCol && join.rightCol === relation.rightCol);

            return (
              <button
                key={`${relation.leftTable}-${relation.table}-${relation.leftCol}-${relation.rightCol}`}
                type="button"
                onClick={() => onChange(toggleJoin(plan, relation))}
                className={`rounded-2xl border p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                  selected
                    ? 'border-[#22D3A3] bg-gradient-to-br from-[#22D3A3]/20 to-[#22D3A3]/5 shadow-[0_8px_30px_rgba(34,211,163,0.15)]'
                    : 'border-[#1E1E2E] bg-[#111118] hover:border-[#22D3A3]/50 hover:shadow-[#22D3A3]/10'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 rounded-full p-2 ${selected ? 'bg-[#22D3A3]/20 text-[#6EE7C8]' : 'bg-[#171722] text-[#7B7B9A]'}`}>
                    <Link2 size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-[#F0F0FF]">{relation.label}</h3>
                      {selected && <span className="rounded-full bg-[#22D3A3]/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#A7F3D0]">Selected</span>}
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[#7B7B9A]">
                      Joins {relation.leftTable} to {relation.rightTable}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
