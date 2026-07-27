// Insight feed rule engine (§10 Module 1, D10, Phase 3) — deterministic,
// rule-based observations computed with plain SQL, no LLM in the loop (so the
// feed is identical in local-only mode). Two kinds of rule:
//
// - "Syntactic" rules (null pattern, ID exclusion) read numbers the profiling
//   step already computed (`ClassifiedColumn`) and need no query at all — the
//   SQL shown alongside them is illustrative, not executed.
// - "Probe" rules (concentration, change-point, outlier group, duplicates,
//   leakage) need a real aggregate query; each probe pairs its SQL with a
//   pure `describe` closure that turns the query's result into zero or more
//   candidates, so services/insights.ts only has to execute SQL and call
//   `describe` — no query-shape knowledge lives outside this file.
import type { ClassifiedColumn, QueryResult, TableRegistryEntry } from '../types';
import { buildCorrelationMatrixSql, correlationPairs } from './correlationSql';
import { buildCategorySummarySql, parseCategorySummary } from './categoricalSql';
import { formatDateCell } from './columnStats';

export type InsightRuleId =
  | 'concentration'
  | 'change-point'
  | 'outlier-group'
  | 'null-pattern'
  | 'duplicates'
  | 'leakage'
  | 'id-exclusion';

export interface InsightCandidate {
  id: string;
  rule: InsightRuleId;
  description: string;
  /** Empty for the two syntactic rules — nothing was executed to produce them. */
  sql: string;
  effectSize: number;
  coverage: number;
}

export interface InsightProbe {
  sql: string;
  describe: (result: QueryResult) => InsightCandidate[];
}

/**
 * One table paired with its insight candidates — the per-table shape the
 * Dossier assembly and the Action Broker (`rankNextActions`) both consume.
 * Defined here (upstream of both) so neither has to import the other.
 */
