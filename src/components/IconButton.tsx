import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label; also shown as tooltip. */
  label: string;
  active?: boolean;
  size?: "sm" | "md";
}

/** Icon-only button with a visible hover/active state so it reads as a control. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, active, size = "md", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        "inline-flex items-center justify-center rounded-md border border-transparent text-[var(--fg-muted)] transition-colors",
        "hover:bg-[var(--hover)] hover:text-[var(--fg)] active:bg-[var(--border)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
        "disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-default",
        active && "bg-[var(--accent)]/12 text-[var(--accent)]",
        size === "sm" ? "w-7 h-7 [&>svg]:w-4 [&>svg]:h-4" : "w-8 h-8 [&>svg]:w-[18px] [&>svg]:h-[18px]",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
