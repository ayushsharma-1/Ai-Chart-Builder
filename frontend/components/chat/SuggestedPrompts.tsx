'use client';

interface Props {
  onSelect: (prompt: string) => void;
}

const PROMPTS = [
  'Show candidates by status this month',
  'Top jobs by number of applicants',
  'Hiring pipeline stage breakdown',
  'Deal value won vs lost this quarter',
  'Candidates added per week last 3 months',
  'Jobs by department',
];

export default function SuggestedPrompts({ onSelect }: Props) {
  return (
    <div className="px-4 pb-4">
      <p className="text-[#3F3F5C] text-xs mb-2 uppercase tracking-widest">Try asking</p>
      <div className="flex flex-wrap gap-2">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onSelect(prompt)}
            className="px-3 py-1.5 bg-[#16161F] border border-[#1E1E2E] rounded-full text-xs text-[#7B7B9A] hover:text-[#F0F0FF] hover:border-[#6366F1]/50 hover:bg-[#6366F1]/5 transition-all"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}