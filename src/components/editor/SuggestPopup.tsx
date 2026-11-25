import clsx from "clsx";
import type { SuggestState } from "./extensions";
import { Avatar } from "../Avatar";

export function SuggestPopup({ suggest, className }: { suggest: SuggestState | null; className?: string }) {
  if (!suggest || suggest.items.length === 0) return null;
  return (
    <div className={clsx("popover z-40 w-[300px] py-1 max-h-[280px] overflow-y-auto", className)}>
      {suggest.items.map((s, i) => (
        <button
          key={s.key}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); suggest.command(s); }}
          className={clsx("w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px]", i === suggest.index ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "hover:bg-[var(--hover)]")}
        >
          {s.char ? <span className="text-[18px] w-6 text-center">{s.char}</span> : s.userId ? <Avatar userId={s.userId} size={22} /> : <span className="w-6" />}
          <span className="truncate">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
