import { useEffect, useState } from "react";
import clsx from "clsx";
import { AppWindow, Bell, BellOff, ChevronLeft, Info, Search, Star, Users } from "lucide-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { chat } from "../api/client";
import { channelLabel, useChat, userLabel } from "../store/chat";
import { useSession } from "../store/session";
import { useUi } from "../store/ui";
import { useIndexer } from "../store/index";
import { useSync } from "../store/sync";
import { useSearch } from "../store/search";
import { queuePath } from "../store/pending";
import { startBadgeSync } from "../store/notify";
import { startUpdateChecks } from "../store/update";
import { UpdateBanner } from "../components/UpdateBanner";
import { ToastHost } from "../components/ToastHost";
import { startRealtime } from "../realtime/socket";
import { Sidebar } from "../components/Sidebar";
import { MessageList } from "../components/MessageList";
import { Composer } from "../components/Composer";
import { StatusBanner } from "../components/StatusBanner";
import { IconButton } from "../components/IconButton";
import { UploadQueue } from "../components/UploadQueue";
import { SearchPalette } from "../components/SearchPalette";
import { ChannelInfoPanel } from "../components/panels/ChannelInfoPanel";
import { Collection } from "./Collection";
import { Inbox } from "./Inbox";
import { Browse } from "./Browse";
import { Manage } from "./Manage";
import { Integrations } from "./Integrations";
import { ArchiveViewer } from "./ArchiveViewer";
import { ChannelTabs } from "../components/ChannelTabs";
import { UserCardHost } from "../components/UserCard";
import { ImageViewerHost } from "../components/ImageViewer";
import { WhatsNew } from "../components/WhatsNew";
import { About } from "./About";
import { listen, emit } from "@tauri-apps/api/event";
import { usePopouts } from "../store/popout";
import { isCompactNow, isMacDesktop, isMobileOS, isPopout, openChatWindow, popoutChannelId, POPOUT_CHANGED, POPOUT_LABEL, POPOUT_OPEN, useCompact, usePanelOverlay } from "../lib/platform";

const LAST_CHANNEL_KEY = "chat-viewer:last-channel";

