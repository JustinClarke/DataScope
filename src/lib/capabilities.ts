// Capabilities broker — the second half of profiling, run over the
// ClassifiedColumn[] each registered table carries. It decides which analysis
// modules the current data can actually support, so the shell never offers an
// option the columns can't feed (a correlation matrix with one numeric column,
// a time series with no date axis). Pure and deterministic: same tables in,
// same capabilities out.
//
// Multi-table input is evaluated over the UNION of every registered table's
// classified columns — per-table classification in, one merged verdict out.
// Boolean flags only ever count columns, so the union is a flat tally; the
// column-reference arrays additionally qualify each name by its table once more
// than one table contributes columns, so a name shared across tables
// (`customer_id` in both `customers` and `orders`) stays unambiguous in the
// dropdowns these arrays pre-populate. A single contributing table keeps bare
// names — there is nothing to disambiguate against. Tables not yet classified
// (no `columns`) contribute nothing rather than erroring.
import type {
  ClassifiedColumn,
  DataCapabilities,
  FactRef,
  RankedAction,
  SemanticType,
  TableRegistryEntry,
  ThreadConfig,
} from "../types";
import type { SidebarModule } from "../stores/ui";
import type {
  InsightCandidate,
  InsightRuleId,
  TableInsights,
} from "./insights";
import { scoreOf } from "./insights";

type ClassifiedTable = TableRegistryEntry & { columns: ClassifiedColumn[] };

function hasClassifiedColumns(
  table: TableRegistryEntry,
): table is ClassifiedTable {
  return Array.isArray(table.columns) && table.columns.length > 0;
}

/**
 * Merge the classified columns of every registered table into one
 * `DataCapabilities` verdict. Unclassified tables are skipped; column-reference
 * arrays are table-qualified (`tableName.columnName`) only when two or more
 * tables contribute columns, and bare (`columnName`) otherwise.
 */
export function evaluateCapabilities(
  tables: TableRegistryEntry[],
): DataCapabilities {
  const classifiedTables = tables.filter(hasClassifiedColumns);

  // A name only needs its table prefix when another table could carry the same
  // name — i.e. once at least two tables contribute columns.
  const qualify = classifiedTables.length >= 2;

  const refsByType: Record<SemanticType, string[]> = {
    Quantitative: [],
    Categorical: [],
    Temporal: [],
    Textual: [],
    Identifier: [],
  };

  for (const table of classifiedTables) {
    for (const column of table.columns) {
      const reference = qualify
        ? `${table.tableName}.${column.name}`
        : column.name;
      refsByType[column.semanticType].push(reference);
    }
  }

  const numeric = refsByType.Quantitative;
  const categorical = refsByType.Categorical;
  const temporal = refsByType.Temporal;
  const textual = refsByType.Textual;
  const identifiers = refsByType.Identifier;

  return {
    canDoDescriptiveStats: numeric.length >= 1,
    canDoTimeSeries: temporal.length >= 1 && numeric.length >= 1,
    canDoCorrelation: numeric.length >= 2,
    canDoDistribution: numeric.length >= 1,
    canDoCategoricalBreakdown: categorical.length >= 1,

    canDoKMeans: numeric.length >= 2,
    canDoRegression: numeric.length >= 2,
    canDoClassification:
      categorical.length >= 1 &&
      (numeric.length >= 1 || categorical.length >= 2),
    canDoNLP: textual.length >= 1,

    numericColumns: numeric,
    categoricalColumns: categorical,
    dateColumns: temporal,
    textColumns: textual,
    identifierColumns: identifiers,
  };
}

// ---- Action Broker — rankNextActions (§9, D68a) ----
//
// The translator from *affords* to *do next*: `evaluateCapabilities` answers
// what analysis the data supports; this answers what is worth doing next and
// where it happens. It joins broker legality with the D10 insight
// interestingness score and emits pre-configured destinations with the
// motivating fact attached — the deterministic producer of the routing layer,
// no LLM. §13.1's "suggested next steps" band is this function's render.

