/**
 * Dev-only: lets `pnpm dev` run in a plain browser (open http://localhost:1420/?mock) with fixture data,
 * so layout and theme work can be checked without a NAS or the Tauri shell. Never bundled into release builds
 * (main.tsx imports it only when `import.meta.env.DEV`).
 */
export {};

const now = Date.now();
const min = 60_000;

const ch = (id: number, name: string, type: string, extra: Record<string, unknown> = {}) => ({
  channel_id: id, name, type, purpose: "", is_joined: true, is_star: false, encrypted: false,
  unread: 0, unread_comment: 0, unread_mention: 0, unread_mention_comment: 0, unread_thread: {},
  last_post_at: now - id * 5 * min, last_view_at: now - id * 5 * min, total_member_count: 4, creator_id: 1, create_at: now - 86_400_000 * 30,
  ...extra,
});

const CHANNELS = [
  ch(1, "일반", "public", { is_star: true, unread: 3 }),
  ch(2, "개발", "private", { unread: 5, unread_mention: 1 }),
  ch(3, "디자인", "public", { unread: 2, preferences: { notification_mute: true } }),
  ch(4, "공지", "public"),
  ch(5, "", "anonymous", { members: [1, 2], unread: 1 }),
  ch(6, "", "anonymous", { members: [1, 3] }),
];

const USERS = [
  { user_id: 1, username: "duo", nickname: "듀오", avatar_version: 0, type: "human", deleted: false, is_disabled: false, status: "online" },
  { user_id: 2, username: "minji", nickname: "민지", avatar_version: 0, type: "human", deleted: false, is_disabled: false, status: "online" },
  { user_id: 3, username: "junho", nickname: "준호", avatar_version: 0, type: "human", deleted: false, is_disabled: false, status: "offline" },
  { user_id: 4, username: "soyeon", nickname: "소연", avatar_version: 0, type: "human", deleted: false, is_disabled: false, status: "offline" },
];

const post = (id: number, by: number, message: string, ago: number, extra: Record<string, unknown> = {}) => ({
  post_id: id, channel_id: 1, creator_id: by, create_at: now - ago * min, update_at: 0, delete_at: 0, message, type: "normal",
  thread_id: 0, comment_count: 0, reactions: [], mentions: [], hashtags: [], ...extra,
});

const POSTS = [
  post(101, 2, "오늘 배포 일정 확인 부탁드려요", 95),
  post(102, 3, "네, 4시쯤 가능합니다. 테스트 서버는 이미 올려 뒀어요", 92),
  post(103, 1, "좋아요. *릴리즈 노트*는 제가 정리할게요", 88),
  post(104, 2, "다크 모드 사이드바 구분이 좀 약하다는 얘기가 있었는데 확인해 볼 수 있을까요?", 40),
  post(105, 4, "```\nconst theme = { accent: '#8aa4ff' };\n```", 22),
  post(106, 1, "확인했습니다. 채널 선택 색도 같이 보겠습니다", 6),
];

function apiCall(api: string, method: string): unknown {
  switch (`${api}.${method}`) {
    case "SYNO.Chat.Channel.list": return { channels: CHANNELS };
    case "SYNO.Chat.User.list": return { users: USERS };
    case "SYNO.Chat.Misc.ntp": return { time: Date.now() };
    case "SYNO.Chat.Post.list": return { posts: POSTS };
    default: return {};
  }
}

async function invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  switch (cmd) {
    case "restore_session": return { host: "https://nas.example", user_id: 1, is_admin: false, current_time: Date.now() };
    case "api_call": return apiCall(String(args?.api), String(args?.method));
    case "api_compound": {
      const reqs = (args?.requests as { api: string; method: string; version: number }[]) ?? [];
      return { has_fail: false, result: reqs.map((r) => ({ ...r, success: true, data: { user_ids: [1, 2, 3, 4] } })) };
    }
    case "media_url": return "";
    default: return null; // sockets, plugins, window calls: no-ops
  }
}

let nextCb = 1;
(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  invoke,
  transformCallback: (cb?: (v: unknown) => void) => { const id = nextCb++; (window as unknown as Record<string, unknown>)[`_cb${id}`] = cb; return id; },
  unregisterCallback: () => undefined,
  convertFileSrc: (p: string) => p,
  metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
};