export function Main() {
  const ready = useChat((s) => s.ready);
  const error = useChat((s) => s.error);
  const loadInitial = useChat((s) => s.loadInitial);
  const selectChannel = useChat((s) => s.selectChannel);
  const toggleStar = useChat((s) => s.toggleStar);
  const updateChannel = useChat((s) => s.updateChannel);
  const activeId = useChat((s) => s.activeChannelId);
  const channel = useChat((s) => (s.activeChannelId ? s.channels[s.activeChannelId] : undefined));
  const users = useChat((s) => s.users);
  const typing = useChat((s) => (s.activeChannelId ? s.typing[s.activeChannelId] : undefined));
  const me = useSession((s) => s.info?.user_id);
  const panel = useUi((s) => s.rightPanel);
  const infoTab = useUi((s) => s.infoTab);
  const toggleInfo = useUi((s) => s.toggleInfo);
  const openInfo = useUi((s) => s.openInfo);
  const setRightPanel = useUi((s) => s.setRightPanel);
  const panelOverlay = usePanelOverlay();
  const view = useUi((s) => s.view);
  const compact = useCompact();
  const mobileScreen = useUi((s) => s.mobileScreen);
  const setMobileScreen = useUi((s) => s.setMobileScreen);
  const setView = useUi((s) => s.setView);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const openSearch = useSearch((s) => s.openWith);
  const searchOpen = useSearch((s) => s.open);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let stopBadge: (() => void) | undefined;
    let stopUpdate: (() => void) | undefined;
    let stopPop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        // A failed first load (NAS unreachable for a moment, laptop waking up…) used to strand the app on
        // the error banner: no socket, hence no resync. Keep trying with a backoff instead.
        for (let attempt = 0; ; attempt++) {
          try { await loadInitial(); break; } catch { if (cancelled) return; }
          await new Promise((r) => setTimeout(r, Math.min(5000 * (attempt + 1), 30000)));
          if (cancelled) return;
        }
        if (cancelled) return;
        stop = await startRealtime(isPopout);
        if (cancelled) { stop(); return; }
        let last: number | null = null;
        try { last = Number(localStorage.getItem(LAST_CHANNEL_KEY)) || null; } catch { /* ignore */ }
        const chans = useChat.getState().channels;
        const first = last && chans[last] ? last : Object.values(chans).filter((c) => c.is_joined).sort((a, b) => b.last_post_at - a.last_post_at)[0]?.channel_id;
        if (isPopout) {
          if (popoutChannelId) useUi.getState().setMobileScreen("chat");
          if (popoutChannelId && chans[popoutChannelId]) void selectChannel(popoutChannelId);
          // The main window re-targets this one window when another chat is sent to it.
          const un = await listen<{ channelId: number }>(POPOUT_OPEN, (e) => { useUi.getState().setView("channel"); void selectChannel(e.payload.channelId); });
          if (cancelled) un(); else stopPop = un;
          void useSession.getState().loadPrefs();
          return;
        }
        const unc = await listen<{ channelId: number | null }>(POPOUT_CHANGED, (e) => usePopouts.getState().set(e.payload.channelId));
        if (cancelled) unc(); else stopPop = unc;
        if (first && !isCompactNow()) void selectChannel(first); // single-column: start on the list, do not open (and mark read) a chat
        // Build/refresh the local search index in the background.
        setTimeout(() => void useIndexer.getState().start(), 1500);
        setTimeout(() => void useSync.getState().start(), 800);
        void useSession.getState().loadPrefs();
        stopBadge = startBadgeSync();
        if (!isMobileOS) stopUpdate = startUpdateChecks();
      } catch { /* error is shown from store */ }
    })();
    return () => { cancelled = true; stop?.(); stopBadge?.(); stopUpdate?.(); stopPop?.(); };
  }, [loadInitial, selectChannel]);

  // The popout tells the main window which chat it is showing (for the icon in the list).
  useEffect(() => { if (isPopout) void emit(POPOUT_CHANGED, { channelId: activeId }); }, [activeId]);

  useEffect(() => {
    if (activeId && !isPopout) try { localStorage.setItem(LAST_CHANNEL_KEY, String(activeId)); } catch { /* ignore */ }
  }, [activeId]);

  useEffect(() => {
    const onFocus = () => { const id = useChat.getState().activeChannelId; if (id && useUi.getState().view === "channel") void useChat.getState().markViewed(id); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);


  // Shortcuts: ⌘K search palette, ⌘I channel info, ⌘⇧M members, ⌘⇧B pinned, ⌘\ sidebar, Esc closes the panel.
  // Listed for users in src/lib/shortcuts.ts — keep both in step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      // Inside the composer ⌘I is italic (text-editing convention), so the info toggle only applies elsewhere.
      const inEditor = !!(e.target as HTMLElement | null)?.closest?.(".composer-editor");
      if (mod && !e.shiftKey && k === "k") { e.preventDefault(); openSearch(); }
      else if (mod && !e.shiftKey && k === "i" && !inEditor) { e.preventDefault(); toggleInfo("about"); }
      else if (mod && e.shiftKey && k === "m") { e.preventDefault(); toggleInfo("members"); }
      else if (mod && e.shiftKey && k === "b" && !inEditor) { e.preventDefault(); toggleInfo("pinned"); } // in the editor ⌘⇧B is blockquote
      else if (mod && e.key === "\\") { e.preventDefault(); toggleSidebar(); }
      else if (e.key === "Escape" && !useSearch.getState().open && useUi.getState().rightPanel !== "none" && !(document.activeElement instanceof HTMLTextAreaElement)) { setRightPanel("none"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleInfo, toggleSidebar, setRightPanel, openSearch]);

  useEffect(() => {
    // Registration is async: if the effect is torn down before it resolves (React StrictMode mounts twice
    // in dev), the cleanup would find no unlisten yet and the stale listener would stay — every drop
    // then queued each file twice.
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebview().onDragDropEvent((e) => {
      const p = e.payload;
      if (p.type === "enter" || p.type === "over") setDragging(true);
      else if (p.type === "leave") setDragging(false);
      else if (p.type === "drop") {
        setDragging(false);
        const id = useChat.getState().activeChannelId;
        if (!id || useUi.getState().view !== "channel") return;
        for (const path of p.paths) queuePath(id, path);
      }
    }).then((u) => { if (cancelled) u(); else unlisten = u; }).catch(() => null);
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  const typingNames = Object.entries(typing ?? {}).filter(([uid, until]) => Number(uid) !== me && until > Date.now()).map(([uid]) => userLabel(users[Number(uid)]));
  const muted = !!channel?.preferences?.notification_mute;
  const toggleMute = async () => {
    if (!channel) return;
    const next = !muted;
    updateChannel(channel.channel_id, { preferences: { ...channel.preferences, notification_mute: next } });
    await chat.setPreference(channel.channel_id, { notification_mute: next }).catch(() => updateChannel(channel.channel_id, { preferences: { ...channel.preferences, notification_mute: !next } }));
  };

  const channelView = (
    <main
      className="flex-1 min-w-0 h-full flex flex-col relative"
      data-main-area
      // Any click back in the conversation (messages, composer, tabs) closes the info panel; the header keeps
      // its own toggle buttons, so clicks there are left alone.
      onPointerDownCapture={(e) => { if (panel !== "none" && !(e.target as HTMLElement).closest("header")) setRightPanel("none"); }}
    >
      {isMobileOS && <div className="shrink-0" style={{ height: "env(safe-area-inset-top)" }} />}
      {/* Single-column layout has no sidebar above the traffic lights, so leave a strip for them. */}
      {compact && isMacDesktop && <div className="titlebar-drag h-7 shrink-0" />}
      {!compact && <ChannelTabs />}
      <header className="titlebar-drag h-[52px] shrink-0 flex items-center gap-3 px-5 max-[720px]:gap-1 max-[720px]:pl-1.5 max-[720px]:pr-2 border-b border-[var(--border)]">
        {compact && <button type="button" aria-label="채팅 목록" onClick={() => setMobileScreen("list")} className="titlebar-nodrag flex h-8 w-6 shrink-0 items-center justify-center rounded-md hover:bg-[var(--hover)]"><ChevronLeft className="h-5 w-5" /></button>}
        {channel ? (
          <>
            {/* Left: name + purpose. Clicking them opens the info panel (as the docs promise); the header's free space still drags the window. */}
            <div role="button" tabIndex={0} title="채널 정보 (⌘I)" onClick={() => openInfo("about")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInfo("about"); } }} className="titlebar-nodrag min-w-0 flex-1 text-left py-1 cursor-pointer rounded-md -mx-1.5 px-1.5 hover:bg-[var(--hover)]">
              <div className="font-semibold text-[15px] max-[720px]:text-[13.5px] truncate flex items-center gap-1.5">
                {channelLabel(channel, users, me)}
                <span role="button" tabIndex={0} className="titlebar-nodrag cursor-pointer text-[var(--fg-muted)] hover:text-yellow-500" title={channel.is_star ? "즐겨찾기 해제" : "즐겨찾기"} onClick={(e) => { e.stopPropagation(); void toggleStar(channel.channel_id); }}>
                  <Star className={clsx("w-4 h-4", channel.is_star && "fill-yellow-400 text-yellow-400")} />
                </span>
                {muted && <BellOff className="w-3.5 h-3.5 text-[var(--fg-muted)]" />}
                {channel.encrypted && <span className="text-[11px] font-normal text-[var(--fg-muted)]">암호화 채널 · 미지원</span>}
              </div>
              {channel.purpose && <div className="text-[12px] text-[var(--fg-muted)] truncate">{channel.purpose}</div>}
            </div>
            {/* Right: four labelled tools, nothing else. */}
            <div className="titlebar-nodrag flex items-center gap-1">
              <button type="button" onClick={() => openSearch()} title="메시지 검색 (⌘K)" className={clsx("inline-flex items-center gap-1.5 h-8 rounded-md px-2.5 text-[12.5px] border transition-colors", searchOpen ? "bg-[var(--accent)]/12 text-[var(--accent)] border-transparent" : "text-[var(--fg-muted)] border-[var(--border)] hover:bg-[var(--hover)] hover:text-[var(--fg)]")}>
                <Search className="w-4 h-4" /><span className="max-[720px]:hidden">검색</span>
              </button>
              <button type="button" onClick={() => toggleInfo("members")} title="멤버 (⌘⇧M)" className={clsx("inline-flex items-center gap-1.5 h-8 rounded-md px-2.5 text-[12.5px] border transition-colors", panel === "info" && infoTab === "members" ? "bg-[var(--accent)]/12 text-[var(--accent)] border-transparent" : "text-[var(--fg-muted)] border-[var(--border)] hover:bg-[var(--hover)] hover:text-[var(--fg)]")}>
                <Users className="w-4 h-4" /> {channel.total_member_count}
              </button>
              <button type="button" onClick={() => toggleInfo(panel === "info" && infoTab !== "members" ? infoTab : "about")} title="채널 정보: 정보·고정·파일·링크·투표 (⌘I)" className={clsx("inline-flex items-center gap-1.5 h-8 rounded-md px-2.5 text-[12.5px] border transition-colors", panel === "info" && infoTab !== "members" ? "bg-[var(--accent)]/12 text-[var(--accent)] border-transparent" : "text-[var(--fg-muted)] border-[var(--border)] hover:bg-[var(--hover)] hover:text-[var(--fg)]")}>
                <Info className="w-4 h-4" /><span className="max-[720px]:hidden">정보</span>
              </button>
              {!isPopout && !isMobileOS && <IconButton label="새 창에서 열기" onClick={() => { void openChatWindow(channel.channel_id, channelLabel(channel, users, me)); setRightPanel("none"); if (compact) setMobileScreen("list"); useChat.setState({ activeChannelId: null }); /* the chat lives in the other window now */ }}><AppWindow /></IconButton>}
              <IconButton label={muted ? "알림 켜기" : "알림 끄기"} onClick={() => void toggleMute()}>{muted ? <BellOff /> : <Bell />}</IconButton>
            </div>
          </>
        ) : null}
      </header>
      <StatusBanner />
      <ToastHost />
      {error && <div className="px-5 py-2 text-[13px] text-red-500 border-b border-[var(--border)]">{error}</div>}
      {!ready ? (
        <div className="flex-1 flex items-center justify-center text-[var(--fg-muted)]">채널을 불러오는 중…</div>
      ) : activeId && channel ? (
        <>
          <MessageList channelId={activeId} />
          <div className="h-5 px-5 text-[12px] text-[var(--fg-muted)]">{typingNames.length > 0 && `${typingNames.join(", ")} 님이 입력 중…`}</div>
          <UploadQueue channelId={activeId} />
          <div className="safe-bottom"><Composer channelId={activeId} placeholder={`${channelLabel(channel, users, me)}에 메시지 보내기`} /></div>
        </>
      ) : (
        <MovedNotice />
      )}
      {dragging && activeId && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--accent)]/10 border-4 border-dashed border-[var(--accent)] pointer-events-none">
          <div className="rounded-lg bg-[var(--bg)] px-5 py-3 text-[14px] shadow-lg">여기에 놓으면 첨부됩니다 (메시지와 함께 전송)</div>
        </div>
      )}

    </main>
  );

  const pages = view === "collection" ? <Collection /> : view === "inbox" ? <Inbox /> : view === "browse" ? <Browse /> : view === "manage" ? <Manage /> : view === "integrations" ? <Integrations /> : view === "archive" ? <ArchiveViewer /> : view === "about" ? <About /> : channelView;

  // Single-column layout (narrow window or phone): the chat list or one chat/page at a time, each with a way back.
  if (compact) {
    const onList = view === "channel" && mobileScreen === "list";
    return (
      <div className="h-full flex flex-col">
        {!isMobileOS && <UpdateBanner />}
        <div className="flex-1 min-h-0 flex">
          {onList ? (
            <div key="list" className="anim-fade flex-1 min-w-0 min-h-0 flex"><Sidebar /></div>
          ) : view !== "channel" ? (
            <div key={view} className="anim-view flex-1 min-w-0 min-h-0 flex flex-col">
              {isMobileOS && <div className="shrink-0" style={{ height: "env(safe-area-inset-top)" }} />}
              {isMacDesktop && <div className="titlebar-drag h-7 shrink-0" />}
              <div className="titlebar-drag flex h-11 shrink-0 items-center border-b border-[var(--border)] px-1">
                <button type="button" onClick={() => { setView("channel"); setMobileScreen("list"); }} className="titlebar-nodrag flex h-8 items-center gap-0 rounded-md pl-0.5 pr-2 text-[13px] hover:bg-[var(--hover)]"><ChevronLeft className="h-5 w-5" />목록</button>
              </div>
              <div className="flex-1 min-h-0 flex">{pages}</div>
            </div>
          ) : (
            <div key={`channel:${activeId}`} className="anim-view flex-1 min-w-0 min-h-0 flex">{channelView}</div>
          )}
          {view === "channel" && mobileScreen === "chat" && panel === "info" && activeId && (
            <div className="anim-slide-r fixed inset-0 z-40 flex bg-[var(--bg)]" style={{ paddingTop: isMacDesktop ? 28 : "env(safe-area-inset-top)" }}>
              <ChannelInfoPanel channelId={activeId} />
            </div>
          )}
          <SearchPalette />
          <UserCardHost />
          <ImageViewerHost />
      {!isPopout && <WhatsNew />}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <UpdateBanner />
      <div className="flex-1 min-h-0 flex relative">
      <Sidebar />
      <div key={view === "channel" ? `channel:${activeId}` : view} data-content-area className="anim-view flex-1 min-w-0 min-h-0 flex">{view === "collection" ? <Collection /> : view === "inbox" ? <Inbox /> : view === "browse" ? <Browse /> : view === "manage" ? <Manage /> : view === "integrations" ? <Integrations /> : view === "archive" ? <ArchiveViewer /> : view === "about" ? <About /> : channelView}</div>
      {/* Narrow window: the panel floats over the conversation instead of squeezing it to a sliver. */}
      {view === "channel" && panel === "info" && activeId && (
        <div className={clsx("anim-slide-r shrink-0 h-full flex", panelOverlay && "absolute right-0 inset-y-0 z-30 shadow-[-8px_0_24px_rgba(0,0,0,.14)]")}><ChannelInfoPanel channelId={activeId} /></div>
      )}
      <SearchPalette />
      <UserCardHost />
      <ImageViewerHost />
      {!isPopout && <WhatsNew />}
      </div>
    </div>
  );
}

