import { useState } from "react";
import clsx from "clsx";
import { BarChart3, Bookmark, CalendarClock, Clock, FileText, Info, LayoutList, Link2, MessageSquare, Pin, UserRound, X } from "lucide-react";
import { channelLabel, useChat } from "../../store/chat";
import { useSession } from "../../store/session";
import { BOARD_TABS, MINE_TABS, useUi, type InfoTab } from "../../store/ui";
import { IconButton } from "../IconButton";
import { AboutTab } from "./AboutTab";
import { MembersTab } from "./MembersTab";
import { BoardTab, type BoardTabKey } from "./BoardTab";
import { MineTab, type MineTabKey } from "./MineTab";
import { ChannelIcon } from "../ChannelIcon";

type Group = "about" | "members" | "board" | "mine";
const groupOf = (t: InfoTab): Group => (t === "about" || t === "members" ? t : BOARD_TABS.includes(t) ? "board" : "mine");

const GROUPS: { key: Group; label: string; icon: React.ReactNode }[] = [
  { key: "about", label: "정보", icon: <Info className="w-3.5 h-3.5" /> },
  { key: "board", label: "게시판", icon: <LayoutList className="w-3.5 h-3.5" /> },
  { key: "mine", label: "내 항목", icon: <UserRound className="w-3.5 h-3.5" /> },
];
const SUB: Record<InfoTab, { label: string; icon: React.ReactNode }> = {
  about: { label: "정보", icon: null }, members: { label: "멤버", icon: null },
  pinned: { label: "고정", icon: <Pin className="w-3 h-3" /> },
  files: { label: "파일", icon: <FileText className="w-3 h-3" /> },
  links: { label: "링크", icon: <Link2 className="w-3 h-3" /> },
  votes: { label: "투표", icon: <BarChart3 className="w-3 h-3" /> },
  bookmarks: { label: "북마크", icon: <Bookmark className="w-3 h-3" /> },
  threads: { label: "스레드", icon: <MessageSquare className="w-3 h-3" /> },
  reminders: { label: "리마인더", icon: <Clock className="w-3 h-3" /> },
  scheduled: { label: "예약", icon: <CalendarClock className="w-3 h-3" /> },
};

/**
 * The one right-hand panel: everything about the current channel.
 * Two levels: 정보 · 멤버 · 게시판 · 내 항목, then chips for the board (고정/파일/링크/투표)
 * and for my items in this channel (북마크/스레드/리마인더/예약).
 */
export function ChannelInfoPanel({ channelId }: { channelId: number }) {
  const ch = useChat((s) => s.channels[channelId]);
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.info?.user_id);
  const tab = useUi((s) => s.infoTab);
  const openInfo = useUi((s) => s.openInfo);
  const setRightPanel = useUi((s) => s.setRightPanel);
  // Remember the last chip of each group so the top-level tab comes back where you left it.
  const [lastBoard, setLastBoard] = useState<InfoTab>("pinned");
  const [lastMine, setLastMine] = useState<InfoTab>("bookmarks");
  if (!ch) {
    // Keep the panel frame instead of vanishing: the header button already shows "open", so an empty gap would read as a bug.
    console.warn("[info] channel record missing", channelId);
    return (
      <aside className="w-[380px] max-[720px]:w-full shrink-0 h-full flex flex-col border-l border-[var(--border)] bg-[var(--bg)]">
        <div className="titlebar-drag h-[52px] shrink-0 flex items-center justify-between pl-4 pr-2 border-b border-[var(--border)]">
          <div className="text-[11px] text-[var(--fg-muted)]">채널 정보</div>
          <IconButton label="닫기 (Esc)" size="sm" className="titlebar-nodrag" onClick={() => setRightPanel("none")}><X /></IconButton>
        </div>
        <div className="flex-1 flex items-center justify-center text-[13px] text-[var(--fg-muted)]">채널 정보를 불러오는 중…</div>
      </aside>
    );
  }
  const group = groupOf(tab);
  // 멤버 is its own panel (opened from the header's 멤버 button); 정보 holds 정보 · 게시판 · 내 항목.
  const membersOnly = tab === "members";
  const chips = group === "board" ? BOARD_TABS : group === "mine" ? MINE_TABS : null;
  const pick = (t: InfoTab) => { if (BOARD_TABS.includes(t)) setLastBoard(t); else if (MINE_TABS.includes(t)) setLastMine(t); openInfo(t); };
  const pickGroup = (g: Group) => pick(g === "board" ? lastBoard : g === "mine" ? lastMine : g);
  return (
    <aside className="w-[380px] max-[720px]:w-full shrink-0 h-full flex flex-col border-l border-[var(--border)] bg-[var(--bg)]">
      <div className="titlebar-drag h-[52px] shrink-0 flex items-center justify-between pl-4 pr-2 border-b border-[var(--border)]">
        <div className="min-w-0">
          <div className="font-semibold text-[14px] truncate flex items-center gap-1.5"><ChannelIcon ch={ch} me={me} size={14} dm="avatar" /><span className="truncate">{channelLabel(ch, users, me)}</span></div>
          <div className="text-[11px] text-[var(--fg-muted)]">{membersOnly ? `멤버 ${ch.total_member_count}명` : "채널 정보"}</div>
        </div>
        <IconButton label="닫기 (Esc)" size="sm" className="titlebar-nodrag" onClick={() => setRightPanel("none")}><X /></IconButton>
      </div>
      {!membersOnly && <div className="flex border-b border-[var(--border)] px-1">
        {GROUPS.map((g) => (
          <button key={g.key} onClick={() => pickGroup(g.key)} className={clsx("flex-1 px-1 py-2 text-[12.5px] border-b-2 -mb-px inline-flex items-center justify-center gap-1", group === g.key ? "border-[var(--accent)] text-[var(--fg)] font-medium" : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]")}>
            {g.icon}{g.label}
          </button>
        ))}
      </div>}
      {chips && !membersOnly && (
        <div className="flex gap-1 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-muted)]/40">
          {chips.map((t) => (
            <button key={t} onClick={() => pick(t)} className={clsx("flex-1 inline-flex items-center justify-center gap-1 rounded-full border px-2 py-[3px] text-[12px]", tab === t ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]" : "border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]")}>
              {SUB[t].icon}{SUB[t].label}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === "about" && <AboutTab ch={ch} />}
        {tab === "members" && <MembersTab channelId={channelId} />}
        {group === "board" && <BoardTab channelId={channelId} tab={tab as BoardTabKey} />}
        {group === "mine" && <MineTab channelId={channelId} tab={tab as MineTabKey} />}
      </div>
    </aside>
  );
}
