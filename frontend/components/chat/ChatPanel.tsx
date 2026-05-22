'use client';

import { useEffect, useRef, useState } from 'react';

import { ChartResult, ChatSession, ChartType } from '@/types';
import { MessageSquarePlus, Send, Sparkles } from 'lucide-react';

import MessageBubble from './MessageBubble';
import SuggestedPrompts from './SuggestedPrompts';
import InlineChartCard from './InlineChartCard';
import type { Message } from '@/types';

interface Props {
  messages: Message[];
  isLoading: boolean;
  onSend: (prompt: string) => void;
  onSaveChart: (result: ChartResult, type: ChartType) => Promise<void>;
  onNewChat: () => void;
  activeSession?: ChatSession | null;
}

export default function ChatPanel({ messages, isLoading, onSend, onSaveChart, onNewChat, activeSession }: Readonly<Props>) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxTextareaHeight = 160;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxTextareaHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxTextareaHeight ? 'auto' : 'hidden';
  }, [input]);

  const handleSend = () => {
    const trimmed = input.trim();

    if (!trimmed || isLoading) {
      return;
    }

    onSend(trimmed);
    setInput('');
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#0A0A0F]">
      <div className="flex items-center justify-between gap-3 border-b border-[#1E1E2E] px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6366F1] to-[#A78BFA] flex items-center justify-center">
              <Sparkles size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-syne text-sm font-bold text-[#F0F0FF] sm:text-base">
                {activeSession?.title || 'New chat'}
              </h1>
              <p className="text-xs text-[#3F3F5C]">Centered chat workspace</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-[#1E1E2E] bg-[#111118] px-3 py-1.5 text-xs text-[#22D3A3]">
            <div className="h-1.5 w-1.5 rounded-full bg-[#22D3A3] animate-pulse" />
            Live
          </div>
          <button
            type="button"
            onClick={onNewChat}
            className="flex items-center gap-2 rounded-lg border border-[#6366F1]/30 bg-[#6366F1]/10 px-3 py-2 text-sm font-medium text-[#F0F0FF] transition-colors hover:border-[#6366F1]/50 hover:bg-[#6366F1]/20"
          >
            <MessageSquarePlus size={14} />
            New chat
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-4">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:py-24">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#A78BFA] shadow-lg shadow-indigo-500/20">
              <Sparkles size={24} className="text-white" />
            </div>
            <h2 className="max-w-xl font-syne text-2xl font-bold text-[#F0F0FF] sm:text-3xl">
              Ask a question. Keep the workspace centered.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#7B7B9A] sm:text-base">
              Start a new chat anytime, revisit older conversations from the history rail, and keep your charts saved separately on the dashboard.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className="mx-auto w-full max-w-3xl">
            <MessageBubble message={message} />
            {message.role === 'assistant' && message.chartResult && (
              <InlineChartCard result={message.chartResult} onSave={onSaveChart} />
            )}
          </div>
        ))}

        <div ref={bottomRef} />
        </div>
      </div>

      {messages.length === 0 && (
        <div className="border-t border-[#1E1E2E] px-4 pb-3 pt-1 sm:px-6">
          <div className="mx-auto w-full max-w-4xl">
            <SuggestedPrompts
              onSelect={(prompt) => {
                setInput(prompt);
                textareaRef.current?.focus();
              }}
            />
          </div>
        </div>
      )}

      <div className="border-t border-[#1E1E2E] px-4 pb-4 pt-3 sm:px-6">
        <div className="mx-auto w-full max-w-4xl">
          <div className="flex items-end gap-2 rounded-2xl border border-[#1E1E2E] bg-[#111118] px-3 py-2.5 transition-all focus-within:border-[#6366F1]/50 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about candidates, jobs, pipeline, or deals..."
              rows={1}
              className="min-h-[2.5rem] flex-1 resize-none bg-transparent text-sm leading-relaxed text-[#F0F0FF] outline-none placeholder:text-[#3F3F5C] overflow-y-auto"
              style={{ maxHeight: `${maxTextareaHeight}px` }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#6366F1] transition-colors hover:bg-[#5558E8] disabled:cursor-not-allowed disabled:opacity-30 shadow-lg shadow-indigo-500/20"
            >
              <Send size={13} className="text-white" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-[#3F3F5C]">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}