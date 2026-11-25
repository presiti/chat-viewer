import { openUrl } from "@tauri-apps/plugin-opener";
import { useSession } from "../store/session";

/** Opens a URL in the system browser (never inside the webview). */
export function openExternal(url: string) {
  void openUrl(url).catch(() => window.open(url, "_blank"));
}

/** Official Synology Chat web client on the signed-in NAS. */
export function officialWebUrl() {
  const host = useSession.getState().info?.host ?? "";
  return `${host.replace(/\/$/, "")}/?launchApp=SYNO.SDS.Chat.Application`;
}

/** Official archive viewer: a separate DSM app (`SYNO.SDS.Chat.Archive.Application`), not the chat window. */
export function officialArchiveUrl() {
  const host = useSession.getState().info?.host ?? "";
  return `${host.replace(/\/$/, "")}/?launchApp=SYNO.SDS.Chat.Archive.Application`;
}

/** Synology knowledge-center help for Chat (Korean). */
export const HELP_URL = "https://kb.synology.com/ko-kr/DSM/help/Chat/chat_desc?version=7";

/** Opens this app's notification permission page in the OS settings (macOS / Windows). */
export function openNotificationSettings() {
  const win = navigator.userAgent.includes("Windows");
  openExternal(win ? "ms-settings:notifications" : "x-apple.systempreferences:com.apple.Notifications-Settings.extension");
}
