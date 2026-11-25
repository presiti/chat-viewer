import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AppWindow, ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { chat, files } from "../api/client";
import type { Post } from "../api/types";
import { useChat } from "../store/chat";
import { isImagePost, useImageViewer } from "../store/imageViewer";
import { isMobileOS, openImageWindow } from "../lib/platform";
import { IconButton } from "./IconButton";

/** File systems cap a name at 255 bytes (UTF-8); a long Korean title exceeds it and the OS save dialog disables "Save". Keeps the extension. */
export function safeFileName(name: string, maxBytes = 200): string {
  const bytes = (t: string) => new TextEncoder().encode(t).length;
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  if (bytes(cleaned) <= maxBytes) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  let base = Array.from(ext ? cleaned.slice(0, dot) : cleaned);
  while (base.length && bytes(base.join("")) + bytes(ext) + 3 > maxBytes) base.pop();
  return `${base.join("").trimEnd()}…${ext}`;
}

export async function downloadPost(post: Post) {
  const name = safeFileName(post.file_props?.name ?? `file-${post.post_id}`);
  const path = await saveDialog({ defaultPath: name });
  if (!path) return;
  await files.download(post.post_id, path);
}

/** How many older/newer pages one arrow press may fetch while looking for the next image. */
const MAX_PAGES_PER_STEP = 20;

interface Props {
  channelId: number;
  postId: number;
  onClose: () => void;
  /** The image window: fills the window, no "open in new window" button, drag strip at the top. */
  standalone?: boolean;
}

/**
 * Full-screen image viewer. ← / ↑ shows the previous image of the channel, → / ↓ the next one; when the loaded
 * messages run out it fetches older (or newer) pages until another image turns up, and the message list scrolls
 * to the image being shown so the conversation around it is visible when the viewer closes.
 */
export function ImageViewer({ channelId, postId, onClose, standalone }: Props) {
  const items = useChat((s) => s.posts[channelId]?.items);
  const hasMore = useChat((s) => !!s.posts[channelId]?.hasMore);
  const hasNewer = useChat((s) => !!s.posts[channelId]?.hasNewer);
  const show = useImageViewer((s) => s.show);
  const images = (items ?? []).filter(isImagePost);
  const index = images.findIndex((p) => p.post_id === postId);
  const post = index >= 0 ? images[index] : items?.find((p) => p.post_id === postId);
  const [src, setSrc] = useState<string | null>(null);
  const [fetching, setFetching] = useState<"older" | "newer" | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    setSrc(null);
    let alive = true;
    chat.fileUrl(postId).then((u) => alive && setSrc(u)).catch(() => null);
    return () => { alive = false; };
  }, [postId]);

  // Scroll the conversation to the image on display; the flash clears itself after a moment.
  useEffect(() => { useChat.getState().setFlashPostId(postId); }, [postId]);

  const step = useCallback(async (dir: -1 | 1) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const pick = () => {
        const list = (useChat.getState().posts[channelId]?.items ?? []).filter(isImagePost);
        const i = list.findIndex((p) => p.post_id === useImageViewer.getState().postId);
        return i >= 0 ? list[i + dir] : undefined;
      };
      let next = pick();
      if (!next) {
        setFetching(dir < 0 ? "older" : "newer");
        for (let n = 0; n < MAX_PAGES_PER_STEP && !next; n++) {
          const b = useChat.getState().posts[channelId];
          if (!b || (dir < 0 ? !b.hasMore : !b.hasNewer)) break;
          const before = b.items.length;
          if (dir < 0) await useChat.getState().loadOlder(channelId); else await useChat.getState().loadNewer(channelId);
          if ((useChat.getState().posts[channelId]?.items.length ?? 0) === before) break;
          next = pick();
        }
        setFetching(null);
      }
      if (next) show(next.post_id);
    } finally { busy.current = false; }
  }, [channelId, show]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); void step(-1); }
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); void step(1); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  const canOlder = index > 0 || hasMore;
  const canNewer = (index >= 0 && index < images.length - 1) || hasNewer;
  const name = post?.file_props?.name ?? "";
  const counter = index >= 0 ? `${index + 1} / ${images.length}${hasMore ? "+" : ""}` : "";

  const navBtn = (dir: -1 | 1, enabled: boolean) => (
    <button
      type="button"
      aria-label={dir < 0 ? "이전 이미지 (←)" : "다음 이미지 (→)"}
      title={dir < 0 ? "이전 이미지 (←)" : "다음 이미지 (→)"}
      disabled={!enabled || !!fetching}
      onClick={() => void step(dir)}
      className={clsx("absolute top-1/2 -translate-y-1/2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white/90 hover:bg-black/60 disabled:opacity-20 disabled:cursor-default", dir < 0 ? "left-3" : "right-3", isMobileOS && "h-14 w-14")}
    >
      {fetching === (dir < 0 ? "older" : "newer") ? <Loader2 className="w-6 h-6 animate-spin" /> : dir < 0 ? <ChevronLeft className="w-7 h-7" /> : <ChevronRight className="w-7 h-7" />}
    </button>
  );

  const body = (
    <div
      className={clsx("fixed inset-0 z-[70] flex items-center justify-center select-none", standalone ? "bg-black" : "bg-black/85")}
      onMouseDown={(e) => { if (!standalone && e.target === e.currentTarget) onClose(); }}
    >
      {standalone && <div className="titlebar-drag absolute inset-x-0 top-0 h-7" />}
      {navBtn(-1, canOlder)}
      {navBtn(1, canNewer)}
      <div className="relative inline-flex max-w-full flex-col items-center px-16" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex w-full items-center justify-end gap-1 pb-1.5">
          <span className="mr-auto truncate text-white/70 text-[12px] max-w-[50vw]" title={name}>{name}</span>
          {counter && <span className="text-white/50 text-[12px] tabular-nums mr-1">{counter}</span>}
          {post && <IconButton label="다운로드" className="text-white hover:bg-white/15 hover:text-white" onClick={() => void downloadPost(post)}><Download /></IconButton>}
          {!standalone && !isMobileOS && <IconButton label="새 창에서 열기" className="text-white hover:bg-white/15 hover:text-white" onClick={() => { void openImageWindow(channelId, postId, name || "이미지"); onClose(); }}><AppWindow /></IconButton>}
          <IconButton label="닫기 (Esc)" className="text-white hover:bg-white/15 hover:text-white" onClick={onClose}><X /></IconButton>
        </div>
        {src ? (
          <img key={postId} src={src} alt={name} className={clsx("anim-fade rounded-md object-contain", standalone ? "max-w-[calc(100vw-8rem)] max-h-[calc(100vh-4.5rem)]" : "max-w-[calc(92vw-8rem)] max-h-[84vh]")} draggable={false} />
        ) : (
          <div className="text-white/70 py-10 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…</div>
        )}
        {fetching && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[12px] text-white/80">{fetching === "older" ? "이전 메시지에서 이미지를 찾는 중…" : "다음 메시지에서 이미지를 찾는 중…"}</div>}
      </div>
    </div>
  );
  // Portal to <body>: message rows are positioned with CSS transforms, which would turn `position: fixed`
  // into row-relative positioning and squash the viewer into the list.
  return standalone ? body : createPortal(body, document.body);
}

/** Mounted once per window: shows the viewer for whatever `useImageViewer` points at. */
export function ImageViewerHost() {
  const channelId = useImageViewer((s) => s.channelId);
  const postId = useImageViewer((s) => s.postId);
  const close = useImageViewer((s) => s.close);
  if (!channelId || !postId) return null;
  return <ImageViewer channelId={channelId} postId={postId} onClose={close} />;
}
