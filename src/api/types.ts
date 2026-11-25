export type ChannelType = "public" | "private" | "anonymous" | "chatbot" | "synobot";

export interface Channel {
  channel_id: number;
  name: string;
  type: ChannelType;
  purpose: string;
  is_joined: boolean;
  is_star: boolean;
  encrypted: boolean;
  unread: number;
  unread_comment: number;
  unread_mention: number;
  unread_mention_comment: number;
  unread_thread: Record<string, unknown>;
  last_post_at: number;
  last_view_at: number;
  total_member_count: number;
  creator_id: number;
  create_at: number;
  preferences?: Partial<ChannelPreference>;
  /** Server-side per-user hide (Channel hide v2). The channel is hidden while last_hide_at > last_post_at. */
  last_hide_at?: number;
  hide_global_at?: number;
  /** Member user ids; present on DM/bot channels in the list response. */
  members?: number[];
  /** Filled in by the client via Channel.Member.get when `members` is absent. */
  member_ids?: number[];
}

export interface User {
  user_id: number;
  username: string;
  nickname: string;
  avatar_version: number;
  status?: "online" | "offline";
  type: "human" | "bot";
  /** "dsm" for normal accounts, "guest" for channel guests (official: only dsm users can get a 1:1). */
  human_type?: string;
  /** Bots only: synobot | chatbot | incoming | outgoing | slash | broadcast. Only chatbots have a conversation channel. */
  bot_type?: string;
  deleted: boolean;
  is_disabled: boolean;
  dsm_uid?: number;
  first_time_login?: boolean;
  user_props?: { description?: string; email?: string; timezone?: string; avatar_color?: string; is_always_offline?: boolean; [k: string]: unknown };
}

export interface FileProps {
  name: string;
  size: number;
  type: string;
  is_image: boolean;
  is_snippet: boolean;
  is_voice_msg: boolean;
  image?: { width: number; height: number };
  snippet_preview?: string;
}

export interface Reaction {
  /** Emoji shortname (server field). */
  sticker_name?: string;
  /** Legacy alias. */
  name?: string;
  user_ids?: number[];
  count?: number;
}

export interface Post {
  post_id: number;
  channel_id: number;
  creator_id: number;
  create_at: number;
  update_at: number;
  delete_at: number;
  message: string;
  type: "normal" | "file" | "system" | string;
  /** Present on type==="system"; `event` decides how the line is rendered (see SystemMessage.tsx). */
  system_props?: {
    event: string;
    channel_id?: number;
    post_id?: number;
    thread_id?: number;
    trigger_user_id?: number;
    effective_user_id?: number;
    target_user_ids?: number[];
    channel_name?: string;
    extra?: { update_info?: { attr: string; old?: string; new?: string }[]; [k: string]: unknown };
  };
  thread_id: number;
  comment_count: number;
  reactions: Reaction[];
  mentions: { user_id?: number; type?: string; name?: string }[];
  hashtags: string[];
  file_props?: FileProps;
  url_props?: { url?: string; title?: string; description?: string; image?: string; favicon?: string; hidden?: boolean }[];
  props?: { encrypted?: boolean; forward?: { type: string }; vote?: VoteProps };
  /** Vote posts carry their own vote state too (merged from props.vote). */
  last_comment_at?: number;
  is_star: boolean;
  is_sticky: boolean;
  last_pin_at: number;
  /** Client-only: set while an optimistic post is in flight. */
  _pending?: boolean;
  _failed?: boolean;
  /** Client-only: why the last send attempt failed (shown next to 재전송/취소). */
  _error?: string;
}

export interface ChannelPreference {
  notification_desktop: "all" | "mention_subscribe" | "mention" | "none" | "by_admin_console";
  notification_mobile: "all" | "mention_subscribe" | "mention" | "none" | "by_admin_console";
  notification_mute: boolean;
}

export interface SearchParams {
  keyword: string;
  in?: number[];
  from?: number[];
  has?: string[];
  post_type?: string[];
  after?: number | null;
  before?: number | null;
  offset?: number;
  limit?: number;
  sort_by?: string;
}

export interface SearchResult {
  search_results: Post[];
  total: number;
  offset: number;
  limit: number;
}

export interface ScheduledPost {
  cronjob_id: number;
  channel_id: number;
  message: string;
  send_at: number;
  creator_id?: number;
  create_at?: number;
}

export interface VoteChoice {
  id: string;
  text: string;
  count: number;
  /** Present only from `get_choices` (and only when the vote is not anonymous). */
  voters?: number[];
}

export interface VoteOptions {
  multiple: boolean;
  anonymous: boolean;
  add_option: boolean;
  /** epoch ms, 0 = no expiry */
  expire_at: number;
}

export interface VoteProps {
  choices: VoteChoice[];
  options: VoteOptions;
  state: string; // "open" | "closed"
}

export interface Reminder {
  reminder_id?: number;
  post_id: number;
  channel_id?: number;
  remind_at: number;
  message?: string;
  [k: string]: unknown;
}

/** Who has seen one of my posts (Post get_read_status v6, normalised to user ids). */
export interface ReadStatus {
  read: number[];
  unread: number[];
  /** When it was fetched (ms). */
  at: number;
}

export interface LoginInfo {
  host: string;
  user_id: number;
  is_admin: boolean;
  current_time: number;
}

export interface AppErrorPayload {
  kind: "not_logged_in" | "otp_required" | "login_failed" | "api" | "http" | "other";
  code: number | null;
  message: string;
}
