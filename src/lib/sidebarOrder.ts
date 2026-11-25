import type { Channel, User } from "../api/types";
import { channelLabel } from "../store/chat";

/** Built-in section keys; custom groups use `g:<id>`. */
export type BaseSectionKey = "starred" | "channels" | "dms" | "bots";
export type SectionKey = BaseSectionKey | `g:${string}`;
export type SectionSort = "recent" | "name" | "manual";

export const BASE_SECTIONS: BaseSectionKey[] = ["starred", "channels", "dms", "bots"];
export const SECTION_LABELS: Record<BaseSectionKey, string> = { starred: "즐겨찾기", channels: "채널", dms: "다이렉트 메시지", bots: "봇" };

export interface ChannelGroup { id: string; name: string; channelIds: number[]; /** hex from GROUP_COLORS; undefined = default */ color?: string }

/** Sidebar ordering/visibility preferences (persisted in the ui store, synced to the server). */
export interface SidebarPrefs {
  sectionSort: Record<string, SectionSort>;
  manualOrder: Record<string, number[]>;
  pinnedTop: number[];
  unreadFirst: boolean;
  localHidden: number[];
  /** User-defined groups; a channel lives in at most one and leaves its built-in section. */
  groups: ChannelGroup[];
  /** Dynamic "새 메시지" section at the top of the sidebar. */
  showUnreadSection: boolean;
}

export const DEFAULT_SIDEBAR_PREFS: SidebarPrefs = {
  sectionSort: { starred: "recent", channels: "recent", dms: "recent", bots: "recent" },
  manualOrder: { starred: [], channels: [], dms: [], bots: [] },
  pinnedTop: [],
  unreadFirst: false,
  localHidden: [],
  groups: [],
  showUnreadSection: true,
};

export const groupKey = (id: string): SectionKey => `g:${id}`;
export const isGroupKey = (k: string): k is `g:${string}` => k.startsWith("g:");

/**
 * Hidden on the server (official "숨기기"). Same rule as the official client: hidden while the hide is newer
 * than the last view and nothing is unread — so opening the channel (view) or a new message un-hides it.
 */
export function isServerHidden(ch: Channel): boolean {
  const hide = ch.last_hide_at ?? 0;
  if (hide <= 0 || hide < (ch.last_view_at ?? 0)) return false;
  return !(ch.unread > 0 || ch.unread_mention > 0 || ch.unread_mention_comment > 0);
}

export function isLocalHidden(ch: Channel, prefs: SidebarPrefs): boolean {
  return prefs.localHidden.includes(ch.channel_id);
}

export function groupOf(ch: Channel, prefs: SidebarPrefs): ChannelGroup | undefined {
  return prefs.groups.find((g) => g.channelIds.includes(ch.channel_id));
}

export function baseSectionOf(ch: Channel): BaseSectionKey {
  if (ch.type === "synobot") return "dms";
  if (ch.is_star) return "starred";
  if (ch.type === "public" || ch.type === "private") return "channels";
  if (ch.type === "anonymous") return "dms";
  return "bots";
}

export function sectionOf(ch: Channel, prefs: SidebarPrefs): SectionKey {
  const g = ch.type === "synobot" ? undefined : groupOf(ch, prefs);
  return g ? groupKey(g.id) : baseSectionOf(ch);
}

/** Channels the user asked to be alerted about (desktop notifications on, not muted). */
export function wantsAlerts(ch: Channel): boolean {
  const p = ch.preferences;
  if (p?.notification_mute) return false;
  return p?.notification_desktop !== "none";
}

export function hasUnread(ch: Channel): boolean {
  return ch.unread > 0 || ch.unread_mention > 0 || ch.unread_mention_comment > 0;
}

export interface Entry {
  ch: Channel;
  label: string;
  /** 1:1 chat whose counterpart is disabled or deleted: always sorted to the bottom. */
  unavailable?: boolean;
}

