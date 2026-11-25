import { invoke } from "@tauri-apps/api/core";
import type { AppErrorPayload, Channel, ChannelPreference, LoginInfo, Post, Reminder, ScheduledPost, SearchParams, SearchResult, User, VoteChoice, VoteOptions } from "./types";

export function isAppError(e: unknown): e is AppErrorPayload {
  return typeof e === "object" && e !== null && "kind" in e && "message" in e;
}

/** Error codes of SYNO.Chat.Post (from the official client's table) that matter when sending. */
const POST_ERRORS: Record<number, string> = {
  409: "파일 크기 제한 초과",
  410: "메시지 길이 제한 초과",
  411: "너무 빠르게 보내고 있습니다 (서버 전송 제한)",
  413: "숨긴 채널에는 보낼 수 없습니다",
  415: "편집 가능 시간이 지났습니다",
  417: "빈 파일은 보낼 수 없습니다",
};

/** Short Korean description of a send failure for the UI. */
export function describeSendError(e: unknown): string {
  if (isAppError(e)) {
    if (e.kind === "api" && e.code != null && POST_ERRORS[e.code]) return POST_ERRORS[e.code];
    if (e.kind === "http") return "서버에 연결할 수 없습니다";
    if (e.kind === "not_logged_in") return "로그인이 필요합니다";
    if (e.kind === "api") return `서버 오류 (코드 ${e.code})`;
    return e.message;
  }
  return (e as { message?: string })?.message ?? String(e);
}

export async function apiCall<T = unknown>(
  api: string,
  method: string,
  version: number,
  params?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>("api_call", { api, method, version, params: params ?? null });
}

interface CompoundResult {
  has_fail: boolean;
  result: { api: string; method: string; version: number; success: boolean; data?: unknown; error?: { code: number } }[];
}

export async function apiCompound(
  requests: { api: string; method: string; version: number; [k: string]: unknown }[],
): Promise<CompoundResult> {
  return invoke<CompoundResult>("api_compound", { requests, parallel: true });
}

export const auth = {
  login: (host: string, account: string, password: string, otp?: string) =>
    invoke<LoginInfo>("login", { host, account, password, otp: otp || null, rememberDevice: true }),
  restore: () => invoke<LoginInfo | null>("restore_session"),
  logout: () => invoke<void>("logout"),
};

export const realtime = {
  connect: () => invoke<void>("socket_connect"),
  disconnect: () => invoke<void>("socket_disconnect"),
  emit: (event: string, data?: unknown) => invoke<void>("socket_emit", { event, data: data ?? null }),
};

export interface UploadRequest {
  channelId: number;
  /** Absolute path on disk, or raw bytes (for clipboard images / snippets). */
  path?: string;
  bytes?: number[];
  fileName: string;
  message?: string;
  threadId?: number | null;
  /** Client-side id used to correlate progress events. */
  uploadId: string;
}
/** `SYNO.Chat.User.Preference get/set v4` — fixed keys only (snooze, theme, notification flags…). */
export interface UserPrefs {
  snooze?: number;
  snooze_schedule_enable?: boolean;
  /** Seconds since midnight (server local time). */
  snooze_schedule_start?: number;
  snooze_schedule_end?: number;
  notification_mute?: boolean;
  prefer_user_name_format?: string;
  [k: string]: unknown;
}
export const preference = {
  get: async () => (await apiCall<{ preferences: UserPrefs }>("SYNO.Chat.User.Preference", "get", 4)).preferences,
  set: (fields: Partial<UserPrefs>) => apiCall<unknown>("SYNO.Chat.User.Preference", "set", 4, fields),
};

