import clsx from "clsx";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, CalendarDays, Loader2 } from "lucide-react";
import dayjs from "dayjs";
import type { Post } from "../api/types";
import { useChat } from "../store/chat";
import { useSession } from "../store/session";
import { formatDay, formatTime } from "../lib/format";
import { IconButton } from "./IconButton";
import { MessageItem } from "./MessageItem";
import { GalleryItem } from "./GalleryItem";
import { MessageSkeleton } from "./MessageSkeleton";
import { isImagePost } from "../store/imageViewer";
import { POLL_MS, useReadStatus } from "../store/readStatus";
import { useUi } from "../store/ui";

type Row =
  | { kind: "day"; key: string; label: string; ms: number }
  /** A lull inside one day: thin rule with the time the conversation resumed. */
  | { kind: "gap"; key: string; label: string }
  | { kind: "post"; key: string; post: Post; continued: boolean; afterBreak: boolean }
  /** Two or more plain photos one sender posted together: shown as a grid (GalleryItem). */
  | { kind: "gallery"; key: string; posts: Post[]; continued: boolean; afterBreak: boolean };

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const TIME_GAP_MS = 30 * 60 * 1000;
/** Photos further apart than this were not "sent together". */
const GALLERY_WINDOW_MS = 2 * 60 * 1000;

/** A photo with nothing else on it: no caption, reaction, comment, pin or bookmark. Only these merge into a gallery. */
const isPlainImage = (p: Post) =>
  isImagePost(p) && !p._pending && !p.message?.trim() && !p.reactions?.length && !p.comment_count && !p.is_sticky && !p.is_star;

/** Every post a row stands for (one for post rows, all tiles for a gallery). */
const rowPosts = (r: Row): Post[] => (r.kind === "post" ? [r.post] : r.kind === "gallery" ? r.posts : []);

function buildRows(posts: Post[]): Row[] {
  const rows: Row[] = [];
  let lastDay = "";
  let prev: Post | null = null;
  for (const p of posts) {
    const day = new Date(p.create_at).toDateString();
    let afterBreak = false;
    if (day !== lastDay) {
      rows.push({ kind: "day", key: `d:${day}`, label: formatDay(p.create_at), ms: p.create_at });
      lastDay = day;
      prev = null;
      afterBreak = true;
    } else if (prev && p.type !== "system" && p.create_at - prev.create_at >= TIME_GAP_MS) {
      rows.push({ kind: "gap", key: `g:${p.post_id}`, label: formatTime(p.create_at) });
      prev = null;
      afterBreak = true;
    }
    const continued =
      !!prev && prev.creator_id === p.creator_id && prev.type !== "system" && p.type !== "system" && p.create_at - prev.create_at < GROUP_WINDOW_MS;
    // Photos sent together join the previous plain photo (or the gallery it already started) instead of a new row.
    const last = rows[rows.length - 1];
    if (prev && last && isPlainImage(p) && prev.creator_id === p.creator_id && p.create_at - prev.create_at <= GALLERY_WINDOW_MS) {
      if (last.kind === "gallery") { last.posts.push(p); prev = p; continue; }
      if (last.kind === "post" && last.post === prev && isPlainImage(prev)) {
        rows[rows.length - 1] = { kind: "gallery", key: `gal:${prev.post_id}`, posts: [prev, p], continued: last.continued, afterBreak: last.afterBreak };
        prev = p;
        continue;
      }
    }
    rows.push({ kind: "post", key: `p:${p.post_id}`, post: p, continued, afterBreak });
    prev = p;
  }
  return rows;
}

/** Eased scroll to the bottom; the target is re-read every frame so rows that finish measuring mid-way are included. */
function animateToBottom(el: HTMLElement, state: { raf: number }, duration = 260, onDone?: () => void) {
  cancelAnimationFrame(state.raf);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { state.raf = 0; el.scrollTop = el.scrollHeight - el.clientHeight; onDone?.(); return; }
  const from = el.scrollTop;
  const t0 = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / duration);
    const target = el.scrollHeight - el.clientHeight;
    el.scrollTop = from + (target - from) * ease(t);
    if (t < 1) state.raf = requestAnimationFrame(step);
    else { state.raf = 0; onDone?.(); }
  };
  state.raf = requestAnimationFrame(step);
}

