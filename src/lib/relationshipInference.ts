// Cross-table foreign-key inference — the v0 seed of the Studio-arc relationship
// engine (it grows in place; the throwaway spike that de-risked it was disposable,
// this is the real build). Given the registered tables and their classified
// columns, it proposes FK-candidate edges scored from containment + cardinality
// evidence, and splits them into two honesty tiers:
//
//   - CONFIDENT (solid): a strong row-weighted containment match *and* the child
//     column's name echoes the parent (customer_id -> customers, l_partkey -> part).
//   - CANDIDATE (dashed): strong structure, but no name link — surfaced as an
//     honest "candidate, confirm me," never a confident edge. Containment and
//     coverage alone cannot tell a real renamed FK from a coincidental dense key
//     (a uniform session_id can contain a customer id more fully than the true
//     FK does), so structure without a name never earns confident.
//
// Containment is row-weighted (fraction of child rows that would join), so a
// handful of orphan rows degrades an edge's confidence rather than erasing it.
// Parent-key detection uses exact distinct counts, never an approximate sketch —
// an approximate count spuriously fails genuine keys.
//
// This module is pure: candidate generation, the SQL the evidence probes run,
// their parsers, and the scoring are all deterministic functions. Running the
// probes against the engine is services/relationships.ts's job.
import type { ClassifiedColumn, TableRegistryEntry } from '../types';

export type EdgeConfidence = 'confident' | 'candidate';

/** One proposed FK relationship, child column -> parent column. */
export interface FkEdge {
  /** Stable identity: child side plus the current parent target. */
  id: string;
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
  /** Row-weighted: fraction of non-null child values present in the parent column (0..1). */
  containment: number;
  /** Fraction of the parent's distinct values that are referenced (0..1). */
  coverage: number;
  /** Parent column's distinct/non-null ratio — 1.0 is a perfect key (0..1). */
  parentKeyUniqueness: number;
  /** Child column name links to the parent (exact match or table-stem echo). */
  nameAgreement: boolean;
  confidence: EdgeConfidence;
  /** The confidence percentage shown on the edge — equals containment, so orphans visibly degrade it. */
  confidenceScore: number;
  /** Human-readable "87% of `order.customer_id` values appear in `customer.id`". */
  evidence: string;
  /** A near-tied alternative parent, when one exists — the ambiguity the trust rules require surfaced. */
  ambiguity?: { parentTable: string; parentColumn: string; scoreGap: number };
  source: 'inferred' | 'manual';
}

/** A column pair worth probing, produced before any query runs. */
export interface FkCandidate {
  childTable: string;
  childColumn: string;
  childPhysicalType: string;
  parentTable: string;
  parentColumn: string;
  parentPhysicalType: string;
  nameAgreement: boolean;
  /** How the two columns are compared once normalized (BAR-5 type-normalization pass). */
  comparison: ComparisonMode;
}

export type ComparisonMode = 'numeric' | 'string';

// ---- Thresholds (one frozen config, mirroring the spike's single-config rule) ----

/** Parent must be a near-perfect key to be an FK target; below this it is not a PK. */
export const KEY_UNIQUENESS_MIN = 0.98;
/** Below this containment, the pair is not an edge at all. */
export const CONTAINMENT_MIN = 0.5;
/** At/above this containment *and* with name agreement, an edge is confident (solid). */
export const CONTAINMENT_SOLID = 0.95;
/**
 * A structure-only (no name link) candidate must reference at least this fraction
 * of the parent key's distinct values. Full range-containment of a tiny domain
 * (a `quantity` of 1–5 sitting inside a 1–400 id range) is coincidence, not a
 * reference; a real renamed FK covers a real share of the parent, so this guard
 * never touches one. Name-agreeing edges bypass it — the name is the evidence.
 */
export const MIN_STRUCTURE_COVERAGE = 0.1;
/** Two parent candidates for one child column scoring within this gap are a near-tie. */
export const AMBIGUITY_GAP = 0.05;
/** Defensive ceiling on probes per run so a wide many-table folder can't blow the §18 budget; name-agreeing pairs are kept first. */
export const MAX_CANDIDATES = 240;

// ---- Name agreement ----

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Rough singularization for table-stem matching — drops a trailing plural 's'/'es'. */
function singularize(name: string): string {
  const n = normalizeName(name);
  if (n.endsWith('ies') && n.length > 3) return `${n.slice(0, -3)}y`;
  if (n.endsWith('es') && n.length > 3) return n.slice(0, -2);
  if (n.endsWith('s') && n.length > 2) return n.slice(0, -1);
  return n;
}

