import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMobileOS } from "./platform";

const INTERACTIVE = "button, a, input, textarea, select, label, [role='button'], [contenteditable='true']";

/**
 * Tauri ignores the `-webkit-app-region` CSS, so a `.titlebar-drag` area only moves the window if we ask for it.
 * Press on a drag area (outside `.titlebar-nodrag` and controls) to move the window; double-click toggles maximize.
 */
export function installWindowDrag(): () => void {
  if (isMobileOS) return () => undefined; // no window to move on a phone
  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const t = e.target as Element | null;
    if (!t?.closest || t.closest(".titlebar-nodrag") || t.closest(INTERACTIVE) || !t.closest(".titlebar-drag")) return;
    const win = getCurrentWindow();
    if (e.detail === 2) void win.toggleMaximize().catch(() => undefined);
    else void win.startDragging().catch(() => undefined);
  };
  document.addEventListener("mousedown", onDown);
  return () => document.removeEventListener("mousedown", onDown);
}
