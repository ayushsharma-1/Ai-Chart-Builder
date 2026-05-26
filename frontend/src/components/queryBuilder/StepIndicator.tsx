'use client';

import { ChevronRight } from 'lucide-react';

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
    <div className="rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] px-8 py-5 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-center gap-3 md:gap-4 pl-2">
        {STEPS.map((label, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isClickable = index <= currentStep;

          return (
            <div key={label} className="flex items-center">
              <button
                type="button"
                onClick={() => onStepChange(index)}
                disabled={!isClickable}
                className={`rounded-full px-5 py-2 text-sm font-medium transition-all duration-300 ${
                  isCurrent
                    ? 'bg-[#6366F1] text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]'
                    : isCompleted
                      ? 'border border-[#6366F1]/30 bg-[#6366F1]/15 text-[#6366F1] hover:bg-[#6366F1]/25'
                      : 'text-[#7B7B9A]'
                } ${isClickable ? 'hover:text-[#F0F0FF]' : 'cursor-not-allowed opacity-60'}`}
              >
                {isCompleted ? '✓ ' : `${index + 1} `}
                {label}
              </button>
              <ChevronRight size={16} className="mx-2 md:mx-3 text-[#3F3F5C]" />
            </div>
          );
        })}

        <button
          type="button"
          onClick={onResultsClick}
          disabled={!resultsEnabled}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-all duration-300 ${
            resultsActive
              ? 'bg-[#6366F1] text-white'
              : resultsEnabled
                ? 'text-[#7B7B9A] hover:text-[#F0F0FF]'
                : 'text-[#44445E] opacity-60'
          }`}
        >
          7 Results
        </button>
      </div>
    </div>
  );
}
