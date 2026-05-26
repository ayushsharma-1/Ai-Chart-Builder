'use client';

import { Edit2, FileText, GitBranch, LayoutDashboard, MessageSquare, Shield, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

import { useAccountId } from '@/hooks/useAccountId';

import AccountIdModal from './AccountIdModal';

export default function Navbar() {
  const path = usePathname();
  const { accountId } = useAccountId();
  const [isEditingAccountId, setIsEditingAccountId] = useState(false);

  return (
    <nav className="sticky top-0 z-50 h-14 border-b border-white/5 bg-[#0A0A0F]/70 backdrop-blur-md flex items-center px-6 gap-6 flex-shrink-0">
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

      <Link
        href="/query-builder"
        className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-all ${
          path === '/query-builder' ? 'bg-[#6366F1]/10 text-[#6366F1]' : 'text-[#7B7B9A] hover:text-[#F0F0FF]'
        }`}
      >
        <GitBranch size={14} /> Query Builder
      </Link>

      <div className="ml-auto flex items-center">
        <button
          type="button"
          onClick={() => setIsEditingAccountId(true)}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[#F0F0FF] transition-all hover:bg-white/10 hover:shadow-[0_0_10px_rgba(255,255,255,0.05)]"
        >
          <Shield size={12} className="text-[#22D3A3]" />
          {accountId ? (
            <>
              <span>Account: {accountId}</span>
              <Edit2 size={12} className="text-[#7B7B9A]" />
            </>
          ) : (
            <span className="text-[#7B7B9A]">Set Account ID</span>
          )}
        </button>
      </div>

      <AccountIdModal
        open={isEditingAccountId}
        mode={accountId ? 'edit' : 'create'}
        initialAccountId={accountId}
        onClose={() => setIsEditingAccountId(false)}
      />
    </nav>
  );
}
