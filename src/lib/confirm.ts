import { ask } from "@tauri-apps/plugin-dialog";

/**
 * Yes/no question that really waits for the answer. Do not use `window.confirm` in this app: tauri-plugin-dialog
 * replaces it with an async function, so `confirm()` returns a Promise (always truthy) and `if (!confirm(...)) return`
 * went ahead before the user clicked anything.
 */
export const confirmAsk = (message: string): Promise<boolean> =>
  ask(message, { title: "Chat Viewer", kind: "warning", okLabel: "확인", cancelLabel: "취소" }).catch(() => false);
