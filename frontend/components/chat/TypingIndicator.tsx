export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3 bg-[#16161F] border border-[#1E1E2E] rounded-2xl rounded-tl-sm w-fit">
      <div className="w-1.5 h-1.5 rounded-full bg-[#6366F1] dot-1" />
      <div className="w-1.5 h-1.5 rounded-full bg-[#6366F1] dot-2" />
      <div className="w-1.5 h-1.5 rounded-full bg-[#6366F1] dot-3" />
    </div>
  );
}