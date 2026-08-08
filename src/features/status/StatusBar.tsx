// The Workbench's status bar (W7, D71, master §13.3) — one glyph + one short
// label per item, per the explicit density budget. Reuses the same two
// ambient facts `StatusConsole` (old shell) already surfaces (worker state,
// table/row/query stats) rather than building new plumbing. The kill-switch
// item is reactive/last-known only (Scope call 2, `stores/pauseSignal.ts`) —
// absent unless a surface has actually hit a `'paused'` code. A theme
// quick-toggle and a Settings tab are explicitly not built here: `theme` has
// no DOM-applying code anywhere in this codebase yet, and §13.3 marks the
// Settings tab itself as candidate scope, not a W7 commitment. The settings
// gear itself moved to `TitleBar` (V2, scope call 2).
import { useDatasetsStore, type WorkerStatus } from "../../stores/datasets";
import {
  useQueryStore,
  useQuerySession,
  type QueryStatus,
} from "../../stores/query";
import { useSettingsStore } from "../../stores/settings";
import { usePauseSignalStore } from "../../stores/pauseSignal";
import { formatBytes } from "../../lib/formatBytes";

function getWorkerStatusText(status: WorkerStatus): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "loading":
      return "Loading";
    case "compiling":
      return "Compiling";
    case "ready":
      return "Ready";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}

function getQueryTimeText(
  status: QueryStatus,
  executionTimeMs?: number,
): string {
  if (status === "running") return "query running…";
  if (status === "success" && executionTimeMs !== undefined)
    return `query ${executionTimeMs.toFixed(0)} ms`;
  return "query — ms";
}

export function StatusBar() {
  const tables = useDatasetsStore((state) => state.tables);
  const workerStatus = useDatasetsStore((state) => state.workerStatus);
  const aiMode = useSettingsStore((state) => state.aiMode);
  // Whichever session ran most recently (S5) — with the console, Pivot and N
  // query tabs all able to run, "the console's" would be the wrong answer the
  // moment a tab runs.
  const lastRunSession = useQueryStore((state) => state.lastRunSession);
  const { status: queryStatus, result: queryResult } =
    useQuerySession(lastRunSession);
  const lastPaused = usePauseSignalStore((state) => state.lastPaused);

  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);
  const totalMemoryBytes = tables.reduce((sum, t) => sum + t.memoryBytes, 0);
  const cloudPosture = aiMode === "cloud";
  const postureColor = cloudPosture ? "var(--color-active)" : "var(--color-ok)";

  return (
    <div
      data-testid="status-bar"
      className="flex flex-wrap items-center gap-4 px-[clamp(0.9rem,2vw,1.5rem)] py-2 font-mono text-[length:var(--text-sm)] text-(--color-ink-3)"
    >
      <span
        className="flex items-center gap-1.5 text-(--color-ink-2)"
        title={
          cloudPosture
            ? "AI questions may leave your browser"
            : "Nothing leaves your browser"
        }
      >
        <span
          aria-hidden="true"
          className="h-[7px] w-[7px] rounded-full"
          style={{
            background: postureColor,
            boxShadow: `0 0 0 3px color-mix(in oklab, ${postureColor} 20%, transparent)`,
          }}
        />
        {cloudPosture ? "may leave your browser" : "nothing leaves"}
      </span>
      <span>Engine: {getWorkerStatusText(workerStatus)}</span>
      <span>
        {tables.length} table{tables.length !== 1 ? "s" : ""} ×{" "}
        {totalRows.toLocaleString()} rows
      </span>
      <span>{formatBytes(totalMemoryBytes)}</span>
      <span>{getQueryTimeText(queryStatus, queryResult?.executionTimeMs)}</span>
      {lastPaused && (
        <span role="status" className="text-(--color-active)">
          Paused ({lastPaused.surface})
        </span>
      )}
    </div>
  );
}
