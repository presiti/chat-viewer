import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { chat as chatApi, realtime } from "../api/client";
import type { Channel, Post, User } from "../api/types";
import { useChat } from "../store/chat";
import { useSession, type SocketStatus } from "../store/session";
import { localIndex } from "../store/index";
import { notifyForPost } from "../store/notify";
import { bumpReadStatus } from "../store/readStatus";

interface SocketEvent { event: string; data: unknown }
interface SocketStatusEvent { status: SocketStatus; attempt: number }

type AnyRec = Record<string, unknown>;
const rec = (v: unknown): AnyRec => (typeof v === "object" && v !== null ? (v as AnyRec) : {});
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

/** Subscribe to events relayed from the Rust socket; returns a cleanup function. */
/** `passive`: a secondary window that only listens — the main window owns the one socket connection. */
export async function startRealtime(passive = false): Promise<() => void> {
  const unlisteners: UnlistenFn[] = [];

  unlisteners.push(
    await listen<SocketStatusEvent>("chat://socket-status", (e) => {
      const { status, attempt } = e.payload;
      const prev = useSession.getState().socket;
      useSession.getState().setSocket(status, attempt);
      // After a reconnect, we may have missed events: refresh the channel list and the open channel.
      if (status === "connected" && (prev === "reconnecting" || prev === "disconnected")) {
        void resync();
      }
    }),
  );

  unlisteners.push(
    await listen<SocketEvent>("chat://socket", (e) => {
      // Rust already strips the `client.` prefix; strip again defensively.
      const event = e.payload.event.replace(/^client\./, "");
      const data = e.payload.data;
      const chat = useChat.getState();
      const d = rec(data);
      switch (event) {
        case "init":
          // Server expects the client to acknowledge once its own init is done.
          void realtime.emit("client.initdone");
          break;
        case "post.create": {
          const post = (d.data ?? d) as Post;
          const channelId = num(d.channel_id) ?? post.channel_id;
          if (channelId && post?.post_id) {
            chat.onPostCreate(channelId, post);
            // File uploads arrive as a skeleton ({post_id, creator_id, create_at} only); the body and
            // file_props follow in a `post.update`. Don't index the skeleton, and fetch the full post if
            // the update never shows up (e.g. the socket hiccuped in between).
            if (post.type === undefined && post.message === undefined) void completeSkeleton(channelId, post.post_id);
            else { void localIndex.upsert([{ ...post, channel_id: channelId }]); notifyForPost(channelId, post); }
          }
          break;
        }
        case "post.update":
          applyPostUpdate((d.data ?? d) as Post);
          break;
        case "post.delete":
          applyPostDelete(d);
          break;
        case "channel.join":
        case "channel.unhide_global":
          if (d.user) chat.onUserUpsert(d.user as User);
          if (num(d.channel_id)) chat.onChannelUpsert(d as unknown as Channel);
          break;
        case "channel.disjoin":
        case "channel.close":
        case "channel.hide_global": {
          const channelId = num(d.channel_id);
          if (channelId) chat.onChannelRemove(channelId);
          break;
        }
        case "channel.view": {
          // Normally my own other device; if the server ever reports another member's view, refresh receipts soon.
          const channelId = num(d.channel_id);
          const userId = num(d.user_id);
          if (channelId && userId && userId !== useSession.getState().info?.user_id) bumpReadStatus(channelId, 500);
          break;
        }
        case "setting.update":
          void useSession.getState().loadServerSetting();
          break;
        case "channel.typing_v2": {
          const channelId = num(d.channel_id);
          const userId = num(d.user_id);
          if (channelId && userId) chat.onTyping(channelId, userId);
          break;
        }
        case "broadcast": {
          // {type: "user.update" | "user.create", data: User | User[]}
          const type = String(d.type ?? "");
          // Reactions, pins and stars reach everyone in the channel as broadcast `post.*` events (the official
          // client handles them the same way); only the plain `post.update` socket event used to be applied.
          if (type === "post.update" || type === "post.pin" || type === "post.unpin" || type === "post.star" || type === "post.unstar") {
            const post = rec(d.data) as unknown as Post;
            if (post?.post_id) applyPostUpdate(post);
            break;
          }
          if (type === "post.delete") { applyPostDelete(rec(d.data)); break; }
          if (type.startsWith("user.")) {
            const payload = d.data;
            const list = Array.isArray(payload) ? payload : [payload];
            for (const u of list) if (u && typeof u === "object" && "user_id" in (u as AnyRec)) chat.onUserUpsert(u as User);
          }
          break;
        }
        default:
          break;
      }
    }),
  );

  if (!passive) await realtime.connect();
  return () => {
    unlisteners.forEach((u) => u());
    if (!passive) void realtime.disconnect();
  };
}


/** Applies a full or partial Post from `post.update` (socket event or broadcast): reactions, edits, finished uploads. */
function applyPostUpdate(post: Post) {
  if (!post?.post_id) return;
  const chat = useChat.getState();
  const channelId = post.channel_id || chat.channelOfPost(post.post_id);
  // A skeleton file post becomes real here: that is the moment to notify and to settle the upload bar.
  const prior = channelId ? loadedPost(channelId, post.post_id) : undefined;
  const wasSkeleton = !!prior && prior.type === undefined; // not loaded (old post) is not a skeleton: no notification
  chat.onPostUpdate(post);
  if (channelId) {
    void localIndex.upsert([{ ...post, channel_id: channelId }]);
    if (wasSkeleton) { const full = { ...post, channel_id: channelId }; notifyForPost(channelId, full); window.dispatchEvent(new CustomEvent("chat:post-created", { detail: { channelId, post: full } })); }
  }
}

function applyPostDelete(d: AnyRec) {
  const channelId = num(d.channel_id);
  const postId = num(d.post_id);
  if (channelId && postId) { useChat.getState().onPostDelete(channelId, postId, num(d.thread_id) || undefined); void localIndex.delete(postId); }
}

/** The loaded copy of a post: in the channel page or, for a thread reply, in its loaded thread. */
function loadedPost(channelId: number, postId: number): Post | undefined {
  const s = useChat.getState();
  const inPage = s.posts[channelId]?.items.find((p) => p.post_id === postId);
  if (inPage) return inPage;
  for (const t of Object.values(s.threads)) { const hit = t.items.find((p) => p.post_id === postId); if (hit) return hit; }
  return undefined;
}

/** Fetches a post whose socket `post.create` was only a skeleton, unless a `post.update` already filled it. */
async function completeSkeleton(channelId: number, postId: number) {
  await new Promise((r) => setTimeout(r, 1000));
  const current = loadedPost(channelId, postId);
  if (!current || current.type !== undefined) return;
  const [full] = await chatApi.postsAround(channelId, postId, 0).catch(() => [] as Post[]);
  if (full?.post_id === postId) {
    const filled = { ...full, channel_id: channelId };
    useChat.getState().onPostUpdate(filled);
    void localIndex.upsert([filled]);
    notifyForPost(channelId, filled);
    window.dispatchEvent(new CustomEvent("chat:post-created", { detail: { channelId, post: filled } }));
  }
}

async function resync() {
  const chat = useChat.getState();
  await chat.loadInitial().catch(() => null);
  const active = chat.activeChannelId;
  if (active) {
    // Drop the cached page so the next render refetches the tail of the conversation.
    useChat.setState((s) => {
      const posts = { ...s.posts };
      delete posts[active];
      return { posts };
    });
    await useChat.getState().selectChannel(active).catch(() => null);
  }
}
