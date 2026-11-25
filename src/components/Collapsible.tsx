import type { ReactNode } from "react";

/** Animates its height between 0 and its content (CSS grid 0fr/1fr, see `.collapsible` in index.css). Children stay mounted. */
export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="collapsible" data-open={open} aria-hidden={!open} inert={!open}>
      <div className="collapsible-inner">{children}</div>
    </div>
  );
}
