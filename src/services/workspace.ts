// Workspace restore and clear (S6.9 / 07b, ADR-011).
//
// Restore is deliberately engine-only: it re-registers the staged bytes into
// the fresh in-memory worker and re-creates the tables, then *reports* what
// came back. It does not touch the registry — persisting registry metadata is
// 07c's, and reconciling this report against it (restored / recoverable /
// lost) is 07d's. Anything here that populated the rail would be a second,
// provisional path 07d would then have to replace.
import {
  detectFormat,
  isFormatRejection,
  readerCall,
} from "../features/ingestion/formatPolicy";
import { quoteIdentifier, quoteLiteral } from "./ingestion";
import {
  readStagedManifest,
  readStagedBytes,
  clearStagingStorage,
  disposeStagingWorker,
} from "./opfsStaging";
import { SETTINGS_STORAGE_KEY } from "../stores/settings";

type EngineModule = typeof import("../workers/duckdb.worker");

export interface RestoredTable {
  tableName: string;
  /** Carried through so 07d can check it against the persisted registry entry — a mismatch is *lost*, not *restored*. */
  fileHash?: string;
  outcome: "restored" | "failed";
  /** Why it failed, when it did — an evicted staging file, an unreadable source, a `CREATE TABLE` that didn't take. */
  reason?: string;
}

export interface RestoreReport {
  tables: RestoredTable[];
  /** Wall-clock cost of the whole restore — the number 07b's "restoring must not be slower than re-dropping" criterion is measured against. */
  durationMs: number;
}

/**
 * Re-create every staged table in a fresh engine. Partial recovery is the
 * normal path, not the error path: one unreadable source never stops the rest,
 * and the whole thing resolves to a report rather than throwing.
 */
export async function restoreStagedTables(): Promise<RestoreReport> {
  const start = performance.now();
  const manifest = await readStagedManifest();
  if (manifest.length === 0)
    return { tables: [], durationMs: performance.now() - start };

  const engine: EngineModule = await import("../workers/duckdb.worker");
  const tables: RestoredTable[] = [];

  for (const staged of manifest) {
    const format = detectFormat(staged.fileName);
    if (isFormatRejection(format)) {
      tables.push({
        ...restoreKey(staged),
        outcome: "failed",
        reason: format.message,
      });
      continue;
    }

    const bytes = await readStagedBytes(staged.tableName);
    if (bytes === null) {
      tables.push({
        ...restoreKey(staged),
        outcome: "failed",
        // OPFS is evictable — `persist()` is denied on both engines as
        // measured (ADR-011), so this is an ordinary outcome.
        reason: "The stored copy of this table is no longer on disk.",
      });
      continue;
    }

    try {
      await engine.duckDBEngine.registerFile(staged.fileName, bytes);
      await engine.duckDBEngine.execute(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(staged.tableName)} AS SELECT * FROM ${readerCall(
          format,
          quoteLiteral(staged.fileName),
        )}`,
      );
      tables.push({ ...restoreKey(staged), outcome: "restored" });
    } catch (error) {
      tables.push({
        ...restoreKey(staged),
        outcome: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { tables, durationMs: performance.now() - start };
}

function restoreKey(staged: { tableName: string; fileHash?: string }) {
  return { tableName: staged.tableName, fileHash: staged.fileHash };
}

/** Bytes this origin currently has on disk, for the Clear control to show. Null when the browser won't say. */
export async function estimateWorkspaceBytes(): Promise<number | null> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.storage?.estimate !== "function"
  )
    return null;
  const estimate = await navigator.storage.estimate();
  return estimate.usage ?? null;
}

/**
 * Removes every `datascope-` key except settings — i.e. the persisted registry
 * metadata (07c). Matched by prefix rather than by a hard-coded list so a store
 * added later can't quietly escape the clear and leave metadata pointing at
 * bytes that are gone.
 */
function clearRegistryKeys(): void {
  if (typeof localStorage === "undefined") return;
  const doomed: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      key !== null &&
      key.startsWith("datascope-") &&
      key !== SETTINGS_STORAGE_KEY
    )
      doomed.push(key);
  }
  for (const key of doomed) localStorage.removeItem(key);
}

/**
 * "Clear workspace data" (scope call 2). The order is the whole point:
 * `removeEntry` on a file the engine still holds fails with
 * `NoModificationAllowedError` (ADR-011 build rule 3), so the DuckDB worker is
 * terminated *first*, then OPFS is emptied, then the registry keys go, then the
 * page reloads into a true cold app. The naive order produces exactly the
 * half-clear — metadata pointing at deleted bytes — that scope call 2 forbids.
 */
export async function clearWorkspaceData(
  reload: () => void = () => window.location.reload(),
): Promise<void> {
  const engine: EngineModule = await import("../workers/duckdb.worker");
  await engine.resetEngine();
  await clearStagingStorage();
  disposeStagingWorker();
  clearRegistryKeys();
  reload();
}