export function isUnavailableDm(ch: Channel, users: Record<number, User>, me: number | undefined): boolean {
  if (ch.type !== "anonymous") return false;
  const others = (ch.members ?? ch.member_ids ?? []).filter((id) => id !== me);
  if (others.length !== 1) return false;
  const u = users[others[0]];
  return !!u && (u.deleted || u.is_disabled);
}

/**
 * Orders one section: 내 공간 first, then pinned, then (optionally) unread, then the section's sort.
 * Manual order keeps unknown channels at the end in recent order.
 */
export function sortSection(items: Entry[], section: string, prefs: SidebarPrefs): Entry[] {
  const mode = prefs.sectionSort[section] ?? "recent";
  const manual = prefs.manualOrder[section] ?? [];
  const byRecent = (a: Entry, b: Entry) => b.ch.last_post_at - a.ch.last_post_at;
  const byName = (a: Entry, b: Entry) => a.label.localeCompare(b.label, "ko");
  const byManual = (a: Entry, b: Entry) => {
    const ia = manual.indexOf(a.ch.channel_id), ib = manual.indexOf(b.ch.channel_id);
    if (ia < 0 && ib < 0) return byRecent(a, b);
    if (ia < 0) return 1;
    if (ib < 0) return -1;
    return ia - ib;
  };
  const base = mode === "name" ? byName : mode === "manual" ? byManual : byRecent;
  const rank = (e: Entry) => {
    if (e.ch.type === "synobot") return 0;
    if (e.unavailable) return 4;
    if (prefs.pinnedTop.includes(e.ch.channel_id)) return 1;
    if (prefs.unreadFirst && hasUnread(e.ch)) return 2;
    return 3;
  };
  return [...items].sort((a, b) => rank(a) - rank(b) || base(a, b));
}

export interface SectionDef { key: SectionKey; title: string; group?: ChannelGroup }

/** Section order as shown: 즐겨찾기, custom groups, 채널, 다이렉트 메시지, 봇. */
export function sectionDefs(prefs: SidebarPrefs): SectionDef[] {
  return [
    { key: "starred", title: SECTION_LABELS.starred },
    ...prefs.groups.map((g) => ({ key: groupKey(g.id), title: g.name, group: g })),
    { key: "channels", title: SECTION_LABELS.channels },
    { key: "dms", title: SECTION_LABELS.dms },
    { key: "bots", title: SECTION_LABELS.bots },
  ];
}

/** Builds every sidebar section from the channel map, applying hiding, grouping and ordering. */
export function buildSections(channels: Record<number, Channel>, users: Record<number, User>, me: number | undefined, prefs: SidebarPrefs, includeHidden = false) {
  const out: Record<string, Entry[]> = {};
  for (const def of sectionDefs(prefs)) out[def.key] = [];
  for (const ch of Object.values(channels)) {
    if (!ch.is_joined) continue;
    if (!includeHidden && (isServerHidden(ch) || isLocalHidden(ch, prefs))) continue;
    const key = sectionOf(ch, prefs);
    (out[key] ??= []).push({ ch, label: channelLabel(ch, users, me), unavailable: isUnavailableDm(ch, users, me) });
  }
  for (const k of Object.keys(out)) out[k] = sortSection(out[k], k, prefs);
  return out;
}

/** Channels with unread activity among those the user wants alerts for — the "새 메시지" section. Mentions first. */
export function unreadAlertEntries(channels: Record<number, Channel>, users: Record<number, User>, me: number | undefined, prefs: SidebarPrefs, includeMuted = false): Entry[] {
  const list: Entry[] = [];
  for (const ch of Object.values(channels)) {
    if (!ch.is_joined || ch.type === "synobot") continue;
    if (isLocalHidden(ch, prefs)) continue;
    if (!hasUnread(ch)) continue;
    if (!includeMuted && !wantsAlerts(ch)) continue;
    list.push({ ch, label: channelLabel(ch, users, me) });
  }
  const mentions = (e: Entry) => e.ch.unread_mention + e.ch.unread_mention_comment;
  return list.sort((a, b) => Number(mentions(b) > 0) - Number(mentions(a) > 0) || b.ch.last_post_at - a.ch.last_post_at);
}
