import { type ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
}

/**
 * Accessible tooltip that displays on hover/focus.
 * Uses aria-describedby for screen readers and CSS positioning for display.
 */
export function Tooltip({ content, children }: TooltipProps) {
  const tooltipId = `tooltip-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="group relative inline-block">
      <div aria-describedby={tooltipId}>{children}</div>
      <div
        id={tooltipId}
        className="absolute left-full top-1/2 ml-2 -translate-y-1/2 z-10 whitespace-nowrap rounded bg-black px-3 py-2 text-sm text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none"
      >
        {content}
      </div>
    </div>
  );
}
