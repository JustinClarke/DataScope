// The Workbench's right AI pane (W7, D71, master §13.3) — ModeSwitches
// (top) + the existing AIChatModule, reused completely unchanged as "the
// pane's hero": AITurnView's planned → SQL → ran → sampled → validated →
// rendered transcript already is the D55 seam made literal. Collapsible via
// the shared layout store; collapsed state renders a thin re-expand strip and
// contributes nothing else — the pane is additive, never load-bearing.
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { ModeSwitches } from "./ModeSwitches";
import { AIChatModule } from "./AIChatModule";
import { useLayoutStore } from "../../stores/layout";

interface AIPaneProps {
  onConfigure: () => void;
}

export function AIPane({ onConfigure }: AIPaneProps) {
  const collapsed = useLayoutStore((state) => state.aiPaneCollapsed);
  const toggleAIPane = useLayoutStore((state) => state.toggleAIPane);

  if (collapsed) {
    return (
      <div className="flex h-full w-10 flex-none flex-col items-center border-l border-(--color-border) py-2">
        <button
          type="button"
          aria-label="Expand AI pane"
          onClick={toggleAIPane}
          className="text-(--color-ai-2) hover:text-(--color-ai)"
        >
          <ChevronsLeft size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-80 flex-none flex-col border-l border-(--color-border)">
      <div className="flex items-center justify-between border-b border-(--color-border) bg-(--color-chrome) px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-(--color-fg)">
          <span aria-hidden="true" className="text-(--color-ai-2)">
            ✦
          </span>
          <span>AI</span>
        </span>
        <button
          type="button"
          aria-label="Collapse AI pane"
          onClick={toggleAIPane}
          className="text-(--color-ai-2) hover:text-(--color-ai)"
        >
          <ChevronsRight size={16} aria-hidden="true" />
        </button>
      </div>
      <ModeSwitches onConfigure={onConfigure} />
      <div className="flex-1 overflow-auto p-3">
        <AIChatModule />
      </div>
    </div>
  );
}
