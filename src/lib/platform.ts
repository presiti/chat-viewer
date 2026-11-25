import { useSyncExternalStore } from "react";

/** Width at and below which the app switches to the single-column (list -> chat) layout. Keep in sync with `max-[720px]:` classes. */
export const COMPACT_MAX_WIDTH = 720;
const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_WIDTH}px)`;
const TOUCH_QUERY = "(pointer: coarse)";

/** True inside the Android / iOS WebView (or a phone browser): no window chrome, no desktop-only Tauri calls. */
export const isMobileOS = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const subscribe = (query: string) => (cb: () => void) => {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** Narrow window or phone: render the list screen and the chat screen one at a time. */
export function useCompact(): boolean {
  return useSyncExternalStore(subscribe(COMPACT_QUERY), () => window.matchMedia(COMPACT_QUERY).matches, () => false);
}
/** Non-React read of the same flag (store actions, event handlers). */
export const isCompactNow = () => window.matchMedia(COMPACT_QUERY).matches;

/** Sidebar (264) + info panel (380) + a usable conversation (480): below this the panel floats over the chat instead of squeezing it. */
export const PANEL_OVERLAY_MAX_WIDTH = 1124;
const PANEL_OVERLAY_QUERY = `(max-width: ${PANEL_OVERLAY_MAX_WIDTH - 1}px)`;
/** True when the window is too narrow to show the info panel beside the conversation (wide layout only). */
export function usePanelOverlay(): boolean {
  return useSyncExternalStore(subscribe(PANEL_OVERLAY_QUERY), () => window.matchMedia(PANEL_OVERLAY_QUERY).matches, () => false);
}

/** Finger as the primary pointer: Enter inserts a newline, the send button sends, hover-only controls need another path. */
export const isTouchNow = () => window.matchMedia(TOUCH_QUERY).matches;

/** macOS desktop: the Overlay title bar puts the traffic lights over the top-left of the web content. */
export const isMacDesktop = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) && !isMobileOS;

/** True in the secondary window that shows one chat at a time (opened by the main window's 새 창 button). */
export const isPopout: boolean = (() => {
  try { return new URLSearchParams(window.location.search).has("popout"); } catch { return false; }
})();
/** The channel the popout was opened with. */
export const popoutChannelId: number | null = (() => {
  try { return Number(new URLSearchParams(window.location.search).get("popout")) || null; } catch { return null; }
})();

export const POPOUT_LABEL = "chat-popout";
export const POPOUT_OPEN = "chat://popout-open";
export const POPOUT_CHANGED = "chat://popout-changed";

/**
 * Opens a second Chat Viewer window (the full app, same size as a wide main window; phone-like next to a narrow one) on this chat.
 * Only one exists: asking again points it at the new chat and brings it forward.
 */
export async function openChatWindow(channelId: number, title: string): Promise<void> {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const { emitTo } = await import("@tauri-apps/api/event");
  const { usePopouts } = await import("../store/popout");
  const existing = await WebviewWindow.getByLabel(POPOUT_LABEL);
  if (existing) {
    await emitTo(POPOUT_LABEL, POPOUT_OPEN, { channelId }).catch(() => undefined);
    await existing.unminimize().catch(() => undefined);
    await existing.setFocus().catch(() => undefined);
    usePopouts.getState().set(channelId);
    return;
  }
  // Same size as the main window when it is in the wide layout.
  let width = 460, height = 720;
  if (!isCompactNow()) { width = Math.max(360, window.innerWidth); height = Math.max(480, window.innerHeight); }
  const win = new WebviewWindow(POPOUT_LABEL, {
    url: `index.html?popout=${channelId}`, title, width, height, minWidth: 320, minHeight: 360,
    titleBarStyle: "overlay", hiddenTitle: true,
  });
  usePopouts.getState().set(channelId);
  void win.once("tauri://destroyed", () => usePopouts.getState().set(null));
  void win.once("tauri://error", () => usePopouts.getState().set(null));
}

/** The image this window was opened for (`index.html?image=<post>&channel=<channel>`), or null in the main window. */
export const imageWindowTarget: { postId: number; channelId: number } | null = (() => {
  try {
    const q = new URLSearchParams(window.location.search);
    const postId = Number(q.get("image")), channelId = Number(q.get("channel"));
    return postId && channelId ? { postId, channelId } : null;
  } catch { return null; }
})();

/** Opens one image in its own window (several may be open at once); asking again for the same image brings it forward. */
export async function openImageWindow(channelId: number, postId: number, title: string): Promise<void> {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  // "chat-*" is the window pattern the capability grants API access to.
  const label = `chat-image-${postId}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) { await existing.unminimize().catch(() => undefined); await existing.setFocus().catch(() => undefined); return; }
  const width = Math.min(1100, Math.max(480, Math.round(window.screen.availWidth * 0.6)));
  const height = Math.min(820, Math.max(360, Math.round(window.screen.availHeight * 0.7)));
  new WebviewWindow(label, {
    url: `index.html?image=${postId}&channel=${channelId}`, title, width, height, minWidth: 320, minHeight: 240,
    titleBarStyle: "overlay", hiddenTitle: true,
  });
}