/**
 * Does the child column name link to this parent? True when the column names
 * match exactly (`customer_id` on both sides) or the child column contains the
 * parent table's stem (`customer_id` -> `customers`, `l_partkey` -> `part`).
 * Stems shorter than three characters are ignored to avoid coincidental
 * substring hits.
 */
export function nameAgrees(childColumn: string, parentTable: string, parentColumn: string): boolean {
  const child = normalizeName(childColumn);
  if (child === normalizeName(parentColumn)) return true;

  const stem = singularize(parentTable);
  if (stem.length >= 3 && child.includes(stem)) return true;

  const full = normalizeName(parentTable);
  if (full.length >= 3 && child.includes(full)) return true;

  return false;
}

// ---- Type compatibility ----

type TypeFamily = 'int' | 'float' | 'string' | 'temporal' | 'bool' | 'other';

function typeFamily(physicalType: string): TypeFamily {
  const t = physicalType.toUpperCase();
  if (/BOOL/.test(t)) return 'bool';
  if (/INT/.test(t)) return 'int'; // BIGINT/HUGEINT/INTEGER/SMALLINT/TINYINT/UINTEGER…
  if (/DECIMAL|DOUBLE|FLOAT|REAL|NUMERIC/.test(t)) return 'float';
  if (/CHAR|VARCHAR|TEXT|STRING|UUID|BLOB/.test(t)) return 'string';
  if (/DATE|TIME|TIMESTAMP|INTERVAL/.test(t)) return 'temporal';
  return 'other';
}

/**
 * Whether two columns could hold the same key, and how to compare them.
 * Keys are integers, decimals, or strings; temporal/bool/other columns are
 * never join keys, so they yield no candidate. Numeric-vs-string is allowed
 * and bridged numerically — this is what recovers zero-padded string-vs-int
 * keys (the spike's pre-committed loss without a normalization pass).
 */
export function comparisonModeFor(childType: string, parentType: string): ComparisonMode | null {
  const c = typeFamily(childType);
  const p = typeFamily(parentType);
  const keyish = (f: TypeFamily) => f === 'int' || f === 'float' || f === 'string';
  if (!keyish(c) || !keyish(p)) return null;
  if (c === 'string' && p === 'string') return 'string';
  // Any numeric on either side (or both) compares numerically after TRY_CAST.
  return 'numeric';
}

// ---- Candidate generation ----

type ClassifiedTable = TableRegistryEntry & { columns: ClassifiedColumn[] };

function isClassified(table: TableRegistryEntry): table is ClassifiedTable {
  return Array.isArray(table.columns) && table.columns.length > 0;
}

/**
 * Exact distinct / non-null ratio from classification (`cardinality` is the
 * classifier's exact `COUNT(DISTINCT)`, not an estimate), so key-ness can be
 * read off the profile without a query. 1.0 is a perfect key.
 */
function keyUniquenessRatio(column: ClassifiedColumn, rowCount: number): number {
  if (rowCount === 0) return 0;
  const nonNull = rowCount * (1 - (column.nullPercentage ?? 0) / 100);
  if (nonNull <= 0) return 0;
  return column.cardinality / nonNull;
}

/** A column that is (near) unique — the "one" side of a relationship. */
function isNearUniqueKey(column: ClassifiedColumn, rowCount: number): boolean {
  return keyUniquenessRatio(column, rowCount) >= KEY_UNIQUENESS_MIN;
}

/**
 * A key is an identifier, not a measure. §20.6 detects keys as *near-unique
 * Identifier columns*. Two guards, because the classifier promotes any
 * near-unique column — including a coincidentally-unique `unit_price` — to
 * Identifier: the physical type must be integer or string (a float or a date is
 * never a primary key), and the semantic type must not be Quantitative (a
 * near-unique integer measure is not a key either). This is what stops one
 * table's `unit_price` from drawing a confident false edge to another's.
 */
function isKeyLikeType(column: ClassifiedColumn): boolean {
  const family = typeFamily(column.physicalType);
  if (family !== 'int' && family !== 'string') return false;
  return column.semanticType !== 'Quantitative';
}

/** A parent-key candidate: near-unique *and* identifier-like (never a measure or a date). */
function isParentKeyCandidate(column: ClassifiedColumn, rowCount: number): boolean {
  return isKeyLikeType(column) && isNearUniqueKey(column, rowCount);
}

