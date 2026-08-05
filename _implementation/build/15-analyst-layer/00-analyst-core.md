# A0 — The analyst core

**Tier:** v0.71 · **Depends on:** nothing blocking · **Spec:** master §11.5, §19 v0.71, D74
· **Blocks:** A1, A3, A4 · **Status:** built 2026-08-02 (`src/lib/analyst/`, `eval/analyst/`)

One module owns the operation catalog. Typed parameters in, one envelope out, one identifier policy,
one cancellation path, one result store. Mostly a **re-shaping of `src/lib/*` behind a single door**
rather than new computation — the raw material already exists and is inventoried below.

## The envelope

```ts
interface OpResult {
  op: string;
  sql: string | null;        // the exact SQL DataScope ran; null for pure-metadata ops
  resultId: string | null;   // present whenever rows were materialized
  schema: Array<{ name: string; type: string }>;
  rowCount: number;          // total rows in the materialized result, not the preview length
  rows: unknown[][];         // inline rows, up to the preview cap
  complete: boolean;         // rows === the whole result
  nextOffset: number | null;
  elapsedMs: number;
  note?: string;             // deterministic and factual; never advice or relevance
}

interface OpError {
  ok: false;
  code: 'invalid_argument' | 'unknown_object' | 'sql_error' | 'not_read_only'
      | 'result_too_large' | 'timeout' | 'cancelled';
  message: string;
  hint?: string;             // mechanical only: nearest catalog match, valid enum values
}
```

`sql` is populated for **anything that touched the engine** — that is the product bet, not a debug
field. `hint` is mechanically derived (nearest-identifier match, the actual enum values for a bad
parameter, the DuckDB error position) and **never suggests what to do next**; `note` is
deterministic and factual and never editorializes about relevance.

## What already exists (re-point, don't rebuild)

| Capability | Lives in |
| :--- | :--- |
| `SUMMARIZE` → typed `ColumnProfile[]` | `src/lib/profile.ts`, `src/services/ingestion.ts` |
| Semantic column classes with a stated reason | `src/lib/classifier.ts` |
| Table registry: counts, memory, origin, `generatingSql` | `src/types/dataset.ts`, `src/stores/datasets.ts` |
| Histogram, median, top values, date-range stats, sample preview | `src/lib/columnStats.ts` |
| Quartiles, IQR, whiskers, outliers, moments | `src/lib/distributionSql.ts` |
| Value frequency with tail-lumping, category × quantity | `src/lib/categoricalSql.ts` |
| Correlation matrix, scatter extraction | `src/lib/correlationSql.ts` |
| FK inference, containment, ambiguity gap, overrides | `src/lib/relationshipInference.ts` |
| Dataset quality report | `src/services/dataQuality.ts` |
| Insight candidates, probes, scoring, ranked feed | `src/lib/insights.ts`, `src/services/insights.ts` |
| Dataset capability detection, verdict, headline fact | `src/lib/datasetCapabilities.ts`, `src/lib/capabilities.ts` |
| Row-capped SELECT execution, cancellation, history | `src/services/sql.ts` |
| Statement classification | `src/lib/statementClass.ts` |
| Shared guarded run path | `src/services/runPath.ts` (v0.70 S4) |

## The executor interface

The core takes an executor rather than importing DuckDB-Wasm, so **the same core runs in the tab and
in Node**. This is the D49 `QueryEngine` discipline applied one level up, and it is what makes the
eval harness free rather than a parallel implementation.

**The one real cost, stated up front:** DuckDB-Wasm and native DuckDB can diverge on extension
availability, some functions, and memory behaviour — so an operation validated in Node could behave
differently in the tab. **The fix is a test, not a decision.** A0 ships an
**operation-conformance suite that runs against both engines**, and divergence fails the suite
rather than surfacing later as a bug report. A1 extends it per operation.

## The result store (D74h)

- Results are **materialized once and paged from that materialization.** Not for integrity — because
  re-running an unordered query for page 2 returns different rows. **This is correctness.**
- Compaction is **deterministic and versioned**: oldest bulky bodies are replaced by **receipts**
  (result id, SQL, schema, row count, completeness) that are re-readable via `read_result`. It
  **never summarizes cells or reasoning.**
- **Results that contributed to a prior statement are retained ahead of merely recent ones.** A
  recency-only rule can evict the exact evidence a terminal answer needed.

