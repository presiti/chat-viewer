import { FormEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { auth, isAppError } from "../api/client";
import { useSession } from "../store/session";

const LAST_HOST_KEY = "chat-viewer:last-host";

export function LoginForm() {
  const setLoggedIn = useSession((s) => s.setLoggedIn);
  const [host, setHost] = useState(() => {
    try { return localStorage.getItem(LAST_HOST_KEY) ?? "https://"; } catch { return "https://"; }
  });
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [needOtp, setNeedOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (!busy) { setWaited(0); return; }
    const t = window.setInterval(() => setWaited((w) => w + 1), 1000);
    return () => window.clearInterval(t);
  }, [busy]);
  const [error, setError] = useState<string | null>(null);

  const normalizeHost = (h: string) => {
    let v = h.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//.test(v)) v = `https://${v}`;
    return v;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const h = normalizeHost(host);
      const info = await auth.login(h, account.trim(), password, needOtp ? otp.trim() : undefined);
      try { localStorage.setItem(LAST_HOST_KEY, h); } catch { /* ignore */ }
      setLoggedIn(info);
    } catch (err) {
      if (isAppError(err)) {
        if (err.kind === "otp_required") {
          setNeedOtp(true);
          setError(needOtp ? "OTP 코드가 올바르지 않습니다." : "OTP 코드를 입력하세요.");
        } else if (err.kind === "login_failed") {
          setError(err.code === 400 ? "계정 또는 비밀번호가 올바르지 않습니다." : `로그인 실패 (코드 ${err.code})`);
        } else {
          setError(err.message);
        }
      } else {
        setError(String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20";

  return (
    <div className="h-full flex items-center justify-center titlebar-drag">
      <form onSubmit={submit} className="titlebar-nodrag w-[360px] rounded-xl border border-[var(--border)] bg-[var(--bg)] p-7 shadow-xl space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Chat Viewer</h1>
          <p className="text-[var(--fg-muted)] text-[13px] mt-1">Synology Chat 서버에 로그인합니다.</p>
        </div>
        <label className="block space-y-1">
          <span className="text-[12px] text-[var(--fg-muted)]">서버 주소</span>
          <input className={field} value={host} onChange={(e) => setHost(e.target.value)} placeholder="https://nas.example.com:5001" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] text-[var(--fg-muted)]">계정</span>
          <input className={field} value={account} onChange={(e) => setAccount(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} autoFocus />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] text-[var(--fg-muted)]">비밀번호</span>
          <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {needOtp && (
          <label className="block space-y-1">
            <span className="text-[12px] text-[var(--fg-muted)]">OTP 코드</span>
            <input className={field} value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" autoFocus />
          </label>
        )}
        {error && <p className="text-[13px] text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy || !host || !account || !password}
          aria-busy={busy}
          className={`w-full rounded-md bg-[var(--accent)] text-[var(--accent-fg)] py-2 font-medium inline-flex items-center justify-center gap-2 ${busy ? "cursor-wait" : "disabled:opacity-50"}`}
        >
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> 로그인 요청 보냄 · 응답 기다리는 중{waited >= 2 ? ` (${waited}초)` : "…"}</> : "로그인"}
        </button>
      </form>
    </div>
  );
}
