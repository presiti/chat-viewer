import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { ExternalLink, Info, Keyboard, Lightbulb, Sparkles } from "lucide-react";
import { useSession } from "../store/session";
import { useChat, userLabel } from "../store/chat";
import { UpdateSettings } from "../components/UpdateBanner";
import { CHANGELOG, CHANGELOG_URL, RELEASES_URL } from "../lib/changelog";
import { SHORTCUT_GROUPS, TIPS } from "../lib/shortcuts";
import { HELP_URL, officialWebUrl, openExternal } from "../lib/external";
import { isMacDesktop } from "../lib/platform";

const KEY_LABEL: Record<string, string> = isMacDesktop
  ? { Mod: "⌘", Alt: "⌥", Shift: "⇧", Enter: "↩", Esc: "esc" }
  : { Mod: "Ctrl", Alt: "Alt", Shift: "Shift", Enter: "Enter", Esc: "Esc" };

/** One chord such as "Mod+Shift+B" as a row of key caps. */
function Chord({ chord }: { chord: string }) {
  // "Mod+\\" — the last "+" splits off the key itself, so a literal "+" key would need escaping (none today).
  const parts = chord.split("+").filter(Boolean);
  return (
    <span className="inline-flex items-center gap-[2px] whitespace-nowrap">
      {parts.map((p, i) => <kbd key={i} className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-[5px] border border-[var(--border)] bg-[var(--bg-muted)] px-1.5 font-sans text-[11px] font-medium leading-none text-[var(--fg)] shadow-[inset_0_-1px_0_var(--border)]">{KEY_LABEL[p] ?? p}</kbd>)}
    </span>
  );
}

const linkBtn = "inline-flex items-center gap-1 text-[12.5px] text-[var(--accent)] hover:underline";
const extIcon = <ExternalLink className="w-3 h-3" />;

/**
 * 정보: fills the chat column (no popup). Version and update state, what is new in this version, the keyboard
 * reference, tips, account and links. The full release history lives on GitHub (CHANGELOG_URL), not in the app.
 */
export function About() {
  const info = useSession((s) => s.info);
  const me = useChat((s) => (info ? s.users[info.user_id] : undefined));
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => { getVersion().then(setVersion).catch(() => setVersion(null)); }, []);
  // The entry for the running version; the newest known one when the running build has no entry yet (dev).
  const current = CHANGELOG.find((r) => r.version === version) ?? CHANGELOG[0];

  const h2 = (icon: React.ReactNode, text: string) => <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold"><span className="text-[var(--fg-muted)]">{icon}</span>{text}</h2>;
  const row = (k: string, v: React.ReactNode) => <div className="flex gap-3 text-[13px]"><span className="w-[88px] shrink-0 text-[var(--fg-muted)]">{k}</span><span className="min-w-0 break-all">{v}</span></div>;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="titlebar-drag h-[52px] shrink-0 flex items-center gap-3 px-5 border-b border-[var(--border)]">
        <Info className="w-4 h-4 text-[var(--fg-muted)]" />
        <div className="font-semibold text-[15px]">정보</div>
        <span className="text-[12px] text-[var(--fg-muted)]">버전 · 새 기능 · 단축키</span>
        <div className="titlebar-nodrag ml-auto flex items-center gap-3">
          <button type="button" className={linkBtn} onClick={() => openExternal(HELP_URL)}>Synology Chat 도움말 {extIcon}</button>
          <button type="button" className={linkBtn} onClick={() => openExternal(officialWebUrl())}>공식 웹 클라이언트 {extIcon}</button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-[760px] space-y-8">
          {/* Version + 지금 확인 + 설치: the update state lives here, not only in the banner. */}
          <section>
            <UpdateSettings />
          </section>

          <section>
            {h2(<Sparkles className="w-4 h-4" />, `이번 버전의 새 기능${current ? ` · ${current.version}` : ""}`)}
            {current ? (
              <ul className="list-disc space-y-1 pl-5 text-[13px]">{current.items.map((it) => <li key={it}>{it}</li>)}</ul>
            ) : <p className="text-[12.5px] text-[var(--fg-muted)]">이 빌드의 항목이 없습니다.</p>}
            <div className="mt-2.5 flex flex-wrap gap-4">
              <button type="button" className={linkBtn} onClick={() => openExternal(CHANGELOG_URL)}>전체 변경 내역 (GitHub) {extIcon}</button>
              <button type="button" className={linkBtn} onClick={() => openExternal(RELEASES_URL)}>릴리스 · 설치 파일 {extIcon}</button>
            </div>
          </section>

          <section>
            {h2(<Keyboard className="w-4 h-4" />, "단축키")}
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {SHORTCUT_GROUPS.map((g) => (
                <div key={g.title}>
                  <h3 className="mb-1.5 text-[12px] font-semibold text-[var(--fg-muted)]">{g.title}</h3>
                  <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                    {g.rows.map((r) => (
                      <li key={r.label} className="flex items-start gap-3 px-3 py-2 text-[12.5px]">
                        <div className="min-w-0 flex-1">
                          <div>{r.label}</div>
                          {r.note && <div className="mt-0.5 text-[11.5px] leading-snug text-[var(--fg-muted)]">{r.note}</div>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 pt-[1px]">
                          {r.keys.length > 0 && <div className="flex items-center gap-1.5">{r.keys.map((k, i) => <span key={k} className="inline-flex items-center gap-1.5">{i > 0 && <span className="text-[11px] text-[var(--fg-muted)]">·</span>}<Chord chord={k} /></span>)}</div>}
                          {r.markup && <code className="rounded bg-[var(--bg-muted)] px-1.5 py-[1px] text-[11.5px]">{r.markup}</code>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section>
            {h2(<Lightbulb className="w-4 h-4" />, "알아 두면 좋은 것")}
            <dl className="space-y-1.5 text-[12.5px]">{TIPS.map(([k, v]) => <div key={k} className="flex gap-3"><dt className="w-[120px] shrink-0 text-[var(--fg-muted)]">{k}</dt><dd className="min-w-0">{v}</dd></div>)}</dl>
          </section>

          <section className="space-y-2">
            {h2(<Info className="w-4 h-4" />, "계정 · 서버")}
            {row("서버", info?.host ?? "")}
            {row("계정", me ? `${userLabel(me)} (${me.username})` : info ? `사용자 #${info.user_id}` : "")}
            {row("기술", "Tauri 2 · Rust · React 19 · SQLite FTS5")}
            <p className="pt-1 text-[12px] text-[var(--fg-muted)]">Synology Chat 서버(DSM)의 공식 WebAPI와 소켓을 그대로 사용하는 개인 제작 클라이언트입니다. 서버에 저장되는 설정(알림·스누즈·프로필·숨기기)은 공식 앱과 공유되고, 이 앱만의 설정(정렬·그룹·테마)은 내 공간의 설정 파일로 동기화됩니다.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
