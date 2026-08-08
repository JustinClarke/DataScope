// Dataset-wide Data Quality & Health report (S2, `14-workspace-streamline/
// 02-data-quality-health.md`) — aggregates the three locally-computable
// checks (nulls, duplicates, zero-variance) across every registered table
// into one flat pass/warn report for the explorer rail's Data Quality &
// Health panel. Reuses lib/insights.ts's existing producers for detection
// (thresholds, which table/column trigger, the SQL shown on "Show SQL");
// writes its own table-qualified sentence at this aggregation layer, since
// the producers' own `description` strings are column-only — correct for
// their existing single-table callers (`InsightFeed`, `ColumnDisclosure`).
import type { TableRegistryEntry } from "../types";
import {
  buildDuplicatesProbe,
  nullPatternCandidates,
  zeroVarianceCandidates,
  type InsightCandidate,
} from "../lib/insights";

export type QualityRuleId = "null-pattern" | "duplicates" | "zero-variance";

const ALL_RULES: QualityRuleId[] = [
  "null-pattern",
  "duplicates",
  "zero-variance",
];

export interface QualityFinding {
  id: string;
  tableId: string;
  tableName: string;
  rule: QualityRuleId;
  description: string;
  sql: string;
}

export interface DatasetQualityReport {
  warnings: QualityFinding[];
  passedRules: QualityRuleId[];
}

// Same lazy-import/singleton-promise pattern services/insights.ts (and
// services/profiling.ts, services/charts.ts, services/sql.ts) already use —
// many small concurrent queries, not the SQL playground's single-query-panel
// store.
type EngineModule = typeof import("../workers/duckdb.worker");
let engineModule: Promise<EngineModule> | null = null;
function loadEngine(): Promise<EngineModule> {
  if (!engineModule) engineModule = import("../workers/duckdb.worker");
  return engineModule;
}

function toFinding(
  table: TableRegistryEntry,
  candidate: InsightCandidate,
  rule: QualityRuleId,
  description: string,
): QualityFinding {
  return {
    id: `${table.id}:${candidate.id}`,
    tableId: table.id,
    tableName: table.tableName,
    rule,
    description,
    sql: candidate.sql,
  };
}

function nullFinding(
  table: TableRegistryEntry,
  candidate: InsightCandidate,
): QualityFinding {
  const columnName = candidate.id.slice("null-pattern:".length);
  const pct = (candidate.coverage * 100).toFixed(1);
  return toFinding(
    table,
    candidate,
    "null-pattern",
    `Missing values concentrated in ${table.tableName}.${columnName} (${pct}% null).`,
  );
}

function zeroVarianceFinding(
  table: TableRegistryEntry,
  candidate: InsightCandidate,
): QualityFinding {
  const columnName = candidate.id.slice("zero-variance:".length);
  return toFinding(
    table,
    candidate,
    "zero-variance",
    `${table.tableName}.${columnName} holds a single repeated value across all ${table.rowCount.toLocaleString()} rows — zero variance.`,
  );
}

function duplicatesFinding(
  table: TableRegistryEntry,
  candidate: InsightCandidate,
): QualityFinding {
  const match = /^([\d,]+) fully duplicated rows? detected\.$/.exec(
    candidate.description,
  );
  const count = match?.[1] ?? "";
  const plural = count !== "1";
  return toFinding(
    table,
    candidate,
    "duplicates",
    `${count} fully duplicated row${plural ? "s" : ""} detected in ${table.tableName}.`,
  );
}

/**
 * Pass/warn is decided per rule, dataset-wide: a rule reports "passed" when
 * it produced zero candidates across every registered table; otherwise every
 * candidate it produced, from any table, renders under Quality Warnings.
 */
export async function loadDatasetQualityReport(
  tables: TableRegistryEntry[],
): Promise<DatasetQualityReport> {
  if (tables.length === 0) return { warnings: [], passedRules: ALL_RULES };

  const warnings: QualityFinding[] = [];
  const rulesWithFindings = new Set<QualityRuleId>();

  for (const table of tables) {
    if (!table.columns) continue;
    for (const candidate of nullPatternCandidates(
      table.columns,
      table.tableName,
    )) {
      warnings.push(nullFinding(table, candidate));
      rulesWithFindings.add("null-pattern");
    }
    for (const candidate of zeroVarianceCandidates(
      table.columns,
      table.tableName,
      table.rowCount,
    )) {
      warnings.push(zeroVarianceFinding(table, candidate));
      rulesWithFindings.add("zero-variance");
    }
  }

  const engine = await loadEngine();
  const duplicateResults = await Promise.all(
    tables.map(async (table) => {
      const probe = buildDuplicatesProbe(table.tableName, table.rowCount);
      const result = await engine.duckDBEngine.execute(probe.sql);
      return { table, candidates: probe.describe(result) };
    }),
  );
  for (const { table, candidates } of duplicateResults) {
    for (const candidate of candidates) {
      warnings.push(duplicatesFinding(table, candidate));
      rulesWithFindings.add("duplicates");
    }
  }

  const passedRules = ALL_RULES.filter((rule) => !rulesWithFindings.has(rule));
  return { warnings, passedRules };
}
