import { create } from "zustand";
import { chat } from "../api/client";
import type { Post, ReadStatus, User } from "../api/types";
import { useChat } from "./chat";
import { useSession } from "./session";
import { useUi } from "./ui";

/**
 * Kakao-style read receipts for my own messages. The server answers `Post get_read_status` per post and never
 * pushes other people's reads, so the active channel is polled: a few of my newest posts every POLL_MS while the
 * window has focus. Read state is monotonic (a member's last_view_at covers everything older), so once my newest
 * post is read by everyone, the older ones are marked read without asking.
 */

export const POLL_MS = 10_000;
/** My newest posts of the loaded page that are worth tracking at all. */
const CANDIDATES = 30;
/** Requests per tick; the rest wait for the next one. */
const PER_TICK = 8;
const CONCURRENCY = 4;
/** After this many consecutive failures (no permission, old server) polling stops for the session. */
const MAX_FAILURES = 3;

const toIds = (list: Array<User | number> | undefined): number[] =>
  (list ?? []).map((u) => (typeof u === "number" ? u : u?.user_id)).filter((n): n is number => typeof n === "number" && Number.isFinite(n));

/** Posts of mine that can carry a receipt: top-level, delivered, not deleted. */
export const isTrackable = (p: Post, me: number | undefined): boolean =>
  !!me && p.creator_id === me && !p._pending && !p._failed && !p.delete_at && (p.type === "normal" || p.type === "file" || p.type === "sticker") && !(p.thread_id && p.thread_id !== p.post_id);

/** Receipts exist when the NAS allows them, the user wants them, and the channel has other people in it. */
export function readReceiptsEnabled(channelId: number | null | undefined): boolean {
  if (!channelId) return false;
  if (!useSession.getState().serverSetting?.allow_read_status || !useUi.getState().readReceipts) return false;
  const ch = useChat.getState().channels[channelId];
  return !!ch && ch.type !== "synobot" && !ch.encrypted;
}

interface ReadState {
  byPost: Record<number, ReadStatus>;
  /** Consecutive failed requests; polling gives up at MAX_FAILURES. */
  failures: number;
  /** Fetches the given posts (newest first, a few at a time). */
  refresh: (postIds: number[]) => Promise<void>;
  /** One polling round for a channel: picks what is still unknown or unread and asks the server. */
  tick: (channelId: number) => Promise<void>;
  /** A message of mine was just delivered: assume nobody has read it yet until the next tick says otherwise. */
  noteMyPost: (channelId: number, post: Post) => void;
}

let inflight = new Set<number>();
let ticking = false;

export const useReadStatus = create<ReadState>((set, get) => ({
  byPost: {},
  failures: 0,

  refresh: async (postIds) => {
    const todo = postIds.filter((id) => !inflight.has(id));
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      const chunk = todo.slice(i, i + CONCURRENCY);
      chunk.forEach((id) => inflight.add(id));
      await Promise.all(chunk.map(async (id) => {
        try {
          const r = await chat.getReadStatus(id);
          const status: ReadStatus = { read: toIds(r?.read_users), unread: toIds(r?.unread_users), at: Date.now() };
          set((s) => ({ byPost: { ...s.byPost, [id]: status }, failures: 0 }));
        } catch (e) {
          const failures = get().failures + 1;
          set({ failures });
          if (failures >= MAX_FAILURES) console.warn("[read-status] giving up for this session", e);
        } finally { inflight.delete(id); }
      }));
      if (get().failures >= MAX_FAILURES) break;
    }
  },

  tick: async (channelId) => {
    if (ticking || get().failures >= MAX_FAILURES || !readReceiptsEnabled(channelId)) return;
    ticking = true;
    try {
      const me = useSession.getState().info?.user_id;
      const items = useChat.getState().posts[channelId]?.items ?? [];
      // Newest first: the newest post decides the most, and it is the one the user is looking at.
      const mine = items.filter((p) => isTrackable(p, me)).slice(-CANDIDATES).reverse();
      if (!mine.length) return;
      const { byPost } = get();
      const need = mine.filter((p) => { const st = byPost[p.post_id]; return !st || st.unread.length > 0; });
      await get().refresh(need.slice(0, PER_TICK).map((p) => p.post_id));
      // Monotonic fill: everything older than my newest fully-read post is read too.
      const after = get().byPost;
      const idx = mine.findIndex((p) => after[p.post_id] && after[p.post_id].unread.length === 0);
      if (idx >= 0) {
        const patch: Record<number, ReadStatus> = {};
        for (const p of mine.slice(idx + 1)) {
          const st = after[p.post_id];
          if (!st || st.unread.length > 0) patch[p.post_id] = { read: st?.read ?? after[mine[idx].post_id].read, unread: [], at: Date.now() };
        }
        if (Object.keys(patch).length) set((s) => ({ byPost: { ...s.byPost, ...patch } }));
      }
    } finally { ticking = false; }
  },

  noteMyPost: (channelId, post) => {
    const me = useSession.getState().info?.user_id;
    if (!isTrackable(post, me) || !readReceiptsEnabled(channelId)) return;
    const ch = useChat.getState().channels[channelId];
    const members = (ch?.members ?? ch?.member_ids ?? []).filter((id) => id !== me);
    if (!members.length) return; // unknown membership: the next tick asks the server
    set((s) => (s.byPost[post.post_id] ? {} : { byPost: { ...s.byPost, [post.post_id]: { read: [], unread: members, at: Date.now() } } }));
  },
}));

/** Asks for a fresh round soon (used when something suggests reads changed: my new post, a channel.view event). */
let bumpTimer: ReturnType<typeof setTimeout> | null = null;
export function bumpReadStatus(channelId: number, delayMs = 1500) {
  if (useChat.getState().activeChannelId !== channelId) return;
  if (bumpTimer) clearTimeout(bumpTimer);
  bumpTimer = setTimeout(() => { bumpTimer = null; void useReadStatus.getState().tick(channelId); }, delayMs);
}

if (typeof window !== "undefined") {
  window.addEventListener("chat:post-created", (e) => {
    const { channelId, post } = (e as CustomEvent<{ channelId: number; post: Post }>).detail ?? {};
    if (!channelId || !post) return;
    useReadStatus.getState().noteMyPost(channelId, post);
    if (post.creator_id === useSession.getState().info?.user_id) bumpReadStatus(channelId, 3000);
  });
  // A fresh login starts from scratch (ids are per server/user).
  useSession.subscribe((s, prev) => { if (s.info?.user_id !== prev.info?.user_id) { inflight = new Set(); useReadStatus.setState({ byPost: {}, failures: 0 }); } });
}
