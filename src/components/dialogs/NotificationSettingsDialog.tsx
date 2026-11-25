import { useMemo, useState } from "react";
import clsx from "clsx";
import { BellOff, Search } from "lucide-react";
import type { Channel, ChannelPreference } from "../../api/types";
import { chat } from "../../api/client";
import { channelLabel, useChat } from "../../store/chat";
import { useSession } from "../../store/session";
import { useUi } from "../../store/ui";
import { Dialog, fieldClass, ghostBtn, primaryBtn } from "../Dialog";
import { ChannelIcon } from "../ChannelIcon";

type Level = ChannelPreference["notification_desktop"];
/** `all_replies` exists only in this client: server level "all" plus every thread reply (see store/notify.ts). */
type LevelOpt = NonNullable<Level> | "all_replies";
const LEVELS: { key: LevelOpt; label: string }[] = [
  { key: "all_replies", label: "모든 메시지 + 모든 댓글" },
  { key: "all", label: "모든 메시지" },
  { key: "mention_subscribe", label: "멘션 + 구독 스레드" },
  { key: "mention", label: "멘션만" },
  { key: "none", label: "없음" },
  { key: "by_admin_console", label: "관리자 기본값" },
];
type Filter = "all" | "off" | "mention" | "muted";

/** Thin modal wrapper, used from the channel ⋯ menu. The page version lives in pages/Manage.tsx. */
export function NotificationSettingsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="채널 알림 설정" onClose={onClose} width={760}>
      <NotificationSettingsTable />
    </Dialog>
  );
}

