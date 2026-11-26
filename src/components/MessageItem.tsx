import { memo, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { createPortal } from "react-dom";
import { Bookmark, Copy, Download, Forward, MessageSquare, MoreHorizontal, Pencil, Pin, Smile, Trash2, Settings2, Loader2 } from "lucide-react";
import { openExternal } from "../lib/external";
import type { Post } from "../api/types";
import { chat } from "../api/client";
import { useChat, userBadge, userLabel } from "../store/chat";
import { useSession } from "../store/session";
import { formatBytes, formatTime, renderMessageHtml } from "../lib/format";
import { highlight, langFromFilename } from "../lib/highlight";
import { emojiFromShortname } from "../lib/emoji";
import { isStickerName, stickerStyle } from "../lib/stickers";
import { Avatar } from "./Avatar";
import { IconButton } from "./IconButton";
import { EmojiPicker } from "./EmojiPicker";
import { downloadPost } from "./ImageViewer";
import { useImageViewer } from "../store/imageViewer";
import { VoteCard } from "./VoteCard";
import { ThreadReplies } from "./ThreadReplies";
import { SystemMessage } from "./SystemMessage";
import { openUserCard } from "./UserCard";
import { isSettingsPost } from "../lib/settingsFile";
import { FileIcon } from "./FileIcon";
import { Popover } from "./Popover";
import { ForwardDialog } from "./dialogs/ForwardDialog";
import { useUi } from "../store/ui";
import { ReadBadge } from "./ReadBadge";
import { confirmAsk } from "../lib/confirm";

function ImageAttachment({ post }: { post: Post }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    chat.thumbnailUrl(post.post_id).then((u) => alive && setSrc(u)).catch(() => null);
    return () => { alive = false; };
  }, [post.post_id]);
  const fp = post.file_props!;
  const ratio = fp.image ? fp.image.width / fp.image.height : 4 / 3;
  const w = Math.min(360, Math.max(120, Math.round(240 * ratio)));
  return (
    <>
      {src ? (
        <img
          src={src}
          alt={fp.name}
          title={`${fp.name} · ${formatBytes(fp.size)}`}
          onClick={() => useImageViewer.getState().open(post.channel_id, post.post_id)}
          className="rounded-lg border border-[var(--border)] object-contain bg-[var(--bg-muted)] cursor-zoom-in"
          style={{ maxWidth: 360, maxHeight: 320 }}
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="rounded-lg bg-[var(--bg-muted)] animate-pulse" style={{ width: w, height: Math.round(w / ratio) }} />
      )}
    </>
  );
}

function SnippetAttachment({ post }: { post: Post }) {
  const fp = post.file_props!;
  const [full, setFull] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const lang = langFromFilename(fp.name);
  const code = expanded && full !== null ? full : (fp.snippet_preview ?? "");
  const expand = async () => {
    if (full === null) { try { setFull(await chat.getSnippet(post.post_id)); } catch { setFull(fp.snippet_preview ?? ""); } }
    setExpanded((v) => !v);
  };
  return (
    <div className="msg-body max-w-[720px]">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-[var(--border)] bg-[var(--bg-muted)] px-3 py-1.5 text-[12px]">
        <span className="font-medium truncate">{fp.name}</span>
        <span className="text-[var(--fg-muted)] flex items-center gap-2">
          {formatBytes(fp.size)}
          <button className="hover:text-[var(--fg)]" onClick={() => void expand()}>{expanded ? "접기" : "전체 보기"}</button>
          <button className="hover:text-[var(--fg)]" onClick={() => void downloadPost(post)}>다운로드</button>
        </span>
      </div>
      <pre className="code-block !mt-0 !rounded-t-none" data-lang={lang ?? ""}>
        <button className="copy-btn" data-copy type="button">복사</button>
        <code dangerouslySetInnerHTML={{ __html: highlight(code, lang) }} />
      </pre>
    </div>
  );
}