export interface TableInsights {
  table: TableRegistryEntry;
  insights: InsightCandidate[];
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function scoreOf(candidate: InsightCandidate): number {
  return candidate.effectSize * candidate.coverage;
}

/** Feed caps at ~10 cards (D10) — a briefing, not a dump. */
export const INSIGHT_FEED_CAP = 10;

// A wide table shouldn't blow up combinatorics (pairwise rules especially) —
// bound how many columns of each type are considered.
const MAX_COLUMNS_PER_TYPE = 5;

function byType(columns: ClassifiedColumn[], type: ClassifiedColumn['semanticType']): ClassifiedColumn[] {
  return columns.filter((c) => c.semanticType === type).slice(0, MAX_COLUMNS_PER_TYPE);
}

// ---- Null pattern (syntactic — any) ----

const NULL_PATTERN_THRESHOLD = 5;

export function nullPatternCandidates(columns: ClassifiedColumn[], tableName: string): InsightCandidate[] {
  return columns
    .filter((c) => (c.nullPercentage ?? 0) > NULL_PATTERN_THRESHOLD)
    .map((c) => {
      const pct = c.nullPercentage ?? 0;
      return {
        id: `null-pattern:${c.name}`,
        rule: 'null-pattern' as const,
        description: `Missing values concentrated in "${c.name}" (${pct.toFixed(1)}% null).`,
        sql: `SELECT COUNT(*) FILTER (WHERE ${quoteIdentifier(c.name)} IS NULL) AS null_count, COUNT(*) AS total FROM ${quoteIdentifier(tableName)}`,
        effectSize: 1,
        coverage: pct / 100,
      };
    });
}

// ---- ID exclusion (syntactic — Identifier) ----

export function idExclusionCandidates(columns: ClassifiedColumn[], tableName: string): InsightCandidate[] {
  return columns
    .filter((c) => c.semanticType === 'Identifier')
    .map((c) => ({
      id: `id-exclusion:${c.name}`,
      rule: 'id-exclusion' as const,
      description: `"${c.name}" is near-unique — excluded from analysis (override in Profile).`,
      // The exact query that decided the classification (§8's near-unique
      // identifier rule) — not re-run here since the ratio is already known
      // from ClassifiedColumn, but shown as-is so the card still honors
      // "every insight card shows the SQL that produced it".
      sql: `SELECT COUNT(DISTINCT ${quoteIdentifier(c.name)}) AS distinct_count, COUNT(*) AS total FROM ${quoteIdentifier(tableName)}`,
      effectSize: 1,
      coverage: 0.1,
    }));
}

// ---- Duplicates (probe — any) ----

export function buildDuplicatesProbe(tableName: string, rowCount: number): InsightProbe {
  const table = quoteIdentifier(tableName);
  const sql = `WITH t AS (SELECT * FROM ${table})\nSELECT (SELECT COUNT(*) FROM t) AS total, (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM t)) AS distinct_count`;
  return {
    sql,
    describe: (result) => {
      const row = result.rows[0];
      if (!row) return [];
      const total = Number(row[0] ?? 0);
      const distinctCount = Number(row[1] ?? 0);
      const duplicates = total - distinctCount;
      if (duplicates <= 0) return [];
      return [
        {
          id: 'duplicates',
          rule: 'duplicates',
          description: `${duplicates.toLocaleString()} fully duplicated row${duplicates === 1 ? '' : 's'} detected.`,
          sql,
          effectSize: 1,
          coverage: Math.min(1, (duplicates * 2) / Math.max(1, rowCount)),
        },
      ];
    },
  };
}

// ---- Concentration + outlier group (probe — Categorical × Quantitative) ----

const CONCENTRATION_MIN_SHARE = 0.3;
const OUTLIER_MIN_Z = 1.5;

function buildCatQuantProbe(
  tableName: string,
  catColumn: ClassifiedColumn,
  quantColumn: ClassifiedColumn,
  rowCount: number,
): InsightProbe {
  const sql = buildCategorySummarySql(tableName, catColumn.name, quantColumn.name);

  return {
    sql,
    describe: (result) => {
      const groups = parseCategorySummary(result);
      if (groups.length < 2) return [];

      const candidates: InsightCandidate[] = [];

      // Concentration: does a small top slice of groups (~10%, at least one)
      // account for a disproportionate share of the sum?
      const totalSum = groups.reduce((sum, g) => sum + g.total, 0);
      const k = Math.max(1, Math.round(groups.length * 0.1));
      const top = groups.slice(0, k); // already sorted desc by total
      const topSum = top.reduce((sum, g) => sum + g.total, 0);
      const topRows = top.reduce((sum, g) => sum + g.rows, 0);
      const share = totalSum !== 0 ? topSum / totalSum : 0;
      // Gate on how far the top slice's share exceeds its "fair" share (k/n
      // groups) rather than a flat floor on `share` itself — with only a
      // handful of groups, one group holding just over half the total is
      // arithmetic, not a finding (e.g. 2 groups split 51/49 always has a
      // "top 1 of 2" holding >50%). Disproportion is what's actually notable.
      const fairShare = groups.length > 0 ? k / groups.length : 0;
      const disproportion = share - fairShare;
      if (disproportion >= CONCENTRATION_MIN_SHARE) {
        const label = top.length === 1 ? `"${top[0].grp}"` : `the top ${k} "${catColumn.name}" groups`;
        candidates.push({
          id: `concentration:${catColumn.name}:${quantColumn.name}`,
          rule: 'concentration',
          description: `${label} account for ${(share * 100).toFixed(0)}% of total ${quantColumn.name}.`,
          sql,
          effectSize: Math.min(1, disproportion),
          coverage: rowCount > 0 ? topRows / rowCount : 0,
        });
      }

      // Outlier group: the group whose mean deviates most from the column's
      // overall mean, in units of the column's overall std dev.
      const overallMean = quantColumn.mean;
      const overallStdDev = quantColumn.stdDev;
      if (overallMean != null && overallStdDev != null && overallStdDev > 0) {
        let best: { grp: string; z: number; rows: number } | null = null;
        for (const g of groups) {
          const z = (g.mean - overallMean) / overallStdDev;
          if (!best || Math.abs(z) > Math.abs(best.z)) best = { grp: g.grp, z, rows: g.rows };
        }
        if (best && Math.abs(best.z) >= OUTLIER_MIN_Z) {
          candidates.push({
            id: `outlier-group:${catColumn.name}:${quantColumn.name}`,
            rule: 'outlier-group',
            description: `"${best.grp}"'s mean ${quantColumn.name} is ${Math.abs(best.z).toFixed(1)}σ ${best.z >= 0 ? 'above' : 'below'} the rest.`,
            sql,
            effectSize: Math.min(1, Math.abs(best.z) / 5),
            coverage: rowCount > 0 ? best.rows / rowCount : 0,
          });
        }
      }

      return candidates;
    },
  };
}

// ---- Change-point (probe — Temporal × Quantitative) ----

const CHANGE_POINT_MIN_PCT = 0.2;

function buildChangePointProbe(
  tableName: string,
  dateColumn: ClassifiedColumn,
  quantColumn: ClassifiedColumn,
  rowCount: number,
): InsightProbe {
  const table = quoteIdentifier(tableName);
  const dateCol = quoteIdentifier(dateColumn.name);
  const quant = quoteIdentifier(quantColumn.name);
  const sql = `SELECT date_trunc('month', ${dateCol}) AS period, SUM(${quant}) AS total, COUNT(*) AS rows FROM ${table} WHERE ${dateCol} IS NOT NULL AND ${quant} IS NOT NULL GROUP BY 1 ORDER BY 1`;

  return {
    sql,
    describe: (result) => {
      const periods = result.rows.map((row) => ({
        period: formatDateCell(row[0], 7),
        total: Number(row[1] ?? 0),
        rows: Number(row[2] ?? 0),
      }));
      if (periods.length < 2) return [];

      let best: { period: string; change: number; rows: number } | null = null;
      for (let i = 1; i < periods.length; i++) {
        const prev = periods[i - 1].total;
        const curr = periods[i].total;
        if (prev === 0) continue;
        const change = (curr - prev) / Math.abs(prev);
        if (!best || Math.abs(change) > Math.abs(best.change)) {
          best = { period: periods[i].period, change, rows: periods[i].rows };
        }
      }
      if (!best || Math.abs(best.change) < CHANGE_POINT_MIN_PCT) return [];

      return [
        {
          id: `change-point:${dateColumn.name}:${quantColumn.name}`,
          rule: 'change-point',
          description: `${quantColumn.name} ${best.change >= 0 ? 'rose' : 'dropped'} ${Math.abs(best.change * 100).toFixed(0)}% in ${best.period} — largest period-over-period move.`,
          sql,
          effectSize: Math.min(1, Math.abs(best.change)),
          coverage: rowCount > 0 ? best.rows / rowCount : 0,
        },
      ];
    },
  };
}

// ---- Leakage (probe — ≥2 Quantitative) ----

const LEAKAGE_MIN_CORR = 0.9;

function buildLeakageProbe(tableName: string, quantColumns: ClassifiedColumn[]): InsightProbe | null {
  if (quantColumns.length < 2) return null;

  const names = quantColumns.map((c) => c.name);
  const pairs = correlationPairs(names);
  const sql = buildCorrelationMatrixSql(tableName, names);

  return {
    sql,
    describe: (result) => {
      const row = result.rows[0] ?? [];
      const candidates: InsightCandidate[] = [];
      pairs.forEach(([a, b], i) => {
        const corr = row[i] == null ? null : Number(row[i]);
        if (corr == null || !Number.isFinite(corr)) return;
        if (Math.abs(corr) < LEAKAGE_MIN_CORR) return;
        candidates.push({
          id: `leakage:${a}:${b}`,
          rule: 'leakage',
          description: `"${a}" and "${b}" correlate at ${corr.toFixed(3)} — possible target leakage.`,
          sql,
          effectSize: Math.abs(corr),
          coverage: 1,
        });
      });
      return candidates;
    },
  };
}

/**
 * Every SQL-driven probe worth running for one table. Callers execute each
 * probe's SQL and pass the result to its `describe` closure; this function
 * does no I/O itself.
 */
export function buildInsightProbes(tableName: string, columns: ClassifiedColumn[], rowCount: number): InsightProbe[] {
  const categorical = byType(columns, 'Categorical');
  const quantitative = byType(columns, 'Quantitative');
  // A bare TIME column has no calendar date component — date_trunc('month', ...)
  // has no TIME overload in DuckDB, so it would always error; exclude it from
  // the change-point probe's date-axis candidates.
  const temporal = byType(columns, 'Temporal').filter((c) => c.physicalType.toUpperCase() !== 'TIME');

  const probes: InsightProbe[] = [];

  for (const cat of categorical) {
    for (const quant of quantitative) probes.push(buildCatQuantProbe(tableName, cat, quant, rowCount));
  }
  for (const date of temporal) {
    for (const quant of quantitative) probes.push(buildChangePointProbe(tableName, date, quant, rowCount));
  }

  const leakageProbe = buildLeakageProbe(tableName, quantitative);
  if (leakageProbe) probes.push(leakageProbe);

  if (columns.length > 0) probes.push(buildDuplicatesProbe(tableName, rowCount));

  return probes;
}

/** Rank all candidates by effect size × coverage and cap at ~10 (D10). */
export function rankInsights(candidates: InsightCandidate[]): InsightCandidate[] {
  return [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, INSIGHT_FEED_CAP);
}
