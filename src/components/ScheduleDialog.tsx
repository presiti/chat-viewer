import { useState } from "react";
import dayjs from "dayjs";
import { Dialog, fieldClass, ghostBtn, primaryBtn } from "./Dialog";
import { chat } from "../api/client";
import { useSession } from "../store/session";
import type { ScheduledPost } from "../api/types";

interface Props {
  channelId: number;
  initialMessage?: string;
  existing?: ScheduledPost;
  onClose: () => void;
  onSaved?: () => void;
}

export function ScheduleDialog({ channelId, initialMessage = "", existing, onClose, onSaved }: Props) {
  const serverNow = useSession((s) => s.serverNow);
  const [message, setMessage] = useState(existing?.message ?? initialMessage);
  const [when, setWhen] = useState(() => dayjs(existing?.send_at ?? dayjs().add(1, "hour").startOf("hour").valueOf()).format("YYYY-MM-DDTHH:mm"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const sendAt = dayjs(when).valueOf();
    if (!Number.isFinite(sendAt) || sendAt <= serverNow() + 30_000) { setError("예약 시간은 현재보다 뒤여야 합니다."); return; }
    setBusy(true);
    try {
      if (existing) await chat.updateScheduled(existing.cronjob_id, message.trim(), sendAt);
      else await chat.createScheduled(channelId, message.trim(), sendAt);
      onSaved?.();
      onClose();
    } catch (e) {
      setError((e as { message?: string })?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={existing ? "예약 메시지 편집" : "메시지 예약"}
      onClose={onClose}
      footer={
        <>
          <button className={ghostBtn} onClick={onClose}>취소</button>
          <button className={primaryBtn} disabled={busy || !message.trim()} onClick={() => void submit()}>{existing ? "저장" : "예약"}</button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-[12px] text-[var(--fg-muted)]">메시지</span>
          <textarea className={`${fieldClass} min-h-[120px]`} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] text-[var(--fg-muted)]">보낼 시간</span>
          <input type="datetime-local" className={fieldClass} value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <div className="flex gap-2 text-[12px]">
          {[["1시간 뒤", 1], ["내일 09:00", -1], ["다음 주 월 09:00", -2]].map(([label, v]) => (
            <button
              key={String(label)}
              className="rounded-md border border-[var(--border)] px-2 py-1 hover:bg-[var(--hover)]"
              onClick={() => {
                const d = v === 1 ? dayjs().add(1, "hour").startOf("hour") : v === -1 ? dayjs().add(1, "day").hour(9).minute(0) : dayjs().add(1, "week").day(1).hour(9).minute(0);
                setWhen(d.format("YYYY-MM-DDTHH:mm"));
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {error && <p className="text-[13px] text-red-500">{error}</p>}
      </div>
    </Dialog>
  );
}
