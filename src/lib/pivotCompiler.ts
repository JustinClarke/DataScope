// Pivot/cross-tab compiler (§10 Module 7, D53) — pure: a `PivotSpec` in, one
// DuckDB `GROUP BY` statement out. No engine access here (unlike
// lib/chartMapper.ts's translator, which is also pure and reused the same
// way): `rows` and `columns` are both grouping-key wells (the shared results
// grid, 03-results-grid.md, only renders a flat `QueryResult` — there is no
// widened matrix rendering path to feed — so "columns" differs from "rows"
// only in UI framing, not in the compiled SQL shape), and the compiled query
// runs through the ordinary `runQuery` path exactly like a hand-written
// SELECT (D49: no new execution path). Top-N capping is a caller-supplied
// value (built from `ClassifiedColumn.cardinality`, already known at
// classification time) rather than a live discovery query.
import { quoteIdentifier } from "../services/ingestion";

export type PivotAggregate = "sum" | "avg" | "count" | "min" | "max";

export interface PivotValueField {
  field: string;
  aggregate: PivotAggregate;
}

export interface PivotTopN {
  field: string;
  n: number;
}

export interface PivotSort {
  /** 0-based index into `pivotOutputColumns(spec)`. */
  columnIndex: number;
  direction: "asc" | "desc";
}

export interface PivotSpec {
  table: string;
  rows: string[];
  columns: string[];
  values: PivotValueField[];
  /** `GROUP BY ROLLUP(...)` over the grouping keys — real subtotal rows, not a second query. */
  subtotals?: boolean;
  /** Caps a high-cardinality grouping field to its top-N values (by the first value field's aggregate, or row count with no values). */
  topN?: PivotTopN;
  sort?: PivotSort;
}

const AGGREGATE_SQL: Record<PivotAggregate, string> = {
  sum: "SUM",
  avg: "AVG",
  count: "COUNT",
  min: "MIN",
  max: "MAX",
};

function sanitizeAliasPart(field: string): string {
  return (
    field.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "field"
  );
}

function groupingKeys(spec: PivotSpec): string[] {
  return [...spec.rows, ...spec.columns];
}

/** One SQL expression per value field, e.g. `SUM("amount")`. `count` ignores the field and counts rows, matching every SQL dialect's `COUNT(*)` shape for a bare row count. */
function valueExpression(value: PivotValueField): string {
  if (value.aggregate === "count") return "COUNT(*)";
  return `${AGGREGATE_SQL[value.aggregate]}(${quoteIdentifier(value.field)})`;
}

/**
 * The ordered output alias list — grouping keys first (their own field name),
 * then one alias per value field (`${aggregate}_${field}`, deduped with a
 * numeric suffix on collision). This is the single source of truth for both
 * `buildPivotSql`'s `SELECT` list and the UI's sort-field picker, so the two
 * can never drift apart.
 */
export function pivotOutputColumns(spec: PivotSpec): string[] {
  const aliases: string[] = [...groupingKeys(spec)];
  const seen = new Set(aliases);

  for (const value of spec.values) {
    const base = `${value.aggregate}_${sanitizeAliasPart(value.field)}`;
    let alias = base;
    let suffix = 2;
    while (seen.has(alias)) {
      alias = `${base}_${suffix}`;
      suffix += 1;
    }
    seen.add(alias);
    aliases.push(alias);
  }

  return aliases;
}

/** The top-N semi-join's ranking expression — the first value field's aggregate, or a plain row count with no values to rank by. */
function topNRankExpression(spec: PivotSpec): string {
  return spec.values.length > 0 ? valueExpression(spec.values[0]) : "COUNT(*)";
}

/**
 * Compile a `PivotSpec` to a single DuckDB `GROUP BY` statement. Throws on an
 * empty spec (no rows, no columns, no values) — a UI-level guard against
 * calling this before the user has placed a single field, not a runtime
 * state this function renders around.
 */
export function buildPivotSql(spec: PivotSpec): string {
  const keys = groupingKeys(spec);
  if (keys.length === 0 && spec.values.length === 0) {
    throw new Error(
      "Pivot spec is empty — place at least one field in rows, columns, or values.",
    );
  }

  const table = quoteIdentifier(spec.table);
  const aliases = pivotOutputColumns(spec);

  const keySelect = keys.map((key) => quoteIdentifier(key));
  const valueSelect = spec.values.map(
    (value, i) =>
      `${valueExpression(value)} AS ${quoteIdentifier(aliases[keys.length + i])}`,
  );
  const selectList = [...keySelect, ...valueSelect].join(", ");

  const clauses = [`SELECT ${selectList}`, `FROM ${table}`];

  if (spec.topN) {
    const capField = quoteIdentifier(spec.topN.field);
    const rank = topNRankExpression(spec);
    clauses.push(
      `WHERE ${capField} IN (SELECT ${capField} FROM ${table} GROUP BY 1 ORDER BY ${rank} DESC LIMIT ${spec.topN.n})`,
    );
  }

  if (keys.length > 0) {
    const groupBy = spec.subtotals
      ? `ROLLUP(${keySelect.join(", ")})`
      : keySelect.map((_, i) => `${i + 1}`).join(", ");
    clauses.push(`GROUP BY ${groupBy}`);
  }

  if (spec.sort) {
    clauses.push(
      `ORDER BY ${spec.sort.columnIndex + 1} ${spec.sort.direction === "asc" ? "ASC" : "DESC"}`,
    );
  }

  return clauses.join("\n");
}
