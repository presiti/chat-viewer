import { useMemo, useState } from "react";
import clsx from "clsx";
import { Check, Loader2, Search } from "lucide-react";
import { join, tempDir } from "@tauri-apps/api/path";
import type { Post } from "../../api/types";
import { chat, files } from "../../api/client";
import { channelLabel, useChat } from "../../store/chat";
import { useSession } from "../../store/session";
import { useToast } from "../../store/toast";
import { ChannelIcon } from "../ChannelIcon";
import { Dialog, fieldClass, ghostBtn, primaryBtn } from "../Dialog";
import { safeFileName } from "../ImageViewer";

type Mode = "all" | "image";

/** Pick a chat and send this message there: the whole message (text and file), or just the image. */
export function ForwardDialog({ post, onClose }: { post: Post; onClose: () => void }) {
  const channels = useChat((s) => s.channels);
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.info?.user_id);
  const fp = post.file_props;
  const isFile = post.type === "file" && !!fp;
  const isImage = isFile && !!fp.is_image;
  const [mode, setMode] = useState<Mode>("all");
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.values(channels)
      .filter((c) => c.is_joined && c.type !== "synobot")
      .map((c) => ({ c, label: channelLabel(c, users, me) }))
      .filter((x) => !needle || x.label.toLowerCase().includes(needle))
      .sort((a, b) => b.c.last_post_at - a.c.last_post_at)
      .slice(0, 80);
  }, [channels, users, me, q]);

  const send = async () => {
    if (target == null) return;
    setBusy(true);
    try {
      if (!isFile) {
        await chat.createPost(target, post.message);
      } else {
        // A file is copied, not referenced: fetch it to a temp file, then upload that to the other chat.
        const tmp = await join(await tempDir(), `fwd-${Date.now()}-${safeFileName(fp.name)}`);
        const path = await files.download(post.post_id, tmp);
        await files.upload({
          channelId: target, path, fileName: fp.name,
          message: mode === "all" && post.message ? post.message : undefined,
          uploadId: `fwd-${post.post_id}-${Date.now()}`,
        });
      }
      const t = channels[target];
      useToast.getState().push("info", `${t ? channelLabel(t, users, me) : "채널"}에 전달했어요`);
      onClose();
    } catch (e) {
      useToast.getState().push("error", `전달하지 못했어요: ${String((e as Error)?.message ?? e)}`);
      setBusy(false);
    }
  };

  const modeBtn = (m: Mode, label: string, sub: string, disabled = false) => (
    <button type="button" disabled={disabled} onClick={() => setMode(m)} className={clsx("flex-1 rounded-md border px-3 py-2 text-left disabled:opacity-40", mode === m ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] hover:bg-[var(--hover)]")}>
      <div className="text-[13px] font-medium">{label}</div>
      <div className="text-[11.5px] text-[var(--fg-muted)]">{sub}</div>
    </button>
  );

  return (
    <Dialog title="메시지 전달" onClose={onClose} width={420} footer={<><button className={ghostBtn} onClick={onClose}>취소</button><button className={primaryBtn} disabled={target == null || busy} onClick={() => void send()}>{busy ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : "전달"}</button></>}>
      <div className="space-y-3">
        {isFile && (
          <div className="flex gap-2">
            {modeBtn("all", "메시지 전체", post.message ? "파일과 메시지 글" : "파일")}
            {modeBtn("image", "이미지만", isImage ? "글 없이 이미지만" : "이미지가 아니에요", !isImage)}
          </div>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-muted)]" />
          <input autoFocus className={clsx(fieldClass, "pl-8")} placeholder="전달할 채널·사람 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-[260px] overflow-y-auto rounded-md border border-[var(--border)]">
          {list.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-[var(--fg-muted)]">찾는 채널이 없어요</div>}
          {list.map(({ c, label }) => (
            <button key={c.channel_id} type="button" onClick={() => setTarget(c.channel_id)} className={clsx("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13.5px] hover:bg-[var(--hover)]", target === c.channel_id && "bg-[var(--accent)]/10")}>
              <span className="flex w-5 justify-center"><ChannelIcon ch={c} me={me} /></span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {target === c.channel_id && <Check className="h-4 w-4 text-[var(--accent)]" />}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
