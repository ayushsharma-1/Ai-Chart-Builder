'use client';

import DashboardGrid from '@/components/dashboard/DashboardGrid';
import Navbar from '@/components/ui/Navbar';
import { useCharts } from '@/hooks/useCharts';
import { LayoutDashboard } from 'lucide-react';

export default function ChartsPage() {
  const { savedCharts, deleteChart, updatePosition } = useCharts();

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0F]">
      <Navbar />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <LayoutDashboard size={20} className="text-[#6366F1]" />
          <h1 className="font-syne font-bold text-[#F0F0FF] text-xl">Saved Charts</h1>
          <span className="ml-auto text-[#7B7B9A] text-sm">{savedCharts.length} charts</span>
        </div>

        {savedCharts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-[#7B7B9A] text-sm">No saved charts yet.</p>
            <p className="text-[#3F3F5C] text-xs mt-1">Go to Chat, generate a chart, and hit Save.</p>
          </div>
        ) : (
          <DashboardGrid charts={savedCharts} onDelete={deleteChart} onLayoutChange={updatePosition} />
        )}
      </div>
    </div>
  );
}
