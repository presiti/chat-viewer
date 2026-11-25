import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { ChevronDown, ChevronRight, Link2, Search, SlidersHorizontal, X } from "lucide-react";
import { ChannelIcon } from "./ChannelIcon";
import { chat } from "../api/client";
import { localIndex, useIndexer } from "../store/index";
import { useSearch } from "../store/search";
import { matchesFileFilter, parseExts, resolveFileFilter } from "../lib/fileKinds";
import { FileKindFilter } from "./FileKindFilter";
import { isSettingsPost } from "../lib/settingsFile";
import type { Post } from "../api/types";
import { channelLabel, useChat, userLabel } from "../store/chat";
import { useSession } from "../store/session";
import { useUi } from "../store/ui";
import { compactMessage, formatDateTime, highlightKeywords, previewText, renderMessageHtml } from "../lib/format";
import { IconButton } from "./IconButton";
import { Avatar } from "./Avatar";
import { fieldClass } from "./Dialog";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const chip = (on: boolean) => clsx("rounded-full px-2.5 py-[3px] border text-[12px]", on ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--hover)]");

/** Secondary line for things the index matches outside the message text: vote choices and link titles. */
function extraPreview(p: Post, words: string[]) {
  const choices = p.props?.vote?.choices;
  const vote = p.type === "vote" && choices?.length ? `투표: ${choices.map((c) => c.text).join(" · ")}` : null;
  const links = (p.url_props ?? []).filter((u) => u.title);
  if (!vote && links.length === 0) return null;
  return (
    <div className="mt-0.5 text-[12px] text-[var(--fg-muted)] break-words space-y-0.5">
      {vote && <div className="line-clamp-1" dangerouslySetInnerHTML={{ __html: highlightKeywords(esc(vote), words) }} />}
      {links.slice(0, 2).map((u, i) => (
        <div key={i} className="flex items-center gap-1 min-w-0"><Link2 className="w-3 h-3 shrink-0" /><span className="truncate" dangerouslySetInnerHTML={{ __html: highlightKeywords(esc(u.title!), words) }} /></div>
      ))}
    </div>
  );
}

/**
 * ⌘K search palette: one modal with the query, scope, filters and results. The header never changes.
 * Enter runs the search right away (no debounce wait); after ↑↓ picked a row, Enter opens it. Esc closes.
 * An Enter that ends IME composition (Korean) is ignored, so typing never jumps away.
 */
