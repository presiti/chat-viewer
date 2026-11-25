import { useEffect, useState } from "react";
import clsx from "clsx";
import { ExternalLink, Puzzle, RefreshCw, SlashSquare, Webhook } from "lucide-react";
import { integrations, type IntegrationBot } from "../api/client";
import { channelLabel, useChat } from "../store/chat";
import { useSession } from "../store/session";
import { Avatar } from "../components/Avatar";
import { ghostBtn } from "../components/Dialog";
import { formatDay } from "../lib/format";
import { officialWebUrl, openExternal } from "../lib/external";

interface Lists { incoming: IntegrationBot[]; outgoing: IntegrationBot[]; slash: IntegrationBot[] }

/**
 * 통합: incoming / outgoing webhooks and slash commands, read from the server.
 * Creating and editing them stays in the official web client (external link), by design.
 */
export function Integrations() {
  const channels = useChat((s) => s.channels);
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.info?.user_id);
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    setLists(null); setError(null);
    Promise.all([integrations.incoming(), integrations.outgoing(), integrations.slash()])
      .then(([incoming, outgoing, slash]) => setLists({ incoming: incoming.filter((b) => !b.deleted), outgoing: outgoing.filter((b) => !b.deleted), slash: slash.filter((b) => !b.deleted) }))
      .catch((e) => { setError((e as { message?: string })?.message ?? String(e)); setLists({ incoming: [], outgoing: [], slash: [] }); });
  };
  useEffect(() => { load(); }, []);

  const row = (b: IntegrationBot) => {
    const ch = b.channel_id ? channels[b.channel_id] : undefined;
    return (
      <li key={`${b.bot_type}-${b.user_id}`} className={clsx("flex items-center gap-3 px-3 py-2", b.is_disabled && "opacity-60")}>
        <Avatar userId={b.user_id} size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-medium truncate">{b.bot_type === "slash" ? `/${b.slash_props?.cmd ?? b.nickname}` : b.nickname}</span>
            {b.is_disabled && <span className="rounded border border-[var(--border)] px-1 text-[10.5px] text-[var(--fg-muted)]">비활성</span>}
            {b.bot_props?.is_system && <span className="rounded border border-[var(--border)] px-1 text-[10.5px] text-[var(--fg-muted)]">기본 제공</span>}
          </div>
          <div className="text-[11.5px] text-[var(--fg-muted)] truncate">
            {b.bot_type === "slash" ? (b.slash_props?.description?.startsWith("webhook_builtin:") ? "Synology 기본 명령" : b.slash_props?.description || b.slash_props?.usage || "설명 없음") : ch ? `채널: ${channelLabel(ch, users, me)}` : b.channel_id ? `채널 #${b.channel_id}` : "채널 미지정"}
            {b.creator_id ? ` · 만든 사람: ${users[b.creator_id]?.nickname ?? users[b.creator_id]?.username ?? b.creator_id}` : ""}
            {b.create_at ? ` · ${formatDay(b.create_at)}` : ""}
          </div>
        </div>
      </li>
    );
  };
  const section = (title: string, icon: React.ReactNode, items: IntegrationBot[], empty: string) => (
    <section>
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold mb-2">{icon}{title}<span className="text-[11px] font-normal text-[var(--fg-muted)]">{items.length}</span></h3>
      {items.length === 0 ? <p className="text-[12px] text-[var(--fg-muted)] py-3 px-1">{empty}</p> : <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">{items.map(row)}</ul>}
    </section>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="titlebar-drag h-[52px] shrink-0 flex items-center gap-3 px-5 border-b border-[var(--border)]">
        <Puzzle className="w-4 h-4 text-[var(--fg-muted)]" />
        <div className="font-semibold text-[15px]">통합</div>
        <span className="text-[12px] text-[var(--fg-muted)]">봇 · 웹훅 · 슬래시 명령</span>
        <div className="titlebar-nodrag ml-auto flex items-center gap-1.5">
          <button className={`${ghostBtn} inline-flex items-center gap-1.5 !py-1`} onClick={load}><RefreshCw className="w-3.5 h-3.5" /> 새로고침</button>
          <button className={`${ghostBtn} inline-flex items-center gap-1.5 !py-1`} title="브라우저에서 공식 웹 클라이언트를 엽니다" onClick={() => openExternal(officialWebUrl())}>공식 웹에서 만들기 · 편집 <ExternalLink className="w-3.5 h-3.5" /></button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-[860px]">
        <p className="text-[12px] text-[var(--fg-muted)]">이 화면은 조회 전용입니다. 웹훅·슬래시 명령을 만들거나 고치려면 오른쪽 위 버튼으로 공식 웹 클라이언트(브라우저)를 열어 프로필 메뉴 → 통합에서 진행하세요.</p>
        {error && <p className="text-[12px] text-red-500">{error}</p>}
        {!lists ? <p className="text-[12px] text-[var(--fg-muted)]">불러오는 중…</p> : (
          <>
            {section("수신 웹훅", <Webhook className="w-4 h-4" />, lists.incoming, "수신 웹훅이 없습니다. 외부 시스템이 채널로 메시지를 보내게 하려면 공식 웹에서 만드세요.")}
            {section("발신 웹훅", <Webhook className="w-4 h-4 -scale-x-100" />, lists.outgoing, "발신 웹훅이 없습니다.")}
            {section("슬래시 명령", <SlashSquare className="w-4 h-4" />, lists.slash, "슬래시 명령이 없습니다.")}
          </>
        )}
      </div>
    </div>
  );
}
