import data from "../data/emoji.json";

export interface EmojiEntry { n: string; u: string; c: string; skin?: 1 }
export interface EmojiCategory { name: string; emojis: EmojiEntry[] }

const CATEGORY_LABELS: Record<string, string> = {
  people: "사람", nature: "자연", food: "음식", activity: "활동", travel: "여행", objects: "사물", symbols: "기호", flags: "국기",
};

export const emojiCategories: EmojiCategory[] = (data.categories as EmojiCategory[]).map((c) => ({ ...c, name: c.name }));
export const categoryLabel = (name: string) => CATEGORY_LABELS[name] ?? name;

/** shortname -> unicode character(s) */
const shortnameMap: Record<string, string> = data.map as Record<string, string>;

export function emojiFromShortname(name: string): string | undefined {
  return shortnameMap[name];
}

/** Replace `:shortname:` tokens with native emoji characters. Unknown names are left as-is. */
export function replaceShortnames(text: string): string {
  return text.replace(/:([a-z0-9_+-]+):/g, (m, name: string) => shortnameMap[name] ?? m);
}

const searchIndex: { n: string; c: string }[] = Object.entries(shortnameMap).map(([n, c]) => ({ n, c }));

export function searchEmoji(query: string, limit = 24): { n: string; c: string }[] {
  const q = query.trim().toLowerCase().replace(/^:/, "");
  if (!q) return [];
  const starts: { n: string; c: string }[] = [];
  const contains: { n: string; c: string }[] = [];
  for (const e of searchIndex) {
    if (e.n.startsWith(q)) starts.push(e);
    else if (e.n.includes(q)) contains.push(e);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

const RECENT_KEY = "chat-viewer:recent-emoji";
export function recentEmoji(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}
export function pushRecentEmoji(name: string) {
  const list = [name, ...recentEmoji().filter((n) => n !== name)].slice(0, 24);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
