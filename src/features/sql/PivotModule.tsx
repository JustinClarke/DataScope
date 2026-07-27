import { PivotBuilder } from './PivotBuilder';
import { QueryResultsPanel } from './QueryResultsPanel';
import type { ModulePrefill } from '../../lib/threadPrefill';

interface PivotModuleProps {
  /** The Workbench tab's own initializer (W7.5) — forwarded to `PivotBuilder`. */
  prefill?: ModulePrefill;
}

/**
 * The ANALYZE group's "Pivot / cross-tab" destination (§13.2, D68d) —
 * promoted out of the SQL playground into its own module. `PivotBuilder`
 * still compiles into an ordinary `runQuery` call (D49: no new execution
 * path), so it shares `QueryResultsPanel` with `SqlModule` rather than a
 * second Results/History rendering.
 */
export function PivotModule({ prefill }: PivotModuleProps = {}) {
  return (
    <div className="flex flex-col gap-4">
      <PivotBuilder prefill={prefill} />
      <QueryResultsPanel />
    </div>
  );
}
