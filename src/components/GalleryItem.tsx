import { memo, useEffect, useState } from "react";
import clsx from "clsx";
import { Download, Trash2 } from "lucide-react";
import { chat } from "../api/client";
import type { Post } from "../api/types";
import { useChat, userBadge, userLabel } from "../store/chat";
import { useSession } from "../store/session";
import { useImageViewer } from "../store/imageViewer";
import { formatTime } from "../lib/format";
import { Avatar } from "./Avatar";
import { openUserCard } from "./UserCard";
import { downloadPost } from "./ImageViewer";
import { ReadBadge } from "./ReadBadge";
import { confirmAsk } from "../lib/confirm";

/** Tiles shown before the rest collapses into a "+N" tile. */
const MAX_TILES = 9;

/** The server thumbnail (URL carries the session, so it is resolved asynchronously); a pulsing square until it arrives. */
function Thumb({ post }: { post: Post }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    chat.thumbnailUrl(post.post_id).then((u) => alive && setSrc(u)).catch(() => null);
    return () => { alive = false; };
  }, [post.post_id]);
  if (!src) return <div className="h-full w-full animate-pulse bg-[var(--bg-muted)]" />;
  return <img src={src} alt={post.file_props?.name ?? ""} loading="lazy" draggable={false} className="h-full w-full object-cover" />;
}

interface Props {
  /** Two or more plain image posts from one sender, oldest first (see buildRows in MessageList). */
  posts: Post[];
  continued: boolean;
  isMine: boolean;
  afterBreak?: boolean;
  /** The post to highlight after a jump, when it is one of these. */
  flashId?: number | null;
}

/**
 * Several photos sent together, as one grid instead of a column of large previews. Each tile opens the image
 * viewer (←/→ then walk the channel's images as usual); hovering a tile offers download and, for my photos,
 * delete. Reactions, replies, pins and forwarding stay on single-image rows: a photo that gains any of those
 * is no longer "plain" and leaves the group.
 */
export const GalleryItem = memo(function GalleryItem({ posts, continued, isMine, afterBreak, flashId }: Props) {
  const first = posts[0];
  const user = useChat((s) => s.users[first.creator_id]);
  const me = useSession((s) => s.info?.user_id);
  const onPostDelete = useChat((s) => s.onPostDelete);
  const cols = posts.length === 2 || posts.length === 4 ? 2 : 3;
  const shown = posts.length > MAX_TILES ? posts.slice(0, MAX_TILES) : posts;
  const hidden = posts.length - shown.length;

  const open = (p: Post) => useImageViewer.getState().open(p.channel_id, p.post_id);
  const remove = async (p: Post) => {
    if (!await confirmAsk("이 사진을 삭제할까요?")) return;
    try { await chat.deletePost(p.post_id); onPostDelete(p.channel_id, p.post_id); } catch (e) { alert(`삭제 실패: ${(e as { message?: string })?.message ?? e}`); }
  };

  return (
    <div
      data-msg
      data-sender={userLabel(user)}
      data-at={first.create_at}
      className={clsx("group relative flex gap-4 px-5 hover:bg-[var(--hover)]", continued ? "py-[2px]" : afterBreak ? "pt-2 pb-[2px]" : "pt-4 pb-[2px]", flashId && "msg-flash")}
    >
      <div className="w-9 shrink-0">
        {continued ? (
          <div className="w-9 text-right text-[10.5px] leading-[18px] text-[var(--fg-muted)] opacity-0 group-hover:opacity-100 pt-[2px] select-none tabular-nums whitespace-nowrap">{formatTime(first.create_at)}</div>
        ) : (
          <button type="button" title="프로필 보기" className="block rounded-lg hover:ring-2 hover:ring-[var(--accent)]/50" onClick={openUserCard(first.creator_id)}>
            <Avatar userId={first.creator_id} size={36} />
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!continued && (
          <div className="flex items-baseline gap-2 leading-tight">
            <button type="button" title="프로필 보기" className={clsx("font-semibold text-[14px] hover:underline", isMine && "text-[var(--accent)]", userBadge(user) && "text-[var(--fg-muted)]")} onClick={openUserCard(first.creator_id)}>{userLabel(user)}</button>
            {userBadge(user) && <span className="rounded px-1 text-[10px] leading-[16px] bg-[var(--bg-muted)] text-[var(--fg-muted)] border border-[var(--border)]">{userBadge(user)}</span>}
            <span className="text-[11px] text-[var(--fg-muted)]">{formatTime(first.create_at)}</span>
            <span className="text-[11px] text-[var(--fg-muted)]">사진 {posts.length}장</span>
            {isMine && <ReadBadge post={posts[posts.length - 1]} />}
          </div>
        )}
        {continued && isMine && <div className="flex justify-end -mb-1"><ReadBadge post={posts[posts.length - 1]} /></div>}
        <div className={clsx("mt-1 grid gap-1 w-[360px] max-w-full", cols === 2 ? "grid-cols-2" : "grid-cols-3")}>
          {shown.map((p, i) => {
            const last = i === shown.length - 1 && hidden > 0;
            const mine = p.creator_id === me;
            return (
              <div key={p.post_id} className={clsx("group/tile relative aspect-square overflow-hidden rounded-lg bg-[var(--bg-muted)]", flashId === p.post_id && "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]")}>
                <button type="button" className="block h-full w-full cursor-zoom-in" title={p.file_props?.name} onClick={() => open(p)}>
                  <Thumb post={p} />
                  {last && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white text-[18px] font-semibold">+{hidden}</span>}
                </button>
                {!last && (
                  <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover/tile:opacity-100 focus-within:opacity-100">
                    <button type="button" title="다운로드" aria-label="다운로드" className="flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white hover:bg-black/75" onClick={(e) => { e.stopPropagation(); void downloadPost(p); }}><Download className="h-3.5 w-3.5" /></button>
                    {mine && <button type="button" title="삭제" aria-label="삭제" className="flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white hover:bg-red-600" onClick={(e) => { e.stopPropagation(); void remove(p); }}><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