/** Bots / webhooks / slash commands (read-only here; editing is done in the official web client). */
export interface IntegrationBot {
  user_id: number;
  nickname: string;
  bot_type: "incoming" | "outgoing" | "slash" | string;
  is_disabled: boolean;
  deleted?: boolean;
  channel_id?: number;
  creator_id?: number;
  create_at?: number;
  avatar_version?: number;
  bot_props?: { is_system?: boolean };
  slash_props?: { cmd?: string; description?: string; usage?: string };
}
export const integrations = {
  incoming: async () => (await apiCall<{ webhook_incomings: IntegrationBot[] }>("SYNO.Chat.Webhook.Incoming", "list", 1)).webhook_incomings ?? [],
  outgoing: async () => (await apiCall<{ webhook_outgoings: IntegrationBot[] }>("SYNO.Chat.Webhook.Outgoing", "list", 1)).webhook_outgoings ?? [],
  slash: async () => (await apiCall<{ webhook_slashs: IntegrationBot[] }>("SYNO.Chat.Webhook.Slash", "list", 1)).webhook_slashs ?? [],
};

/**
 * Archives (`SYNO.Chat.Archive`): a channel's history that is no longer live for me — the channel was
 * closed/archived, I left it, or an admin triggered it. `list_name {type}` gives channel names per type,
 * `list {type, channel_name}` the archive periods, and `Post list v5 {archive_id, channel_id, …}` reads them.
 */
export type ArchiveType = "public" | "private" | "anonymous" | "chatbot";
export interface ArchiveEntry {
  archive_id: number;
  post_start: number;
  post_end: number;
  post_id_start: number;
  post_id_end: number;
  props: { channel: Partial<Channel> & { channel_id: number }; reason?: "channel_closed" | "leave_channel" | "user_trigger" | string; trigger_user_id?: number };
}
export const archive = {
  names: async (type: ArchiveType) => (await apiCall<{ channel_names: string[] }>("SYNO.Chat.Archive", "list_name", 1, { type })).channel_names ?? [],
  list: async (type: ArchiveType, channel_name: string) =>
    (await apiCall<{ archives: ArchiveEntry[] }>("SYNO.Chat.Archive", "list", 1, { type, channel_name })).archives ?? [],
  /** Every archive of one type in a single round-trip (names first, then one compound call). */
  listAll: async (type: ArchiveType) => {
    const names = await archive.names(type);
    const out: { name: string; archives: ArchiveEntry[] }[] = [];
    for (let i = 0; i < names.length; i += 40) {
      const chunk = names.slice(i, i + 40);
      const res = await apiCompound(chunk.map((channel_name) => ({ api: "SYNO.Chat.Archive", method: "list", version: 1, type, channel_name })));
      res.result.forEach((r, idx) => { const d = r.data as { archives?: ArchiveEntry[] } | undefined; out.push({ name: chunk[idx], archives: r.success && d?.archives ? d.archives : [] }); });
    }
    return out;
  },
  /** Posts inside an archive, newest page first (older pages via `beforePostId`). */
  posts: async (channel_id: number, archive_id: number, beforePostId?: number, count = 60) =>
    (await apiCall<{ posts: Post[] }>("SYNO.Chat.Post", "list", 5, {
      channel_id, archive_id, post_id: beforePostId ?? null, create_at: null, prev_count: count, next_count: 0, thread_id: null,
    })).posts,
};

export const profile = {
  /** `SYNO.Chat.User set v3`: nickname, is_always_offline, user_props fields. */
  set: (fields: Record<string, unknown>) => apiCall<unknown>("SYNO.Chat.User", "set", 3, fields),
  /** Uploads a new profile picture (PNG/JPG bytes). */
  setAvatar: (fileName: string, bytes: number[]) => invoke<unknown>("upload_avatar", { fileName, bytes }),
  /** Removes the profile picture (back to the coloured initials). Same call the official client makes: `User set {remove_avatar:true}`. */
  removeAvatar: () => apiCall<unknown>("SYNO.Chat.User", "set", 3, { remove_avatar: true }),
};

export const files = {
  upload: (req: UploadRequest) => invoke<Post>("upload_post", { req }),
  /** Downloads a post's file to `savePath`; returns the final path. */
  download: (postId: number, savePath: string) => invoke<string>("download_file", { postId, savePath }),
};

export const mediaUrl = (api: string, method: string, version: number, params: Record<string, unknown>) =>
  invoke<string>("media_url", { api, method, version, params });