export function SearchPalette() {
  const open = useSearch((s) => s.open);
  const setOpen = useSearch((s) => s.setOpen);
  const q = useSearch((s) => s.q);
  const setQ = useSearch((s) => s.setQ);
  const where = useSearch((s) => s.where);
  const scope = useSearch((s) => s.scope);
  const from = useSearch((s) => s.from);
  const after = useSearch((s) => s.after);
  const before = useSearch((s) => s.before);
  const kinds = useSearch((s) => s.kinds);
  const extText = useSearch((s) => s.extText);
  const showFilters = useSearch((s) => s.showFilters);
  const patch = useSearch((s) => s.patch);
  const resetFilters = useSearch((s) => s.resetFilters);

  const channels = useChat((s) => s.channels);
  const users = useChat((s) => s.users);
  const activeId = useChat((s) => s.activeChannelId);
  const jumpToPost = useChat((s) => s.jumpToPost);
  const setView = useUi((s) => s.setView);
  const me = useSession((s) => s.info?.user_id);
  const indexStatus = useIndexer((s) => s.status);
  const indexing = useIndexer((s) => s.running);

  const [results, setResults] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  /** True once ↑↓ chose a row: only then does Enter open instead of search. Typing or new results clears it. */
  const [picked, setPicked] = useState(false);
  const reqId = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const fileKindDefs = useUi((s) => s.fileKinds);
  const exts = useMemo(() => parseExts(extText), [extText]);
  /** What the index understands: a flat extension list plus the "unknown extension" flag. */
  const resolved = useMemo(() => resolveFileFilter(kinds, exts, fileKindDefs), [kinds, exts, fileKindDefs]);
  const fileFilterOn = scope === "file" || kinds.length > 0 || exts.length > 0;
  const activeFilters = (from ? 1 : 0) + (after || before ? 1 : 0) + (fileFilterOn ? 1 : 0) + (scope !== "all" ? 1 : 0);
  const kindKey = kinds.join(","), extKey = exts.join(",");

  useEffect(() => { if (open) { setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0); } }, [open]);

  const run = useCallback(async (offset: number) => {
    const keyword = q.trim();
    if (!keyword && !fileFilterOn) { setResults([]); setTotal(0); return; }
    const id = ++reqId.current;
    setLoading(true); setError(null);
    const channelIds = where === "channel" && activeId ? [activeId] : [];
    const afterMs = after ? new Date(after).getTime() : null;
    const beforeMs = before ? new Date(before).getTime() + 86_400_000 : null;
    try {
      const local = await localIndex.search({ query: keyword, channelIds, from: from || null, after: afterMs, before: beforeMs, filesOnly: fileFilterOn, scope, kinds: resolved.other ? ["other"] : [], exts: resolved.exts, offset, limit: 25 }).catch(() => ({ total: 0, items: [] as Post[] }));
      const remote = scope === "file" ? null : await chat.search({ keyword, in: channelIds, from: from ? [from] : [], post_type: fileFilterOn ? ["file"] : [], after: afterMs, before: beforeMs, offset, limit: 25 }).catch(() => null);
      if (id !== reqId.current) return;
      const remoteItems = (remote?.search_results ?? []).filter((p) => !isSettingsPost(p) && matchesFileFilter(p.file_props?.name, kinds, exts, fileKindDefs) && (scope !== "file" || p.type === "file"));
      const seen = new Set<number>();
      const merged: Post[] = [];
      for (const p of [...local.items, ...remoteItems]) { if (!seen.has(p.post_id)) { seen.add(p.post_id); merged.push(p); } }
      merged.sort((a, b) => b.create_at - a.create_at);
      setResults((prev) => { if (!offset) return merged; const have = new Set(prev.map((p) => p.post_id)); return [...prev, ...merged.filter((p) => !have.has(p.post_id))]; });
      setTotal(Math.max(local.total, remote?.total ?? 0));
      if (!offset) { setCursor(0); setPicked(false); }
    } catch (e) {
      if (id === reqId.current) setError((e as { message?: string })?.message ?? String(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, where, from, after, before, fileFilterOn, scope, kindKey, extKey, activeId]);

  useEffect(() => {
    if (!open) return;
    debounce.current = setTimeout(() => { debounce.current = null; void run(0); }, 250);
    return () => { if (debounce.current) { clearTimeout(debounce.current); debounce.current = null; } };
  }, [run, open]);
  /** Enter: skip the debounce and search now. */
  const runNow = useCallback(() => { if (debounce.current) { clearTimeout(debounce.current); debounce.current = null; } void run(0); }, [run]);

  const go = useCallback((p: Post) => { setOpen(false); setView("channel"); void jumpToPost(p.channel_id, p.post_id); }, [jumpToPost, setOpen, setView]);

  // Keyboard: ↑↓ pick, Enter = search (or open the picked row), Esc close. Also keep the highlighted row in view.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // The Enter/arrow that commits a Korean composition must not act on the list.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
      else if (e.key === "ArrowDown") { if (results.length) { e.preventDefault(); setPicked(true); setCursor((c) => Math.min(results.length - 1, c + 1)); } }
      else if (e.key === "ArrowUp") { if (results.length) { e.preventDefault(); setPicked(true); setCursor((c) => Math.max(0, c - 1)); } }
      else if (e.key === "Enter" && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        const p = picked ? results[cursor] : undefined;
        if (p) go(p); else runNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, cursor, picked, go, runNow, setOpen]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)?.scrollIntoView({ block: "nearest" }); }, [cursor]);

  // Centre over the chat column (not the whole window), without dimming it.
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const place = () => { const el = document.querySelector<HTMLElement>("[data-main-area]"); if (el) { const r = el.getBoundingClientRect(); setBox({ left: r.left, width: r.width }); } else setBox(null); };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  if (!open) return null;
  const words = q.trim().split(/\s+/).filter(Boolean);
  const humans = Object.values(users).filter((u) => u.type === "human" && !u.deleted).sort((a, b) => userLabel(a).localeCompare(userLabel(b)));
  const curLabel = activeId && channels[activeId] ? channelLabel(channels[activeId], users, me) : "현재 채널";

  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-start pt-[10vh]" style={box ? { paddingLeft: box.left, paddingRight: window.innerWidth - box.left - box.width, justifyContent: "center" } : { justifyContent: "center" }} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      {/* Dim only the chat column behind the palette; the sidebar stays as is. */}
      {box && <div className="pointer-events-none fixed top-0 bottom-0 z-0 bg-black/35" style={{ left: box.left, width: box.width }} />}
      {/* Positioned + z-10 so the palette paints above the dim layer (a positioned sibling would otherwise cover it). */}
      <div className="popover relative z-10 w-[720px] max-w-[94%] max-h-[78vh] flex flex-col overflow-hidden shadow-[0_18px_50px_rgba(0,0,0,.35)] ring-1 ring-black/10" onMouseDown={(e) => e.stopPropagation()}>
        {/* Query row */}
        <div className="flex items-center gap-2 px-4 h-[52px] border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--fg-muted)] shrink-0" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setPicked(false); }} placeholder="메시지 · 파일 · 투표 · 링크 검색 (여러 단어는 모두 포함)" className="flex-1 min-w-0 bg-transparent outline-none text-[15px]" />
          <div className="flex rounded-md border border-[var(--border)] overflow-hidden text-[12px]">
            <button type="button" className={clsx("px-2.5 py-1 max-w-[180px] truncate", where === "channel" ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "hover:bg-[var(--hover)]")} onClick={() => patch({ where: "channel" })} title={`현재 채널: ${curLabel}`}>{curLabel}</button>
            <button type="button" className={clsx("px-2.5 py-1", where === "all" ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "hover:bg-[var(--hover)]")} onClick={() => patch({ where: "all" })}>전체 채널</button>
          </div>
          <IconButton label="닫기 (Esc)" size="sm" onClick={() => setOpen(false)}><X /></IconButton>
        </div>
        {/* Filter row */}
        <div className="px-4 py-2 border-b border-[var(--border)] text-[12px] space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[var(--fg-muted)]">대상</span>
            {([["all", "전체"], ["message", "메시지"], ["file", "파일명"]] as const).map(([k, label]) => (
              <button key={k} type="button" className={chip(scope === k)} onClick={() => patch({ scope: k, ...(k !== "file" ? { kinds: [], extText: "" } : {}) })} title={k === "all" ? "메시지·파일명·투표 선택지·링크 제목·스니펫" : k === "message" ? "메시지 본문, 투표, 링크 제목" : "파일 이름만"}>{label}</button>
            ))}
            {activeFilters > 0 && <button type="button" className="ml-auto rounded-md px-2 py-1 text-[var(--accent)] hover:bg-[var(--hover)]" onClick={resetFilters}>필터 초기화</button>}
            <button type="button" className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]", activeFilters === 0 && "ml-auto")} onClick={() => patch({ showFilters: !showFilters })}>
              <SlidersHorizontal className="w-3.5 h-3.5" /> 필터{activeFilters > 0 && <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] text-[var(--accent-fg)]">{activeFilters}</span>}
              {showFilters ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
          {showFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <select className={`${fieldClass} !py-1 !text-[12px] !w-auto`} value={from} onChange={(e) => patch({ from: e.target.value ? Number(e.target.value) : "" })}>
                <option value="">보낸 사람: 전체</option>
                {humans.map((u) => <option key={u.user_id} value={u.user_id}>{userLabel(u)}</option>)}
              </select>
              <input type="date" className={`${fieldClass} !py-1 !text-[12px] !w-auto`} value={after} onChange={(e) => patch({ after: e.target.value })} title="이후" />
              <span className="text-[var(--fg-muted)]">~</span>
              <input type="date" className={`${fieldClass} !py-1 !text-[12px] !w-auto`} value={before} onChange={(e) => patch({ before: e.target.value })} title="이전" />
              {scope === "file" && <div className="w-full"><FileKindFilter kinds={kinds} onKinds={(k) => patch({ kinds: k })} extText={extText} onExtText={(t) => patch({ extText: t })} /></div>}
            </div>
          )}
        </div>
        {/* Results */}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-4 py-1.5 text-[11px] text-[var(--fg-muted)] flex items-center gap-2 border-b border-[var(--border)]">
            {results.length > 0 ? <span>{total}개 결과 · Enter 검색 · ↑↓ 선택 후 Enter 열기</span> : <span>{q.trim() || fileFilterOn ? (loading ? "검색 중…" : "결과가 없습니다") : "검색어를 입력하세요"}</span>}
            {indexStatus && <span className="ml-auto inline-flex items-center gap-1"><span className={clsx("w-1.5 h-1.5 rounded-full", indexing ? "bg-amber-400 animate-pulse" : "bg-green-500")} />{indexing ? `색인 중 ${indexStatus.channels_done}/${indexStatus.channels_total}` : `로컬 색인 ${indexStatus.posts.toLocaleString()}개`}</span>}
          </div>
          {error && <p className="p-3 text-[12px] text-red-500">{error}</p>}
          {results.map((p, i) => (
            <button key={p.post_id} data-i={i} onMouseEnter={() => setCursor(i)} onClick={() => go(p)} className={clsx("w-full text-left px-4 py-2 border-b border-[var(--border)]", i === cursor ? "bg-[var(--accent)]/10" : "hover:bg-[var(--hover)]")}>
              <div className="flex items-center gap-2 text-[11px] text-[var(--fg-muted)] mb-1">
                <Avatar userId={p.creator_id} size={18} />
                <span className="font-medium text-[var(--fg)]">{userLabel(users[p.creator_id])}</span>
                <span>·</span>
                {channels[p.channel_id] && <span className="inline-flex items-center gap-1 min-w-0"><ChannelIcon ch={channels[p.channel_id]} me={me} size={12} dm="none" /><span className="truncate">{channelLabel(channels[p.channel_id], users, me)}</span></span>}
                <span className="ml-auto shrink-0">{formatDateTime(p.create_at)}</span>
              </div>
              <div className="msg-body search-preview text-[13px] leading-[1.45] line-clamp-3 break-words" dangerouslySetInnerHTML={{ __html: highlightKeywords(p.type === "file" || !compactMessage(p.message) ? `<span class="text-[var(--fg-muted)]">${esc(previewText(p, users) || "(내용 없음)")}</span>` : renderMessageHtml(compactMessage(p.message), users), words) }} />
              {extraPreview(p, words)}
            </button>
          ))}
          {results.length < total && <button className="w-full py-2 text-[12px] text-[var(--accent)] hover:bg-[var(--hover)]" disabled={loading} onClick={() => void run(results.length)}>{loading ? "불러오는 중…" : "더 보기"}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
