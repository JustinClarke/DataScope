// The analyst core's envelope and its engine seam (A0, master §11.5, D74).
//
// One shape in, one shape out: every operation in the catalog takes typed
// parameters and returns `OpResult` or `OpError`, never a bare row set and
// never a thrown engine error. The load-bearing field is `sql` — whatever the
// core computed, the user can see, re-run, edit and pin, so model work lands
// as ordinary DataScope artifacts rather than a private channel.
import type { ChartRecommendation } from "../../types/chart";

/** Which engine an executor drives — carried into conformance reporting so a divergence names its side. */
export type EngineId = "duckdb-wasm" | "duckdb-native";

/** A column of an `OpResult`. `type` is a DuckDB type name (`BIGINT`, `VARCHAR`, `DECIMAL(9,2)`), never an Arrow one. */
export interface OpSchemaField {
  name: string;
  type: string;
}

export interface OpResult {
  op: string;
  /** The exact SQL DataScope ran; `null` only for an operation that never touched the engine. */
  sql: string | null;
  /** Present whenever rows were materialized and are therefore pageable via `read_result`. */
  resultId: string | null;
  schema: OpSchemaField[];
  /** Total rows in the materialized result, not the preview length. */
  rowCount: number;
  /** Inline rows, up to the preview cap. */
  rows: unknown[][];
  /** True when `rows` is the whole result. */
  complete: boolean;
  nextOffset: number | null;
  elapsedMs: number;
  /** Deterministic and factual; never advice, never a claim about relevance. */
  note?: string;
  /**
   * The **inner artifact spec** an operation produced (A6, D55) — `create_chart`
   * is its only writer today.
   *
   * This is the one field of the envelope that can carry model-influenced
   * content, and the D55 boundary is what makes that safe: the spec is built by
   * `chartMapper` from the *actual* result, a model-supplied candidate is
   * accepted only after `chartSpecValidator` clears it against that baseline,
   * and it is plain JSON — field names drawn from the result's own schema, no
   * componentId, no callback, no envelope field of any kind. A host renders it
   * with the deterministic chart renderer or ignores it; neither can execute it.
   */
  chart?: ChartRecommendation;
}

export type OpErrorCode =
  | "invalid_argument"
  | "unknown_object"
  | "sql_error"
  | "not_read_only"
  | "result_too_large"
  | "timeout"
  | "cancelled"
  /** The operation needs a host surface this core does not have — see `Workspace`. Not an argument error and not an engine error: the *call* was fine, the host cannot serve it. */
  | "unavailable";

export interface OpError {
  ok: false;
  code: OpErrorCode;
  message: string;
  /**
   * Mechanically derived only — the nearest catalog match, the valid values of
   * an enum parameter, or DuckDB's own error position. It never suggests what
   * to do next; deciding that is the caller's job, not the catalog's.
   */
  hint?: string;
}

export type OpOutcome = OpResult | OpError;

export function isOpError(outcome: OpOutcome): outcome is OpError {
  return (outcome as OpError).ok === false;
}

/** One statement's raw output. Column *types* deliberately absent — the core reads those from DuckDB's catalog, so they are identical on every engine (see `resultStore.ts`). */
export interface ExecutedStatement {
  columnNames: string[];
  rows: unknown[][];
  elapsedMs: number;
}

/**
 * The engine seam — D49's `QueryEngine` discipline applied one level up, so
 * the same core runs on DuckDB-Wasm in the tab and native DuckDB in Node.
 * Execution only: ingestion, export and file registration stay on `QueryEngine`
 * because the analyst core never does any of them.
 *
 * Cell values are normalized by the executor to one cross-engine convention —
 * `bigint` narrowed to `number` (or a decimal string when outside the safe
 * range), dates and timestamps as epoch milliseconds — matching what
 * `lib/arrow.ts` already hands the rest of the app. Divergence here is a
 * conformance-suite failure, not a caller's problem.
 */
export interface Executor {
  readonly engine: EngineId;
  execute(sql: string, signal?: AbortSignal): Promise<ExecutedStatement>;
}