function FileAttachment({ post }: { post: Post }) {
  const fp = post.file_props!;
  return (
    <div className="inline-flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] pl-3 pr-1.5 py-1.5 max-w-[420px]">
      <FileIcon name={fp.name} size={36} />
      <div className="min-w-0">
        <div className="truncate font-medium text-[13px]">{fp.name}</div>
        <div className="text-[12px] text-[var(--fg-muted)]">{fp.type?.toUpperCase()} · {formatBytes(fp.size)}</div>
      </div>
      <IconButton size="sm" label="다운로드" onClick={() => void downloadPost(post)}><Download /></IconButton>
    </div>
  );
}

/** One reaction chip; hovering shows who reacted (above the chip, never under the composer). */
function ReactionChip({ post, name, ids, count }: { post: Post; name: string; ids: number[]; count: number }) {
  const me = useSession((s) => s.info?.user_id);
  const users = useChat((s) => s.users);
  const toggle = useChat((s) => s.toggleReaction);
  const [hover, setHover] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const mine = !!me && ids.includes(me);
  const names = ids.map((id) => (id === me ? "나" : userLabel(users[id]) + (userBadge(users[id]) ? ` (${userBadge(users[id])})` : "")));
  const emoji = emojiFromShortname(name) ?? `:${name}:`;
  const shown = names.slice(0, 12);
  const rest = names.length - shown.length;
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`${emoji} ${names.join(", ")}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => void toggle(post, name)}
        className={clsx(
          "inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[12px] leading-[18px]",
          mine ? "border-[var(--accent)] bg-[var(--accent)]/12" : "border-[var(--border)] bg-[var(--bg-muted)] hover:border-[var(--fg-muted)]",
        )}
      >
        <span className="text-[14px]">{emoji}</span>
        <span>{count}</span>
      </button>
      {/* Always below the chip, over the composer if needed: covering the input beats covering the message. */}
      {hover && ids.length > 0 && (
        <Popover anchor={btn.current} align="left" side="bottom" gap={6} flip={false}>
          {/* Names wrap between people, never inside a name. */}
          <div className="popover !shadow-[0_2px_8px_rgba(0,0,0,.12)] !rounded-md max-w-[320px] px-2.5 py-1.5 text-[12px] leading-[1.6] pointer-events-none flex flex-wrap gap-x-1 gap-y-0.5">
            {shown.map((n, i) => <span key={i} className="whitespace-nowrap">{n}{i < shown.length - 1 || rest > 0 ? "," : ""}</span>)}
            {rest > 0 && <span className="whitespace-nowrap text-[var(--fg-muted)]">외 {rest}명</span>}
          </div>
        </Popover>
      )}
    </>
  );
}

/** A post that arrived without text or attachments (a half-filled socket event). Re-fetches it once, then offers a manual retry. */
function MissingBody({ post }: { post: Post }) {
  const refresh = useChat((s) => s.refreshPost);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { await refresh(post.channel_id, post.post_id); } finally { setBusy(false); setTried(true); } };
  useEffect(() => { if (post.channel_id) void run(); /* once per mount */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.post_id]);
  return (
    <div className="text-[12.5px] text-[var(--fg-muted)] italic">
      {busy || !tried ? "내용을 불러오는 중…" : "내용을 불러오지 못했습니다."}
      {tried && !busy && <button type="button" className="ml-2 not-italic underline hover:text-[var(--fg)]" onClick={() => void run()}>다시 시도</button>}
    </div>
  );
}

function Reactions({ post }: { post: Post }) {
  if (!post.reactions?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {post.reactions.map((r, i) => {
        const name = r.sticker_name ?? r.name ?? "";
        const ids = r.user_ids ?? [];
        return <ReactionChip key={`${name}-${i}`} post={post} name={name} ids={ids} count={ids.length || r.count || 0} />;
      })}
    </div>
  );
}

interface Props {
  post: Post;
  /** True when the previous message is from the same author within a short window. */
  continued: boolean;
  isMine: boolean;
  flash?: boolean;
  /** First message after a day/time separator: no extra top gap (the rule already separates it). */
  afterBreak?: boolean;
}

export const MessageItem = memo(function MessageItem({ post, continued, isMine, flash, afterBreak }: Props) {
  const user = useChat((s) => s.users[post.creator_id]);
  const users = useChat((s) => s.users);
  const toggleReaction = useChat((s) => s.toggleReaction);
  const host = useSession((s) => s.info?.host ?? "");
  const me = useSession((s) => s.info?.user_id);
  const onPostUpdate = useChat((s) => s.onPostUpdate);
  const onPostDelete = useChat((s) => s.onPostDelete);
  const setEditingPost = useUi((s) => s.setEditingPost);
  const [picker, setPicker] = useState(false);
  const [more, setMore] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [replying, setReplying] = useState(false);
  const pickerBtn = useRef<HTMLButtonElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!more) return;
    const close = () => setMore(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [more]);

  const retrySend = useChat((s) => s.retrySend);
  const discardSend = useChat((s) => s.discardSend);
  const togglePin = async () => {
    const next = !post.is_sticky;
    onPostUpdate({ ...post, is_sticky: next, last_pin_at: next ? Date.now() : 0 });
    try { await chat.pinPost(post.post_id, next); } catch (e) { onPostUpdate(post); alert(`고정 실패: ${(e as { message?: string })?.message ?? e}`); }
  };
  const toggleStar = async () => {
    const next = !post.is_star;
    onPostUpdate({ ...post, is_star: next });
    try { await chat.starPost(post.post_id, next); } catch (e) { onPostUpdate(post); alert(`북마크 실패: ${(e as { message?: string })?.message ?? e}`); }
  };
  const remove = async () => {
    if (!await confirmAsk("이 메시지를 삭제할까요?")) return;
    try { await chat.deletePost(post.post_id); onPostDelete(post.channel_id, post.post_id); } catch (e) { alert(`삭제 실패: ${(e as { message?: string })?.message ?? e}`); }
  };

  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const a = t.closest("a");
    if (a?.href) { e.preventDefault(); openExternal(a.href); return; }
    const copy = t.closest("[data-copy]");
    if (copy) {
      const code = copy.parentElement?.querySelector("code")?.textContent ?? "";
      void navigator.clipboard.writeText(code);
      copy.textContent = "복사됨";
      setTimeout(() => (copy.textContent = "복사"), 1200);
    }
  };

  if (post.type === "system") return <SystemMessage post={post} flash={flash} />;

  const fp = post.file_props;
  const isFile = post.type === "file" && !!fp;
  const stickerName = post.type === "sticker" ? post.message.replace(/^:|:$/g, "") : null;
  const sticker = stickerName && isStickerName(stickerName) ? stickerStyle(host, stickerName, 160) : null;

  return (
    <div
      data-msg
      data-sender={userLabel(user)}
      data-at={post.create_at}
      data-file={isFile ? fp.name : undefined}
      className={clsx(
        "group relative flex gap-4 px-5 hover:bg-[var(--hover)]",
        // A new sender gets breathing room above; continued lines stay tight.
        continued ? "py-[2px]" : afterBreak ? "pt-2 pb-[2px]" : "pt-4 pb-[2px]",
        post._pending && "opacity-60",
        post._failed && "bg-red-500/10",
        flash && "msg-flash",
      )}
      onClick={onClick}
    >
      {/* Fixed 36px column in both states so the text edge lines up exactly. */}
      <div className="w-9 shrink-0">
        {continued ? (
          <div className="relative w-9 pt-[2px]">
            <div className="text-right text-[10.5px] leading-[18px] text-[var(--fg-muted)] opacity-0 group-hover:opacity-100 select-none tabular-nums whitespace-nowrap">{formatTime(post.create_at)}</div>
            {/* Unread count sits where the time appears on hover, so a continued line costs no extra height. */}
            {isMine && <div className="absolute inset-x-0 top-[2px] flex justify-end group-hover:hidden"><ReadBadge post={post} /></div>}
          </div>
        ) : (
          <button type="button" title="프로필 보기" className="block rounded-lg hover:ring-2 hover:ring-[var(--accent)]/50" onClick={openUserCard(post.creator_id)}>
            <Avatar userId={post.creator_id} size={36} />
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!continued && (
          <div className="flex items-baseline gap-2 leading-tight">
            <button type="button" title="프로필 보기" className={clsx("font-semibold text-[14px] hover:underline", isMine && "text-[var(--accent)]", userBadge(user) && "text-[var(--fg-muted)]")} onClick={openUserCard(post.creator_id)}>{userLabel(user)}</button>
            {userBadge(user) && <span className="rounded px-1 text-[10px] leading-[16px] bg-[var(--bg-muted)] text-[var(--fg-muted)] border border-[var(--border)]">{userBadge(user)}</span>}
            <span className="text-[11px] text-[var(--fg-muted)]">{formatTime(post.create_at)}</span>
            {isMine && <ReadBadge post={post} />}
            {post.update_at > 0 && <span className="text-[11px] text-[var(--fg-muted)]">(편집됨)</span>}
            {post.is_sticky && <span className="inline-flex items-center gap-[2px] text-[11px] text-[var(--accent)]"><Pin className="w-3 h-3" />고정</span>}
            {post.is_star && <Bookmark className="w-3 h-3 text-yellow-500 fill-current" />}
          </div>
        )}
        {continued && (post.is_sticky || post.is_star) && (
          <div className="flex items-center gap-2 text-[11px] leading-tight">
            {post.is_sticky && <span className="inline-flex items-center gap-[2px] text-[var(--accent)]"><Pin className="w-3 h-3" />고정</span>}
            {post.is_star && <Bookmark className="w-3 h-3 text-yellow-500 fill-current" />}
          </div>
        )}
        {post.type === "vote" ? (
          <VoteCard post={post} />
        ) : sticker ? (
          <div style={sticker} title={`:${stickerName}:`} />
        ) : post.message && !(isFile && fp.is_snippet) ? (
          <div className="msg-body whitespace-pre-wrap break-words leading-[1.55] text-[14px]" dangerouslySetInnerHTML={{ __html: renderMessageHtml(post.message, users) }} />
        ) : stickerName ? (
          <div className="text-[13px] text-[var(--fg-muted)]">스티커 :{stickerName}:</div>
        ) : post.type === undefined ? (
          <div className="space-y-1.5 py-1" role="status" aria-label="메시지를 불러오는 중"><div className="skeleton h-3 w-48 max-w-full rounded" /><div className="skeleton h-3 w-32 max-w-full rounded" /></div>
        ) : !isFile && !post.url_props?.length && post.type !== "system" && !post._pending ? (
          <MissingBody post={post} />
        ) : null}
        {isFile && isSettingsPost(post) && (
          <div className="mt-1 inline-flex items-center gap-2 rounded-md border border-dashed border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--fg-muted)]">
            <Settings2 className="w-3.5 h-3.5" /> Chat Viewer 설정 파일 (자동 관리) — 삭제하지 마세요
          </div>
        )}
        {isFile && !isSettingsPost(post) && (
          <div className="mt-1">
            {fp.is_snippet ? <SnippetAttachment post={post} /> : fp.is_image ? <ImageAttachment post={post} /> : <FileAttachment post={post} />}
            {fp.is_snippet && post.message && <div className="msg-body text-[13px] mt-1 text-[var(--fg-muted)]" dangerouslySetInnerHTML={{ __html: renderMessageHtml(post.message, users) }} />}
          </div>
        )}
        {post.props?.encrypted && <div className="text-[12px] text-[var(--fg-muted)] italic">암호화된 메시지 (미지원)</div>}
        <Reactions post={post} />
        {!post._pending && (post.comment_count > 0 || replying) && (
          <ThreadReplies post={post} forceOpen={replying} onCloseReply={() => setReplying(false)} />
        )}
        {post._pending && <div className="anim-fade mt-0.5 flex items-center gap-1 text-[11px] text-[var(--fg-muted)]"><Loader2 className="h-3 w-3 animate-spin" />전송 중…</div>}
        {post._failed && (
          <div className="mt-1 flex items-center gap-2 text-[12px] text-red-500">
            <span>전송 실패{post._error ? `: ${post._error}` : ""}</span>
            <button type="button" className="rounded px-2 py-[2px] bg-red-500 text-white hover:bg-red-600" onClick={() => void retrySend(post.channel_id, post.post_id).catch(() => undefined)}>재전송</button>
            <button type="button" className="rounded px-2 py-[2px] border border-[var(--border)] text-[var(--fg)] hover:bg-[var(--hover)]" onClick={() => discardSend(post.channel_id, post.post_id)}>취소</button>
          </div>
        )}
      </div>

      {!post._pending && (
        <div className={clsx("absolute right-4 -top-3 items-center gap-[2px] rounded-md border border-[var(--border)] bg-[var(--bg)] shadow-sm p-[2px]", picker || more ? "flex" : "hidden group-hover:flex")}>
          {["thumbsup", "white_check_mark", "eyes"].map((n) => (
            <button key={n} type="button" title={`:${n}:`} onClick={() => void toggleReaction(post, n)} className="w-7 h-7 rounded text-[16px] hover:bg-[var(--hover)]">
              {emojiFromShortname(n)}
            </button>
          ))}
          <IconButton ref={pickerBtn} size="sm" label="반응 추가" active={picker} onMouseDown={(e) => e.stopPropagation()} onClick={() => setPicker((v) => !v)}><Smile /></IconButton>
          <span className="w-px h-4 bg-[var(--border)] mx-[2px]" />
          <IconButton size="sm" label="댓글 달기" active={replying} onClick={() => setReplying(true)}><MessageSquare /></IconButton>
          <IconButton size="sm" label={post.is_star ? "북마크 해제" : "북마크"} active={post.is_star} onClick={() => void toggleStar()}><Bookmark className={clsx(post.is_star && "fill-current")} /></IconButton>
          <IconButton size="sm" label={post.is_sticky ? "고정 해제" : "채널에 고정"} active={post.is_sticky} onClick={() => void togglePin()}><Pin className={clsx(post.is_sticky && "fill-current")} /></IconButton>
          <IconButton ref={moreBtn} size="sm" label="더보기" active={more} onMouseDown={(e) => e.stopPropagation()} onClick={() => setMore((v) => !v)}><MoreHorizontal /></IconButton>
        </div>
      )}
      {more && (
        <Popover anchor={moreBtn.current} align="right">
        <div className="popover w-[170px] py-1 text-[13px]" onMouseDown={(e) => e.stopPropagation()}>
          <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { void navigator.clipboard.writeText(post.message); setMore(false); }}><Copy className="w-4 h-4" /> 텍스트 복사</button>
          {(post.type === "normal" || post.type === "file") && (
            <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { setMore(false); setForwarding(true); }}><Forward className="w-4 h-4" /> 전달…</button>
          )}
          {post.creator_id === me && post.type === "normal" && (
            <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { setEditingPost(post); setMore(false); }}><Pencil className="w-4 h-4" /> 편집</button>
          )}
          {post.creator_id === me && (
            <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)] text-red-500" onClick={() => { setMore(false); void remove(); }}><Trash2 className="w-4 h-4" /> 삭제</button>
          )}
        </div>
        </Popover>
      )}
      {forwarding && createPortal(<ForwardDialog post={post} onClose={() => setForwarding(false)} />, document.body)}
      {picker && (
        <Popover anchor={pickerBtn.current} align="right">
          <EmojiPicker onClose={() => setPicker(false)} onPick={(name) => { setPicker(false); void toggleReaction(post, name); }} />
        </Popover>
      )}
    </div>
  );
});
