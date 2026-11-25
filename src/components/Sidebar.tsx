import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AppWindow, BellOff, Bookmark, Bot, Check, ChevronDown, ChevronRight, EyeOff, Hash, Lock, LogOut, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pin, PinOff, SlidersHorizontal, Star, StarOff } from "lucide-react";
import type { Channel } from "../api/types";
import { auth, chat } from "../api/client";
import { channelLabel, useChat, userBadge, userLabel } from "../store/chat";
import { useSession } from "../store/session";
import { useUi } from "../store/ui";
import { initials, colorFor } from "../lib/format";
import { Avatar } from "./Avatar";
import { IconButton } from "./IconButton";
import { openUserCard, useUserCard } from "./UserCard";
import { Popover } from "./Popover";
import { Collapsible } from "./Collapsible";
import { DEFAULT_GROUP_COLOR, GROUP_COLORS } from "../lib/theme";
import { GroupAvatars } from "./GroupAvatars";
import { ChannelIcon } from "./ChannelIcon";
import { useSearch } from "../store/search";
import { ProfileDialog } from "./dialogs/ProfileDialog";
import { createPortal } from "react-dom";
import { useAway } from "../lib/away";
import { useUpdate } from "../store/update";
import { SnoozeMenu } from "./SnoozeMenu";
import { HELP_URL, officialWebUrl, openExternal } from "../lib/external";
import { isMobileOS, openChatWindow, useCompact } from "../lib/platform";
import { usePopouts } from "../store/popout";
import { buildSections, isLocalHidden, isServerHidden, sectionDefs, unreadAlertEntries, type ChannelGroup, type Entry, type SectionKey, type SectionSort } from "../lib/sidebarOrder";
import { Archive, BellRing, CircleHelp, ExternalLink, EyeOff as EyeOffIcon, Folder, FolderOpen, FolderPlus, Folders, Globe, Inbox, Info, MessageCircle, Moon, Pencil, Plus, Puzzle, Settings, Trash2, UserRound, X } from "lucide-react";

const SORT_LABELS: Record<SectionSort, string> = { recent: "최근 활동순", name: "이름순", manual: "직접 정렬" };

/**
 * A sidebar group. In the icon rail every group stays visible; in the full sidebar the header toggles
 * the group (persisted). A folded group still shows channels with unread messages so nothing gets lost.
 */
