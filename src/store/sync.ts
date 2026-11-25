import { create } from "zustand";
import { chat, files } from "../api/client";
import type { Post } from "../api/types";
import { useChat } from "./chat";
import { useUi } from "./ui";
import { SETTINGS_FILE_NAME, isSettingsSnippet } from "../lib/settingsFile";
import { DEFAULT_SIDEBAR_PREFS, type SidebarPrefs } from "../lib/sidebarOrder";
import { DEFAULT_APPEARANCE, type Appearance } from "../lib/theme";
import type { FileKind } from "../lib/fileKinds";

/** The slice of ui state that follows the user across installs. Device-level bits (collapsed sidebar, open panel) stay local. */
export interface SyncedSettings {
  sidebar: SidebarPrefs;
  sectionsCollapsed: Record<string, boolean>;
  threadsExpanded: boolean;
  appearance?: Appearance;
  fileKinds?: FileKind[];
}
interface Envelope { v: 1; updated_at: number; settings: SyncedSettings }

const META_KEY = "chat-viewer:sync";
interface Meta { postId: number | null; updatedAt: number }
const loadMeta = (): Meta => { try { return { postId: null, updatedAt: 0, ...JSON.parse(localStorage.getItem(META_KEY) ?? "{}") }; } catch { return { postId: null, updatedAt: 0 }; } };
const saveMeta = (m: Meta) => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* ignore */ } };

const pick = (): SyncedSettings => { const u = useUi.getState(); return { sidebar: u.sidebar, sectionsCollapsed: u.sectionsCollapsed, threadsExpanded: u.threadsExpanded, appearance: u.appearance, fileKinds: u.fileKinds }; };
/**
 * The file starts with a comment line on purpose: the server sniffs the content type, and a file that
 * begins with `{` is classified as JSON (a plain attachment) instead of text (a snippet that can be updated).
 */
const HEADER = "# Chat Viewer settings — managed automatically, do not edit";
const serialize = (updatedAt: number) => `${HEADER}\n${JSON.stringify({ v: 1, updated_at: updatedAt, settings: pick() } satisfies Envelope, null, 2)}\n`;
const parse = (text: string): Envelope => JSON.parse(text.split("\n").filter((l) => !l.startsWith("#")).join("\n"));
/** A usable remote snapshot has at least the sidebar block; anything else (empty/corrupt) is ignored rather than applied. */
const isUsable = (e: Envelope | null): e is Envelope =>
  !!e && e.v === 1 && typeof e.updated_at === "number" && !!e.settings && typeof e.settings === "object" && !!e.settings.sidebar && typeof e.settings.sidebar === "object" && !!e.settings.sidebar.sectionSort;
/** Local state that was never synced but differs from the defaults counts as "changed now", so it is never clobbered by a stale server copy. */
const localIsCustomized = () => JSON.stringify(pick().sidebar) !== JSON.stringify(DEFAULT_SIDEBAR_PREFS) || Object.keys(pick().sectionsCollapsed).length > 0 || pick().threadsExpanded !== true || JSON.stringify(pick().appearance) !== JSON.stringify(DEFAULT_APPEARANCE);

interface SyncState {
  postId: number | null;
  lastSyncAt: number | null;
  status: "idle" | "syncing" | "error" | "off";
  error: string | null;
  /** Call once after the channel list is loaded: pulls the server copy, then watches for local changes. */
  start: () => Promise<void>;
  /** Pushes the current settings now (used by the "지금 동기화" button). */
  syncNow: () => Promise<void>;
}

let started = false;
let applying = false;
/** At most one settings post is created per app session, so a persistent server error cannot litter 내 공간. */
let createdThisSession = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let localUpdatedAt = loadMeta().updatedAt;

const mySpaceId = () => Object.values(useChat.getState().channels).find((c) => c.type === "synobot")?.channel_id ?? null;

/** Locates the settings snippet in 내 공간 (newest first). */
async function findPost(channelId: number): Promise<Post | null> {
  const res = await chat.search({ keyword: "", in: [channelId], post_type: ["file"], offset: 0, limit: 50 });
  const hits = res.search_results.filter(isSettingsSnippet).sort((a, b) => b.create_at - a.create_at);
  return hits[0] ?? null;
}

