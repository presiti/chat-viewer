import { useSession } from "../store/session";

export function StatusBanner() {
  const status = useSession((s) => s.socket);
  const attempt = useSession((s) => s.socketAttempt);
  if (status === "connected" || status === "idle" || status === "connecting") return null;
  const text =
    status === "reconnecting" ? `서버와 연결이 끊겼습니다. 다시 연결 중… (${attempt}회)` : "실시간 연결이 종료되었습니다.";
  return <div className="bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[12.5px] px-4 py-1.5 text-center border-b border-amber-500/30">{text}</div>;
}
