'use client';

import { QueryPlan } from '@/src/types/queryBuilder';
import { SchemaTableDefinition } from '@/src/lib/dataModel';

interface Props {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  schema: readonly SchemaTableDefinition[];
  onRunFinal?: () => void;
  canRun?: boolean;
  isRunning?: boolean;
}

export default function StepLimit({ plan, onChange, onRunFinal, canRun = false, isRunning = false }: Readonly<Props>) {
  const limit = Math.min(5000, Math.max(1, Number.isFinite(plan.limit) ? Math.floor(plan.limit) : 1000));

  return (
    <section className="space-y-4 rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] px-6 py-4 shadow-xl shadow-black/20">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[#7B7B9A]">Step 6</p>
        <h2 className="mt-1 font-syne text-2xl font-bold text-[#F0F0FF]">Set the result limit</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#7B7B9A]">Use a tighter limit for previews, then expand it before the final run if needed.</p>
      </div>

      <div className="rounded-2xl border border-[#1E1E2E] bg-[#111118] p-4">
        <label className="grid gap-2 text-sm text-[#D6D6EA]">
          <span className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-[#7B7B9A]">
            Result limit
            <span>{limit}</span>
          </span>
          <input
            type="number"
            min={1}
            max={5000}
            value={limit}
            onChange={(event) => {
              const nextValue = Math.max(1, Math.min(5000, Number(event.target.value) || 1000));
              onChange({ ...plan, limit: nextValue });
            }}
            className="h-11 rounded-xl border border-[#1E1E2E] bg-[#0A0A0F] px-3 text-sm text-[#F0F0FF] outline-none focus:border-[#6366F1]/50"
          />
        </label>

        <input
          type="range"
          min={1}
          max={5000}
          value={limit}
          onChange={(event) => onChange({ ...plan, limit: Number(event.target.value) })}
          className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-[#1E1E2E] accent-[#6366F1]"
        />

        <p className="mt-3 text-xs text-[#7B7B9A]">Preview runs cap at 50 rows. Final execution caps at 5000 rows.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onRunFinal}
            disabled={!canRun || !onRunFinal}
            className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all duration-300 hover:scale-105 hover:bg-blue-500 hover:shadow-blue-500/40 disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {isRunning ? 'Running...' : 'Run & Visualize'}
          </button>
          <span className="text-xs text-[#7B7B9A]">This runs the compiled SQL, applies the account filter, and renders the chart below.</span>
        </div>
      </div>
    </section>
  );
}
