import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { BellOff, Bell, ChevronDown, ChevronRight, MessageSquare, Reply as ReplyIcon, SendHorizontal, Smile, X } from "lucide-react";
import { EditorContent } from "@tiptap/react";
import { openExternal } from "../lib/external";
import type { Post } from "../api/types";
import { chat, describeSendError } from "../api/client";
import { useChat, userLabel } from "../store/chat";
import { useSession } from "../store/session";
import { useUi } from "../store/ui";
import { formatTime, renderMessageHtml } from "../lib/format";
import { docToMarkup } from "../lib/markup";
import { useSynoEditor } from "./editor/useSynoEditor";
import { SuggestPopup } from "./editor/SuggestPopup";
import { Avatar } from "./Avatar";
import { IconButton } from "./IconButton";
import { EmojiPicker } from "./EmojiPicker";
import { Popover } from "./Popover";
import { MessageSkeleton } from "./MessageSkeleton";
import { confirmAsk } from "../lib/confirm";

function Reply({ post, isMine }: { post: Post; isMine: boolean }) {
  const user = useChat((s) => s.users[post.creator_id]);
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.info?.user_id);
  const onPostDelete = useChat((s) => s.onPostDelete);
  const retryReply = useChat((s) => s.retryReply);
  const discardReply = useChat((s) => s.discardReply);
  const onClick = (e: React.MouseEvent) => { const a = (e.target as HTMLElement).closest("a"); if (a?.href) { e.preventDefault(); openExternal(a.href); } };
  const remove = async () => { if (!await confirmAsk("이 댓글을 삭제할까요?")) return; try { await chat.deletePost(post.post_id); onPostDelete(post.channel_id, post.post_id, post.thread_id); } catch (e) { alert(`삭제 실패: ${(e as { message?: string })?.message ?? e}`); } };
  return (
    <div className={clsx("group/reply flex gap-3 py-1", post._pending && "opacity-60", post._failed && "bg-red-500/10")} onClick={onClick}>
      <Avatar userId={post.creator_id} size={24} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 leading-tight">
          <span className={clsx("font-semibold text-[13px]", isMine && "text-[var(--accent)]")}>{userLabel(user)}</span>
          <span className="text-[11px] text-[var(--fg-muted)]">{formatTime(post.create_at)}</span>
          {post.creator_id === me && !post._pending && <button className="text-[11px] text-[var(--fg-muted)] opacity-0 group-hover/reply:opacity-100 hover:text-red-500" onClick={() => void remove()}>삭제</button>}
        </div>
        {post.type === "file" ? (
          <div className="text-[13px] text-[var(--fg-muted)]">파일: {post.file_props?.name}</div>
        ) : (
          <div className="msg-body text-[13.5px] leading-[1.5] whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: renderMessageHtml(post.message, users) }} />
        )}
        {post._failed && (
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-red-500">
            <span>전송 실패{post._error ? `: ${post._error}` : ""}</span>
            <button type="button" className="rounded px-1.5 py-[1px] bg-red-500 text-white hover:bg-red-600" onClick={() => void retryReply(post.channel_id, post.thread_id, post.post_id).catch(() => undefined)}>재전송</button>
            <button type="button" className="rounded px-1.5 py-[1px] border border-[var(--border)] text-[var(--fg)] hover:bg-[var(--hover)]" onClick={() => discardReply(post.thread_id, post.post_id)}>취소</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReplyBox({ channelId, threadId, autoFocus, onCancel }: { channelId: number; threadId: number; autoFocus?: boolean; onCancel: () => void }) {
  const sendReply = useChat((s) => s.sendReply);
  const [error, setError] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiBtn = useRef<HTMLButtonElement>(null);
  const submitRef = useRef<() => void>(() => undefined);
  const { editor, state, suggest, insertEmoji } = useSynoEditor({ placeholder: "댓글 달기…", onSubmit: () => submitRef.current() });
  useEffect(() => { if (autoFocus) editor?.commands.focus(); }, [autoFocus, editor]);
  const submit = async () => {
    if (!editor) return;
    const msg = docToMarkup(editor.getJSON());
    if (!msg) return;
    editor.commands.clearContent();
    setError(null);
    try { await sendReply(channelId, threadId, msg); } catch (e) { setError(`전송 실패: ${describeSendError(e)}`); }
  };
  submitRef.current = () => void submit();
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !suggest && !showEmoji) { e.stopPropagation(); onCancel(); }
  };
  return (
    <div className="relative mt-1" onKeyDown={onKeyDown}>
      <div className="flex items-end gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] focus-within:border-[var(--accent)] pl-3 pr-1 py-1">
        <EditorContent editor={editor} className="flex-1 min-w-0 max-h-[160px] overflow-y-auto text-[13.5px]" />
        <IconButton ref={emojiBtn} size="sm" label="이모지" active={showEmoji} onMouseDown={(e) => e.stopPropagation()} onClick={() => setShowEmoji((v) => !v)}><Smile /></IconButton>
        <IconButton size="sm" label="댓글 보내기 (Enter)" disabled={state.empty} onMouseDown={(e) => { e.preventDefault(); void submit(); }}><SendHorizontal /></IconButton>
        <IconButton size="sm" label="닫기 (Esc)" onMouseDown={(e) => { e.preventDefault(); onCancel(); }}><X /></IconButton>
      </div>
      {showEmoji && <Popover anchor={emojiBtn.current} align="right" side="top"><EmojiPicker onClose={() => setShowEmoji(false)} onPick={(n, c) => { insertEmoji(n, c); setShowEmoji(false); }} /></Popover>}
      <SuggestPopup suggest={suggest} className="absolute left-0 bottom-[calc(100%+2px)]" />
      {error && <div className="text-[11px] text-red-500 mt-0.5">{error}</div>}
    </div>
  );
}

/**
 * Replies shown inline under a parent message. Expanded by default (user preference),
 * collapsible per thread. `forceOpen` is used right after the user clicks "댓글 달기".
 */
export function ThreadReplies({ post, forceOpen, onCloseReply }: { post: Post; forceOpen?: boolean; onCloseReply?: () => void }) {
  const thread = useChat((s) => s.threads[post.post_id]);
  const loadThread = useChat((s) => s.loadThread);
  const me = useSession((s) => s.info?.user_id);
  const threadsExpanded = useUi((s) => s.threadsExpanded);
  const override = useUi((s) => s.threadOverrides[post.post_id]);
  const toggleThread = useUi((s) => s.toggleThread);
  const muted = useUi((s) => !!s.replyNotify.mutedThreads[post.post_id]);
  const toggleThreadMute = useUi((s) => s.toggleThreadMute);
  const open = forceOpen || (threadsExpanded ? !override : !!override);
  const count = post.comment_count;
  // The reply editor appears only after the user asks for it ("댓글 달기" on the message, or "답글 쓰기" below the replies).
  const [composing, setComposing] = useState(false);
  const writing = forceOpen || composing;
  const closeReply = () => { setComposing(false); onCloseReply?.(); };

  useEffect(() => {
    if (open && count > 0 && !thread?.loaded && !thread?.loading) void loadThread(post.channel_id, post.post_id);
  }, [open, count, thread?.loaded, thread?.loading, loadThread, post.channel_id, post.post_id]);

  // Reload when new comments arrived while the thread wasn't loaded (e.g. count changed externally).
  useEffect(() => {
    if (open && thread?.loaded && count > thread.items.length && !thread.loading) void loadThread(post.channel_id, post.post_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  if (count === 0 && !forceOpen) return null;

  return (
    <div className="mt-1.5 max-w-[720px]">
      <button
        type="button"
        onClick={() => { if (writing) closeReply(); else toggleThread(post.post_id); }}
        className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <MessageSquare className="w-3.5 h-3.5" />
        {count > 0 ? `댓글 ${count}개` : "댓글"}
        <span className="text-[var(--fg-muted)] ml-1">{open ? "접기" : "펼치기"}</span>
      </button>
      {count > 0 && (
        <button
          type="button"
          title={muted ? "이 스레드 알림 다시 받기 (이 앱에서만 적용)" : "이 스레드 알림 끄기 (이 앱에서만 적용)"}
          onClick={() => toggleThreadMute(post.post_id)}
          className={clsx("ml-2 inline-flex items-center gap-1 align-middle text-[11px] hover:text-[var(--accent)]", muted ? "text-[var(--accent)]" : "text-[var(--fg-muted)]")}
        >
          {muted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}{muted ? "알림 꺼짐" : "알림 끄기"}
        </button>
      )}
      {open && (
        <div className="mt-1 pl-3 border-l-2 border-[var(--border)]">
          {thread?.loading && !thread.loaded && <MessageSkeleton rows={Math.min(count, 2) || 1} compact />}
          {thread?.items.map((r) => <Reply key={r.post_id} post={r} isMine={r.creator_id === me} />)}
          {writing ? (
            <ReplyBox channelId={post.channel_id} threadId={post.post_id} autoFocus onCancel={closeReply} />
          ) : (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="mt-1 inline-flex items-center gap-1 text-[12px] text-[var(--fg-muted)] hover:text-[var(--accent)]"
            >
              <ReplyIcon className="w-3.5 h-3.5" />답글 쓰기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
