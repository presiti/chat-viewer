import { create } from "zustand";

export interface Toast { id: number; kind: "error" | "info"; text: string }

interface ToastState {
  items: Toast[];
  push: (kind: Toast["kind"], text: string) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

/** Short-lived banners for failures the user must not miss (e.g. an emoji reaction that did not go through). */
export const useToast = create<ToastState>((set, get) => ({
  items: [],
  push(kind, text) {
    const id = ++seq;
    set((s) => ({ items: [...s.items.slice(-3), { id, kind, text }] }));
    window.setTimeout(() => get().dismiss(id), kind === "error" ? 6000 : 3000);
  },
  dismiss(id) { set((s) => ({ items: s.items.filter((t) => t.id !== id) })); },
}));
