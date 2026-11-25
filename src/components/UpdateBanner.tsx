import { useEffect, useState } from "react";
import { ArrowDownToLine, X } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { useUpdate } from "../store/update";

/** Slim bar under the title area: "new version available → install & restart". Hidden until the server offers one. */
export function UpdateBanner() {
  const { phase, version, progress, error, dismissed, install, dismiss } = useUpdate();
  if (dismissed) return null;
  if (phase !== "available" && phase !== "downloading" && phase !== "ready" && !(phase === "error" && error && version)) return null;
  const busy = phase === "downloading" || phase === "ready";
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--accent-soft)] px-4 py-1.5 text-sm">
      <ArrowDownToLine className="h-4 w-4 shrink-0 text-[var(--accent)]" />
      <span className="min-w-0 flex-1 truncate">
        {phase === "ready" ? "설치 완료, 다시 시작하는 중…"
          : phase === "downloading" ? `새 버전 ${version} 내려받는 중… ${Math.round(progress * 100)}%`
          : phase === "error" ? `업데이트 실패: ${error}`
          : `새 버전 ${version}이 있습니다.`}
      </span>
      {!busy && (
        <button type="button" className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--accent-fg)] hover:opacity-90" onClick={() => void install()}>
          {phase === "error" ? "다시 시도" : "업데이트 후 다시 시작"}
        </button>
      )}
      {!busy && (
        <button type="button" aria-label="닫기" className="rounded p-1 opacity-60 hover:opacity-100" onClick={dismiss}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Settings block: current version, last check, manual check button. */
export function UpdateSettings() {
  const [version, setVersion] = useState("…");
  useEffect(() => { getVersion().then(setVersion).catch(() => setVersion("dev")); }, []);
  const { phase, version: next, checkedAt, error, checkNow, install } = useUpdate();
  const status =
    phase === "checking" ? "확인하는 중…"
    : phase === "none" ? "최신 버전입니다."
    : phase === "available" ? `새 버전 ${next}이 있습니다.`
    : phase === "downloading" ? "내려받는 중…"
    : phase === "error" ? `확인 실패: ${error}`
    : "아직 확인하지 않았습니다.";
  return (
    <section className="mb-6 rounded-md border border-[var(--border)] p-4">
      <h3 className="mb-2 text-sm font-semibold">업데이트</h3>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>현재 버전 {version}</span>
        <span className="opacity-70">{status}</span>
        {checkedAt && <span className="text-xs opacity-50">마지막 확인 {new Date(checkedAt).toLocaleTimeString()}</span>}
        <span className="flex-1" />
        {phase === "available" ? (
          <button type="button" className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--accent-fg)]" onClick={() => void install()}>업데이트 후 다시 시작</button>
        ) : (
          <button type="button" className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--hover)]" disabled={phase === "checking" || phase === "downloading"} onClick={() => void checkNow()}>지금 확인</button>
        )}
      </div>
    </section>
  );
}
