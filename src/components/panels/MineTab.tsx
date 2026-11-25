import { useEffect, useState } from "react";
import { Bookmark, Plus } from "lucide-react";
import { chat } from "../../api/client";
import type { Post, Reminder, ScheduledPost } from "../../api/types";
import { useChat } from "../../store/chat";
import { IconButton } from "../IconButton";
import { ghostBtn } from "../Dialog";
import { emptyState } from "./PanelShell";
import { PostListItem } from "./PostListItem";
import { ReminderRow, ScheduledCard } from "./CollectionRows";
import { ScheduleDialog } from "../ScheduleDialog";

export type MineTabKey = "bookmarks" | "threads" | "reminders" | "scheduled";

/** Paged bookmark / thread list for one channel. */
function usePaged(channelId: number, tab: "bookmarks" | "threads") {
  const [items, setItems] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async (offset: number) => {
    setLoading(true); setError(null);
    try {
      const r = tab === "bookmarks" ? await chat.listStarredIn(channelId, offset, 30) : await chat.listThreads(channelId, offset, 30);
      const list = r.search_results.map((p) => ({ ...p, channel_id: p.channel_id || channelId }));
      setItems((prev) => (offset ? [...prev, ...list] : list));
      setTotal(r.total);
    } catch (e) { setError((e as { message?: string })?.message ?? String(e)); } finally { setLoading(false); }
  };
  useEffect(() => { setItems([]); setTotal(0); void load(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [channelId, tab]);
  return { items, total, loading, error, more: () => load(items.length), setItems };
}

function PostsList({ channelId, tab }: { channelId: number; tab: "bookmarks" | "threads" }) {
  const { items, total, loading, error, more, setItems } = usePaged(channelId, tab);
  const unstar = async (p: Post) => {
    await chat.starPost(p.post_id, false).catch(() => null);
    setItems((prev) => prev.filter((x) => x.post_id !== p.post_id));
    useChat.getState().onPostUpdate({ ...p, is_star: false });
  };
  return (
    <div>
      {error && <p className="p-3 text-[12px] text-red-500">{error}</p>}
      {!loading && !error && items.length === 0 && emptyState(tab === "bookmarks" ? "이 채널에 북마크한 메시지가 없습니다. 메시지에 마우스를 올리고 북마크 아이콘을 누르세요." : "이 채널에 스레드(댓글이 달린 메시지)가 없습니다.")}
      {items.map((p) => (
        <PostListItem key={p.post_id} post={p} right={tab === "bookmarks" ? <IconButton size="sm" label="북마크 해제" onClick={() => void unstar(p)}><Bookmark className="fill-current" /></IconButton> : undefined} />
      ))}
      {items.length < total && <button className={`${ghostBtn} m-3 w-[calc(100%-24px)]`} disabled={loading} onClick={() => void more()}>더 보기 ({items.length}/{total})</button>}
    </div>
  );
}

function RemindersList({ channelId }: { channelId: number }) {
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => chat.listReminders(channelId).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  useEffect(() => { setLoading(true); void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [channelId]);
  const remove = async (r: Reminder) => { await chat.deleteReminder(r.post_id).catch(() => null); void load(); };
  return (
    <div>
      {loading && emptyState("불러오는 중…")}
      {!loading && items.length === 0 && emptyState("이 채널에 리마인더가 없습니다. 메시지 메뉴의 \"리마인더\"로 추가합니다.")}
      {items.map((r, i) => <ReminderRow key={`${r.post_id}-${i}`} r={r} onRemove={() => void remove(r)} />)}
    </div>
  );
}

function ScheduledList({ channelId }: { channelId: number }) {
  const [items, setItems] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ScheduledPost | "new" | null>(null);
  const load = () => chat.listScheduled(channelId).then((l) => setItems(l.map((p) => ({ ...p, channel_id: p.channel_id || channelId })).sort((a, b) => a.send_at - b.send_at))).catch(() => setItems([])).finally(() => setLoading(false));
  useEffect(() => { setLoading(true); void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [channelId]);
  const remove = async (p: ScheduledPost) => { if (!confirm("예약을 삭제할까요?")) return; await chat.deleteScheduled(p.cronjob_id).catch(() => null); void load(); };
  return (
    <div className="p-3 space-y-2">
      <button className={`${ghostBtn} w-full inline-flex items-center justify-center gap-1.5 !py-1`} onClick={() => setEditing("new")}><Plus className="w-3.5 h-3.5" /> 이 채널에 예약 메시지 추가</button>
      {loading && emptyState("불러오는 중…")}
      {!loading && items.length === 0 && emptyState("이 채널에 예약된 메시지가 없습니다.")}
      {items.map((p) => <ScheduledCard key={p.cronjob_id} p={p} onEdit={() => setEditing(p)} onRemove={() => void remove(p)} />)}
      {editing && <ScheduleDialog channelId={channelId} existing={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </div>
  );
}

/** 북마크 / 스레드 / 리마인더 / 예약 — the "내 항목" group of the channel info panel, scoped to one channel. */
export function MineTab({ channelId, tab }: { channelId: number; tab: MineTabKey }) {
  if (tab === "reminders") return <RemindersList channelId={channelId} />;
  if (tab === "scheduled") return <ScheduledList channelId={channelId} />;
  return <PostsList channelId={channelId} tab={tab} />;
}