### The memory question, measured not guessed

Retaining every materialization has a cost, and it is **the same question v0.70 S0 was chartered to
measure for query tabs** — keep-mounted state on real reference hardware. A0 inherits it rather than
re-opening it.

**Measured 2026-08-02** — `eval/analyst/measureCeiling.ts`, `npm run analyst:ceiling`, reference
hardware **Apple M1 / 8 GB / macOS 15.7.4, Node 26.5**, both engines, 100k–1M rows across four
column shapes. Per-result engine memory (identical on DuckDB-Wasm and native, to the reported digit):

| Shape | 100k rows | 500k rows | 1M rows |
| :--- | ---: | ---: | ---: |
| 2 × BIGINT | 3.0 MB | 16.5 MB | 31.5 MB |
| BIGINT, DOUBLE, DATE, BOOLEAN | 4.3 MB | 22.5 MB | 42.5 MB |
| 4 × VARCHAR (~24 chars) | 7.9 MB | 41.9 MB | 82.4 MB |
| 4 × VARCHAR (~120 chars) | 52.1 MB | 259.6 MB | 516.6 MB |

**The measurement changed the design, which is why it was worth running.** The first cut charged a
result by a type-derived estimate alone. That estimate over-charges ~24-character text by ~1.5×
(safe) but **under-charges 120-character text by 4×** — a store that believed it held 130 MB while
DuckDB held 517 MB. DuckDB's own `PRAGMA database_size` delta is exact for anything large but rounds
to zero below ~100 KB. So a result is charged **the greater of the two** (`chargedBytes`), which is
never under the truth in either regime; the last column of the harness output is the standing check
that it stays that way.

**Ceiling: 256 MB.** Roughly 8% of DuckDB-Wasm's own default `memory_limit` (3.1 GiB, observed),
leaving the ingested tables the rest — and enough to retain, say, 8M rows of narrow numeric or 3M
rows of ordinary text, well past the 100k-row cap a single result carries today.

**At the ceiling: evict least-valuable-first to a receipt.** Non-contributing results before
contributing ones (D74h), least-recently-read within each group. `result_too_large` is returned only
when a **single** result exceeds the ceiling on its own — never as a way of avoiding an eviction.

## Authority

Read-only is an **engine and process property, not a parser property**:

- derived objects in a writable session catalog;
- `SET enable_external_access = false`, `SET lock_configuration = true`, extension autoload and
  autoinstall disabled, `disabled_filesystems` set;
- one query at a time per session, with a timeout and real cancellation (§21.6).

The hand-frozen read-only SQL grammar is **rejected** (D74): a denylist over a dialect that adds
constructs faster than the list grows is the most expensive item in the build and the weakest
guarantee. The statement classifier is kept only to give a **clear error** when a mutation arrives
at `run_sql` instead of `derive_table`.

### Measured: the configuration is whole-process, and the tab is not one

Probed against DuckDB 1.4 on **both** engines before any of it was written
(`src/lib/analyst/authority.ts` carries the findings inline):

| Attempted | Result |
| :--- | :--- |
| `SET enable_external_access = false`, then `read_csv_auto` over a registered buffer | **Permission Error** — DuckDB's filesystem layer is the same one ingestion reads through, so this ends §7 file drops for the life of the page |
| `SET lock_configuration = true`, then any later `SET` | **Invalid Input Error** — every option, `memory_limit` included, frozen for the process |
| `SET disabled_filesystems` *before* `enable_external_access` | **Permission Error** — the option write itself needs the filesystem; ordering is load-bearing |
| `ATTACH ':memory:' … (READ_ONLY)` | **Catalog Error: Cannot launch in-memory database in read-only mode** — so "source attached read-only" is unavailable to the tab, whose tables are in-memory |

So authority ships as **two profiles**, not one:

- **`sealed`** — the full configuration above, applied wherever the core owns its process. Real
  today in `eval/`; the profile any D74b companion would use.
- **`shared`** — what the tab can apply without ending ingestion: autoload/autoinstall off, one
  query at a time, timeout, real cancellation. There the **`run_sql` statement gate** is what
  refuses a mutation (`not_read_only`, naming `derive_table`). **It is a clear error, not a
  security boundary** — and it does not need to be: a tab that can already run arbitrary SQL in
  §10 Module 2's console is not made more permissive by the catalog (D74a's "strictly narrower
  than the SQL console the user already has").

