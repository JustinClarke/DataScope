import { PivotBuilder } from "./PivotBuilder";
import { QueryOutput } from "./QueryResultsPanel";
import { PIVOT_SESSION } from "../../stores/query";
import type { ModulePrefill } from "../../lib/threadPrefill";

interface PivotModuleProps {
  /** The Workbench tab's own initializer (W7.5) — forwarded to `PivotBuilder`. */
  prefill?: ModulePrefill;
}

/**
 * The ANALYZE group's "Pivot / cross-tab" destination (§13.2, D68d) —
 * promoted out of the SQL playground into its own module. `PivotBuilder`
 * still compiles into an ordinary `runQuery` call (D49: no new execution
 * path), so it shares the results *rendering* with the console rather than
 * growing a second one.
 *
 * S5 gives it the results *home* the deleted SQL page used to lend it: its own
 * query session. What was wrong was never the shared component — it was the
 * shared state, which meant a pivot re-run overwrote the console's results.
 * No History here: that log is the console's (S5 scope call 2).
 */
export function PivotModule({ prefill }: PivotModuleProps = {}) {
  return (
    <div className="flex flex-col gap-4">
      <PivotBuilder prefill={prefill} />
      <QueryOutput sessionId={PIVOT_SESSION} />
    </div>
  );
}
