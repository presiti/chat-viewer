import { useMemo } from "react";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud, X } from "lucide-react";
import { useUploads } from "../store/upload";
import { formatBytes } from "../lib/format";
import { Collapsible } from "./Collapsible";

const MAX_ROWS = 3;

export function UploadQueue({ channelId }: { channelId: number }) {
  // Select the stable map and derive the filtered list; a selector returning a fresh array re-renders forever.
  const all = useUploads((s) => s.items);
  const items = useMemo(() => Object.values(all).filter((i) => i.channelId === channelId), [all, channelId]);
  const dismiss = useUploads((s) => s.dismiss);
  if (!items.length) return null;
  // Busy and failed rows first so a long queue never hides what needs attention; the rest folds into "외 N개".
  const ordered = [...items].sort((a, b) => Number(b.status === "error") - Number(a.status === "error"));
  const shown = ordered.slice(0, MAX_ROWS);
  const hidden = ordered.length - shown.length;
  return (
    <Collapsible open>
      <div className="anim-pop px-5 pb-1 space-y-1">
        {shown.map((u) => {
          const pct = u.total ? Math.round((u.sent / u.total) * 100) : 0;
          const processing = u.status === "uploading" && !!u.total && u.sent >= u.total;
          const label = u.status === "error" ? "실패" : u.status === "done" ? "완료" : processing ? "서버 처리 중…" : u.total ? `${pct}% · ${formatBytes(u.total)}` : "업로드 중…";
          const icon = u.status === "error" ? <AlertCircle className="h-4 w-4 text-red-500" />
            : u.status === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            : processing ? <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
            : <UploadCloud className="h-4 w-4 text-[var(--accent)]" />;
          return (
            <div key={u.id} className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-1.5 text-[12px]">
              <span className="shrink-0">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <span className="truncate">{u.fileName}</span>
                  <span className={u.status === "error" ? "shrink-0 text-red-500" : "shrink-0 text-[var(--fg-muted)]"}>{label}</span>
                </div>
                <div className="h-1 mt-1 rounded bg-[var(--border)] overflow-hidden">
                  <div className={u.status === "error" ? "h-full bg-red-500" : u.status === "done" ? "h-full bg-emerald-500" : "h-full bg-[var(--accent)] transition-[width]"} style={{ width: `${u.status === "done" || u.status === "error" ? 100 : u.total ? pct : 30}%` }} />
                </div>
                {u.error && <div className="text-red-500 mt-0.5">{u.error}</div>}
              </div>
              {u.status !== "uploading" && <button aria-label="닫기" onClick={() => dismiss(u.id)} className="text-[var(--fg-muted)] hover:text-[var(--fg)]"><X className="w-3.5 h-3.5" /></button>}
            </div>
          );
        })}
        {hidden > 0 && <div className="px-1 text-[11px] text-[var(--fg-muted)]">외 {hidden}개 대기·진행 중</div>}
      </div>
    </Collapsible>
  );
}
