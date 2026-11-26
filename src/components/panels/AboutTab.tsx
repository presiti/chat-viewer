import { useEffect, useState } from "react";
import clsx from "clsx";
import { Bell, BellOff, Check, LogOut, Pencil, Star, X } from "lucide-react";
import { chat } from "../../api/client";
import type { Channel, ChannelPreference } from "../../api/types";
import { useChat } from "../../store/chat";
import { useSession } from "../../store/session";
import { useUi } from "../../store/ui";
import { formatDay } from "../../lib/format";
import { dangerBtn, fieldClass } from "../Dialog";
import { IconButton } from "../IconButton";
import { confirmAsk } from "../../lib/confirm";

type Level = ChannelPreference["notification_desktop"];
const LEVELS: { key: Level; label: string }[] = [
  { key: "all", label: "모든 메시지" },
  { key: "mention_subscribe", label: "멘션 + 구독 스레드" },
  { key: "mention", label: "멘션만" },
  { key: "none", label: "없음" },
  { key: "by_admin_console", label: "관리자 기본값" },
];
const TYPE_LABEL: Record<string, string> = { public: "공개 채널", private: "비공개 채널", anonymous: "다이렉트 메시지", chatbot: "봇", synobot: "내 공간" };

/** 정보 tab: name/purpose (inline edit for the creator), facts, star, notifications, thread default, leave. */
export function AboutTab({ ch }: { ch: Channel }) {
  const me = useSession((s) => s.info?.user_id);
  const updateChannel = useChat((s) => s.updateChannel);
  const toggleStar = useChat((s) => s.toggleStar);
  const leaveChannel = useChat((s) => s.leaveChannel);
  const threadsExpanded = useUi((s) => s.threadsExpanded);
  const setThreadsExpanded = useUi((s) => s.setThreadsExpanded);
  const setRightPanel = useUi((s) => s.setRightPanel);
  const named = ch.type === "public" || ch.type === "private";
  const canEdit = named && ch.creator_id === me;
  const [editing, setEditing] = useState<"name" | "purpose" | null>(null);
  const [draft, setDraft] = useState("");
  const [pref, setPref] = useState<Partial<ChannelPreference>>(ch.preferences ?? {});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setPref(ch.preferences ?? {}); chat.getPreference(ch.channel_id).then((d) => setPref({ ...((d as { preferences?: Partial<ChannelPreference> }).preferences ?? (d as Partial<ChannelPreference>)) })).catch(() => null); setEditing(null); }, [ch.channel_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (field: "name" | "purpose") => { setDraft(field === "name" ? ch.name : ch.purpose); setEditing(field); };
  const commit = async () => {
    if (!editing) return;
    const value = draft.trim();
    const field = editing;
    setEditing(null);
    if (!value && field === "name") return;
    if (value === (field === "name" ? ch.name : ch.purpose)) return;
    try { await chat.setChannelInfo(ch.channel_id, { [field]: value }); updateChannel(ch.channel_id, { [field]: value }); } catch (e) { setError(`저장 실패: ${(e as { message?: string })?.message ?? e}`); }
  };
  const setLevel = async (level: Level) => {
    const prev = pref;
    setPref((p) => ({ ...p, notification_desktop: level, notification_mobile: level }));
    try { await chat.setPreference(ch.channel_id, { notification_desktop: level, notification_mobile: level }); updateChannel(ch.channel_id, { preferences: { ...ch.preferences, notification_desktop: level, notification_mobile: level } }); } catch (e) { setPref(prev); setError(`저장 실패: ${(e as { message?: string })?.message ?? e}`); }
  };
  const setMute = async (mute: boolean) => {
    setPref((p) => ({ ...p, notification_mute: mute }));
    updateChannel(ch.channel_id, { preferences: { ...ch.preferences, notification_mute: mute } });
    try { await chat.setPreference(ch.channel_id, { notification_mute: mute }); } catch (e) { setPref((p) => ({ ...p, notification_mute: !mute })); updateChannel(ch.channel_id, { preferences: { ...ch.preferences, notification_mute: !mute } }); setError(`저장 실패: ${(e as { message?: string })?.message ?? e}`); }
  };
  const leave = async () => {
    if (!await confirmAsk(ch.type === "anonymous" ? "이 대화를 닫을까요?" : `"${ch.name}" 채널에서 나갈까요?`)) return;
    try { await leaveChannel(ch.channel_id); setRightPanel("none"); } catch (e) { setError(`나가기 실패: ${(e as { message?: string })?.message ?? e}`); }
  };
  const editor = (field: "name" | "purpose") => (
    <div className="flex items-start gap-1">
      {field === "purpose"
        ? <textarea autoFocus className={`${fieldClass} min-h-[64px] !text-[13px]`} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void commit(); }} />
        : <input autoFocus className={`${fieldClass} !text-[13px]`} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); if (e.key === "Enter") void commit(); }} />}
      <IconButton size="sm" label="저장" onClick={() => void commit()}><Check /></IconButton>
      <IconButton size="sm" label="취소" onClick={() => setEditing(null)}><X /></IconButton>
    </div>
  );

  return (
    <div className="px-4 py-4 space-y-5 text-[13px]">
      <section>
        <div className="flex items-center gap-1">
          {editing === "name" ? <div className="flex-1">{editor("name")}</div> : (
            <>
              <h3 className="font-semibold text-[15px] truncate">{ch.type === "synobot" ? "내 공간" : ch.name || "이름 없음"}</h3>
              {canEdit && <IconButton size="sm" label="이름 변경" onClick={() => startEdit("name")}><Pencil /></IconButton>}
              <IconButton size="sm" label={ch.is_star ? "즐겨찾기 해제" : "즐겨찾기"} onClick={() => void toggleStar(ch.channel_id)}><Star className={clsx(ch.is_star && "fill-yellow-400 text-yellow-400")} /></IconButton>
            </>
          )}
        </div>
        <div className="mt-1 text-[12px] text-[var(--fg-muted)]">{TYPE_LABEL[ch.type] ?? ch.type} · 멤버 {ch.total_member_count}명{ch.create_at ? ` · ${formatDay(ch.create_at)} 생성` : ""}</div>
      </section>
      {(named || ch.purpose) && (
        <section>
          <div className="flex items-center gap-1 mb-1 text-[12px] font-semibold text-[var(--fg-muted)]">목적{canEdit && editing !== "purpose" && <IconButton size="sm" label="목적 편집" onClick={() => startEdit("purpose")}><Pencil /></IconButton>}</div>
          {editing === "purpose" ? editor("purpose") : <p className={clsx("whitespace-pre-wrap break-words", !ch.purpose && "text-[var(--fg-muted)] italic")}>{ch.purpose || (canEdit ? "연필을 눌러 목적을 적어두세요." : "목적이 없습니다.")}</p>}
        </section>
      )}
      {ch.type !== "synobot" && (
        <section className="space-y-2">
          <div className="text-[12px] font-semibold text-[var(--fg-muted)]">알림</div>
          <label className="block"><span className="text-[12px] text-[var(--fg-muted)]">받을 메시지</span>
            <select className={`${fieldClass} mt-1 !text-[13px]`} value={pref.notification_desktop ?? "by_admin_console"} onChange={(e) => void setLevel(e.target.value as Level)}>{LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
          </label>
          <button type="button" className={clsx("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px]", pref.notification_mute ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--hover)]")} onClick={() => void setMute(!pref.notification_mute)}>
            {pref.notification_mute ? <><BellOff className="w-4 h-4" /> 음소거 중 · 해제</> : <><Bell className="w-4 h-4" /> 이 채널 음소거</>}
          </button>
        </section>
      )}
      <section className="space-y-1">
        <div className="text-[12px] font-semibold text-[var(--fg-muted)]">표시</div>
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={threadsExpanded} onChange={(e) => setThreadsExpanded(e.target.checked)} /> 댓글을 기본으로 펼쳐서 표시 (모든 채널)</label>
      </section>
      {error && <p className="text-[12px] text-red-500">{error}</p>}
      {ch.type !== "synobot" && (
        <section className="pt-2 border-t border-[var(--border)]">
          <button type="button" className={`${dangerBtn} inline-flex items-center gap-1.5`} onClick={() => void leave()}><LogOut className="w-4 h-4" /> {ch.type === "anonymous" ? "대화 닫기" : "채널 나가기"}</button>
        </section>
      )}
    </div>
  );
}
