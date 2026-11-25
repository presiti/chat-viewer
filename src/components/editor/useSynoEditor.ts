import { useCallback, useRef, useState } from "react";
import type { EditorView } from "@tiptap/pm/view";
import { Fragment, Slice } from "@tiptap/pm/model";
import { useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { useChat, userLabel } from "../../store/chat";
import { useSession } from "../../store/session";
import { searchEmoji } from "../../lib/emoji";
import { docIsEmpty } from "../../lib/markup";
import { isMacDesktop, isTouchNow } from "../../lib/platform";
import { useToast } from "../../store/toast";
import { BlockShiftEnter, EmojiNode, LineHomeEnd, MentionNode, SuggestExtension, SynoBold, SynoItalic, SynoStrike, type SuggestItem, type SuggestState } from "./extensions";

let lastEnterHint = 0;
/** Plain Enter keeps writing inside a code block; say so (gently, not on every press) so the missing send is not a mystery. */
function hintEnterInCode() {
  const now = Date.now();
  if (now - lastEnterHint < 15_000) return;
  lastEnterHint = now;
  useToast.getState().push("info", `코드 블록 안에서는 Enter가 줄바꿈이에요 · 빈 줄에서 Enter 또는 ${isMacDesktop ? "⌘" : "Ctrl"}+Enter로 보내져요`);
}

/** An Enter pressed while the IME was still composing waits at most this long for its compositionend before it is forgotten. */
const PENDING_ENTER_MS = 500;
/** How many times (and how often) a send waits for the editor state to catch up with the DOM before reading it. */
const SUBMIT_SYNC_TRIES = 8;
const SUBMIT_SYNC_STEP_MS = 25;
/** An Enter keydown this soon after a compositionend belongs to that composition (WebKit ordering). */
const LATE_ENTER_MS = 150;

/** Text the document would render, so it can be compared with what the browser actually shows. */
const leafText = (leaf: { type: { name: string }; attrs: Record<string, unknown> }) =>
  leaf.type.name === "emoji" ? String(leaf.attrs.char ?? "") : leaf.type.name === "mention" ? `@${String(leaf.attrs.label ?? "")}` : "";
const norm = (s: string) => s.replace(/\u00a0/g, " ");
/** False while the DOM holds text (e.g. a syllable the IME just committed) that the ProseMirror document does not yet. */
function docMatchesDom(view: EditorView): boolean {
  const doc = view.state.doc;
  return norm(doc.textBetween(0, doc.content.size, "", leafText)) === norm(view.dom.textContent ?? "");
}

/** Dev builds only: one-line trace of the Enter/IME event order and of what a send actually reads (forwarded to the terminal log). */
const trace = (...a: unknown[]) => { if (import.meta.env.DEV) console.warn("[composer-trace]", ...a); };

interface Options {
  placeholder: string;
  /** Called on Enter (outside code blocks / autocomplete), after the IME has committed and the document is up to date. */
  onSubmit: () => void;
  /** Pasted files (clipboard images etc.). */
  onFiles?: (files: File[]) => void;
}

/** Shared Tiptap setup for the main composer and thread reply boxes. */
/** Inserts clipboard text without any formatting: one paragraph per line (blank lines kept), spaces and tabs untouched. */
function pastePlainText(view: EditorView, raw: string) {
  const text = raw.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/\t/g, "    ");
  const { state } = view;
  const { schema } = state;
  const inCode = state.selection.$from.parent.type.spec.code;
  let tr = state.tr;
  if (inCode || !text.includes("\n")) {
    tr = tr.insertText(text);
  } else {
    const para = schema.nodes.paragraph;
    const lines = text.split("\n").map((l) => (l ? para.create(null, schema.text(l)) : para.create()));
    tr = tr.replaceSelection(new Slice(Fragment.fromArray(lines), 1, 1));
  }
  view.dispatch(tr.scrollIntoView().setMeta("paste", true).setMeta("uiEvent", "paste"));
}

