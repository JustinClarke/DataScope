import { PivotBuilder } from './PivotBuilder';
import { QueryResultsPanel } from './QueryResultsPanel';

/**
 * The ANALYZE group's "Pivot / cross-tab" destination (§13.2, D68d) —
 * promoted out of the SQL playground into its own module. `PivotBuilder`
 * still compiles into an ordinary `runQuery` call (D49: no new execution
 * path), so it shares `QueryResultsPanel` with `SqlModule` rather than a
 * second Results/History rendering.
 */
export function PivotModule() {
  return (
    <div className="flex flex-col gap-4">
      <PivotBuilder />
      <QueryResultsPanel />
    </div>
  );
}
