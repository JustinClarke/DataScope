// The model-facing description of the catalog (A5, master §11.5, D74).
//
// `operations.ts` owns what each operation *does*; this owns what a caller is
// told about it. They are separate files because they have different readers —
// a handler answers to the engine, a description answers to a model — but they
// are not separate sources of truth: `toolSchemas.test.ts` fails if this file
// and `OPERATION_NAMES` disagree, so an operation cannot be added, renamed or
// dropped on one side only.
//
// **This is the only tool list in the product.** The MCP server registers these
// and nothing else, and the app's chat reads them back off its own MCP
// connection rather than declaring a second, smaller set (A4 shipped a
// deliberate two-tool placeholder in `services/ai.ts` and said so in a comment;
// A5's job was to delete it). An external agent and the in-tab chat therefore
// see the same entries by construction — the guarantee A5 exists to make.
//
// A6 adds two whose calls land in the *app* rather than in the engine, tagged
// `PRODUCT_SURFACE_OPERATIONS` below. They are declared here with everything
// else for that same reason: a second list is how the two surfaces drift.
//
// **Why the schemas are flat and inline.** `aggregate` and `time_series` share
// a metric shape and it is spelled out twice rather than pulled into `$defs`
// with a `$ref`. Provider tool-calling translates these into native formats —
// Ollama's, Gemini's, OpenAI's — and `$ref` resolution is the first thing that
// varies between them. A duplicated object literal costs a few lines; a `$ref`
// that one provider silently flattens to `{}` costs the parameter.
//
// **What the descriptions must carry**, per the D74 catalog note: preconditions,
// output shape, cost, and the nearby case the operation does *not* cover. That
// last clause is doing the most work — a small model picking `aggregate` when it
// wanted `time_series` is the failure that a longer tool list makes likelier, and
// the pointer is cheaper than another operation.
import { OPERATION_NAMES, type OpName } from "./operations";

/** JSON Schema for one operation's parameters. Draft 2020-12, deliberately using only the subset every provider's tool-calling understands. */
export type JsonSchema = Record<string, unknown>;

export interface AnalystToolSchema {
  name: OpName;
  /** Human-facing label for a tool picker; never sent to a model as instruction. */
  title: string;
  description: string;
  inputSchema: JsonSchema;
}

/** Spelled out at both call sites rather than `$ref`-ed — see the file header. */
const METRIC_ITEM: JsonSchema = {
  type: "object",
  properties: {
    fn: {
      type: "string",
      enum: [
        "count_rows",
        "count_distinct",
        "sum",
        "avg",
        "min",
        "max",
        "median",
        "sum_product",
      ],
      description:
        "The aggregate to compute. count_rows takes no column; sum_product takes exactly two in `columns`.",
    },
    column: {
      type: "string",
      description:
        "The column to aggregate. Required for every fn except count_rows and sum_product.",
    },
    columns: {
      type: "array",
      items: { type: "string" },
      description:
        "sum_product only: exactly two columns, multiplied per row then summed. This is how you compute revenue from quantity and unit price.",
    },
    alias: {
      type: "string",
      description:
        "Output column name. Defaults to a name derived from fn and column.",
    },
  },
  required: ["fn"],
  additionalProperties: false,
};

const object = (
  properties: JsonSchema,
  required: string[] = [],
): JsonSchema => ({
  type: "object",
  properties,
  ...(required.length > 0 ? { required } : {}),
  additionalProperties: false,
});