/** Every channel's notification preference in one table; changes go straight to the server. */
export function NotificationSettingsTable() {
  const channels = useChat((s) => s.channels);
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.info?.user_id);
  const updateChannel = useChat((s) => s.updateChannel);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLevel, setBulkLevel] = useState<LevelOpt>("all");
  const rn = useUi((s) => s.replyNotify);
  const setChannelReplyNotify = useUi((s) => s.setChannelReplyNotify);
  const allReplies = (id: number) => rn.channels[id] ?? rn.global;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    const typeRank = (c: Channel) => (c.type === "public" || c.type === "private" ? 0 : c.type === "anonymous" ? 1 : 2);
    return Object.values(channels)
      .filter((c) => c.is_joined && c.type !== "synobot")
      .map((c) => ({ ch: c, label: channelLabel(c, users, me) }))
      .filter((e) => !k || e.label.toLowerCase().includes(k))
      .filter((e) => {
        const p = e.ch.preferences;
        if (filter === "off") return p?.notification_desktop === "none";
        if (filter === "mention") return p?.notification_desktop === "mention" || p?.notification_desktop === "mention_subscribe";
        if (filter === "muted") return !!p?.notification_mute;
        return true;
      })
      .sort((a, b) => typeRank(a.ch) - typeRank(b.ch) || a.label.localeCompare(b.label, "ko"));
  }, [channels, users, me, q, filter]);

  const apply = async (ch: Channel, patch: Partial<ChannelPreference>) => {
    const prev = ch.preferences;
    updateChannel(ch.channel_id, { preferences: { ...prev, ...patch } });
    try { await chat.setPreference(ch.channel_id, patch); } catch (e) { updateChannel(ch.channel_id, { preferences: prev }); setError(`저장 실패 (${channelLabel(ch, users, me)}): ${(e as { message?: string })?.message ?? e}`); }
  };
  const applyBulk = async (patch: Partial<ChannelPreference>) => {
    setBusy(true); setError(null);
    try { for (const e of list) if (selected.has(e.ch.channel_id)) await apply(e.ch, patch); } finally { setBusy(false); }
  };
  /** Desktop level incl. the client-only "all replies" step; mobile follows the server-side level. */
  const applyDesktop = async (ch: Channel, opt: LevelOpt, withMobile = false) => {
    const level = (opt === "all_replies" ? "all" : opt) as Level;
    setChannelReplyNotify(ch.channel_id, opt === "all_replies" ? true : rn.global ? false : undefined);
    await apply(ch, withMobile ? { notification_desktop: level, notification_mobile: level } : { notification_desktop: level });
  };
  const toggleAll = () => setSelected((s) => (s.size === list.length ? new Set() : new Set(list.map((e) => e.ch.channel_id))));
  const chip = (on: boolean) => clsx("rounded-full px-2.5 py-[3px] border text-[12px]", on ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--hover)]");
  const select = "rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-[3px] text-[12px] outline-none focus:border-[var(--accent)]";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--fg-muted)]" />
          <input className={`${fieldClass} !pl-7 !py-1 !text-[12.5px] w-[200px]`} placeholder="채널 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {([["all", "전체"], ["off", "알림 없음"], ["mention", "멘션만"], ["muted", "음소거"]] as const).map(([k, label]) => <button key={k} className={chip(filter === k)} onClick={() => setFilter(k)}>{label}</button>)}
        <span className="ml-auto text-[11px] text-[var(--fg-muted)]">{list.length}개 채널</span>
      </div>
      {selected.size > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-[var(--accent)]/8 px-3 py-2 text-[12px]">
          <span className="font-medium">{selected.size}개 선택</span>
          <select className={select} value={bulkLevel} onChange={(e) => setBulkLevel(e.target.value as LevelOpt)}>{LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
          <button className={`${primaryBtn} !py-[3px] !text-[12px]`} disabled={busy} onClick={() => { setBusy(true); setError(null); void (async () => { try { for (const e of list) if (selected.has(e.ch.channel_id)) await applyDesktop(e.ch, bulkLevel, true); } finally { setBusy(false); } })(); }}>데스크톱·모바일에 적용</button>
          <button className={`${ghostBtn} !py-[3px] !text-[12px]`} disabled={busy} onClick={() => void applyBulk({ notification_mute: true })}>음소거</button>
          <button className={`${ghostBtn} !py-[3px] !text-[12px]`} disabled={busy} onClick={() => void applyBulk({ notification_mute: false })}>음소거 해제</button>
          <button className="ml-auto text-[var(--fg-muted)] hover:underline" onClick={() => setSelected(new Set())}>선택 해제</button>
        </div>
      )}
      {error && <p className="mb-2 text-[12px] text-red-500">{error}</p>}
      <table className="w-full text-[13px] border-collapse">
        <thead className="text-[11px] text-[var(--fg-muted)]">
          <tr className="border-b border-[var(--border)]">
            <th className="w-7 py-1.5 text-left"><input type="checkbox" checked={list.length > 0 && selected.size === list.length} onChange={toggleAll} /></th>
            <th className="py-1.5 text-left font-medium">채널</th>
            <th className="py-1.5 text-left font-medium w-[170px]">데스크톱</th>
            <th className="py-1.5 text-left font-medium w-[170px]">모바일</th>
            <th className="py-1.5 text-center font-medium w-[70px]">음소거</th>
          </tr>
        </thead>
        <tbody>
          {list.map(({ ch, label }) => {
            const p = ch.preferences ?? {};
            return (
              <tr key={ch.channel_id} className={clsx("border-b border-[var(--border)]", p.notification_mute && "opacity-60")}>
                <td className="py-1.5"><input type="checkbox" checked={selected.has(ch.channel_id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(ch.channel_id); else n.delete(ch.channel_id); return n; })} /></td>
                <td className="py-1.5 pr-2 max-w-[220px]"><span className="flex items-center gap-1.5 min-w-0 text-[var(--fg)]"><span className="flex w-4 shrink-0 items-center justify-center text-[var(--fg-muted)]"><ChannelIcon ch={ch} me={me} dm="avatar" /></span><span className="truncate">{label}</span></span></td>
                <td className="py-1.5 pr-2"><select className={`${select} w-full`} value={p.notification_desktop === "all" && allReplies(ch.channel_id) ? "all_replies" : p.notification_desktop ?? "by_admin_console"} onChange={(e) => void applyDesktop(ch, e.target.value as LevelOpt)}>{LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select></td>
                <td className="py-1.5 pr-2"><select className={`${select} w-full`} value={p.notification_mobile ?? "by_admin_console"} onChange={(e) => void apply(ch, { notification_mobile: e.target.value as Level })}>{LEVELS.filter((l) => l.key !== "all_replies").map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select></td>
                <td className="py-1.5 text-center"><button type="button" title={p.notification_mute ? "음소거 해제" : "음소거"} className={clsx("rounded-md p-1", p.notification_mute ? "text-[var(--accent)] bg-[var(--accent)]/12" : "text-[var(--fg-muted)] hover:bg-[var(--hover)]")} onClick={() => void apply(ch, { notification_mute: !p.notification_mute })}><BellOff className="w-4 h-4" /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {list.length === 0 && <p className="py-8 text-center text-[12px] text-[var(--fg-muted)]">해당하는 채널이 없습니다.</p>}
      <p className="mt-3 text-[11px] text-[var(--fg-muted)]">변경은 즉시 Synology 서버에 저장되어 공식 앱·모바일에도 적용됩니다. "관리자 기본값"은 관리자 콘솔의 기본 알림 설정을 따릅니다. "모든 메시지 + 모든 댓글"은 이 앱에서만 동작하는 단계라 서버에는 "모든 메시지"로 저장되고, 공식 앱·모바일에는 적용되지 않습니다.</p>
    </div>
  );
}
