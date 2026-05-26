'use client';

import { useMemo } from 'react';

import ChartRenderer from '@/components/chart/ChartRenderer';
import Navbar from '@/components/ui/Navbar';
import AccountIdModal from '@/components/ui/AccountIdModal';
import { useAccountId } from '@/hooks/useAccountId';
import { ChartType } from '@/types';
import { SCHEMA_TABLES, isDateLikeColumn } from '@/src/lib/dataModel';
import { useQueryBuilder } from '@/src/hooks/useQueryBuilder';
import StepColumns from '@/src/components/queryBuilder/StepColumns';
import StepFilters from '@/src/components/queryBuilder/StepFilters';
import StepGroupSort from '@/src/components/queryBuilder/StepGroupSort';
import StepIndicator from '@/src/components/queryBuilder/StepIndicator';
import StepJoins from '@/src/components/queryBuilder/StepJoins';
import StepLimit from '@/src/components/queryBuilder/StepLimit';
import StepTable from '@/src/components/queryBuilder/StepTable';
import StepTransform from '@/src/components/queryBuilder/StepTransform';
import PreviewPane from '@/src/components/queryBuilder/PreviewPane';

function looksLikeDateValue(value: unknown) {
  if (typeof value === 'number') return value > 946684800;
  if (typeof value === 'string') return /\d{4}-\d{2}|\d{4}\/\d{2}|\d{4}-\d{2}-\d{2}/.test(value);
  return false;
}

function inferChartType(rows: Record<string, unknown>[], xAxis: string, seriesKeys: string[]): ChartType {
  if (rows.length === 0) return 'table';
  const sample = rows.slice(0, 10).map((r) => r[xAxis]);
  if (sample.some((v) => looksLikeDateValue(v) || isDateLikeColumn(xAxis))) return 'line';
  if (seriesKeys.length > 1) return 'bar';
  if (rows.length <= 8) return 'pie';
  if (rows.length > 30) return 'table';
  return 'bar';
}

