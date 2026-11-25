import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { chat } from "../api/client";
import type { Post } from "../api/types";
import { useChat } from "./chat";
import { isSettingsPost } from "../lib/settingsFile";

export interface IndexStatus { posts: number; channels_done: number; channels_total: number }
interface ChannelState { channel_id: number; oldest_post_id: number | null; newest_post_id: number | null; complete: boolean }
export type SearchScope = "all" | "message" | "file";
export interface LocalSearchQuery {
  query: string; channelIds?: number[]; from?: number | null; after?: number | null; before?: number | null;
  filesOnly?: boolean;
  /** all = message + file names + vote choices/link titles; message = text only; file = file names only */
  scope?: SearchScope;
  /** file kinds (src/lib/fileKinds.ts) and explicit extensions; either implies filesOnly */
  kinds?: string[]; exts?: string[];
  offset?: number; limit?: number;
}

export const localIndex = {
  upsert: (posts: Post[]) => {
    const real = posts.filter((p) => p.post_id > 0 && !p._pending && !isSettingsPost(p));
    return real.length ? invoke<number>("index_upsert", { posts: real }).catch(() => 0) : Promise.resolve(0);
  },
  delete: (postId: number) => invoke<void>("index_delete", { postId }).catch(() => undefined),
  search: (q: LocalSearchQuery) =>
    invoke<{ total: number; items: Post[] }>("index_search", {
      query: {
        query: q.query, channel_ids: q.channelIds ?? [], from: q.from ?? null, after: q.after ?? null, before: q.before ?? null,
        files_only: !!q.filesOnly, scope: q.scope ?? "all", kinds: q.kinds ?? [], exts: q.exts ?? [], offset: q.offset ?? 0, limit: q.limit ?? 25,
      },
    }),
  status: (channelsTotal: number) => invoke<IndexStatus>("index_status", { channelsTotal }),
  channelState: (channelId: number) => invoke<ChannelState>("index_channel_state", { channelId }),
  setChannelState: (s: ChannelState) => invoke<void>("index_set_channel_state", { channelState: s }),
};

interface IndexerState {
  running: boolean;
  status: IndexStatus | null;
  /** Channel currently being backfilled (for the progress label). */
  currentChannelId: number | null;
  start: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

const PAGE = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Background indexer: walks each joined channel's history once (oldest-first cursor persisted in
 * SQLite), then catches up with anything newer than the last indexed post. Realtime events keep
 * the index current afterwards (see realtime/socket.ts).
 */
export const useIndexer = create<IndexerState>((set, get) => ({
  running: false,
  status: null,
  currentChannelId: null,

  refreshStatus: async () => {
    const total = Object.values(useChat.getState().channels).filter((c) => c.is_joined).length;
    try { set({ status: await localIndex.status(total) }); } catch { /* ignore */ }
  },

  start: async () => {
    if (get().running) return;
    set({ running: true });
    try {
      await get().refreshStatus();
      const channels = Object.values(useChat.getState().channels).filter((c) => c.is_joined).sort((a, b) => b.last_post_at - a.last_post_at);
      for (const ch of channels) {
        const state = await localIndex.channelState(ch.channel_id).catch(() => null);
        if (!state) continue;
        set({ currentChannelId: ch.channel_id });
        let { oldest_post_id, newest_post_id, complete } = state;

        // 1) catch up on newer posts since the last indexed one
        if (newest_post_id && ch.last_post_at > 0) {
          let cursor = newest_post_id;
          for (let i = 0; i < 50; i++) {
            const newer = await chat.postsAfter(ch.channel_id, cursor, PAGE).catch(() => [] as Post[]);
            const fresh = newer.filter((p) => p.post_id > cursor);
            if (!fresh.length) break;
            await localIndex.upsert(fresh);
            cursor = Math.max(...fresh.map((p) => p.post_id));
            newest_post_id = cursor;
            await localIndex.setChannelState({ channel_id: ch.channel_id, oldest_post_id, newest_post_id, complete });
            if (fresh.length < PAGE) break;
            await sleep(80);
          }
        }

        // 2) backfill older history until exhausted
        if (!complete) {
          for (let i = 0; i < 2000; i++) {
            const page = oldest_post_id
              ? await chat.listPosts(ch.channel_id, { beforePostId: oldest_post_id, prevCount: PAGE }).catch(() => null)
              : await chat.listPosts(ch.channel_id, { prevCount: PAGE }).catch(() => null);
            if (!page) break;
            const older = oldest_post_id ? page.filter((p) => p.post_id < oldest_post_id!) : page;
            if (older.length) await localIndex.upsert(older);
            const ids = page.map((p) => p.post_id);
            oldest_post_id = ids.length ? Math.min(...ids, oldest_post_id ?? Infinity) : oldest_post_id;
            newest_post_id = Math.max(newest_post_id ?? 0, ...ids, 0) || newest_post_id;
            complete = older.length < PAGE - 1;
            await localIndex.setChannelState({ channel_id: ch.channel_id, oldest_post_id, newest_post_id, complete });
            if (complete) break;
            await sleep(80);
          }
        }
        await get().refreshStatus();
      }
    } finally {
      set({ running: false, currentChannelId: null });
      await get().refreshStatus();
    }
  },
}));
