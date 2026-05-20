'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Database, FileCode2, GitBranch, Info, RefreshCcw, ShieldCheck, Sparkles, Table2, X } from 'lucide-react';

import { ChartType, SavedChart } from '@/types';

import ChartTypeSwitcher from '../chart/ChartTypeSwitcher';

interface Props {
  readonly chart: SavedChart | null;
  readonly readOnly?: boolean;
  readonly onClose: () => void;
  readonly onDuplicate: (chart: SavedChart) => Promise<void> | void;
  readonly onTypeChange: (chartId: string, chartType: ChartType) => Promise<void> | void;
  readonly onRegenerate: (prompt: string) => Promise<void> | void;
  readonly onUpdatePrompt: (chartId: string, prompt: string) => Promise<void> | void;
}

function formatDate(value?: string) {
  if (!value) {
    return 'Not recorded';
  }

  return new Date(value).toLocaleString();
}

function confidenceTone(score: number) {
  if (score >= 80) return 'text-[#22D3A3]';
  if (score >= 60) return 'text-[#F59E0B]';
  return 'text-[#F87171]';
}

export default function ChartExplainabilityPanel({
  chart,
  readOnly = false,
  onClose,
  onDuplicate,
  onTypeChange,
  onRegenerate,
  onUpdatePrompt,
}: Props) {
  const [promptDraft, setPromptDraft] = useState('');
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    setPromptDraft(chart?.prompt || '');
    setCopiedSql(false);
  }, [chart?._id, chart?.prompt]);

  if (!chart) {
    return null;
  }

  const confidence = chart.queryConfidence?.score ?? 0;
  const factors = chart.queryConfidence?.factors || [];
  const lineage = chart.metricLineage || [];
  const promptChanged = promptDraft.trim() !== chart.prompt.trim();

  const handleSavePrompt = async () => {
    if (readOnly || !promptDraft.trim()) return;
    setIsSavingPrompt(true);

    try {
      await onUpdatePrompt(chart._id, promptDraft.trim());
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleRegenerate = async () => {
    if (readOnly || !promptDraft.trim()) return;
    setIsRegenerating(true);

    try {
      await onRegenerate(promptDraft.trim());
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCopySql = async () => {
    if (typeof navigator === 'undefined') return;
    await navigator.clipboard.writeText(chart.sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 1600);
  };

  return (
    <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-2xl flex-col border-l border-[#1E1E2E] bg-[#0D0D13] shadow-[-16px_0_40px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-4 border-b border-[#1E1E2E] px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#7B7B9A]">Explainability</p>
          <h2 className="mt-1 truncate font-syne text-lg font-bold text-[#F0F0FF]">{chart.title}</h2>
          <p className="mt-1 text-xs text-[#7B7B9A]">Prompt, SQL, lineage, confidence, and execution metadata for this widget.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#7B7B9A] transition-colors hover:bg-[#16161F] hover:text-[#F0F0FF]">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg border border-[#1E1E2E] bg-[#111118] p-3">
            <Database size={14} className="mb-2 text-[#6366F1]" />
            <p className="text-xs text-[#7B7B9A]">Rows</p>
            <p className="mt-1 text-sm font-semibold text-[#F0F0FF]">{(chart.executionMetadata?.rowCount || chart.dataSnapshot.length).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-[#1E1E2E] bg-[#111118] p-3">
            <RefreshCcw size={14} className="mb-2 text-[#22D3A3]" />
            <p className="text-xs text-[#7B7B9A]">Duration</p>
            <p className="mt-1 text-sm font-semibold text-[#F0F0FF]">{chart.executionMetadata?.queryDurationMs ?? 0}ms</p>
          </div>
          <div className="rounded-lg border border-[#1E1E2E] bg-[#111118] p-3">
            <Table2 size={14} className="mb-2 text-[#F59E0B]" />
            <p className="text-xs text-[#7B7B9A]">Type</p>
            <p className="mt-1 text-sm font-semibold capitalize text-[#F0F0FF]">{chart.chartType}</p>
          </div>
          <div className="rounded-lg border border-[#1E1E2E] bg-[#111118] p-3">
            <ShieldCheck size={14} className="mb-2 text-[#A78BFA]" />
            <p className="text-xs text-[#7B7B9A]">Confidence</p>
            <p className={`mt-1 text-sm font-semibold ${confidenceTone(confidence)}`}>{confidence || '--'}%</p>
          </div>
        </div>

        <section className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#F0F0FF]">
            <Info size={14} className="text-[#6366F1]" />
            Editable prompt
          </h3>
          <textarea
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
            readOnly={readOnly}
            rows={4}
            className="w-full resize-none rounded-lg border border-[#1E1E2E] bg-[#111118] p-3 text-sm leading-relaxed text-[#D7D7EA] outline-none transition-colors focus:border-[#6366F1]/60 read-only:opacity-80"
          />
          {!readOnly && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSavePrompt}
                disabled={!promptChanged || isSavingPrompt || !promptDraft.trim()}
                className="flex items-center gap-2 rounded-lg border border-[#1E1E2E] px-3 py-2 text-xs font-medium text-[#F0F0FF] transition-colors hover:bg-[#16161F] disabled:opacity-40"
              >
                <Check size={13} />
                {isSavingPrompt ? 'Saving' : 'Save prompt'}
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={isRegenerating || !promptDraft.trim()}
                className="flex items-center gap-2 rounded-lg border border-[#6366F1]/30 bg-[#6366F1]/10 px-3 py-2 text-xs font-medium text-[#F0F0FF] transition-colors hover:bg-[#6366F1]/20 disabled:opacity-40"
              >
                <RefreshCcw size={13} />
                {isRegenerating ? 'Regenerating' : 'Regenerate from prompt'}
              </button>
            </div>
          )}
        </section>

        <section className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#F0F0FF]">
            <Sparkles size={14} className="text-[#A78BFA]" />
            AI explanation
          </h3>
          <div className="rounded-lg border border-[#1E1E2E] bg-[#111118] p-3 text-sm leading-relaxed text-[#D7D7EA]">
            {chart.aiExplanation || chart.reasoning || 'No AI explanation was stored for this chart yet. Regenerate the chart to capture one.'}
          </div>
        </section>

        <section className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#F0F0FF]">
            <GitBranch size={14} className="text-[#22D3A3]" />
            Metric lineage
          </h3>
          {lineage.length > 0 ? (
            <div className="space-y-2">
              {lineage.map((metric) => (
                <div key={metric.metricId} className="rounded-lg border border-[#1E1E2E] bg-[#111118] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#F0F0FF]">{metric.name}</span>
                    {metric.matchedBy.map((match) => (
                      <span key={match} className="rounded-full border border-[#6366F1]/30 bg-[#6366F1]/10 px-2 py-0.5 text-[11px] text-[#A78BFA]">
                        {match}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[#7B7B9A]">{metric.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-[#1E1E2E] bg-[#111118] p-3 text-sm text-[#7B7B9A]">
              No semantic metric matched. This chart can still be valid, but its business definition is query-specific.
            </div>
          )}
        </section>

        <section className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#F0F0FF]">
            <ShieldCheck size={14} className="text-[#F59E0B]" />
            Confidence factors
          </h3>
          <div className="rounded-lg border border-[#1E1E2E] bg-[#111118] p-3">
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-[#050508]">
              <div className="h-full rounded-full bg-[#6366F1]" style={{ width: `${Math.max(confidence, 4)}%` }} />
            </div>
            <div className="flex flex-wrap gap-2">
              {factors.map((factor) => (
                <span key={factor} className="rounded-full border border-[#1E1E2E] px-2 py-1 text-xs text-[#7B7B9A]">
                  {factor}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[#F0F0FF]">
              <FileCode2 size={14} className="text-[#22D3A3]" />
              Generated SQL
            </h3>
            <button type="button" onClick={handleCopySql} className="flex items-center gap-1.5 rounded-md border border-[#1E1E2E] px-2 py-1 text-xs text-[#7B7B9A] transition-colors hover:text-[#F0F0FF]">
              <Copy size={12} />
              {copiedSql ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="max-h-72 overflow-auto rounded-lg border border-[#1E1E2E] bg-[#050508] p-3 font-mono text-xs leading-relaxed text-[#A7F3D0]">
            {chart.sql}
          </pre>
        </section>

        <section className="mt-5 rounded-lg border border-[#1E1E2E] bg-[#111118] p-3">
          <h3 className="text-sm font-semibold text-[#F0F0FF]">Execution metadata</h3>
          <div className="mt-3 grid gap-2 text-xs text-[#7B7B9A] sm:grid-cols-2">
            <div>Last run: <span className="text-[#D7D7EA]">{formatDate(chart.executionMetadata?.lastRunAt)}</span></div>
            <div>Cache: <span className="capitalize text-[#D7D7EA]">{chart.executionMetadata?.cacheStatus || 'unknown'}</span></div>
            <div>X axis: <span className="text-[#D7D7EA]">{chart.chartConfig.xAxis || 'none'}</span></div>
            <div>Y axis: <span className="text-[#D7D7EA]">{chart.chartConfig.yAxis || 'none'}</span></div>
          </div>
        </section>

        {(chart as any).chartOverrideReason && (
          <section className="mt-5">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#F0F0FF]">
              <Info size={14} className="text-[#F59E0B]" />
              Chart engine override
            </h3>
            <div className="rounded-lg border border-[#F59E0B]/20 bg-[#F59E0B]/[0.06] p-3">
              <p className="text-xs leading-relaxed text-[#F59E0B]">{(chart as any).chartOverrideReason}</p>
            </div>
            {(chart as any).chartConfidence && (() => {
              const conf = (chart as any).chartConfidence as 'high' | 'medium' | 'low';
              let confidenceClass = 'border-[#F87171]/20 bg-[#F87171]/10 text-[#F87171]';
              let confidenceSymbol = '○';

              if (conf === 'high') {
                confidenceClass = 'border-[#22D3A3]/20 bg-[#22D3A3]/10 text-[#22D3A3]';
                confidenceSymbol = '●';
              } else if (conf === 'medium') {
                confidenceClass = 'border-[#F59E0B]/20 bg-[#F59E0B]/10 text-[#F59E0B]';
                confidenceSymbol = '◐';
              }

              return (
                <div className="mt-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${confidenceClass}`}>
                    {confidenceSymbol}{' '}Chart confidence: {conf}
                  </span>
                </div>
              );
            })()}
          </section>
        )}
      </div>

      <div className="border-t border-[#1E1E2E] px-5 py-4">
        {readOnly ? (
          <div className="rounded-lg border border-[#1E1E2E] bg-[#111118] px-3 py-2 text-sm text-[#7B7B9A]">
            Viewer mode is read-only. Builders can edit prompts, duplicate charts, regenerate SQL, and change chart type.
          </div>
        ) : (
          <>
            <div className="mb-3">
              {(() => {
                const xAxis = chart.chartConfig?.xAxis;
                const sliceCount = xAxis && Array.isArray(chart.dataSnapshot)
                  ? new Set(chart.dataSnapshot.map((row: any) => String(row?.[xAxis] ?? ''))).size
                  : 0;
                const pieDisabled = sliceCount > 15;
                const disabledTypes = pieDisabled ? ['pie'] as any[] : [];
                const disabledReasons = pieDisabled ? { pie: `${sliceCount} categories — pie requires 15 or fewer` } : {};

                return (
                  <ChartTypeSwitcher
                    active={chart.chartType}
                    onChange={(type) => onTypeChange(chart._id, type)}
                    disabledTypes={disabledTypes}
                    disabledReasons={disabledReasons}
                  />
                );
              })()}
            </div>
            <button
              type="button"
              onClick={() => onDuplicate(chart)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#1E1E2E] px-3 py-2 text-sm font-medium text-[#F0F0FF] transition-colors hover:bg-[#16161F]"
            >
              <Copy size={14} />
              Duplicate chart
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
