// Rehydration bootstrap (S6.9 / 07d, ADR-011).
//
// The rule is one line: **the engine is the source of truth, the registry is a
// claim.** 07b put the staged bytes back and reported what it rebuilt; 07c
// persisted the registry metadata. This asks DuckDB what actually exists, and
// reconciles every persisted entry into exactly one of restored / recoverable /
// lost — so a registry row the user can click and query, whose table does not
// exist, is unrepresentable.
//
// Partial recovery is the normal path, not the error path: nine good tables
// restore even when a tenth is gone, and nothing here throws.
import type { RestoredTable, RestoreReport } from "./workspace";
import { referencesTableName, refreshTableFromSource } from "./ingestion";
import { useDatasetsStore } from "../stores/datasets";
import { useSelectionStore } from "../stores/selection";
import { useRehydrationStore, type TableOutcome } from "../stores/rehydration";
import type { TableRegistryEntry } from "../types";

type EngineModule = typeof import("../workers/duckdb.worker");

/**
 * Reconcile the persisted registry against what the engine really holds.
 *
 * Pure, and deliberately two passes: a `derived` entry is only recoverable when
 * the tables its `generatingSql` reads are themselves back, which can't be
 * decided until every non-derived entry has an answer.
 */
export function reconcile(
  tables: TableRegistryEntry[],
  engineTableNames: string[],
  restored: RestoredTable[],
): TableOutcome[] {
  const present = new Set(engineTableNames);
  const reports = new Map(restored.map((r) => [r.tableName, r]));

  const firstPass = tables.map((table) =>
    resolveDirect(table, present, reports),
  );
  const restoredNames = new Set(
    firstPass.filter((o) => o.status === "restored").map((o) => o.tableName),
  );

  return firstPass.map((outcome, index) => {
    const table = tables[index];
    if (
      outcome.status !== "lost" ||
      table.origin !== "derived" ||
      !table.generatingSql
    )
      return outcome;
    // Its own inputs are whatever other registered tables the recorded
    // `CREATE TABLE AS` reads (§12.1) — replayable only if all of them are back.
    const inputs = tables.filter(
      (t) =>
        t.id !== table.id &&
        referencesTableName(table.generatingSql!, t.tableName),
    );
    return inputs.every((t) => restoredNames.has(t.tableName))
      ? {
          ...outcome,
          status: "recoverable",
          recovery: "replay",
          reason: "Not rebuilt yet — replay the SQL that produced it.",
        }
      : {
          ...outcome,
          reason:
            "The tables this was built from didn't come back, so it can't be rebuilt — re-drop them first.",
        };
  });
}

function resolveDirect(
  table: TableRegistryEntry,
  present: Set<string>,
  reports: Map<string, RestoredTable>,
): TableOutcome {
  const base = { tableId: table.id, tableName: table.tableName };
  const report = reports.get(table.tableName);

  // Identity before presence: a table under the right name built from the wrong
  // bytes is the one case where "it's there" is the wrong answer.
  if (
    table.fileHash !== undefined &&
    report?.fileHash !== undefined &&
    report.fileHash !== table.fileHash
  ) {
    return {
      ...base,
      status: "lost",
      reason: `The stored copy of "${table.tableName}" no longer matches the file it came from — re-drop the file.`,
    };
  }

  if (present.has(table.tableName))
    return { ...base, status: "restored", reason: null };

  // An `api` table is a re-fetch, not a restore — and a page load must never
  // fire that request off persisted state (§5.2 as much as UX).
  if (table.origin === "api" && table.sourceUrl) {
    return {
      ...base,
      status: "recoverable",
      recovery: "refetch",
      reason: "Not fetched yet — refresh it from its source.",
    };
  }

  if (table.sampled) {
    return {
      ...base,
      status: "lost",
      reason:
        "This was a sampled preview, so its rows were never stored — re-drop the file.",
    };
  }

  if (table.origin === "shared") {
    return {
      ...base,
      status: "lost",
      reason: "A shared table isn't stored — open its link again.",
    };
  }

  return {
    ...base,
    // OPFS is evictable by design (ADR-011 build rule 4), so the report's own
    // reason is usually the honest one; the fallback covers an entry the
    // restore never saw at all.
    status: "lost",
    reason:
      report?.reason ??
      `"${table.tableName}" wasn't stored on disk — re-drop the file.`,
  };
}

