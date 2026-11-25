import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Bookmark, Clock, MessageSquare } from "lucide-react";
import { chat } from "../api/client";
import type { Post, Reminder, ScheduledPost } from "../api/types";
import { useChat } from "../store/chat";
import { PostListItem } from "../components/panels/PostListItem";
import { emptyState } from "../components/panels/PanelShell";
import { IconButton } from "../components/IconButton";
import { ReminderRow, ScheduledCard } from "../components/panels/CollectionRows";
import { ScheduleDialog } from "../components/ScheduleDialog";
import { ghostBtn } from "../components/Dialog";

type Tab = "bookmarks" | "threads" | "reminders" | "scheduled";
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "bookmarks", label: "북마크", icon: <Bookmark className="w-4 h-4" /> },
  { key: "threads", label: "스레드", icon: <MessageSquare className="w-4 h-4" /> },
  { key: "reminders", label: "리마인더", icon: <Clock className="w-4 h-4" /> },
  { key: "scheduled", label: "예약 메시지", icon: <Clock className="w-4 h-4" /> },
];

/** Channels worth aggregating per-channel lists over: starred + recently active, capped. */
function useRecentChannelIds(limit = 40) {
  const channels = useChat((s) => s.channels);
  return useMemo(() => Object.values(channels).filter((c) => c.is_joined && c.type !== "synobot").sort((a, b) => Number(b.is_star) - Number(a.is_star) || b.last_post_at - a.last_post_at).slice(0, limit).map((c) => c.channel_id), [channels, limit]);
}

export function Collection() {
  const [tab, setTab] = useState<Tab>("bookmarks");
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="titlebar-drag h-[52px] shrink-0 flex items-center px-5 border-b border-[var(--border)]">
        <div className="font-semibold text-[15px]">내 컬렉션</div>
      </header>
      <div className="flex border-b border-[var(--border)] px-3">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={clsx("px-3 py-2.5 text-[13px] border-b-2 -mb-px inline-flex items-center gap-1.5", tab === t.key ? "border-[var(--accent)] text-[var(--fg)] font-medium" : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]")}>{t.icon}{t.label}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "bookmarks" && <Bookmarks />}
        {tab === "threads" && <Threads />}
        {tab === "reminders" && <Reminders />}
        {tab === "scheduled" && <Scheduled />}
      </div>
    </div>
  );
}

function Bookmarks() {
  const [items, setItems] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const load = async (offset: number) => { setLoading(true); try { const r = await chat.listStarred(offset, 30); setItems((p) => (offset ? [...p, ...r.search_results] : r.search_results)); setTotal(r.total); } finally { setLoading(false); } };
  useEffect(() => { void load(0); }, []);
  const unstar = async (p: Post) => { await chat.starPost(p.post_id, false).catch(() => null); setItems((prev) => prev.filter((x) => x.post_id !== p.post_id)); useChat.getState().onPostUpdate({ ...p, is_star: false }); };
  return (
    <div className="w-full">
      {!loading && items.length === 0 && emptyState("북마크한 메시지가 없습니다. 메시지에 마우스를 올리고 북마크 아이콘을 누르세요.")}
      {items.map((p) => <PostListItem key={p.post_id} post={p} showChannel right={<IconButton size="sm" label="북마크 해제" onClick={() => void unstar(p)}><Bookmark className="fill-current" /></IconButton>} />)}
      {items.length < total && <button className={`${ghostBtn} m-3`} disabled={loading} onClick={() => void load(items.length)}>더 보기</button>}
    </div>
  );
}

function Threads() {
  const ids = useRecentChannelIds();
  const [items, setItems] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let alive = true; setLoading(true); chat.listThreadsMany(ids, 10).then((l) => alive && setItems(l)).finally(() => alive && setLoading(false)); return () => { alive = false; }; }, [ids]);
  return (
    <div className="w-full">
      {loading && emptyState("불러오는 중…")}
      {!loading && items.length === 0 && emptyState("스레드가 없습니다.")}
      {items.map((p) => <PostListItem key={p.post_id} post={p} showChannel />)}
    </div>
  );
}

function Reminders() {
  const ids = useRecentChannelIds();
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => chat.listRemindersMany(ids).then(setItems).finally(() => setLoading(false));
  useEffect(() => { setLoading(true); void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ids]);
  const remove = async (r: Reminder) => { await chat.deleteReminder(r.post_id).catch(() => null); void load(); };
  return (
    <div className="w-full">
      {loading && emptyState("불러오는 중…")}
      {!loading && items.length === 0 && emptyState("리마인더가 없습니다.")}
      {items.map((r, i) => <ReminderRow key={`${r.post_id}-${i}`} r={r} showChannel onRemove={() => void remove(r)} />)}
    </div>
  );
}

function Scheduled() {
  const ids = useRecentChannelIds();
  const [items, setItems] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ScheduledPost | null>(null);
  const load = () => chat.listScheduledMany(ids).then(setItems).finally(() => setLoading(false));
  useEffect(() => { setLoading(true); void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ids]);
  const remove = async (p: ScheduledPost) => { if (!confirm("예약을 삭제할까요?")) return; await chat.deleteScheduled(p.cronjob_id); void load(); };
  return (
    <div className="w-full p-3 space-y-2">
      {loading && emptyState("불러오는 중…")}
      {!loading && items.length === 0 && emptyState("예약된 메시지가 없습니다. 입력창의 시계 아이콘으로 예약할 수 있습니다.")}
      {items.map((p) => <ScheduledCard key={p.cronjob_id} p={p} showChannel onEdit={() => setEditing(p)} onRemove={() => void remove(p)} />)}
      {editing && <ScheduleDialog channelId={editing.channel_id} existing={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </div>
  );
}
