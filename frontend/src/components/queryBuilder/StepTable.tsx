'use client';

import { Users, Briefcase, TrendingUp, Building2, Check } from 'lucide-react';

import { QueryPlan } from '@/src/types/queryBuilder';
import { SchemaTableDefinition } from '@/src/lib/dataModel';

interface Props {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  schema: readonly SchemaTableDefinition[];
}

function createBasePlan(tableName: string): QueryPlan {
  return { table: tableName, joins: [], columns: [], computed: [], filters: [], groupBy: [], orderBy: [], limit: 1000 };
}

const TABLE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  tblcandidate:          { icon: <Users size={16} />,      label: 'Candidates', color: '#6366F1' },
  tblassignjobcandidate: { icon: <Briefcase size={16} />,  label: 'Pipeline',   color: '#22D3A3' },
  tbldeals:              { icon: <TrendingUp size={16} />,  label: 'Deals',      color: '#F59E0B' },
  tbljob:                { icon: <Building2 size={16} />,   label: 'Jobs',       color: '#60A5FA' },
};

export default function StepTable({ plan, onChange, schema }: Readonly<Props>) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#0E0E15]">
      {/* Header */}
      <div className="border-b border-white/5 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6366F1]">Step 1</p>
        <h2 className="mt-1 text-lg font-semibold text-[#F0F0FF]">Choose a source table</h2>
        <p className="mt-1 text-sm text-[#7B7B9A]">Pick the main table for your query. You can join others in step 3.</p>
      </div>

      {/* Table grid */}
      <div className="grid gap-3 p-5 md:grid-cols-2">
        {schema.map((table) => {
          const meta = TABLE_META[table.name];
          const isSelected = plan.table === table.name;
          const color = meta?.color ?? '#6366F1';

          return (
            <button
              key={table.name}
              type="button"
              onClick={() => onChange(createBasePlan(table.name))}
              className={`group relative rounded-xl border p-4 text-left transition-all duration-150
                ${isSelected
                  ? 'border-[#6366F1]/30 bg-[#6366F1]/8'
                  : 'border-white/5 bg-[#111118] hover:border-white/10 hover:bg-[#13131E]'
                }`}
            >
              {/* Selected check */}
              {isSelected && (
                <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#6366F1]">
                  <Check size={11} strokeWidth={2.5} className="text-white" />
                </div>
              )}

              {/* Icon */}
              <div
                className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ background: `${color}18`, color }}
              >
                {meta?.icon}
              </div>

              {/* Name */}
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-sm font-semibold text-[#F0F0FF]">{meta?.label ?? table.name}</span>
                <span className="font-mono text-[10px] text-[#44445E]">{table.name}</span>
              </div>

              <p className="mb-3 text-xs leading-relaxed text-[#7B7B9A]">{table.purpose}</p>

              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {table.keywords.slice(0, 3).map((kw) => (
                    <span key={kw} className="rounded bg-white/4 px-1.5 py-0.5 text-[10px] text-[#44445E]">{kw}</span>
                  ))}
                </div>
                <span className="text-[10px] text-[#44445E]">{table.columns.length} cols</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
