import { create } from "zustand";
import { chat, describeSendError } from "../api/client";
import type { Channel, Post, Reaction, User } from "../api/types";
import { useSession } from "./session";
import { localIndex } from "./index";
import { useUi } from "./ui";
import { useToast } from "./toast";
import { isCompactNow } from "../lib/platform";

const PAGE = 50;

interface ChannelPosts {
  /** Ascending by create_at / post_id. */
  items: Post[];
  hasMore: boolean;
  /** True when the loaded window does not reach the newest post (after a jump). */
  hasNewer: boolean;
  loading: boolean;
  loaded: boolean;
}

interface ChatState {
  ready: boolean;
  error: string | null;
  channels: Record<number, Channel>;
  users: Record<number, User>;
  posts: Record<number, ChannelPosts>;
  activeChannelId: number | null;
  typing: Record<number, Record<number, number>>; // channelId -> userId -> expiresAt
  avatarUrls: Record<number, string>;

  loadInitial: () => Promise<void>;
  selectChannel: (id: number) => Promise<void>;
  loadOlder: (channelId: number) => Promise<void>;
  markViewed: (channelId: number) => Promise<void>;
  send: (channelId: number, message: string) => Promise<void>;
  /** Re-send a failed optimistic message (keeps its place in the list). */
  retrySend: (channelId: number, tempId: number) => Promise<void>;
  /** Drop a failed optimistic message. */
  discardSend: (channelId: number, tempId: number) => void;
  retryReply: (channelId: number, threadId: number, tempId: number) => Promise<void>;
  discardReply: (threadId: number, tempId: number) => void;
  avatarFor: (userId: number) => Promise<string | null>;
  toggleStar: (channelId: number) => Promise<void>;
  toggleReaction: (post: Post, stickerName: string) => Promise<void>;
  /** Re-fetches one post from the server and merges it in. */
  refreshPost: (channelId: number, postId: number) => Promise<void>;
  /** Load the page around a post (search result / jump) and select it. */
  jumpToPost: (channelId: number, postId: number) => Promise<void>;
  /** Loads the page around a date (ms) and flashes the first message on/after it. */
  jumpToDate: (channelId: number, at: number) => Promise<void>;
  loadNewer: (channelId: number) => Promise<void>;
  ensureMembers: (channelId: number) => Promise<number[]>;
  /** Loads member ids of every joined channel once (person search in the sidebar). */
  ensureAllMembers: () => Promise<void>;
  membersLoading: boolean;
  membersLoaded: boolean;
  /** Joins a public channel from the directory and opens it. */
  joinChannel: (channel: Channel) => Promise<void>;
  /** Creates a named channel and opens it. */
  createChannel: (fields: { type: "public" | "private"; name: string; purpose: string }) => Promise<void>;
  /** Leaves a named channel (Named disjoin) or closes a DM (Channel leave). */
  leaveChannel: (channelId: number) => Promise<void>;
  /** Jumps to the 1:1 chat with a user, creating it on the server if none exists. */
  openDmWith: (userId: number) => Promise<void>;
  /** Server-side hide/show (Channel hide/show v2), optimistic. */
  hideChannel: (channelId: number) => Promise<void>;
  showChannel: (channelId: number) => Promise<void>;
  /** Thread replies keyed by parent post id, ascending. */
  threads: Record<number, { items: Post[]; loading: boolean; loaded: boolean }>;
  loadThread: (channelId: number, threadId: number) => Promise<void>;
  sendReply: (channelId: number, threadId: number, message: string) => Promise<void>;
  /** Post id to flash after a jump; cleared by the list. */
  flashPostId: number | null;
  setFlashPostId: (id: number | null) => void;
  updateChannel: (channelId: number, patch: Partial<Channel>) => void;

  // socket handlers
  onPostCreate: (channelId: number, post: Post) => void;
  onPostUpdate: (post: Post) => void;
  /** Channel whose loaded page (or thread) contains the post, if any. */
  channelOfPost: (postId: number) => number | undefined;
  onPostDelete: (channelId: number, postId: number, threadId?: number) => void;
  onChannelUpsert: (channel: Partial<Channel> & { channel_id: number }) => void;
  onChannelRemove: (channelId: number) => void;
  onTyping: (channelId: number, userId: number) => void;
  onUserUpsert: (user: User) => void;
}