/**
 * Enumerate the column pairs worth probing. For every table's parent-key
 * candidate P, every type-compatible column C on another table (or the same
 * table, for a self-referencing key) is a candidate C -> P. Name-agreeing pairs
 * sort first and the list is capped, so a wide folder stays within the probe
 * budget while never dropping a named FK for a coincidental one.
 */
export function generateCandidates(tables: TableRegistryEntry[]): FkCandidate[] {
  const classified = tables.filter(isClassified);
  const candidates: FkCandidate[] = [];

  for (const parent of classified) {
    const parentKeys = parent.columns.filter((c) => isParentKeyCandidate(c, parent.rowCount));
    if (parentKeys.length === 0) continue;

    for (const child of classified) {
      for (const childCol of child.columns) {
        // A child that is itself a unique key is a coincidental sequence overlap,
        // not an FK, unless its name links to the parent (a real 1:1 FK nearly
        // always shares the key name). Skip it early — no query needed.
        const childIsKey = isNearUniqueKey(childCol, child.rowCount);
        for (const parentCol of parentKeys) {
          if (child.id === parent.id && childCol.name === parentCol.name) continue; // not a self-edge on one column
          const comparison = comparisonModeFor(childCol.physicalType, parentCol.physicalType);
          if (!comparison) continue;
          const nameAgreement = nameAgrees(childCol.name, parent.tableName, parentCol.name);
          if (childIsKey && !nameAgreement) continue;
          candidates.push({
            childTable: child.tableName,
            childColumn: childCol.name,
            childPhysicalType: childCol.physicalType,
            parentTable: parent.tableName,
            parentColumn: parentCol.name,
            parentPhysicalType: parentCol.physicalType,
            nameAgreement,
            comparison,
          });
        }
      }
    }
  }

  candidates.sort((a, b) => Number(b.nameAgreement) - Number(a.nameAgreement));
  return candidates.slice(0, MAX_CANDIDATES);
}

// ---- Evidence probes (SQL) ----

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Normalized key expression for a column, per the pair's comparison mode. */
function normExpr(column: string, mode: ComparisonMode): string {
  const col = quoteIdent(column);
  return mode === 'numeric' ? `TRY_CAST(${col} AS DOUBLE)` : `TRIM(CAST(${col} AS VARCHAR))`;
}

/**
 * One query per parent-key candidate: is it actually a key, and how many
 * distinct values does it hold? Exact `count(DISTINCT)`, never approximate.
 * Cached per (table, column) by the caller since it is child-independent.
 */
export function buildParentKeySql(parentTable: string, parentColumn: string): string {
  const col = quoteIdent(parentColumn);
  return (
    `SELECT count(*) FILTER (WHERE ${col} IS NOT NULL) AS non_null, ` +
    `count(DISTINCT ${col}) AS distinct_ct ` +
    `FROM ${quoteIdent(parentTable)}`
  );
}

export interface ParentKeyStats {
  nonNull: number;
  distinctCt: number;
  uniqueness: number;
}

export function parseParentKeySql(row: Record<string, unknown> | undefined): ParentKeyStats {
  const nonNull = Number(row?.non_null ?? 0);
  const distinctCt = Number(row?.distinct_ct ?? 0);
  return { nonNull, distinctCt, uniqueness: nonNull > 0 ? distinctCt / nonNull : 0 };
}

/**
 * Containment probe for one candidate. A left semi-join of the child's
 * normalized keys against the parent's distinct normalized keys yields, in one
 * pass: how many child rows have a value, how many of those match the parent
 * (row-weighted containment), and how many *distinct* child values match
 * (coverage numerator). Uses a JOIN rather than a subquery-in-FILTER so it holds
 * across engine versions.
 */
export function buildContainmentSql(candidate: FkCandidate): string {
  const childKey = normExpr(candidate.childColumn, candidate.comparison);
  const parentKey = normExpr(candidate.parentColumn, candidate.comparison);
  return (
    `SELECT ` +
    `count(*) FILTER (WHERE c.k IS NOT NULL) AS child_non_null, ` +
    `count(*) FILTER (WHERE c.k IS NOT NULL AND p.k IS NOT NULL) AS child_matched, ` +
    `count(DISTINCT c.k) FILTER (WHERE p.k IS NOT NULL) AS distinct_referenced ` +
    `FROM (SELECT ${childKey} AS k FROM ${quoteIdent(candidate.childTable)}) c ` +
    `LEFT JOIN (SELECT DISTINCT ${parentKey} AS k FROM ${quoteIdent(candidate.parentTable)} ` +
    `WHERE ${quoteIdent(candidate.parentColumn)} IS NOT NULL) p USING (k)`
  );
}