function Section({ title, sectionKey, collapsed, items, row, onManage, accent, group, me }: { title: string; sectionKey: SectionKey | "unread"; collapsed: boolean; items: Entry[]; row: (x: Entry) => React.ReactNode; onManage: (section: SectionKey | "unread") => void; accent?: boolean; group?: ChannelGroup; me?: number }) {
  const folded = useUi((s) => !!s.sectionsCollapsed[sectionKey]);
  const toggleSection = useUi((s) => s.toggleSection);
  const sort = useUi((s) => s.sidebar.sectionSort[sectionKey] ?? "recent");
  const setSectionSort = useUi((s) => s.setSectionSort);
  const setManualOrder = useUi((s) => s.setManualOrder);
  const setShowUnreadSection = useUi((s) => s.setShowUnreadSection);
  const renameGroup = useUi((s) => s.renameGroup);
  const removeGroup = useUi((s) => s.removeGroup);
  const setGroupColor = useUi((s) => s.setGroupColor);
  // One fold state for both layouts: folding a folder in the wide sidebar folds it in the icon rail too.
  const railFolded = folded;
  const toggleRailFold = toggleSection;
  const isUnread = sectionKey === "unread";
  const [menu, setMenu] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState("");
  const startRename = () => { if (!group) return; setRenameText(group.name); setRenaming(true); setMenu(false); };
  const commitRename = () => { if (group && renameText.trim()) renameGroup(group.id, renameText); setRenaming(false); };
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  // Custom order inside a group: press and drag a row (a small movement threshold keeps plain clicks working).
  // The first drop switches the group to "직접 정렬"; the manage page's 정렬 tab edits the same order.
  const canReorder = !!group && !collapsed && !folded && items.length > 1;
  const listRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const startReorder = (ev: React.PointerEvent, id: number) => {
    if (!canReorder || ev.button !== 0) return;
    const x0 = ev.clientX, y0 = ev.clientY;
    let active = false;
    let slot: number | null = null;
    const slotAt = (y: number): number => {
      const els = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-sb-id]") ?? []);
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) return i;
      }
      return els.length;
    };
    const move = (e: PointerEvent) => {
      if (!active) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return;
        active = true; dragged.current = true; setDragId(id);
      }
      slot = slotAt(e.clientY);
      setDropAt(slot);
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      if (active && slot != null) {
        const ids = items.map((x) => x.ch.channel_id);
        const from = ids.indexOf(id);
        const to = slot > from ? slot - 1 : slot; // removing the dragged row shifts later slots up by one
        if (from >= 0 && to !== from) {
          ids.splice(from, 1); ids.splice(to, 0, id);
          if (sort !== "manual") setSectionSort(sectionKey, "manual");
          setManualOrder(sectionKey, ids);
        }
      }
      setDragId(null); setDropAt(null);
      setTimeout(() => { dragged.current = false; }, 0); // swallow the click that follows a drag
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };

  // Built-in sections disappear when empty; a custom group stays visible so it can still be edited.
  if (items.length === 0 && !group) return null;
  const shown = collapsed || !folded ? items : items.filter((x) => (x.ch.unread ?? 0) > 0 || (x.ch.unread_mention ?? 0) > 0);
  if (collapsed) {
    // Discord-style folder: a tinted tile with the section glyph; folded = 2×2 preview of the first rooms + unread badge.
    const tint = group?.color ?? (accent ? "color-mix(in srgb, var(--accent) 65%, var(--ink-sidebar))" : group ? DEFAULT_GROUP_COLOR : "#9aa3b2");
    const mentions = items.reduce((n, x) => n + x.ch.unread_mention + x.ch.unread_mention_comment, 0);
    const unread = items.some((x) => x.ch.unread > 0);
    const glyph = accent ? <BellRing className="w-5 h-5" /> : group ? <Folder className="w-5 h-5" /> : sectionKey === "starred" ? <Star className="w-5 h-5" /> : sectionKey === "dms" ? <MessageCircle className="w-5 h-5" /> : sectionKey === "bots" ? <Bot className="w-5 h-5" /> : <Hash className="w-5 h-5" />;
    // Same 44px column as every other rail tile, so folded folders, rooms and the bottom buttons line up.
    return (
      <div className={clsx("mt-3 first:mt-1 mx-auto rounded-xl transition-[background-color] duration-200", "w-[60px] p-2")} style={{ background: `color-mix(in srgb, ${tint} ${railFolded ? "26%" : "22%"}, transparent)` }}>
        <button
          type="button"
          onClick={() => toggleRailFold(sectionKey)}
          title={`${title} · ${items.length}개 (${railFolded ? "펼치기" : "접기"})`}
          className="relative mx-auto flex h-11 w-11 items-center justify-center rounded-xl hover:bg-[var(--side-hover)]"
          style={{ color: tint }}
        >
          <span key={String(railFolded)} className="anim-fade flex items-center justify-center">
            {railFolded && items.length === 1 ? (
              <RoomGlyph ch={items[0].ch} label={items[0].label} me={me} size={34} />
            ) : railFolded && items.length > 1 ? (
              <span className="grid grid-cols-2 gap-[5px]">
                {items.slice(0, 4).map((x) => <RoomGlyph key={x.ch.channel_id} ch={x.ch} label={x.label} me={me} size={14} />)}
              </span>
            ) : glyph}
          </span>
          {railFolded && mentions > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] rounded-full bg-red-500 px-1 text-[10px] font-bold text-white text-center">{mentions}</span>}
          {railFolded && mentions === 0 && unread && <span className="absolute -top-[2px] -right-[2px] h-2.5 w-2.5 rounded-full bg-[var(--ink-sidebar)] ring-2 ring-[var(--bg-sidebar)]" />}
        </button>
        {items.map((x) => <Collapsible key={x.ch.channel_id} open={!railFolded}>{row(x)}</Collapsible>)}
      </div>
    );
  }

  return (
    <div className="mt-3 first:mt-1 mx-1">
      {collapsed ? (
        <div className="mx-auto my-1.5 h-px w-8 bg-[color-mix(in_srgb,var(--ink-sidebar)_15%,transparent)]" />
      ) : (
        <div className="group/sec relative flex items-center" onContextMenu={(e) => { if (group) { e.preventDefault(); setMenu(true); } }}>
          {renaming && group ? (
            <input
              autoFocus
              value={renameText}
              maxLength={40}
              onChange={(e) => setRenameText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(false); }}
              onBlur={commitRename}
              className="flex-1 mx-1 my-0.5 rounded-md bg-[color-mix(in_srgb,var(--ink-sidebar)_10%,transparent)] px-2 py-0.5 text-[13.5px] font-semibold text-[var(--ink-sidebar)] outline-none ring-1 ring-[var(--accent)]"
            />
          ) : (
            <button
              type="button"
              onClick={() => toggleSection(sectionKey)}
              title={group ? "내가 만든 그룹 · 우클릭으로 편집" : undefined}
              className={clsx("flex-1 flex items-center gap-1.5 px-3 py-[6px] rounded-md text-[13.5px] font-semibold hover:bg-[var(--side-hover)]", accent ? "text-[color-mix(in_srgb,var(--accent)_65%,var(--ink-sidebar))]" : group ? "opacity-90 hover:opacity-100" : "text-[var(--fg-sidebar)]/70 hover:text-[var(--fg-sidebar)]")}
              style={group ? { color: group.color ?? DEFAULT_GROUP_COLOR } : undefined}
            >
              {group
                ? (folded ? <Folder className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />)
                : (folded ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
              {accent && <BellRing className="w-3.5 h-3.5" />}
              <span className="truncate">{title}</span>
              <span className="ml-auto text-[11px] font-normal tabular-nums opacity-0 group-hover/sec:opacity-70">{items.length}</span>
            </button>
          )}
          <button
            ref={menuBtn}
            type="button"
            title="정렬·관리"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setMenu((v) => !v)}
            className={clsx("ml-0.5 flex h-5 w-5 items-center justify-center rounded text-[var(--fg-sidebar)]/60 hover:bg-[var(--side-hover)] hover:text-[var(--fg-sidebar)]", menu ? "opacity-100" : "opacity-0 group-hover/sec:opacity-100")}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menu && (
            <Popover anchor={menuBtn.current} align="right" side="bottom">
            <div className="popover w-[190px] py-1 text-[13px]" onMouseDown={(e) => e.stopPropagation()}>
              {isUnread ? (
                <button type="button" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { setShowUnreadSection(false); setMenu(false); }}>
                  <EyeOffIcon className="w-3.5 h-3.5" /> 이 섹션 숨기기
                </button>
              ) : (
                <>
                  <div className="px-3 py-1 text-[11px] text-[var(--fg-muted)]">정렬</div>
                  {(Object.keys(SORT_LABELS) as SectionSort[]).map((k) => (
                    <button key={k} type="button" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { setSectionSort(sectionKey, k); setMenu(false); if (k === "manual" && !group) onManage(sectionKey); }}>
                      <Check className={clsx("w-3.5 h-3.5 text-[var(--accent)]", sort === k ? "opacity-100" : "opacity-0")} />{SORT_LABELS[k]}
                    </button>
                  ))}
                </>
              )}
              {group && (
                <>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <div className="px-3 py-1 text-[11px] text-[var(--fg-muted)]">그룹</div>
                  <div className="px-3 py-1.5 flex flex-wrap gap-1.5">
                    {GROUP_COLORS.map((c) => (
                      <button key={c.id} type="button" title={c.label} onClick={() => setGroupColor(group.id, c.value)} className={clsx("h-4 w-4 rounded-full border-2", (group.color ?? DEFAULT_GROUP_COLOR) === c.value ? "border-[var(--fg)]" : "border-transparent")} style={{ background: c.value }} />
                    ))}
                  </div>
                  <button type="button" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={startRename}><Pencil className="w-3.5 h-3.5" /> 이름 변경</button>
                  <button type="button" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { setMenu(false); onManage(sectionKey); }}><Folders className="w-3.5 h-3.5" /> 채널 넣기·빼기…</button>
                  <button type="button" className="w-full flex items-center gap-2 px-3 py-1.5 text-red-500 hover:bg-red-500/10" onClick={() => { setMenu(false); if (confirm(`"${group.name}" 그룹을 삭제할까요? 채널은 원래 섹션으로 돌아갑니다.`)) removeGroup(group.id); }}><Trash2 className="w-3.5 h-3.5" /> 그룹 삭제</button>
                </>
              )}
              <div className="my-1 h-px bg-[var(--border)]" />
              <button type="button" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { setMenu(false); onManage(sectionKey); }}>
                <SlidersHorizontal className="w-3.5 h-3.5" /> 사이드바 관리…
              </button>
            </div>
            </Popover>
          )}
        </div>
      )}
      {!collapsed && group && items.length === 0 && <div className="px-3 py-1 text-[12px] text-[var(--fg-sidebar)]/40">채널 없음 · 우클릭 → 채널 넣기</div>}
      {/* Every section's rows sit behind a guide line (group colour / accent / neutral), so membership reads at a glance. */}
      {!collapsed ? (
        <div
          ref={listRef}
          className="ml-[14px] pl-2 border-l-2"
          style={{ borderColor: group ? `color-mix(in srgb, ${group.color ?? DEFAULT_GROUP_COLOR} 55%, transparent)` : accent ? "color-mix(in srgb, var(--accent) 55%, transparent)" : "rgba(255,255,255,0.14)" }}
        >
          {items.map((x, i) => (
            <div
              key={x.ch.channel_id}
              data-sb-id={x.ch.channel_id}
              onPointerDown={(e) => startReorder(e, x.ch.channel_id)}
              onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); e.preventDefault(); } }}
              className={clsx("relative", dragId === x.ch.channel_id && "opacity-40", dragId != null && dropAt === i && "before:absolute before:inset-x-0 before:-top-[1.5px] before:z-10 before:h-[3px] before:rounded before:bg-[var(--accent)] before:content-['']", dragId != null && dropAt === items.length && i === items.length - 1 && "after:absolute after:inset-x-0 after:-bottom-[1.5px] after:z-10 after:h-[3px] after:rounded after:bg-[var(--accent)] after:content-['']")}
            >
              <Collapsible open={!folded || (x.ch.unread ?? 0) > 0 || (x.ch.unread_mention ?? 0) > 0}>{row(x)}</Collapsible>
            </div>
          ))}
        </div>
      ) : shown.map(row)}
    </div>
  );
}