function sortPosts(items: Post[]): Post[] {
  const seen = new Map<number, Post>();
  for (const p of items) {
    const prev = seen.get(p.post_id);
    // Keep the newer server copy over an optimistic placeholder, and fill a socket skeleton
    // ({post_id, creator_id, create_at} without type/message) with the full copy that follows it.
    if (!prev || prev._pending) seen.set(p.post_id, p);
    else if (prev.type === undefined && p.type !== undefined) seen.set(p.post_id, { ...prev, ...p });
  }
  return [...seen.values()].sort((a, b) => a.create_at - b.create_at || a.post_id - b.post_id);
}

const emptyPosts = (): ChannelPosts => ({ items: [], hasMore: true, hasNewer: false, loading: false, loaded: false });

/** Replace fields of one post in a channel list (used for optimistic send state). */
function patchPost(channelId: number, postId: number, patch: Partial<Post>) {
  useChat.setState((s) => {
    const c = s.posts[channelId];
    return c ? { posts: { ...s.posts, [channelId]: { ...c, items: c.items.map((p) => (p.post_id === postId ? { ...p, ...patch } : p)) } } } : {};
  });
}
function patchReply(threadId: number, postId: number, patch: Partial<Post>) {
  useChat.setState((s) => {
    const t = s.threads[threadId];
    return t ? { threads: { ...s.threads, [threadId]: { ...t, items: t.items.map((p) => (p.post_id === postId ? { ...p, ...patch } : p)) } } } : {};
  });
}

/** Sends an optimistic channel message; on failure the placeholder stays with 재전송/취소. */
async function deliver(channelId: number, tempId: number, message: string) {
  try {
    const created = await chat.createPost(channelId, message);
    void localIndex.upsert([{ ...created, channel_id: channelId }]);
    useChat.setState((s) => {
      const c = s.posts[channelId];
      if (!c) return {};
      const items = c.items.filter((p) => p.post_id !== tempId && p.post_id !== created.post_id);
      return { posts: { ...s.posts, [channelId]: { ...c, items: sortPosts([...items, { ...created, channel_id: channelId }]) } } };
    });
  } catch (e) {
    patchPost(channelId, tempId, { _pending: false, _failed: true, _error: describeSendError(e) });
    throw e;
  }
}

/** Sends an optimistic thread reply; same failure handling as `deliver`. */
async function deliverReply(channelId: number, threadId: number, tempId: number, message: string) {
  try {
    const created = await chat.createPost(channelId, message, threadId);
    useChat.setState((s) => {
      const t = s.threads[threadId];
      if (!t) return {};
      const items = sortPosts([...t.items.filter((p) => p.post_id !== tempId && p.post_id !== created.post_id), { ...created, channel_id: channelId, thread_id: threadId }]);
      const c = s.posts[channelId];
      const posts = c ? { ...s.posts, [channelId]: { ...c, items: c.items.map((p) => (p.post_id === threadId ? { ...p, comment_count: items.length, last_comment_at: created.create_at } : p)) } } : s.posts;
      return { threads: { ...s.threads, [threadId]: { ...t, items } }, posts };
    });
  } catch (e) {
    patchReply(threadId, tempId, { _pending: false, _failed: true, _error: describeSendError(e) });
    throw e;
  }
}