/**
 * Interest floor (D68c). A candidate scoring below this is too weak to headline
 * an action; the ranker stops drawing insight-driven actions there and fills the
 * rest with generic-but-honest capability routing rather than manufacturing
 * intrigue from a marginal finding.
 */
export const INTEREST_FLOOR = 0.05;

/**
 * Ceiling on how many ranked actions the broker ever returns. Not itself the
 * tier-1 Verdict's cap — `buildDatasetVerdict` (lib/dossier.ts) trims this
 * output to its own top-3 (D68c); this stays higher so any other consumer of
 * the full ranked list (the fuller profile view, a future nav surface) isn't
 * starved to 3.
 */
const RANKED_ACTIONS_CAP = 5;

interface RuleRoute {
  module: SidebarModule;
  /** Which Charts sub-tab to land on when `module` is 'charts' — routing precision now that chart sub-types are internal tabs (D68d), not sidebar modules. */
  tab?: string;
  legal: (caps: DataCapabilities) => boolean;
  verb: (columns: string[], tableName: string) => string;
}

// Only the *analytical* insight rules produce a ranked action — each routes to
// the module that acts on the finding (a chart, the correlation view, the SQL
// playground). The classification/quality notes (`null-pattern`, `id-exclusion`)
// are deliberately absent: they are already surfaced in the quality headline and
// the insight feed, and routing them here would just point every near-unique or
// null-heavy column back at "review this in the profile" — the very
// profile-again loop D68a exists to kill. A candidate whose rule has no route
// is skipped; when none clear the floor, generic capability routing takes over.
const RULE_ROUTES: Partial<Record<InsightRuleId, RuleRoute>> = {
  "change-point": {
    module: "charts",
    tab: "time-series",
    legal: (c) => c.canDoTimeSeries,
    verb: ([date, quant]) =>
      date && quant
        ? `Chart ${quant} over ${date}`
        : "Chart the trend over time",
  },
  leakage: {
    module: "correlation",
    legal: (c) => c.canDoCorrelation,
    verb: ([a, b]) =>
      a && b
        ? `Compare ${a} and ${b} in the correlation view`
        : "Open the correlation matrix",
  },
  concentration: {
    module: "charts",
    tab: "categorical",
    legal: (c) => c.canDoCategoricalBreakdown,
    verb: ([cat, quant]) =>
      cat && quant
        ? `Break down ${quant} by ${cat}`
        : "Break down the totals by category",
  },
  "outlier-group": {
    module: "charts",
    tab: "categorical",
    legal: (c) => c.canDoCategoricalBreakdown,
    verb: ([cat, quant]) =>
      cat && quant
        ? `Compare ${quant} across ${cat} groups`
        : "Compare the group averages",
  },
  duplicates: {
    module: "sql",
    legal: () => true,
    verb: (_columns, tableName) => `Find the duplicate rows in ${tableName}`,
  },
};

/**
 * Recover the column operands an insight refers to. lib/insights.ts builds
 * candidate ids as `${rule}`, `${rule}:${column}`, or `${rule}:${a}:${b}`, so
 * the operands are the id with its `${rule}:` prefix stripped. (A column name
 * literally containing ':' — pathological for a SQL identifier — would
 * mis-split, costing a less precise verb label but never a wrong route.)
 */
function insightColumns(candidate: InsightCandidate): string[] {
  const prefix = `${candidate.rule}:`;
  if (!candidate.id.startsWith(prefix)) return [];
  const rest = candidate.id.slice(prefix.length);
  return rest.length > 0 ? rest.split(":") : [];
}

function insightAction(
  ti: TableInsights,
  candidate: InsightCandidate,
  route: RuleRoute,
): RankedAction {
  const columns = insightColumns(candidate);
  const { table } = ti;
  const prefilledConfig: Record<string, unknown> = {
    tableName: table.tableName,
    columns,
  };
  // The SQL playground has no column-selector UI to seed — its prefill is the
  // statement itself. `candidate.sql` is already the exact query that
  // produced this finding (the `duplicates` rule today, the only rule routed
  // to 'sql'), so reusing it opens the editor on the real answer rather than
  // guessing at a template.
  if (route.module === "sql") prefilledConfig.sql = candidate.sql;
  const prefill: ThreadConfig = { module: route.module, prefilledConfig };
  // The description is already honesty-guarded at the source (a statistic, never
  // a conclusion), so it is the fact statement verbatim.
  const evidence: FactRef = {
    statement: candidate.description,
    sql: candidate.sql,
    snapshot: table.createdAt,
    confidence: table.sampled ? "medium" : "high",
    provenance: "insight-rule",
  };
  return {
    verb: route.verb(columns, table.tableName),
    module: route.module,
    tab: route.tab,
    prefill,
    evidence,
    score: scoreOf(candidate),
  };
}

