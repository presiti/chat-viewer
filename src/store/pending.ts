import { create } from "zustand";

/** A file waiting in the composer; it is uploaded together with the message on send. */
export interface PendingFile { id: string; channelId: number; fileName: string; path?: string; bytes?: Uint8Array; size: number; previewUrl?: string }

interface PendingState {
  items: PendingFile[];
  add: (channelId: number, f: Omit<PendingFile, "id" | "channelId">) => void;
  remove: (id: string) => void;
  clear: (channelId: number) => void;
}

export const usePendingFiles = create<PendingState>((set) => ({
  items: [],
  add: (channelId, f) => set((s) => ({ items: [...s.items, { ...f, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, channelId }] })),
  remove: (id) => set((s) => { const it = s.items.find((x) => x.id === id); if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl); return { items: s.items.filter((x) => x.id !== id) }; }),
  clear: (channelId) => set((s) => { for (const it of s.items) if (it.channelId === channelId && it.previewUrl) URL.revokeObjectURL(it.previewUrl); return { items: s.items.filter((x) => x.channelId !== channelId) }; }),
}));

/** Queues a browser File (paste / drop) for the composer. */
export async function queueBrowserFile(channelId: number, f: File) {
  const ext = f.type.split("/")[1] || "bin";
  const fileName = f.name && f.name !== "image.png" ? f.name : `clipboard-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await f.arrayBuffer());
  const previewUrl = f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined;
  usePendingFiles.getState().add(channelId, { fileName, bytes, size: bytes.length, previewUrl });
}

/** Queues a file by absolute path (file picker / native drop). */
export function queuePath(channelId: number, path: string) {
  const fileName = path.split(/[\\/]/).pop() ?? "file";
  usePendingFiles.getState().add(channelId, { fileName, path, size: 0 });
}
