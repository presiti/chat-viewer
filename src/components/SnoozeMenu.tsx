import { useEffect, useState } from "react";
import clsx from "clsx";
import dayjs from "dayjs";
import { BellOff, Check, ChevronLeft } from "lucide-react";
import { useSession } from "../store/session";
import { ghostBtn, primaryBtn } from "./Dialog";

/** Official presets: 20분 · 1시간 · 2시간 · 4시간 · 8시간 · 24시간. */
export const PRESETS = [20, 60, 120, 240, 480, 1440];
export const minutesLabel = (m: number) => (m < 60 ? `${m}분` : m % 1440 === 0 ? `${m / 1440}일` : `${m / 60}시간`);
export const secLabel = (sec: number) => `${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;
export const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 1800);

/** Snooze panel shown from the profile menu: one-off presets + the daily schedule (server-side preference). */
export function SnoozeMenu({ onClose }: { onClose: () => void }) {
  const prefs = useSession((s) => s.prefs);
  const serverNow = useSession((s) => s.serverNow);
  const setSnooze = useSession((s) => s.setSnooze);
  const setSchedule = useSession((s) => s.setSnoozeSchedule);
  const loadPrefs = useSession((s) => s.loadPrefs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setScheduleView] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { void loadPrefs(); const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, [loadPrefs]);

  const until = prefs?.snooze ?? 0;
  const remaining = Math.max(0, until - serverNow());
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError((e as { message?: string })?.message ?? String(e)); } finally { setBusy(false); } };

  if (schedule) {
    const enable = !!prefs?.snooze_schedule_enable;
    const start = prefs?.snooze_schedule_start ?? 22 * 3600;
    const end = prefs?.snooze_schedule_end ?? 8 * 3600;
    const sel = "rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[12.5px]";
    return (
      <div className="w-[300px] p-3 text-[13px]" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="inline-flex items-center gap-1 text-[12px] text-[var(--fg-muted)] hover:text-[var(--fg)] mb-2" onClick={() => setScheduleView(false)}><ChevronLeft className="w-3.5 h-3.5" /> 뒤로</button>
        <div className="font-semibold mb-1">매일 정해진 시간에 알림 끄기</div>
        <p className="text-[11.5px] text-[var(--fg-muted)] mb-2">서버 설정이라 공식 데스크톱·모바일 알림에도 적용됩니다. 시간은 내 프로필의 시간대 기준입니다.</p>
        <label className="flex items-center gap-2 mb-2 cursor-pointer"><input type="checkbox" checked={enable} disabled={busy} onChange={(e) => void run(() => setSchedule({ enable: e.target.checked }))} /> 사용</label>
        <div className="flex items-center gap-2">
          <select className={sel} value={start} disabled={busy || !enable} onChange={(e) => void run(() => setSchedule({ start: Number(e.target.value) }))}>{HALF_HOURS.map((s) => <option key={s} value={s}>{secLabel(s)}</option>)}</select>
          <span className="text-[var(--fg-muted)]">부터</span>
          <select className={sel} value={end} disabled={busy || !enable} onChange={(e) => void run(() => setSchedule({ end: Number(e.target.value) }))}>{HALF_HOURS.map((s) => <option key={s} value={s}>{secLabel(s)}</option>)}</select>
          <span className="text-[var(--fg-muted)]">까지</span>
        </div>
        {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="w-[260px] py-1 text-[13px]" onMouseDown={(e) => e.stopPropagation()}>
      {remaining > 0 ? (
        <div className="px-3 py-2 border-b border-[var(--border)]">
          <div className="flex items-center gap-1.5 font-medium"><BellOff className="w-4 h-4 text-[var(--accent)]" /> 알림 일시 중지 중</div>
          <div className="text-[12px] text-[var(--fg-muted)] mt-0.5">{dayjs(until).format("M월 D일 HH:mm")}까지 · 약 {minutesLabel(Math.max(1, Math.round(remaining / 60_000)))} 남음</div>
          <button type="button" className={`${primaryBtn} mt-2 w-full !py-1`} disabled={busy} onClick={() => void run(async () => { await setSnooze(0); onClose(); })}>지금 다시 켜기</button>
        </div>
      ) : (
        <div className="px-3 py-1.5 text-[11.5px] text-[var(--fg-muted)]">얼마 동안 알림을 멈출까요?</div>
      )}
      {PRESETS.map((m) => (
        <button key={m} type="button" disabled={busy} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)] disabled:opacity-50" onClick={() => void run(async () => { await setSnooze(m); onClose(); })}>
          <span className="w-4" />{minutesLabel(m)}
        </button>
      ))}
      <div className="my-1 h-px bg-[var(--border)]" />
      <button type="button" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => setScheduleView(true)}>
        <Check className={clsx("w-4 h-4 text-[var(--accent)]", prefs?.snooze_schedule_enable ? "opacity-100" : "opacity-0")} />
        <span className="flex-1 text-left">매일 정해진 시간에…</span>
        {prefs?.snooze_schedule_enable && <span className="text-[11px] text-[var(--fg-muted)]">{secLabel(prefs.snooze_schedule_start ?? 0)}–{secLabel(prefs.snooze_schedule_end ?? 0)}</span>}
      </button>
      {error && <p className="px-3 py-1 text-[12px] text-red-500">{error}</p>}
      <div className="px-3 pb-1 pt-1"><button type="button" className={`${ghostBtn} w-full !py-1`} onClick={onClose}>닫기</button></div>
    </div>
  );
}
