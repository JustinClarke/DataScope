// Dataset Dossier assembly (§13.1, D48) — the post-ingest landing view.
// Pure data-shaping only: turns already-computed profile/classification/
// insight output into a ViewSpec (D55). No engine calls happen here — the
// service layer (services/dossier.ts) gathers the raw inputs first.
import type {
  DatasetVerdict,
  FactRef,
  TableRegistryEntry,
  ViewSpec,
} from "../types";
import type { DateRangeStats } from "./columnStats";
import type { InsightCandidate, TableInsights } from "./insights";
import type { FkEdge } from "./relationshipInference";
import { scoreOf } from "./insights";
import { INTEREST_FLOOR, rankNextActions, schemaFact } from "./capabilities";
import { VIEWSPEC_VERSION } from "./viewspec";

export type { TableInsights };

export interface TimeCoverageRow {
  tableName: string;
  columnName: string;
  range: DateRangeStats;
}

// ---- Hero: table grid (the D24 graph-cut variant) ----

export interface SharedColumnRef {
  column: string;
  otherTable: string;
}

/**
 * Column names this table shares (by exact name) with any other table in the
 * same set — the "shares `customer_id` with orders" line the D24 hedge calls
 * for. Symmetric by construction (if A shares with B, B shares with A), each
 * direction computed independently so a table naming another twice (two
 * shared columns) still gets one line per column, not per table.
 */
export function sharedColumnsFor(
  table: TableRegistryEntry,
  allTables: TableRegistryEntry[],
): SharedColumnRef[] {
  if (!table.columns) return [];
  const others = allTables.filter((t) => t.id !== table.id);
  const refs: SharedColumnRef[] = [];
  for (const column of table.columns) {
    for (const other of others) {
      if (other.columns?.some((c) => c.name === column.name)) {
        refs.push({ column: column.name, otherTable: other.tableName });
      }
    }
  }
  return refs;
}

export function keyColumnsFor(table: TableRegistryEntry): string[] {
  return (table.columns ?? [])
    .filter((c) => c.semanticType === "Identifier")
    .map((c) => c.name);
}

// ---- Quality headline — positives-only, above the fold ----

const QUALITY_RULES: InsightCandidate["rule"][] = [
  "duplicates",
  "null-pattern",
  "leakage",
];
const QUALITY_HEADLINE_CAP = 3;

/**
 * The short "Worth knowing" line — top data-quality findings only
 * (duplicates / null concentration / leakage), never the broader "interesting
 * pattern" rules (concentration, outlier-group, change-point), which belong
 * to the fuller Top Insights band below the fold. Positives-only: an empty
 * array here means the caller omits the panel entirely, never render "no
 * issues found" (the same silence-over-false-clean rule D46 states for
 * sensitive columns applies to any quality all-clear claim).
 */
export function buildQualityHeadlineItems(
  tableInsights: TableInsights[],
): string[] {
  const candidates = tableInsights.flatMap((ti) =>
    ti.insights.filter((i) => QUALITY_RULES.includes(i.rule)),
  );
  return [...candidates]
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, QUALITY_HEADLINE_CAP)
    .map((c) => c.description);
}

// The fuller ranked-action list is no longer built here — it is the render of
// the §9 Action Broker's `rankNextActions` (D68a, lib/capabilities.ts), which
// routes each action to the *real* module that answers the finding (a chart, a
// correlation matrix, the SQL playground) rather than looping every step back
// into "profile again." `buildDatasetVerdict` below trims its output to the
// tier-1 top-3; `buildDossierViewSpec` consumes that.

// ---- Top insights — the fuller band, below the fold ----

const TOP_INSIGHTS_CAP = 10;

export interface DossierInsightRow {
  tableName: string;
  description: string;
  rule: InsightCandidate["rule"];
  sql: string;
}

export function buildTopInsightRows(
  tableInsights: TableInsights[],
): DossierInsightRow[] {
  const all = tableInsights.flatMap((ti) =>
    ti.insights.map((insight) => ({ ti, insight })),
  );
  return all
    .sort((a, b) => scoreOf(b.insight) - scoreOf(a.insight))
    .slice(0, TOP_INSIGHTS_CAP)
    .map(({ ti, insight }) => ({
      tableName: ti.table.tableName,
      description: insight.description,
      rule: insight.rule,
      sql: insight.sql,
    }));
}

// ---- ViewSpec producer ----