export const ANALYST_TOOLS: readonly AnalystToolSchema[] = [
  // ---- orient ----
  {
    name: "get_schema",
    title: "Get schema",
    description:
      "Every column in the dataset as one row of table_name, column_name and data_type — tables and views alike, ordered by table then by position. That is the whole of it: no row counts, no null or distinct counts, no semantic classification, and no relationships. Costs one metadata read and no query. You are given this in your first turn — call it again only after creating or dropping an object. Returns inline and complete; no result handle. For a table's per-column spread and null percentage use describe_table; for the inferred join between two tables use join_coverage.",
    inputSchema: object({
      table: {
        type: "string",
        description:
          "Optional: restrict to one table. Omit for the whole dataset.",
      },
    }),
  },
  {
    name: "describe_table",
    title: "Describe table",
    description:
      "One row per column of a table or view, from SUMMARIZE: column_name, column_type, min, max, approx_unique, avg, std, q25, q50, q75, count and null_percentage. approx_unique is an estimate and can exceed the true distinct count; min, max, avg, std and the quartiles arrive as text and are null for a type that has no such statistic. Costs one scan, and returns a result handle — past 100 columns, page it with read_result. A derived table or view also carries a lineage note naming what it came from and what depends on it. Does not return rows — use sample_rows — and does not classify columns, name key columns, or infer relationships.",
    inputSchema: object(
      { table: { type: "string", description: "Table or view name." } },
      ["table"],
    ),
  },
  {
    name: "data_quality",
    title: "Data quality",
    description:
      "Deterministic quality findings across the dataset: columns with concentrated nulls, columns holding a single repeated value, and fully duplicated rows. Each finding names the rule, the affected table and column, a plain-English description, and the exact SQL that confirms it. Restrict to one table, or omit to check every table in one call. Does not flag statistical outliers or type mismatches — for a single column's distribution, use column_stats.",
    inputSchema: object({
      table: {
        type: "string",
        description:
          "Optional: restrict to one table. Omit to check every table.",
      },
    }),
  },

  // ---- look ----
  {
    name: "column_stats",
    title: "Column statistics",
    description:
      "A one-row statistical summary of one column, shaped by the column's declared SQL type — not by any semantic class. Always: row_count, non_null, nulls, distinct_count. Numeric adds min, max, mean, stddev, q1, median and q3; temporal adds min and max as text; boolean adds nothing, since the counts are the whole story; text and every other type add min_length, max_length and mean_length over the value cast to text. One aggregate query; returns inline and complete, noting the declared type. No histogram, no IQR or outlier bounds, and no top values — for values with their counts and shares use distinct_values, for word counts inside text use text_frequency, and for a temporal column's grain and gaps use time_series.",
    inputSchema: object(
      { table: { type: "string" }, column: { type: "string" } },
      ["table", "column"],
    ),
  },
  {
    name: "distinct_values",
    title: "Distinct values",
    description:
      "Value, count and share for one column, with a limit, an ordering and an optional filter. Use this when you need more than the fixed top values column_stats returns, or need them under a WHERE clause. One grouped query. Does not search across columns — that is search_values.",
    inputSchema: object(
      {
        table: { type: "string" },
        column: { type: "string" },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Rows to return. Default 100.",
        },
        order: {
          type: "string",
          enum: ["count_desc", "count_asc", "value_asc", "value_desc"],
          description: "Default count_desc.",
        },
        where: {
          type: "string",
          description:
            "A SQL boolean expression over this table, without the WHERE keyword.",
        },
      },
      ["table", "column"],
    ),
  },
  {
    name: "search_values",
    title: "Search values",
    description:
      "Find which columns actually contain a literal value. Returns, per matching column, the table, column, match count and up to five matching values. Call this before filtering on a value you have not seen in the data — an invented filter value returns zero rows and looks like a real finding. Scans the text-comparable columns in scope, so it is more expensive than a single-column read; narrow it with tables or columns when you can. It locates a value across columns; it does not enumerate one column's values, which is distinct_values.",
    inputSchema: object(
      {
        term: { type: "string", description: "The literal to look for." },
        tables: {
          type: "array",
          items: { type: "string" },
          description: "Restrict the scan to these tables.",
        },
        columns: {
          type: "array",
          items: { type: "string" },
          description: "Restrict the scan to these column names.",
        },
        mode: {
          type: "string",
          enum: ["exact", "prefix", "contains", "ci_contains"],
          description: "Default ci_contains (case-insensitive substring).",
        },
      },
      ["term"],
    ),
  },
  {
    name: "sample_rows",
    title: "Sample rows",
    description:
      "Actual rows from a table, to see what the data looks like. Materializes a pageable result and returns the first page inline. Rows are for orientation — do not count, sum or compare them by reading them; that is what aggregate and run_sql are for, and they are correct over the whole table rather than over the sample.",
    inputSchema: object(
      {
        table: { type: "string" },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Rows to return. Default 20.",
        },
      },
      ["table"],
    ),
  },
  {
    name: "text_frequency",
    title: "Text frequency",
    description:
      'Term, count, document count and share for the words, bigrams or trigrams inside a text column. This is how you answer "what do people mention" without reading rows into your context. Tokenizes and groups over the whole column, so it is a heavier query than distinct_values. Counts terms, not sentiment or topics — it will not tell you whether a term is a complaint.',
    inputSchema: object(
      {
        table: { type: "string" },
        column: { type: "string" },
        where: {
          type: "string",
          description:
            "A SQL boolean expression over this table, without the WHERE keyword. Use it to scope to, say, low ratings.",
        },
        unit: {
          type: "string",
          enum: ["word", "bigram", "trigram"],
          description: "Default word.",
        },
        top: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Terms to return. Default 50.",
        },
        minLength: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Ignore terms shorter than this. Default 3.",
        },
        stopwords: {
          type: "array",
          items: { type: "string" },
          description:
            "Replaces the default English stopword list entirely. Pass [] to disable stopword removal.",
        },
      },
      ["table", "column"],
    ),
  },

  // ---- compute ----
  {
    name: "aggregate",
    title: "Aggregate",
    description:
      "Grouped aggregation without writing SQL: metrics over a table or an inferred join, with group-by, filter, having, ordering and a limit. Materializes a pageable result. This is a convenience over run_sql, not a fence — run_sql expresses everything this does and more. Has no notion of time buckets or period-over-period change; for that use time_series.",
    inputSchema: object(
      {
        from: { type: "string", description: "Base table or view name." },
        join: {
          type: "string",
          description:
            "A table name or an inferred relationship id from get_schema. The join clause is resolved from the inferred edge.",
        },
        metrics: {
          type: "array",
          items: METRIC_ITEM,
          minItems: 1,
          description: "One or more aggregates to compute.",
        },
        groupBy: {
          type: "array",
          items: { type: "string" },
          description: "Columns to group by. Omit for a single total row.",
        },
        where: {
          type: "string",
          description: "A SQL boolean expression, without the WHERE keyword.",
        },
        having: {
          type: "string",
          description:
            "A SQL boolean expression over the aggregates, without the HAVING keyword.",
        },
        order: {
          type: "string",
          description: "An ORDER BY expression, without the ORDER BY keywords.",
        },
        limit: { type: "integer", minimum: 1, maximum: 100000 },
      },
      ["from", "metrics"],
    ),
  },
  {
    name: "time_series",
    title: "Time series",
    description:
      "One row per calendar period with your metrics, the period-over-period delta, and an explicit flag on periods that have no rows. Use this for trends, month-over-month change and finding an anomalous period — computing it with aggregate loses the empty periods, which is what makes a gap look like a decline. Materializes a pageable result.",
    inputSchema: object(
      {
        from: { type: "string", description: "Base table or view name." },
        join: {
          type: "string",
          description:
            "A table name or an inferred relationship id from get_schema.",
        },
        dateColumn: {
          type: "string",
          description: "The temporal column to bucket by.",
        },
        grain: {
          type: "string",
          enum: ["day", "week", "month", "quarter", "year"],
        },
        metrics: { type: "array", items: METRIC_ITEM, minItems: 1 },
        where: {
          type: "string",
          description: "A SQL boolean expression, without the WHERE keyword.",
        },
      },
      ["from", "dateColumn", "grain", "metrics"],
    ),
  },
  {
    name: "join_coverage",
    title: "Join coverage",
    description:
      "What a join actually does to the row set before you rely on it: matched and unmatched counts on each side, the multiplicity class (1:1, 1:n, n:1, n:m), example orphan keys, and the join SQL. Call this before aggregating across tables — an n:m join silently multiplies every sum computed through it, and orphan rows silently drop out of an inner join. Defaults to the inferred edge when one exists. It measures the join and does not compute over it: once the coverage looks right, use aggregate or run_sql.",
    inputSchema: object(
      {
        left: { type: "string" },
        right: { type: "string" },
        on: object(
          { leftColumn: { type: "string" }, rightColumn: { type: "string" } },
          ["leftColumn", "rightColumn"],
        ),
      },
      ["left", "right"],
    ),
  },
  {
    name: "correlate",
    title: "Correlate",
    description:
      "A Pearson correlation matrix over the named numeric columns of one table. Returns inline and complete. Measures linear association only, on this table only: it does not establish cause, does not detect non-linear relationships, and cannot correlate across a join — derive a joined table first if you need that.",
    inputSchema: object(
      {
        table: { type: "string" },
        columns: {
          type: "array",
          items: { type: "string" },
          description:
            "Numeric columns. Omit for every numeric column on the table.",
        },
      },
      ["table"],
    ),
  },
  {
    name: "run_sql",
    title: "Run SQL",
    description:
      "An arbitrary read-only DuckDB query over the source and derived objects: joins, CTEs, window functions, subqueries, QUALIFY, PIVOT, regex and list functions — whatever the engine accepts. Materializes a pageable result and returns the first page inline. Read-only is enforced by the engine, so a statement that writes is refused here: use derive_table or create_view to create something. Costs a full execution — validate_sql checks a query for free first.",
    inputSchema: object(
      {
        sql: { type: "string", description: "One read-only statement." },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description:
            "Rows in the inline preview. Default 100. The full result stays pageable via read_result regardless.",
        },
      },
      ["sql"],
    ),
  },
  {
    name: "validate_sql",
    title: "Validate SQL",
    description:
      "Check a statement without running it: returns whether it parses and plans, how it classifies, and which objects it references, or the engine error with its position. Costs no execution and no result slot, so use it freely as an ordinary planning move — especially before a query over a large table or one you are unsure of. It proves the query is valid, not that it is the right question.",
    inputSchema: object({ sql: { type: "string" } }, ["sql"]),
  },

  // ---- derive ----
  {
    name: "derive_table",
    title: "Derive table",
    description:
      "Run CREATE TABLE AS and register the result as a derived table: profiled, classified, queryable by name, and visible to the user in the explorer rail carrying the SQL that produced it. Use this for an intermediate grain you will query more than once — aggregating line items to one row per order, for example. The name is sanitized and de-duplicated. Materializes the table; prefer create_view when you do not need it stored.",
    inputSchema: object(
      {
        name: {
          type: "string",
          description:
            "Requested name. Sanitized and de-duplicated; the registered name comes back in the result.",
        },
        sql: {
          type: "string",
          description:
            "The SELECT whose result becomes the table. Do not write CREATE TABLE yourself.",
        },
      },
      ["name", "sql"],
    ),
  },
  {
    name: "create_view",
    title: "Create view",
    description:
      "Register a named view over the existing objects. Cheaper than derive_table because nothing is materialized — use it for an intermediate grain you will query twice. The view is re-evaluated on every read, so a view over an expensive query pays that cost each time; derive_table pays it once.",
    inputSchema: object(
      {
        name: {
          type: "string",
          description: "Requested name. Sanitized and de-duplicated.",
        },
        sql: {
          type: "string",
          description:
            "The SELECT the view wraps. Do not write CREATE VIEW yourself.",
        },
      },
      ["name", "sql"],
    ),
  },
  {
    name: "drop_derived",
    title: "Drop derived object",
    description:
      "Drop a derived table or view. Refuses source tables — the data the user loaded is not yours to remove, and there is no undo through this operation.",
    inputSchema: object({ name: { type: "string" } }, ["name"]),
  },

  // ---- read back ----
  {
    name: "read_result",
    title: "Read result page",
    description:
      "A page of a result you already produced, by its resultId. Pages come from the stored materialization, so page 2 follows page 1 even when the query had no ORDER BY. Costs a read, not a re-execution. If compaction has released the body, you get the receipt — result id, SQL, schema, row count — and the SQL reproduces it.",
    inputSchema: object(
      {
        resultId: {
          type: "string",
          description: "From the resultId field of an earlier result.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Default 0. Use nextOffset from the previous page.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Rows in this page. Default 100.",
        },
        columns: {
          type: "array",
          items: { type: "string" },
          description: "Project a subset of the result columns.",
        },
      },
      ["resultId"],
    ),
  },

  // ---- land it in the app (A6) ----
  {
    name: "create_chart",
    title: "Create chart",
    description:
      "Chart a result you already produced, or a query, using the same translator the app itself charts with. It reads the result and picks the fitting form — line for a time series, bar for a category, scatter for two measures — or tells you plainly why this result shape supports none, which is a real answer and not a failure: a time series needs a temporal column, a bar chart needs few enough categories to stay legible. A single aggregate value comes back as a stat, which has no axes and so no spec to refine. Charts at most 5000 rows and refuses past that, so aggregate the result down first. Optionally name a type, or pass a spec to narrow the one it chose: you may re-title it and drop measures, not name columns of your own. Charts what is in front of it; it does not compute, filter or sort, so shape the result first with aggregate, time_series or run_sql.",
    inputSchema: object({
      resultId: {
        type: "string",
        description:
          "From the resultId field of an earlier result. Pass this or sql, not both.",
      },
      sql: {
        type: "string",
        description:
          "A read-only query to run and chart. Pass this or resultId, not both.",
      },
      type: {
        type: "string",
        // The three forms the translator can actually build from a result. The
        // `ChartType` union has two more — `distribution` and `join-graph` —
        // that `specForType` has no case for, so naming either is refused
        // whatever the data. Offering a model a value that cannot succeed on
        // any result is the aspirational description D74 warns about, so they
        // are not offered. `create_chart` still accepts them as *valid* enum
        // members; this list is what a caller is told to choose from.
        enum: ["time-series", "correlation", "categorical"],
        description:
          "Optional: ask for a specific form. Omit to let the translator choose. A form the result cannot support is refused with the ones it can.",
      },
      spec: {
        type: "object",
        description:
          "Optional refinement of the chosen chart: title, and a subset of its yFields. Anything else — a different type, xField, or a column not already in the chart — is refused.",
        properties: {
          type: { type: "string" },
          title: {
            type: "string",
            description:
              "A plain label. It must not assert cause or certainty.",
          },
          xField: { type: "string" },
          yFields: { type: "array", items: { type: "string" } },
          seriesField: { type: "string" },
        },
        additionalProperties: false,
      },
    }),
  },
  {
    name: "pin_result",
    title: "Pin result",
    description:
      "Keep a result for the user as a query tab of its own — carrying its SQL, so they can read it, edit it and re-run it. Use it for a result that answers the question, not for every intermediate step; each call makes a separate tab and there is no un-pin. Pins what you already computed and changes nothing about it, so compute the result first and pin it once it is right.",
    inputSchema: object(
      {
        resultId: {
          type: "string",
          description: "From the resultId field of an earlier result.",
        },
        title: {
          type: "string",
          description:
            "What to name the tab. Kept short; a label, not a sentence.",
        },
      },
      ["resultId", "title"],
    ),
  },
] as const;