export function MessageList({ channelId }: { channelId: number }) {
  const bucket = useChat((s) => s.posts[channelId]);
  const loadOlder = useChat((s) => s.loadOlder);
  const loadNewer = useChat((s) => s.loadNewer);
  const flashPostId = useChat((s) => s.flashPostId);
  const setFlashPostId = useChat((s) => s.setFlashPostId);
  const selectChannel = useChat((s) => s.selectChannel);
  const me = useSession((s) => s.info?.user_id);
  const parentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevFirstKey = useRef<string | null>(null);
  const prevHeight = useRef(0);
  const prevLast = useRef<{ channelId: number; id: number | null }>({ channelId: -1, id: null });
  /** Messages from others that arrived while the user was scrolled up. */
  const [unseen, setUnseen] = useState(0);
  const anim = useRef({ raf: 0 });
  /** Until this time (ms, performance.now) "follow the end" snaps instead of gliding. Set on channel switch and first load. */
  const snapUntil = useRef(performance.now() + 800); // a fresh mount (channel switch remounts the list) starts at the top
  const snapChannel = useRef(channelId);
  const snapPending = useRef(!bucket?.loaded);
  // Set during render so it is in place before this render's effects run.
  if (snapChannel.current !== channelId) { snapChannel.current = channelId; snapPending.current = true; snapUntil.current = performance.now() + 800; }
  if (!bucket?.loaded) snapPending.current = true;
  else if (snapPending.current) { snapPending.current = false; snapUntil.current = performance.now() + 800; }
  const jumpToDate = useChat((s) => s.jumpToDate);
  /** True while the user scrolls (and shortly after): shows the date pill and the day rail. */
  const [scrolling, setScrolling] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  useEffect(() => {
    if (!showPicker) return;
    const close = () => setShowPicker(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showPicker]);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [topIndex, setTopIndex] = useState(0);
  /** Smoothly follow the end; after the glide, snap once so estimated row heights cannot leave a gap. */
  const glideToEnd = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    // Entering a channel (or its first load finishing) must land at the bottom at once, not sweep down the list.
    if (performance.now() < snapUntil.current) { cancelAnimationFrame(anim.current.raf); anim.current.raf = 0; el.scrollTop = el.scrollHeight - el.clientHeight; return; }
    animateToBottom(el, anim.current, 260, () => { el.scrollTop = el.scrollHeight - el.clientHeight; });
  }, []);
  // A wheel or touch from the user cancels the glide and hands control back.
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const cancel = () => { cancelAnimationFrame(anim.current.raf); anim.current.raf = 0; };
    el.addEventListener("wheel", cancel, { passive: true });
    el.addEventListener("touchstart", cancel, { passive: true });
    return () => { el.removeEventListener("wheel", cancel); el.removeEventListener("touchstart", cancel); cancel(); };
  }, [bucket?.loaded]);

  // The list shrinks or grows when the upload queue, attachment chips or the editor change height. A pure resize
  // fires no scroll event, so without this the last messages slide under whatever appeared below the list.
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    let lastH = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      if (h === lastH) return;
      cancelAnimationFrame(anim.current.raf); anim.current.raf = 0;
      if (stickToBottom.current) el.scrollTop = el.scrollHeight - el.clientHeight;
      else el.scrollTop += lastH - h; // keep the distance to the bottom edge while reading older messages
      lastH = h;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [bucket?.loaded]);

  const autoOlderKey = useRef<string | null>(null);
  const rows = useMemo(() => buildRows(bucket?.items ?? []), [bucket?.items]);

  // Read receipts for my messages: the server has no push for other people's reads, so the open channel is
  // polled while the window has focus (a handful of my newest posts per round; see store/readStatus).
  const receiptsOn = useSession((s) => !!s.serverSetting?.allow_read_status) && useUi((s) => s.readReceipts);
  const receiptsChannel = useChat((s) => { const c = s.channels[channelId]; return !!c && c.type !== "synobot" && !c.encrypted; });
  useEffect(() => {
    if (!receiptsOn || !receiptsChannel || !bucket?.loaded) return;
    const run = () => { if (document.hasFocus()) void useReadStatus.getState().tick(channelId); };
    run();
    const id = setInterval(run, POLL_MS);
    window.addEventListener("focus", run);
    return () => { clearInterval(id); window.removeEventListener("focus", run); };
  }, [channelId, receiptsOn, receiptsChannel, bucket?.loaded]);

  // Not enough messages to fill the view means there is nothing to scroll, so no scroll event will ever ask for
  // older ones: fetch them until the view is full or the history ends.
  useEffect(() => {
    const el = parentRef.current;
    if (!el || !bucket?.loaded || bucket.loading || !bucket.hasMore) return;
    const key = `${channelId}:${bucket.items.length}`;
    if (autoOlderKey.current === key) return; // already tried at this length (a failed request must not loop)
    if (el.scrollHeight <= el.clientHeight + 40) { autoOlderKey.current = key; void loadOlder(channelId); }
  }, [bucket?.loaded, bucket?.loading, bucket?.hasMore, bucket?.items.length, channelId, loadOlder]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i].kind === "post" ? 44 : rows[i].kind === "gallery" ? 280 : rows[i].kind === "day" ? 36 : 28),
    getItemKey: (i) => rows[i].key,
    overscan: 12,
  });

  // Keep the viewport anchored when older messages are prepended.
  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el || rows.length === 0) return;
    const firstKey = rows[0].key;
    const total = virtualizer.getTotalSize();
    if (prevFirstKey.current && prevFirstKey.current !== firstKey && !stickToBottom.current) {
      const delta = total - prevHeight.current;
      if (delta > 0) el.scrollTop += delta;
    } else if (stickToBottom.current && total > prevHeight.current && !bucket?.hasNewer && !flashPostId) {
      // A row at the bottom grew (reaction added, thread expanded, image loaded): glide to keep the end in view.
      glideToEnd();
    }
    prevFirstKey.current = firstKey;
    prevHeight.current = total;
  });

  const scrollToEnd = useCallback(() => {
    stickToBottom.current = true;
    setUnseen(0);
    glideToEnd();
  }, [glideToEnd]);

  // New messages at the end: my own always pull the view down; others' follow only when the user is
  // already at the bottom, otherwise they are counted for the "새 메시지" pill.
  useEffect(() => {
    const items = bucket?.items ?? [];
    const last = items[items.length - 1];
    const lastId = last?.post_id ?? null;
    const prev = prevLast.current;
    prevLast.current = { channelId, id: lastId };
    if (prev.channelId !== channelId) return; // channel switch: handled below
    const prevId = prev.id;
    if (!last || lastId === prevId || prevId === null || bucket?.hasNewer || flashPostId) return;
    // Only a genuinely appended message counts (prepends and reloads keep the same tail).
    const appended = !items.some((p) => p.post_id === prevId) ? true : items.findIndex((p) => p.post_id === prevId) < items.length - 1;
    if (!appended) return;
    if (last.creator_id === me) { scrollToEnd(); return; }
    if (stickToBottom.current) { glideToEnd(); return; }
    const after = items.findIndex((p) => p.post_id === prevId);
    const fresh = items.slice(after + 1).filter((p) => p.creator_id !== me && p.type !== "system").length;
    if (fresh) setUnseen((n) => n + fresh);
  }, [bucket?.items, bucket?.hasNewer, channelId, flashPostId, me, rows.length, scrollToEnd, virtualizer]);

  // Keep following while already at the bottom (row count can change without a new tail, e.g. day separators).
  useEffect(() => {
    if (stickToBottom.current && rows.length && !bucket?.hasNewer && !flashPostId) glideToEnd();
  }, [rows.length, glideToEnd, bucket?.hasNewer, flashPostId]);

  // Jump to bottom on channel switch (unless we are jumping to a specific post).
  useEffect(() => {
    prevFirstKey.current = null;
    prevLast.current = { channelId, id: bucket?.items[bucket.items.length - 1]?.post_id ?? null };
    setUnseen(0);
    if (flashPostId) return;
    stickToBottom.current = true;
    requestAnimationFrame(() => rows.length && virtualizer.scrollToIndex(rows.length - 1, { align: "end" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, bucket?.loaded]);

  // Scroll to and flash a specific post after a jump.
  useEffect(() => {
    if (!flashPostId || !bucket?.loaded) return;
    const idx = rows.findIndex((r) => rowPosts(r).some((p) => p.post_id === flashPostId));
    if (idx < 0) return;
    stickToBottom.current = false;
    virtualizer.scrollToIndex(idx, { align: "center" });
    const t = setTimeout(() => { virtualizer.scrollToIndex(idx, { align: "center" }); }, 120);
    const clear = setTimeout(() => setFlashPostId(null), 2500);
    return () => { clearTimeout(t); clearTimeout(clear); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashPostId, bucket?.loaded, rows.length]);

  const onScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setScrolling(true);
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setScrolling(false), 1400);
    const first = virtualizer.getVirtualItems().find((v) => v.end > el.scrollTop + 8);
    if (first) setTopIndex(first.index);
    // While a glide is running the position is transient; do not let it flip the follow flag.
    if (!anim.current.raf) stickToBottom.current = atBottom && !bucket?.hasNewer;
    if (atBottom) setUnseen(0);
    if (el.scrollTop < 200 && bucket?.hasMore && !bucket.loading) void loadOlder(channelId);
    if (atBottom && bucket?.hasNewer && !bucket.loading) void loadNewer(channelId);
  }, [bucket?.hasMore, bucket?.hasNewer, bucket?.loading, channelId, loadOlder, loadNewer, virtualizer]);

  // Day markers for the rail (one per date separator) and the date of the first visible row.
  const topRow = rows[Math.min(topIndex, rows.length - 1)];
  const topPost = topRow ? rowPosts(topRow)[0] ?? rows.slice(topIndex).map((r) => rowPosts(r)[0]).find(Boolean) : undefined;
  const pickDate = (value: string) => { setShowPicker(false); if (!value) return; const at = dayjs(value).startOf("day").valueOf(); stickToBottom.current = false; void jumpToDate(channelId, at); };

  if (!bucket?.loaded) {
    return <div className="flex-1 min-h-0 overflow-hidden">{bucket?.loading ? <MessageSkeleton /> : null}</div>;
  }

  return (
    <div className="flex-1 relative min-h-0 flex flex-col">
      {rows.length === 0 && !bucket.loading && <div className="anim-fade absolute inset-0 flex items-center justify-center text-[13px] text-[var(--fg-muted)] pointer-events-none">아직 메시지가 없습니다. 첫 메시지를 보내 보세요.</div>}
      <div data-msg-list ref={parentRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {bucket.loading && (
            <div className="anim-fade absolute top-1 inset-x-0 z-10 flex justify-center pointer-events-none">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-[12px] text-[var(--fg-muted)] shadow-sm"><Loader2 className="h-3.5 w-3.5 animate-spin" />이전 메시지 불러오는 중</span>
            </div>
          )}
          {virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index];
            return (
              <div
                key={row.key}
                data-index={v.index}
                ref={virtualizer.measureElement}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}
              >
                {row.kind === "day" ? (
                  <div className="flex items-center gap-3 px-5 py-2 text-[12px] text-[var(--fg-muted)]">
                    <div className="flex-1 h-px bg-[var(--border)]" />
                    <span>{row.label}</span>
                    <div className="flex-1 h-px bg-[var(--border)]" />
                  </div>
                ) : row.kind === "gap" ? (
                  <div className="flex items-center gap-3 px-5 pt-3 pb-1 text-[11px] text-[var(--fg-muted)]/80">
                    <div className="flex-1 h-px bg-[var(--border)]/70" />
                    <span className="tabular-nums">{row.label}</span>
                    <div className="flex-1 h-px bg-[var(--border)]/70" />
                  </div>
                ) : row.kind === "gallery" ? (
                  <GalleryItem posts={row.posts} continued={row.continued} afterBreak={row.afterBreak} isMine={row.posts[0].creator_id === me} flashId={flashPostId && row.posts.some((p) => p.post_id === flashPostId) ? flashPostId : null} />
                ) : (
                  <MessageItem post={row.post} continued={row.continued} afterBreak={row.afterBreak} isMine={row.post.creator_id === me} flash={row.post.post_id === flashPostId} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* Date pill: where you are while scrolling. */}
      {scrolling && topPost && (
        <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--bg)]/95 border border-[var(--border)] px-3 py-1 text-[12px] shadow-md tabular-nums">
          {formatDay(topPost.create_at)} · {formatTime(topPost.create_at)}
        </div>
      )}
      {/* One always-visible calendar button (top right): jump to any date. */}
      <div className="absolute right-3 top-2 flex items-center gap-1">
        <div className="relative">
          <IconButton size="sm" label="날짜로 이동" active={showPicker} className={clsx("border border-[var(--border)] bg-[var(--bg)]/95 shadow-sm transition-opacity", showPicker || scrolling ? "opacity-100" : "opacity-50 hover:opacity-100")} onMouseDown={(e) => e.stopPropagation()} onClick={() => setShowPicker((v) => !v)}><CalendarDays /></IconButton>
          {showPicker && (
            <div className="popover absolute right-0 top-8 z-20 p-2 w-[200px]" onMouseDown={(e) => e.stopPropagation()}>
              <div className="mb-1 text-[11px] text-[var(--fg-muted)]">이 날짜의 첫 메시지로 이동</div>
              <input type="date" autoFocus className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[12px]" max={dayjs().format("YYYY-MM-DD")} onChange={(e) => pickDate(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setShowPicker(false); }} />
            </div>
          )}
        </div>
      </div>
      {!bucket.hasNewer && unseen > 0 && (
        <button
          type="button"
          onClick={scrollToEnd}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] px-3 py-1 text-[12px] shadow-md"
        >
          <ArrowDown className="w-3.5 h-3.5" /> 새 메시지 {unseen}개
        </button>
      )}
      {bucket.hasNewer && (
        <button
          type="button"
          onClick={() => { useChat.setState((s) => { const posts = { ...s.posts }; delete posts[channelId]; return { posts, flashPostId: null }; }); void selectChannel(channelId); }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] px-3 py-1 text-[12px] shadow-md"
        >
          <ArrowDown className="w-3.5 h-3.5" /> 최신 메시지로
        </button>
      )}
    </div>
  );
}