/** A structural fact read off the schema/registry rather than queried — never a manufactured finding. */
export function schemaFact(
  statement: string,
  snapshot: string,
  sampled: boolean,
): FactRef {
  return {
    statement,
    sql: "",
    snapshot,
    confidence: sampled ? "medium" : "high",
    provenance: "schema",
  };
}

function genericAction(
  module: SidebarModule,
  verb: string,
  evidence: FactRef,
  tab?: string,
  prefilledConfig: Record<string, unknown> = {},
): RankedAction {
  return {
    verb,
    module,
    tab,
    prefill: { module, prefilledConfig },
    evidence,
    score: 0,
  };
}

/**
 * Resolve which table a capability's pooled column references (§ evaluateCapabilities)
 * belong to, so a generic action can prefill a real table + bare column names
 * instead of opening its destination empty. A qualified ref (`table.column`,
 * present once ≥2 tables contribute) names its table directly; a bare ref is
 * only resolvable when exactly one classified table exists. If the refs
 * resolve to more than one table (a pathological cross-table split — e.g. a
 * date in one table, a measure in another), that is genuine ambiguity, not a
 * guess to paper over: returns `null` and the caller falls back to today's
 * empty-form open.
 */
function resolveGenericPrefill(
  classifiedTables: ClassifiedTable[],
  refs: string[],
): { tableName: string; columns: string[] } | null {
  if (refs.length === 0) return null;
  const tableNames = new Set(
    refs.map((ref) =>
      ref.includes(".")
        ? ref.slice(0, ref.indexOf("."))
        : classifiedTables.length === 1
          ? classifiedTables[0].tableName
          : null,
    ),
  );
  if (tableNames.size !== 1) return null;
  const [tableName] = tableNames;
  if (!tableName) return null;
  const columns = refs.map((ref) =>
    ref.includes(".") ? ref.slice(ref.indexOf(".") + 1) : ref,
  );
  return { tableName, columns };
}

/**
 * Generic-but-honest routing (D68c) — capability-gated fallbacks, in priority
 * order, each carrying a structural schema fact rather than a manufactured
 * finding. These fill the band when insight-driven actions are thin (or absent
 * on a boring dataset), and the profile route is the always-available floor.
 */
