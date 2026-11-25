import { useEffect, useState } from "react";
import clsx from "clsx";
import dayjs from "dayjs";
import { BellOff, Moon } from "lucide-react";
import { useSession } from "../store/session";
import { useAway } from "../lib/away";
import { HALF_HOURS, PRESETS, minutesLabel, secLabel } from "./SnoozeMenu";

const btn = (on: boolean) => clsx("rounded-full border px-2.5 py-[3px] text-[12px] disabled:opacity-50", on ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--hover)]");
const sel = "rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[12.5px] disabled:opacity-50";

/** Settings > 알림 (top): who I appear as and when notifications are paused, in one place (the profile menu keeps quick toggles). */
export function StatusSettings() {
  const { away, toggle } = useAway();
  const prefs = useSession((s) => s.prefs);
  const serverNow = useSession((s) => s.serverNow);
  const setSnooze = useSession((s) => s.setSnooze);
  const setSchedule = useSession((s) => s.setSnoozeSchedule);
  const loadPrefs = useSession((s) => s.loadPrefs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { void loadPrefs(); const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, [loadPrefs]);
  const until = prefs?.snooze ?? 0;
  const remaining = Math.max(0, until - serverNow());
  const enable = !!prefs?.snooze_schedule_enable;
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError((e as { message?: string })?.message ?? String(e)); } finally { setBusy(false); } };

  return (
    <section className="mb-6 rounded-md border border-[var(--border)]">
      <div className="px-4 pt-3 pb-1 text-[13px] font-semibold">내 상태</div>
      <div className="flex items-start gap-3 px-4 py-3">
        <Moon className={clsx("mt-0.5 h-4 w-4 shrink-0", away ? "text-[var(--accent)]" : "text-[var(--fg-muted)]")} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">부재 중</div>
          <p className="text-[12px] text-[var(--fg-muted)]">켜면 앱을 쓰고 있어도 다른 사람에게는 오프라인으로 보입니다. 알림에는 영향이 없습니다.</p>
        </div>
        <label className="mt-0.5 inline-flex cursor-pointer items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={away} onChange={() => void toggle()} />{away ? "켜짐" : "꺼짐"}</label>
      </div>
      <div className="flex items-start gap-3 border-t border-[var(--border)] px-4 py-3">
        <BellOff className={clsx("mt-0.5 h-4 w-4 shrink-0", remaining > 0 ? "text-amber-500" : "text-[var(--fg-muted)]")} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">알림 일시 중지</div>
          <p className="text-[12px] text-[var(--fg-muted)]">
            {remaining > 0 ? <>{dayjs(until).format("M월 D일 HH:mm")}까지 멈춰 있습니다 (약 {minutesLabel(Math.max(1, Math.round(remaining / 60_000)))} 남음). 모든 기기에 적용됩니다.</> : "정해진 시간 동안 모든 알림을 멈춥니다. 모든 기기에 적용됩니다."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {PRESETS.map((m) => <button key={m} type="button" disabled={busy} className={btn(false)} onClick={() => void run(() => setSnooze(m))}>{minutesLabel(m)}</button>)}
            {remaining > 0 && <button type="button" disabled={busy} className="ml-1 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[12px] font-medium text-[var(--accent-fg)] disabled:opacity-50" onClick={() => void run(() => setSnooze(0))}>지금 다시 켜기</button>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
            <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={enable} disabled={busy} onChange={(e) => void run(() => setSchedule({ enable: e.target.checked }))} />매일 정해진 시간에도 끄기</label>
            <select className={sel} value={prefs?.snooze_schedule_start ?? 22 * 3600} disabled={busy || !enable} onChange={(e) => void run(() => setSchedule({ start: Number(e.target.value) }))}>{HALF_HOURS.map((x) => <option key={x} value={x}>{secLabel(x)}</option>)}</select>
            <span className="text-[var(--fg-muted)]">부터</span>
            <select className={sel} value={prefs?.snooze_schedule_end ?? 8 * 3600} disabled={busy || !enable} onChange={(e) => void run(() => setSchedule({ end: Number(e.target.value) }))}>{HALF_HOURS.map((x) => <option key={x} value={x}>{secLabel(x)}</option>)}</select>
            <span className="text-[var(--fg-muted)]">까지</span>
          </div>
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
        </div>
      </div>
    </section>
  );
}
