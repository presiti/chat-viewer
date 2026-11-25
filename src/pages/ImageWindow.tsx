import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Loader2 } from "lucide-react";
import { chat } from "../api/client";
import { useChat } from "../store/chat";
import { useImageViewer } from "../store/imageViewer";
import { ImageViewer } from "../components/ImageViewer";

/**
 * A window that holds one image viewer (`index.html?image=<post>&channel=<channel>`). It shares the main window's
 * session, loads the messages around the image so ←/→ can walk the channel's other images, and closes with Esc.
 */
export function ImageWindow({ channelId, postId }: { channelId: number; postId: number }) {
  const current = useImageViewer((s) => s.postId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    useImageViewer.getState().open(channelId, postId);
    (async () => {
      try {
        // The channel record tells loadNewer when it has caught up with the newest message.
        const channels = await chat.listChannels({ is_joined: true }).catch(() => []);
        const ch = channels.find((c) => c.channel_id === channelId);
        if (ch) useChat.getState().onChannelUpsert(ch);
        await useChat.getState().jumpToPost(channelId, postId);
      } catch (e) {
        setError((e as { message?: string })?.message ?? String(e));
      }
    })();
  }, [channelId, postId]);

  const close = () => { void getCurrentWindow().close(); };
  if (error) return <div className="h-full flex items-center justify-center bg-black text-white/70 text-[13px] titlebar-drag">이미지를 불러오지 못했습니다: {error}</div>;
  if (!current) return <div className="h-full flex items-center justify-center bg-black text-white/70 titlebar-drag"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  return <ImageViewer standalone channelId={channelId} postId={current} onClose={close} />;
}
