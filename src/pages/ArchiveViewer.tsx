import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Archive, Bot, ChevronLeft, ExternalLink, Hash, Lock, MessageCircle, RefreshCw, Search } from "lucide-react";
import { archive, type ArchiveEntry, type ArchiveType } from "../api/client";
import type { Post } from "../api/types";
import { useChat, userLabel } from "../store/chat";
import { useSession } from "../store/session";
import { useUi } from "../store/ui";
import { Avatar } from "../components/Avatar";
import { GroupAvatars } from "../components/GroupAvatars";
import { FileIcon } from "../components/FileIcon";
import { ghostBtn, fieldClass } from "../components/Dialog";
import { formatBytes, formatDay, formatDateTime, formatTime, renderMessageHtml } from "../lib/format";
import { officialArchiveUrl, openExternal } from "../lib/external";

const TYPES: { key: ArchiveType; label: string; icon: React.ReactNode }[] = [
  { key: "private", label: "비공개 채널", icon: <Lock className="w-4 h-4" /> },
  { key: "public", label: "공개 채널", icon: <Hash className="w-4 h-4" /> },
  { key: "anonymous", label: "개인 대화", icon: <MessageCircle className="w-4 h-4" /> },
  { key: "chatbot", label: "봇", icon: <Bot className="w-4 h-4" /> },
];
const REASON: Record<string, string> = { channel_closed: "채널 보관됨", leave_channel: "내가 나감", user_trigger: "직접 보관" };

interface Group { name: string; archives: ArchiveEntry[] }
interface Open { group: Group; entry: ArchiveEntry }

/**
 * 보관 뷰어: history of channels that are no longer live for me (archived/closed, left, or archived on request),
 * from `SYNO.Chat.Archive list_name/list` and `Post list v5 {archive_id}`. Read-only.
 */