export interface DossierInput {
  datasetLabel: string;
  tables: TableRegistryEntry[];
  tableInsights: TableInsights[];
  timeCoverage: TimeCoverageRow[];
  profiledAt: string;
  /** Inferred FK edges (D24). Passed only when the join graph is enabled and found edges; empty/absent → the table-grid hedge. */
  relationships?: FkEdge[];
}

function totalRows(tables: TableRegistryEntry[]): number {
  return tables.reduce((sum, t) => sum + t.rowCount, 0);
}

function totalBytes(tables: TableRegistryEntry[]): number {
  return tables.reduce((sum, t) => sum + t.memoryBytes, 0);
}

// ---- Tier-1 Verdict (D68c) ----

const VERDICT_ACTIONS_CAP = 3;

function latestSnapshot(tables: TableRegistryEntry[]): string {
  return tables.reduce(
    (latest, t) => (t.createdAt > latest ? t.createdAt : latest),
    tables[0]?.createdAt ?? "",
  );
}

/**
 * The Verdict's one headline fact (D68c). The top candidate by §9 interest
 * score across *every* insight — not just the ones `rankNextActions` could
 * route to a module, since a quality note like `null-pattern` carries no
 * route but is still exactly the kind of fact worth leading with. `id-exclusion`
 * is the one rule excluded even here (not just from routing): it is a
 * classification housekeeping note ("X is near-unique — excluded from
 * analysis"), scores non-trivially on near-every real dataset since most
 * tables carry an id column, and would otherwise win the headline on datasets
 * with a genuinely more interesting story — the exact confidently-banal
 * headline D68c exists to prevent. Below the interest floor, no candidate is
 * trustworthy enough to headline: returns the honest structural fact instead
 * ("N tables · rows · no single dominant finding — here's the structure"),
 * never a manufactured headline. When several candidates tie for the top
 * score, a quality-risk rule (duplicates / null-pattern / leakage) wins — the
 * D23 trust gate.
 */
export function selectHeadlineFact(
  tables: TableRegistryEntry[],
  tableInsights: TableInsights[],
): FactRef {
  const snapshot = latestSnapshot(tables);
  const sampled = tables.some((t) => t.sampled);

  const candidates = tableInsights
    .flatMap((ti) => ti.insights.map((insight) => ({ ti, insight })))
    .filter((c) => c.insight.rule !== "id-exclusion");
  const topScore = candidates.reduce(
    (max, c) => Math.max(max, scoreOf(c.insight)),
    0,
  );

  if (candidates.length === 0 || topScore < INTEREST_FLOOR) {
    const tableCount = tables.length;
    const rows = totalRows(tables);
    return schemaFact(
      `${tableCount} table${tableCount === 1 ? "" : "s"} · ${rows.toLocaleString()} rows · no single dominant finding — here's the structure.`,
      snapshot,
      sampled,
    );
  }

  const atTop = candidates.filter((c) => scoreOf(c.insight) === topScore);
  const winner =
    atTop.find((c) => QUALITY_RULES.includes(c.insight.rule)) ?? atTop[0];

  return {
    statement: winner.insight.description,
    sql: winner.insight.sql,
    snapshot: winner.ti.table.createdAt,
    confidence: winner.ti.table.sampled ? "medium" : "high",
    provenance: "insight-rule",
  };
}

/**
 * What one row of the dataset's largest table represents — read off its
 * classified columns, no query run. A single Identifier column names the
 * grain directly; zero or several leave the count as the honest fallback
 * rather than guessing which one is the real key.
 */
function describeGrain(table: TableRegistryEntry | null): string {
  if (!table) return "No tables loaded.";
  const ids = keyColumnsFor(table);
  if (ids.length === 1) return `${table.tableName}: one row per ${ids[0]}`;
  return `${table.tableName}: ${table.rowCount.toLocaleString()} rows`;
}

/** The largest table's own date-coverage span, or the first available one if it has none. */
function describeTimeSpan(
  timeCoverage: TimeCoverageRow[],
  grainTable: TableRegistryEntry | null,
): string | undefined {
  if (timeCoverage.length === 0) return undefined;
  const row =
    (grainTable &&
      timeCoverage.find((r) => r.tableName === grainTable.tableName)) ??
    timeCoverage[0];
  return `${row.range.earliest} – ${row.range.latest}`;
}

/**
 * The tier-1 producer (D68c) — identity + the one headline fact + the top-3
 * ranked actions, the whole payload the Verdict screen needs and nothing
 * more (rows-free, per §5). `buildDossierViewSpec` slices this into the
 * `identity-band` and `verdict` panels; nothing else in the Dossier consumes
 * this shape directly.
 */
