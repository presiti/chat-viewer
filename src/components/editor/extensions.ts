import { Extension, Node, markInputRule, mergeAttributes } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey, Selection, TextSelection } from "@tiptap/pm/state";

/* Marks with Synology's single-character input rules: *bold* _italic_ ~strike~ */
export const SynoBold = Bold.extend({
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(\*(?!\s+\*)([^*]+)\*(?!\s+\*))$/, type: this.type })];
  },
});
export const SynoItalic = Italic.extend({
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(_(?!\s+_)([^_]+)_(?!\s+_))$/, type: this.type })];
  },
});
export const SynoStrike = Strike.extend({
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(~(?!\s+~)([^~]+)~(?!\s+~))$/, type: this.type })];
  },
});

/* Inline atom: emoji (rendered as the native character, serialized as :shortname:) */
export const EmojiNode = Node.create({
  name: "emoji",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return { name: { default: "" }, char: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-emoji]", getAttrs: (el) => ({ name: (el as HTMLElement).getAttribute("data-emoji"), char: (el as HTMLElement).textContent }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "emoji", "data-emoji": node.attrs.name, title: `:${node.attrs.name}:` }), node.attrs.char];
  },
  renderText({ node }) {
    return `:${node.attrs.name}:`;
  },
});

/* Inline atom: mention (serialized as @u:<id> or @all/@channel/@here) */
export const MentionNode = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return { id: { default: "" }, label: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-mention-id]", getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute("data-mention-id"), label: (el as HTMLElement).getAttribute("data-mention-label") ?? (el as HTMLElement).textContent?.replace(/^@/, "") }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "mention", "data-mention-id": node.attrs.id, "data-mention-label": node.attrs.label }), `@${node.attrs.label}`];
  },
  renderText({ node }) {
    return `@${node.attrs.label}`;
  },
  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        this.editor.commands.command(({ tr, state }) => {
          const { selection } = state;
          if (!selection.empty) return false;
          let handled = false;
          state.doc.nodesBetween(selection.from - 1, selection.from, (node, pos) => {
            if (node.type.name === this.name) { tr.deleteRange(pos, pos + node.nodeSize); handled = true; return false; }
            return true;
          });
          return handled;
        }),
    };
  },
});

/* Suggestion popup state handed to React */
export interface SuggestItem { key: string; label: string; char?: string; userId?: number; insert: Record<string, unknown> & { type: string } }
export interface SuggestState { items: SuggestItem[]; index: number; command: (item: SuggestItem) => void }

interface SuggestOptions {
  char: string;
  minLength: number;
  items: (query: string) => SuggestItem[];
  onChange: (state: SuggestState | null) => void;
}

/** Generic trigger-character autocomplete; the popup itself is rendered by the composer. */
export const SuggestExtension = Extension.create<SuggestOptions>({
  name: "suggest",
  addOptions() {
    return { char: "@", minLength: 1, items: () => [], onChange: () => undefined };
  },
  addProseMirrorPlugins() {
    const opts = this.options;
    let index = 0;
    let current: SuggestState | null = null;
    const emit = (props: SuggestionProps<SuggestItem> | null) => {
      if (!props || props.query.length < opts.minLength || props.items.length === 0) { current = null; opts.onChange(null); return; }
      current = { items: props.items, index: Math.min(index, props.items.length - 1), command: (item) => props.command(item) };
      opts.onChange(current);
    };
    return [
      Suggestion<SuggestItem>({
        editor: this.editor,
        pluginKey: new PluginKey(`suggest-${opts.char}`),
        char: opts.char,
        allowSpaces: false,
        items: ({ query }) => opts.items(query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, [props.insert, { type: "text", text: " " }]).run();
        },
        render: () => ({
          onStart: (props) => { index = 0; emit(props); },
          onUpdate: (props) => emit(props),
          onExit: () => { current = null; opts.onChange(null); },
          onKeyDown: ({ event }: SuggestionKeyDownProps) => {
            if (!current) return false;
            if (event.key === "ArrowDown") { index = (current.index + 1) % current.items.length; current = { ...current, index }; opts.onChange(current); return true; }
            if (event.key === "ArrowUp") { index = (current.index - 1 + current.items.length) % current.items.length; current = { ...current, index }; opts.onChange(current); return true; }
            if (event.key === "Enter" || event.key === "Tab") { current.command(current.items[current.index]); return true; }
            if (event.key === "Escape") { current = null; opts.onChange(null); return true; }
            return false;
          },
        }),
      }),
    ];
  },
});

/**
 * Shift+Enter inside a list or quote continues the block (new item / new line) instead of inserting a hard break,
 * since plain Enter sends there. An empty item or line steps out of the block. Runs before HardBreak's Shift-Enter.
 */
export const BlockShiftEnter = Extension.create({
  name: "blockShiftEnter",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () => {
        const { editor } = this;
        const { $from } = editor.state.selection;
        if (editor.isActive("listItem")) {
          return $from.parent.content.size === 0 ? editor.commands.liftListItem("listItem") : editor.commands.splitListItem("listItem");
        }
        if (editor.isActive("blockquote")) {
          return $from.parent.content.size === 0 ? editor.commands.lift("blockquote") : editor.commands.splitBlock();
        }
        return false;
      },
    };
  },
});

/**
 * Home/End move the caret to the start/end of the current visual line (Shift extends the selection);
 * ⌘/Ctrl+Home/End go to the start/end of the whole draft. macOS WebKit scrolls the page on Home/End instead of
 * moving the caret, which users coming from Windows (and the official app) do not expect. The browser's own
 * line-boundary logic is reused so wrapped lines behave like a native text field.
 */
export const LineHomeEnd = Extension.create({
  name: "lineHomeEnd",
  priority: 1000,
  addKeyboardShortcuts() {
    const line = (dir: "backward" | "forward", extend: boolean) => () => {
      const { view } = this.editor;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !view.hasFocus()) return false;
      sel.modify(extend ? "extend" : "move", dir, "lineboundary");
      try {
        const doc = view.state.doc;
        const anchor = view.posAtDOM(sel.anchorNode!, sel.anchorOffset);
        const head = view.posAtDOM(sel.focusNode!, sel.focusOffset);
        view.dispatch(view.state.tr.setSelection(TextSelection.between(doc.resolve(anchor), doc.resolve(head))).scrollIntoView());
      } catch {
        /* the DOM selection left the editor: keep whatever the browser did */
      }
      return true;
    };
    const whole = (end: boolean, extend: boolean) => () => {
      const { state, view } = this.editor;
      const target = end ? Selection.atEnd(state.doc) : Selection.atStart(state.doc);
      const sel = extend ? TextSelection.between(state.selection.$anchor, target.$head) : target;
      view.dispatch(state.tr.setSelection(sel).scrollIntoView());
      return true;
    };
    return {
      Home: line("backward", false),
      End: line("forward", false),
      "Shift-Home": line("backward", true),
      "Shift-End": line("forward", true),
      "Mod-Home": whole(false, false),
      "Mod-End": whole(true, false),
      "Mod-Shift-Home": whole(false, true),
      "Mod-Shift-End": whole(true, true),
    };
  },
});
