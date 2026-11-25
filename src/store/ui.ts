import { create } from "zustand";
import type { Post } from "../api/types";
import { DEFAULT_SIDEBAR_PREFS, type ChannelGroup, type SectionSort, type SidebarPrefs } from "../lib/sidebarOrder";
import { DEFAULT_APPEARANCE, type Appearance } from "../lib/theme";
import { FILE_KINDS, type FileKind } from "../lib/fileKinds";

export type RightPanel = "none" | "info";
export type InfoTab = "about" | "members" | "pinned" | "files" | "links" | "votes" | "bookmarks" | "threads" | "reminders" | "scheduled";
/** Second-level groups of the channel info panel. */
export const BOARD_TABS: InfoTab[] = ["pinned", "files", "links", "votes"];
export const MINE_TABS: InfoTab[] = ["bookmarks", "threads", "reminders", "scheduled"];
export type MainView = "channel" | "collection" | "inbox" | "browse" | "manage" | "integrations" | "archive" | "about";
/** System notifications: off, silent (banner only), or with sound. */
/** Client-only extension of the server's per-channel levels: also notify for every thread reply, even in threads I am not part of. */
export interface ReplyNotify {
  /** Default for channels without their own choice. */
  global: boolean;
  /** Per-channel choice (true = all replies, false = server level only); absent follows `global`. */
  channels: Record<number, boolean>;
  /** Threads (root post ids) whose replies never notify. */
  mutedThreads: Record<number, boolean>;
}
export interface DesktopNotify { mode: "off" | "silent" | "sound"; sound: string; badge: boolean }
export type ManageTab = "sections" | "groups" | "hidden" | "notifications" | "appearance";

interface UiState {
  sidebarCollapsed: boolean;
  /** Sidebar section keys (starred/channels/dms/bots) the user folded. */
  sectionsCollapsed: Record<string, boolean>;
  toggleSection: (key: string) => void;
  /** Discord-style folders in the collapsed rail: which sections are folded (device-local). */
  railFolded: Record<string, boolean>;
  toggleRailFold: (key: string) => void;
  /** Channel ordering / visibility (local only: the server has no sort preference). */
  sidebar: SidebarPrefs;
  setSectionSort: (section: string, sort: SectionSort) => void;
  setManualOrder: (section: string, ids: number[]) => void;
  togglePinnedTop: (channelId: number) => void;
  setUnreadFirst: (v: boolean) => void;
  setLocalHidden: (channelId: number, hidden: boolean) => void;
  setShowUnreadSection: (v: boolean) => void;
  /** Custom groups. */
  addGroup: (name: string) => ChannelGroup;
  renameGroup: (id: string, name: string) => void;
  removeGroup: (id: string) => void;
  setGroupOrder: (ids: string[]) => void;
  /** Moves a channel into a group (or out of every group with null). */
  assignGroup: (channelId: number, groupId: string | null) => void;
  setGroupColor: (id: string, color: string | undefined) => void;
  /** User-editable file-kind chips for search/board filters (synced). */
  fileKinds: FileKind[];
  setFileKinds: (kinds: FileKind[]) => void;
  /** Look & feel (synced): colour mode, theme preset, accent, font scale. */
  appearance: Appearance;
  setAppearance: (patch: Partial<Appearance>) => void;
  /** System notifications for new messages (device-local). */
  desktopNotify: DesktopNotify;
  setDesktopNotify: (patch: Partial<DesktopNotify>) => void;
  replyNotify: ReplyNotify;
  setReplyNotifyGlobal: (on: boolean) => void;
  setChannelReplyNotify: (channelId: number, on: boolean | undefined) => void;
  toggleThreadMute: (threadId: number) => void;
  /** Kakao-style "안 읽음 N" next to my messages (device-local; also needs the server's allow_read_status). */
  readReceipts: boolean;
  setReadReceipts: (v: boolean) => void;
  /** Experimental browser-style channel tabs above the chat (device-local). */
  channelTabs: { enabled: boolean; open: number[] };
  setChannelTabsEnabled: (v: boolean) => void;
  openTab: (channelId: number) => void;
  closeTab: (channelId: number) => void;
  setTabOrder: (ids: number[]) => void;
  /** Replaces the whole prefs object (used by server sync). */
  replaceSidebarPrefs: (prefs: SidebarPrefs) => void;
  /** Applies a settings snapshot pulled from the server. */
  applySynced: (s: { sidebar: SidebarPrefs; sectionsCollapsed: Record<string, boolean>; threadsExpanded: boolean; appearance?: Appearance; fileKinds?: FileKind[] }) => void;
  rightPanel: RightPanel;
  view: MainView;
  /** Post being edited in the composer, if any. */
  editingPost: Post | null;
  /** Which archive type the archive viewer opens on (set by the channel directory). */
  archiveType: "public" | "private" | "anonymous" | "chatbot";
  setArchiveType: (t: "public" | "private" | "anonymous" | "chatbot") => void;
  /** Show thread replies under messages by default. */
  threadsExpanded: boolean;
  /** Per-thread override (true = collapsed when default is expanded, or expanded when default is collapsed). */
  threadOverrides: Record<number, boolean>;
  setThreadsExpanded: (v: boolean) => void;
  toggleThread: (threadId: number) => void;
  isThreadOpen: (threadId: number) => boolean;
  toggleSidebar: () => void;
  setRightPanel: (p: RightPanel) => void;
  infoTab: InfoTab;
  /** Opens the channel info panel on a tab; the same tab again closes it. */
  openInfo: (tab?: InfoTab) => void;
  toggleInfo: (tab: InfoTab) => void;
  setView: (v: MainView) => void;
  /** Single-column layout only: which screen is showing while `view` is the channel view. */
  mobileScreen: "list" | "chat";
  setMobileScreen: (s: "list" | "chat") => void;
  /** Sidebar management page state: tab, which section/group to show, and a channel waiting for a new group. */
  manageTab: ManageTab;
  manageSection: string;
  managePendingChannel: number | null;
  openManage: (tab: ManageTab, opts?: { section?: string; pendingChannel?: number }) => void;
  setEditingPost: (p: Post | null) => void;
}

