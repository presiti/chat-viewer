import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  /** Element the popover is attached to. */
  anchor: HTMLElement | null;
  children: React.ReactNode;
  /** Horizontal alignment relative to the anchor. */
  align?: "left" | "right";
  /** Preferred vertical side; flips automatically when there is no room. */
  side?: "bottom" | "top";
  gap?: number;
  /** Set false to keep the preferred side even when it does not fit (it is then clamped to the viewport). */
  flip?: boolean;
  /** CSS selector of an element the popover must not overlap (e.g. the composer); its top edge becomes the lower bound. */
  avoid?: string;
}

/**
 * Renders children in a portal positioned next to `anchor` using fixed coordinates, so it is never
 * clipped by scroll containers (message list, panels) and flips above the anchor near the bottom.
 */
export function Popover({ anchor, children, align = "right", side = "bottom", gap = 4, flip = true, avoid }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el || !anchor) return;
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth, h = el.offsetHeight;
      const vw = window.innerWidth;
      const avoidEl = avoid ? document.querySelector<HTMLElement>(avoid) : null;
      const limit = avoidEl ? avoidEl.getBoundingClientRect().top : window.innerHeight;
      let top = side === "bottom" ? a.bottom + gap : a.top - h - gap;
      if (flip && side === "bottom" && top + h > limit - 8) top = a.top - h - gap;
      if (flip && side === "top" && top < 8) top = a.bottom + gap;
      top = Math.max(8, Math.min(top, limit - h - 8));
      let left = align === "right" ? a.right - w : a.left;
      left = Math.max(8, Math.min(left, vw - w - 8));
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor, align, side, gap, flip, avoid]);

  return createPortal(
    <div ref={ref} className={pos ? "anim-pop" : undefined} style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, zIndex: 60 }}>
      {children}
    </div>,
    document.body,
  );
}
