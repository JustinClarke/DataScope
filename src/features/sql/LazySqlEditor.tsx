import { lazy, Suspense } from "react";
import type { QuerySessionId } from "../../stores/query";

// The multi-MB Monaco chunk must never enter the bundle graph loaded at
// startup — `lazy()` defers the import until something actually renders an
// editor. Since S6.5 that boundary is the drawer's first open (§13.3), and a
// query tab's mount is the other side of the same boundary: both go through
// this one wrapper so there is a single place the lazy import lives, and a
// session that opens neither pulls nothing.
const MonacoWrapper = lazy(() => import("./MonacoWrapper"));

interface LazySqlEditorProps {
  sessionId: QuerySessionId;
  onRunQuery: () => void;
  /** Fill the parent rather than the standalone surfaces' fixed height (S6.5). */
  fillHeight?: boolean;
}

export function LazySqlEditor({
  sessionId,
  onRunQuery,
  fillHeight = false,
}: LazySqlEditorProps) {
  return (
    <Suspense
      fallback={
        // Carries the editor region's own height and a surface token, so the
        // chunk arriving neither jumps the layout nor flashes an untokened
        // rectangle into the HUD's register.
        <div
          data-testid="sql-editor-loading"
          className={`flex w-full items-center justify-center rounded-lg border border-(--color-border) bg-(--color-elev) text-sm text-(--color-fg-muted) ${
            fillHeight ? "h-full" : "h-64"
          }`}
        >
          Loading editor…
        </div>
      }
    >
      <MonacoWrapper
        sessionId={sessionId}
        onRunQuery={onRunQuery}
        fillHeight={fillHeight}
      />
    </Suspense>
  );
}
