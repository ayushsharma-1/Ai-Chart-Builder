'use client';

import { AlertCircle, Sparkles } from 'lucide-react';

import { Message } from '@/types';

import TypingIndicator from './TypingIndicator';

interface Props {
  readonly message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  let bubbleClassName = 'bg-[#16161F] border border-[#1E1E2E] text-[#F0F0FF]';

  if (message.status === 'error') {
    bubbleClassName = 'bg-[#F87171]/10 border border-[#F87171]/20 text-[#F87171]';
  }

  if (message.status === 'loading') {
    return (
      <div className="flex items-start gap-3 animate-fade-slide">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6366F1] to-[#A78BFA] flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles size={13} className="text-white" />
        </div>
        <TypingIndicator />
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-slide">
        <div className="max-w-[80%] px-4 py-3 bg-[#6366F1] rounded-2xl rounded-tr-sm text-white text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 animate-fade-slide">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6366F1] to-[#A78BFA] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles size={13} className="text-white" />
      </div>
      <div
        className={`max-w-[85%] px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap ${bubbleClassName}`}
      >
        {message.status === 'error' && <AlertCircle size={13} className="inline mr-1.5 mb-0.5" />}
        {message.content}
      </div>
    </div>
  );
}