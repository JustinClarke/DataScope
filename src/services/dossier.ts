// Dataset Dossier data loading (§13.1, D48) — gathers the raw inputs
// lib/dossier.ts's pure producer needs: cross-table insights (reuses
// services/insights.ts, one call per table) and time coverage (reuses
// columnStats.ts's date-range + gap query, one call per Temporal column
// across every table). Same lazy-import/direct-engine pattern as
// services/profiling.ts — many small concurrent queries, not the SQL
// playground's single-query-panel store.
import type { TableRegistryEntry } from "../types";
import * as stats from "../lib/columnStats";
import type { TableInsights, TimeCoverageRow } from "../lib/dossier";
import { loadInsights } from "./insights";

type EngineModule = typeof import("../workers/duckdb.worker");
let engineModule: Promise<EngineModule> | null = null;
function loadEngine(): Promise<EngineModule> {
  if (!engineModule) engineModule = import("../workers/duckdb.worker");
  return engineModule;
}

export async function loadDossierInsights(
  tables: TableRegistryEntry[],
): Promise<TableInsights[]> {
  const classified = tables.filter(
    (
      t,
    ): t is TableRegistryEntry & {
      columns: NonNullable<TableRegistryEntry["columns"]>;
    } => Array.isArray(t.columns) && t.columns.length > 0,
  );
  const results = await Promise.all(
    classified.map(async (table) => ({
      table,
      insights: await loadInsights(
        table.tableName,
        table.columns,
        table.rowCount,
      ),
    })),
  );
  return results;
}

export async function loadTimeCoverage(
  tables: TableRegistryEntry[],
): Promise<TimeCoverageRow[]> {
  const jobs: Array<{ table: TableRegistryEntry; columnName: string }> = [];
  for (const table of tables) {
    for (const column of table.columns ?? []) {
      // A bare TIME column has no calendar date to range over — buildDateRangeSql's
      // CAST(... AS DATE) has no TIME source in DuckDB, so it would always error.
      if (
        column.semanticType === "Temporal" &&
        column.physicalType.toUpperCase() !== "TIME"
      ) {
        jobs.push({ table, columnName: column.name });
      }
    }
  }
  if (jobs.length === 0) return [];

  const engine = await loadEngine();
  const results = await Promise.all(
    jobs.map(async ({ table, columnName }) => {
      const sql = stats.buildDateRangeSql(table.tableName, columnName);
      const result = await engine.duckDBEngine.execute(sql);
      const range = stats.parseDateRange(result);
      return range ? { tableName: table.tableName, columnName, range } : null;
    }),
  );
  return results.filter((row): row is TimeCoverageRow => row !== null);
}