export function buildDatasetVerdict(input: DossierInput): DatasetVerdict {
  const { datasetLabel, tables, tableInsights, timeCoverage, profiledAt } =
    input;
  const grainTable = largestTable(tables);

  return {
    identity: {
      datasetLabel,
      tableCount: tables.length,
      totalRows: totalRows(tables),
      totalBytes: totalBytes(tables),
      profiledAt,
    },
    headlineFact: selectHeadlineFact(tables, tableInsights),
    grain: describeGrain(grainTable),
    timeSpan: describeTimeSpan(timeCoverage, grainTable),
    actions: rankNextActions(tables, tableInsights).slice(
      0,
      VERDICT_ACTIONS_CAP,
    ),
  };
}

/**
 * The deterministic ViewSpec producer (D55/D56) — the Dossier's assembly,
 * emitted as versioned JSON panels rather than JSX. componentIds come only
 * from the fixed registry (viewspec.ts); props are plain, JSON-serializable
 * data — no callbacks, no React nodes, so nothing here could "execute model
 * output" even in error. Interaction wiring (click handlers) is supplied by
 * the renderer from the host app, never carried in the spec itself.
 *
 * When the Join Graph (D24) is enabled and has inferred edges, the
 * `hero-join-graph` thumbnail leads and the table grid demotes to sit beneath
 * it — never disappearing, so a graph with only dashed candidates still leaves
 * the structural grid in place. With the graph cut (or no edges found) only the
 * table grid renders, exactly as before this item.
 */
export function buildDossierViewSpec(input: DossierInput): ViewSpec {
  const { tables, tableInsights, timeCoverage, relationships } = input;

  const hasGraph = Array.isArray(relationships) && relationships.length > 0;
  const verdict = buildDatasetVerdict(input);

  const panels: ViewSpec["panels"] = [
    {
      componentId: "identity-band",
      tier: 1,
      props: {
        ...verdict.identity,
        grain: verdict.grain,
        timeSpan: verdict.timeSpan,
      },
    },
    {
      componentId: "verdict",
      tier: 1,
      props: {
        headlineFact: verdict.headlineFact,
        actions: verdict.actions,
      },
    },
  ];

  if (hasGraph) {
    panels.push({
      componentId: "hero-join-graph",
      tier: 2,
      props: {
        nodes: tables.map((t) => ({
          tableName: t.tableName,
          rowCount: t.rowCount,
        })),
        edges: relationships,
      },
    });
  }

  panels.push({
    componentId: "hero-table-grid",
    tier: 2,
    props: {
      tables: tables.map((t) => ({
        id: t.id,
        tableName: t.tableName,
        rowCount: t.rowCount,
        columnCount: t.columnCount,
        keyColumns: keyColumnsFor(t),
        sharedWith: sharedColumnsFor(t, tables),
      })),
    },
  });

  panels.push({
    componentId: "table-strip",
    tier: 2,
    props: {
      tables: tables.map((t) => ({
        id: t.id,
        tableName: t.tableName,
        rowCount: t.rowCount,
      })),
    },
  });

  const qualityItems = buildQualityHeadlineItems(tableInsights);
  if (qualityItems.length > 0) {
    panels.push({
      componentId: "quality-headline",
      tier: 2,
      props: { items: qualityItems },
    });
  }

  if (timeCoverage.length > 0) {
    panels.push({
      componentId: "time-coverage",
      tier: 2,
      props: {
        rows: timeCoverage.map((row) => ({
          tableName: row.tableName,
          columnName: row.columnName,
          earliest: row.range.earliest,
          latest: row.range.latest,
          gapDescription: row.range.gapDescription,
        })),
      },
    });
  }

  const topInsights = buildTopInsightRows(tableInsights);
  if (topInsights.length > 0) {
    panels.push({
      componentId: "top-insights",
      tier: 3,
      props: { insights: topInsights },
    });
  }

  // No `sensitive-columns` panel in v0 (D46) — the detector is v0.5; omitting
  // the panel entirely is the silence the positives-only rule requires,
  // never an emitted "0 flagged" panel.

  return { viewspecVersion: VIEWSPEC_VERSION, panels };
}

export function largestTable(
  tables: TableRegistryEntry[],
): TableRegistryEntry | null {
  if (tables.length === 0) return null;
  return [...tables].sort((a, b) => b.rowCount - a.rowCount)[0];
}
