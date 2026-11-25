import data from "../data/stickers.json";

interface StickerSprite { w: number; h: number; sheet1x: string; sheet2x?: string; sheetW?: number; sheetH?: number; x: number; y: number }
const stickers = data as Record<string, StickerSprite>;

export const isStickerName = (name: string) => name in stickers;
export const stickerNames = Object.keys(stickers);

/** CSS for rendering a sticker at `size` px from the official sprite sheets hosted on the NAS. */
export function stickerStyle(host: string, name: string, size = 160): React.CSSProperties | null {
  const s = stickers[name];
  if (!s) return null;
  const scale = size / s.w;
  const sheet = s.sheet2x ?? s.sheet1x;
  const sheetW = (s.sheetW ?? s.w) * scale;
  const sheetH = (s.sheetH ?? s.h) * scale;
  return {
    width: size,
    height: Math.round(s.h * scale),
    backgroundImage: `url(${host}/webman/3rdparty/Chat/${sheet})`,
    backgroundPosition: `${s.x * scale}px ${s.y * scale}px`,
    backgroundSize: `${sheetW}px ${sheetH}px`,
    backgroundRepeat: "no-repeat",
  };
}