/**
 * The two operations that are **product surface, not analysis** (A6).
 *
 * They produce no gradeable analytical fact — one draws, one keeps — so D74's
 * scored run excludes them, and this set is what the harness filters on rather
 * than a name list copied into `eval/`. That matters beyond tidiness: D74 froze
 * the scored surface and warned that tool count is itself one of the things
 * being measured, so the scored catalog has to stay the analysis catalog even as
 * the app's grows.
 */
export const PRODUCT_SURFACE_OPERATIONS: ReadonlySet<string> = new Set<OpName>([
  "create_chart",
  "pin_result",
]);

const BY_NAME = new Map<string, AnalystToolSchema>(
  ANALYST_TOOLS.map((tool) => [tool.name, tool]),
);

export function analystTool(name: string): AnalystToolSchema | undefined {
  return BY_NAME.get(name);
}

/**
 * The catalog count, asserted rather than described.
 *
 * D74's record froze the scored surface at eighteen operations and warned that
 * "about sixteen" is not a harmless label when tool-count pressure is one of the
 * things being measured. The shipped catalog is **twenty**, and the split is
 * the point: **eighteen analysis operations** — D74's frozen number, `data_quality`
 * (the third orient operation, closed as an A1-shaped follow-up to A5's "Known
 * gap" note) now included — plus A6's **two product-surface operations**, which
 * the scored run excludes because they grade nothing. Both constants are what
 * the tests compare against, so neither number can drift without a failure.
 */
export const ANALYST_TOOL_COUNT = ANALYST_TOOLS.length;

/** The D74 scored surface: everything a model is graded on computing. */
export const ANALYSIS_TOOL_COUNT = ANALYST_TOOLS.filter(
  (tool) => !PRODUCT_SURFACE_OPERATIONS.has(tool.name),
).length;

/** Every operation has a schema and every schema has an operation — the reason this file cannot drift from `operations.ts`. */
export function catalogDrift(): {
  missingSchema: string[];
  orphanSchema: string[];
} {
  const described = new Set(ANALYST_TOOLS.map((tool) => tool.name));
  return {
    missingSchema: OPERATION_NAMES.filter((name) => !described.has(name)),
    orphanSchema: ANALYST_TOOLS.map((tool) => tool.name).filter(
      (name) => !OPERATION_NAMES.includes(name),
    ),
  };
}
