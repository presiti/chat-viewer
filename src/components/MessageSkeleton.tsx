/** Placeholder rows shaped like messages (avatar + two lines) shown while a channel or thread is loading. */
export function MessageSkeleton({ rows = 6, compact = false }: { rows?: number; compact?: boolean }) {
  const widths = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-3/5", "w-1/3"];
  return (
    <div className="anim-fade space-y-4 px-5 py-4" role="status" aria-label="불러오는 중">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3">
          <div className={`skeleton shrink-0 rounded-md ${compact ? "h-6 w-6" : "h-9 w-9"}`} />
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <div className="skeleton h-3 w-28 rounded" />
            <div className={`skeleton h-3 rounded ${widths[i % widths.length]}`} />
            {!compact && i % 2 === 0 && <div className="skeleton h-3 w-1/2 rounded" />}
          </div>
        </div>
      ))}
    </div>
  );
}
