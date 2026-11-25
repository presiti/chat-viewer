import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { UserMinus, UserPlus } from "lucide-react";
import { chat } from "../../api/client";
import type { Channel, User } from "../../api/types";
import { useChat, userBadge, userLabel } from "../../store/chat";
import { useSession } from "../../store/session";
import { Avatar } from "../Avatar";
import { IconButton } from "../IconButton";
import { Dialog, fieldClass, ghostBtn, primaryBtn } from "../Dialog";
import { openUserCard } from "../UserCard";

/** Member list tab of the channel info panel. */
export function MembersTab({ channelId }: { channelId: number }) {
  const ch = useChat((s) => s.channels[channelId]);
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.info?.user_id);
  const ensureMembers = useChat((s) => s.ensureMembers);
  const updateChannel = useChat((s) => s.updateChannel);
  const [ids, setIds] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [invite, setInvite] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => { setIds(ch?.members ?? ch?.member_ids ?? []); ensureMembers(channelId).then(setIds).catch(() => null); }, [channelId, ensureMembers, ch?.members, ch?.member_ids]);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return ids.map((id) => users[id]).filter((u): u is User => !!u).filter((u) => !k || userLabel(u).toLowerCase().includes(k) || (u.username ?? "").toLowerCase().includes(k))
      .sort((a, b) => {
        const ua = userBadge(a) ? 1 : 0, ub = userBadge(b) ? 1 : 0;
        if (ua !== ub) return ua - ub; // unavailable accounts last
        return a.status === b.status ? userLabel(a).localeCompare(userLabel(b)) : a.status === "online" ? -1 : 1;
      });
  }, [ids, users, q]);

  if (!ch) return null;
  const named = ch.type === "public" || ch.type === "private";
  const kick = async (uid: number) => {
    if (!confirm(`${userLabel(users[uid])} 님을 채널에서 내보낼까요?`)) return;
    setBusy(uid);
    try { await chat.kickUser(channelId, uid); const next = ids.filter((i) => i !== uid); setIds(next); updateChannel(channelId, { member_ids: next, members: ch.members ? next : ch.members, total_member_count: next.length }); } finally { setBusy(null); }
  };
  const online = list.filter((u) => u.status === "online" && !userBadge(u)).length;
  const unavailable = list.filter((u) => !!userBadge(u)).length;

  return (
    <div>
      <div className="px-3 pt-3 pb-1 flex items-start gap-2">
        <div className="flex-1">
          <input className={fieldClass} placeholder="멤버 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-1 text-[11px] text-[var(--fg-muted)]">전체 {ids.length} · 온라인 {online} · 오프라인 {list.length - online - unavailable}{unavailable > 0 && ` · 비활성/삭제 ${unavailable}`}</div>
        </div>
        {named && <IconButton label="멤버 초대" onClick={() => setInvite(true)}><UserPlus /></IconButton>}
      </div>
      <div className="px-2 pb-3">
        {list.map((u) => (
          <div key={u.user_id} title="프로필 보기" onClick={openUserCard(u.user_id)} className={clsx("group flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-[var(--hover)] cursor-pointer", userBadge(u) && "opacity-55")}>
            <div className="relative">
              <Avatar userId={u.user_id} size={30} />
              {!userBadge(u) && <span className={clsx("absolute -right-[2px] -bottom-[2px] w-2.5 h-2.5 rounded-full border-2 border-[var(--bg)]", u.status === "online" ? "bg-green-400" : "bg-gray-400")} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] truncate flex items-center gap-1.5">{userLabel(u)}{u.user_id === me && <span className="text-[var(--fg-muted)]"> (나)</span>}{userBadge(u) && <span className="rounded px-1 text-[10px] leading-[16px] border border-[var(--border)] text-[var(--fg-muted)]">{userBadge(u)}</span>}</div>
              {u.username && u.username !== u.nickname && <div className="text-[11px] text-[var(--fg-muted)] truncate">{u.username}</div>}
            </div>
            {named && u.user_id !== me && ch.creator_id === me && (
              <IconButton size="sm" label="내보내기" className="opacity-0 group-hover:opacity-100" disabled={busy === u.user_id} onClick={(e) => { e.stopPropagation(); void kick(u.user_id); }}><UserMinus /></IconButton>
            )}
          </div>
        ))}
      </div>
      {invite && <InviteDialog ch={ch} users={users} existing={ids} onClose={() => setInvite(false)} onInvited={(added) => { const next = [...ids, ...added]; setIds(next); updateChannel(channelId, { member_ids: next, total_member_count: next.length }); }} />}
    </div>
  );
}

function InviteDialog({ ch, users, existing, onClose, onInvited }: { ch: Channel; users: Record<number, User>; existing: number[]; onClose: () => void; onInvited: (ids: number[]) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const candidates = useMemo(() => Object.values(users).filter((u) => u.type === "human" && !u.deleted && !u.is_disabled && !existing.includes(u.user_id)).filter((u) => !q || userLabel(u).toLowerCase().includes(q.toLowerCase()) || (u.username ?? "").toLowerCase().includes(q.toLowerCase())).slice(0, 60), [users, existing, q]);
  const submit = async () => { setBusy(true); try { await chat.inviteUsers(ch.channel_id, sel); onInvited(sel); onClose(); } finally { setBusy(false); } };
  return (
    <Dialog title="멤버 초대" onClose={onClose} width={440} footer={<><button className={ghostBtn} onClick={onClose}>취소</button><button className={primaryBtn} disabled={!sel.length || busy} onClick={() => void submit()}>{sel.length}명 초대</button></>}>
      <input className={fieldClass} placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="mt-2 max-h-[320px] overflow-y-auto">
        {candidates.map((u) => (
          <label key={u.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--hover)] cursor-pointer">
            <input type="checkbox" checked={sel.includes(u.user_id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, u.user_id] : s.filter((i) => i !== u.user_id)))} />
            <Avatar userId={u.user_id} size={24} />
            <span className="text-[13px]">{userLabel(u)}</span>
          </label>
        ))}
      </div>
    </Dialog>
  );
}