export function ArchiveViewer() {
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.info?.user_id);
  const [type, setType] = useState<ArchiveType>(useUi.getState().archiveType);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Open | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const load = (t: ArchiveType) => {
    setGroups(null); setError(null);
    archive.listAll(t).then((g) => setGroups(g.filter((x) => x.archives.length > 0))).catch((e) => { setError((e as { message?: string })?.message ?? String(e)); setGroups([]); });
  };
  useEffect(() => { load(type); setOpen(null); }, [type]);

  /** Anonymous archives are named by the member ids ("10,14,26"); show the people instead. */
  const memberIds = (g: Group) => (type === "anonymous" ? g.name.split(",").map((x) => Number(x)).filter((n) => n && n !== me) : []);
  const labelOf = (g: Group) => {
    if (type !== "anonymous") return g.name;
    const ids = memberIds(g);
    return ids.map((id) => userLabel(users[id])).join(", ") || g.name;
  };
  const k = q.trim().toLowerCase();
  const visible = useMemo(() => (groups ?? []).filter((g) => !k || labelOf(g).toLowerCase().includes(k)), [groups, k, users]); // eslint-disable-line react-hooks/exhaustive-deps

  const openEntry = (group: Group, entry: ArchiveEntry) => {
    setOpen({ group, entry }); setPosts(null); setReadError(null); setExhausted(false);
    archive.posts(entry.props.channel.channel_id, entry.archive_id).then((p) => { const sorted = [...p].sort((a, b) => a.create_at - b.create_at); setPosts(sorted); setExhausted(sorted.length < 60); }).catch((e) => setReadError((e as { message?: string })?.message ?? String(e)));
  };
  const older = async () => {
    if (!open || !posts?.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const first = posts[0].post_id;
      const more = await archive.posts(open.entry.props.channel.channel_id, open.entry.archive_id, first);
      const seen = new Set(posts.map((p) => p.post_id));
      const fresh = more.filter((p) => !seen.has(p.post_id)).sort((a, b) => a.create_at - b.create_at);
      setPosts([...fresh, ...posts]);
      if (fresh.length === 0) setExhausted(true);
    } finally { setLoadingMore(false); }
  };

  const period = (e: ArchiveEntry) => `${formatDay(e.post_start)} ~ ${formatDay(e.post_end)}`;

  const list = (
    <div className="flex-1 overflow-y-auto p-5 max-w-[900px]">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {TYPES.map((t) => (
          <button key={t.key} className={clsx("inline-flex items-center gap-1.5 rounded-full border px-3 py-[4px] text-[12.5px]", type === t.key ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--hover)]")} onClick={() => setType(t.key)}>{t.icon}{t.label}</button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--fg-muted)]" />
          <input className={`${fieldClass} !pl-7 !py-1 !text-[12.5px] w-[220px]`} placeholder="채널·사람 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <p className="text-[12px] text-[var(--fg-muted)] mb-3">보관됐거나 내가 나간 채널의 대화 기록입니다. 기간별로 묶여 있고 읽기만 할 수 있습니다.</p>
      {error && <p className="text-[12px] text-red-500 mb-3">{error}</p>}
      {!groups ? <p className="text-[12px] text-[var(--fg-muted)]">불러오는 중…</p> : visible.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-[var(--fg-muted)]"><Archive className="w-8 h-8 mx-auto mb-2 opacity-40" />{k ? "검색 결과가 없습니다." : "이 종류의 보관 기록이 없습니다."}</div>
      ) : (
        <ul className="space-y-2">
          {visible.map((g) => {
            const ids = memberIds(g);
            const chan = g.archives[0].props.channel;
            return (
              <li key={g.name} className="rounded-lg border border-[var(--border)]">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-muted)] text-[var(--fg-muted)]">
                    {type === "anonymous" && ids.length >= 2 ? <GroupAvatars userIds={ids} size={20} /> : type === "anonymous" && ids[0] ? <Avatar userId={ids[0]} size={32} /> : type === "private" ? <Lock className="w-4 h-4" /> : type === "public" ? <Hash className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[13.5px] truncate">{labelOf(g)}</div>
                    <div className="text-[11.5px] text-[var(--fg-muted)] truncate">{chan.purpose ? `${chan.purpose} · ` : ""}{chan.total_member_count ? `멤버 ${chan.total_member_count}명 · ` : ""}기록 {g.archives.length}개</div>
                  </div>
                </div>
                <ul className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                  {[...g.archives].sort((a, b) => b.post_end - a.post_end).map((e) => (
                    <li key={e.archive_id}>
                      <button type="button" className="w-full flex items-center gap-3 px-3 py-2 text-left text-[12.5px] hover:bg-[var(--hover)]" onClick={() => openEntry(g, e)}>
                        <span className="tabular-nums">{period(e)}</span>
                        <span className="rounded border border-[var(--border)] px-1.5 text-[10.5px] text-[var(--fg-muted)]">{REASON[e.props.reason ?? ""] ?? e.props.reason ?? "보관"}</span>
                        {e.props.trigger_user_id && <span className="text-[11px] text-[var(--fg-muted)]">{userLabel(users[e.props.trigger_user_id])}</span>}
                        <span className="ml-auto text-[11px] text-[var(--accent)]">열기</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const reader = open && (
    <div className="flex-1 overflow-y-auto">
      {readError ? (
        <div className="p-8 text-center text-[13px] text-[var(--fg-muted)] space-y-3">
          <p>이 기록을 읽지 못했습니다.<br /><span className="text-[11.5px]">({readError})</span></p>
          <button className={`${ghostBtn} inline-flex items-center gap-1.5`} onClick={() => openExternal(officialArchiveUrl())}>공식 보관 뷰어 열기 (브라우저) <ExternalLink className="w-3.5 h-3.5" /></button>
        </div>
      ) : !posts ? <p className="p-5 text-[12px] text-[var(--fg-muted)]">불러오는 중…</p> : (
        <div className="py-2">
          {!exhausted && posts.length > 0 && <div className="px-5 py-2"><button className={`${ghostBtn} w-full !py-1`} disabled={loadingMore} onClick={() => void older()}>{loadingMore ? "불러오는 중…" : "이전 메시지 더 보기"}</button></div>}
          {posts.length === 0 && <p className="p-8 text-center text-[13px] text-[var(--fg-muted)]">메시지가 없습니다.</p>}
          {posts.map((p, i) => {
            const prev = posts[i - 1];
            const newDay = !prev || formatDay(prev.create_at) !== formatDay(p.create_at);
            const continued = !!prev && !newDay && prev.creator_id === p.creator_id && p.create_at - prev.create_at < 5 * 60_000 && p.type !== "system";
            return (
              <div key={p.post_id}>
                {newDay && <div className="my-3 flex items-center gap-3 px-5 text-[11px] text-[var(--fg-muted)]"><span className="h-px flex-1 bg-[var(--border)]" />{formatDay(p.create_at)}<span className="h-px flex-1 bg-[var(--border)]" /></div>}
                <div className={clsx("flex gap-3 px-5", continued ? "py-[2px]" : "pt-3 pb-[2px]")}>
                  <div className="w-9 shrink-0 flex justify-center">{continued ? <span className="text-[10px] text-[var(--fg-muted)] opacity-0 hover:opacity-100">{formatTime(p.create_at)}</span> : p.type === "system" ? null : <Avatar userId={p.creator_id} size={36} />}</div>
                  <div className="min-w-0 flex-1">
                    {!continued && p.type !== "system" && <div className="flex items-baseline gap-2 text-[13px]"><span className="font-semibold">{userLabel(users[p.creator_id])}</span><span className="text-[11px] text-[var(--fg-muted)]">{formatDateTime(p.create_at)}</span></div>}
                    {p.type === "system" ? <div className="text-[12px] text-[var(--fg-muted)] italic">시스템 메시지 · {formatDateTime(p.create_at)}</div> : p.message ? <div className="msg-body whitespace-pre-wrap break-words leading-[1.55] text-[14px]" dangerouslySetInnerHTML={{ __html: renderMessageHtml(p.message, users) }} /> : null}
                    {p.type === "file" && p.file_props && (
                      <div className="mt-1 inline-flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-1.5 max-w-[420px]">
                        <FileIcon name={p.file_props.name} size={32} />
                        <div className="min-w-0"><div className="truncate text-[13px] font-medium">{p.file_props.name}</div><div className="text-[12px] text-[var(--fg-muted)]">{formatBytes(p.file_props.size)}</div></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <p className="px-5 py-3 text-[11px] text-[var(--fg-muted)]">읽기 전용 · {period(open.entry)} · {posts.length}개 표시</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="titlebar-drag h-[52px] shrink-0 flex items-center gap-3 px-5 border-b border-[var(--border)]">
        {open ? (
          <>
            <button className="titlebar-nodrag inline-flex items-center gap-1 text-[12.5px] text-[var(--fg-muted)] hover:text-[var(--fg)]" onClick={() => setOpen(null)}><ChevronLeft className="w-4 h-4" /> 보관 목록</button>
            <div className="font-semibold text-[15px] truncate">{labelOf(open.group)}</div>
            <span className="rounded border border-[var(--border)] px-1.5 text-[11px] text-[var(--fg-muted)]">{REASON[open.entry.props.reason ?? ""] ?? "보관"} · 읽기 전용</span>
          </>
        ) : (
          <>
            <Archive className="w-4 h-4 text-[var(--fg-muted)]" />
            <div className="font-semibold text-[15px]">보관 뷰어</div>
            <div className="titlebar-nodrag ml-auto flex items-center gap-1.5">
              <button className={`${ghostBtn} inline-flex items-center gap-1.5 !py-1`} onClick={() => load(type)}><RefreshCw className="w-3.5 h-3.5" /> 새로고침</button>
              <button className={`${ghostBtn} inline-flex items-center gap-1.5 !py-1`} title="브라우저에서 공식 보관 뷰어를 엽니다" onClick={() => openExternal(officialArchiveUrl())}>공식 보관 뷰어 <ExternalLink className="w-3.5 h-3.5" /></button>
            </div>
          </>
        )}
      </header>
      {open ? reader : list}
    </div>
  );
}