/** Compact tile used when the sidebar is collapsed to an icon rail. */
/**
 * A room's picture in the collapsed rail: the other person's avatar for a 1:1, overlapping avatars for a
 * group DM, otherwise a coloured square with # / bot / initials and a lock badge for private rooms.
 * `size` is the square's edge; 34 for a room tile, 14 for a cell of a folded folder's 2×2 preview.
 */
function RoomGlyph({ ch, label, me, size }: { ch: Channel; label: string; me?: number; size: number }) {
  const others = ch.type === "anonymous" ? (ch.members ?? ch.member_ids ?? []).filter((id) => id !== me) : [];
  const small = size < 24;
  if (others.length >= 2) return <GroupAvatars userIds={others} size={Math.round(size * 0.65)} />;
  if (others.length === 1) return <Avatar userId={others[0]} size={size} />;
  const icon = small ? "h-2.5 w-2.5" : "h-5 w-5";
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={clsx("flex items-center justify-center font-semibold text-white", small ? "rounded text-[9px]" : "rounded-lg text-[14px]")}
        style={{ width: size, height: size, background: colorFor(ch.channel_id) }}
      >
        {ch.type === "public" ? <Hash className={icon} /> : ch.type === "chatbot" || ch.type === "synobot" ? <Bot className={icon} /> : small && ch.type === "private" ? <Lock className={icon} /> : initials(label).slice(0, small ? 1 : 2)}
      </span>
      {!small && ch.type === "private" && <Lock className="absolute -bottom-[2px] -right-[2px] h-3 w-3 rounded-full bg-[var(--bg-sidebar)] p-[1px] text-[color-mix(in_srgb,var(--ink-sidebar)_80%,transparent)]" />}
    </span>
  );
}

function RailTile({ ch, label, active, me, onClick, onContext }: { ch: Channel; label: string; active: boolean; me?: number; onClick: () => void; onContext: (e: React.MouseEvent) => void }) {
  const mentions = ch.unread_mention + ch.unread_mention_comment;
  const popped = usePopouts((s) => s.current === ch.channel_id);
  return (
    <button
      onClick={onClick}
      onContextMenu={onContext}
      title={label}
      className={clsx("relative mx-auto my-[3px] flex h-11 w-11 items-center justify-center rounded-lg transition-colors", active ? "ring-2 ring-[var(--accent)]" : "hover:bg-[var(--side-hover)]")}
    >
      <RoomGlyph ch={ch} label={label} me={me} size={34} />
      {popped && <span title="새 창에서 열려 있음" className="absolute -bottom-[2px] -right-[2px] flex h-4 w-4 items-center justify-center rounded bg-[var(--bg-sidebar)] ring-1 ring-[color-mix(in_srgb,var(--ink-sidebar)_30%,transparent)]"><AppWindow className="h-3 w-3 text-[var(--ink-sidebar)]" /></span>}
      {mentions > 0 ? (
        <span className="absolute -top-1 -right-1 min-w-[16px] rounded-full bg-red-500 px-1 text-[10px] font-bold text-white text-center">{mentions}</span>
      ) : ch.unread > 0 && !active ? (
        <span className="absolute -top-[2px] -right-[2px] h-2.5 w-2.5 rounded-full bg-[var(--ink-sidebar)] ring-2 ring-[var(--bg-sidebar)]" />
      ) : null}
    </button>
  );
}

