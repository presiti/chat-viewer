import { Avatar } from "./Avatar";

/** Two overlapping member avatars (+N) — the conventional "group conversation" glyph. */
export function GroupAvatars({ userIds, size = 16, className }: { userIds: number[]; size?: number; className?: string }) {
  const shown = userIds.slice(0, 2);
  const rest = userIds.length - shown.length;
  const step = Math.round(size * 0.55);
  const width = step * (shown.length - 1) + size;
  return (
    <span className={`relative inline-block shrink-0 ${className ?? ""}`} style={{ width, height: size }}>
      {shown.map((id, i) => (
        <span key={id} className="absolute top-0 rounded-full ring-2 ring-[var(--bg-sidebar)] overflow-hidden" style={{ left: i * step, zIndex: shown.length - i }}>
          <Avatar userId={id} size={size} />
        </span>
      ))}
      {rest > 0 && <span className="absolute -bottom-1 -right-1 rounded-full bg-[var(--accent)] px-[3px] text-[8px] leading-[12px] font-bold text-[var(--accent-fg)]">+{rest}</span>}
    </span>
  );
}
