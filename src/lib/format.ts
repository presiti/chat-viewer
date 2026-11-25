import dayjs from "dayjs";
import "dayjs/locale/ko";
import type { Post, User } from "../api/types";
import { userLabel } from "../store/chat";
import { escapeHtml, highlight } from "./highlight";
import { emojiFromShortname } from "./emoji";

dayjs.locale("ko");

export const formatTime = (ms: number) => dayjs(ms).format("HH:mm");
export const formatDateTime = (ms: number) => dayjs(ms).format("YYYY.MM.DD HH:mm");

export function formatDay(ms: number): string {
  const d = dayjs(ms);
  const today = dayjs();
  if (d.isSame(today, "day")) return "오늘";
  if (d.isSame(today.subtract(1, "day"), "day")) return "어제";
  return d.isSame(today, "year") ? d.format("M월 D일 dddd") : d.format("YYYY년 M월 D일 dddd");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;
const MENTION_RE = /@u:(\d+)|@(all|channel|here)\b/g;
const SHORTNAME_RE = /:([a-z0-9_+-]+):/g;

/**
 * Synology Chat markup → safe HTML.
 *   *bold*  _italic_  ~strike~  `code`  ```block```  >quote  >>>multi-line quote  * list  @u:<id>  :emoji:
 */
export interface RenderOptions {
  /** Emit plain `<pre><code class="language-x">` and data attributes so the editor can parse it back. */
  forEditor?: boolean;
}

export function renderMessageHtml(text: string, users: Record<number, User>, opts: RenderOptions = {}): string {
  if (!text) return "";
  const out: string[] = [];
  // 1) fenced code blocks are opaque
  const parts = text.split(/(```[\s\S]*?```)/g);
  for (const part of parts) {
    if (part.startsWith("```") && part.endsWith("```") && part.length >= 6) {
      let body = part.slice(3, -3);
      let lang: string | undefined;
      const m = body.match(/^([a-zA-Z0-9+#-]{1,20})\n/);
      if (m) { lang = m[1]; body = body.slice(m[0].length); }
      body = body.replace(/^\n/, "").replace(/\n$/, "");
      if (opts.forEditor) out.push(`<pre><code class="language-${escapeHtml(lang ?? "")}">${escapeHtml(body)}</code></pre>`);
      else out.push(`<pre class="code-block" data-lang="${escapeHtml(lang ?? "")}"><button class="copy-btn" data-copy type="button">복사</button><code>${highlight(body, lang)}</code></pre>`);
      continue;
    }
    out.push(renderBlocks(part, users, opts));
  }
  return out.join("");
}

/** Block-level: multi-line quote (>>>), single-line quotes (>), lists (* ). */
function renderBlocks(text: string, users: Record<number, User>, opts: RenderOptions = {}): string {
  const lines = text.split("\n");
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith(">>>")) {
      const rest = [line.slice(3), ...lines.slice(i + 1)].join("\n").replace(/^\n/, "");
      html.push(`<blockquote>${renderInlineLines(rest, users, opts)}</blockquote>`);
      break;
    }
    if (line.startsWith(">")) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith(">") && !lines[i].startsWith(">>>")) { q.push(lines[i].replace(/^>\s?/, "")); i++; }
      html.push(`<blockquote>${renderInlineLines(q.join("\n"), users, opts)}</blockquote>`);
      continue;
    }
    if (/^[*•-] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[*•-] /.test(lines[i])) { items.push(`<li>${renderInline(lines[i].slice(2), users, opts)}</li>`); i++; }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    html.push(renderInline(line, users, opts));
    i++;
    if (i < lines.length) html.push("<br>");
  }
  // Drop a trailing <br> left before a block element.
  return html.join("").replace(/<br>(<blockquote>|<ul>)/g, "$1").replace(/(<\/blockquote>|<\/ul>)<br>/g, "$1");
}

const renderInlineLines = (text: string, users: Record<number, User>, opts: RenderOptions = {}) => text.split("\n").map((l) => renderInline(l, users, opts)).join("<br>");