export function useSynoEditor({ placeholder, onSubmit, onFiles }: Options) {
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.info?.user_id);
  const [suggest, setSuggest] = useState<SuggestState | null>(null);
  // Written by the suggestion plugin itself (not from React state) so the keydown handler never sees a stale popup.
  const suggestRef = useRef<SuggestState | null>(null);
  // The editor outlives channel switches, so the placeholder must be read lazily, not frozen at creation.
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const filesRef = useRef(onFiles);
  filesRef.current = onFiles;
  const usersRef = useRef(users);
  usersRef.current = users;
  const meRef = useRef(me);
  meRef.current = me;
  /** Timestamp of an Enter that arrived mid-composition (0 = none). The matching compositionend sends. */
  const pendingEnter = useRef(0);
  /** When the last composition ended. WebKit can deliver the committing Enter (keyCode 229) *after* compositionend. */
  const lastCompositionEnd = useRef(0);

  const onSuggest = useCallback((s: SuggestState | null) => { suggestRef.current = s; setSuggest(s); }, []);

  const userItems = useCallback((query: string): SuggestItem[] => {
    const q = query.toLowerCase();
    const list = Object.values(usersRef.current).filter((u) => !u.deleted && !u.is_disabled && u.type === "human" && u.user_id !== meRef.current);
    const matched = (q ? list.filter((u) => (u.nickname ?? "").toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q)) : list).slice(0, 8);
    const special: SuggestItem[] = ["all", "channel", "here"].filter((k) => !q || k.startsWith(q)).map((k) => ({ key: k, label: `@${k}`, insert: { type: "mention", attrs: { id: k, label: k } } }));
    return [...matched.map<SuggestItem>((u) => ({ key: String(u.user_id), label: userLabel(u), userId: u.user_id, insert: { type: "mention", attrs: { id: String(u.user_id), label: userLabel(u) } } })), ...special].slice(0, 8);
  }, []);
  const emojiItems = useCallback((query: string): SuggestItem[] =>
    searchEmoji(query, 8).map((e) => ({ key: e.n, label: `:${e.n}:`, char: e.c, insert: { type: "emoji", attrs: { name: e.n, char: e.c } } })), []);

  // Read the document one tick later: ProseMirror applies a just-committed IME composition (and the last typed
  // character) through the DOM observer in a microtask, so a synchronous read inside keydown can miss the last syllable.
  // Even then the state can lag the DOM: ProseMirror ends a composition on a 20ms timer when no mutation record was
  // pending at compositionend, and WebView2/WKWebView sometimes commit the syllable a frame late. So before sending,
  // flush the observer and compare the DOM text with the document text; while they differ (or a composition is still
  // open) wait a little and look again, up to SUBMIT_SYNC_TRIES. Only then read the document.
  const scheduleSubmit = (view: EditorView) => {
    const attempt = (n: number) => {
      try { (view as unknown as { domObserver?: { flush(): void } }).domObserver?.flush(); } catch { /* internal API; best effort */ }
      if (n < SUBMIT_SYNC_TRIES && (view.composing || !docMatchesDom(view))) { setTimeout(() => attempt(n + 1), SUBMIT_SYNC_STEP_MS); return; }
      // Still composing after the whole wait: make the IME commit what it holds (blur commits it) before reading.
      if (view.composing && n === SUBMIT_SYNC_TRIES) {
        try { view.dom.blur(); view.focus(); (view as unknown as { domObserver?: { flush(): void } }).domObserver?.flush(); } catch { /* best effort */ }
      }
      if (import.meta.env.DEV && n > 0) console.warn(`[composer] waited ${n}×${SUBMIT_SYNC_STEP_MS}ms for the editor to catch up`, docMatchesDom(view) ? "(synced)" : "(still differs; sending anyway)");
      trace("send", { tries: n, composing: view.composing, doc: JSON.stringify(view.state.doc.textBetween(0, view.state.doc.content.size, "|", leafText)), dom: JSON.stringify(view.dom.textContent) });
      submitRef.current();
    };
    setTimeout(() => attempt(0), 0);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ bold: false, italic: false, strike: false, heading: false, horizontalRule: false, link: false, underline: false, orderedList: false, trailingNode: false }),
      SynoBold, SynoItalic, SynoStrike,
      EmojiNode, MentionNode, BlockShiftEnter, LineHomeEnd,
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
      SuggestExtension.extend({ name: "suggestMention" }).configure({ char: "@", minLength: 0, items: userItems, onChange: onSuggest }),
      SuggestExtension.extend({ name: "suggestEmoji" }).configure({ char: ":", minLength: 2, items: emojiItems, onChange: onSuggest }),
    ],
    editorProps: {
      attributes: { class: "composer-editor", spellcheck: "false" },
      // Enter lives in handleDOMEvents, not handleKeyDown: ProseMirror drops the keydown that WebKit emits right after a
      // Korean composition ends (its Japanese-IME guard), and the browser then inserts a paragraph instead of us sending.
      // handleDOMEvents runs before that guard and sees every keydown.
      handleDOMEvents: {
        keydown: (view, e) => {
          // `key` is "Process" while an IME composes; `code` still names the physical key.
          const isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
          if (isEnter) trace("keydown Enter", { key: e.key, keyCode: e.keyCode, isComposing: e.isComposing, viewComposing: view.composing, shift: e.shiftKey, mod: e.metaKey || e.ctrlKey, sinceCompEnd: Date.now() - lastCompositionEnd.current });
          if (!isEnter || e.shiftKey || e.altKey) return false;
          if (suggestRef.current) return false; // the popup takes Enter to pick an item
          const mod = e.metaKey || e.ctrlKey;
          // Touch keyboards: Enter is a newline and the send button sends (no Shift key to reach for).
          if (isTouchNow() && !mod) return false;
          const composing = e.isComposing || view.composing || e.keyCode === 229;
          if (!mod && editor?.isActive("codeBlock")) {
            // Code blocks are the one place Enter keeps writing. An empty last line steps out of the block instead.
            if (composing) return false;
            const { $from, empty } = view.state.selection;
            const before = $from.parent.textContent.slice(0, $from.parentOffset);
            if (empty && (before === "" || before.endsWith("\n")) && $from.parentOffset === $from.parent.content.size) {
              if (before.endsWith("\n")) editor.commands.deleteRange({ from: $from.pos - 1, to: $from.pos });
              editor.commands.exitCode();
              return true;
            }
            hintEnterInCode();
            editor.commands.newlineInCode();
            return true;
          }
          // WebKit order: compositionend first, then the Enter's keydown still flagged keyCode 229. Nothing is composing
          // any more and no compositionend is coming, so waiting for one would drop the send (and the browser would
          // insert a paragraph instead). Treat that Enter as a plain one.
          const lateEnter = e.keyCode === 229 && !e.isComposing && !view.composing && Date.now() - lastCompositionEnd.current < LATE_ENTER_MS;
          if (composing && !lateEnter) {
            // The IME is committing the syllable with this Enter. Let it finish; compositionend sends.
            pendingEnter.current = Date.now();
            return false;
          }
          e.preventDefault(); // never let the browser split the paragraph
          scheduleSubmit(view);
          return true;
        },
        compositionend: (view) => {
          lastCompositionEnd.current = Date.now();
          trace("compositionend", { pendingEnter: !!pendingEnter.current });
          if (pendingEnter.current && Date.now() - pendingEnter.current < PENDING_ENTER_MS) {
            pendingEnter.current = 0;
            scheduleSubmit(view);
          } else pendingEnter.current = 0;
          return false;
        },
      },
      handlePaste: (view, e) => {
        const files = Array.from(e.clipboardData?.items ?? []).filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter((f): f is File => !!f);
        if (files.length && filesRef.current) { filesRef.current(files); return true; }
        // Text always goes in as plain text: line breaks and spacing stay, but the source's bold/links/fonts/tables
        // (HTML on the clipboard) are dropped. Formatting is typed in the composer itself.
        const text = e.clipboardData?.getData("text/plain");
        if (!text) return false;
        e.preventDefault();
        pastePlainText(view, text);
        return true;
      },
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      empty: !ed || docIsEmpty(ed.getJSON()),
      bold: !!ed?.isActive("bold"), italic: !!ed?.isActive("italic"), strike: !!ed?.isActive("strike"), code: !!ed?.isActive("code"),
      quote: !!ed?.isActive("blockquote"), list: !!ed?.isActive("bulletList"), codeBlock: !!ed?.isActive("codeBlock"),
    }),
  });

  const insertEmoji = (name: string, char: string) => editor?.chain().focus().insertContent([{ type: "emoji", attrs: { name, char } }, { type: "text", text: " " }]).run();

  return { editor, state, suggest, insertEmoji };
}
