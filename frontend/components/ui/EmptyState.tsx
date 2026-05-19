import { BarChart2 } from 'lucide-react';

interface Props {
  readonly title?: string;
  readonly message?: string;
}

export default function EmptyState({
  title = 'No chart yet',
  message = 'Ask a question in the chat and your visualization will appear here.',
}: Props) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-10 text-center max-w-sm">
      <div className="w-16 h-16 rounded-2xl border border-[#1E1E2E] bg-[#111118] flex items-center justify-center">
        <BarChart2 size={28} className="text-[#3F3F5C]" />
      </div>
      <div>
        <h3 className="font-syne font-bold text-[#F0F0FF] mb-1">{title}</h3>
        <p className="text-[#7B7B9A] text-sm leading-relaxed">{message}</p>
      </div>
    </div>
  );
}