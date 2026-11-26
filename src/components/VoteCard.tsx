import { useState } from "react";
import clsx from "clsx";
import dayjs from "dayjs";
import { BarChart3, Check, Lock, Plus, Users } from "lucide-react";
import { chat } from "../api/client";
import type { Post, VoteChoice } from "../api/types";
import { useChat, userLabel } from "../store/chat";
import { useSession } from "../store/session";
import { fieldClass } from "./Dialog";
import { confirmAsk } from "../lib/confirm";

export function VoteCard({ post }: { post: Post }) {
  const me = useSession((s) => s.info?.user_id);
  const users = useChat((s) => s.users);
  const onPostUpdate = useChat((s) => s.onPostUpdate);
  const vote = post.props?.vote;
  const [choices, setChoices] = useState<VoteChoice[] | null>(null);
  const [showVoters, setShowVoters] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newOpt, setNewOpt] = useState("");
  const [busy, setBusy] = useState(false);
  if (!vote) return null;

  const list = choices ?? vote.choices;
  const total = list.reduce((n, c) => n + (c.count ?? 0), 0);
  const closed = vote.state === "closed" || (vote.options.expire_at > 0 && vote.options.expire_at < Date.now());
  const mine = new Set(list.filter((c) => c.voters?.includes(me ?? -1)).map((c) => c.id));
  const isOwner = post.creator_id === me;

  const refresh = async () => { try { setChoices(await chat.voteChoices(post.post_id)); } catch { /* ignore */ } };
  const ensureVoters = async () => { if (!choices) await refresh(); };

  const cast = async (choice: VoteChoice) => {
    if (closed || busy) return;
    setBusy(true);
    try {
      await ensureVoters();
      const current = new Set((choices ?? await chat.voteChoices(post.post_id)).filter((c) => c.voters?.includes(me ?? -1)).map((c) => c.id));
      let next: string[];
      if (vote.options.multiple) { if (current.has(choice.id)) current.delete(choice.id); else current.add(choice.id); next = [...current]; }
      else next = current.has(choice.id) ? [] : [choice.id];
      await chat.vote(post.post_id, next);
      await refresh();
    } catch (e) { alert(`투표 실패: ${(e as { message?: string })?.message ?? e}`); } finally { setBusy(false); }
  };

  const close = async () => { if (!await confirmAsk("투표를 마감할까요?")) return; await chat.closeVote(post.post_id); onPostUpdate({ ...post, props: { ...post.props, vote: { ...vote, state: "closed" } } }); };
  const addOption = async () => { const t = newOpt.trim(); if (!t) return; await chat.addVoteOption(post.post_id, t); setNewOpt(""); setAdding(false); await refresh(); };

  return (
    <div className="mt-1 max-w-[520px] rounded-lg border border-[var(--border)] bg-[var(--bg-muted)]/60 p-3">
      <div className="flex items-start gap-2">
        <BarChart3 className="w-4 h-4 mt-[2px] text-[var(--accent)] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[14px] whitespace-pre-wrap break-words">{post.message}</div>
          <div className="text-[11px] text-[var(--fg-muted)] mt-0.5 flex flex-wrap gap-x-2">
            <span>{closed ? "마감됨" : "진행 중"}</span>
            {vote.options.multiple && <span>· 복수 선택</span>}
            {vote.options.anonymous && <span>· 익명</span>}
            {vote.options.expire_at > 0 && <span>· {dayjs(vote.options.expire_at).format("M/D HH:mm")} 마감</span>}
            <span>· {total}표</span>
          </div>
        </div>
        {closed && <Lock className="w-3.5 h-3.5 text-[var(--fg-muted)]" />}
      </div>
      <div className="mt-2 space-y-1.5" onMouseEnter={() => void ensureVoters()}>
        {list.map((c) => {
          const pct = total ? Math.round((c.count / total) * 100) : 0;
          const selected = mine.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              disabled={closed || busy}
              onClick={() => void cast(c)}
              className={clsx("relative w-full text-left rounded-md border px-3 py-1.5 overflow-hidden transition-colors", selected ? "border-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--fg-muted)]", closed && "cursor-default")}
            >
              <span className="absolute inset-y-0 left-0 bg-[var(--accent)]/15" style={{ width: `${pct}%` }} />
              <span className="relative flex items-center gap-2 text-[13px]">
                <span className={clsx("w-4 h-4 rounded-full border flex items-center justify-center shrink-0", selected ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-fg)]" : "border-[var(--fg-muted)]")}>{selected && <Check className="w-3 h-3" />}</span>
                <span className="flex-1 truncate">{c.text}</span>
                <span className="text-[12px] text-[var(--fg-muted)] tabular-nums">{c.count} · {pct}%</span>
              </span>
              {showVoters && !vote.options.anonymous && c.voters && c.voters.length > 0 && (
                <span className="relative block pl-6 text-[11px] text-[var(--fg-muted)] truncate">{c.voters.map((id) => userLabel(users[id])).join(", ")}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[12px]">
        {!vote.options.anonymous && (
          <button className="inline-flex items-center gap-1 text-[var(--fg-muted)] hover:text-[var(--fg)]" onClick={async () => { await ensureVoters(); setShowVoters((v) => !v); }}><Users className="w-3.5 h-3.5" />{showVoters ? "투표자 숨기기" : "투표자 보기"}</button>
        )}
        {!closed && vote.options.add_option && (adding ? (
          <span className="flex items-center gap-1">
            <input className={`${fieldClass} !py-1 !text-[12px] w-[180px]`} value={newOpt} onChange={(e) => setNewOpt(e.target.value)} placeholder="새 선택지" autoFocus onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void addOption(); if (e.key === "Escape") setAdding(false); }} />
            <button className="text-[var(--accent)]" onClick={() => void addOption()}>추가</button>
          </span>
        ) : (
          <button className="inline-flex items-center gap-1 text-[var(--fg-muted)] hover:text-[var(--fg)]" onClick={() => setAdding(true)}><Plus className="w-3.5 h-3.5" />선택지 추가</button>
        ))}
        {isOwner && !closed && <button className="ml-auto text-[var(--fg-muted)] hover:text-red-500" onClick={() => void close()}>마감</button>}
      </div>
    </div>
  );
}
