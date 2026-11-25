import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { getIdentifier } from "@tauri-apps/api/app";

export type UpdatePhase = "idle" | "checking" | "none" | "available" | "downloading" | "ready" | "error";

interface UpdateState {
  phase: UpdatePhase;
  /** Version offered by the server when `phase` is available/downloading/ready. */
  version: string | null;
  notes: string | null;
  /** 0–1 while downloading. */
  progress: number;
  error: string | null;
  checkedAt: number | null;
  /** True once the user dismissed the banner for the offered version. */
  dismissed: boolean;
  checkNow: (opts?: { silent?: boolean }) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

let pending: Update | null = null;
/** Versions already offered in a native dialog this session, so the 6-hourly check does not nag. */
const prompted = new Set<string>();

export const useUpdate = create<UpdateState>((set, get) => ({
  phase: "idle",
  version: null,
  notes: null,
  progress: 0,
  error: null,
  checkedAt: null,
  dismissed: false,

  async checkNow(opts) {
    if (get().phase === "checking" || get().phase === "downloading") return;
    const manual = !opts?.silent;
    set({ phase: "checking", error: null });
    try {
      const u = await check({ timeout: 15_000 });
      if (!u) {
        pending = null;
        set({ phase: "none", version: null, notes: null, checkedAt: Date.now() });
        if (manual) await message("현재 최신 버전을 사용하고 있습니다.", { title: "Chat Viewer", kind: "info" }).catch(() => undefined);
        return;
      }
      pending = u;
      set({ phase: "available", version: u.version, notes: u.body ?? null, checkedAt: Date.now(), dismissed: false });
      // The OS-native dialog (macOS and Windows alike) is the main prompt; the banner stays as a reminder and progress bar.
      if (manual || !prompted.has(u.version)) {
        prompted.add(u.version);
        const notes = u.body ? `\n\n${u.body}` : "";
        const yes = await ask(`새 버전 ${u.version}이 있습니다. 지금 업데이트할까요?\n(설치 후 앱이 다시 시작됩니다.)${notes}`, { title: "Chat Viewer 업데이트", kind: "info", okLabel: "업데이트", cancelLabel: "나중에" }).catch(() => false);
        if (yes) void get().install();
      }
    } catch (e) {
      // Unreachable server, unsigned manifest, etc. Quiet on automatic checks; shown in settings.
      set({ phase: "error", error: String(e), checkedAt: Date.now() });
      if (manual) await message(`업데이트를 확인하지 못했습니다.\n${String(e)}`, { title: "Chat Viewer", kind: "error" }).catch(() => undefined);
      else console.warn("update check failed", e);
    }
  },

  async install() {
    const u = pending;
    if (!u) return;
    let total = 0, got = 0;
    set({ phase: "downloading", progress: 0, error: null });
    try {
      await u.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        else if (ev.event === "Progress") { got += ev.data.chunkLength; if (total) set({ progress: Math.min(1, got / total) }); }
        else if (ev.event === "Finished") set({ progress: 1 });
      });
      set({ phase: "ready" });
      await relaunch();
    } catch (e) {
      set({ phase: "error", error: String(e) });
    }
  },

  dismiss() { set({ dismissed: true }); },
}));

/** Checks once shortly after launch and then every 6 hours. Returns a stop function. */
export function startUpdateChecks(): () => void {
  // The "Chat Viewer Dev" build (identifier ends in .dev) never updates: it would be replaced by the release app.
  let off = false;
  void getIdentifier().then((id) => { if (id.endsWith(".dev")) off = true; }).catch(() => undefined);
  const first = window.setTimeout(() => { if (!off) void useUpdate.getState().checkNow({ silent: true }); }, 8_000);
  const every = window.setInterval(() => { if (!off) void useUpdate.getState().checkNow({ silent: true }); }, 6 * 60 * 60 * 1000);
  return () => { window.clearTimeout(first); window.clearInterval(every); };
}