export interface ContainmentStats {
  childNonNull: number;
  childMatched: number;
  distinctReferenced: number;
}

export function parseContainmentSql(row: Record<string, unknown> | undefined): ContainmentStats {
  return {
    childNonNull: Number(row?.child_non_null ?? 0),
    childMatched: Number(row?.child_matched ?? 0),
    distinctReferenced: Number(row?.distinct_referenced ?? 0),
  };
}

// ---- Scoring ----

function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export interface ScoredCandidate extends FkCandidate {
  containment: number;
  coverage: number;
  parentKeyUniqueness: number;
}

/**
 * Turn a candidate plus its measured evidence into a scored candidate, or
 * `null` if it fails the key/containment floor and is not an edge. Kept separate
 * from `assembleEdges` so a candidate can be scored in isolation (and tested at
 * the threshold boundaries).
 */
export function scoreCandidate(
  candidate: FkCandidate,
  containmentStats: ContainmentStats,
  keyStats: ParentKeyStats,
): ScoredCandidate | null {
  if (keyStats.uniqueness < KEY_UNIQUENESS_MIN) return null; // parent is not a key → not an FK target
  if (containmentStats.childNonNull === 0) return null; // child column is all-null → no evidence

  const containment = containmentStats.childMatched / containmentStats.childNonNull;
  if (containment < CONTAINMENT_MIN) return null; // too little overlap to be a relationship

  const coverage = keyStats.distinctCt > 0 ? containmentStats.distinctReferenced / keyStats.distinctCt : 0;
  // Structure-only candidates must reference a real share of the parent key —
  // full containment of a tiny domain inside a key's range is coincidence.
  // Name agreement is its own evidence and bypasses this.
  if (!candidate.nameAgreement && coverage < MIN_STRUCTURE_COVERAGE) return null;

  return { ...candidate, containment, coverage, parentKeyUniqueness: keyStats.uniqueness };
}

function tierFor(scored: ScoredCandidate): EdgeConfidence {
  return scored.nameAgreement && scored.containment >= CONTAINMENT_SOLID ? 'confident' : 'candidate';
}

function edgeId(childTable: string, childColumn: string, parentTable: string, parentColumn: string): string {
  return `${childTable}.${childColumn}->${parentTable}.${parentColumn}`;
}

/** The stable child-side key an override is anchored to — survives re-pointing and re-profiling. */
export function childKeyOf(edge: { childTable: string; childColumn: string }): string {
  return `${edge.childTable}.${edge.childColumn}`;
}

/**
 * Collapse scored candidates into one edge per child column (its best parent),
 * attach a near-tied runner-up as ambiguity, and label each edge's confidence
 * tier and evidence. One edge per child column: a column references one parent;
 * a second strong parent is ambiguity to disclose, not a second edge to draw.
 */
export function assembleEdges(scored: ScoredCandidate[]): FkEdge[] {
  const byChild = new Map<string, ScoredCandidate[]>();
  for (const s of scored) {
    const key = childKeyOf(s);
    const list = byChild.get(key) ?? [];
    list.push(s);
    byChild.set(key, list);
  }

  const edges: FkEdge[] = [];
  for (const group of byChild.values()) {
    // Best-scoring parent wins; a name-agreeing match outranks a bare-structure
    // one at equal containment so a coincidental dense key never displaces the
    // real named FK.
    const ranked = [...group].sort(
      (a, b) => rankScore(b) - rankScore(a),
    );
    const best = ranked[0];
    const runnerUp = ranked[1];
    const scored0 = tierFor(best);

    let evidence = `${formatPct(best.containment)} of \`${best.childTable}.${best.childColumn}\` values appear in \`${best.parentTable}.${best.parentColumn}\``;
    let ambiguity: FkEdge['ambiguity'];
    if (runnerUp) {
      const gap = rankScore(best) - rankScore(runnerUp);
      if (gap < AMBIGUITY_GAP) {
        ambiguity = { parentTable: runnerUp.parentTable, parentColumn: runnerUp.parentColumn, scoreGap: gap };
        evidence += ` — near-tie with \`${runnerUp.parentTable}.${runnerUp.parentColumn}\` (${formatPct(runnerUp.containment)}), ${gap.toFixed(2)} apart`;
      }
    }

    edges.push({
      id: edgeId(best.childTable, best.childColumn, best.parentTable, best.parentColumn),
      childTable: best.childTable,
      childColumn: best.childColumn,
      parentTable: best.parentTable,
      parentColumn: best.parentColumn,
      containment: best.containment,
      coverage: best.coverage,
      parentKeyUniqueness: best.parentKeyUniqueness,
      nameAgreement: best.nameAgreement,
      confidence: scored0,
      confidenceScore: best.containment,
      evidence,
      ambiguity,
      source: 'inferred',
    });
  }

  // Deterministic output order: confident first, then by containment.
  return edges.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'confident' ? -1 : 1;
    return b.containment - a.containment;
  });
}