**Open for a human call:** D74's decision row still states the single-configuration version.
The row was not edited — §11.5 carries the amendment.

## What A0 shipped in the catalog

Seven operations — the spine, not the sixteen. Everything here is a re-shaping of existing
`src/lib/*` behind the door; A1 adds its eight, A3 the three derive verbs.

| Operation | Shape | `sql` |
| :--- | :--- | :--- |
| `get_schema` | app-authored schema, inline | the `information_schema` query |
| `describe_table` | materialized (SUMMARIZE's columns are version-dependent) | `SUMMARIZE "t"` |
| `column_stats` | app-authored schema, inline, **one statement** | the aggregate query |
| `sample_rows` | materialized | `SELECT * FROM "t" LIMIT n` |
| `correlate` | app-authored schema, inline | the batched `corr()` query |
| `run_sql` | materialized, behind the statement gate | the caller's own SQL |
| `read_result` | pages a materialization, or returns its receipt | the originating SQL |

**Two shapes, one rule.** An operation whose columns this repo knows returns them inline with a
declared schema (every aggregate is `CAST` to the declared type, so the schema is *literally* true,
not approximately). An operation whose columns are whatever the data has is materialized, and its
types are read from **DuckDB's catalog** — which is why `schema[].type` is a DuckDB type name and is
identical on both engines by construction, rather than an Arrow name mapped by hand.

**`data_quality` was deliberately not built here.** It is an aggregation over many probe statements
and has no single re-runnable `sql`, which is the field the whole design is built around. It belongs
with A1/A2's surfaces, where it can be composed of catalog calls; S2's panel already ships the
feature.

## Definition of done

- [x] One module exports the catalog; every operation is typed params → `OpResult` | `OpError`.
      (`src/lib/analyst/operations.ts`; `call()` is typed per operation, handlers still validate
      because a model's arguments are untrusted.)
- [x] `sql` is populated for every operation that touched the engine; `null` only for pure metadata.
      (Every A0 operation touches the engine, so `null` is currently unreached — the field stays
      nullable for A1/A3.)
- [x] One identifier-quoting policy, shared with `ingestion.ts` — not a second implementation.
- [x] One cancellation path, honouring `AbortSignal` end to end (see A4 defect iv). Caller signal and
      timeout are combined into one; native DuckDB's `interrupt()` and wasm's `cancelSent()` are both
      reached, so a cancel stops the engine rather than dropping a promise.
- [x] Result store: materialize-once, stable paging, receipts on compaction, contribution-aware
      retention. (`row_number() OVER ()` frozen at materialization is what makes page 2 stable.)
- [x] Memory ceiling **measured on reference hardware**, with the number and the at-the-ceiling
      behaviour written into this doc — see above. The measurement changed the charging rule.
- [x] Executor interface with **two implementations** (DuckDB-Wasm, native `@duckdb/node-api`) and a
      conformance suite that runs against **both**; divergence fails the suite.
      (`eval/analyst/conformance.test.ts`, in `npm test`.)
- [x] Engine-level read-only configuration verified by test, including that a mutation sent to
      `run_sql` returns `not_read_only` rather than executing — with the two-profile finding above.
- [x] At least one existing panel re-pointed at the core as proof the seam works — **not all of
      them**. The Distribution module's quartiles/box plot now come from `column_stats`, and the
      panel's "Quartiles" SQL block shows the core's own `sql`.

## What the conformance suite caught on its first run

Both were real, and neither would have been found by a single-engine test:

1. **A shipped decimal-scaling bug in `src/lib/arrow.ts`.** Scaling was gated on
   `type instanceof Decimal`, which is false whenever DuckDB's Arrow instance differs from the app's
   (apache-arrow ships dual ESM/CJS builds). A `DECIMAL(9,2)` of `25.00` then read back as `2500`,
   silently, with no error anywhere. Fixed to `DataType.isDecimal()`, which compares Arrow's own
   `typeId` rather than class identity. The browser bundle dedupes today, so production was
   *probably* unaffected — but the guarantee rested on bundler behaviour, and now it does not.
2. **`corr()` differs between the engines in the last ~2 ULP** — floating-point aggregation order,
   not a defect. The comparator asserts floats within a relative tolerance and everything else —
   row counts, schemas, types, result ids, integers, strings, error codes, hints — exactly.