/** Inline: inline code (opaque), then bold/italic/strike, links, mentions, emoji. */
function renderInline(text: string, users: Record<number, User>, opts: RenderOptions = {}): string {
  const segs = text.split(/(`[^`\n]+`)/g);
  return segs
    .map((seg) => {
      if (seg.length > 1 && seg.startsWith("`") && seg.endsWith("`")) return `<code>${escapeHtml(seg.slice(1, -1))}</code>`;
      let h = escapeHtml(seg);
      // links first so markup inside URLs is untouched
      h = h.replace(/&lt;(https?:\/\/[^|&]+)\|([^&]+)&gt;/g, (_m, url, label) => `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`);
      h = h.replace(URL_RE, (url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`);
      // Markers may sit next to each other (e.g. *_text_*) so nested styles survive.
      h = h.replace(/(^|[\s(（_~>])\*([^*\n]+?)\*(?=$|[\s.,!?;:)）_~<])/g, "$1<strong>$2</strong>");
      h = h.replace(/(^|[\s(（*~>])_([^_\n]+?)_(?=$|[\s.,!?;:)）*~<])/g, "$1<em>$2</em>");
      h = h.replace(/(^|[\s(（*_>])~([^~\n]+?)~(?=$|[\s.,!?;:)）*_<])/g, "$1<s>$2</s>");
      h = h.replace(MENTION_RE, (_m, id, kw) =>
        id
          ? `<span class="mention" data-mention-id="${id}" data-mention-label="${escapeHtml(userLabel(users[Number(id)]))}">@${escapeHtml(userLabel(users[Number(id)]))}</span>`
          : `<span class="mention" data-mention-id="${kw}" data-mention-label="${kw}">@${kw}</span>`,
      );
      h = h.replace(SHORTNAME_RE, (m, name: string) => {
        const ch = emojiFromShortname(name);
        return ch ? `<span class="emoji" data-emoji="${name}" title=":${name}:">${ch}</span>` : m;
      });
      void opts;
      return h;
    })
    .join("");
}

/**
 * Markup squeezed for a clamped preview (search results): blank lines collapsed, fenced code reduced to its first
 * line, length capped. Keeps inline styles/mentions/emoji so the preview still renders with `renderMessageHtml`.
 * Without this a message that starts with blank lines, or carries a long code block, shows as an empty or
 * oversized box inside `line-clamp-3`.
 */
export function compactMessage(text: string, max = 400): string {
  return (text ?? "")
    .replace(/```[a-zA-Z0-9+#-]{0,20}\n?([\s\S]*?)```/g, (_m, body: string) => {
      const first = body.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
      return first ? `[코드] \`${first.replace(/`/g, "'").slice(0, 120)}\`` : "[코드]";
    })
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, max);
}

/** Plain-text preview (sidebar, notifications, search results). */
export function previewText(post: Post, users: Record<number, User>): string {
  if (post.type === "file") return `파일: ${post.file_props?.name ?? ""}`;
  if (post.type === "sticker") return "스티커";
  return (post.message ?? "")
    .replace(/```[\s\S]*?```/g, "[코드]")
    .replace(MENTION_RE, (_m, id, kw) => (id ? `@${userLabel(users[Number(id)])}` : `@${kw}`))
    .replace(SHORTNAME_RE, (m, name: string) => emojiFromShortname(name) ?? m)
    .replace(/[*_~`>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** Highlight keyword matches in an already-escaped HTML string. */
export function highlightKeywords(html: string, keywords: string[]): string {
  const words = keywords.map((k) => k.trim()).filter(Boolean);
  if (!words.length) return html;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  // only replace in text nodes: split on tags
  return html.split(/(<[^>]+>)/g).map((chunk) => (chunk.startsWith("<") ? chunk : chunk.replace(re, "<mark>$1</mark>"))).join("");
}

export function initials(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  return /[가-힣]/.test(t[0]) ? t[0] : t.slice(0, 2).toUpperCase();
}

const PALETTE = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#2dd4bf", "#60a5fa", "#a78bfa", "#f472b6"];
export function colorFor(id: number): string {
  return PALETTE[Math.abs(id) % PALETTE.length];
}
