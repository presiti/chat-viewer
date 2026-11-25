import { useMemo, useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import type { Channel } from "../api/types";
import { channelLabel, useChat } from "../store/chat";
import { useSession } from "../store/session";
import { useUi } from "../store/ui";
import { ChannelIcon } from "./ChannelIcon";

/**
 * Experimental browser-style tab strip: every channel you open becomes a tab (newest on the right).
 * ✕ closes, drag (pointer-based) reorders, middle-click closes. Enabled from 모양 · 테마.
 */
export function ChannelTabs() {
  const tabs = useUi((s) => s.channelTabs);
  const closeTab = useUi((s) => s.closeTab);
  const setTabOrder = useUi((s) => s.setTabOrder);
  const setView = useUi((s) => s.setView);
  const view = useUi((s) => s.view);
  const channels = useChat((s) => s.channels);
  const users = useChat((s) => s.users);
  const activeId = useChat((s) => s.activeChannelId);
  const selectChannel = useChat((s) => s.selectChannel);
  const me = useSession((s) => s.info?.user_id);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const list = useMemo(() => tabs.open.map((id) => channels[id]).filter((c): c is Channel => !!c), [tabs.open, channels]);
  if (!tabs.enabled) return null;

  const activate = (id: number) => { setView("channel"); void selectChannel(id); };
  const close = (id: number) => {
    const idx = list.findIndex((c) => c.channel_id === id);
    closeTab(id);
    // Closing the active tab moves to the neighbour, like a browser.
    if (id === activeId) { const next = list[idx + 1] ?? list[idx - 1]; if (next) activate(next.channel_id); }
  };
  const startDrag = (ev: React.PointerEvent, id: number) => {
    const target = ev.currentTarget as HTMLElement;
    target.setPointerCapture(ev.pointerId);
    setDrag(id);
    let last: number | null = null;
    const move = (e: PointerEvent) => { const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-tab-id]"); last = el ? Number(el.dataset.tabId) : null; setOver(last != null && last !== id ? last : null); };
    const up = (e: PointerEvent) => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      if (last != null && last !== id) { const ids = tabs.open.filter((x) => x !== id); ids.splice(tabs.open.indexOf(last), 0, id); setTabOrder(ids); }
      setDrag(null); setOver(null);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const icon = (c: Channel) => <ChannelIcon ch={c} me={me} size={14} dm="avatar" />;

  return (
    <div className="titlebar-drag shrink-0 flex items-end gap-[2px] px-2 pt-1.5 bg-[var(--bg-muted)] border-b border-[var(--border)] overflow-x-auto no-scrollbar">
      {list.length === 0 && <span className="px-3 py-1.5 text-[12px] text-[var(--fg-muted)]">채널을 열면 여기에 탭이 생깁니다 (실험 기능)</span>}
      {list.map((c) => {
        const active = view === "channel" && c.channel_id === activeId;
        const mentions = c.unread_mention + c.unread_mention_comment;
        return (
          <div
            key={c.channel_id}
            data-tab-id={c.channel_id}
            onPointerDown={(e) => { if (e.button === 0) startDrag(e, c.channel_id); }}
            onClick={() => activate(c.channel_id)}
            onAuxClick={(e) => { if (e.button === 1) close(c.channel_id); }}
            title={c.purpose || channelLabel(c, users, me)}
            className={clsx(
              "titlebar-nodrag group/tab relative flex max-w-[200px] min-w-[96px] shrink-0 cursor-default select-none items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-[12.5px]",
              active ? "bg-[var(--bg)] border-[var(--border)] -mb-px pb-[7px] font-medium" : "bg-transparent border-transparent text-[var(--fg-muted)] hover:bg-[var(--hover)]",
              c.unread > 0 && !active && "text-[var(--fg)] font-medium",
              drag === c.channel_id && "opacity-50",
              over === c.channel_id && "ring-2 ring-[var(--accent)]/40",
            )}
          >
            {icon(c)}
            <span className="truncate flex-1">{channelLabel(c, users, me)}</span>
            {mentions > 0 ? (
              <span className="min-w-[16px] rounded-full bg-red-500 px-1 text-[10px] font-bold text-white text-center">{mentions}</span>
            ) : c.unread > 0 && !active ? (
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            ) : null}
            <button type="button" title="탭 닫기" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); close(c.channel_id); }} className={clsx("rounded p-0.5 hover:bg-[var(--hover)]", active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover/tab:opacity-60")}><X className="w-3 h-3" /></button>
          </div>
        );
      })}
    </div>
  );
}