// Views live in `duckdb_views()`, not `duckdb_tables()` (A3). Asking only the
// latter would report every session view as lost on a refresh — and then, for a
// derived view, offer a replay that rebuilds an object already there.
async function listEngineTables(): Promise<string[]> {
  const engine: EngineModule = await import("../workers/duckdb.worker");
  const [tables, views] = await Promise.all([
    engine.duckDBEngine.execute("SELECT table_name FROM duckdb_tables()"),
    engine.duckDBEngine.execute(
      "SELECT view_name FROM duckdb_views() WHERE internal = false",
    ),
  ]);
  return [...tables.rows, ...views.rows].map((row) => String(row[0]));
}

/**
 * The load-time pass, run once after 07b's restore. Writes the outcomes and
 * degrades whatever else pointed at a table that didn't come back — selection
 * and tabs referenced tables by id, and a dangling reference to a lost table is
 * the second half of the same failure.
 */
export async function rehydrateWorkspace(
  report: RestoreReport,
): Promise<TableOutcome[]> {
  const tables = useDatasetsStore.getState().tables;
  if (tables.length === 0) return [];

  const outcomes = reconcile(tables, await listEngineTables(), report.tables);
  useRehydrationStore.getState().setOutcomes(outcomes);
  degradeSelection(outcomes);
  return outcomes;
}

/**
 * A selection slot pointing at a table that isn't queryable clears; the others
 * are left alone, since the three slots are independent by design
 * (`stores/selection.ts`). Relationship overrides are *not* touched — an
 * override whose table is gone is retained but inert (its edge simply stops
 * being produced, since the edge layer only reasons about usable table names).
 */
function degradeSelection(outcomes: TableOutcome[]): void {
  const unusable = new Set(
    outcomes.filter((o) => o.status !== "restored").map((o) => o.tableId),
  );
  if (unusable.size === 0) return;

  const selection = useSelectionStore.getState();
  const patch: Partial<{ selectedTableId: null; selectedColumn: null }> = {};
  if (selection.selectedTableId && unusable.has(selection.selectedTableId))
    patch.selectedTableId = null;
  if (
    selection.selectedColumn &&
    unusable.has(selection.selectedColumn.tableId)
  )
    patch.selectedColumn = null;
  if (Object.keys(patch).length === 0) return;

  useSelectionStore.setState({
    ...patch,
    // `lastSelectionKind` named the slot that just went away, so the inspector
    // would otherwise render its "no longer registered" fallback forever.
    lastSelectionKind: null,
  });
}

/**
 * The user-asked-for half of `recoverable` (never a page load). An `api` table
 * re-fetches through the path §7.4 already owns; a `derived` table replays its
 * recorded `CREATE TABLE AS`. Resolves to whether the table is queryable now.
 */
export async function recoverTable(tableId: string): Promise<boolean> {
  const table = useDatasetsStore
    .getState()
    .tables.find((t) => t.id === tableId);
  const outcome = useRehydrationStore.getState().outcomes[tableId];
  if (!table || outcome?.status !== "recoverable") return false;

  try {
    if (outcome.recovery === "refetch") {
      await refreshTableFromSource(tableId);
    } else {
      const engine: EngineModule = await import("../workers/duckdb.worker");
      await engine.duckDBEngine.execute(table.generatingSql!);
    }
    useRehydrationStore.getState().markRestored(tableId);
    return true;
  } catch (error) {
    // Stays recoverable — a failed recovery is a retry, not a downgrade to lost.
    useRehydrationStore
      .getState()
      .setOutcomes(
        Object.values(useRehydrationStore.getState().outcomes).map((o) =>
          o.tableId === tableId
            ? {
                ...o,
                reason: error instanceof Error ? error.message : String(error),
              }
            : o,
        ),
      );
    return false;
  }
}
