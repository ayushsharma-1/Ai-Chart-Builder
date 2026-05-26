'use client';

import { useMemo, useRef } from 'react';
import { GitBranch } from 'lucide-react';

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
import PreviewPane from '@/src/components/queryBuilder/PreviewPane';

function looksLikeDateValue(value: unknown) {
  if (typeof value === 'number') {
    return value > 946684800;
  }

  if (typeof value === 'string') {
    return /\d{4}-\d{2}|\d{4}\/\d{2}|\d{4}-\d{2}-\d{2}/.test(value);
  }

  return false;
}

function inferChartType(rowData: Record<string, unknown>[], xAxis: string, seriesKeys: string[]) : ChartType {
  if (rowData.length === 0) {
    return 'table';
  }

  const sampleValues = rowData.slice(0, 10).map((row) => row[xAxis]);

  if (sampleValues.some((value) => looksLikeDateValue(value) || (typeof xAxis === 'string' && isDateLikeColumn(xAxis)))) {
    return 'line';
  }

  if (seriesKeys.length > 1) {
    return 'bar';
  }

  if (rowData.length <= 8) {
    return 'pie';
  }

  if (rowData.length > 30) {
    return 'table';
  }

  return 'bar';
}

export default function QueryBuilderPage() {
  const { accountId } = useAccountId();
  const {
    plan,
    step,
    setStep,
    previewData,
    previewSql,
    previewRowCount,
    previewExecutionTimeMs,
    previewLoading,
    previewError,
    finalResult,
    finalLoading,
    finalError,
    setPlan,
    runPreview,
    runFinal,
  } = useQueryBuilder();
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const chartType = finalResult ? inferChartType(finalResult.data, finalResult.chartConfig.xAxis, finalResult.chartConfig.seriesKeys) : 'table';

  const currentStepComponent = useMemo(() => {
    const sharedProps = {
      plan,
      onChange: setPlan,
      schema: SCHEMA_TABLES,
    };

    if (step === 6) {
      return finalResult ? (
        <section ref={resultsRef} id="query-builder-results" className="space-y-4 rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] p-6 shadow-xl shadow-black/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#7B7B9A]">Results</p>
              <h2 className="mt-1 font-syne text-2xl font-bold text-[#F0F0FF]">Compiled query visualization</h2>
            </div>
            <div className="text-sm text-[#7B7B9A]">
              {finalResult.rowCount} rows · {finalResult.executionTimeMs}ms
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#1E1E2E] bg-[#111118] p-4">
            <ChartRenderer
              type={chartType}
              data={finalResult.data}
              xAxis={finalResult.chartConfig.xAxis}
              yAxis={finalResult.chartConfig.yAxis}
              seriesKeys={finalResult.chartConfig.seriesKeys}
            />
          </div>
        </section>
      ) : null;
    }

    switch (step) {
      case 0:
        return <StepTable {...sharedProps} />;
      case 1:
        return <StepColumns {...sharedProps} />;
      case 2:
        return <StepJoins {...sharedProps} />;
      case 3:
        return <StepFilters {...sharedProps} />;
      case 4:
        return <StepGroupSort {...sharedProps} />;
      case 5:
      default:
        return (
          <StepLimit
            {...sharedProps}
            onRunFinal={async () => {
              const result = await runFinal();
              if (result) {
                setStep(6);
              }
            }}
            canRun={Boolean(plan.table && plan.columns.length > 0)}
            isRunning={finalLoading}
          />
        );
    }
  }, [chartType, finalLoading, finalResult, plan, runFinal, setPlan, step]);

  const handleResultsClick = () => {
    setStep(6);
  };

  const canRun = Boolean(plan.table && plan.columns.length > 0 && !finalLoading);

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0F] text-[#F0F0FF]">
      <Navbar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid min-h-full max-w-[1800px] gap-8 px-8 py-8 lg:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
          <div className="space-y-8">
            <div className="rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] p-6 shadow-xl shadow-black/20 pb-4 border-b mb-4">
              <div className="flex flex-wrap items-start gap-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#22D3A3] shadow-lg shadow-indigo-500/20">
                  <GitBranch size={20} className="text-white" />
                </div>
                <div className="min-w-0 flex-1 mt-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#7B7B9A]">Query Builder</p>
                  <h1 className="mt-2 font-syne text-3xl font-bold text-[#F0F0FF]">Visual query composition</h1>
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#7B7B9A]">
                    Build a query step by step without writing SQL. Every change runs a live preview, and SQL is compiled only at execution time.
                  </p>
                </div>
              </div>
            </div>

            <StepIndicator
              currentStep={step}
              resultsEnabled={Boolean(plan.table && plan.columns.length > 0)}
              resultsActive={step === 6}
              onStepChange={setStep}
              onResultsClick={handleResultsClick}
            />

            {currentStepComponent}

            {finalError && (
              <div className="rounded-2xl border border-[#F87171]/30 bg-[#2A1216] p-4 text-sm text-[#FCA5A5]">
                {finalError}
              </div>
            )}

            <div className="mt-8 flex items-center justify-between gap-4 border-t border-[#1E1E2E] bg-[#0E0E15] px-6 py-4 shadow-xl shadow-black/20">
              <button
                type="button"
                onClick={() => setStep((current) => Math.max(0, current - 1))}
                disabled={step === 0}
                className="rounded-xl border border-[#1E1E2E] bg-[#111118] px-4 py-2 text-sm text-[#F0F0FF] transition-colors hover:border-[#6366F1]/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Back
              </button>

              {step < 5 ? (
                <button
                  type="button"
                  onClick={() => setStep((current) => Math.min(5, current + 1))}
                  className="rounded-xl bg-[#6366F1] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5558E8]"
                >
                  Next
                </button>
              ) : step === 5 ? <span className="text-sm text-[#7B7B9A]">Use the button in the Limit step to run the final query.</span> : (
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="rounded-xl bg-[#6366F1] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5558E8]"
                >
                  Back to builder
                </button>
              )}
            </div>
          </div>

          <div className="lg:sticky lg:top-8 lg:self-start">
            <PreviewPane
              hasTable={Boolean(plan.table)}
              previewData={previewData}
              previewLoading={previewLoading}
              previewError={previewError}
              rowCount={previewRowCount}
              executionTimeMs={previewExecutionTimeMs}
              sql={previewSql}
              onRetry={() => {
                void runPreview();
              }}
            />
          </div>
        </div>
      </div>

      {!accountId && <AccountIdModal />}
    </div>
  );
}
