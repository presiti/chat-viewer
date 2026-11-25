import { useEffect } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

/** Centered modal with backdrop; closes on Esc or backdrop click. */
export function Dialog({ title, onClose, children, footer, width = 520 }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Portaled to <body>: the sidebar/chat regions are isolated stacking contexts (for the texture layer), which would trap the overlay behind the chat.
  return createPortal(
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={clsx("popover anim-pop flex flex-col max-h-[85vh]")} style={{ width }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[15px]">{title}</h2>
          <IconButton label="닫기" size="sm" onClick={onClose}><X /></IconButton>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export const fieldClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20";
export const primaryBtn = "rounded-md bg-[var(--accent)] text-[var(--accent-fg)] px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-50";
export const ghostBtn = "rounded-md border border-[var(--border)] px-3.5 py-1.5 text-[13px] hover:bg-[var(--hover)]";
export const dangerBtn = "rounded-md border border-red-500/40 text-red-500 px-3.5 py-1.5 text-[13px] hover:bg-red-500/10";
