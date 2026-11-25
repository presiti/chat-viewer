import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { Post } from "../api/types";
import { useChat, userLabel } from "../store/chat";
import { useSession } from "../store/session";
import { useUi } from "../store/ui";
import { useReadStatus } from "../store/readStatus";
import { Avatar } from "./Avatar";
import { Popover } from "./Popover";
import { openUserCard } from "./UserCard";

const MAX_NAMES = 20;

/**
 * Kakao-style unread count beside one of my messages: "1" in a 1:1, the number of members who have not seen it
 * in a group. Disappears once everyone has read it. Click lists who is still to read it.
 */
export function ReadBadge({ post, className }: { post: Post; className?: string }) {
  const status = useReadStatus((s) => s.byPost[post.post_id]);
  const allow = useSession((s) => !!s.serverSetting?.allow_read_status);
  const pref = useUi((s) => s.readReceipts);
  const ch = useChat((s) => s.channels[post.channel_id]);
  const users = useChat((s) => s.users);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-read-badge]")) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!allow || !pref || !ch || ch.type === "synobot" || ch.encrypted) return null;
  if (!status || status.unread.length === 0) return null;
  const dm = ch.type === "anonymous";
  const n = dm ? 1 : status.unread.length;
  const names = status.unread.slice(0, MAX_NAMES);

  return (
    <>
      <button
        ref={btn}
        type="button"
        data-read-badge
        title={dm ? "아직 읽지 않음" : `안 읽은 사람 ${status.unread.length}명`}
        aria-label={dm ? "상대가 아직 읽지 않음" : `안 읽은 사람 ${status.unread.length}명`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={clsx("inline-flex items-center justify-center min-w-[14px] h-[14px] px-[3px] rounded-full text-[10px] font-bold leading-none tabular-nums text-[var(--accent)] hover:bg-[var(--accent)]/12", className)}
      >
        {n}
      </button>
      {open && (
        <Popover anchor={btn.current} align="left">
          <div data-read-badge className="popover w-[220px] py-1.5 text-[12.5px]" onMouseDown={(e) => e.stopPropagation()}>
            <div className="px-3 pb-1 text-[11px] font-semibold text-[var(--fg-muted)]">안 읽은 사람 {status.unread.length}명{status.read.length > 0 && ` · 읽음 ${status.read.length}명`}</div>
            <div className="max-h-[240px] overflow-y-auto">
              {names.map((id) => (
                <button key={id} type="button" className="w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-[var(--hover)]" onClick={(e) => { setOpen(false); openUserCard(id)(e); }}>
                  <Avatar userId={id} size={20} /><span className="truncate">{userLabel(users[id])}</span>
                </button>
              ))}
              {status.unread.length > MAX_NAMES && <div className="px-3 py-1 text-[11px] text-[var(--fg-muted)]">외 {status.unread.length - MAX_NAMES}명</div>}
            </div>
            <div className="px-3 pt-1 text-[10.5px] text-[var(--fg-muted)]">10초마다 갱신 · 상대가 채널을 열면 사라집니다</div>
          </div>
        </Popover>
      )}
    </>
  );
}