/** Whether an object was loaded by the user or produced by a derivation — the only distinction `drop_derived` refuses on. */
export type ObjectOrigin = "source" | "derived";

export interface CatalogObject {
  name: string;
  kind: "table" | "view";
  origin: ObjectOrigin;
  /** The statement that produced it. Present for `derived` objects; absent for a source table, which no statement produced. */
  generatingSql?: string;
}

/**
 * The catalog seam — the second half of A3's answer to "one path, not one path
 * per caller."
 *
 * `Executor` lets the core *run* SQL on either engine; it deliberately cannot
 * express what a derivation additionally means to the host: profiling and
 * classifying the result, registering it so it appears in the explorer rail,
 * and passing through whatever guard the host puts between a statement and the
 * engine. The core does not reimplement any of that — the host hands it in.
 *
 * In the browser that implementation is `services/analyst.ts`'s, which routes
 * to `services/transforms.ts` — **the same function the SQL console calls** —
 * so a derived table created by an operation is the same object, by
 * construction rather than by two implementations agreeing. In `eval/` the
 * conformance harness supplies an engine-only one; per D74(d) that is a
 * harness, not a second product path.
 *
 * A core built without a catalog is read-only: the three derive operations
 * refuse rather than half-working.
 */
export interface Catalog {
  /**
   * Every object the host knows the origin of. The *engine* catalog stays
   * authoritative for existence and naming (`information_schema`) — this
   * answers only "who made this, and with what statement?", which no engine
   * records.
   */
  objects(): Promise<CatalogObject[]>;
  /**
   * Apply a derivation through the host's guarded path and return what it
   * registered. `sql` is the complete statement the core composed and the
   * statement the host must run — passed rather than rebuilt, so the `sql` an
   * `OpResult` reports is the SQL that actually executed.
   */
  derive(request: {
    name: string;
    sql: string;
    kind: "table" | "view";
  }): Promise<CatalogObject>;
  /** Drop a derived object the host registered, running the statement the core composed. The core has already refused source objects before this is called. */
  drop(request: {
    name: string;
    sql: string;
    kind: "table" | "view";
  }): Promise<void>;
}

/**
 * Everything `pin_result` hands the host. Note what is *not* here: no tab type,
 * no tab id, no subject, no initializer, no active-tab selection. The core
 * cannot express a tab envelope, so a model calling through it cannot author
 * one — that is D55 made structural rather than promised, and it is why the
 * request is spelled out field by field instead of being an opaque payload the
 * host spreads.
 */
export interface PinRequest {
  /** The model's chosen name for the keeper, already trimmed and length-capped by the core. The host uses it as a *label*; it reaches no other field. */
  title: string;
  /** The statement that produced the result — what the user edits and re-runs. The tier's whole premise rides on this being present. */
  sql: string;
  /** The materialization the rows came from, so the host's grid can page the rest via `read_result`. */
  resultId: string;
  schema: OpSchemaField[];
  rows: unknown[][];
  /** Total rows in the materialization, not `rows.length`. */
  rowCount: number;
  /** Where the next page starts; `null` once `rows` is all of them. */
  nextOffset: number | null;
  elapsedMs: number;
}

/**
 * The workspace seam (A6) — the third host seam, and the narrowest.
 *
 * `Executor` runs SQL; `Catalog` registers what a derivation means to the host;
 * this one answers "where does a keeper go?". A core built without it is
 * *headless*: it computes, and `pin_result` refuses with `unavailable` rather
 * than half-working. The conformance harness and any external process embedding
 * the core are headless by construction; only the tab supplies one.
 *
 * In the browser the implementation is `services/analyst.ts`'s, which calls
 * `openQueryTab` — **the same function pin-from-console and a chosen Suggested
 * Exploration call** (S5) — so a tab the model pinned and a tab the user pinned
 * are the same object rather than two that agree.
 */
export interface Workspace {
  /** Open a keeper for an already-materialized result. The host authors the tab envelope; it is handed only the fields above. Returns the host's own id for it. */
  pin(request: PinRequest): Promise<{ id: string }>;
}
