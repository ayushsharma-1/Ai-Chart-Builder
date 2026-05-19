'use client';

import { Copy, FileText, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import Navbar from '@/components/ui/Navbar';
import { useReports } from '@/hooks/useReports';

export default function DashboardPage() {
  const { reports, createReport, duplicateReport, deleteReport } = useReports();
  const [title, setTitle] = useState('');

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0F]">
      <Navbar />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-[#6366F1]" />
              <h1 className="font-syne text-xl font-bold text-[#F0F0FF]">Reports</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-[#7B7B9A]">
              Reusable dashboards with report-level layout, filters, sharing, AI summaries, and explainable charts.
            </p>
          </div>

          <form
            className="flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const report = await createReport({ title: title.trim() || 'Untitled report' });
              setTitle('');
              globalThis.window.location.href = `/report/${report._id}/edit`;
            }}
          >
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="New report title"
              className="h-10 w-64 rounded-lg border border-[#1E1E2E] bg-[#111118] px-3 text-sm text-[#F0F0FF] outline-none placeholder:text-[#3F3F5C]"
            />
            <button type="submit" className="flex h-10 items-center gap-2 rounded-lg bg-[#6366F1] px-4 text-sm font-medium text-white transition-colors hover:bg-[#5558E8]">
              <Plus size={14} />
              Create
            </button>
          </form>
        </div>

        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-[#7B7B9A] text-sm">No reports yet.</p>
            <p className="text-[#3F3F5C] text-xs mt-1">Create a report, then add saved charts to build a dashboard.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {reports.map((report) => (
              <article key={report._id} className="rounded-lg border border-[#1E1E2E] bg-[#111118] p-4 transition-colors hover:border-[#6366F1]/40">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/report/${report._id}`} className="min-w-0">
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[#7B7B9A]">{report.visibility}</p>
                    <h2 className="truncate font-syne text-lg font-bold text-[#F0F0FF]">{report.title}</h2>
                    <p className="mt-2 line-clamp-2 min-h-[40px] text-sm leading-relaxed text-[#7B7B9A]">
                      {report.description || 'No description yet.'}
                    </p>
                  </Link>
                  <div className="flex flex-shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => duplicateReport(report._id)}
                      className="rounded-md p-2 text-[#7B7B9A] transition-colors hover:bg-[#16161F] hover:text-[#F0F0FF]"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteReport(report._id)}
                      className="rounded-md p-2 text-[#7B7B9A] transition-colors hover:bg-[#16161F] hover:text-[#F87171]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#1E1E2E] pt-3 text-xs text-[#7B7B9A]">
                  <span>{report.charts?.length || 0} charts</span>
                  <Link href={`/report/${report._id}/edit`} className="text-[#6366F1] hover:text-[#A78BFA]">
                    Edit
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