export default function QueryBuilderPage() {
  const { accountId } = useAccountId();
  const {
    plan, step, setStep,
    previewData, previewSql, previewRowCount, previewExecutionTimeMs,
    previewLoading, previewError,
    finalResult, finalLoading, finalError,
    transformPlan, setTransformPlan,
    derivedResult, derivedLoading, derivedError,
    setPlan, runPreview, runFinal, runDerived,
  } = useQueryBuilder();

  const chartType = finalResult
    ? inferChartType(finalResult.data, finalResult.chartConfig.xAxis, finalResult.chartConfig.seriesKeys)
    : 'table';

  const sharedProps = useMemo(
    () => ({ plan, onChange: setPlan, schema: SCHEMA_TABLES }),
    [plan, setPlan],
  );

  const stepComponent = useMemo(() => {
    // ── Step 7: Transform (derived query) ──────────────────────────────────
    if (step === 7) {
      if (!finalResult) return null;
      return (
        <StepTransform
          baseResult={finalResult}
          transform={transformPlan}
          onChange={setTransformPlan}
          onRun={() => void runDerived(finalResult.sql)}
          isRunning={derivedLoading}
          error={derivedError}
          derivedResult={derivedResult}
        />
      );
    }

    // ── Step 6: Results ────────────────────────────────────────────────────
    if (step === 6) {
      if (!finalResult) return null;
      return (
        <div className="rounded-xl border border-white/5 bg-[#0E0E15]">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7B7B9A]">Results</p>
              <h2 className="mt-1 text-lg font-semibold text-[#F0F0FF]">Query results</h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#7B7B9A]">
              <span className="rounded-md bg-[#22D3A3]/10 px-2 py-1 text-[#34D399]">{finalResult.rowCount} rows</span>
              <span>{finalResult.executionTimeMs}ms</span>
            </div>
          </div>
          <div className="p-5">
            <ChartRenderer
              type={chartType}
              data={finalResult.data}
              xAxis={finalResult.chartConfig.xAxis}
              yAxis={finalResult.chartConfig.yAxis}
              seriesKeys={finalResult.chartConfig.seriesKeys}
            />
          </div>
          {/* Transform CTA */}
          <div className="flex items-center justify-between border-t border-white/5 px-5 py-3">
            <p className="text-sm text-[#7B7B9A]">Want to filter or sort these results further?</p>
            <button
              type="button"
              onClick={() => setStep(7)}
              className="flex items-center gap-1.5 rounded-lg border border-white/8 px-4 py-2 text-xs text-[#7B7B9A] transition-colors hover:border-[#22D3A3]/30 hover:text-[#22D3A3]"
            >
              Transform →
            </button>
          </div>
        </div>
      );
    }

    // ── Steps 0–5: Builder ─────────────────────────────────────────────────
    switch (step) {
      case 0: return <StepTable {...sharedProps} />;
      case 1: return <StepColumns {...sharedProps} />;
      case 2: return <StepJoins {...sharedProps} />;
      case 3: return <StepFilters {...sharedProps} />;
      case 4: return <StepGroupSort {...sharedProps} />;
      default:
        return (
          <StepLimit
            {...sharedProps}
            onRunFinal={async () => {
              const result = await runFinal();
              if (result) setStep(6);
            }}
            canRun={Boolean(plan.table && plan.columns.length > 0)}
            isRunning={finalLoading}
          />
        );
    }
  }, [
    chartType, derivedError, derivedLoading, derivedResult, finalLoading,
    finalResult, plan, runDerived, runFinal, setStep, setTransformPlan,
    sharedProps, step, transformPlan,
  ]);

  // Lineage breadcrumb shown at step 6+ when there's a result
  const lineage = step >= 6 && plan.table && finalResult ? (
    <div className="mb-2 flex items-center gap-2 overflow-x-auto text-xs">
      <span className="whitespace-nowrap rounded-md border border-white/5 bg-[#111118] px-2.5 py-1 text-[#7B7B9A]">
        {plan.table}
      </span>
      <span className="text-[#2A2A3E]">→</span>
      <span className="whitespace-nowrap rounded-md border border-[#22D3A3]/15 bg-[#111118] px-2.5 py-1 text-[#22D3A3]">
        {finalResult.rowCount} rows
      </span>
      {derivedResult && (
        <>
          <span className="text-[#2A2A3E]">→</span>
          <span className="whitespace-nowrap rounded-md border border-[#818CF8]/20 bg-[#111118] px-2.5 py-1 text-[#818CF8]">
            {derivedResult.rowCount} rows (transformed)
          </span>
        </>
      )}
    </div>
  ) : null;

  return (
    <div className="flex h-screen flex-col bg-[#090910] text-[#F0F0FF]">
      <Navbar />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] px-5 py-5">

          {/* Lineage */}
          {lineage}

          {/* Step indicator */}
          <div className="mb-4">
            <StepIndicator
              currentStep={step}
              resultsEnabled={Boolean(plan.table && plan.columns.length > 0)}
              resultsActive={step === 6}
              onStepChange={setStep}
              onResultsClick={() => setStep(6)}
              transformEnabled={Boolean(finalResult)}
              transformActive={step === 7}
              onTransformClick={() => setStep(7)}
            />
          </div>

          {/* Main layout */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">

            {/* Left: builder */}
            <div className="space-y-4">
              {stepComponent}

              {finalError && (
                <div className="rounded-lg border border-[#F87171]/15 bg-[#F87171]/5 px-4 py-3 text-sm text-[#F87171]">
                  {finalError}
                </div>
              )}

              {/* Nav buttons */}
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-[#0E0E15] px-4 py-3">
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  className="rounded-lg border border-white/8 px-4 py-1.5 text-sm text-[#7B7B9A] transition-colors hover:border-white/15 hover:text-[#F0F0FF] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Back
                </button>

                {step < 5 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => Math.min(5, s + 1))}
                    className="rounded-lg bg-[#6366F1] px-5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#5558E8]"
                  >
                    Next
                  </button>
                )}
                {step === 5 && (
                  <span className="text-xs text-[#44445E]">Click Run &amp; Visualize above</span>
                )}
                {step === 6 && (
                  <button
                    type="button"
                    onClick={() => setStep(7)}
                    className="rounded-lg bg-[#22D3A3]/10 border border-[#22D3A3]/20 px-5 py-1.5 text-sm font-medium text-[#22D3A3] transition-colors hover:bg-[#22D3A3]/20"
                  >
                    Transform →
                  </button>
                )}
                {step === 7 && (
                  <button
                    type="button"
                    onClick={() => setStep(6)}
                    className="rounded-lg bg-[#6366F1] px-5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#5558E8]"
                  >
                    ← Results
                  </button>
                )}
              </div>
            </div>

            {/* Right: preview */}
            <div className="lg:sticky lg:top-5 lg:self-start" style={{ maxHeight: 'calc(100vh - 6rem)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <PreviewPane
                hasTable={Boolean(plan.table)}
                previewData={previewData}
                previewLoading={previewLoading}
                previewError={previewError}
                rowCount={previewRowCount}
                executionTimeMs={previewExecutionTimeMs}
                sql={previewSql}
                onRetry={() => void runPreview()}
              />
            </div>
          </div>
        </div>
      </div>

      {!accountId && <AccountIdModal />}
    </div>
  );
}