export const useChat = create<ChatState>((set, get) => ({
  ready: false,
  error: null,
  channels: {},
  users: {},
  posts: {},
  activeChannelId: null,
  typing: {},
  avatarUrls: {},
  threads: {},
  flashPostId: null,
  setFlashPostId: (flashPostId) => set({ flashPostId }),
  updateChannel: (channelId, patch) => set((s) => (s.channels[channelId] ? { channels: { ...s.channels, [channelId]: { ...s.channels[channelId], ...patch } } } : {})),

  loadInitial: async () => {
    try {
      const [channelList, userList, serverTime] = await Promise.all([chat.listChannels(), chat.listUsers(), chat.ntp()]);
      useSession.getState().setClockOffset(serverTime - Date.now());
      void useSession.getState().loadServerSetting(); // read-receipt switch etc.; nothing waits for it
      const users: Record<number, User> = {};
      for (const u of userList) users[u.user_id] = u;
      const channels: Record<number, Channel> = {};
      for (const c of channelList) channels[c.channel_id] = c;
      set({ channels, users, ready: true, error: null });

      // DM/bot channels carry `members[]` in the list response; anything missing it is resolved lazily.
      const missing = channelList.filter((c) => !c.name && !c.members?.length && c.type !== "synobot").map((c) => c.channel_id);
      if (missing.length) {
        const members = await chat.membersOf(missing);
        set((s) => {
          const next = { ...s.channels };
          for (const [id, ids] of members) if (next[id]) next[id] = { ...next[id], member_ids: ids };
          return { channels: next };
        });
      }
    } catch (e) {
      const raw = String((e as { message?: string })?.message ?? e);
      const friendly = describeSendError(e);
      set({ error: friendly === raw ? raw : `${friendly} (${raw})` });
      throw e;
    }
  },

  selectChannel: async (id) => {
    // Moving to another channel closes the info panel; it belongs to the conversation you were looking at.
    if (get().activeChannelId !== id && useUi.getState().rightPanel !== "none") useUi.getState().setRightPanel("none");
    set({ activeChannelId: id });
    useUi.getState().openTab(id);
    const state = get();
    if (!state.posts[id]?.loaded && !state.posts[id]?.loading) {
      set((s) => ({ posts: { ...s.posts, [id]: { ...(s.posts[id] ?? emptyPosts()), loading: true } } }));
      try {
        const [items] = await Promise.all([chat.listPosts(id, { prevCount: PAGE }), chat.enterChannel(id).catch(() => null)]);
        void localIndex.upsert(items.map((p) => ({ ...p, channel_id: id })));
        set((s) => ({
          // A short first page is not proof that nothing older exists; loadOlder probes once and clears the flag if it is empty.
          posts: { ...s.posts, [id]: { items: sortPosts(items), hasMore: items.length > 0, hasNewer: false, loading: false, loaded: true } },
        }));
      } catch (e) {
        set((s) => ({ posts: { ...s.posts, [id]: { ...(s.posts[id] ?? emptyPosts()), loading: false } } }));
        throw e;
      }
    } else {
      chat.enterChannel(id).catch(() => null);
    }
    void get().markViewed(id);
  },

  loadOlder: async (channelId) => {
    const cur = get().posts[channelId];
    if (!cur || cur.loading || !cur.hasMore || cur.items.length === 0) return;
    set((s) => ({ posts: { ...s.posts, [channelId]: { ...cur, loading: true } } }));
    const oldest = cur.items[0];
    try {
      const older = await chat.listPosts(channelId, { beforePostId: oldest.post_id, prevCount: PAGE });
      void localIndex.upsert(older.map((p) => ({ ...p, channel_id: channelId })));
      set((s) => {
        const c = s.posts[channelId];
        const merged = sortPosts([...older, ...c.items]);
        return { posts: { ...s.posts, [channelId]: { ...c, items: merged, loading: false, hasMore: merged.length > c.items.length && older.length >= PAGE } } };
      });
    } catch {
      set((s) => ({ posts: { ...s.posts, [channelId]: { ...s.posts[channelId], loading: false } } }));
    }
  },

  markViewed: async (channelId) => {
    const ch = get().channels[channelId];
    if (!ch) return;
    if (isCompactNow() && useUi.getState().mobileScreen === "list") return; // the chat is not on screen
    const now = useSession.getState().serverNow();
    set((s) => ({
      channels: { ...s.channels, [channelId]: { ...ch, unread: 0, unread_mention: 0, unread_comment: 0, unread_mention_comment: 0, last_view_at: now } },
    }));
    if (ch.unread > 0 || ch.unread_mention > 0 || ch.last_post_at > ch.last_view_at) {
      await chat.viewChannel(channelId, now).catch(() => null);
    }
  },

  send: async (channelId, message) => {
    const me = useSession.getState().info?.user_id ?? 0;
    const tempId = -Date.now();
    const optimistic: Post = {
      post_id: tempId, channel_id: channelId, creator_id: me, create_at: useSession.getState().serverNow(),
      update_at: 0, delete_at: 0, message, type: "normal", thread_id: 0, comment_count: 0, reactions: [], mentions: [],
      hashtags: [], is_star: false, is_sticky: false, last_pin_at: 0, _pending: true,
    };
    set((s) => {
      const c = s.posts[channelId] ?? emptyPosts();
      return { posts: { ...s.posts, [channelId]: { ...c, items: [...c.items, optimistic] } } };
    });
    await deliver(channelId, tempId, message);
  },

  retrySend: async (channelId, tempId) => {
    const post = get().posts[channelId]?.items.find((p) => p.post_id === tempId);
    if (!post) return;
    patchPost(channelId, tempId, { _pending: true, _failed: false, _error: undefined });
    await deliver(channelId, tempId, post.message);
  },

  discardSend: (channelId, tempId) => {
    set((s) => {
      const c = s.posts[channelId];
      return c ? { posts: { ...s.posts, [channelId]: { ...c, items: c.items.filter((p) => p.post_id !== tempId) } } } : {};
    });
  },

  avatarFor: async (userId) => {
    const cached = get().avatarUrls[userId];
    if (cached !== undefined) return cached || null;
    const u = get().users[userId];
    if (!u) return null;
    try {
      const url = await chat.avatarUrl(u);
      set((s) => ({ avatarUrls: { ...s.avatarUrls, [userId]: url } }));
      return url;
    } catch {
      set((s) => ({ avatarUrls: { ...s.avatarUrls, [userId]: "" } }));
      return null;
    }
  },

  loadThread: async (channelId, threadId) => {
    const cur = get().threads[threadId];
    if (cur?.loading) return;
    set((s) => ({ threads: { ...s.threads, [threadId]: { items: cur?.items ?? [], loading: true, loaded: cur?.loaded ?? false } } }));
    try {
      const items = await chat.listPosts(channelId, { threadId, prevCount: 200 });
      const replies = sortPosts(items.filter((p) => p.thread_id === threadId && p.post_id !== threadId));
      set((s) => ({ threads: { ...s.threads, [threadId]: { items: replies, loading: false, loaded: true } } }));
      chat.viewThread(channelId, threadId).catch(() => null);
    } catch {
      set((s) => ({ threads: { ...s.threads, [threadId]: { items: cur?.items ?? [], loading: false, loaded: cur?.loaded ?? false } } }));
    }
  },

  sendReply: async (channelId, threadId, message) => {
    const me = useSession.getState().info?.user_id ?? 0;
    const tempId = -Date.now();
    const optimistic: Post = {
      post_id: tempId, channel_id: channelId, creator_id: me, create_at: useSession.getState().serverNow(), update_at: 0, delete_at: 0, message,
      type: "normal", thread_id: threadId, comment_count: 0, reactions: [], mentions: [], hashtags: [], is_star: false, is_sticky: false, last_pin_at: 0, _pending: true,
    };
    set((s) => { const t = s.threads[threadId] ?? { items: [], loading: false, loaded: true }; return { threads: { ...s.threads, [threadId]: { ...t, items: [...t.items, optimistic] } } }; });
    await deliverReply(channelId, threadId, tempId, message);
  },

  retryReply: async (channelId, threadId, tempId) => {
    const post = get().threads[threadId]?.items.find((p) => p.post_id === tempId);
    if (!post) return;
    patchReply(threadId, tempId, { _pending: true, _failed: false, _error: undefined });
    await deliverReply(channelId, threadId, tempId, post.message);
  },

  discardReply: (threadId, tempId) => {
    set((s) => { const t = s.threads[threadId]; return t ? { threads: { ...s.threads, [threadId]: { ...t, items: t.items.filter((p) => p.post_id !== tempId) } } } : {}; });
  },

  toggleStar: async (channelId) => {
    const ch = get().channels[channelId];
    if (!ch) return;
    const next = !ch.is_star;
    get().updateChannel(channelId, { is_star: next });
    try { await chat.starChannel(channelId, next); } catch (e) { get().updateChannel(channelId, { is_star: !next }); throw e; }
  },

  toggleReaction: async (post, stickerName) => {
    const me = useSession.getState().info?.user_id ?? 0;
    const nameOf = (r: Reaction) => r.sticker_name ?? r.name;
    // Posts reached through a thread or a socket update can lack channel_id; without it the optimistic chip never shows.
    const channelId = post.channel_id || get().channelOfPost(post.post_id) || 0;
    // Always start from the freshest copy in the store, not the (possibly stale) object the click handler held.
    const live = get().posts[channelId]?.items.find((p) => p.post_id === post.post_id)
      ?? (post.thread_id ? get().threads[post.thread_id]?.items.find((p) => p.post_id === post.post_id) : undefined)
      ?? post;
    const before = live.reactions ?? [];
    const existing = before.find((r) => nameOf(r) === stickerName);
    const mine = !!existing?.user_ids?.includes(me);
    const apply = (reactions: Reaction[]) =>
      set((s) => {
        const out: Partial<ChatState> = {};
        const c = s.posts[channelId];
        if (c) out.posts = { ...s.posts, [channelId]: { ...c, items: c.items.map((p) => (p.post_id === post.post_id ? { ...p, reactions } : p)) } };
        const t = post.thread_id ? s.threads[post.thread_id] : undefined;
        if (t) out.threads = { ...s.threads, [post.thread_id]: { ...t, items: t.items.map((p) => (p.post_id === post.post_id ? { ...p, reactions } : p)) } };
        return out;
      });
    const after: Reaction[] = mine
      ? before.map((r) => (nameOf(r) === stickerName ? { ...r, user_ids: (r.user_ids ?? []).filter((u) => u !== me) } : r)).filter((r) => (r.user_ids?.length ?? 0) > 0)
      : existing
        ? before.map((r) => (nameOf(r) === stickerName ? { ...r, user_ids: [...(r.user_ids ?? []), me] } : r))
        : [...before, { sticker_name: stickerName, user_ids: [me] }];
    apply(after);
    try {
      if (mine) await chat.deleteReaction(post.post_id, stickerName);
      else await chat.setReaction(post.post_id, stickerName);
    } catch (e) {
      apply(before);
      useToast.getState().push("error", `이모지 반응을 ${mine ? "지우지" : "달지"} 못했습니다: ${describeSendError(e)}`);
      return;
    }
    // Reconcile with what the server actually stored, so a chip that "looked" fine but was dropped disappears.
    if (channelId) void get().refreshPost(channelId, post.post_id);
  },

  refreshPost: async (channelId, postId) => {
    const [full] = await chat.postsAround(channelId, postId, 0).catch(() => [] as Post[]);
    if (full?.post_id === postId) get().onPostUpdate({ ...full, channel_id: channelId });
  },

  jumpToPost: async (channelId, postId) => {
    useUi.getState().setMobileScreen("chat");
    if (get().activeChannelId !== channelId && useUi.getState().rightPanel !== "none") useUi.getState().setRightPanel("none");
    const cur = get().posts[channelId];
    if (cur?.loaded && !cur.hasNewer && cur.items.some((p) => p.post_id === postId)) {
      set({ activeChannelId: channelId, flashPostId: postId });
      return;
    }
    set((s) => ({ activeChannelId: channelId, posts: { ...s.posts, [channelId]: { ...emptyPosts(), loading: true } } }));
    const items = await chat.postsAround(channelId, postId, 25);
    const sorted = sortPosts(items);
    const newest = sorted[sorted.length - 1];
    const ch = get().channels[channelId];
    const hasNewer = !!ch && !!newest && newest.create_at < ch.last_post_at;
    set((s) => ({ posts: { ...s.posts, [channelId]: { items: sorted, hasMore: true, hasNewer, loading: false, loaded: true } }, flashPostId: postId }));
    chat.enterChannel(channelId).catch(() => null);
  },

  jumpToDate: async (channelId, at) => {
    set((s) => ({ activeChannelId: channelId, posts: { ...s.posts, [channelId]: { ...emptyPosts(), loading: true } } }));
    let items = await chat.postsAtTime(channelId, at, 10, 40);
    // Nothing on/after that day (date in the future or past the end): fall back to the newest page before it.
    if (items.length === 0) items = await chat.postsAtTime(channelId, at, 50, 0);
    const sorted = sortPosts(items);
    const target = sorted.find((p) => p.create_at >= at) ?? sorted[sorted.length - 1];
    const newest = sorted[sorted.length - 1];
    const ch = get().channels[channelId];
    const hasNewer = !!ch && !!newest && newest.create_at < ch.last_post_at;
    set((s) => ({ posts: { ...s.posts, [channelId]: { items: sorted, hasMore: true, hasNewer, loading: false, loaded: true } }, flashPostId: target?.post_id ?? null }));
    void localIndex.upsert(sorted.map((p) => ({ ...p, channel_id: channelId })));
    chat.enterChannel(channelId).catch(() => null);
  },

  loadNewer: async (channelId) => {
    const cur = get().posts[channelId];
    if (!cur || cur.loading || !cur.hasNewer || cur.items.length === 0) return;
    set((s) => ({ posts: { ...s.posts, [channelId]: { ...cur, loading: true } } }));
    const newest = cur.items[cur.items.length - 1];
    try {
      const newer = await chat.postsAfter(channelId, newest.post_id, PAGE);
      set((s) => {
        const c = s.posts[channelId];
        const merged = sortPosts([...c.items, ...newer]);
        const ch = s.channels[channelId];
        const last = merged[merged.length - 1];
        const stillNewer = newer.length >= PAGE && !!ch && !!last && last.create_at < ch.last_post_at;
        return { posts: { ...s.posts, [channelId]: { ...c, items: merged, loading: false, hasNewer: stillNewer } } };
      });
    } catch {
      set((s) => ({ posts: { ...s.posts, [channelId]: { ...s.posts[channelId], loading: false } } }));
    }
  },

  membersLoading: false,
  membersLoaded: false,
  ensureAllMembers: async () => {
    if (get().membersLoaded || get().membersLoading) return;
    set({ membersLoading: true });
    try {
      const ids = Object.values(get().channels).filter((c) => c.is_joined && !c.members?.length && !c.member_ids?.length).map((c) => c.channel_id);
      const map = await chat.membersOf(ids);
      set((s) => {
        const channels = { ...s.channels };
        for (const [id, members] of map) if (channels[id]) channels[id] = { ...channels[id], member_ids: members };
        return { channels, membersLoaded: true };
      });
    } finally {
      set({ membersLoading: false });
    }
  },

  joinChannel: async (channel) => {
    useUi.getState().setMobileScreen("chat");
    const res = await chat.joinNamedChannel(channel.channel_id);
    get().onChannelUpsert({ ...channel, ...(res ?? {}), channel_id: channel.channel_id, is_joined: true });
    await get().selectChannel(channel.channel_id);
  },
  createChannel: async (fields) => {
    useUi.getState().setMobileScreen("chat");
    const created = await chat.createChannel(fields);
    const me = useSession.getState().info?.user_id ?? 0;
    const now = useSession.getState().serverNow();
    get().onChannelUpsert({
      name: fields.name, purpose: fields.purpose, type: fields.type, is_joined: true, is_star: false, encrypted: false,
      unread: 0, unread_comment: 0, unread_mention: 0, unread_mention_comment: 0, unread_thread: {}, last_post_at: now, last_view_at: now,
      total_member_count: 1, creator_id: me, create_at: now, ...created, channel_id: created.channel_id,
    });
    await get().selectChannel(created.channel_id);
  },
  leaveChannel: async (channelId) => {
    const ch = get().channels[channelId];
    if (!ch) return;
    if (ch.type === "public" || ch.type === "private") await chat.leaveNamedChannel(channelId);
    else await chat.leaveChannel(channelId);
    get().onChannelRemove(channelId);
  },

  openDmWith: async (userId) => {
    useUi.getState().setMobileScreen("chat");
    const me = useSession.getState().info?.user_id;
    if (!me || userId === me) {
      const mine = Object.values(get().channels).find((c) => c.type === "synobot");
      if (mine) await get().selectChannel(mine.channel_id);
      return;
    }
    const user = get().users[userId];
    const blocked = dmBlockReason(user);
    if (blocked) { useToast.getState().push("error", blocked); return; }
    const isBot = user?.type === "bot";
    // Chatbots talk in their own "chatbot" channel (creator_id = the bot); people in an "anonymous" 1:1.
    const existing = Object.values(get().channels).find((c) => {
      if (isBot) return c.type === "chatbot" && c.creator_id === userId;
      if (c.type !== "anonymous") return false;
      const others = (c.members ?? c.member_ids ?? []).filter((id) => id !== me);
      return others.length === 1 && others[0] === userId;
    });
    if (existing) { await get().selectChannel(existing.channel_id); return; }
    // The server returns the existing channel when there is one, so a stale member cache is harmless.
    // user_ids lists every member including me, as the official client does; sending only the other
    // person makes the server answer 400 (kNoSuchUser).
    let ch: Channel;
    try {
      ch = isBot ? await chat.initiateChatbot(userId) : await chat.initiateDm([userId, me]);
      if (!ch?.channel_id) throw new Error("서버가 채널을 돌려주지 않았습니다");
    } catch (e) {
      console.error("[dm] initiate failed", { userId, type: user?.type, human_type: user?.human_type, bot_type: user?.bot_type, deleted: user?.deleted, is_disabled: user?.is_disabled }, e);
      // 400 = kNoSuchUser: the server has no chat account for this id (deleted, never activated, or a bot the API does not treat as a user).
      const why = isApiCode(e, 400) ? "서버에 이 사용자의 Chat 계정이 없습니다" : describeSendError(e);
      useToast.getState().push("error", `1:1 대화를 열 수 없습니다: ${why}`);
      return;
    }
    get().onChannelUpsert({ ...ch, type: ch.type ?? (isBot ? "chatbot" : "anonymous"), is_joined: true, members: ch.members?.length ? ch.members : [me, userId] });
    await get().selectChannel(ch.channel_id).catch((e) => {
      console.error("[dm] open failed", ch.channel_id, e);
      useToast.getState().push("error", `대화를 불러오지 못했습니다: ${describeSendError(e)}`);
    });
  },

  hideChannel: async (channelId) => {
    const prev = get().channels[channelId]?.last_hide_at ?? 0;
    get().updateChannel(channelId, { last_hide_at: useSession.getState().serverNow() });
    try { await chat.hideChannel(channelId); } catch (e) { get().updateChannel(channelId, { last_hide_at: prev }); throw e; }
  },
  showChannel: async (channelId) => {
    // There is no "show" API on the server (method 103). The official client un-hides by viewing the
    // channel: last_view_at moves past last_hide_at and the hidden rule no longer matches.
    const prev = get().channels[channelId]?.last_view_at ?? 0;
    const now = useSession.getState().serverNow();
    get().updateChannel(channelId, { last_view_at: now });
    try { await chat.viewChannel(channelId, now); } catch (e) { get().updateChannel(channelId, { last_view_at: prev }); throw e; }
  },

  ensureMembers: async (channelId) => {
    const ch = get().channels[channelId];
    if (!ch) return [];
    if (ch.members?.length) return ch.members;
    if (ch.member_ids?.length) return ch.member_ids;
    const ids = await chat.getMembers(channelId);
    get().updateChannel(channelId, { member_ids: ids });
    return ids;
  },

  onPostCreate: (channelId, post) => {
    const me = useSession.getState().info?.user_id;
    set((s) => {
      const ch = s.channels[channelId];
      const isActive = s.activeChannelId === channelId && document.hasFocus() && useUi.getState().view === "channel";
      const mentioned = (post.mentions ?? []).some((m) => (typeof m === "number" ? m : m.user_id) === me);
      const channels = ch
        ? {
            ...s.channels,
            [channelId]: {
              ...ch,
              last_post_at: Math.max(ch.last_post_at, post.create_at),
              unread: isActive || post.creator_id === me ? ch.unread : ch.unread + 1,
              unread_mention: isActive || post.creator_id === me ? ch.unread_mention : ch.unread_mention + (mentioned ? 1 : 0),
            },
          }
        : s.channels;
      const c = s.posts[channelId];
      if (!c?.loaded || c.hasNewer) return { channels };
      if (post.thread_id && post.thread_id !== post.post_id) {
        // Thread reply: bump the parent's comment count and append to the loaded thread.
        const t = s.threads[post.thread_id];
        const already = t?.items.some((p) => p.post_id === post.post_id);
        const items = c.items.map((p) => (p.post_id === post.thread_id && !already ? { ...p, comment_count: p.comment_count + 1, last_comment_at: post.create_at } : p));
        const threads = t && !already
          ? { ...s.threads, [post.thread_id]: { ...t, items: sortPosts([...t.items.filter((p) => !(p._pending && p.creator_id === post.creator_id && p.message === post.message)), { ...post, channel_id: channelId }]) } }
          : s.threads;
        return { channels, posts: { ...s.posts, [channelId]: { ...c, items } }, threads };
      }
      // Replace an optimistic copy of our own message if one is still pending.
      const items = c.items.filter((p) => !(p._pending && p.creator_id === post.creator_id && p.message === post.message));
      return { channels, posts: { ...s.posts, [channelId]: { ...c, items: sortPosts([...items, { ...post, channel_id: channelId }]) } } };
    });
    window.dispatchEvent(new CustomEvent("chat:post-created", { detail: { channelId, post } }));
    if (get().activeChannelId === channelId && document.hasFocus() && useUi.getState().view === "channel") void get().markViewed(channelId);
  },

  onPostUpdate: (incoming) => {
    set((s) => {
      // Socket `post.update` payloads (file upload completed, reactions, edits) often omit channel_id:
      // locate the post in whatever channel page holds it.
      const channelId = incoming.channel_id || get().channelOfPost(incoming.post_id);
      const post = channelId ? { ...incoming, channel_id: channelId } : incoming;
      const out: Partial<ChatState> = {};
      const c = channelId ? s.posts[channelId] : undefined;
      if (c && channelId) out.posts = { ...s.posts, [channelId]: { ...c, items: c.items.map((p) => (p.post_id === post.post_id ? { ...p, ...post } : p)) } };
      const t = post.thread_id ? s.threads[post.thread_id] : undefined;
      if (t) out.threads = { ...s.threads, [post.thread_id]: { ...t, items: t.items.map((p) => (p.post_id === post.post_id ? { ...p, ...post } : p)) } };
      return out;
    });
  },

  channelOfPost: (postId) => {
    const s = get();
    for (const [id, c] of Object.entries(s.posts)) if (c.items.some((p) => p.post_id === postId)) return Number(id);
    for (const t of Object.values(s.threads)) { const hit = t.items.find((p) => p.post_id === postId); if (hit?.channel_id) return hit.channel_id; }
    return undefined;
  },

  onPostDelete: (channelId, postId, threadId) => {
    set((s) => {
      const out: Partial<ChatState> = {};
      const c = s.posts[channelId];
      if (c) out.posts = { ...s.posts, [channelId]: { ...c, items: c.items.filter((p) => p.post_id !== postId).map((p) => (threadId && p.post_id === threadId ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p)) } };
      const t = threadId ? s.threads[threadId] : undefined;
      if (t) out.threads = { ...s.threads, [threadId!]: { ...t, items: t.items.filter((p) => p.post_id !== postId) } };
      return out;
    });
  },

  onChannelUpsert: (channel) => {
    set((s) => {
      const prev = s.channels[channel.channel_id];
      // A join/leave event changes membership: drop the cached list so the next person search refetches it.
      const merged = { ...(prev ?? ({} as Channel)), ...channel } as Channel;
      if (!channel.members && prev?.member_ids) merged.member_ids = undefined;
      return { channels: { ...s.channels, [channel.channel_id]: merged }, membersLoaded: false };
    });
  },

  onChannelRemove: (channelId) => {
    set((s) => {
      const channels = { ...s.channels };
      delete channels[channelId];
      return { channels, activeChannelId: s.activeChannelId === channelId ? null : s.activeChannelId };
    });
  },

  onTyping: (channelId, userId) => {
    const expiresAt = Date.now() + 4000;
    set((s) => ({ typing: { ...s.typing, [channelId]: { ...(s.typing[channelId] ?? {}), [userId]: expiresAt } } }));
    setTimeout(() => {
      set((s) => {
        const byUser = { ...(s.typing[channelId] ?? {}) };
        if (byUser[userId] && byUser[userId] <= Date.now()) delete byUser[userId];
        return { typing: { ...s.typing, [channelId]: byUser } };
      });
    }, 4100);
  },

  onUserUpsert: (user) => set((s) => ({ users: { ...s.users, [user.user_id]: { ...(s.users[user.user_id] ?? {}), ...user } } })),
}));

