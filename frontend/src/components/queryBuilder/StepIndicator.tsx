'use client';

const STEPS = ['Table', 'Columns', 'Joins', 'Filters', 'Group & Sort', 'Limit'] as const;

interface Props {
  currentStep: number;
  resultsEnabled: boolean;
  resultsActive: boolean;
  onStepChange: (step: number) => void;
  onResultsClick: () => void;
}

export default function StepIndicator({ currentStep, resultsEnabled, resultsActive, onStepChange, onResultsClick }: Readonly<Props>) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-white/5 bg-[#0E0E15] px-3 py-2">
      {STEPS.map((label, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep && !resultsActive;
        const isClickable = index <= currentStep;

        return (
          <div key={label} className="flex shrink-0 items-center">
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => onStepChange(index)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap transition-all duration-150
                ${isCurrent
                  ? 'bg-[#6366F1]/10 text-[#6366F1] font-medium'
                  : isCompleted
                    ? 'text-[#7B7B9A] hover:text-[#F0F0FF]'
                    : 'text-[#3F3F5C]'
                }
                ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}
              `}
            >
              {isCompleted ? (
                <svg viewBox="0 0 10 8" className="h-2.5 w-2 shrink-0 text-[#22D3A3]" fill="none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span className={`shrink-0 text-[10px] font-semibold ${isCurrent ? 'text-[#6366F1]' : 'text-[#44445E]'}`}>{index + 1}</span>
              )}
              <span>{label}</span>
            </button>

            {index < STEPS.length - 1 && (
              <span className="mx-1 text-[#2A2A3E]">/</span>
            )}
          </div>
        );
      })}

      <span className="mx-1 text-[#2A2A3E]">/</span>

      <button
        type="button"
        disabled={!resultsEnabled}
        onClick={onResultsClick}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap transition-all duration-150
          ${resultsActive
            ? 'bg-[#6366F1]/10 text-[#6366F1] font-medium'
            : resultsEnabled
              ? 'text-[#7B7B9A] hover:text-[#F0F0FF] cursor-pointer'
              : 'text-[#3F3F5C] cursor-not-allowed'
          }`}
      >
        <span className="shrink-0 text-[10px] font-semibold text-[#44445E]">7</span>
        <span>Results</span>
      </button>
    </div>
  );
}
