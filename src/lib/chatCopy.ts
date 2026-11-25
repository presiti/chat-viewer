/**
 * Copying a drag-selection across chat messages yields raw DOM text (avatars, hover buttons, reaction counts,
 * stray timestamps). Tidy it: one block per message, "이름  날짜 시간" then the body, code blocks kept as-is.
 * A selection that sits inside a single message body is left alone so partial copies stay exact.
 */
const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Text of the part of `el` inside `range`, without UI chrome. */
function clippedText(range: Range, el: Element): { text: string; html: string } {
  const r = document.createRange();
  r.selectNodeContents(el);
  if (range.compareBoundaryPoints(Range.START_TO_START, r) > 0) r.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, r) < 0) r.setEnd(range.endContainer, range.endOffset);
  const box = document.createElement("div");
  box.appendChild(r.cloneContents());
  box.querySelectorAll("[data-copy], .copy-btn, button").forEach((n) => n.remove());
  box.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  box.querySelectorAll("li").forEach((n) => n.prepend("• "));
  const html = box.innerHTML;
  return { text: (box.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim(), html };
}

function onCopy(e: ClipboardEvent) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !e.clipboardData) return;
  const range = sel.getRangeAt(0);
  const anchor = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  if (!anchor) return;
  const root = anchor.closest("[data-msg-list]") ?? anchor.querySelector?.("[data-msg-list]");
  if (!root) return;
  if (anchor.closest(".msg-body") && anchor.closest("[data-msg]")) return; // inside one message body: keep the exact selection
  const msgs = Array.from(root.querySelectorAll<HTMLElement>("[data-msg]")).filter((m) => range.intersectsNode(m));
  if (msgs.length === 0) return;

  const plain: string[] = [];
  const html: string[] = [];
  for (const m of msgs) {
    const bodies = Array.from(m.querySelectorAll(".msg-body"));
    const parts = bodies.filter((b) => range.intersectsNode(b)).map((b) => clippedText(range, b)).filter((p) => p.text);
    if (parts.length === 0 && m.dataset.file) parts.push({ text: `📎 ${m.dataset.file}`, html: esc(`📎 ${m.dataset.file}`) });
    if (parts.length === 0) continue;
    const head = `${m.dataset.sender ?? ""}  ${stamp(Number(m.dataset.at) || 0)}`;
    plain.push(`${head}\n${parts.map((p) => p.text).join("\n")}`);
    html.push(`<div style="margin:0 0 10px"><div><b>${esc(m.dataset.sender ?? "")}</b> <span style="color:#888;font-size:12px">${stamp(Number(m.dataset.at) || 0)}</span></div>${parts.map((p) => `<div style="white-space:pre-wrap">${p.html}</div>`).join("")}</div>`);
  }
  if (plain.length === 0) return;
  e.preventDefault();
  e.clipboardData.setData("text/plain", plain.join("\n\n"));
  e.clipboardData.setData("text/html", html.join(""));
}

export function installChatCopy(): () => void {
  document.addEventListener("copy", onCopy);
  return () => document.removeEventListener("copy", onCopy);
}
