import { profile, chat } from "../api/client";
import { useChat } from "../store/chat";
import { useSession } from "../store/session";

/** 부재 중 (always shown offline): current state and a toggle that flips the dot at once and confirms with the server. */
export function useAway() {
  const me = useSession((s) => s.info?.user_id);
  const users = useChat((s) => s.users);
  const onUserUpsert = useChat((s) => s.onUserUpsert);
  const away = !!(me != null && users[me]?.user_props?.is_always_offline);
  const toggle = async () => {
    if (!me) return;
    const meRec = users[me];
    if (meRec) onUserUpsert({ ...meRec, user_props: { ...(meRec.user_props ?? {}), is_always_offline: !away } });
    try { await profile.set({ is_always_offline: !away }); } catch { if (meRec) onUserUpsert(meRec); return; }
    const fresh = (await chat.listUsers().catch(() => null))?.find((u) => u.user_id === me);
    if (fresh) onUserUpsert(fresh);
  };
  return { away, toggle };
}