const KEY = "chat-viewer:ui";
type Persisted = Pick<UiState, "sidebarCollapsed" | "rightPanel" | "threadsExpanded" | "threadOverrides" | "sectionsCollapsed" | "sidebar" | "appearance" | "channelTabs" | "railFolded" | "fileKinds" | "desktopNotify" | "replyNotify" | "readReceipts">;
const load = (): Partial<Persisted> => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; }
};
const persist = (s: Persisted) => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
};

const snapshot = (s: UiState): Persisted => ({ sidebarCollapsed: s.sidebarCollapsed, rightPanel: s.rightPanel, threadsExpanded: s.threadsExpanded, threadOverrides: s.threadOverrides, sectionsCollapsed: s.sectionsCollapsed, sidebar: s.sidebar, appearance: s.appearance, channelTabs: s.channelTabs, railFolded: s.railFolded, fileKinds: s.fileKinds, desktopNotify: s.desktopNotify, replyNotify: s.replyNotify, readReceipts: s.readReceipts });
const loadDesktopNotify = (): DesktopNotify => {
  const saved = (load().desktopNotify ?? {}) as Partial<DesktopNotify> & { enabled?: boolean };
  // Older builds stored `enabled`; map it onto the three-way mode.
  const mode: DesktopNotify["mode"] = saved.mode ?? (saved.enabled === false ? "off" : saved.sound === "" ? "silent" : "sound");
  return { mode, sound: saved.sound || "default", badge: saved.badge ?? true };
};
const loadSidebar = (): SidebarPrefs => {
  const saved = load().sidebar;
  return {
    ...DEFAULT_SIDEBAR_PREFS,
    ...(saved ?? {}),
    sectionSort: { ...DEFAULT_SIDEBAR_PREFS.sectionSort, ...(saved?.sectionSort ?? {}) },
    manualOrder: { ...DEFAULT_SIDEBAR_PREFS.manualOrder, ...(saved?.manualOrder ?? {}) },
  };
};

