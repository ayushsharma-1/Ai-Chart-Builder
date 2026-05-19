'use client';

import { FileText, LayoutDashboard, MessageSquare, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const path = usePathname();

  return (
    <nav className="h-14 border-b border-[#1E1E2E] flex items-center px-6 gap-6 bg-[#0A0A0F] flex-shrink-0">
      <div className="flex items-center gap-2 mr-4">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#6366F1] to-[#A78BFA] flex items-center justify-center">
          <Sparkles size={14} className="text-white" />
        </div>
        <span className="font-syne font-bold text-[#F0F0FF]">Lens</span>
      </div>

      <Link
        href="/chat"
        className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-all ${
          path === '/chat' ? 'bg-[#6366F1]/10 text-[#6366F1]' : 'text-[#7B7B9A] hover:text-[#F0F0FF]'
        }`}
      >
        <MessageSquare size={14} /> Chat
      </Link>

      <Link
        href="/dashboard"
        className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-all ${
          path === '/dashboard' ? 'bg-[#6366F1]/10 text-[#6366F1]' : 'text-[#7B7B9A] hover:text-[#F0F0FF]'
        }`}
      >
        <FileText size={14} /> Reports
      </Link>

      <Link
        href="/charts"
        className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-all ${
          path === '/charts' ? 'bg-[#6366F1]/10 text-[#6366F1]' : 'text-[#7B7B9A] hover:text-[#F0F0FF]'
        }`}
      >
        <LayoutDashboard size={14} /> Charts
      </Link>
    </nav>
  );
}
