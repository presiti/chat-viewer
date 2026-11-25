import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { files } from "../api/client";
import { useChat } from "./chat";
import { useSession } from "./session";
import type { Post } from "../api/types";

export interface UploadItem {
  id: string;
  channelId: number;
  fileName: string;
  sent: number;
  total: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

interface UploadState {
  items: Record<string, UploadItem>;
  start: (channelId: number, src: { path?: string; bytes?: Uint8Array; fileName: string; message?: string; threadId?: number | null }) => Promise<void>;
  dismiss: (id: string) => void;
}

let listening = false;
async function ensureListener() {
  if (listening) return;
  listening = true;
  await listen<{ id: string; sent: number; total: number }>("chat://upload-progress", (e) => {
    const { id, sent, total } = e.payload;
    useUploads.setState((s) => (s.items[id] ? { items: { ...s.items, [id]: { ...s.items[id], sent, total } } } : {}));
  });
  // The file post usually reaches the list through the socket before the upload call returns.
  // Settle the matching bar in the same tick so the bar vanishes exactly when the message appears.
  window.addEventListener("chat:post-created", (ev) => {
    const { channelId, post } = (ev as CustomEvent<{ channelId: number; post: Post }>).detail;
    const name = post.file_props?.name;
    const me = useSession.getState().info?.user_id;
    if (!name || post.creator_id !== me) return;
    const hit = Object.values(useUploads.getState().items).find((u) => u.channelId === channelId && u.status === "uploading" && u.fileName === name);
    if (hit) useUploads.getState().dismiss(hit.id);
  });
}

export const useUploads = create<UploadState>((set) => ({
  items: {},
  start: async (channelId, src) => {
    await ensureListener();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const total = src.bytes ? src.bytes.length : 0;
    set((s) => ({ items: { ...s.items, [id]: { id, channelId, fileName: src.fileName, sent: 0, total, status: "uploading" } } }));
    try {
      const post = await files.upload({
        channelId,
        path: src.path,
        bytes: src.bytes ? Array.from(src.bytes) : undefined,
        fileName: src.fileName,
        message: src.message,
        threadId: src.threadId ?? null,
        uploadId: id,
      });
      // Inserting the post fires chat:post-created, which dismisses this bar; the socket may already have done so.
      if (post?.post_id) useChat.getState().onPostCreate(channelId, { ...post, channel_id: channelId });
      if (useUploads.getState().items[id]) {
        set((s) => (s.items[id] ? { items: { ...s.items, [id]: { ...s.items[id], status: "done", sent: s.items[id].total } } } : {}));
        setTimeout(() => useUploads.getState().dismiss(id), 800);
      }
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? String(e);
      set((s) => (s.items[id] ? { items: { ...s.items, [id]: { ...s.items[id], status: "error", error: msg } } } : {}));
    }
  },
  dismiss: (id) => set((s) => { const items = { ...s.items }; delete items[id]; return { items }; }),
}));