export const chat = {
  listChannels: async (opts: { is_joined?: boolean } = {}) =>
    (await apiCall<{ channels: Channel[] }>("SYNO.Chat.Channel", "list", 5, opts.is_joined === undefined ? undefined : { is_joined: opts.is_joined })).channels,
  /** Public channel directory: channels the user has not joined. */
  listUnjoinedChannels: async () => (await apiCall<{ channels: Channel[] }>("SYNO.Chat.Channel", "list", 5, { is_joined: false })).channels.filter((c) => !c.is_joined),
  joinNamedChannel: (channel_id: number) => apiCall<Channel | null>("SYNO.Chat.Channel.Named", "join", 1, { channel_id, channel_key_enc: "" }),
  leaveNamedChannel: (channel_id: number) => apiCall("SYNO.Chat.Channel.Named", "disjoin", 1, { channel_id }),
  /** Who has (not) seen one of my posts. The official client shows it as a "읽은 사람/읽지 않은 사람" menu; there is no push for it. */
  getReadStatus: (post_id: number) => apiCall<{ read_users?: Array<User | number>; unread_users?: Array<User | number> }>("SYNO.Chat.Post", "get_read_status", 6, { post_id }),
  /** Server-wide switches (`allow_read_status`, `allow_encryption`, …). Every user may call it; the official client does at start-up. */
  adminSetting: () => apiCall<{ allow_read_status?: boolean; [k: string]: unknown }>("SYNO.Chat.Admin.Setting", "get", 3),
  createChannel: (fields: { type: "public" | "private"; name: string; purpose: string }) =>
    apiCall<{ channel_id: number } & Partial<Channel>>("SYNO.Chat.Channel.Named", "create", 1, { ...fields, encrypted: false }),
  archiveChannel: (channel_id: number) => apiCall("SYNO.Chat.Channel", "archive", 2, { channel_id }),
  listUsers: async () => (await apiCall<{ users: User[] }>("SYNO.Chat.User", "list", 3)).users,
  ntp: async () => (await apiCall<{ time: number }>("SYNO.Chat.Misc", "ntp", 1)).time,

  /** Members of several channels in one round-trip. */
  membersOf: async (channelIds: number[]) => {
    const out = new Map<number, number[]>();
    const chunk = 40;
    for (let i = 0; i < channelIds.length; i += chunk) {
      const ids = channelIds.slice(i, i + chunk);
      const res = await apiCompound(
        ids.map((channel_id) => ({ api: "SYNO.Chat.Channel.Member", method: "get", version: 1, channel_id })),
      );
      res.result.forEach((r, idx) => {
        const d = r.data as { user_ids?: number[] } | undefined;
        if (r.success && d?.user_ids) out.set(ids[idx], d.user_ids);
      });
    }
    return out;
  },

  enterChannel: (channel_id: number) =>
    apiCompound([
      { api: "SYNO.Chat.Channel", method: "enter", version: 2, channel_id, conn_id: null },
      { api: "SYNO.Chat.Channel.Member", method: "get", version: 1, channel_id },
    ]),

  /** Marks a thread as read (clears unread-thread badges). */
  viewThread: (channel_id: number, thread_id: number) =>
    apiCall("SYNO.Chat.Post.Subscribe", "view", 2, { channel_id, thread_id }),
  viewChannel: (channel_id: number, last_view_at: number) =>
    apiCall("SYNO.Chat.Channel", "view", 2, { channel_id, last_view_at, conn_id: null }),

  /**
   * Cursor-based page. With no cursor returns the newest `prevCount` posts.
   * With `beforePostId` returns that post and up to `prevCount` older ones.
   */
  listPosts: async (channel_id: number, opts: { beforePostId?: number; prevCount?: number; threadId?: number } = {}) => {
    const res = await apiCall<{ posts: Post[] }>("SYNO.Chat.Post", "list", 5, {
      channel_id,
      post_id: opts.beforePostId ?? null,
      create_at: null,
      prev_count: opts.prevCount ?? 50,
      next_count: 0,
      thread_id: opts.threadId ?? null,
    });
    return res.posts;
  },

  createPost: (channel_id: number, message: string, threadId?: number) =>
    apiCall<Post>("SYNO.Chat.Post", "create", 5, {
      channel_id,
      type: "normal",
      message,
      // Replies are comments: thread_id only. Any `is_thread` value can make the server create a "thread post"
      // plus a "게시물 생성" system line in the channel, so the field is not sent (the official client omits it too).
      thread_id: threadId ?? null,
      conn_id: null,
    }),

  // --- reactions / stars ---
  setReaction: (post_id: number, sticker_name: string) =>
    apiCall("SYNO.Chat.Post.Reaction", "set", 1, { post_id, sticker_name }),
  deleteReaction: (post_id: number, sticker_name: string) =>
    apiCall("SYNO.Chat.Post.Reaction", "delete", 1, { post_id, sticker_name }),
  starChannel: (channel_id: number, star: boolean) =>
    apiCall("SYNO.Chat.Channel", star ? "star" : "unstar", 2, { channel_id }),
  /** Opens (or returns the existing) direct-message channel. `user_ids` must include every member, me too. */
  initiateDm: (user_ids: number[]) =>
    apiCall<Channel>("SYNO.Chat.Channel.Anonymous", "initiate", 2, { user_ids, encrypted: false, channel_key_encs: [] }),
  /** Opens (or returns) the conversation channel with a chatbot (type "chatbot"; its creator_id is the bot). */
  initiateChatbot: (user_id: number) =>
    apiCall<Channel>("SYNO.Chat.Channel.Chatbot", "initiate", 1, { user_id }),
  /** Per-user hide, shared with the official clients; the channel reappears when a new post arrives. */
  hideChannel: (channel_id: number) => apiCall("SYNO.Chat.Channel", "hide", 2, { channel_id }),

  // --- channel settings / members ---
  getMembers: async (channel_id: number) =>
    (await apiCall<{ user_ids: number[] }>("SYNO.Chat.Channel.Member", "get", 1, { channel_id })).user_ids,
  setChannelInfo: (channel_id: number, fields: { name?: string; purpose?: string }) =>
    apiCall("SYNO.Chat.Channel.Named", "set", 1, { channel_id, ...fields }),
  getPreference: (channel_id: number) =>
    apiCall<{ preferences?: ChannelPreference } & ChannelPreference>("SYNO.Chat.Channel.Preference", "get", 3, { channel_id }),
  setPreference: (channel_id: number, prefs: Partial<ChannelPreference>) =>
    apiCall("SYNO.Chat.Channel.Preference", "set", 3, { channel_id, ...prefs }),
  inviteUsers: (channel_id: number, user_ids: number[]) =>
    apiCall("SYNO.Chat.Channel.Named", "invite", 1, { channel_id, user_ids, channel_key_encs: [] }),
  kickUser: (channel_id: number, user_id: number) =>
    apiCall("SYNO.Chat.Channel.Named", "kick", 1, { channel_id, user_id }),
  leaveChannel: (channel_id: number) =>
    apiCall("SYNO.Chat.Channel", "leave", 2, { channel_id, conn_id: null }),

  // --- search ---
  search: (params: SearchParams) =>
    apiCall<SearchResult>("SYNO.Chat.Post", "search", 5, {
      keyword: params.keyword,
      // An empty `in` would mean "no channels"; omit it to search everywhere.
      ...(params.in?.length ? { in: params.in } : {}),
      ...(params.from?.length ? { from: params.from } : {}),
      ...(params.has?.length ? { has: params.has } : {}),
      ...(params.post_type?.length ? { post_type: params.post_type } : {}),
      ...(params.after ? { after: params.after } : {}),
      ...(params.before ? { before: params.before } : {}),
      offset: params.offset ?? 0,
      limit: params.limit ?? 25,
      ...(params.sort_by ? { sort_by: params.sort_by } : {}),
    }),
  listPinned: (channel_id: number, offset = 0, limit = 30) =>
    chat.search({ keyword: "", in: [channel_id], has: ["pin"], sort_by: "last_pin_at", offset, limit }),
  listLinks: (channel_id: number, offset = 0, limit = 30) =>
    chat.search({ keyword: "", in: [channel_id], has: ["url"], offset, limit }),
  listVotes: (channel_id: number, offset = 0, limit = 30) =>
    chat.search({ keyword: "", in: [channel_id], post_type: ["vote"], offset, limit }),
  listStarred: (offset = 0, limit = 30) =>
    chat.search({ keyword: "", has: ["star"], offset, limit }),
  /** My bookmarks inside one channel. */
  listStarredIn: (channel_id: number, offset = 0, limit = 30) =>
    chat.search({ keyword: "", in: [channel_id], has: ["star"], offset, limit }),
  /** Threads of one channel, newest activity first (`Post thread_list v5`). */
  listThreads: (channel_id: number, offset = 0, limit = 30) =>
    apiCall<{ search_results: Post[]; related_posts?: Post[]; total: number }>("SYNO.Chat.Post", "thread_list", 5, { channel_id, offset, limit }),
  /** Reminders inside one channel (`Post.Reminder list v1`). */
  listReminders: async (channel_id: number) =>
    ((await apiCall<{ posts?: Reminder[] }>("SYNO.Chat.Post.Reminder", "list", 1, { channel_id })).posts ?? []).map((p) => ({ ...p, channel_id: p.channel_id ?? channel_id })).sort((a, b) => (a.remind_at ?? 0) - (b.remind_at ?? 0)),

  // --- per-post actions ---
  pinPost: (post_id: number, pin: boolean) => apiCall("SYNO.Chat.Post", pin ? "pin" : "unpin", 5, { post_id }),
  starPost: (post_id: number, star: boolean) => apiCall("SYNO.Chat.Post", star ? "star" : "unstar", 5, { post_id }),
  editPost: (post_id: number, message: string) => apiCall<Post>("SYNO.Chat.Post", "set", 8, { post_id, message, conn_id: null }),
  deletePost: (post_id: number) => apiCall("SYNO.Chat.Post", "delete", 8, { post_id, conn_id: null }),

  // --- my collection ---
  /** Threads are listed per channel; aggregate over the given channels with compound requests. */
  listThreadsMany: async (channelIds: number[], limit = 20) => {
    const out: Post[] = [];
    for (let i = 0; i < channelIds.length; i += 40) {
      const ids = channelIds.slice(i, i + 40);
      const res = await apiCompound(ids.map((channel_id) => ({ api: "SYNO.Chat.Post", method: "thread_list", version: 5, channel_id, offset: 0, limit })));
      for (const r of res.result) {
        const d = r.data as { search_results?: Post[] } | undefined;
        if (r.success && d?.search_results) out.push(...d.search_results);
      }
    }
    return out.sort((a, b) => (b.last_comment_at ?? b.create_at) - (a.last_comment_at ?? a.create_at));
  },
  /** Reminders are listed per channel too. */
  listRemindersMany: async (channelIds: number[]) => {
    const out: Reminder[] = [];
    for (let i = 0; i < channelIds.length; i += 40) {
      const ids = channelIds.slice(i, i + 40);
      const res = await apiCompound(ids.map((channel_id) => ({ api: "SYNO.Chat.Post.Reminder", method: "list", version: 1, channel_id })));
      res.result.forEach((r, idx) => {
        const d = r.data as { posts?: Reminder[] } | undefined;
        if (r.success && d?.posts) out.push(...d.posts.map((p) => ({ ...p, channel_id: p.channel_id ?? ids[idx] })));
      });
    }
    return out.sort((a, b) => (a.remind_at ?? 0) - (b.remind_at ?? 0));
  },
  deleteReminder: (post_id: number) => apiCall("SYNO.Chat.Post.Reminder", "delete", 1, { post_id }),
  /** Scheduled posts for several channels in one round-trip. */
  listScheduledMany: async (channelIds: number[]) => {
    const out: ScheduledPost[] = [];
    for (let i = 0; i < channelIds.length; i += 40) {
      const ids = channelIds.slice(i, i + 40);
      const res = await apiCompound(ids.map((channel_id) => ({ api: "SYNO.Chat.Post.Schedule", method: "list", version: 1, channel_id })));
      res.result.forEach((r, idx) => {
        const d = r.data as { schedule_posts?: ScheduledPost[] } | undefined;
        if (r.success && d?.schedule_posts) out.push(...d.schedule_posts.map((p) => ({ ...p, channel_id: p.channel_id || ids[idx] })));
      });
    }
    return out.sort((a, b) => a.send_at - b.send_at);
  },

  // --- votes ---
  createVote: (channel_id: number, message: string, choices: string[], options: VoteOptions) =>
    apiCall<Post>("SYNO.Chat.Post.Vote", "create", 1, { channel_id, message, choices, options, conn_id: null }),
  vote: (post_id: number, choice_ids: string[]) =>
    apiCall("SYNO.Chat.Post.Vote", "vote", 1, { post_id, choice_ids, conn_id: null }),
  voteChoices: async (post_id: number) => (await apiCall<{ choices: VoteChoice[] }>("SYNO.Chat.Post.Vote", "get_choices", 1, { post_id })).choices,
  closeVote: (post_id: number) => apiCall("SYNO.Chat.Post.Vote", "close", 1, { post_id, conn_id: null }),
  deleteVote: (post_id: number) => apiCall("SYNO.Chat.Post.Vote", "delete", 1, { post_id, conn_id: null }),
  addVoteOption: (post_id: number, text: string) => apiCall("SYNO.Chat.Post.Vote", "create_option", 1, { post_id, text, conn_id: null }),
  /** Posts around a given post (for jump-to-message). */
  postsAround: async (channel_id: number, post_id: number, count = 25) =>
    (await apiCall<{ posts: Post[] }>("SYNO.Chat.Post", "list", 5, {
      channel_id, post_id, create_at: null, prev_count: count, next_count: count, thread_id: null,
    })).posts,
  /** Page anchored at a point in time (the server accepts create_at instead of post_id). */
  postsAtTime: async (channel_id: number, create_at: number, before = 5, after = 40) =>
    (await apiCall<{ posts: Post[] }>("SYNO.Chat.Post", "list", 5, {
      channel_id, post_id: null, create_at, prev_count: before, next_count: after, thread_id: null,
    })).posts,
  postsAfter: async (channel_id: number, post_id: number, count = 50) =>
    (await apiCall<{ posts: Post[] }>("SYNO.Chat.Post", "list", 5, {
      channel_id, post_id, create_at: null, prev_count: 0, next_count: count, thread_id: null,
    })).posts,

  // --- scheduled posts ---
  /** Requires a channel id (the server answers 401 without one). */
  listScheduled: async (channel_id: number) =>
    (await apiCall<{ schedule_posts: ScheduledPost[] }>("SYNO.Chat.Post.Schedule", "list", 1, { channel_id })).schedule_posts ?? [],
  createScheduled: (channel_id: number, message: string, send_at: number) =>
    apiCall("SYNO.Chat.Post.Schedule", "create", 1, { channel_id, message, send_at }),
  updateScheduled: (cronjob_id: number, message: string, send_at: number) =>
    apiCall("SYNO.Chat.Post.Schedule", "set", 1, { cronjob_id, message, send_at }),
  deleteScheduled: (cronjob_id: number) =>
    apiCall("SYNO.Chat.Post.Schedule", "delete", 1, { cronjob_id }),

  // --- snippets / files ---
  getSnippet: async (post_id: number) => {
    const d = await apiCall<{ snippet?: string; content?: string } | string>("SYNO.Chat.Post.Snippet", "get", 1, { post_id });
    return typeof d === "string" ? d : d.snippet ?? d.content ?? "";
  },
  setSnippet: (post_id: number, fields: { file_name?: string; message?: string; snippet?: string }) =>
    apiCall("SYNO.Chat.Post.Snippet", "set", 2, { post_id, ...fields }),
  fileUrl: (post_id: number) => mediaUrl("SYNO.Chat.Post.File", "get", 2, { post_id }),

  avatarUrl: (user: Pick<User, "user_id" | "avatar_version">, size: "small" | "large" = "small") =>
    mediaUrl("SYNO.Chat.User.Avatar", "get", 1, { user_id: user.user_id, type: size, v: user.avatar_version }),

  thumbnailUrl: (post_id: number) =>
    mediaUrl("SYNO.Chat.Post.File", "thumbnail", 2, { post_id, type: "large" }),
};
