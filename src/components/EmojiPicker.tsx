import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Clock, Search } from "lucide-react";
import { categoryLabel, emojiCategories, emojiFromShortname, pushRecentEmoji, recentEmoji, searchEmoji } from "../lib/emoji";

interface Props {
  onPick: (shortname: string, char: string) => void;
  onClose: () => void;
  /** Anchor position relative to the nearest positioned ancestor. */
  className?: string;
}

const CATEGORY_ICONS: Record<string, string> = { people: "😀", nature: "🐶", food: "🍎", activity: "⚽", travel: "🚗", objects: "💡", symbols: "🔣", flags: "🏳️" };

export function EmojiPicker({ onPick, onClose, className }: Props) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("recent");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recent = useMemo(() => recentEmoji().map((n) => ({ n, c: emojiFromShortname(n) ?? "" })).filter((e) => e.c), []);

  useEffect(() => {
    inputRef.current?.focus();
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const list = useMemo(() => {
    if (query.trim()) return searchEmoji(query, 120);
    if (cat === "recent") return recent.length ? recent : emojiCategories[0].emojis.slice(0, 60);
    return emojiCategories.find((c) => c.name === cat)?.emojis ?? [];
  }, [query, cat, recent]);

  const pick = (n: string, c: string) => { pushRecentEmoji(n); onPick(n, c); };

  return (
    <div ref={ref} className={clsx("popover w-[340px] flex flex-col overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <Search className="w-4 h-4 text-[var(--fg-muted)]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이모지 검색 (영문 이름)"
          className="flex-1 bg-transparent outline-none text-[13px]"
        />
      </div>
      {!query && (
        <div className="flex gap-1 px-2 pb-1 border-b border-[var(--border)]">
          <button type="button" onClick={() => setCat("recent")} title="최근 사용" className={clsx("w-8 h-8 rounded-md flex items-center justify-center hover:bg-[var(--hover)]", cat === "recent" && "bg-[var(--hover)]")}>
            <Clock className="w-4 h-4" />
          </button>
          {emojiCategories.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setCat(c.name)}
              title={categoryLabel(c.name)}
              className={clsx("w-8 h-8 rounded-md text-[16px] hover:bg-[var(--hover)]", cat === c.name && "bg-[var(--hover)]")}
            >
              {CATEGORY_ICONS[c.name]}
            </button>
          ))}
        </div>
      )}
      <div className="h-[260px] overflow-y-auto p-2 grid grid-cols-8 gap-[2px] content-start">
        {list.map((e) => (
          <button
            key={e.n}
            type="button"
            title={`:${e.n}:`}
            onClick={() => pick(e.n, e.c)}
            className="h-9 rounded-md text-[22px] leading-none hover:bg-[var(--hover)] flex items-center justify-center"
          >
            {e.c}
          </button>
        ))}
        {list.length === 0 && <div className="col-span-8 text-center text-[12px] text-[var(--fg-muted)] py-6">결과 없음</div>}
      </div>
    </div>
  );
}
