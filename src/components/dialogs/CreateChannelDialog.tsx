import { useState } from "react";
import { Hash, Lock } from "lucide-react";
import clsx from "clsx";
import { useChat } from "../../store/chat";
import { isAppError } from "../../api/client";
import { Dialog, fieldClass, ghostBtn, primaryBtn } from "../Dialog";

/** 420 = kDuplicatedChannelName: the server keeps channel names unique across public and private channels, including ones this user cannot see. */
function describeCreateError(e: unknown): string {
  if (isAppError(e) && e.kind === "api" && e.code === 420) return "같은 이름의 채널이 이미 있습니다. 비공개 채널이나 내가 볼 수 없는 채널과도 이름이 겹칠 수 없으니 다른 이름을 써 주세요.";
  return (e as { message?: string })?.message ?? String(e);
}

/** New named channel: name, purpose, public/private. Opens the channel on success. */
export function CreateChannelDialog({ onClose }: { onClose: () => void }) {
  const createChannel = useChat((s) => s.createChannel);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [type, setType] = useState<"public" | "private">("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try { await createChannel({ type, name: name.trim(), purpose: purpose.trim() }); onClose(); } catch (e) { setError(describeCreateError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog title="새 채널 만들기" onClose={onClose} width={460} footer={<><button className={ghostBtn} onClick={onClose}>취소</button><button className={primaryBtn} disabled={busy || !name.trim()} onClick={() => void submit()}>{busy ? "만드는 중…" : "만들기"}</button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {([["public", "공개 채널", "누구나 찾아서 참여할 수 있습니다", <Hash className="w-4 h-4" key="h" />], ["private", "비공개 채널", "초대받은 사람만 볼 수 있습니다", <Lock className="w-4 h-4" key="l" />]] as const).map(([k, label, hint, icon]) => (
            <button key={k} type="button" onClick={() => setType(k)} className={clsx("rounded-lg border p-3 text-left", type === k ? "border-[var(--accent)] bg-[var(--accent)]/8" : "border-[var(--border)] hover:bg-[var(--hover)]")}>
              <div className="flex items-center gap-1.5 font-medium text-[13px]">{icon}{label}</div>
              <div className="mt-0.5 text-[11.5px] text-[var(--fg-muted)]">{hint}</div>
            </button>
          ))}
        </div>
        <label className="block text-[12px] text-[var(--fg-muted)]">이름<input autoFocus className={`${fieldClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 프로젝트-AI뷰원" onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} /></label>
        <label className="block text-[12px] text-[var(--fg-muted)]">목적 (선택)<input className={`${fieldClass} mt-1`} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="이 채널에서 무엇을 이야기하나요?" /></label>
        {error && <p className="text-[12px] text-red-500">만들기 실패: {error}</p>}
      </div>
    </Dialog>
  );
}
