import { create } from "zustand";

/** The channel shown in the one separate chat window, if it is open (main window only): marked with an icon in the list. */
export const usePopouts = create<{ current: number | null; set: (id: number | null) => void }>((set) => ({
  current: null,
  set: (current) => set({ current }),
}));
