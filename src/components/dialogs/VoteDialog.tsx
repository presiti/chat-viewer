import { useState } from "react";
import dayjs from "dayjs";
import { Plus, X } from "lucide-react";
import { chat } from "../../api/client";
import { useChat } from "../../store/chat";
import { Dialog, fieldClass, ghostBtn, primaryBtn } from "../Dialog";
import { IconButton } from "../IconButton";

export function VoteDialog({ channelId, onClose }: { channelId: number; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [choices, setChoices] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [addOption, setAddOption] = useState(false);
  const [expires, setExpires] = useState(false);
  const [expireAt, setExpireAt] = useState(() => dayjs().add(1, "day").hour(18).minute(0).format("YYYY-MM-DDTHH:mm"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = question.trim() && choices.filter((c) => c.trim()).length >= 2;
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const post = await chat.createVote(channelId, question.trim(), choices.map((c) => c.trim()).filter(Boolean), {
        multiple, anonymous, add_option: addOption, expire_at: expires ? dayjs(expireAt).valueOf() : 0,
      });
      if (post?.post_id) useChat.getState().onPostCreate(channelId, { ...post, channel_id: channelId });
      onClose();
    } catch (e) { setError((e as { message?: string })?.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog title="투표 만들기" onClose={onClose} width={520} footer={<><button className={ghostBtn} onClick={onClose}>취소</button><button className={primaryBtn} disabled={!valid || busy} onClick={() => void submit()}>투표 올리기</button></>}>
      <div className="space-y-4 text-[13px]">
        <label className="block space-y-1">
          <span className="text-[12px] text-[var(--fg-muted)]">질문</span>
          <input className={fieldClass} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="예: 점심 메뉴는?" autoFocus />
        </label>
        <div className="space-y-1.5">
          <span className="text-[12px] text-[var(--fg-muted)]">선택지</span>
          {choices.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                className={fieldClass}
                value={c}
                placeholder={`선택지 ${i + 1}`}
                onChange={(e) => setChoices((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); if (i === choices.length - 1) setChoices((cs) => [...cs, ""]); } }}
              />
              <IconButton size="sm" label="삭제" disabled={choices.length <= 2} onClick={() => setChoices((cs) => cs.filter((_, j) => j !== i))}><X /></IconButton>
            </div>
          ))}
          <button className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline" onClick={() => setChoices((cs) => [...cs, ""])}><Plus className="w-3.5 h-3.5" /> 선택지 추가</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />복수 선택 허용</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />익명 투표</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={addOption} onChange={(e) => setAddOption(e.target.checked)} />참여자가 선택지 추가 가능</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={expires} onChange={(e) => setExpires(e.target.checked)} />마감 시각 설정</label>
        </div>
        {expires && <input type="datetime-local" className={fieldClass} value={expireAt} onChange={(e) => setExpireAt(e.target.value)} />}
        {error && <p className="text-[12px] text-red-500">{error}</p>}
      </div>
    </Dialog>
  );
}