/** Display name for a channel; DMs and bot channels are named after the other member. */
export function channelLabel(ch: Channel, users: Record<number, User>, me: number | undefined): string {
  if (ch.type === "synobot") return "내 공간";
  if (ch.name) return ch.name;
  const members = ch.members ?? ch.member_ids ?? [];
  const others = members.filter((id) => id !== me);
  if (others.length) return others.map((id) => userLabel(users[id])).join(", ");
  if (members.length) return userLabel(users[members[0]]);
  return ch.type === "anonymous" ? "다이렉트 메시지" : `채널 ${ch.channel_id}`;
}

const isApiCode = (e: unknown, code: number) => !!e && typeof e === "object" && (e as { kind?: string }).kind === "api" && (e as { code?: number }).code === code;

/**
 * Why a 1:1 with this account cannot be opened, or "" when it can. Mirrors the official client: only
 * available DSM accounts (`ACL.canInitiateAnonymous` → isNormalUser) and chatbots get a conversation; guests,
 * webhook/slash/broadcast bots and deleted/disabled accounts do not (the server answers 400 kNoSuchUser).
 */
export function dmBlockReason(u: User | undefined): string {
  if (!u) return "사용자 정보를 아직 불러오지 못했습니다";
  if (u.deleted) return "삭제된 계정입니다";
  if (u.is_disabled) return "비활성 계정입니다";
  if (u.type === "bot") {
    if (u.bot_type === "synobot") return "";
    return u.bot_type === "chatbot" ? "" : "이 봇은 웹훅·명령용이라 대화 채널이 없습니다";
  }
  if (u.human_type === "guest") return "게스트 계정과는 1:1 대화를 열 수 없습니다";
  return "";
}

/** "비활성"/"삭제됨" for accounts the official client marks unavailable; "" otherwise. */
export function userBadge(u: User | undefined): string {
  if (!u) return "";
  if (u.deleted) return "삭제됨";
  if (u.is_disabled) return "비활성";
  return "";
}

export function userLabel(u: User | undefined): string {
  if (!u) return "알 수 없음";
  return u.nickname || u.username || `user ${u.user_id}`;
}