function ChannelRow({ ch, label, active, online, badge, me, onClick, onContext }: { ch: Channel; label: string; active: boolean; online?: boolean; badge?: string; me?: number; onClick: () => void; onContext: (e: React.MouseEvent) => void }) {
  const unread = ch.unread > 0;
  const mentions = ch.unread_mention + ch.unread_mention_comment;
  const muted = ch.preferences?.notification_mute || !!badge;
  const popped = usePopouts((s) => s.current === ch.channel_id);
  return (
    <button
      onClick={onClick}
      onContextMenu={onContext}
      className={clsx(
        "w-full flex items-center gap-2.5 px-3 py-[6px] rounded-md text-left text-[13.5px] transition-colors",
        active ? SEL_ROW : "text-[var(--fg-sidebar)] hover:bg-[var(--side-hover)]",
        unread && !active && "text-[var(--ink-sidebar)] font-semibold",
        muted && !active && "opacity-60",
      )}
      title={ch.purpose || label}
    >
      <span className="w-5 flex items-center justify-center"><ChannelIcon ch={ch} online={online} me={me} /></span>
      <span className="truncate flex-1">{label}</span>
      {badge && <span className="rounded px-1 text-[10px] leading-[15px] border border-current opacity-70">{badge}</span>}
      {ch.preferences?.notification_mute && <BellOff className="w-3 h-3 opacity-60" />}
      {popped && <AppWindow className="w-3.5 h-3.5 opacity-80" aria-label="새 창에서 열려 있음" />}
      {mentions > 0 && (
        <span className={clsx("min-w-[18px] px-1 rounded-full text-[11px] font-bold text-center", active ? "bg-[var(--accent-fg)] text-[var(--accent)]" : "bg-red-500 text-white")}>{mentions}</span>
      )}
      {mentions === 0 && unread && !active && <span className="w-2 h-2 rounded-full bg-[color-mix(in_srgb,var(--ink-sidebar)_80%,transparent)]" />}
    </button>
  );
}

interface Menu { x: number; y: number; channelId: number }

/** Selected row / tile: the accent colour, so each theme's point colour shows which channel is open. */
const SEL_ROW = "bg-[var(--accent)] text-[var(--accent-fg)] font-medium";
const SEL_TILE = "bg-[var(--accent)] text-[var(--accent-fg)]";

