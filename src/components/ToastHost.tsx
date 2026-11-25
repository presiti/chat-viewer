import clsx from "clsx";
import { X } from "lucide-react";
import { useToast } from "../store/toast";

export function ToastHost() {
  const { items, dismiss } = useToast();
  if (items.length === 0) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={clsx("anim-pop flex max-w-[480px] items-center gap-3 rounded-lg px-4 py-2.5 text-[13px] shadow-lg", t.kind === "error" ? "bg-red-600 text-white" : "bg-[var(--fg)] text-[var(--bg)]")}>
          <span className="min-w-0 break-words">{t.text}</span>
          <button type="button" aria-label="닫기" className="shrink-0 opacity-80 hover:opacity-100" onClick={() => dismiss(t.id)}><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