/** Ranking score for picking the best parent: containment, nudged by name agreement to break structural ties. */
function rankScore(s: ScoredCandidate): number {
  return s.containment + (s.nameAgreement ? 0.001 : 0);
}

// ---- Manual overrides (survive re-profiling; re-applied over each fresh inference) ----

export interface ManualEdge {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
}

export interface RelationshipOverrides {
  /** Child-side keys whose inferred edge the user suppressed. */
  removed: string[];
  /** Child-side key -> a user-chosen parent target. */
  repointed: Record<string, { parentTable: string; parentColumn: string }>;
  /** Edges the user added by hand. */
  added: ManualEdge[];
}

export const EMPTY_OVERRIDES: RelationshipOverrides = { removed: [], repointed: {}, added: [] };

function manualEdge(childTable: string, childColumn: string, parentTable: string, parentColumn: string): FkEdge {
  return {
    id: edgeId(childTable, childColumn, parentTable, parentColumn),
    childTable,
    childColumn,
    parentTable,
    parentColumn,
    containment: 1,
    coverage: 1,
    parentKeyUniqueness: 1,
    nameAgreement: nameAgrees(childColumn, parentTable, parentColumn),
    confidence: 'confident',
    confidenceScore: 1,
    evidence: 'Set manually',
    source: 'manual',
  };
}

/**
 * Merge inferred edges with the user's overrides for display: drop suppressed
 * edges, re-point edges the user moved, and add manual edges — pruning any
 * override that references a table no longer registered. Because overrides are
 * keyed by the stable child side, re-running inference and re-applying them here
 * makes overrides survive re-profiling.
 */
export function applyOverrides(
  inferred: FkEdge[],
  overrides: RelationshipOverrides,
  liveTableNames: string[],
): FkEdge[] {
  const live = new Set(liveTableNames);
  const removed = new Set(overrides.removed);
  const result: FkEdge[] = [];

  for (const edge of inferred) {
    const key = childKeyOf(edge);
    if (removed.has(key)) continue;
    if (!live.has(edge.childTable) || !live.has(edge.parentTable)) continue;

    const repoint = overrides.repointed[key];
    if (repoint) {
      if (!live.has(repoint.parentTable)) continue;
      result.push({
        ...manualEdge(edge.childTable, edge.childColumn, repoint.parentTable, repoint.parentColumn),
        // Preserve the measured containment against the *original* target only if
        // the re-point kept it; a re-point is a user assertion, so it reads manual.
      });
    } else {
      result.push(edge);
    }
  }

  // Re-pointed child columns that had no inferred edge to begin with still take effect.
  for (const [key, target] of Object.entries(overrides.repointed)) {
    if (result.some((e) => childKeyOf(e) === key)) continue;
    if (removed.has(key)) continue;
    const [childTable, childColumn] = splitChildKey(key);
    if (!childTable || !childColumn) continue;
    if (!live.has(childTable) || !live.has(target.parentTable)) continue;
    result.push(manualEdge(childTable, childColumn, target.parentTable, target.parentColumn));
  }

  for (const edge of overrides.added) {
    if (!live.has(edge.childTable) || !live.has(edge.parentTable)) continue;
    const id = edgeId(edge.childTable, edge.childColumn, edge.parentTable, edge.parentColumn);
    if (result.some((e) => e.id === id)) continue;
    result.push(manualEdge(edge.childTable, edge.childColumn, edge.parentTable, edge.parentColumn));
  }

  return result;
}

function splitChildKey(key: string): [string | undefined, string | undefined] {
  const dot = key.indexOf('.');
  if (dot < 0) return [undefined, undefined];
  return [key.slice(0, dot), key.slice(dot + 1)];
}
