import { ExternalLink, MessageSquare, Pin } from "lucide-react";
import { openExternal } from "../../lib/external";
import type { Post } from "../../api/types";
import { channelLabel, useChat, userLabel } from "../../store/chat";
import { useSession } from "../../store/session";
import { useUi } from "../../store/ui";
import { formatDateTime, previewText, renderMessageHtml } from "../../lib/format";
import { Avatar } from "../Avatar";

/** Compact post row used by board / collection lists; click jumps to the message. */
export function PostListItem({ post, showChannel, right }: { post: Post; showChannel?: boolean; right?: React.ReactNode }) {
  const users = useChat((s) => s.users);
  const channels = useChat((s) => s.channels);
  const jumpToPost = useChat((s) => s.jumpToPost);
  const setView = useUi((s) => s.setView);
  const me = useSession((s) => s.info?.user_id);
  const ch = channels[post.channel_id];
  const jump = () => { setView("channel"); void jumpToPost(post.channel_id, post.post_id); };
  const urls = (post.url_props ?? []) as { url?: string; title?: string }[];
  return (
    <div className="group px-4 py-2.5 border-b border-[var(--border)] hover:bg-[var(--hover)] cursor-pointer" onClick={jump}>
      <div className="flex items-center gap-2 text-[11px] text-[var(--fg-muted)] mb-1">
        <Avatar userId={post.creator_id} size={18} />
        <span className="font-medium text-[var(--fg)]">{userLabel(users[post.creator_id])}</span>
        {showChannel && ch && <><span>·</span><span className="truncate">{channelLabel(ch, users, me)}</span></>}
        <span className="ml-auto shrink-0">{formatDateTime(post.create_at)}</span>
        {right && <span onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100">{right}</span>}
      </div>
      {post.type === "file" ? (
        <div className="text-[13px] text-[var(--fg-muted)]">{previewText(post, users)}</div>
      ) : (
        <div className="msg-body text-[13px] leading-[1.45] line-clamp-3 break-words" dangerouslySetInnerHTML={{ __html: renderMessageHtml(post.message, users) }} />
      )}
      {urls.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {urls.slice(0, 2).map((u, i) => u.url && (
            <button key={i} onClick={(e) => { e.stopPropagation(); openExternal(u.url!); }} className="flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline max-w-full">
              <ExternalLink className="w-3 h-3 shrink-0" /><span className="truncate">{u.title || u.url}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-3 mt-1 text-[11px] text-[var(--fg-muted)]">
        {post.comment_count > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="w-3 h-3" />{post.comment_count}</span>}
        {post.is_sticky && <span className="inline-flex items-center gap-1"><Pin className="w-3 h-3" />고정</span>}
      </div>
    </div>
  );
}
