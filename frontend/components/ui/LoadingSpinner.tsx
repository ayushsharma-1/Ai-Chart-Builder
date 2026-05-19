'use client';

export default function LoadingSpinner() {
  return (
    <div className="inline-flex items-center gap-2 text-[#7B7B9A] text-sm">
      <span className="w-4 h-4 rounded-full border-2 border-[#6366F1]/30 border-t-[#6366F1] animate-spin" />
      Loading...
    </div>
  );
}