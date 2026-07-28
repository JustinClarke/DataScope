import { lazy, Suspense } from 'react';
import type { QuerySessionId } from '../../stores/query';

// The multi-MB Monaco chunk must never enter the bundle graph loaded at
// startup — `lazy()` defers the import until something actually renders an
// editor. Since S3 that boundary is the drawer console's first open (§13.3),
// and since S5 a query tab's mount is the other side of the same boundary:
// both go through this one wrapper so there is a single place the lazy import
// lives, and a session with neither open pulls nothing.
const MonacoWrapper = lazy(() => import('./MonacoWrapper'));

interface LazySqlEditorProps {
  sessionId: QuerySessionId;
  onRunQuery: () => void;
}

export function LazySqlEditor({ sessionId, onRunQuery }: LazySqlEditorProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 w-full items-center justify-center rounded-lg border border-(--color-border) text-sm text-(--color-fg-muted)">
          Loading editor…
        </div>
      }
    >
      <MonacoWrapper sessionId={sessionId} onRunQuery={onRunQuery} />
    </Suspense>
  );
}
