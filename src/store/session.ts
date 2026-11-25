import { create } from "zustand";
import type { LoginInfo } from "../api/types";
import { chat, preference, type UserPrefs } from "../api/client";

/** Server-wide switches that shape the UI (from SYNO.Chat.Admin.Setting get v3). */
export interface ServerSetting {
  /** NAS 관리자 설정 "읽음 상태 표시": read receipts exist only when this is on. */
  allow_read_status: boolean;
}

export type SocketStatus = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

interface SessionState {
  status: "booting" | "loggedOut" | "loggedIn";
  info: LoginInfo | null;
  socket: SocketStatus;
  socketAttempt: number;
  /** Difference between server clock and local clock (ms). */
  clockOffset: number;
  setLoggedIn: (info: LoginInfo) => void;
  setLoggedOut: () => void;
  setSocket: (s: SocketStatus, attempt?: number) => void;
  setClockOffset: (ms: number) => void;
  serverNow: () => number;
  /** Server-side user preferences (snooze etc.); null until loaded. */
  prefs: UserPrefs | null;
  loadPrefs: () => Promise<void>;
  /** Snooze notifications for `minutes` (0 = cancel). Stored on the server as an absolute time. */
  setSnooze: (minutes: number) => Promise<void>;
  setSnoozeSchedule: (patch: { enable?: boolean; start?: number; end?: number }) => Promise<void>;
  /** Milliseconds until the one-off snooze ends (0 when not snoozing). */
  snoozeRemaining: () => number;
  /** null until loaded, or when the server refused the call (features that depend on it stay off). */
  serverSetting: ServerSetting | null;
  loadServerSetting: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  status: "booting",
  info: null,
  socket: "idle",
  socketAttempt: 0,
  clockOffset: 0,
  setLoggedIn: (info) => set({ status: "loggedIn", info }),
  setLoggedOut: () => set({ status: "loggedOut", info: null, socket: "idle" }),
  setSocket: (socket, socketAttempt = 0) => set({ socket, socketAttempt }),
  setClockOffset: (clockOffset) => set({ clockOffset }),
  serverNow: () => Date.now() + get().clockOffset,
  prefs: null,
  loadPrefs: async () => { const prefs = await preference.get().catch(() => null); if (prefs) set({ prefs }); },
  setSnooze: async (minutes) => {
    const snooze = minutes > 0 ? get().serverNow() + minutes * 60_000 : 0;
    await preference.set({ snooze });
    set((s) => ({ prefs: { ...(s.prefs ?? {}), snooze } }));
  },
  setSnoozeSchedule: async (patch) => {
    const fields: Partial<UserPrefs> = {};
    if (patch.enable !== undefined) fields.snooze_schedule_enable = patch.enable;
    if (patch.start !== undefined) fields.snooze_schedule_start = patch.start;
    if (patch.end !== undefined) fields.snooze_schedule_end = patch.end;
    await preference.set(fields);
    set((s) => ({ prefs: { ...(s.prefs ?? {}), ...fields } }));
  },
  snoozeRemaining: () => Math.max(0, (get().prefs?.snooze ?? 0) - get().serverNow()),
  serverSetting: null,
  loadServerSetting: async () => {
    const r = await chat.adminSetting().catch((e) => { console.info("[read-status] Admin.Setting get failed; read receipts stay off", e); return null; });
    const serverSetting = r ? { allow_read_status: !!r.allow_read_status } : null;
    console.info("[read-status] allow_read_status =", r?.allow_read_status);
    set({ serverSetting });
  },
}));
