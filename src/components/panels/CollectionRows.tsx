import dayjs from "dayjs";
import { Clock, Pencil, Trash2 } from "lucide-react";
import type { Post, Reminder, ScheduledPost } from "../../api/types";
import { channelLabel, useChat } from "../../store/chat";
import { useSession } from "../../store/session";
import { useUi } from "../../store/ui";
import { IconButton } from "../IconButton";

/** One reminder: when it fires, (optionally) the channel, and the reminded message. Click jumps to the post. */
export function ReminderRow({ r, showChannel, onRemove }: { r: Reminder; showChannel?: boolean; onRemove: () => void }) {
  const channels = useChat((s) => s.channels);
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.info?.user_id);
  const jumpToPost = useChat((s) => s.jumpToPost);
  const setView = useUi((s) => s.setView);
  const ch = r.channel_id ? channels[r.channel_id] : undefined;
  const post = (r as { post?: Post }).post;
  return (
    <div className="group px-4 py-2.5 border-b border-[var(--border)] hover:bg-[var(--hover)] cursor-pointer" onClick={() => { if (r.channel_id) { setView("channel"); void jumpToPost(r.channel_id, r.post_id); } }}>
      <div className="flex items-center gap-2 text-[11px] text-[var(--fg-muted)] mb-1">
        <Clock className="w-3 h-3" /><span className="font-medium text-[var(--fg)]">{r.remind_at ? dayjs(r.remind_at).format("M월 D일 (ddd) HH:mm") : ""}</span>
        {showChannel && ch && <><span>·</span><span className="truncate">{channelLabel(ch, users, me)}</span></>}
        <span className="ml-auto opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}><IconButton size="sm" label="삭제" onClick={onRemove}><Trash2 /></IconButton></span>
      </div>
      <div className="text-[13px] line-clamp-2">{(post?.message ?? r.message ?? "") as string}</div>
    </div>
  );
}

/** One scheduled message card with edit / delete. */
export function ScheduledCard({ p, showChannel, onEdit, onRemove }: { p: ScheduledPost; showChannel?: boolean; onEdit: () => void; onRemove: () => void }) {
  const channels = useChat((s) => s.channels);
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.info?.user_id);
  const ch = channels[p.channel_id];
  return (
    <div className="rounded-lg border border-[var(--border)] p-3 space-y-1">
      <div className="flex items-center justify-between text-[12px] text-[var(--fg-muted)]">
        <span className="truncate">{dayjs(p.send_at).format("M월 D일 (ddd) HH:mm")}{showChannel && ch && ` · ${channelLabel(ch, users, me)}`}</span>
        <span className="flex gap-[2px] shrink-0">
          <IconButton size="sm" label="편집" onClick={onEdit}><Pencil /></IconButton>
          <IconButton size="sm" label="삭제" onClick={onRemove}><Trash2 /></IconButton>
        </span>
      </div>
      <div className="text-[13px] whitespace-pre-wrap break-words line-clamp-4">{p.message}</div>
    </div>
  );
}
