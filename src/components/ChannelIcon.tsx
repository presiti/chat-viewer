import clsx from "clsx";
import { Bot, Hash, Lock } from "lucide-react";
import type { Channel } from "../api/types";
import { Avatar } from "./Avatar";
import { GroupAvatars } from "./GroupAvatars";

/** Members of a DM other than me (used for the group-DM glyph). */
export const dmOthers = (ch: Channel, me: number | undefined) => (ch.type === "anonymous" ? (ch.members ?? ch.member_ids ?? []).filter((id) => id !== me) : []);

interface Props {
  ch: Channel;
  me?: number;
  /** Presence of the other person in a 1:1 DM (only used with dm="dot"). */
  online?: boolean;
  /** Icon size in px (lucide icons and group avatars). */
  size?: number;
  className?: string;
  /** How a 1:1 DM is drawn: a presence dot (sidebar), the person's avatar (lists), or nothing. */
  dm?: "dot" | "avatar" | "none";
}

/**
 * The one channel glyph used everywhere: # public, lock private, bot for bots,
 * overlapping avatars for group DMs, and a dot/avatar for 1:1 DMs.
 */
export function ChannelIcon({ ch, me, online, size = 14, className, dm = "dot" }: Props) {
  const cls = clsx("shrink-0 opacity-70", className);
  const style = { width: size, height: size };
  if (ch.type === "private") return <Lock className={cls} style={style} />;
  if (ch.type === "public") return <Hash className={cls} style={style} />;
  if (ch.type === "chatbot" || ch.type === "synobot") return <Bot className={cls} style={style} />;
  const others = dmOthers(ch, me);
  if (others.length >= 2) return <GroupAvatars userIds={others} size={size} />;
  if (dm === "avatar" && others[0]) return <Avatar userId={others[0]} size={Math.round(size * 1.15)} />;
  if (dm === "none") return null;
  return <span className={clsx("inline-block w-2 h-2 rounded-full shrink-0", online ? "bg-green-400" : "border border-current opacity-60", className)} />;
}

/** Larger tile for list pages (inbox / browse): avatar for DMs, a coloured square with the glyph otherwise. */
export function ChannelTile({ ch, me, label, size = 32 }: { ch: Channel; me?: number; label: string; size?: number }) {
  const others = dmOthers(ch, me);
  if (others.length >= 2) return <span className="flex shrink-0 items-center justify-center" style={{ width: size, height: size }}><GroupAvatars userIds={others} size={Math.round(size * 0.62)} /></span>;
  if (others.length === 1) return <Avatar userId={others[0]} size={size} />;
  void label;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-lg bg-[var(--bg-muted)] text-[var(--fg-muted)]" style={{ width: size, height: size }}>
      <ChannelIcon ch={ch} me={me} size={Math.round(size / 2)} dm="none" className="!opacity-100" />
    </span>
  );
}
