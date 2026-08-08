// Column-level classification output — DATASCOPE.md §8.

export type SemanticType =
  "Temporal" | "Quantitative" | "Categorical" | "Textual" | "Identifier";

/**
 * Raw `SUMMARIZE` extraction (§8 step 1) — one row per column, before semantic
 * classification. `02-column-classifier` reads this and adds `semanticType` to
 * produce a `ClassifiedColumn`; every other field carries over unchanged.
 */
export interface ColumnProfile {
  name: string;
  /** DuckDB physical type: VARCHAR, BIGINT, DOUBLE, DATE, etc. */
  physicalType: string;
  /** approx_unique from SUMMARIZE */
  cardinality: number;
  /** null on a 0-row table — SUMMARIZE has no 0/0 percentage to report */
  nullPercentage: number | null;
  min: string | number | null;
  max: string | number | null;
  mean: number | null;
  stdDev: number | null;
}

export interface ClassifiedColumn extends ColumnProfile {
  semanticType: SemanticType;
  /**
   * On a classified column, `cardinality` (inherited) holds the *exact* distinct
   * count used to classify it, not the source profile's `approx_unique`
   * estimate. SUMMARIZE's HyperLogLog estimate was measured overshooting the row
   * count on real data — enough to trip the near-unique identifier rule and
   * mislabel a continuous column — so classification recomputes an exact
   * `COUNT(DISTINCT)`.
   */
  /**
   * Human-readable justification for `semanticType` — e.g. "99.8% unique" or
   * "low-cardinality integers (3 distinct)". Powers the classification
   * reasoning tooltip; reads "Set manually" once a user overrides the column.
   * Optional so a bare `ColumnProfile`-derived column without a recorded
   * rationale is still a valid value.
   */
  classificationReason?: string;
}

// Capabilities Broker output — DATASCOPE.md §9. Gates which analysis modules
// are enabled and doubles as the ViewSpec layer's grammar (D55).
export interface DataCapabilities {
  // Analysis modules (v0)
  canDoDescriptiveStats: boolean;
  canDoTimeSeries: boolean;
  canDoCorrelation: boolean;
  canDoDistribution: boolean;
  canDoCategoricalBreakdown: boolean;

  // ML modules (deferred — flags retained for post-v1, §20.1)
  canDoKMeans: boolean;
  canDoRegression: boolean;
  canDoClassification: boolean;
  canDoNLP: boolean;

  // Column references for pre-populating UI dropdowns
  numericColumns: string[];
  categoricalColumns: string[];
  dateColumns: string[];
  textColumns: string[];
  identifierColumns: string[];
}
