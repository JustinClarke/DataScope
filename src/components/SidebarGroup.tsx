import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SidebarGroupProps {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  /** Pre-formatted badge text, e.g. "Tables (3)" — the caller decides the wording. */
  badge?: string;
  children: ReactNode;
}

/**
 * One collapsible intent group in the D68d sidebar (DATA/EXPLORE/ANALYZE/
 * OUTPUT, §13.2). Expansion is controlled by the caller — auto-expand-on-
 * active-module and gate-based reveal both live in `Sidebar.tsx`, this just
 * renders whatever state it's given plus the manual toggle.
 */
export function SidebarGroup({ label, expanded, onToggle, badge, children }: SidebarGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex items-center gap-1.5 rounded px-1 py-1 text-left text-xs font-semibold tracking-wide text-(--color-fg-muted) uppercase hover:text-(--color-fg)"
      >
        {expanded ? <ChevronDown size={12} aria-hidden={true} /> : <ChevronRight size={12} aria-hidden={true} />}
        <span>{label}</span>
        {badge && <span className="ml-auto normal-case text-(--color-fg-muted)/80">{badge}</span>}
      </button>
      {expanded && <div className="flex flex-col gap-1">{children}</div>}
    </div>
  );
}