/** Main window with no chat selected: if the last one was moved to the separate window, say so and offer the way back. */
function MovedNotice() {
  const popped = usePopouts((s) => s.current);
  const ch = useChat((s) => (popped ? s.channels[popped] : undefined));
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.info?.user_id);
  const selectChannel = useChat((s) => s.selectChannel);
  const setView = useUi((s) => s.setView);
  if (!popped || !ch) return <div className="flex-1 flex items-center justify-center text-[var(--fg-muted)]">채널을 선택하세요</div>;
  const label = channelLabel(ch, users, me);
  const bringBack = async () => {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    await (await WebviewWindow.getByLabel(POPOUT_LABEL))?.close().catch(() => undefined);
    usePopouts.getState().set(null);
    setView("channel");
    void selectChannel(ch.channel_id);
  };
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <AppWindow className="h-8 w-8 text-[var(--fg-muted)]" />
      <div className="text-[14px]"><b>{label}</b> 채널은 새 창에서 열려 있습니다</div>
      <div className="flex gap-2">
        <button type="button" className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[13px] hover:bg-[var(--hover)]" onClick={() => void openChatWindow(ch.channel_id, label)}>새 창 보기</button>
        <button type="button" className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-[var(--accent-fg)]" onClick={() => void bringBack()}>이 창으로 가져오기</button>
      </div>
    </div>
  );
}
