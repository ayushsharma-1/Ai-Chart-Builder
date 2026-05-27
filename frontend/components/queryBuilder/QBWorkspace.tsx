'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { QueryBuilderExecuteResult, QueryPlan } from '@/types/queryBuilder';
import { tableLabel } from './QBFieldList';
import QBFiltersPanel from './QBFiltersPanel';
import QBGroupSortPanel from './QBGroupSortPanel';
import QBResultsPanel from './QBResultsPanel';
import QBSqlPanel from './QBSqlPanel';

interface QBWorkspaceProps {
  plan: QueryPlan;
  onChange: (plan: QueryPlan) => void;
  previewData: Record<string, unknown>[];
  previewSql: string;
  previewRowCount: number;
  previewExecutionTimeMs: number;
  previewLoading: boolean;
  previewError: string | null;
  finalResult: QueryBuilderExecuteResult | null;
  finalLoading: boolean;
  finalError: string | null;
  runPreview: () => Promise<unknown>;
  runFinal: () => Promise<QueryBuilderExecuteResult | null>;
}

export default function QBWorkspace({
  plan,
  onChange,
  previewData,
  previewSql,
  previewRowCount,
  previewExecutionTimeMs,
  previewLoading,
  previewError,
  finalResult,
  finalLoading,
  finalError,
  runPreview,
  runFinal,
}: Readonly<QBWorkspaceProps>) {
  const [resultsOpenSignal, setResultsOpenSignal] = useState(0);
  const canRun = Boolean(plan.table && plan.columns.length > 0);
  const hasPlanMetadata = plan.columns.length > 0 || plan.joins.length > 0 || plan.groupBy.length > 0 || plan.filters.length > 0;

  async function handleRunFinal() {
    setResultsOpenSignal((current) => current + 1);
    await runFinal();
  }

  function updateLimit(value: string) {
    const parsed = Number(value);
    const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(5000, parsed)) : 1;
    onChange({ ...plan, limit });
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[#0A0A0F]">
      <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/5 bg-[#0A0A0F]/95 px-6 backdrop-blur">
        <div className="min-w-0">
          <div className="truncate font-syne text-sm font-semibold text-[#F0F0FF]">
            {tableLabel(plan.table)}
          </div>
          {hasPlanMetadata && (
            <div className="mt-0.5 truncate font-mono text-[10px] text-[#44445E]">
              {plan.columns.length} columns · {plan.joins.length} joins · {plan.groupBy.length} groups · {plan.filters.length} filters
            </div>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[#7B7B9A]">
            Limit
            <input
              type="number"
              min={1}
              max={5000}
              value={plan.limit}
              onChange={(event) => updateLimit(event.target.value)}
              className="h-8 w-20 rounded-lg border border-white/10 bg-[#111118] px-2 text-center text-sm text-[#F0F0FF] outline-none focus:border-[#6366F1]/50"
            />
          </label>

          <button
            type="button"
            onClick={() => void handleRunFinal()}
            disabled={!canRun || finalLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#6366F1] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#5558E8] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {finalLoading && <Loader2 size={14} className="animate-spin" />}
            {finalLoading ? 'Running...' : `Run query (${plan.limit})`}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <QBFiltersPanel plan={plan} onChange={onChange} />
        <QBGroupSortPanel plan={plan} onChange={onChange} />
        <QBResultsPanel
          plan={plan}
          onChange={onChange}
          previewData={previewData}
          previewRowCount={previewRowCount}
          previewExecutionTimeMs={previewExecutionTimeMs}
          previewLoading={previewLoading}
          previewError={previewError}
          finalResult={finalResult}
          finalLoading={finalLoading}
          finalError={finalError}
          onRetry={() => {
            if (finalResult || finalError) {
              void handleRunFinal();
              return;
            }

            void runPreview();
          }}
          openSignal={resultsOpenSignal}
        />
        <QBSqlPanel sql={previewSql} />
      </div>
    </main>
  );
}
