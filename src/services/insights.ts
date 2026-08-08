// Insight feed execution (§10 Module 1, D10, Phase 3) — runs the SQL probes
// lib/insights.ts builds, combines their results with the syntactic (no-query)
// rules, and ranks the total set. Same lazy-import/direct-engine pattern as
// services/profiling.ts, for the same reason (many small concurrent queries,
// not the SQL playground's single-query-panel store).
import type { ClassifiedColumn } from "../types";
import {
  buildInsightProbes,
  idExclusionCandidates,
  nullPatternCandidates,
  rankInsights,
  type InsightCandidate,
} from "../lib/insights";

type EngineModule = typeof import("../workers/duckdb.worker");
let engineModule: Promise<EngineModule> | null = null;
function loadEngine(): Promise<EngineModule> {
  if (!engineModule) engineModule = import("../workers/duckdb.worker");
  return engineModule;
}

export async function loadInsights(
  tableName: string,
  columns: ClassifiedColumn[],
  rowCount: number,
): Promise<InsightCandidate[]> {
  const syntactic = [
    ...nullPatternCandidates(columns, tableName),
    ...idExclusionCandidates(columns, tableName),
  ];

  const probes = buildInsightProbes(tableName, columns, rowCount);
  if (probes.length === 0) return rankInsights(syntactic);

  const engine = await loadEngine();
  const results = await Promise.all(
    probes.map((probe) =>
      engine.duckDBEngine
        .execute(probe.sql)
        .then((result) => probe.describe(result)),
    ),
  );

  return rankInsights([...syntactic, ...results.flat()]);
}