export const useUi = create<UiState>((set, get) => ({
  sidebarCollapsed: load().sidebarCollapsed ?? false,
  rightPanel: "none", // never restored: the panel is a transient view of one conversation
  infoTab: "about",
  view: "channel",
  editingPost: null,
  archiveType: "private",
  setArchiveType: (archiveType) => set({ archiveType }),
  threadsExpanded: load().threadsExpanded ?? true,
  threadOverrides: load().threadOverrides ?? {},
  sectionsCollapsed: load().sectionsCollapsed ?? {},
  railFolded: load().railFolded ?? {},
  toggleRailFold: (key) => { set((s) => { const o = { ...s.railFolded }; if (o[key]) delete o[key]; else o[key] = true; return { railFolded: o }; }); persist(snapshot(get())); },
  sidebar: loadSidebar(),
  setSectionSort: (section, sort) => { set((s) => ({ sidebar: { ...s.sidebar, sectionSort: { ...s.sidebar.sectionSort, [section]: sort } } })); persist(snapshot(get())); },
  setManualOrder: (section, ids) => { set((s) => ({ sidebar: { ...s.sidebar, manualOrder: { ...s.sidebar.manualOrder, [section]: ids } } })); persist(snapshot(get())); },
  togglePinnedTop: (channelId) => {
    set((s) => { const p = s.sidebar.pinnedTop; return { sidebar: { ...s.sidebar, pinnedTop: p.includes(channelId) ? p.filter((id) => id !== channelId) : [...p, channelId] } }; });
    persist(snapshot(get()));
  },
  setUnreadFirst: (unreadFirst) => { set((s) => ({ sidebar: { ...s.sidebar, unreadFirst } })); persist(snapshot(get())); },
  setLocalHidden: (channelId, hidden) => {
    set((s) => { const h = s.sidebar.localHidden.filter((id) => id !== channelId); return { sidebar: { ...s.sidebar, localHidden: hidden ? [...h, channelId] : h } }; });
    persist(snapshot(get()));
  },
  setShowUnreadSection: (showUnreadSection) => { set((s) => ({ sidebar: { ...s.sidebar, showUnreadSection } })); persist(snapshot(get())); },
  addGroup: (name) => {
    const g: ChannelGroup = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || "새 그룹", channelIds: [] };
    set((s) => ({ sidebar: { ...s.sidebar, groups: [...s.sidebar.groups, g] } }));
    persist(snapshot(get()));
    return g;
  },
  renameGroup: (id, name) => { set((s) => ({ sidebar: { ...s.sidebar, groups: s.sidebar.groups.map((g) => (g.id === id ? { ...g, name: name.trim() || g.name } : g)) } })); persist(snapshot(get())); },
  removeGroup: (id) => {
    set((s) => {
      const { [`g:${id}`]: _s, ...sectionSort } = s.sidebar.sectionSort;
      const { [`g:${id}`]: _m, ...manualOrder } = s.sidebar.manualOrder;
      void _s; void _m;
      return { sidebar: { ...s.sidebar, groups: s.sidebar.groups.filter((g) => g.id !== id), sectionSort, manualOrder } };
    });
    persist(snapshot(get()));
  },
  setGroupOrder: (ids) => {
    set((s) => { const by = new Map(s.sidebar.groups.map((g) => [g.id, g])); const ordered = ids.map((id) => by.get(id)).filter((g): g is ChannelGroup => !!g); const rest = s.sidebar.groups.filter((g) => !ids.includes(g.id)); return { sidebar: { ...s.sidebar, groups: [...ordered, ...rest] } }; });
    persist(snapshot(get()));
  },
  assignGroup: (channelId, groupId) => {
    set((s) => ({ sidebar: { ...s.sidebar, groups: s.sidebar.groups.map((g) => ({ ...g, channelIds: g.id === groupId ? (g.channelIds.includes(channelId) ? g.channelIds : [...g.channelIds, channelId]) : g.channelIds.filter((id) => id !== channelId) })) } }));
    persist(snapshot(get()));
  },
  desktopNotify: loadDesktopNotify(),
  setDesktopNotify: (patch) => { set((s) => ({ desktopNotify: { ...s.desktopNotify, ...patch } })); persist(snapshot(get())); },
  replyNotify: { global: false, channels: {}, mutedThreads: {}, ...(load().replyNotify ?? {}) },
  setReplyNotifyGlobal: (global) => { set((s) => ({ replyNotify: { ...s.replyNotify, global } })); persist(snapshot(get())); },
  setChannelReplyNotify: (channelId, on) => {
    set((s) => {
      const channels = { ...s.replyNotify.channels };
      if (on === undefined) delete channels[channelId]; else channels[channelId] = on;
      return { replyNotify: { ...s.replyNotify, channels } };
    });
    persist(snapshot(get()));
  },
  toggleThreadMute: (threadId) => {
    set((s) => {
      const mutedThreads = { ...s.replyNotify.mutedThreads };
      if (mutedThreads[threadId]) delete mutedThreads[threadId]; else mutedThreads[threadId] = true;
      return { replyNotify: { ...s.replyNotify, mutedThreads } };
    });
    persist(snapshot(get()));
  },
  channelTabs: { enabled: false, open: [], ...(load().channelTabs ?? {}) },
  setChannelTabsEnabled: (enabled) => { set((s) => ({ channelTabs: { ...s.channelTabs, enabled } })); persist(snapshot(get())); },
  readReceipts: load().readReceipts ?? true,
  setReadReceipts: (readReceipts) => { set({ readReceipts }); persist(snapshot(get())); },
  openTab: (channelId) => {
    set((s) => {
      if (!s.channelTabs.enabled) return {};
      const open = s.channelTabs.open.includes(channelId) ? s.channelTabs.open : [...s.channelTabs.open, channelId].slice(-14); // oldest tab drops off past 14
      return { channelTabs: { ...s.channelTabs, open } };
    });
    persist(snapshot(get()));
  },
  closeTab: (channelId) => { set((s) => ({ channelTabs: { ...s.channelTabs, open: s.channelTabs.open.filter((id) => id !== channelId) } })); persist(snapshot(get())); },
  setTabOrder: (ids) => { set((s) => ({ channelTabs: { ...s.channelTabs, open: ids } })); persist(snapshot(get())); },
  setGroupColor: (id, color) => { set((s) => ({ sidebar: { ...s.sidebar, groups: s.sidebar.groups.map((g) => (g.id === id ? { ...g, color } : g)) } })); persist(snapshot(get())); },
  fileKinds: load().fileKinds ?? FILE_KINDS,
  setFileKinds: (fileKinds) => { set({ fileKinds }); persist(snapshot(get())); },
  appearance: { ...DEFAULT_APPEARANCE, ...(load().appearance ?? {}) },
  setAppearance: (patch) => { set((s) => ({ appearance: { ...s.appearance, ...patch } })); persist(snapshot(get())); },
  replaceSidebarPrefs: (prefs) => { set({ sidebar: { ...DEFAULT_SIDEBAR_PREFS, ...prefs } }); persist(snapshot(get())); },
  applySynced: (sy) => { set({ sidebar: { ...DEFAULT_SIDEBAR_PREFS, ...sy.sidebar }, sectionsCollapsed: sy.sectionsCollapsed ?? {}, threadsExpanded: sy.threadsExpanded ?? true, appearance: { ...DEFAULT_APPEARANCE, ...(sy.appearance ?? {}) }, fileKinds: sy.fileKinds ?? get().fileKinds }); persist(snapshot(get())); },
  toggleSection: (key) => {
    set((s) => { const o = { ...s.sectionsCollapsed }; if (o[key]) delete o[key]; else o[key] = true; return { sectionsCollapsed: o }; });
    persist(snapshot(get()));
  },
  toggleSidebar: () => { set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })); persist(snapshot(get())); },
  setRightPanel: (rightPanel) => { set({ rightPanel }); persist(snapshot(get())); },
  openInfo: (tab) => { set((s) => ({ rightPanel: "info", infoTab: tab ?? s.infoTab })); persist(snapshot(get())); },
  toggleInfo: (tab) => { set((s) => (s.rightPanel === "info" && s.infoTab === tab ? { rightPanel: "none" } : { rightPanel: "info", infoTab: tab })); persist(snapshot(get())); },
  setThreadsExpanded: (threadsExpanded) => { set({ threadsExpanded, threadOverrides: {} }); persist(snapshot(get())); },
  toggleThread: (threadId) => {
    set((s) => { const o = { ...s.threadOverrides }; if (o[threadId]) delete o[threadId]; else o[threadId] = true; return { threadOverrides: o }; });
    persist(snapshot(get()));
  },
  isThreadOpen: (threadId) => { const s = get(); const overridden = !!s.threadOverrides[threadId]; return s.threadsExpanded ? !overridden : overridden; },
  // Opening the channel view is always a deliberate "go to a chat" (sidebar row, inbox, search jump), so it also leaves the list screen.
  setView: (view) => set((s) => ({ view, rightPanel: view === "channel" ? s.rightPanel : "none", mobileScreen: view === "channel" ? "chat" : s.mobileScreen })),
  mobileScreen: "list",
  setMobileScreen: (mobileScreen) => set((s) => ({ mobileScreen, rightPanel: mobileScreen === "list" ? "none" : s.rightPanel })),
  manageTab: "sections",
  manageSection: "channels",
  managePendingChannel: null,
  openManage: (manageTab, opts) => set({ view: "manage", rightPanel: "none", manageTab, manageSection: opts?.section ?? get().manageSection, managePendingChannel: opts?.pendingChannel ?? null }),
  setEditingPost: (editingPost) => set({ editingPost }),
}));
