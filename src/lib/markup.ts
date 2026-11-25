import type { JSONContent } from "@tiptap/core";
import type { User } from "../api/types";
import { renderMessageHtml } from "./format";

/* ---------- editor document → Synology markup ---------- */

type Mark = { type: string; attrs?: Record<string, unknown> };

function wrapWithMarks(text: string, marks: Mark[] = []): string {
  if (!text) return text;
  const has = (t: string) => marks.some((m) => m.type === t);
  if (has("code")) return `\`${text}\``;
  // Keep surrounding whitespace outside the markers so the server recognizes them.
  const lead = text.match(/^\s*/)?.[0] ?? "";
  const trail = text.match(/\s*$/)?.[0] ?? "";
  let core = text.slice(lead.length, text.length - trail.length);
  if (!core) return text;
  if (has("bold")) core = `*${core}*`;
  if (has("italic")) core = `_${core}_`;
  if (has("strike")) core = `~${core}~`;
  return lead + core + trail;
}

function inlineToMarkup(nodes: JSONContent[] = []): string {
  let out = "";
  for (const n of nodes) {
    switch (n.type) {
      case "text": out += wrapWithMarks(n.text ?? "", n.marks as Mark[]); break;
      case "hardBreak": out += "\n"; break;
      case "emoji": out += `:${n.attrs?.name}:`; break;
      case "mention": out += n.attrs?.id === "all" || n.attrs?.id === "channel" || n.attrs?.id === "here" ? `@${n.attrs?.id}` : `@u:${n.attrs?.id}`; break;
      default: out += inlineToMarkup(n.content); break;
    }
  }
  return out;
}

function blockToMarkup(n: JSONContent): string {
  switch (n.type) {
    case "paragraph": return inlineToMarkup(n.content);
    case "blockquote": {
      // One `>` per line: `>>>` would quote everything after it, which breaks following blocks.
      const lines = (n.content ?? []).map(blockToMarkup).join("\n").split("\n");
      return lines.map((l) => `>${l}`).join("\n");
    }
    case "bulletList":
      return (n.content ?? []).map((item) => `* ${(item.content ?? []).map(blockToMarkup).join("\n  ")}`).join("\n");
    case "orderedList":
      return (n.content ?? []).map((item, i) => `${i + 1}. ${(item.content ?? []).map(blockToMarkup).join("\n   ")}`).join("\n");
    case "codeBlock": {
      const lang = (n.attrs?.language as string | null) ?? "";
      const code = (n.content ?? []).map((t) => t.text ?? "").join("");
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    default: return inlineToMarkup(n.content);
  }
}

/** Serialize a Tiptap document to the markup Synology Chat understands. */
export function docToMarkup(doc: JSONContent): string {
  const blocks = (doc.content ?? []).map(blockToMarkup);
  // Collapse the empty trailing paragraph the editor keeps around.
  while (blocks.length && blocks[blocks.length - 1].trim() === "") blocks.pop();
  return blocks.join("\n").trim();
}

export function docIsEmpty(doc: JSONContent): boolean {
  return docToMarkup(doc).length === 0;
}

/* ---------- Synology markup → editor HTML (for edit mode) ---------- */

/** HTML that Tiptap can parse back into bold/italic/strike/code/quote/list/codeBlock/mention/emoji. */
export function markupToEditorHtml(message: string, users: Record<number, User>): string {
  return renderMessageHtml(message, users, { forEditor: true });
}
