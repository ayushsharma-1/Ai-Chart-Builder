'use client';

import { Play } from 'lucide-react';

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
  const noColumns = plan.columns.length === 0;

  return (
    <div className="rounded-xl border border-white/5 bg-[#0E0E15]">
      {/* Header */}
      <div className="border-b border-white/5 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6366F1]">Step 6</p>
        <h2 className="mt-1 text-lg font-semibold text-[#F0F0FF]">Set limit &amp; run</h2>
        <p className="mt-1 text-sm text-[#7B7B9A]">Set how many rows to return, then execute.</p>
      </div>

      <div className="p-5 space-y-5">
        {/* Limit control */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-[#D6D6EA]">Row limit</label>
            <input
              type="number"
              min={1}
              max={5000}
              value={limit}
              onChange={(e) => onChange({ ...plan, limit: Math.max(1, Math.min(5000, Number(e.target.value) || 1000)) })}
              className="h-8 w-20 rounded-md border border-white/8 bg-[#0A0A0F] px-2 text-center text-sm font-medium text-[#F0F0FF] outline-none focus:border-[#6366F1]/40 transition-colors"
            />
          </div>
          <input
            type="range"
            min={1}
            max={5000}
            value={limit}
            onChange={(e) => onChange({ ...plan, limit: Number(e.target.value) })}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/8 accent-[#6366F1]"
          />
          <p className="text-xs text-[#44445E]">Preview caps at 50 rows · Final execution caps at 5000 rows</p>
        </div>

        {/* Warning */}
        {noColumns && (
          <p className="text-xs text-[#F59E0B]">Select at least one column in Step 2 before running.</p>
        )}

        {/* Run */}
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={onRunFinal}
            disabled={!canRun || !onRunFinal || isRunning}
            className="flex items-center gap-2 rounded-lg bg-[#6366F1] px-8 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#5558E8] disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.99]"
          >
            <Play size={14} />
            {isRunning ? 'Running…' : 'Run & Visualize'}
          </button>
        </div>
      </div>
    </div>
  );
}
