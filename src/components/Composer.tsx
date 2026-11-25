import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { BarChart3, Bold, Clock, Code, CodeSquare, Italic, List, Loader2, Paperclip, Pencil, Quote, SendHorizontal, Smile, Strikethrough, X } from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { EditorContent } from "@tiptap/react";
import { chat, describeSendError } from "../api/client";
import { useChat } from "../store/chat";
import { useUploads } from "../store/upload";
import { usePendingFiles, queueBrowserFile, queuePath } from "../store/pending";
import { FileIcon } from "./FileIcon";
import { formatBytes } from "../lib/format";
import { useUi } from "../store/ui";
import { useSession } from "../store/session";
import { docToMarkup, markupToEditorHtml } from "../lib/markup";
import { useSynoEditor } from "./editor/useSynoEditor";
import { SuggestPopup } from "./editor/SuggestPopup";
import { IconButton } from "./IconButton";
import { EmojiPicker } from "./EmojiPicker";
import { Popover } from "./Popover";
import { SnippetDialog } from "./SnippetDialog";
import { ScheduleDialog } from "./ScheduleDialog";
import { VoteDialog } from "./dialogs/VoteDialog";

export function Composer({ channelId, placeholder }: { channelId: number; placeholder: string }) {
  const send = useChat((s) => s.send);
  const users = useChat((s) => s.users);
  const onPostUpdate = useChat((s) => s.onPostUpdate);
  const startUpload = useUploads((s) => s.start);
  const editing = useUi((s) => s.editingPost);
  const setEditingPost = useUi((s) => s.setEditingPost);
  const [error, setError] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSnippet, setShowSnippet] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showVote, setShowVote] = useState(false);
  const submitRef = useRef<() => void>(() => undefined);
  const emojiBtn = useRef<HTMLButtonElement>(null);

  const { editor, state, suggest, insertEmoji } = useSynoEditor({
    placeholder,
    onSubmit: () => submitRef.current(),
    // Pasted files wait as attachments and go out with the message.
    onFiles: (files) => { for (const f of files) void queueBrowserFile(channelId, f); },
  });

  useEffect(() => { editor?.view.dispatch(editor.state.tr); }, [placeholder, editor]);

  useEffect(() => { setError(null); setEditingPost(null); editor?.commands.clearContent(); editor?.commands.focus(); }, [channelId, editor, setEditingPost]);

  useEffect(() => {
    if (!editor || !editing) return;
    editor.commands.setContent(markupToEditorHtml(editing.message, users));
    editor.commands.focus("end");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, editor]);
  const cancelEdit = () => { setEditingPost(null); editor?.commands.clearContent(); };

  const pending = usePendingFiles((s) => s.items);
  const myPending = useMemo(() => pending.filter((p) => p.channelId === channelId), [pending, channelId]);
  const removePending = usePendingFiles((s) => s.remove);
  const clearPending = usePendingFiles((s) => s.clear);
  const [saving, setSaving] = useState(false);

  const closeInfoPanel = () => { if (useUi.getState().rightPanel !== "none") useUi.getState().setRightPanel("none"); };
  const submit = useCallback(async () => {
    if (!editor) return;
    const msg = docToMarkup(editor.getJSON());
    const attachments = usePendingFiles.getState().items.filter((p) => p.channelId === channelId);
    // Files go out with the text: the first file carries the message, the rest follow without text.
    if (attachments.length && !useUi.getState().editingPost) {
      editor.commands.clearContent();
      clearPending(channelId);
      setError(null);
      // One at a time: two simultaneous multipart uploads to the NAS once got an HTTP 411 on the first one.
      void (async () => {
        for (const [i, a] of attachments.entries()) {
          await startUpload(channelId, { path: a.path, bytes: a.bytes, fileName: a.fileName, message: i === 0 ? msg || undefined : undefined });
        }
      })();
      return;
    }
    if (!msg) return;
    setError(null);
    const current = useUi.getState().editingPost;
    if (current) {
      if (msg === current.message) { setEditingPost(null); editor.commands.clearContent(); return; }
      if (saving) return;
      setSaving(true);
      try {
        const updated = await chat.editPost(current.post_id, msg);
        onPostUpdate({ ...current, ...(updated ?? {}), message: msg, update_at: Date.now() });
        setEditingPost(null);
        editor.commands.clearContent();
      } catch (e) { setError(`편집 실패: ${(e as { message?: string })?.message ?? e}`); }
      finally { setSaving(false); }
      return;
    }
    editor.commands.clearContent();
    try { await send(channelId, msg); } catch (e) { setError(`전송 실패: ${describeSendError(e)}`); }
  }, [editor, channelId, send, onPostUpdate, setEditingPost, clearPending, startUpload, saving]);
  submitRef.current = () => void submit();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!editor?.isFocused) return;
      if (e.key === "Escape" && useUi.getState().editingPost) { e.preventDefault(); cancelEdit(); return; }
      // ↑ in an empty composer edits my latest message in this channel.
      if (e.key === "ArrowUp" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && !e.isComposing && editor.isEmpty && !useUi.getState().editingPost) {
        const meId = useSession.getState().info?.user_id;
        const mine = [...(useChat.getState().posts[channelId]?.items ?? [])].reverse().find((p) => p.creator_id === meId && p.type === "normal");
        if (mine) { e.preventDefault(); useUi.getState().setEditingPost(mine); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, channelId]);

  const pickFiles = async () => {
    const picked = await openFileDialog({ multiple: true, directory: false });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    for (const p of paths) queuePath(channelId, p);
  };

  const currentMarkup = useMemo(() => (editor ? docToMarkup(editor.getJSON()) : ""), [editor, state]);

  const tb = (label: string, active: boolean, icon: React.ReactNode, run: () => void) => (
    <IconButton size="sm" label={label} active={active} onMouseDown={(e) => { e.preventDefault(); run(); }}>{icon}</IconButton>
  );

  return (
    <div className="px-5 pb-4 pt-1 relative" data-composer>
      {showSnippet && <SnippetDialog channelId={channelId} onClose={() => setShowSnippet(false)} />}
      {showSchedule && <ScheduleDialog channelId={channelId} initialMessage={currentMarkup} onClose={() => setShowSchedule(false)} onSaved={() => editor?.commands.clearContent()} />}
      {showVote && <VoteDialog channelId={channelId} onClose={() => setShowVote(false)} />}
      {editing && (
        <div className="mb-1 flex items-center gap-2 rounded-md bg-[var(--accent)]/10 px-3 py-1 text-[12px] text-[var(--accent)]">
          <Pencil className="w-3.5 h-3.5" /> 메시지 편집 중 · Esc로 취소
          <button className="ml-auto hover:opacity-70" onClick={cancelEdit} title="편집 취소"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      <div
        className={clsx("rounded-xl border bg-[var(--bg)] focus-within:ring-2 focus-within:ring-[var(--accent)]/20", editing ? "border-[var(--accent)]" : "border-[color-mix(in_srgb,var(--fg-muted)_55%,var(--bg))] focus-within:border-[var(--accent)]")}
        // Clicking back into the composer means the info panel is no longer the focus: close it. Typing does not:
        // buttons in WKWebView leave focus in the editor, so the first keystroke after opening the panel used to close it.
        onPointerDownCapture={closeInfoPanel}
      >
        <div className="flex items-center gap-[2px] px-2 pt-1.5">
          {tb("굵게 (⌘B)", state.bold, <Bold />, () => editor?.chain().focus().toggleBold().run())}
          {tb("기울임 (⌘I)", state.italic, <Italic />, () => editor?.chain().focus().toggleItalic().run())}
          {tb("취소선 (⌘⇧S)", state.strike, <Strikethrough />, () => editor?.chain().focus().toggleStrike().run())}
          <span className="w-px h-4 bg-[var(--border)] mx-1" />
          {tb("인용", state.quote, <Quote />, () => editor?.chain().focus().toggleBlockquote().run())}
          {tb("목록", state.list, <List />, () => editor?.chain().focus().toggleBulletList().run())}
          {tb("인라인 코드 (⌘E)", state.code, <Code />, () => editor?.chain().focus().toggleCode().run())}
          {tb("코드 블록", state.codeBlock, <CodeSquare />, () => editor?.chain().focus().toggleCodeBlock().run())}
        </div>
        <EditorContent editor={editor} className="px-4 py-2 max-h-[240px] overflow-y-auto" />
        {myPending.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pb-2">
            {myPending.map((f) => (
              <div key={f.id} className="group/att relative flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-muted)] pl-1.5 pr-6 py-1 text-[12px] max-w-[260px]">
                {f.previewUrl ? <img src={f.previewUrl} alt="" className="h-8 w-8 rounded object-cover" /> : <FileIcon name={f.fileName} size={28} />}
                <span className="min-w-0">
                  <span className="block truncate">{f.fileName}</span>
                  {f.size > 0 && <span className="block text-[11px] text-[var(--fg-muted)]">{formatBytes(f.size)}</span>}
                </span>
                <button type="button" title="첨부 제거" className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]" onClick={() => removePending(f.id)}><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 px-2 pb-1.5">
          <div className="flex min-w-0 items-center gap-[2px] relative">
            <IconButton ref={emojiBtn} size="sm" label="이모지" active={showEmoji} onMouseDown={(e) => e.stopPropagation()} onClick={() => setShowEmoji((v) => !v)}><Smile /></IconButton>
            <IconButton size="sm" label="파일 첨부" onClick={() => void pickFiles()}><Paperclip /></IconButton>
            <IconButton size="sm" label="스니펫" onClick={() => setShowSnippet(true)}><CodeSquare /></IconButton>
            <IconButton size="sm" label="메시지 예약" disabled={!!editing} onClick={() => setShowSchedule(true)}><Clock /></IconButton>
            <IconButton size="sm" label="투표 만들기" disabled={!!editing} onClick={() => setShowVote(true)}><BarChart3 /></IconButton>
            {showEmoji && <Popover anchor={emojiBtn.current} align="left" side="top"><EmojiPicker onClose={() => setShowEmoji(false)} onPick={(n, c) => { insertEmoji(n, c); setShowEmoji(false); }} /></Popover>}
            {(error || myPending.length > 0) && <span className="ml-2 min-w-0 truncate text-[11px] text-[var(--fg-muted)]">{error ?? `첨부 ${myPending.length}개 · 메시지와 함께 전송됩니다`}</span>}
          </div>
          <button
            onMouseDown={(e) => { e.preventDefault(); void submit(); }}
            disabled={saving || (state.empty && myPending.length === 0)}
            title={editing ? "저장 (Enter · 코드 블록 안에서는 ⌘/Ctrl+Enter)" : myPending.length ? `파일 ${myPending.length}개와 함께 보내기 (Enter · 코드 블록 안에서는 ⌘/Ctrl+Enter)` : "보내기 (Enter · 코드 블록 안에서는 ⌘/Ctrl+Enter)"}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-[var(--accent)] text-[var(--accent-fg)] px-3 py-1 text-[12px] font-medium disabled:opacity-40 [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:px-4 [@media(pointer:coarse)]:text-[14px]"
          >
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 저장 중</> : editing ? <><Pencil className="w-3.5 h-3.5" /> 저장</> : <><SendHorizontal className="w-3.5 h-3.5" /> 보내기</>}
          </button>
        </div>
      </div>
      <SuggestPopup suggest={suggest} className="absolute left-5 bottom-[calc(100%-4px)]" />
    </div>
  );
}
