'use client';

import { Brain, Sparkles } from 'lucide-react';

import { Report } from '@/types';

interface Props {
  readonly report: Report;
  readonly isGenerating: boolean;
  readonly onGenerate: () => void;
}

export default function ReportInsights({ report, isGenerating, onGenerate }: Props) {
  const insights = report.aiSummary?.insights || [];
  const getSeverityClass = (severity: Report['aiSummary']['insights'][number]['severity']) => {
    if (severity === 'success') return 'bg-[#22D3A3]';
    if (severity === 'warning') return 'bg-[#F59E0B]';
    return 'bg-[#6366F1]';
  };

  return (
    <section className="border-b border-[#1E1E2E] bg-[#0A0A0F] px-6 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F0F0FF]">
            <Brain size={16} className="text-[#A78BFA]" />
            AI dashboard insights
          </div>
          {report.aiSummary?.summary && (
            <p className="mt-1 text-sm leading-relaxed text-[#7B7B9A]">{report.aiSummary.summary}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="flex flex-shrink-0 items-center gap-2 rounded-lg border border-[#6366F1]/30 bg-[#6366F1]/10 px-3 py-2 text-xs font-medium text-[#F0F0FF] transition-colors hover:bg-[#6366F1]/20 disabled:opacity-50"
        >
          <Sparkles size={13} />
          {isGenerating ? 'Generating' : 'Generate'}
        </button>
      </div>

      {insights.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {insights.map((insight) => (
            <article key={insight.id} className="rounded-lg border border-[#1E1E2E] bg-[#111118] p-3">
              <div className={`mb-2 h-1 w-8 rounded-full ${getSeverityClass(insight.severity)}`} />
              <h3 className="line-clamp-2 text-sm font-semibold text-[#F0F0FF]">{insight.title}</h3>
              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[#7B7B9A]">{insight.detail}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
