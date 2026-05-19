'use client';

import { AlertCircle } from 'lucide-react';

interface Props {
  message: string;
}

export default function ErrorBanner({ message }: Props) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#F87171]/20 bg-[#F87171]/10 text-[#F87171] text-sm">
      <AlertCircle size={14} />
      <span>{message}</span>
    </div>
  );
}