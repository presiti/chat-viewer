import { useUi } from "./store/ui";
import { applyAppearance, watchSystemTheme } from "./lib/theme";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Benign browser notice raised when layout settles across a frame (virtual list + popovers); not an app error.
window.addEventListener("error", (e) => {
  if (typeof e.message === "string" && e.message.includes("ResizeObserver loop")) { e.stopImmediatePropagation(); e.preventDefault(); }
});

// Release builds: no native right-click menu (Reload / Inspect Element …). Text fields keep it for cut/copy/paste/spelling;
// the app's own context menus (channel rows etc.) still open because they handle the event themselves.
if (!import.meta.env.DEV) {
  window.addEventListener("contextmenu", (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.("input, textarea, [contenteditable=\"true\"]")) return;
    e.preventDefault();
  });
}

// Dev only: `/?mock` runs the UI in a plain browser against fixture data (see src/dev/mockTauri.ts).
// Dev only: `&appearance={"mode":"dark","theme":"graphite"}` previews a look without touching saved settings.
const previewLook = import.meta.env.DEV ? new URLSearchParams(location.search).get("appearance") : null;
if (previewLook) useUi.getState().setAppearance(JSON.parse(previewLook));
// Dev only: `&manage=notifications|appearance` opens that settings tab on boot (for screenshots).
const previewManage = import.meta.env.DEV ? new URLSearchParams(location.search).get("manage") : null;
if (previewManage) useUi.getState().openManage(previewManage as never);

const galleryMode = import.meta.env.DEV && new URLSearchParams(location.search).has("gallery");
const mount = async () => {
  const Root = galleryMode ? (await import("./dev/TextureGallery")).default : App;
  ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><Root /></React.StrictMode>);
};
if (import.meta.env.DEV && new URLSearchParams(location.search).has("mock")) void import("./dev/mockTauri").then(mount);
else void mount();

// Look & feel: apply on boot, on every change, and when the OS theme flips.
applyAppearance(useUi.getState().appearance);
useUi.subscribe((s, prev) => { if (s.appearance !== prev.appearance) applyAppearance(s.appearance); });
watchSystemTheme(() => useUi.getState().appearance);
