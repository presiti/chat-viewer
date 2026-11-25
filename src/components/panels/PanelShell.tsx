import clsx from "clsx";
import { X } from "lucide-react";
import { IconButton } from "../IconButton";

interface Props {
  title: string;
  onClose: () => void;
  tabs?: { key: string; label: string; count?: number }[];
  active?: string;
  onTab?: (key: string) => void;
  width?: number;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
}

/** Right-side panel chrome shared by search / board / members. */
export function PanelShell({ title, onClose, tabs, active, onTab, width = 340, children, headerExtra }: Props) {
  return (
    <aside className="shrink-0 h-full flex flex-col border-l border-[var(--border)] bg-[var(--bg)]" style={{ width }}>
      <div className="titlebar-drag h-[52px] shrink-0 flex items-center justify-between pl-4 pr-2 border-b border-[var(--border)]">
        <div className="font-semibold text-[14px] truncate">{title}</div>
        <div className="titlebar-nodrag flex items-center gap-1">
          {headerExtra}
          <IconButton label="닫기 (Esc)" size="sm" onClick={onClose}><X /></IconButton>
        </div>
      </div>
      {tabs && (
        <div className="flex border-b border-[var(--border)] px-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => onTab?.(t.key)}
              className={clsx("px-3 py-2 text-[13px] border-b-2 -mb-px inline-flex items-center gap-1", active === t.key ? "border-[var(--accent)] text-[var(--fg)] font-medium" : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]")}
            >
              {t.label}
              {t.count !== undefined && <span className="text-[11px] text-[var(--fg-muted)]">{t.count}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
    </aside>
  );
}

export const emptyState = (text: string) => <p className="p-8 text-center text-[12.5px] text-[var(--fg-muted)]">{text}</p>;
