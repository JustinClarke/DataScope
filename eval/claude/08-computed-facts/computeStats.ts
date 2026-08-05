// Deterministic ComputedFact builder for the computed-facts-with-data candidate
// (08-computed-facts-with-data.md, approach 08 of _implementation/_misc/_ideation/ai
// architecture experimentation/). Runs plain SQL against the full dataset — no
// model in this file — and produces the enriched fact set §1 of the doc
// specifies: not just central tendency but *shape* (deciles, concentration,
// outliers, dead columns, null structure, sentinels) plus the cross-column
// facts (variance-explained, correlation, association, dependency) that
// `StructuralFacts` cannot express at all. Every fact is auditable: its `sql`
// field is the query that produced it, and `verifyStats.ts` recomputes each
// one by a second, independent method before any model ever sees it.
//
// Reuses existing DuckDB infrastructure rather than re-deriving it:
// `quoteIdentifier` (services/ingestion.ts), `buildFrequencySql`/`parseFrequency`
// and `buildCategorySummarySql`/`parseCategorySummary` (categoricalSql.ts),
// `buildCorrelationMatrixSql`/`parseCorrelationMatrix`/`correlationPairs`
// (correlationSql.ts) — the same query shapes the product's own charts and
// insight feed already use.
import { quoteIdentifier } from '../../../src/services/ingestion';
import { buildFrequencySql, parseFrequency } from '../../../src/lib/categoricalSql';
import { buildCategorySummarySql, parseCategorySummary } from '../../../src/lib/categoricalSql';
import { buildCorrelationMatrixSql, parseCorrelationMatrix, correlationPairs } from '../../../src/lib/correlationSql';
import type { ClassifiedColumn, TableRegistryEntry } from '../../../src/types';
import type { EvalEngine } from '../../duckdb/duckdb';

export type ComputedFactKind =
  | 'aggregate' | 'distribution' | 'concentration' | 'outlier' | 'dead-column' | 'null-structure'
  | 'group-breakdown' | 'variance-explained' | 'correlation' | 'association' | 'dependency'
  | 'trend' | 'seasonality' | 'coverage-gap' | 'temporal-span' | 'top-values'
  | 'join-cardinality' | 'referential-integrity' | 'arithmetic-consistency' | 'sentinel'
  | 'domain-guess';

export interface ComputedFact {
  id: string;
  kind: ComputedFactKind;
  /** The ONLY table/column names a claim citing this fact may use. */
  entities: string[];
  /** The ONLY data values a claim citing this fact may state. */
  values: (string | number)[];
  statement: string;
  /** The query that produced it — provenance, auditable. Empty for facts read
   * off already-classified columns (dead-column via cardinality) with no new query. */
  sql: string;
}

// Same bound `insights.ts` applies to pairwise rules — a wide table shouldn't
// blow up combinatorics. Categorical columns are already capped at 15 distinct
// values by the classifier (CATEGORICAL_CARDINALITY_MAX), so a group-breakdown
// fact's value set is bounded by construction; this instead bounds how many
// *columns* of each type are considered for a pairwise fact at all.
const MAX_COLUMNS_PER_TYPE = 5;
const SENTINEL_CANDIDATES = [0, -1, 999];

