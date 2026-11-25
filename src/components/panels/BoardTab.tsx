import { useEffect, useState } from "react";
import { Download, Pin, PinOff } from "lucide-react";
import { chat } from "../../api/client";
import type { Post } from "../../api/types";
import { useChat } from "../../store/chat";
import { formatBytes, formatDateTime } from "../../lib/format";
import { userLabel } from "../../store/chat";
import { IconButton } from "../IconButton";
import { emptyState } from "./PanelShell";
import { PostListItem } from "./PostListItem";
import { downloadPost } from "../ImageViewer";
import { ghostBtn } from "../Dialog";
import { localIndex } from "../../store/index";
import { matchesFileFilter, parseExts, resolveFileFilter } from "../../lib/fileKinds";
import { useUi } from "../../store/ui";
import { FileKindFilter } from "../FileKindFilter";
import { isSettingsPost } from "../../lib/settingsFile";
import { FileIcon } from "../FileIcon";

export type BoardTabKey = "pinned" | "files" | "links" | "votes";
type Tab = BoardTabKey;

function usePagedSearch(channelId: number, tab: Tab, kinds: string[], exts: string[]) {
  const fileKindDefs = useUi((s) => s.fileKinds);
  const [items, setItems] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kindKey = kinds.join(","), extKey = exts.join(",");
  const load = async (offset: number) => {
    setLoading(true); setError(null);
    try {
      let list: Post[]; let count: number;
      if (tab === "files") {
        // The local index knows every file's extension; fall back to the server until the channel is indexed.
        const state = await localIndex.channelState(channelId).catch(() => null);
        if (state?.complete) {
          const resolved = resolveFileFilter(kinds, exts, fileKindDefs);
          const r = await localIndex.search({ query: "", channelIds: [channelId], filesOnly: true, kinds: resolved.other ? ["other"] : [], exts: resolved.exts, offset, limit: 30 });
          list = r.items; count = r.total;
        } else {
          const r = await chat.search({ keyword: "", in: [channelId], post_type: ["file"], offset, limit: 30 });
          list = r.search_results.filter((p) => !isSettingsPost(p) && matchesFileFilter(p.file_props?.name, kinds, exts, fileKindDefs)); count = r.total;
        }
      } else {
        const r =
          tab === "pinned" ? await chat.listPinned(channelId, offset, 30)
          : tab === "links" ? await chat.listLinks(channelId, offset, 30)
          : await chat.listVotes(channelId, offset, 30);
        list = r.search_results; count = r.total;
      }
      setItems((prev) => (offset ? [...prev, ...list] : list));
      setTotal(count);
    } catch (e) { setError((e as { message?: string })?.message ?? String(e)); } finally { setLoading(false); }
  };
  useEffect(() => { setItems([]); setTotal(0); void load(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [channelId, tab, kindKey, extKey]);
  return { items, total, loading, error, more: () => load(items.length), setItems };
}

/** 고정 / 파일 / 링크 / 투표 — one tab body of the channel info panel. */
export function BoardTab({ channelId, tab }: { channelId: number; tab: BoardTabKey }) {
  const [kinds, setKinds] = useState<string[]>([]);
  const [extText, setExtText] = useState("");
  const users = useChat((s) => s.users);
  const { items, total, loading, error, more, setItems } = usePagedSearch(channelId, tab, kinds, parseExts(extText));

  const unpin = async (p: Post) => {
    await chat.pinPost(p.post_id, false).catch(() => null);
    setItems((prev) => prev.filter((x) => x.post_id !== p.post_id));
    useChat.getState().onPostUpdate({ ...p, is_sticky: false, last_pin_at: 0 });
  };

  return (
    <div>
      {tab === "files" && <div className="px-3 py-2 border-b border-[var(--border)]"><FileKindFilter kinds={kinds} onKinds={setKinds} extText={extText} onExtText={setExtText} /></div>}
      {error && <p className="p-3 text-[12px] text-red-500">{error}</p>}
      {!loading && !error && items.length === 0 && emptyState(tab === "pinned" ? "고정된 메시지가 없습니다." : tab === "files" ? "공유된 파일이 없습니다." : tab === "links" ? "공유된 링크가 없습니다." : "투표가 없습니다.")}
      {tab === "files"
        ? items.map((p) => (
            <div key={p.post_id} className="group flex items-center gap-2.5 px-4 py-2 border-b border-[var(--border)] hover:bg-[var(--hover)] cursor-pointer" onClick={() => void useChat.getState().jumpToPost(channelId, p.post_id)}>
              <FileIcon name={p.file_props?.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] truncate">{p.file_props?.name}</div>
                <div className="text-[11px] text-[var(--fg-muted)]">{userLabel(users[p.creator_id])} · {formatDateTime(p.create_at)} · {formatBytes(p.file_props?.size ?? 0)}</div>
              </div>
              <IconButton size="sm" label="다운로드" className="opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); void downloadPost(p); }}><Download /></IconButton>
            </div>
          ))
        : items.map((p) => (
            <PostListItem
              key={p.post_id}
              post={p}
              right={tab === "pinned" ? <IconButton size="sm" label="고정 해제" onClick={() => void unpin(p)}><PinOff /></IconButton> : tab === "votes" ? <span className="text-[11px]">{p.props?.vote?.state === "closed" ? "마감" : "진행 중"}</span> : undefined}
            />
          ))}
      {items.length < total && <button className={`${ghostBtn} m-3 w-[calc(100%-24px)]`} disabled={loading} onClick={() => void more()}>더 보기 ({items.length}/{total})</button>}
      {tab === "pinned" && items.length > 0 && <p className="px-4 py-2 text-[11px] text-[var(--fg-muted)] inline-flex items-center gap-1"><Pin className="w-3 h-3" /> 메시지에 마우스를 올리면 고정할 수 있습니다.</p>}
    </div>
  );
}
