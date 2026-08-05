# A1 — The eight missing operations

**Tier:** v0.71 · **Depends on:** A0 · **Spec:** master §11.5, §19 v0.71, D74 · **Blocks:** A2, A5

Eight gaps in the catalog. **Each is a user-facing feature in its own right**, not model
scaffolding — A2 builds the home each one earns.

## The eight

**1. `validate_sql(sql)`** → `{ ok, statementClass, referencedObjects, plan?, error? }` via `EXPLAIN`.
There is no dry-run path today: neither a model nor a user can check a query without spending a full
execution. Costs no execution and no result slot. **The cheapest quality lever on the whole surface.**

**2. `search_values(term, { tables, columns, mode })`** → per matching column: table, column, match
count, up to five matching values. `mode` is `exact | prefix | contains | ci_contains`. Nothing today
answers *"which column contains the literal `completed`"* — and inventing a filter value that does
not exist is **the single most common small-model failure**.

**3. `distinct_values(table, column, { limit, order, where })`** → value, count, share.
`buildTopValuesSql` is fixed at ten and always ordered by count; this is its parameterized
generalization.

**4. `text_frequency(table, column, { where, unit, top, minLength, stopwords })`** → term, count,
document count, share. `unit` is `word | bigram | trigram`; stopwords default to a frozen English
list, overridable. Today every *"what do people complain about"* question has to be answered by
dumping rows into a context window. **This turns a text-theme question into a computation.**

**5. `time_series({ from, join, dateColumn, grain, metrics, where })`** → one row per period with
metrics, the **period-over-period delta**, and an **explicit flag on unpopulated periods**. `grain`
is `day | week | month | quarter | year`. `querySuggester` names this intent; nothing computes it.

**6. `join_coverage(left, right, { on })`** → matched and unmatched row counts each side, the
multiplicity class (`1:1 | 1:n | n:1 | n:m`), orphan examples, and the join SQL. `on` defaults to the
inferred edge. `relationshipInference` computes containment *during* inference but there is no
addressable operation for it and no helper that hands back the join clause for an inferred edge.

**7. `aggregate({ from, join, metrics, groupBy, where, having, order, limit })`** → grouped rows.
`metrics` are `count_rows | count_distinct | sum | avg | min | max | median | sum_product`.
`pivotCompiler` is pivot-shaped and `buildCategorySummarySql` is fixed at one categorical and one
quantitative column. **This is a convenience, not a fence** — `run_sql` expresses everything it can
and more, and the ablation (below) exists to find out whether the convenience earns its slot.

**8. Result handles and paging** — `read_result(resultId, { offset, limit, columns })`. `runQuery`
materializes into JS and caps at 100k rows: no result identity, no page contract, and therefore no
way to hand a large result to anything without handing over every row. Pages come from the stored
materialization (A0), so **page 2 follows page 1 even without `ORDER BY`**.

## Catalog size is a constraint, not an accident

The full catalog is ~16 operations across orient / look / compute / derive / read-back. **Small
models degrade as the tool list grows**, so this is near the practical ceiling and every entry has
to earn its slot. Two consequences:

- **Do not add a ninth "while we're here" operation.** If something feels missing, it is a candidate
  for the demand curve, not for this phase.
- **The ablation is the check.** The D74 experiment runs a second configuration exposing only
  `get_schema`, `run_sql`, `validate_sql`, `read_result`, `sample_rows` — SQL and nothing else. If
  the full surface does not beat SQL-only for a small local model, **most of this phase is a UI
  feature rather than a model feature**, and the MCP surface shrinks to the SQL core. That is a
  cheap, honest answer to "what else should we build", and it does not retroactively make A2 wrong.

## Definition of done

- [x] All eight land as catalog operations with typed params and the A0 envelope.
- [x] Each returns its `sql` — including `search_values` and `text_frequency`, which are the two
      most tempting to implement in JS. **If it isn't SQL, it can't be re-run by the user.**
- [x] `validate_sql` costs no execution and consumes no result slot (asserted by test).
- [x] `time_series` flags unpopulated periods explicitly rather than omitting the rows.
- [x] `join_coverage` defaults `on` to the inferred edge and returns the join SQL.
- [x] Paging is stable across calls on an unordered query (asserted by test — this is the whole
      reason materialization exists).
- [x] Conformance suite extended per operation, running against **both** engines (A0).
- [x] Stopword list is frozen and versioned, so a text-frequency result is reproducible.

## Built (2026-08-02)

All eight land in `src/lib/analyst/operations.ts`: `validate_sql`, `search_values`,
`distinct_values`, `text_frequency`, `time_series`, `join_coverage`, `aggregate` (new
handlers) plus `read_result` gaining a `columns` projection param
(`src/lib/analyst/resultStore.ts`'s `page()` now accepts an optional column list).
`join_coverage`'s default-`on` inference reuses `relationshipInference.ts`'s own probes
and scoring (`buildParentKeySql`/`buildContainmentSql`/`scoreCandidate`/`nameAgrees`/
`comparisonModeFor`) against freshly-measured stats rather than the app's precomputed
classification, which the core has no access to (D58: one scoring algorithm, not two).
`aggregate` and `time_series` share one metric vocabulary and SQL-building helper
(`count_rows | count_distinct | sum | avg | min | max | median | sum_product`).

One real cross-engine bug surfaced and was fixed during the build: `search_values`
originally built its `sample_values` column via a SQL-side `LIST(... ORDER BY ...)`
aggregate; DuckDB-Wasm's Arrow bridge does not normalize a returned `LIST` cell to a
plain JS array the way it normalizes `bigint`/`DECIMAL` (`lib/arrow.ts`'s `normalizeCell`
has no case for it), so wasm and native produced structurally different values for the
same column — caught by this op's own conformance step, not assumed away. Fixed by
returning flat ranked rows from SQL and grouping the top five per (table, column) in JS
instead, sidestepping the gap rather than extending `arrow.ts`'s normalizer (out of
scope here — it is shared by every other consumer of `tableToQueryResult`).

`eval/analyst/conformance.test.ts` gained four dedicated assertions beyond the generic
envelope/error-agreement checks, one per DoD invariant that needed more than "wasm and
native agree": no-execution/no-result-slot for `validate_sql` (checked by re-reading the
same column before and after validating an `UPDATE` against it), the gap flag for
`time_series`, the inferred-edge default for `join_coverage`, and same-offset repeat-read
stability for a materialized result. `eval/analyst/fixtures.ts`'s script grew one case
per operation plus these targeted ones. Full suite green: `npx vitest run` (195 files,
1958 tests), `npx tsc --noEmit -p tsconfig.json` clean, `npx oxlint` clean on changed
files.
