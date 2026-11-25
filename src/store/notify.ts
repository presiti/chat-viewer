import { isPopout } from "../lib/platform";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Post } from "../api/types";
import { channelLabel, useChat, userLabel } from "./chat";
import { useSession } from "./session";
import { useUi } from "./ui";
import { previewText } from "../lib/format";

/** Sounds offered in settings (macOS system sound names; "default" = the system alert sound). */
export const NOTIFY_SOUNDS: { key: string; label: string }[] = [
  { key: "default", label: "기본 알림음" }, // mapped to NSUserNotificationDefaultSoundName on macOS
  { key: "Ping", label: "Ping" },
  { key: "Glass", label: "Glass" },
  { key: "Pop", label: "Pop" },
  { key: "Submarine", label: "Submarine" },
];

const notified = new Set<number>();

/** Shows a notification through the Rust side (osascript in macOS dev builds, the plugin otherwise). */
async function show(title: string, body: string) {
  const { mode, sound } = useUi.getState().desktopNotify;
  await invoke("notify_native", { title, body, sound: mode === "sound" ? sound || "default" : null });
}

/** Is the server-side snooze (one-off or the daily schedule) active right now? */
export function snoozeActive(): boolean {
  const s = useSession.getState();
  const p = s.prefs;
  if (!p) return false;
  const now = s.serverNow();
  if ((p.snooze ?? 0) > now) return true;
  if (p.snooze_schedule_enable) {
    const d = new Date(now);
    const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    const start = p.snooze_schedule_start ?? 0, end = p.snooze_schedule_end ?? 0;
    if (start < end ? sec >= start && sec < end : sec >= start || sec < end) return true;
  }
  return false;
}

/**
 * Decides whether a freshly arrived post deserves a system notification and shows it.
 * Mirrors the official rules: the channel's desktop level (all / mention / mention_subscribe / none),
 * mute, snooze, and "not while you are looking at that channel".
 */
export function notifyForPost(channelId: number, post: Post) {
  if (isPopout) return; // the main window notifies; a chat window would double it
  const ui = useUi.getState();
  if (ui.desktopNotify.mode === "off") return;
  if (!post?.post_id || notified.has(post.post_id)) return;
  if (post.type === undefined || post.type === "system") return;
  const chatState = useChat.getState();
  const me = useSession.getState().info?.user_id;
  if (!me || post.creator_id === me) return;
  const ch = chatState.channels[channelId];
  if (!ch) return;
  const pref = ch.preferences ?? {};
  if (pref.notification_mute) return;
  const level = pref.notification_desktop ?? "by_admin_console";
  if (level === "none") return;
  const isReply = !!post.thread_id && post.thread_id !== post.post_id;
  const rn = ui.replyNotify;
  // Client-only: a muted thread never notifies; "all replies" (per channel, else the global default) lets every
  // reply through regardless of the mention / subscribe level (but not "none" or a muted channel, handled above).
  if (isReply && rn.mutedThreads[post.thread_id]) return;
  const allReplies = isReply && (rn.channels[channelId] ?? rn.global);
  const mentioned = (post.mentions ?? []).some((m) => (typeof m === "number" ? m : m.user_id) === me || (typeof m !== "number" && (m.type === "here" || m.type === "all" || m.type === "channel")));
  if (level === "mention" && !mentioned && !allReplies) return;
  if (level === "mention_subscribe" && !mentioned && !allReplies) {
    // Replies in a thread I started count as subscribed; anything else needs a mention.
    const root = isReply ? chatState.posts[channelId]?.items.find((p) => p.post_id === post.thread_id) : undefined;
    if (!(root && root.creator_id === me)) return;
  }
  if (snoozeActive()) return;
  if (document.hasFocus() && chatState.activeChannelId === channelId && ui.view === "channel") return;
  notified.add(post.post_id);
  const users = chatState.users;
  const who = userLabel(users[post.creator_id]);
  const where = channelLabel(ch, users, me);
  const body = previewText(post, users) || (post.type === "file" ? "파일" : "");
  void show(ch.type === "anonymous" && where === who ? who : `${where} · ${who}`, body.slice(0, 200)).catch(() => null);
}

/** Sends a sample notification (settings page). Returns an error string when it fails. */
export async function testNotification(): Promise<string | null> {
  try { await show("Chat Viewer", "알림 테스트입니다. 새 메시지가 오면 이렇게 표시됩니다."); return null; }
  catch (e) { return (e as { message?: string })?.message ?? String(e); }
}

/** Keeps the dock badge equal to the unread count of alert-enabled channels (mentions first). */
export function startBadgeSync(): () => void {
  let last = -1;
  const apply = () => {
    const ui = useUi.getState();
    const channels = Object.values(useChat.getState().channels).filter((c) => c.is_joined);
    let n = 0;
    if (ui.desktopNotify.badge) {
      const mentions = channels.reduce((a, c) => a + c.unread_mention + c.unread_mention_comment, 0);
      const unread = channels.filter((c) => !c.preferences?.notification_mute && c.preferences?.notification_desktop !== "none").reduce((a, c) => a + c.unread, 0);
      n = mentions > 0 ? mentions : unread;
    }
    if (n === last) return;
    last = n;
    getCurrentWindow().setBadgeCount(n > 0 ? n : undefined).catch(() => null);
  };
  const u1 = useChat.subscribe(apply);
  const u2 = useUi.subscribe(apply);
  apply();
  return () => { u1(); u2(); };
}
