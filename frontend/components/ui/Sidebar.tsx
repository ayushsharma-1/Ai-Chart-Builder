'use client';

import { LayoutDashboard, MessageSquare, Plus, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ChatSession } from '@/types';

interface Props {
  sessions: ChatSession[];
  activeSessionId: string;
  onNewChat: () => void;
  onSelectChat: (sessionId: string) => void;
  onDeleteChat: (sessionId: string) => void;
}

export default function Sidebar({ sessions, activeSessionId, onNewChat, onSelectChat, onDeleteChat }: Props) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-[300px] shrink-0 border-r border-[#1E1E2E] bg-[#0A0A0F] flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#1E1E2E]">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6366F1] to-[#A78BFA] flex items-center justify-center">
          <Sparkles size={16} className="text-white" />
        </div>
        <div>
          <p className="font-syne font-bold text-[#F0F0FF] leading-none">Lens</p>
          <p className="text-xs text-[#7B7B9A] mt-1">AI Analytics</p>
        </div>
      </div>

      <div className="px-3 py-4 space-y-1 border-b border-[#1E1E2E]">
        <Link href="/chat" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${pathname === '/chat' ? 'bg-[#6366F1]/10 text-[#6366F1]' : 'text-[#7B7B9A] hover:text-[#F0F0FF] hover:bg-[#16161F]'}`}>
          <MessageSquare size={14} /> Chat
        </Link>
        <Link href="/dashboard" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${pathname === '/dashboard' ? 'bg-[#6366F1]/10 text-[#6366F1]' : 'text-[#7B7B9A] hover:text-[#F0F0FF] hover:bg-[#16161F]'}`}>
          <LayoutDashboard size={14} /> Dashboard
        </Link>
      </div>

      <div className="px-4 pt-4 pb-3 border-b border-[#1E1E2E]">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#6366F1]/30 bg-[#6366F1]/10 px-4 py-3 text-sm font-medium text-[#F0F0FF] transition-colors hover:bg-[#6366F1]/18 hover:border-[#6366F1]/50"
        >
          <Plus size={14} /> New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex items-center justify-between px-1 mb-3">
          <p className="text-xs uppercase tracking-[0.18em] text-[#3F3F5C]">Recent chats</p>
          <span className="text-xs text-[#7B7B9A]">{sessions.length}</span>
        </div>

        <div className="space-y-2">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const preview = session.messages.find((message) => message.role === 'user')?.content || 'No messages yet';

            return (
              <div
                key={session.id}
                className={`group relative w-full rounded-xl border p-3 text-left transition-all ${
                  isActive
                    ? 'border-[#6366F1]/40 bg-[#6366F1]/10 shadow-[0_0_0_1px_rgba(99,102,241,0.08)]'
                    : 'border-[#1E1E2E] bg-[#111118] hover:border-[#6366F1]/20 hover:bg-[#16161F]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectChat(session.id)}
                  className="flex w-full items-start gap-2 pr-8"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[#F0F0FF]">{session.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#7B7B9A]">{preview}</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onDeleteChat(session.id)}
                  className="absolute right-2 top-2 rounded-md p-1 text-[#3F3F5C] opacity-0 transition-opacity hover:text-[#F87171] group-hover:opacity-100"
                  aria-label={`Delete chat ${session.title}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}