export function Sidebar() {
  const channels = useChat((s) => s.channels);
  const users = useChat((s) => s.users);
  const activeId = useChat((s) => s.activeChannelId);
  const selectChannel = useChat((s) => s.selectChannel);
  const toggleStar = useChat((s) => s.toggleStar);
  const updateChannel = useChat((s) => s.updateChannel);
  const me = useSession((s) => s.info?.user_id);
  const setLoggedOut = useSession((s) => s.setLoggedOut);
  const compact = useCompact();
  // The icon rail makes no sense in the single-column layout: the list is the whole screen there.
  const collapsed = useUi((s) => s.sidebarCollapsed) && !compact;
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  const [filter, setFilter] = useState("");
  // Picking a result (a channel row, a person's 1:1, or the card's "1:1 메시지 보내기") moves to that chat;
  // the search has done its job then, so the list goes back to normal instead of staying filtered.
  const lastActive = useRef(activeId);
  useEffect(() => {
    if (lastActive.current !== activeId) { lastActive.current = activeId; if (activeId) setFilter(""); }
  }, [activeId]);
  // Attention moved elsewhere: another page (inbox, 채널 찾기, 관리, 정보 …), or a click / focus back in the
  // content area (conversation, composer). The search is over then; Esc or ✕ still clears it by hand.
  useEffect(() => { setFilter(""); }, [view]);
  const filtering = filter !== "";
  useEffect(() => {
    if (!filtering) return;
    const away = (e: Event) => { if ((e.target as HTMLElement | null)?.closest?.("[data-content-area]")) setFilter(""); };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("focusin", away, true);
    // This window is no longer the one being used (another Chat Viewer window, another app): the search is over.
    const blurred = () => setFilter("");
    window.addEventListener("blur", blurred);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("focusin", away, true); window.removeEventListener("blur", blurred); };
  }, [filtering]);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const openManage = useUi((s) => s.openManage);
  const manageFor = (k: SectionKey | "unread") => openManage(k === "unread" || !k.startsWith("g:") ? "sections" : "groups", { section: k === "unread" ? "channels" : k });
  const [showProfile, setShowProfile] = useState(false);
  const newVersion = useUpdate((s) => (s.phase === "available" || s.phase === "downloading" ? s.version : null));
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const userMenuAnchor = useRef<HTMLButtonElement>(null);
  const prefs0 = useSession((s) => s.prefs);
  const serverNow = useSession((s) => s.serverNow);
  const loadPrefs = useSession((s) => s.loadPrefs);
  const snoozing = (prefs0?.snooze ?? 0) > serverNow();
  const { toggle: toggleAway } = useAway();
  // The profile card's "프로필 편집" button opens the dialog from anywhere.
  useEffect(() => { const h = () => setShowProfile(true); window.addEventListener("chat:open-profile", h); return () => window.removeEventListener("chat:open-profile", h); }, []);
  const assignGroup = useUi((s) => s.assignGroup);
  const prefs = useUi((s) => s.sidebar);
  const togglePinnedTop = useUi((s) => s.togglePinnedTop);
  const setLocalHidden = useUi((s) => s.setLocalHidden);
  const hideChannel = useChat((s) => s.hideChannel);
  const ensureAllMembers = useChat((s) => s.ensureAllMembers);
  const membersLoading = useChat((s) => s.membersLoading);

  useEffect(() => {
    if (!menu && !userMenu) return;
    const close = () => { setMenu(null); setUserMenu(false); setSnoozeOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [menu, userMenu]);

  // Normal view: hidden channels removed, each section ordered by the user's preferences.
  const groups = useMemo(() => buildSections(channels, users, me, prefs), [channels, users, me, prefs]);
  const defs = useMemo(() => sectionDefs(prefs), [prefs]);
  const unreadEntries = useMemo(() => unreadAlertEntries(channels, users, me, prefs), [channels, users, me, prefs]);

  // Search view: channel names *and* people. A matching person lists their 1:1 chat and the rooms we share.
  const q = filter.trim().toLowerCase();
  const search = useMemo(() => {
    if (!q) return null;
    const byRecent = (a: Entry, b: Entry) => b.ch.last_post_at - a.ch.last_post_at;
    const all: Entry[] = Object.values(channels).filter((c) => c.is_joined).map((c) => ({ ch: c, label: channelLabel(c, users, me) }));
    const byName = all.filter((x) => x.label.toLowerCase().includes(q)).sort(byRecent);
    const people = Object.values(users)
      .filter((u) => u.type === "human" && !u.deleted && u.user_id !== me && ((u.nickname ?? "").toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q)))
      .sort((a, b) => Number(!!userBadge(a)) - Number(!!userBadge(b)) || userLabel(a).localeCompare(userLabel(b), "ko"))
      .slice(0, 5);
    // Each channel appears once: a person's 1:1 chat under that person, other name matches under 채널,
    // and the remaining shared rooms under the person.
    const shown = new Set<number>();
    const groups = people.map((u) => {
      const membersOf = (ch: Channel) => ch.members ?? ch.member_ids ?? [];
      const has = (ch: Channel) => membersOf(ch).includes(u.user_id);
      const dm = all.find((x) => x.ch.type === "anonymous" && has(x.ch) && membersOf(x.ch).filter((id) => id !== me).length === 1);
      if (dm) shown.add(dm.ch.channel_id);
      return { user: u, dm, has };
    });
    const nameOnly = byName.filter((x) => !shown.has(x.ch.channel_id));
    for (const x of nameOnly) shown.add(x.ch.channel_id);
    const withRooms = groups
      .map(({ user, dm, has }) => {
        const rooms = all.filter((x) => !shown.has(x.ch.channel_id) && x.ch.type !== "chatbot" && x.ch.type !== "synobot" && x.ch.type !== "anonymous" && has(x.ch)).sort(byRecent);
        const latest = Math.max(dm?.ch.last_post_at ?? 0, ...rooms.map((r) => r.ch.last_post_at));
        return { user, dm, rooms, latest };
      })
      // Most recent conversation first; unavailable accounts last.
      .sort((a, b) => Number(!!userBadge(a.user)) - Number(!!userBadge(b.user)) || b.latest - a.latest);
    return { byName: nameOnly, groups: withRooms };
  }, [q, channels, users, me]);
  // Member lists of public/private channels are fetched once, the first time a person matches.
  useEffect(() => { if (search?.groups.length) void ensureAllMembers(); }, [search?.groups.length, ensureAllMembers]);

  const otherOf = (ch: Channel) => (ch.type === "anonymous" ? (ch.members ?? ch.member_ids ?? []).filter((id) => id !== me) : []);
  const onlineOf = (ch: Channel) => {
    const other = otherOf(ch);
    return other.length === 1 ? users[other[0]]?.status === "online" : undefined;
  };
  /** 1:1 chat whose counterpart is disabled/deleted gets a badge. */
  const badgeOf = (ch: Channel) => { const other = otherOf(ch); return other.length === 1 ? userBadge(users[other[0]]) || undefined : undefined; };

  // A chat that already has its own window is shown there: clicking it brings that window forward.
  const open = (id: number) => {
    setFilter(""); // a picked search result ends the search, even when that chat is already the open one
    if (usePopouts.getState().current === id && !isMobileOS) { const c = useChat.getState().channels[id]; void openChatWindow(id, c ? channelLabel(c, useChat.getState().users, me) : "Chat Viewer"); return; }
    setView("channel"); void selectChannel(id);
  };
  const row = (x: Entry) => {
    const active = view === "channel" && x.ch.channel_id === activeId;
    const ctx = (e: React.MouseEvent) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, channelId: x.ch.channel_id }); };
    if (collapsed) return <RailTile key={x.ch.channel_id} ch={x.ch} label={x.label} active={active} me={me} onClick={() => open(x.ch.channel_id)} onContext={ctx} />;
    const hidden = isServerHidden(x.ch) || isLocalHidden(x.ch, prefs);
    const node = <ChannelRow key={x.ch.channel_id} ch={x.ch} label={x.label} online={onlineOf(x.ch)} badge={badgeOf(x.ch)} me={me} active={active} onClick={() => open(x.ch.channel_id)} onContext={ctx} />;
    return hidden ? <div key={x.ch.channel_id} className="opacity-50" title="숨긴 채널">{node}</div> : node;
  };

  const menuChannel = menu ? channels[menu.channelId] : null;
  /** Keeps the context menu inside the window: a webview cannot draw outside it, so the menu slides up/left instead of being cut off. */
  const fitMenu = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (r.bottom > vh - 8) el.style.top = `${Math.max(8, vh - 8 - r.height)}px`;
    if (r.right > vw - 8) el.style.left = `${Math.max(8, vw - 8 - r.width)}px`;
  }, []);
  const toggleMute = async (ch: Channel) => {
    const next = !ch.preferences?.notification_mute;
    updateChannel(ch.channel_id, { preferences: { ...ch.preferences, notification_mute: next } });
    await chat.setPreference(ch.channel_id, { notification_mute: next }).catch(() => updateChannel(ch.channel_id, { preferences: { ...ch.preferences, notification_mute: !next } }));
  };
  const logout = async () => {
    await auth.logout().catch(() => null);
    useChat.setState({ ready: false, channels: {}, users: {}, posts: {}, activeChannelId: null });
    setLoggedOut();
  };

  const meUser = me ? users[me] : undefined;
  const away = !!meUser?.user_props?.is_always_offline;
  /** Profile-menu row. External rows (open the browser) carry a trailing ↗ icon and a tooltip; checked rows show a check mark. */
  const menuItem = (icon: React.ReactNode, label: string, run: () => void, hint?: string, checked?: boolean, external?: boolean) => (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]"
      title={external ? "브라우저에서 열림" : hint}
      onClick={() => { setUserMenu(false); run(); }}
    >
      {icon}
      <span className="flex-1 text-left truncate">{label}{hint && <span className="ml-1.5 text-[11px] text-[var(--fg-muted)]">{hint}</span>}</span>
      {checked && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
      {external && <ExternalLink className="w-3.5 h-3.5 text-[var(--fg-muted)]" />}
    </button>
  );

  return (
    <aside className={clsx("shrink-0 h-full flex flex-col bg-[var(--bg-sidebar)] shadow-[inset_-1px_0_0_var(--border-strong)] relative select-none transition-[width] duration-200 ease-out", collapsed ? "w-[84px]" : "w-[264px] max-[720px]:w-full")}>
      {/* traffic-light zone stays empty; the profile row sits below it with its own padding */}
      <div className={clsx("titlebar-drag shrink-0", isMobileOS ? "h-[env(safe-area-inset-top)]" : "h-[38px]")} />
      <div className={clsx("titlebar-drag shrink-0 flex items-center pt-1 pb-2", collapsed ? "justify-center px-2" : "justify-between px-4")}>
        {!collapsed && (
          <div className="titlebar-nodrag relative">
            <button ref={userMenuAnchor} onClick={() => { setUserMenu((v) => !v); setSnoozeOpen(false); void loadPrefs(); }} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--side-hover)]" title="내 계정">
              <span className="relative">
                {me ? <Avatar userId={me} size={22} /> : null}
                {/* Presence dot: green = online, grey = 부재 중 (always offline). Changes the moment the toggle is saved. */}
                <span
                  title={away ? "부재 중 (항상 오프라인으로 표시)" : "온라인"}
                  className={clsx("absolute -bottom-[3px] -right-[3px] h-[11px] w-[11px] rounded-full ring-2 ring-[var(--bg-sidebar)]", away ? "bg-zinc-400" : "bg-green-400")}
                />
                {newVersion && <span title={`새 버전 ${newVersion}이 있습니다`} className="absolute -top-[3px] -left-[3px] h-[10px] w-[10px] rounded-full bg-red-500 ring-2 ring-[var(--bg-sidebar)]" />}
                {snoozing && <span title="알림 일시 중지 중" className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--bg-sidebar)]"><BellOff className="h-2.5 w-2.5 text-amber-300" /></span>}
              </span>
              <span className="text-[13px] font-semibold text-[var(--ink-sidebar)] max-w-[120px] truncate">{userLabel(meUser)}</span>
              {away && <span className="rounded border border-[color-mix(in_srgb,var(--ink-sidebar)_30%,transparent)] px-1 text-[10px] leading-[14px] text-[color-mix(in_srgb,var(--ink-sidebar)_70%,transparent)]">부재 중</span>}
            </button>
            {userMenu && !snoozeOpen && (
              <div className="popover absolute left-0 top-9 z-50 w-[232px] py-1 text-[13px]" onMouseDown={(e) => e.stopPropagation()}>
                {menuItem(<UserRound className="w-4 h-4" />, "내 프로필…", () => setShowProfile(true))}
                {menuItem(<Settings className="w-4 h-4" />, "설정", () => openManage("appearance"), "알림 · 모양 · 테마")}
                {menuItem(<Puzzle className="w-4 h-4" />, "통합", () => setView("integrations"), "봇 · 웹훅 · 슬래시 명령")}
                <div className="my-1 h-px bg-[var(--border)]" />
                <div className="px-3 pt-1 pb-0.5 text-[10.5px] font-semibold tracking-wide text-[var(--fg-muted)]">내 상태</div>
                {menuItem(<Moon className="w-4 h-4" />, meUser?.user_props?.is_always_offline ? "부재 중 해제" : "부재 중으로 설정", () => void toggleAway(), undefined, !!meUser?.user_props?.is_always_offline)}
                <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => setSnoozeOpen(true)}>
                  <BellOff className={clsx("w-4 h-4", snoozing && "text-amber-500")} />
                  <span className="flex-1 text-left">알림 일시 중지{snoozing && prefs0?.snooze ? <span className="ml-1 text-[11px] text-[var(--fg-muted)]">~{new Date(prefs0.snooze).getHours().toString().padStart(2, "0")}:{new Date(prefs0.snooze).getMinutes().toString().padStart(2, "0")}</span> : null}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
                </button>
                <div className="my-1 h-px bg-[var(--border)]" />
                {menuItem(<Archive className="w-4 h-4" />, "보관 뷰어", () => setView("archive"))}
                <div className="my-1 h-px bg-[var(--border)]" />
                <div className="px-3 pt-1 pb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">브라우저에서 열기</div>
                {menuItem(<CircleHelp className="w-4 h-4" />, "도움말", () => openExternal(HELP_URL), undefined, false, true)}
                {menuItem(<Globe className="w-4 h-4" />, "공식 웹 클라이언트", () => openExternal(officialWebUrl()), undefined, false, true)}
                <div className="my-1 h-px bg-[var(--border)]" />
                {menuItem(<Info className="w-4 h-4" />, "정보 · 업데이트", () => setView("about"), newVersion ? `새 버전 ${newVersion}` : "새 기능 · 단축키")}
                <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => void logout()}><LogOut className="w-4 h-4" /> 로그아웃</button>
              </div>
            )}
            {userMenu && snoozeOpen && (
              <div className="popover absolute left-0 top-9 z-50" onMouseDown={(e) => e.stopPropagation()}>
                <SnoozeMenu onClose={() => { setSnoozeOpen(false); setUserMenu(false); }} />
              </div>
            )}
          </div>
        )}
        {!compact && <IconButton label={collapsed ? "사이드바 펼치기 (⌘\\)" : "사이드바 접기 (⌘\\)"} size="sm" className={clsx("titlebar-nodrag !text-[color-mix(in_srgb,var(--ink-sidebar)_85%,transparent)] hover:!text-[var(--ink-sidebar)] hover:bg-[var(--side-hover)]", collapsed && "!h-11 !w-11 mx-auto")} onClick={toggleSidebar}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </IconButton>}
      </div>

      {!collapsed && (
        <div className="px-4 pt-0.5 pb-2 titlebar-nodrag flex items-center gap-1">
          <div className="relative flex-1 min-w-0">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setFilter(""); if (e.key === "Enter" && filter.trim()) { useSearch.getState().openWith(filter.trim()); setFilter(""); } }}
            placeholder="채널·사람 찾기 · Enter: 메시지 검색"
            className="w-full rounded-md border border-[color-mix(in_srgb,var(--ink-sidebar)_30%,transparent)] bg-[color-mix(in_srgb,var(--ink-sidebar)_10%,transparent)] text-[var(--ink-sidebar)] placeholder:text-[color-mix(in_srgb,var(--ink-sidebar)_45%,transparent)] pl-3 pr-7 py-1.5 text-[13px] outline-none focus:bg-[var(--side-hover)] focus:border-[var(--accent)]"
          />
          {filter && <button type="button" aria-label="검색어 지우기" title="검색어 지우기 (Esc)" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[color-mix(in_srgb,var(--ink-sidebar)_55%,transparent)] hover:text-[var(--ink-sidebar)]" onClick={() => setFilter("")}><X className="w-3.5 h-3.5" /></button>}
          </div>
          <IconButton label="사이드바 관리 (정렬·숨기기)" size="sm" className="!text-[color-mix(in_srgb,var(--ink-sidebar)_85%,transparent)] hover:!text-[var(--ink-sidebar)] hover:bg-[var(--side-hover)]" onClick={() => openManage("sections", { section: "channels" })}><SlidersHorizontal /></IconButton>
        </div>
      )}

      <nav key={collapsed ? "rail" : "wide"} className={clsx("anim-fade flex-1 overflow-y-auto pb-4 titlebar-nodrag", collapsed ? "px-3 no-scrollbar" : "px-4")}>
        {/* My collection: user-level items (bookmarks, threads, reminders, scheduled) */}
        {collapsed ? (
          <button onClick={() => setView("collection")} title="내 컬렉션" className={clsx("mx-auto my-[3px] flex h-11 w-11 items-center justify-center rounded-lg", view === "collection" ? SEL_TILE : "text-[var(--fg-sidebar)] hover:bg-[var(--side-hover)]")}>
            <Bookmark className="w-5 h-5" />
          </button>
        ) : (
          <button onClick={() => setView("collection")} className={clsx("w-full flex items-center gap-2.5 px-3 py-[6px] rounded-md text-left text-[13.5px]", view === "collection" ? SEL_ROW : "text-[var(--fg-sidebar)] hover:bg-[var(--side-hover)]")}>
            <Bookmark className="w-4 h-4" /> 내 컬렉션
          </button>
        )}
        {collapsed ? (
          <button onClick={() => setView("inbox")} title="새 메시지" className={clsx("relative mx-auto my-[3px] flex h-11 w-11 items-center justify-center rounded-lg", view === "inbox" ? SEL_TILE : "text-[var(--fg-sidebar)] hover:bg-[var(--side-hover)]")}>
            <Inbox className="w-5 h-5" />
            {unreadEntries.length > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] rounded-full bg-red-500 px-1 text-[10px] font-bold text-white text-center">{unreadEntries.length}</span>}
          </button>
        ) : (
          <button onClick={() => setView("inbox")} className={clsx("w-full flex items-center gap-2.5 px-3 py-[6px] rounded-md text-left text-[13.5px]", view === "inbox" ? SEL_ROW : "text-[var(--fg-sidebar)] hover:bg-[var(--side-hover)]")}>
            <Inbox className="w-4 h-4" /> 새 메시지
            {unreadEntries.length > 0 && <span className={clsx("ml-auto min-w-[18px] px-1 rounded-full text-[11px] font-bold text-center", view === "inbox" ? "bg-[var(--accent-fg)] text-[var(--accent)]" : "bg-red-500 text-white")}>{unreadEntries.length}</span>}
          </button>
        )}
        {search && !collapsed ? (
          <div className="mt-2">
            {search.byName.length > 0 && (
              <div className="mb-3">
                <div className="px-3 pb-1 text-[13.5px] font-semibold text-[var(--fg-sidebar)]/70">채널</div>
                {search.byName.map(row)}
              </div>
            )}
            {search.groups.map(({ user, dm, rooms }) => {
              const dmActive = !!dm && view === "channel" && dm.ch.channel_id === activeId;
              const unread = dm ? dm.ch.unread_mention + dm.ch.unread_mention_comment : 0;
              return (
              <div key={user.user_id} className="mb-3">
                {/* One row per person: the row IS the 1:1 chat (if any); the avatar opens the profile card. */}
                <div
                  role="button"
                  tabIndex={0}
                  title={dm ? "1:1 대화 열기 · 아바타: 프로필" : "1:1 대화 없음 · 아바타: 프로필"}
                  onClick={(e) => { if (dm) open(dm.ch.channel_id); else useUserCard.getState().open(user.user_id, e.currentTarget); }}
                  onContextMenu={(e) => { if (dm) { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, channelId: dm.ch.channel_id }); } }}
                  className={clsx("w-full flex items-center gap-2.5 px-3 py-[6px] rounded-md text-left text-[13.5px] cursor-pointer", dmActive ? SEL_ROW : "text-[var(--fg-sidebar)] hover:bg-[var(--side-hover)]", dm && dm.ch.unread > 0 && !dmActive && "text-[var(--ink-sidebar)] font-semibold")}
                >
                  <button type="button" title="프로필 보기" className="relative shrink-0 rounded-md hover:ring-2 hover:ring-[color-mix(in_srgb,var(--ink-sidebar)_40%,transparent)]" onClick={openUserCard(user.user_id)}>
                    <Avatar userId={user.user_id} size={22} />
                    {!userBadge(user) && <span className={clsx("absolute -right-[2px] -bottom-[2px] h-2.5 w-2.5 rounded-full ring-2 ring-[var(--bg-sidebar)]", user.status === "online" ? "bg-green-400" : "bg-gray-500")} />}
                  </button>
                  <span className="truncate flex-1">{userLabel(user)}</span>
                  {userBadge(user) && <span className="rounded px-1 text-[10px] leading-[15px] border border-current opacity-70">{userBadge(user)}</span>}
                  {!dm && <span className="text-[11px] opacity-50">1:1 없음</span>}
                  {unread > 0 && <span className={clsx("min-w-[18px] px-1 rounded-full text-[11px] font-bold text-center", dmActive ? "bg-[var(--accent-fg)] text-[var(--accent)]" : "bg-red-500 text-white")}>{unread}</span>}
                </div>
                {rooms.length > 0 && <div className="ml-4 border-l border-[color-mix(in_srgb,var(--ink-sidebar)_12%,transparent)] pl-1">{rooms.map(row)}</div>}
                {!dm && rooms.length === 0 && <div className="px-3 py-1 text-[12px] text-[var(--fg-sidebar)]/50">{membersLoading ? "멤버 불러오는 중…" : "함께 있는 방이 없습니다"}</div>}
                {membersLoading && (dm || rooms.length > 0) && <div className="px-3 py-0.5 text-[11px] text-[var(--fg-sidebar)]/40">채널 멤버 확인 중…</div>}
              </div>
              );
            })}
            {search.byName.length === 0 && search.groups.length === 0 && <div className="px-3 py-4 text-center text-[12px] text-[var(--fg-sidebar)]/50">결과가 없습니다</div>}
          </div>
        ) : (
          <>
            {prefs.showUnreadSection && unreadEntries.length > 0 && (
              <Section title="새 메시지" sectionKey="unread" accent collapsed={collapsed} items={unreadEntries} row={row} onManage={manageFor} me={me} />
            )}
            {defs.map((d) => (
              <Section key={d.key} title={d.title} sectionKey={d.key} collapsed={collapsed} items={groups[d.key] ?? []} row={row} onManage={manageFor} group={d.group} me={me} />
            ))}
          </>
        )}
      </nav>

      {/* Bottom utilities: channel discovery stay one click away. */}
      <div className={clsx("shrink-0 border-t border-[color-mix(in_srgb,var(--ink-sidebar)_12%,transparent)]", collapsed ? "px-2 pt-1.5 pb-2" : "px-4 pt-2 pb-4")}>
        {collapsed ? (
          <>
            <button onClick={() => setView("browse")} title="채널 찾기 · 만들기" className={clsx("mx-auto my-[2px] flex h-11 w-11 items-center justify-center rounded-lg", view === "browse" ? SEL_TILE : "text-[var(--fg-sidebar)] hover:bg-[var(--side-hover)]")}>
              <Plus className="w-5 h-5" />
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setView("browse")} className={clsx("w-full flex items-center gap-2.5 px-3 py-[5px] rounded-md text-left text-[13px]", view === "browse" ? SEL_ROW : "text-[var(--fg-sidebar)] hover:bg-[var(--side-hover)]")}>
              <Plus className="w-4 h-4" /> 채널 찾기 · 만들기
            </button>
          </>
        )}
      </div>

      {showProfile && <ProfileDialog onClose={() => setShowProfile(false)} />}

      {menu && menuChannel && (
        createPortal(<div ref={fitMenu} className="popover fixed z-50 py-1 w-[220px] text-[13px] max-h-[calc(100vh-16px)] overflow-y-auto" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { setMenu(null); void toggleStar(menuChannel.channel_id); }}>
            {menuChannel.is_star ? <StarOff className="w-4 h-4" /> : <Star className="w-4 h-4" />}
            {menuChannel.is_star ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { setMenu(null); void toggleMute(menuChannel); }}>
            <BellOff className="w-4 h-4" />
            {menuChannel.preferences?.notification_mute ? "알림 켜기" : "알림 끄기"}
          </button>
          {menuChannel.type !== "synobot" && (
            <>
              <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { setMenu(null); togglePinnedTop(menuChannel.channel_id); }}>
                {prefs.pinnedTop.includes(menuChannel.channel_id) ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                {prefs.pinnedTop.includes(menuChannel.channel_id) ? "맨 위 고정 해제" : "맨 위에 고정"}
              </button>
              <div className="my-1 h-px bg-[var(--border)]" />
              <div className="px-3 py-1 text-[11px] text-[var(--fg-muted)]">그룹</div>
              {prefs.groups.map((g) => {
                const inGroup = g.channelIds.includes(menuChannel.channel_id);
                return (
                  <button key={g.id} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { setMenu(null); assignGroup(menuChannel.channel_id, inGroup ? null : g.id); }}>
                    <Check className={clsx("w-3.5 h-3.5 text-[var(--accent)]", inGroup ? "opacity-100" : "opacity-0")} /><span className="truncate">{g.name}</span>
                  </button>
                );
              })}
              <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { setMenu(null); openManage("groups", { pendingChannel: menuChannel.channel_id }); }}>
                <FolderPlus className="w-4 h-4" /> 새 그룹에 넣기…
              </button>
              <div className="my-1 h-px bg-[var(--border)]" />
              <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { setMenu(null); void hideChannel(menuChannel.channel_id).catch((e) => alert(`숨기기 실패: ${(e as { message?: string })?.message ?? e}`)); }}>
                <EyeOff className="w-4 h-4" />
                <span>모든 기기에서 숨기기<span className="block text-[11px] text-[var(--fg-muted)]">새 메시지가 오면 다시 표시</span></span>
              </button>
              <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { setMenu(null); setLocalHidden(menuChannel.channel_id, true); }}>
                <EyeOff className="w-4 h-4 opacity-60" />
                <span>이 앱에서만 숨기기<span className="block text-[11px] text-[var(--fg-muted)]">새 메시지가 와도 숨김 유지</span></span>
              </button>
            </>
          )}
        </div>, document.body)
      )}
    </aside>
  );
}
