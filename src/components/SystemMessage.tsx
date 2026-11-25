import { useEffect, useState } from "react";
import clsx from "clsx";
import { CornerDownRight } from "lucide-react";
import type { Post } from "../api/types";
import { chat } from "../api/client";
import { useChat, userLabel } from "../store/chat";
import { previewText, renderMessageHtml } from "../lib/format";

/** Related posts fetched for system lines (pin / thread.create), keyed by post id. */
const relatedCache = new Map<number, Post | null>();

/** Finds the post a system line refers to: in the loaded channel/thread first, else one fetch. */
function useRelatedPost(channelId: number, postId?: number, threadId?: number): Post | null | undefined {
  const inChannel = useChat((s) => (postId ? s.posts[channelId]?.items.find((p) => p.post_id === postId) : undefined));
  const inThread = useChat((s) => (postId && threadId ? s.threads[threadId]?.items.find((p) => p.post_id === postId) : undefined));
  const [fetched, setFetched] = useState<Post | null | undefined>(postId ? relatedCache.get(postId) : null);
  useEffect(() => {
    if (!postId || inChannel || inThread || relatedCache.has(postId)) return;
    let alive = true;
    chat.listPosts(channelId, { beforePostId: postId, prevCount: 1, threadId: threadId || undefined })
      .then((posts) => { const hit = posts.find((p) => p.post_id === postId) ?? null; relatedCache.set(postId, hit); if (alive) setFetched(hit); })
      .catch(() => { relatedCache.set(postId, null); if (alive) setFetched(null); });
    return () => { alive = false; };
  }, [channelId, postId, threadId, inChannel, inThread]);
  return inChannel ?? inThread ?? fetched;
}

/**
 * One line for a `type: "system"` post. The server sends no text, only `system_props.event`;
 * wording mirrors the official client's system_message strings.
 */
export function SystemMessage({ post, flash }: { post: Post; flash?: boolean }) {
  const users = useChat((s) => s.users);
  const jumpToPost = useChat((s) => s.jumpToPost);
  const sp = post.system_props;
  const ev = sp?.event ?? "";
  const who = (id?: number) => (id ? userLabel(users[id]) : "");
  const actor = who(sp?.trigger_user_id ?? sp?.effective_user_id ?? post.creator_id);
  const targets = (sp?.target_user_ids ?? []).map(who).filter(Boolean).join(", ");
  const relatedId = ev === "thread.create" || ev === "post.pin" || ev.startsWith("post.vote") || ev === "comment.create" ? sp?.post_id : undefined;
  const related = useRelatedPost(post.channel_id, relatedId, ev === "comment.create" ? sp?.thread_id : undefined);

  let text: string;
  switch (ev) {
    case "thread.create": text = `${actor}이(가) 게시물 생성`; break;
    case "comment.create": text = `${actor}이(가) 댓글 작성`; break;
    case "post.pin": text = `${actor}이(가) 메시지 고정`; break;
    case "post.vote.update": text = `${actor}이(가) 투표 수정`; break;
    case "post.vote.close": text = `${actor}이(가) 투표 마감`; break;
    case "channel.join": text = `${targets || actor} 참여`; break;
    case "channel.disjoin": text = `${targets || actor} 나감`; break;
    case "channel.kick": text = `${actor}이(가) ${targets} 내보냄`; break;
    case "channel.close": text = `${actor}이(가) 채널 보관`; break;
    case "channel.archive.synobot": text = "채널이 보관됨"; break;
    case "channel.update": {
      const changes = (sp?.extra?.update_info ?? []).map((u) => {
        if (u.attr === "channel_name") return `이름을 "${u.new}"(으)로 변경`;
        if (u.attr === "purpose") return `목적을 "${u.new}"(으)로 변경`;
        return `${u.attr} 변경`;
      });
      text = `${actor}이(가) 채널 ${changes.join(", ") || "설정 변경"}`;
      break;
    }
    case "bot.add": text = `${actor}이(가) 봇 ${targets} 추가`; break;
    case "bot.delete": text = `${actor}이(가) 봇 제거`; break;
    case "bot.reset": text = `봇 토큰 재설정`; break;
    case "bot.set_disabled": text = `봇 사용 안 함`; break;
    case "encrypt.enabled": text = `${actor}이(가) 암호화 켬`; break;
    case "encrypt.disabled": text = `${actor}이(가) 암호화 끔`; break;
    case "encrypt.notify": text = "암호화 채널 알림"; break;
    case "welcome.nativeapp": case "welcome.message": text = "Synology Chat에 오신 것을 환영합니다"; break;
    default: text = post.message ? "" : ev ? ev.replace(/\./g, " ") : "시스템 메시지";
  }

  return (
    <div className={clsx("px-5 py-[3px] text-[12.5px] text-[var(--fg-muted)]", flash && "msg-flash")}>
      <span className="font-medium text-[var(--fg)]/80">{text}</span>
      {post.message && <span className="ml-1" dangerouslySetInnerHTML={{ __html: renderMessageHtml(post.message, users) }} />}
      {relatedId !== undefined && (
        <button
          type="button"
          onClick={() => void jumpToPost(post.channel_id, related?.thread_id && related.thread_id !== related.post_id ? related.thread_id : relatedId)}
          className="mt-1 ml-0.5 flex items-start gap-1.5 max-w-[640px] rounded-md border-l-2 border-[var(--border)] bg-[var(--hover)]/60 px-2.5 py-1.5 text-left text-[13px] text-[var(--fg)] hover:border-[var(--accent)]"
          title="해당 메시지로 이동"
        >
          <CornerDownRight className="w-3.5 h-3.5 mt-[3px] shrink-0 text-[var(--fg-muted)]" />
          {related === undefined ? (
            <span className="text-[var(--fg-muted)]">불러오는 중…</span>
          ) : related === null ? (
            <span className="text-[var(--fg-muted)] italic">이 메시지는 더 이상 존재하지 않습니다.</span>
          ) : (
            <span className="min-w-0">
              <span className="font-semibold mr-1.5">{userLabel(users[related.creator_id])}</span>
              {related.type === "normal" || related.type === "vote"
                ? <span className="msg-body line-clamp-3 break-words" dangerouslySetInnerHTML={{ __html: renderMessageHtml(related.message, users) }} />
                : <span className="text-[var(--fg-muted)]">{previewText(related, users)}</span>}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
