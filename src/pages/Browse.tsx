import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Archive, Compass, LogOut, Plus, Search, Users } from "lucide-react";
import { ChannelIcon } from "../components/ChannelIcon";
import type { Channel } from "../api/types";
import { archive as archiveApi, chat, type ArchiveEntry, type ArchiveType } from "../api/client";
import { useChat } from "../store/chat";
import { useUi } from "../store/ui";
import { formatDay } from "../lib/format";
import { ghostBtn, primaryBtn, fieldClass, dangerBtn } from "../components/Dialog";
import { CreateChannelDialog } from "../components/dialogs/CreateChannelDialog";

const ARCHIVE_LABEL: Record<ArchiveType, string> = { private: "비공개", public: "공개", anonymous: "대화", chatbot: "봇" };
type Tab = "available" | "joined" | "inactive";
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "available", label: "참여 가능한 채널", icon: <Compass className="w-4 h-4" /> },
  { key: "joined", label: "내가 참여한 채널", icon: <Users className="w-4 h-4" /> },
  { key: "inactive", label: "비활성·보관된 채널", icon: <Archive className="w-4 h-4" /> },
];

/** Channel directory: discover & join public channels, create new ones, review joined/inactive ones. */
export function Browse() {
  const channels = useChat((s) => s.channels);
  const joinChannel = useChat((s) => s.joinChannel);
  const leaveChannel = useChat((s) => s.leaveChannel);
  const selectChannel = useChat((s) => s.selectChannel);
  const setView = useUi((s) => s.setView);
  const [tab, setTab] = useState<Tab>("available");
  const [q, setQ] = useState("");
  const [available, setAvailable] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [create, setCreate] = useState(false);
  const setArchiveType = useUi((s) => s.setArchiveType);
  const [archived, setArchived] = useState<{ type: ArchiveType; name: string; archives: ArchiveEntry[] }[] | null>(null);
  // Channels I took part in that are archived or left: the same lists the official Archive page shows.
  useEffect(() => {
    if (tab !== "inactive" || archived) return;
    Promise.all((["private", "public", "anonymous", "chatbot"] as ArchiveType[]).map((type) => archiveApi.listAll(type).then((g) => g.filter((x) => x.archives.length > 0).map((x) => ({ type, ...x }))).catch(() => [] as { type: ArchiveType; name: string; archives: ArchiveEntry[] }[])))
      .then((all) => setArchived(all.flat()));
  }, [tab, archived]);

  const reload = () => { setAvailable(null); chat.listUnjoinedChannels().then(setAvailable).catch((e) => { setError((e as { message?: string })?.message ?? String(e)); setAvailable([]); }); };
  useEffect(() => { reload(); }, []);

  const k = q.trim().toLowerCase();
  const match = (c: Channel) => !k || c.name.toLowerCase().includes(k) || (c.purpose ?? "").toLowerCase().includes(k);
  const joined = useMemo(() => Object.values(channels).filter((c) => c.is_joined && (c.type === "public" || c.type === "private") && !(c.hide_global_at ?? 0)).sort((a, b) => a.name.localeCompare(b.name, "ko")), [channels]);
  const inactive = useMemo(() => Object.values(channels).filter((c) => (c.hide_global_at ?? 0) > 0), [channels]);

  const join = async (c: Channel) => { setBusy(c.channel_id); setError(null); try { await joinChannel(c); setView("channel"); } catch (e) { setError(`참여 실패: ${(e as { message?: string })?.message ?? e}`); } finally { setBusy(null); } };
  const leave = async (c: Channel) => {
    if (!confirm(`"${c.name}" 채널에서 나갈까요? 공개 채널은 나중에 다시 참여할 수 있습니다.`)) return;
    setBusy(c.channel_id); setError(null);
    try { await leaveChannel(c.channel_id); reload(); } catch (e) { setError(`나가기 실패: ${(e as { message?: string })?.message ?? e}`); } finally { setBusy(null); }
  };
  const archive = async (c: Channel) => {
    if (!confirm(`"${c.name}" 채널을 보관할까요? 보관된 채널은 모든 멤버에게서 사라지며 관리자 콘솔에서만 복구할 수 있습니다.`)) return;
    setBusy(c.channel_id); setError(null);
    try { await chat.archiveChannel(c.channel_id); useChat.getState().onChannelRemove(c.channel_id); } catch (e) { setError(`보관 실패: ${(e as { message?: string })?.message ?? e} (채널 생성자 또는 관리자만 보관할 수 있습니다)`); } finally { setBusy(null); }
  };

  const card = (c: Channel, actions: React.ReactNode) => (
    <div key={c.channel_id} className="flex items-start gap-3 rounded-lg border border-[var(--border)] px-4 py-3 hover:bg-[var(--hover)]/50">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-muted)] text-[var(--fg-muted)]"><ChannelIcon ch={c} size={16} dm="none" className="!opacity-100" /></span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[14px] truncate">{c.name}</div>
        {c.purpose && <div className="text-[12.5px] text-[var(--fg-muted)] line-clamp-2">{c.purpose}</div>}
        <div className="mt-1 text-[11px] text-[var(--fg-muted)]">멤버 {c.total_member_count}명{c.create_at ? ` · ${formatDay(c.create_at)} 생성` : ""}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="titlebar-drag h-[52px] shrink-0 flex items-center gap-3 px-5 border-b border-[var(--border)]">
        <Compass className="w-4 h-4 text-[var(--fg-muted)]" />
        <div className="font-semibold text-[15px]">채널 찾기 · 만들기</div>
        <button className={`${primaryBtn} titlebar-nodrag ml-auto inline-flex items-center gap-1.5 !py-1`} onClick={() => setCreate(true)}><Plus className="w-4 h-4" /> 새 채널 만들기</button>
      </header>
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={clsx("px-3 py-2.5 text-[13px] border-b-2 -mb-px inline-flex items-center gap-1.5", tab === t.key ? "border-[var(--accent)] text-[var(--fg)] font-medium" : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]")}>
            {t.icon}{t.label}
            {t.key === "available" && available && available.length > 0 && <span className="rounded-full bg-[var(--accent)]/15 px-1.5 text-[11px] text-[var(--accent)]">{available.length}</span>}
          </button>
        ))}
        <div className="ml-auto relative my-1.5">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--fg-muted)]" />
          <input className={`${fieldClass} !pl-7 !py-1 !text-[12.5px] w-[220px]`} placeholder="채널 이름·목적 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {error && <p className="mb-3 text-[12px] text-red-500">{error}</p>}
        <div className="w-full space-y-2">
          {tab === "available" && (
            available === null ? <p className="text-[13px] text-[var(--fg-muted)]">불러오는 중…</p>
            : available.filter(match).length === 0 ? (
              <div className="py-12 text-center text-[13px] text-[var(--fg-muted)]">
                <p>참여할 수 있는 공개 채널이 {k ? "검색 결과에 " : ""}없습니다.</p>
                <p className="mt-1">비공개 채널은 멤버가 초대해야 들어갈 수 있습니다. 필요한 채널이 없다면 직접 만들어 보세요.</p>
              </div>
            ) : available.filter(match).map((c) => card(c, <button className={`${primaryBtn} !py-1`} disabled={busy === c.channel_id} onClick={() => void join(c)}>{busy === c.channel_id ? "참여 중…" : "참여"}</button>))
          )}
          {tab === "joined" && (
            joined.filter(match).length === 0 ? <p className="py-12 text-center text-[13px] text-[var(--fg-muted)]">참여한 채널이 없습니다.</p>
            : joined.filter(match).map((c) => card(c, <>
                <button className={`${ghostBtn} !py-1`} onClick={() => { setView("channel"); void selectChannel(c.channel_id); }}>열기</button>
                <button className={`${ghostBtn} !py-1 inline-flex items-center gap-1`} title="채널 보관 (생성자/관리자)" disabled={busy === c.channel_id} onClick={() => void archive(c)}><Archive className="w-3.5 h-3.5" /> 보관</button>
                <button className={`${dangerBtn} !py-1 inline-flex items-center gap-1`} disabled={busy === c.channel_id} onClick={() => void leave(c)}><LogOut className="w-3.5 h-3.5" /> 나가기</button>
              </>))
          )}
          {tab === "inactive" && (
            <>
              <p className="mb-3 text-[12.5px] text-[var(--fg-muted)]">관리자가 비활성화한 채널과, 보관되었거나 내가 나가서 읽기만 가능한 채널입니다. 보관된 채널의 복구는 Synology Chat 관리자 콘솔에서만 가능합니다.</p>
              {inactive.filter(match).map((c) => card(c, <span className="text-[12px] text-[var(--fg-muted)]">비활성 · {c.hide_global_at ? formatDay(c.hide_global_at) : ""}</span>))}
              <h3 className="mt-4 mb-1 text-[12px] font-semibold text-[var(--fg-muted)]">보관된 채널 · 대화 · 봇 {archived ? `(${archived.filter((g) => !k || g.name.toLowerCase().includes(k) || g.type === "anonymous").length})` : ""}</h3>
              {!archived ? <p className="py-6 text-center text-[13px] text-[var(--fg-muted)]">불러오는 중…</p>
              : archived.length === 0 && inactive.length === 0 ? <p className="py-8 text-center text-[13px] text-[var(--fg-muted)]">비활성·보관된 채널이 없습니다.</p>
              : <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
                {archived.filter((g) => !k || g.name.toLowerCase().includes(k) || g.type === "anonymous").map((g) => (
                  <li key={`${g.type}:${g.name}`}>
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[var(--hover)]" onClick={() => { setArchiveType(g.type); setView("archive"); }}>
                      <span className="rounded border border-[var(--border)] px-1 text-[10.5px] text-[var(--fg-muted)]">{ARCHIVE_LABEL[g.type]}</span>
                      <span className="flex-1 truncate">{g.type === "anonymous" ? "개인 대화" : g.name}</span>
                      <span className="text-[11px] text-[var(--fg-muted)]">기록 {g.archives.length}건 · 보관 뷰어에서 열기</span>
                    </button>
                  </li>
                ))}
              </ul>}
            </>
          )}
        </div>
      </div>
      {create && <CreateChannelDialog onClose={() => setCreate(false)} />}
    </div>
  );
}