async function createPost(channelId: number): Promise<number> {
  if (createdThisSession) throw new Error("설정 파일을 이미 만들었지만 갱신할 수 없습니다 (내 공간을 확인하세요)");
  createdThisSession = true;
  const text = serialize(localUpdatedAt || Date.now());
  const post = await files.upload({
    channelId,
    bytes: Array.from(new TextEncoder().encode(text)),
    fileName: SETTINGS_FILE_NAME,
    message: "Chat Viewer 설정 파일 (자동 관리) — 삭제하지 마세요",
    uploadId: "settings-sync",
  });
  return post.post_id;
}

export const useSync = create<SyncState>((set, get) => ({
  postId: loadMeta().postId,
  lastSyncAt: null,
  status: "idle",
  error: null,

  start: async () => {
    if (started) return;
    started = true;
    const channelId = mySpaceId();
    if (!channelId) { set({ status: "off", error: "내 공간 채널을 찾을 수 없습니다" }); return; }
    set({ status: "syncing", error: null });
    try {
      // 1. Find the server copy (saved id first, then by file name).
      let postId = get().postId;
      let remote: Envelope | null = null;
      const read = async (id: number) => parse(await chat.getSnippet(id));
      if (postId) { try { remote = await read(postId); } catch { postId = null; } }
      if (!postId) { const p = await findPost(channelId); if (p) { postId = p.post_id; try { remote = await read(p.post_id); } catch { remote = null; } } }
      // 2. Newer side wins. Equal, unusable or no remote → push local.
      if (!localUpdatedAt && localIsCustomized()) localUpdatedAt = Date.now();
      if (localUpdatedAt && localUpdatedAt < 1e12) localUpdatedAt = Date.now(); // not a real timestamp (early builds wrote placeholders)
      if (!isUsable(remote)) remote = null;
      if (remote && remote.updated_at > localUpdatedAt) {
        applying = true;
        try { useUi.getState().applySynced(remote.settings); } finally { applying = false; }
        localUpdatedAt = remote.updated_at;
        saveMeta({ postId, updatedAt: localUpdatedAt });
        set({ postId, lastSyncAt: Date.now(), status: "idle" });
      } else {
        if (!postId) postId = await createPost(channelId);
        else if (!remote || remote.updated_at < localUpdatedAt) await chat.setSnippet(postId, { snippet: serialize(localUpdatedAt || Date.now()) });
        saveMeta({ postId, updatedAt: localUpdatedAt });
        set({ postId, lastSyncAt: Date.now(), status: "idle" });
      }
    } catch (e) {
      set({ status: "error", error: (e as { message?: string })?.message ?? String(e) });
    }
    // 3. Debounced push on any change of the synced slice.
    useUi.subscribe((s, prev) => {
      if (applying) return;
      if (s.sidebar === prev.sidebar && s.sectionsCollapsed === prev.sectionsCollapsed && s.threadsExpanded === prev.threadsExpanded && s.appearance === prev.appearance && s.fileKinds === prev.fileKinds) return;
      localUpdatedAt = Date.now();
      saveMeta({ postId: get().postId, updatedAt: localUpdatedAt });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void get().syncNow(), 3000);
    });
  },

  syncNow: async () => {
    const channelId = mySpaceId();
    if (!channelId) return;
    set({ status: "syncing", error: null });
    try {
      let postId = get().postId;
      const text = serialize(localUpdatedAt || Date.now());
      if (postId) {
        try { await chat.setSnippet(postId, { snippet: text }); } catch { postId = null; }
      }
      if (!postId) {
        // The saved post may have been deleted: look for an existing snippet before creating a new one.
        const found = await findPost(channelId);
        if (found) { postId = found.post_id; await chat.setSnippet(postId, { snippet: text }); }
        else postId = await createPost(channelId);
      }
      saveMeta({ postId, updatedAt: localUpdatedAt });
      set({ postId, lastSyncAt: Date.now(), status: "idle" });
    } catch (e) {
      set({ status: "error", error: (e as { message?: string })?.message ?? String(e) });
    }
  },
}));
