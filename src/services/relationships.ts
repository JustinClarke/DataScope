// Relationship-inference execution — runs the containment/key probes that
// lib/relationshipInference.ts builds, then scores and assembles the graph.
// Same lazy-import/direct-engine pattern as services/insights.ts: many small
// concurrent aggregate queries, run off the playground's single-query store.
import type { TableRegistryEntry } from '../types';
import {
  assembleEdges,
  buildContainmentSql,
  buildParentKeySql,
  generateCandidates,
  parseContainmentSql,
  parseParentKeySql,
  scoreCandidate,
  type FkEdge,
  type ParentKeyStats,
  type ScoredCandidate,
} from '../lib/relationshipInference';

type EngineModule = typeof import('../workers/duckdb.worker');
let engineModule: Promise<EngineModule> | null = null;
function loadEngine(): Promise<EngineModule> {
  if (!engineModule) engineModule = import('../workers/duckdb.worker');
  return engineModule;
}

function firstRow(result: { columnNames: string[]; rows: unknown[][] }): Record<string, unknown> | undefined {
  const row = result.rows[0];
  if (!row) return undefined;
  const record: Record<string, unknown> = {};
  result.columnNames.forEach((name, i) => {
    record[name] = row[i];
  });
  return record;
}

/**
 * Infer FK-candidate edges across the registered tables. Parent-key stats are
 * computed once per (table, column) and reused across every child that probes
 * that key, so a wide fan-in doesn't re-scan the same parent. Returns edges
 * ranked confident-first; an empty array means no candidate cleared the floor
 * (an honest "nothing found," not an error).
 */
export async function loadRelationships(tables: TableRegistryEntry[]): Promise<FkEdge[]> {
  const candidates = generateCandidates(tables);
  if (candidates.length === 0) return [];

  const engine = await loadEngine();

  // Distinct parent keys probed, deduplicated.
  const parentKeys = new Map<string, { table: string; column: string }>();
  for (const c of candidates) {
    parentKeys.set(`${c.parentTable}.${c.parentColumn}`, { table: c.parentTable, column: c.parentColumn });
  }

  const keyStats = new Map<string, ParentKeyStats>();
  await Promise.all(
    [...parentKeys].map(async ([key, { table, column }]) => {
      const result = await engine.duckDBEngine.execute(buildParentKeySql(table, column));
      keyStats.set(key, parseParentKeySql(firstRow(result)));
    }),
  );

  const scored = await Promise.all(
    candidates.map(async (candidate): Promise<ScoredCandidate | null> => {
      const stats = keyStats.get(`${candidate.parentTable}.${candidate.parentColumn}`);
      if (!stats) return null;
      const result = await engine.duckDBEngine.execute(buildContainmentSql(candidate));
      return scoreCandidate(candidate, parseContainmentSql(firstRow(result)), stats);
    }),
  );

  return assembleEdges(scored.filter((s): s is ScoredCandidate => s !== null));
}