function genericActions(
  tables: TableRegistryEntry[],
  caps: DataCapabilities,
): RankedAction[] {
  const classifiedTables = tables.filter(hasClassifiedColumns);
  const snapshot = tables.reduce(
    (latest, t) => (t.createdAt > latest ? t.createdAt : latest),
    tables[0]?.createdAt ?? "",
  );
  const sampled = tables.some((t) => t.sampled);
  const actions: RankedAction[] = [];

  if (caps.canDoCorrelation) {
    // No specific pair to name here (the verb only counts columns), and the
    // pooled numeric-column count offers no single table to land on either —
    // correlation needs 2+ numeric columns on the *same* table, which the
    // pooled tally doesn't guarantee. Left unprefilled; the module's own
    // first-eligible-table default is the honest answer.
    const n = caps.numericColumns.length;
    actions.push(
      genericAction(
        "correlation",
        `Explore the correlation matrix on the ${n} numeric columns`,
        schemaFact(`This dataset has ${n} numeric columns.`, snapshot, sampled),
      ),
    );
  }
  if (caps.canDoTimeSeries) {
    const [date] = caps.dateColumns;
    const [quant] = caps.numericColumns;
    const prefill = resolveGenericPrefill(
      classifiedTables,
      [date, quant].filter((c): c is string => Boolean(c)),
    );
    actions.push(
      genericAction(
        "charts",
        date && quant
          ? `Chart ${quant} over ${date}`
          : "Chart a measure over time",
        schemaFact(
          `This dataset has a time axis and ${caps.numericColumns.length} numeric columns.`,
          snapshot,
          sampled,
        ),
        "time-series",
        prefill ?? {},
      ),
    );
  }
  if (caps.canDoCategoricalBreakdown) {
    const [cat] = caps.categoricalColumns;
    const prefill = resolveGenericPrefill(
      classifiedTables,
      [cat].filter((c): c is string => Boolean(c)),
    );
    actions.push(
      genericAction(
        "charts",
        cat
          ? `Break down the data by ${cat}`
          : "Break down the data by category",
        schemaFact(
          `This dataset has ${caps.categoricalColumns.length} categorical columns.`,
          snapshot,
          sampled,
        ),
        "categorical",
        prefill ?? {},
      ),
    );
  }
  if (caps.canDoDistribution) {
    const [quant] = caps.numericColumns;
    const prefill = resolveGenericPrefill(
      classifiedTables,
      [quant].filter((c): c is string => Boolean(c)),
    );
    actions.push(
      genericAction(
        "charts",
        quant
          ? `Inspect the distribution of ${quant}`
          : "Inspect the distribution of the numeric columns",
        schemaFact(
          `This dataset has ${caps.numericColumns.length} numeric columns.`,
          snapshot,
          sampled,
        ),
        "distribution",
        prefill ?? {},
      ),
    );
  }

  const largest =
    [...tables].sort((a, b) => b.rowCount - a.rowCount)[0] ?? null;
  if (largest) {
    actions.push(
      genericAction(
        "profile",
        `Profile ${largest.tableName}`,
        schemaFact(
          `${largest.tableName} has ${largest.rowCount.toLocaleString()} rows and ${largest.columnCount} columns.`,
          largest.createdAt,
          largest.sampled ?? false,
        ),
        undefined,
        { tableName: largest.tableName },
      ),
    );
  }
  return actions;
}

/**
 * Rank the next actions worth taking (§9, D68a). Insight-driven actions come
 * first — ranked by the D10 score, gated by broker legality and the interest
 * floor, deduped so one destination is never offered twice — then the remaining
 * slots fill with generic capability routing for modules not already covered.
 * A thin profile (no rule clears the floor) degrades to that honest routing
 * rather than a manufactured finding. Pure and deterministic.
 */
export function rankNextActions(
  tables: TableRegistryEntry[],
  insights: TableInsights[],
): RankedAction[] {
  if (tables.length === 0) return [];
  const caps = evaluateCapabilities(tables);

  const ranked = insights
    .flatMap((ti) => ti.insights.map((candidate) => ({ ti, candidate })))
    .sort((a, b) => scoreOf(b.candidate) - scoreOf(a.candidate));

  const actions: RankedAction[] = [];
  const seen = new Set<string>();

  for (const { ti, candidate } of ranked) {
    if (actions.length >= RANKED_ACTIONS_CAP) break;
    if (scoreOf(candidate) < INTEREST_FLOOR) break; // sorted desc — nothing below clears it
    const route = RULE_ROUTES[candidate.rule];
    if (!route || !route.legal(caps)) continue; // a note-only rule (no route) is not a next move
    const key = `${route.module}:${insightColumns(candidate).join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(insightAction(ti, candidate, route));
  }

  // Keyed by module+tab, not module alone — 'charts' now covers three sub-types
  // (time-series/distribution/categorical, D68d), so a time-series insight
  // action must not block the distribution/categorical generic fallbacks.
  const destinationKey = (a: RankedAction) =>
    a.tab ? `${a.module}:${a.tab}` : a.module;
  const usedDestinations = new Set(actions.map(destinationKey));
  for (const generic of genericActions(tables, caps)) {
    if (actions.length >= RANKED_ACTIONS_CAP) break;
    const key = destinationKey(generic);
    if (usedDestinations.has(key)) continue;
    usedDestinations.add(key);
    actions.push(generic);
  }

  return actions;
}