function byType(columns: ClassifiedColumn[], type: ClassifiedColumn['semanticType']): ClassifiedColumn[] {
  return columns.filter((c) => c.semanticType === type).slice(0, MAX_COLUMNS_PER_TYPE);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function firstRow(rows: unknown[][]): unknown[] {
  return rows[0] ?? [];
}

/** duckdb-wasm/apache-arrow hands DATE/TIMESTAMP values back as raw
 * milliseconds-since-epoch JS numbers, not ISO strings — a bare `String(v)`
 * on `1451865600000` reads as garbage, not "2016-01-04". Every date value
 * read off a query result (not grouped/truncated by DuckDB itself) must go
 * through this before display. */
function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const ms = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number(v);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

// ---- Single-column shape ----

async function aggregateFact(
  engine: EvalEngine,
  table: TableRegistryEntry,
  col: ClassifiedColumn,
): Promise<ComputedFact | null> {
  const c = quoteIdentifier(col.name);
  const t = quoteIdentifier(table.tableName);
  const sql = `SELECT AVG(${c}) AS mean, STDDEV(${c}) AS std, MEDIAN(${c}) AS median FROM ${t} WHERE ${c} IS NOT NULL`;
  const result = await engine.execute(sql);
  const [mean, std, median] = firstRow(result.rows).map(num);
  if (mean === null || median === null) return null;

  const skewNote =
    std !== null && Math.abs(mean - median) > 0.1 * (std || 1)
      ? mean > median
        ? ' — right-skewed (mean above median)'
        : ' — left-skewed (mean below median)'
      : '';

  return {
    id: `stat:${table.tableName}.${col.name}.aggregate`,
    kind: 'aggregate',
    // "Std"/"Median" are capitalized labels the statement itself uses,
    // mid-sentence — checkCitation's extractEntities flags any such word that
    // doesn't resolve to a real schema name, so the fact's own canonical
    // phrasing self-rejects unless these are added here (same failure class
    // 03 found for "Profile" on id-exclusion facts — see closureRules.ts's
    // module comment / 03's doc bug 4).
    entities: [table.tableName, col.name, 'Std', 'Median'],
    values: [round(mean), std !== null ? round(std) : '', round(median)].filter((v) => v !== ''),
    statement: `Mean ${col.name}: ${round(mean)}${std !== null ? `, Std: ${round(std)}` : ''}, Median: ${round(median)}${skewNote}.`,
    sql,
  };
}

const DECILE_QUANTILES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

async function decileFact(
  engine: EvalEngine,
  table: TableRegistryEntry,
  col: ClassifiedColumn,
): Promise<ComputedFact | null> {
  const c = quoteIdentifier(col.name);
  const t = quoteIdentifier(table.tableName);
  const sql = `SELECT quantile_cont(${c}, [${DECILE_QUANTILES.join(', ')}]) AS deciles FROM ${t} WHERE ${c} IS NOT NULL`;
  const result = await engine.execute(sql);
  const raw = firstRow(result.rows)[0];
  // duckdb-wasm hands a LIST(DOUBLE) result back as an Arrow `Vector`, not a
  // plain array — `Array.isArray` is false on it, but it is iterable.
  const deciles = raw != null && typeof raw === 'object' ? Array.from(raw as Iterable<unknown>).map(num) : null;
  if (!deciles || deciles.length === 0 || deciles.some((d) => d === null)) return null;
  const values = deciles.map((d) => round(d as number));

  return {
    id: `stat:${table.tableName}.${col.name}.deciles`,
    kind: 'distribution',
    entities: [table.tableName, col.name],
    // "10th"/"90th" are literal digits in the statement below (percentile
    // labels, not computed values) — a faithful restatement echoes them, so
    // they need to be licensed too (same bug class as the pareto fact's "10%").
    values: [...values, 10, 90],
    statement: `${col.name} deciles (10th–90th percentile): ${values.join(', ')}.`,
    sql,
  };
}

async function outlierFact(
  engine: EvalEngine,
  table: TableRegistryEntry,
  col: ClassifiedColumn,
): Promise<ComputedFact | null> {
  const c = quoteIdentifier(col.name);
  const t = quoteIdentifier(table.tableName);
  const boundsSql = `SELECT quantile_cont(${c}, 0.25) AS q1, quantile_cont(${c}, 0.75) AS q3, MAX(${c}) AS mx FROM ${t} WHERE ${c} IS NOT NULL`;
  const boundsResult = await engine.execute(boundsSql);
  const [q1, q3, mx] = firstRow(boundsResult.rows).map(num);
  if (q1 === null || q3 === null || mx === null) return null;
  const iqr = q3 - q1;
  const bound = q3 + 1.5 * iqr;
  if (mx <= bound) return null; // no outliers above the fence

  const countSql = `SELECT COUNT(*) AS n FROM ${t} WHERE ${c} > ${bound}`;
  const countResult = await engine.execute(countSql);
  const n = num(firstRow(countResult.rows)[0]) ?? 0;
  if (n === 0) return null;

  return {
    id: `stat:${table.tableName}.${col.name}.outliers`,
    kind: 'outlier',
    // "IQR" is a capitalized abbreviation the statement itself uses, mid-sentence
    // — same fact-self-rejects-its-own-phrasing bug as "Std"/"Median" above.
    entities: [table.tableName, col.name, 'IQR'],
    // "1.5" is a literal digit in the statement (the IQR multiplier) — same
    // unlisted-threshold-constant bug as the pareto/decile facts above.
    values: [n, round(bound), round(mx), 1.5],
    statement: `${col.name}: ${n} row${n === 1 ? '' : 's'} above ${round(bound)} (1.5×IQR); max ${round(mx)}.`,
    sql: `${boundsSql}; ${countSql}`,
  };
}

async function paretoFact(
  engine: EvalEngine,
  table: TableRegistryEntry,
  col: ClassifiedColumn,
): Promise<ComputedFact | null> {
  if (col.min !== null && Number(col.min) < 0) return null; // Pareto share undefined for signed values
  const c = quoteIdentifier(col.name);
  const t = quoteIdentifier(table.tableName);
  const sql =
    `WITH ranked AS (SELECT ${c} AS v, percent_rank() OVER (ORDER BY ${c}) AS pr FROM ${t} WHERE ${c} IS NOT NULL)\n` +
    `SELECT sum(v) FILTER (WHERE pr >= 0.9) AS top_sum, sum(v) AS total_sum FROM ranked`;
  const result = await engine.execute(sql);
  const [topSum, totalSum] = firstRow(result.rows).map(num);
  if (topSum === null || totalSum === null || totalSum === 0) return null;
  const sharePct = round((topSum / totalSum) * 100, 1);

  return {
    id: `stat:${table.tableName}.${col.name}.pareto`,
    kind: 'concentration',
    entities: [table.tableName, col.name],
    // The statement itself says "top 10%" — that threshold is part of what
    // the fact states, not just the share it computed, so a faithful restatement
    // of the fact's own wording needs "10" in the licensed value set too
    // (caught live: the model echoed the fact's exact statement and was
    // rejected purely because "10" wasn't allowed).
    values: [sharePct, 10],
    statement: `The top 10% of ${col.name} values account for ${sharePct}% of all ${col.name}.`,
    sql,
  };
}

/** Frequency top-N, reused for dead-column / concentration / top-values (Categorical)
 * and sentinel detection (Quantitative) — one query per column serves all four,
 * per §1a's "compute everything, vary only what is sent" discipline. */
async function frequencyFacts(
  engine: EvalEngine,
  table: TableRegistryEntry,
  col: ClassifiedColumn,
  rowCount: number,
): Promise<ComputedFact[]> {
  // The coverage-90 and sentinel checks below need every distinct value, not
  // just a top-20 slice — a column whose 90%-coverage point or a sentinel
  // spike falls past position 20 would otherwise silently under-report (a
  // wrong `k`/miss a sentinel while still "successfully" returning a fact,
  // caught live: `customers.name` in the ecommerce fixture has cardinality 64).
  const limit = Math.min(Math.max(col.cardinality, 20), 1000);
  const sql = buildFrequencySql(table.tableName, col.name, limit);
  const result = await engine.execute(sql);
  const freq = parseFrequency(result);
  if (freq.length === 0) return [];

  const facts: ComputedFact[] = [];
  const modal = freq[0];
  const modalShare = rowCount > 0 ? modal.count / rowCount : 0;

  if (col.cardinality === 1 || modalShare > 0.99) {
    facts.push({
      id: `stat:${table.tableName}.${col.name}.dead-column`,
      kind: 'dead-column',
      // The single value belongs in both fields — see the variance-explained
      // comment above on why a category label needs both extraction paths covered.
      entities: [table.tableName, col.name, String(modal.category)],
      values: [modal.category, rowCount],
      statement:
        col.cardinality === 1
          ? `${col.name}: single value ("${modal.category}") across all ${rowCount.toLocaleString()} rows.`
          : `${col.name}: "${modal.category}" accounts for ${(modalShare * 100).toFixed(1)}% of ${rowCount.toLocaleString()} rows.`,
      sql,
    });
    return facts; // dead already covers concentration/top-values/sentinel — nothing else to add
  }

  if (col.semanticType === 'Categorical') {
    let cumulative = 0;
    let k = 0;
    for (const row of freq) {
      cumulative += row.count;
      k++;
      if (rowCount > 0 && cumulative / rowCount >= 0.9) break;
    }
    facts.push({
      id: `stat:${table.tableName}.${col.name}.concentration`,
      kind: 'concentration',
      entities: [table.tableName, col.name, String(modal.category)],
      // "90" is a literal digit in the statement (the coverage threshold) —
      // same unlisted-threshold-constant bug as the pareto/decile/outlier facts above.
      values: [modal.category, round(modalShare * 100, 1), k, 90],
      statement: `${col.name}: ${(modalShare * 100).toFixed(0)}% of rows are "${modal.category}"; ${k} distinct value${k === 1 ? '' : 's'} cover 90% of rows.`,
      sql,
    });

    const top5 = freq.slice(0, 5);
    facts.push({
      id: `stat:${table.tableName}.${col.name}.top-values`,
      kind: 'top-values',
      entities: [table.tableName, col.name, ...top5.map((r) => String(r.category))],
      values: top5.flatMap((r) => [r.category, r.count]),
      statement: `Top ${col.name} values: ${top5.map((r) => `${r.category} (${r.count})`).join(', ')}.`,
      sql,
    });
  }

  if (col.semanticType === 'Quantitative') {
    for (const sentinel of SENTINEL_CANDIDATES) {
      const hit = freq.find((r) => num(r.category) === sentinel);
      if (hit && hit.count > 0 && hit.count < rowCount) {
        facts.push({
          id: `stat:${table.tableName}.${col.name}.sentinel-${sentinel}`,
          kind: 'sentinel',
          entities: [table.tableName, col.name],
          values: [sentinel, hit.count],
          statement: `${col.name} has ${hit.count} row${hit.count === 1 ? '' : 's'} at exactly ${sentinel}.`,
          sql,
        });
      }
    }
  }

  return facts;
}

function nullStructureFact(table: TableRegistryEntry, col: ClassifiedColumn): ComputedFact | null {
  const pct = col.nullPercentage ?? 0;
  if (pct <= 0) return null;
  return {
    id: `stat:${table.tableName}.${col.name}.null-structure`,
    kind: 'null-structure',
    entities: [table.tableName, col.name],
    values: [round(pct, 1)],
    statement: `${col.name}: ${pct.toFixed(1)}% null.`,
    sql: '',
  };
}

// ---- Cross-column ----

async function varianceExplainedFact(
  engine: EvalEngine,
  table: TableRegistryEntry,
  cat: ClassifiedColumn,
  quant: ClassifiedColumn,
): Promise<ComputedFact | null> {
  const c = quoteIdentifier(cat.name);
  const q = quoteIdentifier(quant.name);
  const t = quoteIdentifier(table.tableName);
  const sql =
    `WITH base AS (SELECT ${c} AS c, ${q} AS q FROM ${t} WHERE ${c} IS NOT NULL AND ${q} IS NOT NULL),\n` +
    `stats AS (SELECT q, AVG(q) OVER () AS gm, AVG(q) OVER (PARTITION BY c) AS gm_c FROM base)\n` +
    `SELECT sum(power(q - gm, 2)) AS ss_total, sum(power(gm_c - gm, 2)) AS ss_between FROM stats`;
  const result = await engine.execute(sql);
  const [ssTotal, ssBetween] = firstRow(result.rows).map(num);
  if (ssTotal === null || ssBetween === null || ssTotal === 0) return null;
  const eta2Pct = round((ssBetween / ssTotal) * 100, 1);

  const groupSql = buildCategorySummarySql(table.tableName, cat.name, quant.name);
  const groupResult = await engine.execute(groupSql);
  const groups = parseCategorySummary(groupResult);
  const byMean = [...groups].sort((a, b) => b.mean - a.mean);
  const groupNote =
    byMean.length >= 2
      ? ` (${byMean[0].grp}: ${round(byMean[0].mean)}, ${byMean[byMean.length - 1].grp}: ${round(byMean[byMean.length - 1].mean)})`
      : '';

  return {
    id: `stat:${table.tableName}.${quant.name}.by_${cat.name}.variance-explained`,
    kind: 'variance-explained',
    // Group labels go in BOTH entities and values: a digit-shaped label
    // ("1", "3") is extracted by checkCitation as a VALUE mention, never an
    // entity (extractEntities' regex doesn't match bare digits), while a
    // capitalized string label ("Springfield") is extracted as an ENTITY —
    // covering only one side would reject a legitimate mention of the other shape.
    entities: [table.tableName, cat.name, quant.name, ...groups.map((g) => g.grp)],
    values: [eta2Pct, ...groups.map((g) => g.grp), ...groups.map((g) => round(g.mean))],
    statement: `${cat.name} explains ${eta2Pct}% of the variation in ${quant.name}${groupNote}.`,
    sql: `${sql}; ${groupSql}`,
  };
}

function groupBreakdownFact(
  table: TableRegistryEntry,
  cat: ClassifiedColumn,
  quant: ClassifiedColumn,
  groups: import('../../../src/lib/categoricalSql').CategorySummaryRow[],
  sql: string,
): ComputedFact {
  const parts = groups.map((g) => `${g.grp}: ${round(g.mean)}`);
  return {
    id: `stat:${table.tableName}.${quant.name}.by_${cat.name}.group-breakdown`,
    kind: 'group-breakdown',
    entities: [table.tableName, cat.name, quant.name, ...groups.map((g) => g.grp)],
    values: [...groups.map((g) => g.grp), ...groups.map((g) => round(g.mean))],
    statement: `Mean ${quant.name} by ${cat.name}: {${parts.join(', ')}}.`,
    sql,
  };
}

async function correlationFacts(
  engine: EvalEngine,
  table: TableRegistryEntry,
  quantCols: ClassifiedColumn[],
): Promise<ComputedFact[]> {
  if (quantCols.length < 2) return [];
  const names = quantCols.map((c) => c.name);
  const sql = buildCorrelationMatrixSql(table.tableName, names);
  const result = await engine.execute(sql);
  const matrix = parseCorrelationMatrix(result, names);
  const facts: ComputedFact[] = [];
  for (const [a, b] of correlationPairs(names)) {
    const i = names.indexOf(a);
    const j = names.indexOf(b);
    const corr = matrix.values[i][j];
    if (corr === null) continue;
    facts.push({
      id: `stat:${table.tableName}.${a}.${b}.correlation`,
      kind: 'correlation',
      entities: [table.tableName, a, b],
      values: [round(corr, 2)],
      statement: `${a}–${b} correlation: ${round(corr, 2)}.`,
      sql,
    });
  }
  return facts;
}

async function rankCorrelationFact(
  engine: EvalEngine,
  table: TableRegistryEntry,
  a: ClassifiedColumn,
  b: ClassifiedColumn,
): Promise<ComputedFact | null> {
  const ca = quoteIdentifier(a.name);
  const cb = quoteIdentifier(b.name);
  const t = quoteIdentifier(table.tableName);
  const sql =
    `WITH ranks AS (SELECT rank() OVER (ORDER BY ${ca}) AS ra, rank() OVER (ORDER BY ${cb}) AS rb\n` +
    `FROM ${t} WHERE ${ca} IS NOT NULL AND ${cb} IS NOT NULL)\n` +
    `SELECT corr(ra, rb) AS rank_corr FROM ranks`;
  const result = await engine.execute(sql);
  const rankCorr = num(firstRow(result.rows)[0]);
  if (rankCorr === null) return null;
  return {
    id: `stat:${table.tableName}.${a.name}.${b.name}.rank-correlation`,
    kind: 'correlation',
    entities: [table.tableName, a.name, b.name],
    values: [round(rankCorr, 2)],
    statement: `${a.name} and ${b.name} rank-correlate at ${round(rankCorr, 2)}.`,
    sql,
  };
}

/** Cramér's V (χ²/n) for a Categorical × Categorical pair — the contingency
 * counts come from one GROUP BY query; χ² itself is plain arithmetic over
 * those counts (deterministic, test-3-safe — no SQL statistical function
 * needed for this one). */
async function categoricalAssociationFact(
  engine: EvalEngine,
  table: TableRegistryEntry,
  a: ClassifiedColumn,
  b: ClassifiedColumn,
): Promise<ComputedFact | null> {
  const ca = quoteIdentifier(a.name);
  const cb = quoteIdentifier(b.name);
  const t = quoteIdentifier(table.tableName);
  const sql = `SELECT ${ca} AS a, ${cb} AS b, COUNT(*) AS n FROM ${t} WHERE ${ca} IS NOT NULL AND ${cb} IS NOT NULL GROUP BY 1, 2`;
  const result = await engine.execute(sql);
  if (result.rows.length === 0) return null;

  const rowVals = [...new Set(result.rows.map((r) => String(r[0])))];
  const colVals = [...new Set(result.rows.map((r) => String(r[1])))];
  if (rowVals.length < 2 || colVals.length < 2) return null;

  const counts = new Map<string, number>();
  let total = 0;
  for (const r of result.rows) {
    const key = `${r[0]} ${r[1]}`;
    const n = num(r[2]) ?? 0;
    counts.set(key, n);
    total += n;
  }
  const rowTotals = new Map<string, number>();
  const colTotals = new Map<string, number>();
  for (const rv of rowVals) {
    let s = 0;
    for (const cv of colVals) s += counts.get(`${rv} ${cv}`) ?? 0;
    rowTotals.set(rv, s);
  }
  for (const cv of colVals) {
    let s = 0;
    for (const rv of rowVals) s += counts.get(`${rv} ${cv}`) ?? 0;
    colTotals.set(cv, s);
  }

  let chi2 = 0;
  for (const rv of rowVals) {
    for (const cv of colVals) {
      const observed = counts.get(`${rv} ${cv}`) ?? 0;
      const expected = ((rowTotals.get(rv) ?? 0) * (colTotals.get(cv) ?? 0)) / total;
      if (expected > 0) chi2 += (observed - expected) ** 2 / expected;
    }
  }
  const k = Math.min(rowVals.length - 1, colVals.length - 1);
  if (k === 0 || total === 0) return null;
  const cramersV = round(Math.sqrt(chi2 / (total * k)), 2);

  const independenceNote = cramersV < 0.1 ? 'are not associated' : 'are not independent';
  return {
    id: `stat:${table.tableName}.${a.name}.${b.name}.association`,
    kind: 'association',
    // "V" (Cramér's V) is a capitalized single-letter label the statement
    // itself uses, mid-sentence — same fact-self-rejects-its-own-phrasing bug
    // as "IQR"/"Std"/"Median" above.
    entities: [table.tableName, a.name, b.name, 'V'],
    values: [cramersV],
    statement: `${a.name} and ${b.name} ${independenceNote} (V = ${cramersV}).`,
    sql,
  };
}

/** `count(DISTINCT a) = count(DISTINCT (a,b))` — a determines b when every
 * distinct `a` maps to exactly one `b`. Checked both directions. */
async function functionalDependencyFacts(
  engine: EvalEngine,
  table: TableRegistryEntry,
  a: ClassifiedColumn,
  b: ClassifiedColumn,
): Promise<ComputedFact[]> {
  const ca = quoteIdentifier(a.name);
  const cb = quoteIdentifier(b.name);
  const t = quoteIdentifier(table.tableName);
  const sql =
    `SELECT COUNT(DISTINCT ${ca}) AS da, COUNT(DISTINCT ${cb}) AS db,\n` +
    `(SELECT COUNT(*) FROM (SELECT DISTINCT ${ca}, ${cb} FROM ${t} WHERE ${ca} IS NOT NULL AND ${cb} IS NOT NULL)) AS dab\n` +
    `FROM ${t} WHERE ${ca} IS NOT NULL AND ${cb} IS NOT NULL`;
  const result = await engine.execute(sql);
  const [da, db, dab] = firstRow(result.rows).map(num);
  if (da === null || db === null || dab === null) return [];

  const facts: ComputedFact[] = [];
  if (da === dab && da > 1) {
    facts.push({
      id: `stat:${table.tableName}.${a.name}.${b.name}.dependency`,
      kind: 'dependency',
      entities: [table.tableName, a.name, b.name],
      values: [],
      statement: `${a.name} determines ${b.name} — each ${a.name} maps to exactly one ${b.name}.`,
      sql,
    });
  } else if (db === dab && db > 1) {
    facts.push({
      id: `stat:${table.tableName}.${b.name}.${a.name}.dependency`,
      kind: 'dependency',
      entities: [table.tableName, a.name, b.name],
      values: [],
      statement: `${b.name} determines ${a.name} — each ${b.name} maps to exactly one ${a.name}.`,
      sql,
    });
  } else {
    facts.push({
      id: `stat:${table.tableName}.${a.name}.${b.name}.no-dependency`,
      kind: 'dependency',
      entities: [table.tableName, a.name, b.name],
      values: [],
      statement: `${a.name} does not determine ${b.name}, and ${b.name} does not determine ${a.name}.`,
      sql,
    });
  }
  return facts;
}

// ---- Temporal ----

async function temporalSpanFact(
  engine: EvalEngine,
  table: TableRegistryEntry,
  col: ClassifiedColumn,
): Promise<ComputedFact | null> {
  const c = quoteIdentifier(col.name);
  const t = quoteIdentifier(table.tableName);
  const sql = `SELECT MIN(${c}) AS mn, MAX(${c}) AS mx FROM ${t} WHERE ${c} IS NOT NULL`;
  const result = await engine.execute(sql);
  const [mn, mx] = firstRow(result.rows);
  const minStr = toIsoDate(mn);
  const maxStr = toIsoDate(mx);
  if (minStr === null || maxStr === null) return null;
  return {
    id: `stat:${table.tableName}.${col.name}.temporal-span`,
    kind: 'temporal-span',
    entities: [table.tableName, col.name],
    values: [minStr, maxStr],
    statement: `${col.name}: ${minStr} to ${maxStr}.`,
    sql,
  };
}

async function trendFact(
  engine: EvalEngine,
  table: TableRegistryEntry,
  dateCol: ClassifiedColumn,
  quantCol: ClassifiedColumn,
): Promise<ComputedFact | null> {
  const d = quoteIdentifier(dateCol.name);
  const q = quoteIdentifier(quantCol.name);
  const t = quoteIdentifier(table.tableName);
  const sql =
    `WITH monthly AS (SELECT date_trunc('month', ${d}) AS mth, SUM(${q}) AS tot FROM ${t}\n` +
    `WHERE ${d} IS NOT NULL AND ${q} IS NOT NULL GROUP BY 1),\n` +
    `idx AS (SELECT tot, ROW_NUMBER() OVER (ORDER BY mth) AS rn FROM monthly)\n` +
    `SELECT regr_slope(tot, rn) AS slope, regr_r2(tot, rn) AS r2 FROM idx`;
  const result = await engine.execute(sql);
  const [slope, r2] = firstRow(result.rows).map(num);
  if (slope === null || r2 === null) return null;
  const r2Pct = round(r2 * 100, 0);
  return {
    id: `stat:${table.tableName}.${quantCol.name}.by_${dateCol.name}.trend`,
    kind: 'trend',
    entities: [table.tableName, dateCol.name, quantCol.name],
    values: [round(slope), r2Pct],
    statement: `${quantCol.name} moves about ${round(slope)}/month, but the trend explains only ${r2Pct}% of the variation.`,
    sql,
  };
}

async function seasonalityFact(
  engine: EvalEngine,
  table: TableRegistryEntry,
  dateCol: ClassifiedColumn,
  quantCol: ClassifiedColumn,
): Promise<ComputedFact | null> {
  const d = quoteIdentifier(dateCol.name);
  const q = quoteIdentifier(quantCol.name);
  const t = quoteIdentifier(table.tableName);
  const sql =
    `WITH base AS (SELECT EXTRACT(month FROM ${d}) AS mo, ${q} AS q FROM ${t} WHERE ${d} IS NOT NULL AND ${q} IS NOT NULL),\n` +
    `stats AS (SELECT q, AVG(q) OVER () AS gm, AVG(q) OVER (PARTITION BY mo) AS gm_c FROM base)\n` +
    `SELECT sum(power(q - gm, 2)) AS ss_total, sum(power(gm_c - gm, 2)) AS ss_between FROM stats`;
  const result = await engine.execute(sql);
  const [ssTotal, ssBetween] = firstRow(result.rows).map(num);
  if (ssTotal === null || ssBetween === null || ssTotal === 0) return null;
  const eta2Pct = round((ssBetween / ssTotal) * 100, 1);
  return {
    id: `stat:${table.tableName}.${quantCol.name}.by_month.seasonality`,
    kind: 'seasonality',
    entities: [table.tableName, dateCol.name, quantCol.name],
    values: [eta2Pct],
    statement: `Month of year explains ${eta2Pct}% of the variation in ${quantCol.name}.`,
    sql,
  };
}

async function coverageGapFact(
  engine: EvalEngine,
  table: TableRegistryEntry,
  col: ClassifiedColumn,
): Promise<ComputedFact | null> {
  const c = quoteIdentifier(col.name);
  const t = quoteIdentifier(table.tableName);
  const sql =
    `SELECT COUNT(DISTINCT date_trunc('day', ${c})) AS distinct_days,\n` +
    `date_diff('day', MIN(${c}), MAX(${c})) + 1 AS expected_days\n` +
    `FROM ${t} WHERE ${c} IS NOT NULL`;
  const result = await engine.execute(sql);
  const [distinctDays, expectedDays] = firstRow(result.rows).map(num);
  if (distinctDays === null || expectedDays === null) return null;
  const gap = expectedDays - distinctDays;
  if (gap <= 0) return null;
  return {
    id: `stat:${table.tableName}.${col.name}.coverage-gap`,
    kind: 'coverage-gap',
    entities: [table.tableName, col.name],
    values: [gap],
    statement: `${col.name} spans the expected range, but ${gap} day${gap === 1 ? '' : 's'} have no rows.`,
    sql,
  };
}

// ---- Multi-table ----

/** Heuristic parent/child detection: a shared `_id`-named column that is
 * near-unique (Identifier) on one side and repeated (not near-unique) on the
 * other — the same naming convention `datasetCapabilities.ts`'s
 * `isRepeatedEntityKey` already relies on for this app's ecommerce fixture. */
function findParentChildKeys(
  tables: TableRegistryEntry[],
): Array<{ parent: TableRegistryEntry; child: TableRegistryEntry; key: string }> {
  const out: Array<{ parent: TableRegistryEntry; child: TableRegistryEntry; key: string }> = [];
  for (const parent of tables) {
    for (const child of tables) {
      if (parent.id === child.id) continue;
      for (const pc of parent.columns ?? []) {
        if (!/_id$/i.test(pc.name)) continue;
        const cc = (child.columns ?? []).find((c) => c.name === pc.name);
        if (!cc) continue;
        const parentUnique = parent.rowCount > 0 && pc.cardinality / parent.rowCount > 0.95;
        const childRepeated = child.rowCount > 0 && cc.cardinality < child.rowCount;
        if (parentUnique && childRepeated) out.push({ parent, child, key: pc.name });
      }
    }
  }
  return out;
}

async function joinCardinalityFact(
  engine: EvalEngine,
  parent: TableRegistryEntry,
  child: TableRegistryEntry,
  key: string,
): Promise<ComputedFact | null> {
  const k = quoteIdentifier(key);
  const t = quoteIdentifier(child.tableName);
  const sql =
    `WITH counts AS (SELECT ${k}, COUNT(*) AS cnt FROM ${t} WHERE ${k} IS NOT NULL GROUP BY 1)\n` +
    `SELECT MIN(cnt) AS mn, MEDIAN(cnt) AS md, MAX(cnt) AS mx FROM counts`;
  const result = await engine.execute(sql);
  const [mn, md, mx] = firstRow(result.rows).map(num);
  if (mn === null || md === null || mx === null) return null;
  return {
    id: `stat:${parent.tableName}.${child.tableName}.${key}.join-cardinality`,
    kind: 'join-cardinality',
    entities: [parent.tableName, child.tableName, key],
    values: [mn, round(md), mx],
    statement: `Each ${parent.tableName.replace(/s$/, '')} has ${mn}–${mx} ${child.tableName}, median ${round(md)}.`,
    sql,
  };
}

async function referentialIntegrityFact(
  engine: EvalEngine,
  parent: TableRegistryEntry,
  child: TableRegistryEntry,
  key: string,
): Promise<ComputedFact | null> {
  const k = quoteIdentifier(key);
  const childTable = quoteIdentifier(child.tableName);
  const parentTable = quoteIdentifier(parent.tableName);
  const sql =
    `SELECT COUNT(*) AS n FROM ${childTable}\n` +
    `WHERE ${k} IS NOT NULL AND ${k} NOT IN (SELECT ${k} FROM ${parentTable} WHERE ${k} IS NOT NULL)`;
  const result = await engine.execute(sql);
  const n = num(firstRow(result.rows)[0]);
  if (n === null || n === 0) return null;
  return {
    id: `stat:${child.tableName}.${key}.referential-integrity`,
    kind: 'referential-integrity',
    entities: [child.tableName, parent.tableName, key],
    values: [n],
    statement: `${n} ${child.tableName} row${n === 1 ? '' : 's'} reference a ${key} absent from ${parent.tableName}.`,
    sql,
  };
}

const ARITHMETIC_TOLERANCE = 0.01;

async function arithmeticConsistencyFacts(
  engine: EvalEngine,
  table: TableRegistryEntry,
  quantCols: ClassifiedColumn[],
): Promise<ComputedFact[]> {
  if (quantCols.length > 6) return []; // bound combinatorics on unusually wide tables
  const facts: ComputedFact[] = [];
  const t = quoteIdentifier(table.tableName);
  for (const a of quantCols) {
    for (let i = 0; i < quantCols.length; i++) {
      for (let j = i + 1; j < quantCols.length; j++) {
        const b = quantCols[i];
        const cCol = quantCols[j];
        if (a.name === b.name || a.name === cCol.name) continue;
        const ca = quoteIdentifier(a.name);
        const cb = quoteIdentifier(b.name);
        const cc = quoteIdentifier(cCol.name);
        const sql =
          `SELECT COUNT(*) FILTER (WHERE ABS(${ca} - (${cb} * ${cc})) < ${ARITHMETIC_TOLERANCE} * ABS(NULLIF(${ca}, 0))) AS matches,\n` +
          `COUNT(*) AS total FROM ${t} WHERE ${ca} IS NOT NULL AND ${cb} IS NOT NULL AND ${cc} IS NOT NULL AND ${ca} != 0`;
        const result = await engine.execute(sql);
        const [matches, total] = firstRow(result.rows).map(num);
        if (matches === null || total === null || total === 0) continue;
        const fraction = matches / total;
        if (fraction < 0.9) continue;
        const exceptions = total - matches;
        facts.push({
          id: `stat:${table.tableName}.${a.name}.${b.name}.${cCol.name}.arithmetic-consistency`,
          kind: 'arithmetic-consistency',
          entities: [table.tableName, a.name, b.name, cCol.name],
          values: [round(fraction * 100, 1), exceptions],
          statement: `${a.name} equals ${b.name} × ${cCol.name} in ${round(fraction * 100, 1)}% of rows (${exceptions} exception${exceptions === 1 ? '' : 's'}).`,
          sql,
        });
      }
    }
  }
  return facts;
}

/** Computes the full enriched fact set for one dataset (one or more tables) —
 * every kind §1 of the doc specifies, run against the full table via DuckDB.
 * Compute is not the knob (§1a): every fact below is always computed;
 * `enrichedFacts.ts` decides how many make it into the prompt. */
export async function computeStats(engine: EvalEngine, tables: TableRegistryEntry[]): Promise<ComputedFact[]> {
  const facts: ComputedFact[] = [];

  for (const table of tables) {
    const columns = table.columns ?? [];
    const quantitative = byType(columns, 'Quantitative');
    const categorical = byType(columns, 'Categorical');
    const temporal = byType(columns, 'Temporal').filter((c) => c.physicalType.toUpperCase() !== 'TIME');

    for (const col of quantitative) {
      const agg = await aggregateFact(engine, table, col);
      if (agg) facts.push(agg);
      const dec = await decileFact(engine, table, col);
      if (dec) facts.push(dec);
      const out = await outlierFact(engine, table, col);
      if (out) facts.push(out);
      const pareto = await paretoFact(engine, table, col);
      if (pareto) facts.push(pareto);
      facts.push(...(await frequencyFacts(engine, table, col, table.rowCount)));
      const ns = nullStructureFact(table, col);
      if (ns) facts.push(ns);
    }

    for (const col of categorical) {
      facts.push(...(await frequencyFacts(engine, table, col, table.rowCount)));
      const ns = nullStructureFact(table, col);
      if (ns) facts.push(ns);
    }

    for (const cat of categorical) {
      for (const quant of quantitative) {
        const vf = await varianceExplainedFact(engine, table, cat, quant);
        if (vf) facts.push(vf);
        const groupSql = buildCategorySummarySql(table.tableName, cat.name, quant.name);
        const groups = parseCategorySummary(await engine.execute(groupSql));
        if (groups.length >= 2) facts.push(groupBreakdownFact(table, cat, quant, groups, groupSql));
      }
    }

    facts.push(...(await correlationFacts(engine, table, quantitative)));
    for (let i = 0; i < quantitative.length; i++) {
      for (let j = i + 1; j < quantitative.length; j++) {
        const rc = await rankCorrelationFact(engine, table, quantitative[i], quantitative[j]);
        if (rc) facts.push(rc);
      }
    }

    for (let i = 0; i < categorical.length; i++) {
      for (let j = i + 1; j < categorical.length; j++) {
        const assoc = await categoricalAssociationFact(engine, table, categorical[i], categorical[j]);
        if (assoc) facts.push(assoc);
        facts.push(...(await functionalDependencyFacts(engine, table, categorical[i], categorical[j])));
      }
    }

    for (const dateCol of temporal) {
      const span = await temporalSpanFact(engine, table, dateCol);
      if (span) facts.push(span);
      const gap = await coverageGapFact(engine, table, dateCol);
      if (gap) facts.push(gap);
      for (const quant of quantitative) {
        const trend = await trendFact(engine, table, dateCol, quant);
        if (trend) facts.push(trend);
        const season = await seasonalityFact(engine, table, dateCol, quant);
        if (season) facts.push(season);
      }
    }

    facts.push(...(await arithmeticConsistencyFacts(engine, table, quantitative)));
  }

  for (const { parent, child, key } of findParentChildKeys(tables)) {
    const jc = await joinCardinalityFact(engine, parent, child, key);
    if (jc) facts.push(jc);
    const ri = await referentialIntegrityFact(engine, parent, child, key);
    if (ri) facts.push(ri);
  }

  return facts;
}
