import { create } from "zustand";
import type { SearchScope } from "./index";
import { useUi } from "./ui";

/** State of the ⌘K search palette; the last query comes back on reopen, the filters start clean each time. */
interface SearchState {
  open: boolean;
  q: string;
  /** current channel only, or every joined channel */
  where: "channel" | "all";
  scope: SearchScope;
  from: number | "";
  after: string;
  before: string;
  filesOnly: boolean;
  kinds: string[];
  extText: string;
  showFilters: boolean;
  setOpen: (open: boolean) => void;
  openWith: (q?: string) => void;
  setQ: (q: string) => void;
  patch: (p: Partial<Omit<SearchState, "setOpen" | "openWith" | "setQ" | "patch" | "resetFilters">>) => void;
  resetFilters: () => void;
}

const FILTER_DEFAULTS = { where: "channel" as const, scope: "all" as SearchScope, from: "" as const, after: "", before: "", filesOnly: false, kinds: [] as string[], extText: "" };

/** The search palette takes over the chat column; the channel info panel is no longer what you are looking at. */
const closeInfoPanel = () => { if (useUi.getState().rightPanel !== "none") useUi.getState().setRightPanel("none"); };

export const useSearch = create<SearchState>((set) => ({
  open: false,
  q: "",
  showFilters: false,
  ...FILTER_DEFAULTS,
  // Opening a closed palette starts from clean filters (the query stays); an already open one keeps what you set.
  setOpen: (open) => { if (open) closeInfoPanel(); set((s) => ({ open, ...(open && !s.open ? FILTER_DEFAULTS : {}) })); },
  openWith: (q) => { closeInfoPanel(); set((s) => ({ open: true, q: q ?? s.q, ...(!s.open ? FILTER_DEFAULTS : {}) })); },
  setQ: (q) => set({ q }),
  patch: (p) => set(p),
  resetFilters: () => set({ ...FILTER_DEFAULTS }),
}));
