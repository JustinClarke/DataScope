import type { EvalEngine } from '../../duckdb/duckdb';
import { compileEcommercePlan, executeEcommercePlan, type EcommerceEvidencePlan } from '../12-verified-claims/ecommercePipeline';
import type { CompactEvidencePacket, DatasetPassport } from './contracts';

/** § Hard stop: "Maximum twelve rows returned to the model per evidence packet." */
export const MAX_ROWS_PER_PACKET = 12;

function describeFilters(filters: EcommerceEvidencePlan['filters']): string[] {
  return filters.map(
    (filter) =>
      `${filter.column.table}.${filter.column.column} ${filter.operator === 'equals' ? 'equals' : 'does not equal'} ${String(filter.value)}`,
  );
}

function withoutTrailingLimit(sql: string): string {
  return sql.replace(/\sLIMIT\s+\d+$/i, '');
}

/**
 * executeEcommercePlan only reports whether the DB-level maxRows truncated the result, not the
 * exact source cardinality the compact-evidence contract requires. Reusing the unmodified
 * compiled SQL as a subquery avoids re-deriving the join/path logic that compileEcommercePlan
 * already owns.
 */
async function planSourceRowCount(engine: EvalEngine, plan: EcommerceEvidencePlan): Promise<number> {
  if (!plan.dimension) return 1;
  const sql = compileEcommercePlan(plan);
  const counted = await engine.execute(`SELECT COUNT(*) FROM (${withoutTrailingLimit(sql)}) AS sized`);
  return Number(counted.rows[0]?.[0] ?? 0);
}

export async function resolvePlanCandidate(
  engine: EvalEngine,
  plan: EcommerceEvidencePlan,
): Promise<{ sql: string; packet: CompactEvidencePacket }> {
  const { sql, evidence } = await executeEcommercePlan(engine, plan);
  const sourceRowCount = await planSourceRowCount(engine, plan);
  const rows = evidence.rows.slice(0, MAX_ROWS_PER_PACKET);
  const returnedRowCount = rows.length;
  return {
    sql,
    packet: {
      id: evidence.id,
      metric: evidence.metric,
      unit: evidence.unit,
      ...(evidence.dimension === undefined ? {} : { dimension: evidence.dimension }),
      filters: describeFilters(plan.filters),
      completeness: sourceRowCount > returnedRowCount ? 'truncated' : evidence.completeness,
      sourceRowCount,
      returnedRowCount,
      rows,
    },
  };
}

export function resolveMissingnessCandidate(candidateId: string, passport: DatasetPassport): CompactEvidencePacket {
  const allRows = passport.tables.flatMap((table) =>
    table.columns.map((column) => ({
      rowId: `${table.name}.${column.column}`,
      label: `${table.name}.${column.column}`,
      value: column.nullCount,
    })),
  );
  const rows = allRows.slice(0, MAX_ROWS_PER_PACKET);
  return {
    id: `evidence:${candidateId}`,
    metric: 'null_count(*)',
    unit: 'rows',
    filters: [],
    completeness: allRows.length > rows.length ? 'truncated' : 'complete',
    sourceRowCount: allRows.length,
    returnedRowCount: rows.length,
    rows,
  };
}

export function resolveJoinCoverageCandidate(candidateId: string, passport: DatasetPassport): CompactEvidencePacket {
  const allRows = passport.relationships.map((relationship, index) => ({
    rowId: `rel${index + 1}`,
    label: `${relationship.many.table}.${relationship.many.column}->${relationship.one.table}.${relationship.one.column}`,
    value: relationship.orphanCount,
  }));
  const rows = allRows.slice(0, MAX_ROWS_PER_PACKET);
  return {
    id: `evidence:${candidateId}`,
    metric: 'orphan_count(*)',
    unit: 'rows',
    filters: [],
    completeness: allRows.length > rows.length ? 'truncated' : 'complete',
    sourceRowCount: allRows.length,
    returnedRowCount: rows.length,
    rows,
  };
}

/** Derives consecutive-period deltas from an already-resolved source packet; never touches DuckDB. */
export function resolveComparePeriodsCandidate(candidateId: string, source: CompactEvidencePacket): CompactEvidencePacket {
  const ordered = source.rows
    .filter((row): row is typeof row & { order: number } => typeof row.order === 'number')
    .sort((a, b) => a.order - b.order);
  const allDeltas: Array<{ rowId: string; label: string; value: number; order: number }> = [];
  for (let index = 1; index < ordered.length; index++) {
    const from = ordered[index - 1]!;
    const to = ordered[index]!;
    if (typeof from.value !== 'number' || typeof to.value !== 'number') continue;
    allDeltas.push({
      rowId: `delta${index}`,
      label: `${from.label} to ${to.label}`,
      value: Math.round((to.value - from.value) * 100) / 100,
      order: allDeltas.length,
    });
  }
  const rows = allDeltas.slice(0, MAX_ROWS_PER_PACKET);
  return {
    id: `evidence:${candidateId}`,
    metric: `change(${source.metric})`,
    unit: source.unit,
    filters: source.filters,
    completeness: source.completeness === 'complete' && rows.length === allDeltas.length ? 'complete' : 'truncated',
    sourceRowCount: allDeltas.length,
    returnedRowCount: rows.length,
    rows,
  };
}
