import { useEffect } from "react";
import { create } from "zustand";
import clsx from "clsx";
import { Mail, MessageCircle, UserRound } from "lucide-react";
import { dmBlockReason, useChat, userBadge, userLabel } from "../store/chat";
import { useSession } from "../store/session";
import { useUi } from "../store/ui";
import { Avatar } from "./Avatar";
import { Popover } from "./Popover";

interface CardState {
  userId: number | null;
  anchor: HTMLElement | null;
  open: (userId: number, anchor: HTMLElement) => void;
  close: () => void;
}

/** Global "profile card" state: any avatar/name click opens the card here instead of jumping to a DM. */
export const useUserCard = create<CardState>((set) => ({
  userId: null,
  anchor: null,
  open: (userId, anchor) => set((s) => (s.userId === userId && s.anchor === anchor ? { userId: null, anchor: null } : { userId, anchor })),
  close: () => set({ userId: null, anchor: null }),
}));

/** Click handler helper for avatars and names. */
export const openUserCard = (userId: number) => (e: React.MouseEvent<HTMLElement>) => {
  e.stopPropagation();
  e.preventDefault();
  useUserCard.getState().open(userId, e.currentTarget);
};

/** Mounted once (Main). Shows the profile card for the current `useUserCard` target. */
export function UserCardHost() {
  const userId = useUserCard((s) => s.userId);
  const anchor = useUserCard((s) => s.anchor);
  const close = useUserCard((s) => s.close);
  const user = useChat((s) => (userId ? s.users[userId] : undefined));
  const me = useSession((s) => s.info?.user_id);
  const openDmWith = useChat((s) => s.openDmWith);
  const setView = useUi((s) => s.setView);

  useEffect(() => {
    if (!userId) return;
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-user-card]")) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [userId, close]);

  if (!userId || !anchor) return null;
  const isMe = userId === me;
  const badge = userBadge(user);
  const props = user?.user_props ?? {};
  const online = user?.status === "online";
  const dmBlocked = user ? dmBlockReason(user) : "";
  const isBot = user?.type === "bot";

  return (
    <Popover anchor={anchor} align="left" side="top" gap={6}>
      <div data-user-card className="popover w-[280px] overflow-hidden">
        <div className="flex items-start gap-3 px-4 pt-4 pb-3">
          <Avatar userId={userId} size={56} />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[15px] truncate">{userLabel(user)}</span>
              {isMe && <span className="text-[11px] text-[var(--fg-muted)]">(나)</span>}
              {badge && <span className="rounded px-1 text-[10px] leading-[16px] border border-[var(--border)] text-[var(--fg-muted)]">{badge}</span>}
            </div>
            {user?.username && user.username !== user.nickname && <div className="text-[12px] text-[var(--fg-muted)] truncate">@{user.username}</div>}
            {!badge && (
              <div className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--fg-muted)]">
                <span className={clsx("w-2 h-2 rounded-full", online ? "bg-green-500" : "bg-gray-400")} />{online ? "온라인" : "오프라인"}
                {props.is_always_offline && <span>· 부재 중</span>}
              </div>
            )}
          </div>
        </div>
        {(props.description || props.email) && (
          <div className="px-4 pb-3 space-y-1 text-[12.5px]">
            {props.description && <div className="whitespace-pre-wrap break-words">{String(props.description)}</div>}
            {props.email && <div className="flex items-center gap-1.5 text-[var(--fg-muted)]"><Mail className="w-3.5 h-3.5" /><span className="truncate">{String(props.email)}</span></div>}
          </div>
        )}
        {!isMe && dmBlocked && <div className="px-4 pb-2 text-[11.5px] text-[var(--fg-muted)]">{dmBlocked}</div>}
        <div className="flex gap-2 border-t border-[var(--border)] px-3 py-2.5">
          {isMe ? (
            <>
              <button type="button" className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] text-[var(--accent-fg)] px-3 py-1.5 text-[13px]" onClick={() => { close(); void openDmWith(userId); setView("channel"); }}><MessageCircle className="w-4 h-4" /> 내 공간</button>
              <button type="button" className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-[13px] hover:bg-[var(--hover)]" onClick={() => { close(); window.dispatchEvent(new CustomEvent("chat:open-profile")); }}><UserRound className="w-4 h-4" /> 프로필 편집</button>
            </>
          ) : (
            <button type="button" disabled={!!dmBlocked} title={dmBlocked || undefined} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] text-[var(--accent-fg)] px-3 py-1.5 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => { close(); setView("channel"); void openDmWith(userId); }}><MessageCircle className="w-4 h-4" /> {isBot ? "봇과 대화" : "1:1 메시지 보내기"}</button>
          )}
        </div>
      </div>
    </Popover>
  );
}
