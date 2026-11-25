import { create } from "zustand";
import type { Post } from "../api/types";

interface ViewerState {
  channelId: number | null;
  postId: number | null;
  /** Opens the viewer on one image; ←/→ then walk the channel's other images. */
  open: (channelId: number, postId: number) => void;
  /** Moves to another image of the same channel without closing. */
  show: (postId: number) => void;
  close: () => void;
}

/** One image viewer for the whole window (messages, board tab, standalone image window). */
export const useImageViewer = create<ViewerState>((set) => ({
  channelId: null,
  postId: null,
  open: (channelId, postId) => set({ channelId, postId }),
  show: (postId) => set({ postId }),
  close: () => set({ channelId: null, postId: null }),
}));

/** Image attachments the viewer can walk through (snippets and deleted posts excluded). */
export const isImagePost = (p: Post): boolean => p.type === "file" && !!p.file_props?.is_image && !p.file_props.is_snippet && !p.delete_at;
