'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, Eye, FileText, Lock, Plus, RotateCcw, Save, Search, Share2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import api from '@/lib/api';
import { useCharts } from '@/hooks/useCharts';
import { useReport } from '@/hooks/useReports';
import { useSaveChart } from '@/hooks/useSaveChart';
import { ChartType, Report, ReportRefreshResult, SavedChart } from '@/types';

import ChartExplainabilityPanel from './ChartExplainabilityPanel';
import ReportGrid from './ReportGrid';
import ReportInsights from './ReportInsights';

interface Props {
  readonly reportId: string;
  readonly mode: 'view' | 'edit';
}

function buildShareUrl(report: Report) {
  if (globalThis.window === undefined || !report.share?.token) {
    return '';
  }

  return `${globalThis.window.location.origin}/report/${report._id}?shareToken=${report.share.token}`;
}

export default function ReportWorkspace({ reportId, mode }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shareToken = searchParams?.get('shareToken') || undefined;
  const readOnly = mode === 'view';
  const { report, isLoading, error, setReport, updateReport, addChart, updateLayout, refresh, generateInsights, share, fetchReport } = useReport(reportId, { mode, shareToken });
  const { savedCharts, fetchCharts } = useCharts();
  const [selectedChart, setSelectedChart] = useState<SavedChart | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [showChartPicker, setShowChartPicker] = useState(false);
  const [chartSearch, setChartSearch] = useState('');
  const [addingChartId, setAddingChartId] = useState<string | null>(null);
  const [refreshResults, setRefreshResults] = useState<ReportRefreshResult[]>([]);
  const {
    runSave: saveReportTitle,
    isSaving: isSavingTitle,
    isSaved: titleSaved,
    error: titleSaveError,
    reset: resetTitleSaveState,
  } = useSaveChart(async () => {
    await updateReport({
      title: draftTitle.trim() || (report?.title ?? ''),
      description: draftDescription ?? (report?.description ?? ''),
    });
  });

  useEffect(() => {
    resetTitleSaveState();
  }, [draftTitle, draftDescription, report?._id, resetTitleSaveState]);

  const availableCharts = useMemo(() => {
    const attachedIds = new Set((report?.charts || []).map((chart) => chart._id));
    const normalizedSearch = chartSearch.trim().toLowerCase();

    return savedCharts
      .filter((chart) => !attachedIds.has(chart._id))
      .filter((chart) => !normalizedSearch || chart.title.toLowerCase().includes(normalizedSearch) || chart.prompt.toLowerCase().includes(normalizedSearch));
  }, [chartSearch, report?.charts, savedCharts]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0A0A0F] text-sm text-[#7B7B9A]">
        Loading report...
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0A0A0F] text-center">
        <p className="text-sm text-[#F87171]">{error || 'Report not found.'}</p>
        <Link href="/dashboard" className="mt-4 rounded-lg border border-[#1E1E2E] px-3 py-2 text-sm text-[#F0F0FF]">
          Back to reports
        </Link>
      </div>
    );
  }

  const handleTitleSave = async () => {
    if (readOnly) return;
    await saveReportTitle();
  };

  let titleSaveButtonLabel = 'Save';

  if (titleSaveError) {
    titleSaveButtonLabel = 'Save failed';
  } else if (isSavingTitle) {
    titleSaveButtonLabel = 'Saving';
  } else if (titleSaved) {
    titleSaveButtonLabel = 'Saved';
  }

  const handleLayoutCommit = async (layout: Array<{ chartId: string; gridPosition: SavedChart['gridPosition'] }>) => {
    if (readOnly || layout.length === 0) {
      return;
    }

    await updateLayout(layout);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshResults([]);

    try {
      const result = await refresh({ persistSnapshots: !readOnly });
      setRefreshResults(result?.results || []);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleInsights = async () => {
    setIsGeneratingInsights(true);

    try {
      await generateInsights();
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  const handleShare = async () => {
    const nextReport = await share(true);

    if (nextReport?.share?.token && typeof navigator !== 'undefined') {
      await navigator.clipboard.writeText(buildShareUrl(nextReport));
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    }
  };

  const handleDuplicateChart = async (chart: SavedChart) => {
    if (readOnly) return;
    const { data } = await api.post(`/api/charts/${chart._id}/duplicate`);

    if (data.chart?._id) {
      await addChart(data.chart._id);
      await fetchCharts();
    }
  };

  const handleRemoveChart = async (chartId: string) => {
    setReport((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        charts: current.charts.filter((chart) => chart._id !== chartId),
      };
    });
  };

  const handleAddChart = async (chartId: string) => {
    if (readOnly || addingChartId) return;
    setAddingChartId(chartId);

    try {
      await addChart(chartId);
      setChartSearch('');
    } finally {
      setAddingChartId(null);
    }
  };

  const handleTypeChange = async (chartId: string, chartType: ChartType) => {
    if (readOnly) return;
    const { data } = await api.patch(`/api/charts/${chartId}`, { chartType });
    setSelectedChart(data.chart);
    await fetchReport();
  };

  const handleUpdatePrompt = async (chartId: string, prompt: string) => {
    if (readOnly) return;
    const { data } = await api.patch(`/api/charts/${chartId}`, { prompt });
    setSelectedChart(data.chart);
    await fetchReport();
  };

  const handleRegenerate = async (prompt: string) => {
    if (readOnly || !selectedChart) return;
    const { data } = await api.post('/api/query', {
      prompt,
      previousContext: {
        previousPrompt: selectedChart.prompt,
        previousTitle: selectedChart.title,
        previousSql: selectedChart.sql,
        previousChartType: selectedChart.chartType,
      },
    });

    if (data.success) {
      const updated = await api.patch(`/api/charts/${selectedChart._id}`, {
        title: data.title,
        prompt,
        sql: data.sql,
        reasoning: data.reasoning,
        aiExplanation: data.aiExplanation,
        queryConfidence: data.queryConfidence,
        metricLineage: data.metricLineage,
        chartType: data.chartType,
        chartConfig: data.chartConfig,
        dataSnapshot: data.data,
        executionMetadata: data.executionMetadata,
      });
      setSelectedChart(updated.data.chart);
      await fetchReport();
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[#0A0A0F]">
      <header className="border-b border-[#1E1E2E] bg-[#0A0A0F] px-6 py-4">
        <div className="mb-4 flex items-center gap-2 text-xs text-[#7B7B9A]">
          <Link href="/dashboard" className="flex items-center gap-1 transition-colors hover:text-[#F0F0FF]">
            <ArrowLeft size={13} />
            Reports
          </Link>
          <span>/</span>
          <span className="truncate text-[#F0F0FF]">{report.title}</span>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            {readOnly ? (
              <>
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-[#6366F1]" />
                  <h1 className="truncate font-syne text-2xl font-bold text-[#F0F0FF]">{report.title}</h1>
                </div>
                {report.description && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#7B7B9A]">{report.description}</p>}
              </>
            ) : (
              <div className="grid gap-2">
                <input
                  value={draftTitle || report.title}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  className="min-w-0 bg-transparent font-syne text-2xl font-bold text-[#F0F0FF] outline-none placeholder:text-[#3F3F5C]"
                />
                <input
                  value={draftDescription || report.description}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  placeholder="Report description"
                  className="max-w-3xl bg-transparent text-sm text-[#7B7B9A] outline-none placeholder:text-[#3F3F5C]"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-[#1E1E2E] bg-[#111118] px-3 py-2 text-xs text-[#7B7B9A]">
              {report.visibility === 'public' ? <Eye size={13} className="text-[#22D3A3]" /> : <Lock size={13} className="text-[#F59E0B]" />}
              {report.visibility}
            </div>

            {!readOnly && (
              <>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowChartPicker((current) => !current)}
                    className="flex h-9 items-center gap-2 rounded-lg border border-[#1E1E2E] bg-[#111118] px-3 text-sm font-medium text-[#F0F0FF] transition-colors hover:bg-[#16161F]"
                  >
                    <Plus size={14} />
                    Add chart
                  </button>
                  {showChartPicker && (
                    <div className="absolute right-0 top-11 z-40 w-[360px] rounded-lg border border-[#1E1E2E] bg-[#0D0D13] p-3 shadow-2xl">
                        <div className="flex items-center gap-2">
                          <Search size={14} className="text-[#7B7B9A]" />
                          <input
                            value={chartSearch}
                            onChange={(event) => setChartSearch(event.target.value)}
                            placeholder="Search saved charts"
                            className="min-w-0 flex-1 bg-transparent text-sm text-[#F0F0FF] outline-none placeholder:text-[#3F3F5C]"
                          />
                          <button type="button" onClick={() => setShowChartPicker(false)} className="text-[#7B7B9A] hover:text-[#F0F0FF]">
                            <X size={14} />
                          </button>
                        </div>
                      <div className="max-h-80 overflow-y-auto mt-3">
                        {availableCharts.length === 0 ? (
                          <div className="rounded-lg border border-[#1E1E2E] bg-[#111118] p-3 text-sm text-[#7B7B9A]">
                            No saved charts available. Generate and save charts from Chat, or all saved charts are already in this report.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {availableCharts.map((chart) => (
                              <button
                                key={chart._id}
                                type="button"
                                onClick={() => handleAddChart(chart._id)}
                                disabled={Boolean(addingChartId)}
                                className="block w-full rounded-lg border border-[#1E1E2E] bg-[#111118] p-3 text-left transition-colors hover:border-[#6366F1]/40 hover:bg-[#16161F] disabled:opacity-50"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="truncate text-sm font-semibold text-[#F0F0FF]">{chart.title}</span>
                                  <span className="text-xs text-[#6366F1]">{addingChartId === chart._id ? 'Adding' : 'Add'}</span>
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#7B7B9A]">{chart.prompt}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleTitleSave()}
                  disabled={isSavingTitle}
                  className="flex items-center gap-2 rounded-lg border border-[#1E1E2E] px-3 py-2 text-sm font-medium text-[#F0F0FF] transition-colors hover:bg-[#16161F] disabled:opacity-50"
                >
                  <Save size={14} />
                  {titleSaveButtonLabel}
                </button>
                {titleSaveError && <p className="w-full text-xs text-[#F87171]">{titleSaveError}</p>}
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 rounded-lg border border-[#22D3A3]/30 bg-[#22D3A3]/10 px-3 py-2 text-sm font-medium text-[#22D3A3] transition-colors hover:bg-[#22D3A3]/15 disabled:opacity-50"
                >
                  <RotateCcw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex items-center gap-2 rounded-lg border border-[#6366F1]/30 bg-[#6366F1]/10 px-3 py-2 text-sm font-medium text-[#F0F0FF] transition-colors hover:bg-[#6366F1]/20"
                >
                  {shareCopied ? <Copy size={14} /> : <Share2 size={14} />}
                  {shareCopied ? 'Copied' : 'Share'}
                </button>
              </>
            )}

            {readOnly && mode === 'view' && !shareToken && (
              <button
                type="button"
                onClick={() => router.push(`/report/${report._id}/edit`)}
                className="flex items-center gap-2 rounded-lg border border-[#6366F1]/30 bg-[#6366F1]/10 px-3 py-2 text-sm font-medium text-[#F0F0FF]"
              >
                <Plus size={14} />
                Edit
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ReportInsights report={report} isGenerating={isGeneratingInsights} onGenerate={handleInsights} />

        {isRefreshing && (
          <div className="border-b border-[#1E1E2E] bg-[#111118] px-6 py-2 text-xs text-[#22D3A3]">
            Refreshing chart snapshots...
          </div>
        )}

        {!isRefreshing && refreshResults.length > 0 && (
          <div className="border-b border-[#1E1E2E] bg-[#0D0D13] px-6 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-[#F0F0FF]">Refresh complete</span>
              <span className="text-[#7B7B9A]">
                {refreshResults.filter((result) => result.success).length}/{refreshResults.length} charts refreshed
              </span>
              {refreshResults.some((result) => !result.success) && (
                <span className="rounded-full border border-[#F87171]/30 bg-[#F87171]/10 px-2 py-1 text-[#F87171]">
                  Some charts failed
                </span>
              )}
            </div>
          </div>
        )}

        <main className="px-4 py-4">
          <ReportGrid
            reportId={report._id}
            charts={report.charts || []}
            readOnly={readOnly}
            onInspect={setSelectedChart}
            onExplain={setSelectedChart}
            onRemove={handleRemoveChart}
            onLayoutCommit={handleLayoutCommit}
          />
        </main>
      </div>

      <ChartExplainabilityPanel
        chart={selectedChart}
        readOnly={readOnly}
        onClose={() => setSelectedChart(null)}
        onDuplicate={handleDuplicateChart}
        onTypeChange={handleTypeChange}
        onRegenerate={handleRegenerate}
        onUpdatePrompt={handleUpdatePrompt}
      />
    </div>
  );
}
