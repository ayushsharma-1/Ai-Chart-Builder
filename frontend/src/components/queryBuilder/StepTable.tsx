'use client';

import { Database } from 'lucide-react';

import { QueryPlan } from '@/src/types/queryBuilder';
import { SchemaTableDefinition } from '@/src/lib/dataModel';

interface Props {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  schema: readonly SchemaTableDefinition[];
}

function createBasePlan(tableName: string): QueryPlan {
  return {
    table: tableName,
    joins: [],
    columns: [],
    filters: [],
    groupBy: [],
    orderBy: [],
    limit: 1000,
  };
}

export default function StepTable({ plan, onChange, schema }: Readonly<Props>) {
  return (
    <section className="space-y-5 rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] px-6 py-4 shadow-xl shadow-black/20">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[#7B7B9A]">Step 1</p>
        <h2 className="mt-2 font-syne text-2xl font-bold text-[#F0F0FF]">Choose a base table</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#7B7B9A]">Start with the table that best matches the question. Everything else is built from this selection.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {schema.map((table) => {
          const isSelected = plan.table === table.name;

          return (
            <button
              key={table.name}
              type="button"
              onClick={() => onChange(createBasePlan(table.name))}
              className={`group rounded-2xl border p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                isSelected
                  ? 'border-[#6366F1] bg-gradient-to-br from-[#6366F1]/20 to-[#6366F1]/5 shadow-[0_8px_30px_rgba(99,102,241,0.2)]'
                  : 'border-[#1E1E2E] bg-[#111118] hover:border-[#6366F1]/50 hover:shadow-[#6366F1]/10'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <Database size={15} className={isSelected ? 'text-[#A5B4FC]' : 'text-[#7B7B9A]'} />
                    <h3 className="font-medium text-[#F0F0FF]">{table.name}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-[#7B7B9A]">{table.purpose}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${isSelected ? 'bg-[#6366F1]/20 text-[#C7D2FE]' : 'bg-[#171722] text-[#7B7B9A]'}`}>
                  {table.columns.length} columns
                </span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2.5">
                {table.keywords.slice(0, 4).map((keyword) => (
                  <span key={keyword} className="rounded-full border border-[#1E1E2E] bg-[#0A0A0F] px-2.5 py-1 text-[11px] text-[#7B7B9A]">
                    {keyword}
                  </span>
                ))}
              </div>

              {isSelected && (
                <div className="mt-6 flex justify-center">
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.1)]">
                    Currently Selected
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
