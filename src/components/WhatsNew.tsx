import { useEffect, useState } from "react";
import { getIdentifier, getVersion } from "@tauri-apps/api/app";
import { CHANGELOG, CHANGELOG_URL } from "../lib/changelog";
import { openExternal } from "../lib/external";
import { ExternalLink } from "lucide-react";
import { Dialog, primaryBtn } from "./Dialog";

const KEY = "chat-viewer.seenVersion";
const cmp = (a: string, b: string) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};

/** Small "what changed" popup, shown once after the app has been updated to a new version. */
export function WhatsNew() {
  const [shown, setShown] = useState<{ version: string; entries: typeof CHANGELOG } | null>(null);
  useEffect(() => {
    (async () => {
      const version = await getVersion();
      let seen: string | null = null;
      try { seen = localStorage.getItem(KEY); } catch { /* ignore */ }
      // A fresh install has nothing to compare with; the dev build shows it so the popup can be checked.
      const isDev = await getIdentifier().then((id) => id.endsWith(".dev")).catch(() => false);
      if (!seen && !isDev) { try { localStorage.setItem(KEY, version); } catch { /* ignore */ } return; }
      if (seen && cmp(seen, version) >= 0) return;
      const entries = CHANGELOG.filter((r) => cmp(r.version, seen ?? "0.0.0") > 0 && cmp(r.version, version) <= 0).slice(0, 3);
      if (entries.length) setShown({ version, entries });
    })().catch(() => undefined);
  }, []);
  if (!shown) return null;
  const close = () => { try { localStorage.setItem(KEY, shown.version); } catch { /* ignore */ } setShown(null); };
  return (
    <Dialog title={`Chat Viewer ${shown.version} 업데이트됨`} onClose={close} width={380} footer={<button className={primaryBtn} onClick={close}>확인</button>}>
      <div className="space-y-3 text-[13px]">
        {shown.entries.map((r) => (
          <div key={r.version}>
            {shown.entries.length > 1 && <div className="mb-1 font-medium">{r.version}</div>}
            <ul className="list-disc space-y-1 pl-5">{r.items.map((it) => <li key={it}>{it}</li>)}</ul>
          </div>
        ))}
        <button type="button" className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline" onClick={() => openExternal(CHANGELOG_URL)}>전체 변경 내역 (GitHub) <ExternalLink className="w-3 h-3" /></button>
      </div>
    </Dialog>
  );
}
