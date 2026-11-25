import type { Post } from "../api/types";

/**
 * Name of the snippet in 내 공간 that carries this app's synced settings.
 * It must be a text-type file (.txt): the server only treats text uploads as snippets, and only
 * snippets can be updated in place with Post.Snippet set.
 */
export const SETTINGS_FILE_NAME = "chat-viewer-settings.txt";
/** Earlier builds uploaded a .json (not a snippet); it is recognised so it can be hidden/ignored. */
const LEGACY_NAMES = new Set(["chat-viewer-settings.json", SETTINGS_FILE_NAME]);

export const isSettingsPost = (p: Post | undefined | null): boolean =>
  !!p && p.type === "file" && LEGACY_NAMES.has(p.file_props?.name ?? "");

/** The post the sync can actually read/update. */
export const isSettingsSnippet = (p: Post | undefined | null): boolean =>
  !!p && p.type === "file" && p.file_props?.name === SETTINGS_FILE_NAME && !!p.file_props?.is_snippet;
