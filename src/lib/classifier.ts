// Semantic column classification — the second profiling step, run over the
// SUMMARIZE-derived ColumnProfile[] a table already carries. Each column gets a
// SemanticType that decides which analysis modules it can feed (the
// capabilities broker) and how the AI layer describes it in schema-pruned
// prompts. Pure and deterministic: same profile in, same classification out.
import type { ClassifiedColumn, ColumnProfile, SemanticType } from "../types";

// DuckDB physical types that are always time-series regardless of cardinality.
const TEMPORAL_TYPES = ["DATE", "TIMESTAMP", "TIMESTAMPTZ", "TIME"];

// Numeric physical types. Low-cardinality members read as encoded categories
// (survived 0/1, class 1/2/3); higher-cardinality members are continuous.
const NUMERIC_TYPES = [
  "BIGINT",
  "INTEGER",
  "DOUBLE",
  "FLOAT",
  "HUGEINT",
  "SMALLINT",
  "TINYINT",
  "DECIMAL",
];

// A column whose distinct-value count is at or below this reads as a set of
// discrete labels rather than a continuous range or free text.
export const CATEGORICAL_CARDINALITY_MAX = 15;

// A string column with more distinct values than this reads as free text
// (search / NLP) rather than a bounded category set.
export const TEXTUAL_CARDINALITY_MIN = 100;

// Distinct-to-row ratio above which a column reads as an identifier (primary
// key, URL, UUID) — near-unique per row, so useless as an analysis dimension.
export const IDENTIFIER_UNIQUE_RATIO = 0.95;

/** True when `physicalType` names a numeric DuckDB type (DECIMAL(9,2) etc. included). */
function isNumericType(physicalType: string): boolean {
  const base = physicalType.replace(/\(.*\)$/, "").toUpperCase();
  return NUMERIC_TYPES.includes(base);
}

function isTemporalType(physicalType: string): boolean {
  return TEMPORAL_TYPES.includes(physicalType.toUpperCase());
}

/**
 * Distinct-to-row ratio, guarded against a 0-row table (SUMMARIZE reports
 * cardinality 0 there, and 0/0 would be NaN). A 0-row table yields ratio 0, so
 * the identifier heuristic never fires on emptiness.
 */
function uniqueRatioOf(cardinality: number, totalRows: number): number {
  return totalRows > 0 ? cardinality / totalRows : 0;
}

/**
 * Classify one column into a semantic type from its physical type and
 * cardinality relative to the table's row count. Temporal wins first (a DATE
 * primary key is still a time axis, not an identifier); then near-uniqueness
 * marks identifiers; then numeric vs. string split on the cardinality
 * thresholds above. Any unrecognized physical type falls back to Identifier so
 * an exotic column (STRUCT, LIST, BLOB, INTERVAL) is excluded from analysis
 * rather than crashing the classifier.
 */
export function classifyColumn(
  profile: ColumnProfile,
  totalRows: number,
): SemanticType {
  const { physicalType, cardinality } = profile;

  if (isTemporalType(physicalType)) return "Temporal";

  if (uniqueRatioOf(cardinality, totalRows) > IDENTIFIER_UNIQUE_RATIO)
    return "Identifier";

  if (isNumericType(physicalType)) {
    return cardinality <= CATEGORICAL_CARDINALITY_MAX
      ? "Categorical"
      : "Quantitative";
  }

  const upperType = physicalType.toUpperCase();
  if (upperType === "VARCHAR" || upperType === "BOOLEAN") {
    if (cardinality <= CATEGORICAL_CARDINALITY_MAX) return "Categorical";
    if (cardinality > TEXTUAL_CARDINALITY_MIN) return "Textual";
    return "Categorical"; // moderate-cardinality strings
  }

  return "Identifier";
}

/**
 * Human-readable justification for the semantic type `classifyColumn` assigns —
 * the text a future reasoning tooltip shows ("classified Identifier: 99.8%
 * unique"). Derived from the same fields as the classification, so it always
 * describes the *deciding* rule for that column.
 */
export function classificationReason(
  profile: ColumnProfile,
  totalRows: number,
): string {
  const { physicalType, cardinality } = profile;
  const ratio = uniqueRatioOf(cardinality, totalRows);

  if (isTemporalType(physicalType))
    return `${physicalType} values — treated as a time axis`;

  if (ratio > IDENTIFIER_UNIQUE_RATIO) {
    return `${(ratio * 100).toFixed(1)}% unique — near one value per row`;
  }

  if (isNumericType(physicalType)) {
    return cardinality <= CATEGORICAL_CARDINALITY_MAX
      ? `low-cardinality numbers (${cardinality} distinct) — likely encoded categories`
      : `continuous numeric (${cardinality} distinct values)`;
  }

  const upperType = physicalType.toUpperCase();
  if (upperType === "VARCHAR" || upperType === "BOOLEAN") {
    if (cardinality <= CATEGORICAL_CARDINALITY_MAX)
      return `discrete categories (${cardinality} distinct)`;
    if (cardinality > TEXTUAL_CARDINALITY_MIN)
      return `free text (${cardinality} distinct values)`;
    return `moderate-cardinality text (${cardinality} distinct)`;
  }

  return `unrecognized type ${physicalType} — excluded from analysis`;
}

/** Reason recorded when a user manually overrides a column's classification. */
export function manualOverrideReason(semanticType: SemanticType): string {
  return `Set manually to ${semanticType}`;
}

/**
 * Classify every column of a table, producing the `ClassifiedColumn[]` the
 * broker and profile UI consume. Each result carries the recorded
 * `classificationReason` alongside its `semanticType`; all other profile fields
 * carry over unchanged.
 */
export function classifyColumns(
  profiles: ColumnProfile[],
  totalRows: number,
): ClassifiedColumn[] {
  return profiles.map((profile) => ({
    ...profile,
    semanticType: classifyColumn(profile, totalRows),
    classificationReason: classificationReason(profile, totalRows),
  }));
}
