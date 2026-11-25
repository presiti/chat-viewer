import { useMemo, useState } from "react";
import clsx from "clsx";
import { AtSign, BellOff, CheckCheck, Inbox as InboxIcon } from "lucide-react";
import type { Channel } from "../api/types";
import { useChat } from "../store/chat";
import { useSession } from "../store/session";
import { useUi } from "../store/ui";
import { hasUnread, unreadAlertEntries, wantsAlerts } from "../lib/sidebarOrder";
import { formatDateTime } from "../lib/format";
import { ChannelTile } from "../components/ChannelIcon";
import { ghostBtn } from "../components/Dialog";

type Filter = "alerts" | "mentions" | "all";

const LEVEL: Record<string, string> = { all: "모든 메시지", mention_subscribe: "멘션·구독", mention: "멘션만", none: "알림 없음", by_admin_console: "관리자 기본" };

/** "새 메시지": every channel with unread activity, alert-enabled ones first. */
export function Inbox() {
  const channels = useChat((s) => s.channels);
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.info?.user_id);
  const prefs = useUi((s) => s.sidebar);
  const setView = useUi((s) => s.setView);
  const selectChannel = useChat((s) => s.selectChannel);
  const markViewed = useChat((s) => s.markViewed);
  const [filter, setFilter] = useState<Filter>("alerts");

  const entries = useMemo(() => unreadAlertEntries(channels, users, me, prefs, filter === "all"), [channels, users, me, prefs, filter]);
  const list = filter === "mentions" ? entries.filter((e) => e.ch.unread_mention + e.ch.unread_mention_comment > 0) : entries;
  const mutedUnread = useMemo(() => Object.values(channels).filter((c) => c.is_joined && hasUnread(c) && !wantsAlerts(c)).length, [channels]);

  const open = (ch: Channel) => { setView("channel"); void selectChannel(ch.channel_id); };
  const readAll = async () => { for (const e of list) await markViewed(e.ch.channel_id).catch(() => null); };

  const chip = (on: boolean) => clsx("rounded-full px-2.5 py-[3px] border text-[12px]", on ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--hover)]");

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="titlebar-drag h-[52px] shrink-0 flex items-center gap-3 px-5 border-b border-[var(--border)]">
        <InboxIcon className="w-4 h-4 text-[var(--fg-muted)]" />
        <div className="font-semibold text-[15px]">새 메시지</div>
        <div className="titlebar-nodrag flex items-center gap-1 ml-2">
          <button className={chip(filter === "alerts")} onClick={() => setFilter("alerts")}>알림 받는 방</button>
          <button className={chip(filter === "mentions")} onClick={() => setFilter("mentions")}>멘션만</button>
          <button className={chip(filter === "all")} onClick={() => setFilter("all")}>알림 끈 방 포함{mutedUnread > 0 && ` (${mutedUnread})`}</button>
        </div>
        <button className={`${ghostBtn} titlebar-nodrag ml-auto inline-flex items-center gap-1.5 !py-1`} disabled={list.length === 0} onClick={() => void readAll()}><CheckCheck className="w-4 h-4" /> 모두 읽음</button>
      </header>
      <div className="flex-1 overflow-y-auto">
        {list.length === 0 && (
          <div className="py-16 text-center text-[13px] text-[var(--fg-muted)]">
            {filter === "alerts" ? "알림 받는 채널에 새 메시지가 없습니다." : filter === "mentions" ? "새 멘션이 없습니다." : "새 메시지가 없습니다."}
          </div>
        )}
        <div className="w-full">
          {list.map(({ ch, label }) => {
            const mentions = ch.unread_mention + ch.unread_mention_comment;
            const others = ch.type === "anonymous" ? (ch.members ?? ch.member_ids ?? []).filter((id) => id !== me) : [];
            const other = others.length === 1 ? others[0] : undefined;
            const level = ch.preferences?.notification_desktop ?? "by_admin_console";
            return (
              <button key={ch.channel_id} onClick={() => open(ch)} className="w-full text-left flex items-start gap-3 px-5 py-3 border-b border-[var(--border)] hover:bg-[var(--hover)]">
                <ChannelTile ch={ch} me={me} label={label} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[14px] truncate">{label}</span>
                    {mentions > 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white"><AtSign className="w-3 h-3" />{mentions}</span>}
                    <span className="ml-auto shrink-0 text-[11px] text-[var(--fg-muted)]">{formatDateTime(ch.last_post_at)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[12px] text-[var(--fg-muted)]">
                    <span>안 읽은 메시지 {ch.unread}{ch.unread_comment > 0 && ` · 댓글 ${ch.unread_comment}`}</span>
                    <span className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-1 text-[10.5px]">{ch.preferences?.notification_mute ? <><BellOff className="w-3 h-3" />음소거</> : LEVEL[level] ?? level}</span>
                    {other && users[other]?.status === "online" && <span className="text-green-500">온라인</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
