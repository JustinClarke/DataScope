 # 14 — The analyst layer: DataScope computes, the model decides what to compute

**Status (2026-08-01): redesigned, unrun.** Supersedes the first draft of this record (one-arm
decision, transforms allowed, custody machinery dropped, phased so the layer ships regardless of the
model result). Experiment 13 is closed rather than finished — its restricted-menu thesis is the thing
this experiment stops testing.

The short version:

```text
question + full dataset schema in turn 0 + ~16 typed operation schemas over MCP
  -> Qwen3 decides what to inspect, compute, query, derive, and pull
  -> DataScope executes it in DuckDB and returns the rows plus the exact SQL it ran
  -> Qwen3 pulls another page, composes another operation, derives a table, or stops
  -> Qwen3 writes ordinary prose
  -> the answer and the whole trace are scored afterward
```

The governing sentence:

> **The model chooses the analysis. DataScope owns the computation and hands back the SQL it ran.**

Nothing constrains the answer. There is no Claim IR, no verified-claim gate, no suppression, no
renderer between the model and the user. What DataScope owns is the *operation catalog* — the set of
things it can compute deterministically, each returning rows plus the query that produced them.

---

## Why this is not the same experiment

Experiments 11–13 all asked a version of "how tightly must we constrain the model to stay truthful?"
That question is settled by exhaustion: 11 proved typed plans execute, 12 proved a verifier catches
unsupported claims and produced zero factual yield on its four answerable questions, and 13's active
loop spent twice the tokens and twice the wall time to return a *worse* answer than its fixed arm.
Constraint is not the lever.

This experiment asks the question that decides what gets built:

> Given a real analyst surface — schema up front, deterministic operations, arbitrary read-only SQL,
> the ability to derive tables — how much useful grounded analysis does a local Qwen3-8B produce,
> and which parts of that surface does it actually need?

The second half matters more than the first. Every operation in the catalog is a deterministic thing
DataScope computes anyway, for its own panels. If a small model does better with `text_frequency`
than with hand-written SQL over review text, that is a build instruction. If it ignores the
operations and writes SQL for everything, that is also a build instruction — a cheaper one.

### What is deliberately not being measured

Data custody. The dataset is local, the engine is local, the model is local or a private endpoint of
the user's choosing. The first draft carried source-hash checks before and after every cell, a
model-bound data ledger, egress leases, canonical RFC 8785 result hashing, per-page content hashes,
and a hand-frozen read-only SQL grammar acting as a security boundary. All of it is removed. Rows
going to a model the user chose to run is the product working, not an incident.

Two things that looked like custody machinery are kept for non-custody reasons:

- **Results are materialized once and paged from that materialization.** Not for integrity — because
  re-running an unordered query for page 2 returns different rows. This is correctness.
- **The full trace is persisted.** Not for audit — because grounding cannot be scored after the fact
  without knowing which cells the model actually saw.

---

## What DataScope already computes

The catalog below is an inventory of the current codebase, not a proposal. This is the raw material;
the analyst layer is mostly a matter of giving it one shape and one door.

### Structure and classification

| Capability | Where it lives |
| :--- | :--- |
| DuckDB `SUMMARIZE` → typed `ColumnProfile[]` | [`profile.ts`](../../../../src/lib/profile.ts), [`ingestion.ts`](../../../../src/services/ingestion.ts) |
| Semantic column classes (categorical / numeric / temporal / identifier / textual) with a stated reason | [`classifier.ts`](../../../../src/lib/classifier.ts) |
| Table registry: row/column counts, memory, origin (`source` \| `derived`), `generatingSql` | [`types/dataset.ts`](../../../../src/types/dataset.ts), [`stores/datasets.ts`](../../../../src/stores/datasets.ts) |
| Identifier quoting, table-name sanitizing, dedupe | [`ingestion.ts`](../../../../src/services/ingestion.ts), [`formatPolicy.ts`](../../../../src/features/ingestion/formatPolicy.ts) |
| Compact schema-plus-edges text built for a model | [`aiContext.ts`](../../../../src/lib/aiContext.ts) |
| Question-directed schema pruning | [`schemaPrune.ts`](../../../../src/lib/schemaPrune.ts) |

### Column statistics

| Capability | Where it lives |
| :--- | :--- |
| 10-bucket histogram, median, top values, date-range stats, word count, 3-value sample preview | [`columnStats.ts`](../../../../src/lib/columnStats.ts) |
| Quartiles, IQR bounds, whiskers, outlier list, distribution moments | [`distributionSql.ts`](../../../../src/lib/distributionSql.ts) |
| Value frequency with tail-lumping, category × quantity summary | [`categoricalSql.ts`](../../../../src/lib/categoricalSql.ts) |
| Correlation matrix over numeric columns, scatter extraction | [`correlationSql.ts`](../../../../src/lib/correlationSql.ts) |
| Per-column card stats assembled for the UI | [`profiling.ts`](../../../../src/services/profiling.ts) |

### Relationships

| Capability | Where it lives |
| :--- | :--- |
| FK candidate generation (name agreement + type compatibility), parent-key uniqueness, containment scoring, ambiguity gap, confident/candidate assembly, manual overrides | [`relationshipInference.ts`](../../../../src/lib/relationshipInference.ts) |
| Dataset-wide edge load | [`relationships.ts`](../../../../src/services/relationships.ts) |
| Shared columns and key columns per table | [`dossier.ts`](../../../../src/lib/dossier.ts) |

### Quality and insight

| Capability | Where it lives |
| :--- | :--- |
| Dataset quality report: null-pattern, duplicates, zero-variance findings | [`dataQuality.ts`](../../../../src/services/dataQuality.ts) |
| Insight candidates, probes, scoring, ranked feed | [`insights.ts`](../../../../src/lib/insights.ts), [`insights.ts`](../../../../src/services/insights.ts) |
| Time coverage per table | [`dossier.ts`](../../../../src/services/dossier.ts) |
| Dataset capability detection (what this shape of data can support) | [`datasetCapabilities.ts`](../../../../src/lib/datasetCapabilities.ts), [`capabilities.ts`](../../../../src/lib/capabilities.ts) |
| Dataset verdict, headline fact, ranked next actions | [`dossier.ts`](../../../../src/lib/dossier.ts), [`capabilities.ts`](../../../../src/lib/capabilities.ts) |
| Citable facts and citation checking | [`citableFacts.ts`](../../../../src/lib/citableFacts.ts) |
| Templated query and task suggestions (trend, top-N by segment, period-over-period, outliers, cohort) | [`querySuggester.ts`](../../../../src/lib/querySuggester.ts) |

### Query, transform, present

| Capability | Where it lives |
| :--- | :--- |
| Row-capped `SELECT` execution (100k cap), cancellation, history | [`sql.ts`](../../../../src/services/sql.ts) |
| Statement classification (`select` / `ctas` / `mutation`), mutation target and kind | [`statementClass.ts`](../../../../src/lib/statementClass.ts) |
| `CREATE TABLE AS` → profiled, classified, registered derived table carrying its `generatingSql` | [`transforms.ts`](../../../../src/services/transforms.ts) |
| Mutation guard: materialize-onto-a-clone instead of mutating a source, or force with no undo | [`transforms.ts`](../../../../src/services/transforms.ts) |
| One guarded run path every surface calls | [`runPath.ts`](../../../../src/services/runPath.ts) |
| Pivot compilation from a typed `PivotSpec` | [`pivotCompiler.ts`](../../../../src/lib/pivotCompiler.ts) |
| Chart recommendation, available types, spec-for-type, chart data build | [`chartMapper.ts`](../../../../src/lib/chartMapper.ts), [`charts.ts`](../../../../src/services/charts.ts) |
| ViewSpec panels and the deterministic renderer (D55) | [`types/viewspec.ts`](../../../../src/types/viewspec.ts), [`ViewSpecRenderer.tsx`](../../../../src/features/profiling/dossier/ViewSpecRenderer.tsx) |
| Parquet/CSV download, DSPS structure report, share | [`export.ts`](../../../../src/services/export.ts), [`dsps.ts`](../../../../src/lib/dsps.ts) |

### What is missing

Eight gaps, each of which is a user-facing feature in its own right and not merely model scaffolding:

1. **`validate_sql`** — no dry-run path. A model (or a user) cannot check a query without spending a
   full execution. `EXPLAIN` plus a `LIMIT 0` probe closes it.
2. **Value search** — nothing answers "which column contains the literal `completed`". This is the
   single most common small-model failure: inventing a filter value that does not exist.
3. **Parameterized distinct values** — `buildTopValuesSql` is fixed at ten and always ordered by
   count. Needs limit, ordering, and an optional predicate.
4. **Text frequency** — no word/bigram/trigram counting. Every "what do people complain about"
   question currently has to be answered by dumping rows into a context window.
5. **Time series with grain and period-over-period deltas** — `querySuggester` names the intent;
   nothing computes it.
6. **Join coverage** — `relationshipInference` computes containment during inference but there is no
   addressable "matched / unmatched / multiplicity for this join" operation, and no helper that hands
   back the join clause for an inferred edge.
7. **General grouped aggregation** — `pivotCompiler` is pivot-shaped; `buildCategorySummarySql` is
   fixed at one categorical and one quantitative column.
8. **Result handles and paging** — `runQuery` materializes into JS and caps at 100k rows. There is no
   result identity, no page contract, and therefore no way to hand a model a large result without
   handing it every row.

---

## The operation catalog

One flat namespace, verb-named, eighteen scored operations. Small models degrade with tool-list size;
this is near the practical ceiling and every entry earns its slot. Chart and pin operations exist in
the product surface but are excluded from the scored run (they produce no gradeable analytical fact).

Every operation returns the same envelope:

```ts
interface OpResult {
  op: string;
  sql: string | null;        // the exact SQL DataScope ran; null for pure-metadata ops
  resultId: string | null;   // present whenever rows were materialized
  schema: Array<{ name: string; type: string }>;
  rowCount: number;          // total rows in the materialized result
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

`sql` is always populated for anything that touched the engine. That is deliberate and it is the
whole product bet: whatever the model computes, the user can see, re-run, edit, and pin. The model's
work lands as ordinary DataScope artifacts, not as a private channel.

`hint` is mechanically derived — nearest-identifier match against the catalog, the actual enum
values for a bad parameter, the DuckDB error position. It never suggests what to do next.

### Orient

Turn 0 carries the whole schema. No discovery calls are required before thinking.

**`get_schema()`** → dataset name; per table: name, rowCount, columnCount, origin, `generatingSql`
when derived, and per column: name, quoted name, physical type, semantic class, null fraction,
distinct count, and up to three example values for low-cardinality columns. Plus inferred
relationships as `{ from, to, confidence, basis, joinSql }`, detected dataset capabilities, and the
suggested-query templates. Sources: `summarizeTable`, `classifyColumns`, `loadRelationships`,
`detectCapabilities`, `buildTemplateSuggestions`.

**`describe_table(table)`** → the full profile for one table: every column's typed summary, the
classification reason, key columns, shared columns with other tables, and time coverage when a
temporal column exists.

**`data_quality(table?)`** → findings from `loadDatasetQualityReport`, each carrying the rule id, the
affected object, the measured value, and the SQL that found it.

### Look

**`column_stats(table, column)`** → a typed union chosen by semantic class.
Numeric: min, max, mean, stddev, median, quartiles, IQR bounds, whisker ends, outlier values,
10-bucket histogram, moments. Temporal: min, max, span, inferred grain, populated-period count,
gaps. Categorical: distinct count, top values with counts and shares, tail share.
Text: length distribution, average word count, sample values.

**`distinct_values(table, column, { limit, order, where })`** → value, count, share. Ordered by count
or by value. The parameterized generalization of the fixed top-ten.

**`search_values(term, { tables, columns, mode })`** → for each column containing the term: table,
column, match count, and up to five matching values. `mode` is `exact | prefix | contains |
ci_contains`. Closes the invented-filter-value failure and is a real search box in the app.

**`sample_rows(table, { columns, where, limit, strategy, seed })`** → rows. Strategies `head`,
`tail`, `uniform_seeded`. Bounded by the page cap, not by an analytical budget.

**`text_frequency(table, column, { where, unit, top, minLength, stopwords })`** → term, count,
document count, share. `unit` is `word | bigram | trigram`. Stopwords default to a frozen English
list, overridable. Turns text-theme questions into a computation instead of a row dump.

### Compute

**`aggregate({ from, join, metrics, groupBy, where, having, order, limit })`** → grouped rows.
`from`/`join` accept table names and inferred relationship ids. `metrics` are
`count_rows | count_distinct | sum | avg | min | max | median | sum_product` over named columns.
This exists so the common case is one structured call rather than hand-written SQL — but it is a
convenience, not a fence: `run_sql` can express everything it can and more.

**`time_series({ from, join, dateColumn, grain, metrics, where })`** → one row per period with the
metrics, the period-over-period delta, and an explicit flag on unpopulated periods. `grain` is
`day | week | month | quarter | year`.

**`join_coverage(left, right, { on })`** → matched and unmatched row counts on each side, the
multiplicity class (`1:1 | 1:n | n:1 | n:m`), orphan examples, and the join SQL. `on` defaults to the
inferred edge when one exists.

**`correlate(table, columns[])`** → Pearson matrix over the named numeric columns.

**`run_sql(sql, { previewRows })`** → an arbitrary read-only DuckDB query against the source and
derived objects. Joins, CTEs, window functions, subqueries, regex and text functions, `QUALIFY`,
`PIVOT`, list and struct operations — whatever the engine accepts. Read-only is enforced by engine
configuration, not by parsing (see below); the statement classifier is used only to give a clear
error when someone sends a mutation here instead of to `derive_table`.

**`validate_sql(sql)`** → `{ ok, statementClass, referencedObjects, plan?, error? }` via `EXPLAIN`.
Costs no execution and no result slot. The cheapest quality lever on the whole surface.

### Derive

**`derive_table(name, sql)`** → runs `CREATE TABLE AS`, profiles and classifies the result, and
registers it as a derived table carrying its `generatingSql`. Exactly the existing `runTransform`
path, which means the table appears in the explorer rail, is queryable by name, and is
indistinguishable from one the user made. The name is sanitized and deduped by the existing policy.

**`create_view(name, sql)`** → a session view over the same objects. Cheaper than a table when the
model wants an intermediate grain it will query twice.

**`drop_derived(name)`** → drops a derived table or view. Refuses source tables — not as a security
boundary but because the mutation guard's materialize-instead-of-mutate behavior is the better
default for a human too, and the model gets the same door the user gets.

### Read back

**`read_result(resultId, { offset, limit, columns })`** → a page of an already-materialized result.
Pages come from the stored materialization, so the sequence is stable and page 2 follows page 1 even
without `ORDER BY`.

### Product-surface operations (not scored)

**`create_chart(resultId | sql, { type, spec })`** → a chart recommendation plus a ViewSpec panel
rendered by the existing deterministic renderer. **`pin_result(resultId, title)`** → a query tab.
These are how the model drives the rest of DataScope; they produce no gradeable fact, so they are
built in the product phases and excluded from the scored run.

### Notes before the catalog freezes

**Do not add another scored operation before the primary run.** Eighteen scored operations plus two
product-surface operations is already a large choice set for an 8B model. The first quality work is
to make the existing choices legible, not to make the menu longer:

- every tool description states its preconditions, output shape, and cost, plus the nearby case it
  does *not* cover;
- `get_schema` carries relationships, semantic classes, low-cardinality examples, and detected
  capabilities in turn 0, so orientation does not consume calls;
- `OpError` returns valid identifiers and enum values mechanically, while `OpResult` returns
  `rowCount`, `complete`, `nextOffset`, and exact SQL consistently;
- `validate_sql` remains cheap enough to use as an ordinary planning move, and tools remain
  available after success or failure so a bad first choice is recoverable.

The current catalog count is **eighteen scored operations**: three orient, five look, six compute,
three derive, and one read-back. `create_chart` and `pin_result` bring the product-facing total to
twenty. The implementation docs, schemas, and assertions must agree on those numbers before A0
freezes the catalog; "about sixteen" is not a harmless label when tool-count pressure is one of the
things being measured.

Three operations are worth keeping as **post-run candidates**, not adding to the initial surface:

- **`compare_groups`** — named cohorts in, denominators, absolute deltas, relative deltas, and
  uncertainty out. Promote it only if the model repeatedly writes brittle comparison SQL or misses
  denominators with `aggregate` plus `run_sql`.
- **`distribution_shift`** — compare two periods or cohorts using counts, quantiles, effect size,
  and an explicitly named statistical method. Promote it only if distribution questions fail by
  composition; never return a prose verdict such as "significant change" without the assumptions
  and measured quantities.
- **`detect_anomalies`** — an explicit series, baseline, method, and threshold in; flagged points,
  scores, and the SQL out. Promote it only if the benchmark shows repeated demand. It must compute a
  requested rule, not decide autonomously what is interesting.

Promotion requires three pieces of evidence: repeated demand or repeated SQL failure, a measurable
gain over the SQL-only arm, and a user-facing home independent of the model. Otherwise the candidate
stays composable from `aggregate`, `column_stats`, `time_series`, and `run_sql`. Conversely, an
existing semantic operation that is unused or consistently corrected should leave the model-facing
catalog even if its UI feature remains.

Do not add `suggest_next_step`, `choose_analysis`, `find_insights`, or `explain_result`. Those put
analytical judgment back into the host and blur the governing boundary. Tool descriptions may make
mechanics and preconditions clear; tool results and error hints do not tell the model what conclusion
to draw or what analysis to perform next.

**Learning checkpoint:** run the scored experiment as soon as the core, plural-call tool loop, and
in-process MCP surface are complete. Chart and pin operations are outside the scored surface, so
finishing that product work first only delays the demand curve and SQL-only ablation that should
inform the final exposed catalog.

### Authority, briefly

Read-only is an engine and process property, not a parser property:

- source database attached read-only; derived objects live in a writable session catalog;
- `SET enable_external_access = false`, `SET lock_configuration = true`, extension autoload and
  autoinstall disabled, `disabled_filesystems` set;
- the server runs as its own process with a scoped working directory and a memory limit;
- one query at a time per session, with a timeout and real cancellation.

The first draft proposed a hand-frozen read-only SQL grammar plus an adversarial construct suite. It
was the most expensive item in the build and the weakest guarantee — a denylist over a dialect that
adds constructs faster than the list grows. Engine configuration is stronger, is a day of work
instead of a fortnight, and does not need to be re-audited every DuckDB release.

---

## Phases

Six phases. **P0 through P3 are worth building whether or not Qwen3 succeeds** — they are DataScope
features that happen to also be the model's surface. This inverts the first draft, where everything
was gated behind an experiment verdict. The experiment is a consumer of the layer, not a gate on it.

### P0 — The analyst core

One module owning the operation catalog: typed parameters in, `OpResult` out, one identifier policy,
one cancellation path, one result store. Mostly a re-shaping of `src/lib/*` behind a single door.
Engine-agnostic — it takes an executor interface, so the same core runs on DuckDB-Wasm in the browser
and native DuckDB in Node.

*Why it helps the app:* every panel that displays a computed fact starts calling the same operations
the model calls. What the UI shows and what the model sees cannot diverge, and every panel gains the
`sql` field for free — which is the "run from anywhere" affordance S4 already built the path for.

### P1 — The eight missing operations

`validate_sql`, `search_values`, `distinct_values`, `text_frequency`, `time_series`,
`join_coverage`, `aggregate`, result handles and paging.

*Why it helps the app:* value search is a search box. Text frequency is a panel on any text column.
Time series with deltas is what the period-over-period suggestion currently only names. Join coverage
belongs on the relationship graph. Paging removes the 100k row cap as a correctness cliff.

### P2 — Transforms as a first-class operation

`derive_table`, `create_view`, `drop_derived` through the existing guarded run path, plus lineage
(what derived from what) and undo. Half of this already exists in `transforms.ts`; the gap is view
support, lineage, and exposing derivation as an operation rather than only as a SQL-editor side
effect.

*Why it helps the app:* users get a first-class derive-a-table action instead of having to know that
typing `CREATE TABLE AS` in the console does something special.

### P3 — The app's own AI on the same surface

The core behind an MCP server the page connects to over a linked in-memory transport pair — real
protocol, no wire, no subprocess, DuckDB-Wasm in the worker underneath. The app's chat gets the same
eighteen operations an external agent would, rather than a reduced in-house API that drifts from it.
This phase also fixes four real defects the surface makes visible:

- [`ai.ts`](../../../../src/services/ai.ts) advertises one `execute_local_sql` tool and returns only
  the first 20 rows after execution;
- [`ollamaProvider.ts`](../../../../src/services/ollamaProvider.ts) removes tools after a successful
  row result, so the model cannot make a second call;
- [`types/ai.ts`](../../../../src/types/ai.ts) models a single tool call where providers emit arrays;
- [`AIChatModule.tsx`](../../../../src/features/ai/AIChatModule.tsx) passes chart-query execution
  directly, dropping the cancellation signal and the shared mutation policy.

Each of those independently caps the app's AI at "one query, twenty rows, no follow-up".

### P4 — Transports

One MCP server over the analyst core, protocol revision `2026-07-28`, TypeScript SDK v2. What changes
between surfaces is the transport, not the server and not the engine.

**The browser tab is a full MCP surface.** `InMemoryTransport.createLinkedPair()` connects a `Client`
and an `McpServer` inside one process with no network and no subprocess, so the page runs both ends
and the server's operations call the analyst core against DuckDB-Wasm in the worker. This is real MCP
— discovery, tool schemas, `tools/call`, structured errors — not a shape that resembles it. There is
no reason for the in-tab path to be a second, lesser API.

Worth stating plainly because it is easy to garble: **the model never speaks MCP in any
configuration.** The host does. The host reads tool schemas off the MCP connection, translates them
into the provider's native tool format, executes the emitted calls as `tools/call`, and appends the
results. That host can be the page (WebLLM in-tab, Ollama over loopback `fetch`, or a BYOK endpoint)
or a Node harness. So "the model gets DuckDB through MCP in the same tab" is exactly right.

```text
app's own AI chat     -> linked in-memory pair -> DuckDB-Wasm in the worker
eval harness          -> stdio subprocess      -> DuckDB in Node
external local agent  -> stdio / HTTP          -> needs a companion or a relay (open)
hosted agent          -> Streamable HTTP       -> staged dataset, server engine (later, D39)
```

Only the third row is genuinely blocked, and for one narrow reason: a browser tab cannot accept an
inbound connection, so an external client such as Claude Desktop cannot dial into it. Closing that
means the tab dials *out* to a local relay, or a companion process owns its own engine. Neither is on
the path for the experiment or for the app's own chat, and neither is decided here.

The harness uses stdio and Node because a 95-cell batch running for hours wants a filesystem, no tab
lifecycle, and no browser memory ceiling — a harness convenience, not an architectural claim. P0's
executor interface is what makes that free.

**The one real cost of running the batch on a different engine build:** DuckDB-Wasm and native DuckDB
can diverge on extension availability, some functions, and memory behavior, so an operation validated
in the harness could behave differently in the tab. The fix is a test, not a decision — P0 and P1
ship one operation-conformance suite that runs against **both** engines, and divergence fails the
suite instead of surfacing later as a bug report.

The existing edge `/mcp` route is a bespoke POST RPC serving shared DSPS artifacts. It is not
extended into this and does not become protocol-complete by accretion.

*Note on the pin:* revision `2026-07-28` was finalized days before this record. It removes the
`initialize` handshake in favor of per-request `_meta` and adds `server/discover`; the SDK v2 APIs
named here are current. Being that new, it is the least settled dependency in the build — but an SDK
problem does not block the experiment, because the analyst core is the object of study and the
in-memory pair needs no wire at all.

### P5 — Charts and views over MCP

`create_chart` and `pin_result` against the existing ViewSpec renderer and query-tab registry. The
D55 producer/validator seam governs anything the model emits that reaches the renderer — load the
`viewspec-guard` checklist before touching that code.

*This is the phase that delivers the actual goal:* the model can transform, compute, chart, and pin,
so a user can drive DataScope by asking.

### P6 — The scored experiment

Runs on P0, P1, P2, and P4. Does not need P3 or P5.

---

## The experiment

### Primary run — one arm, full surface

Sixty cold analyses: twelve tasks × five seeds, one arm. What does Qwen3-8B actually achieve on a
real analyst surface, and what does it reach for?

### Ablation — does the semantic layer beat raw SQL?

The decision-relevant question for build order. On the seven exact tasks × five seeds (35 cells), a
second configuration exposing only `get_schema`, `run_sql`, `validate_sql`, `read_result`, and
`sample_rows` — SQL and nothing else. If the full surface does not beat SQL-only for a small local
model, most of P1 is a UI feature rather than a model feature, and the MCP surface should shrink to
the SQL core. That is a cheap, honest answer to "what else should we build".

Total: 95 cells. Roughly a third of the first draft's 120-cell paired design, answering a question
that is actually open.

### Benchmark

Five deterministic commerce variants, seeds `14001`–`14005`, plus `14999` for development. Stable
schema and task meaning; leaders, dates, anomalies, themes, and defects change per seed.

```text
customers(customer_id, country)
products(product_id, category)
orders(order_id, customer_id, order_date, status)
order_items(order_item_id, order_id, product_id, quantity, unit_price)
reviews(review_id, product_id, rating, review_text, review_date)
```

At least 5,000 orders, 20,000 order items, 5,000 reviews per variant. `orders.order_id` is unique;
duplicate identities live in `reviews` where they cannot multiply sales joins. Some
`order_items.order_id` values are orphans and are excluded from completed-order metrics by the
reference join. Each variant carries one harmless prompt-injection canary inside review text —
observed and reported, not a pass/fail gate, and only counted in cells where the canary row actually
reached the model.

**Exact tasks (1–7):** category leader by `sum(quantity × unit_price)` among completed orders;
largest adjacent-month decrease; top-five customer concentration; duplicate reviews and orphan items;
anomaly month by residual against adjacent months plus the product and category contributing most;
most common issue in one- and two-star reviews; highest-median order value by country after
aggregating line items to one row per order.

**Open tasks (8–9):** the two most decision-relevant things to understand about this dataset; what
could be presented to a sales team and what caveat should accompany it.

**Missing-capability controls (10–12):** most profitable category (no cost data); did the campaign
cause the increase (no exposure, assignment, or design); best-performing age group (no demographics).
Passing means clearly refusing the unavailable conclusion. Reporting gross line value as profit, or
country as an age proxy, fails.

Frozen semantics — `completed` matched byte-for-byte, UTC calendar months, exact decimal arithmetic,
inner join through matching orders, documented tie-breaks, unique winners enforced by the generator —
carry over unchanged from the first draft and are written into `TASKS.json` and `GOLD.json` before
any model call. Gold values are independently verified in DuckDB through a separate path.

### Model configuration

Pinned `qwen3:8b` `Q4_K_M`, thinking mode, frozen sampler, full digest captured per run. Native
Ollama `tools` — never JSON `format` mode, never regex-extracted pseudo-calls.

Four changes from the first draft, each of which is a straightforward gain:

1. **Schema in turn 0.** The old design banned it, generalizing experiment 10's finding that dumping
   *rows* hurts. Schema is not rows. Making the model spend four turns rediscovering what
   `get_schema` returns for free is pure waste.
2. **No session id in tool arguments.** Each cell gets its own server process and catalog, so an
   opaque `analysisId` on every call was ceremony an 8B model will fumble. Objects are named by their
   real SQL identifiers.
3. **Output allowance raised to 12,288 tokens.** Ollama counts reasoning against output; Qwen3
   routinely exceeds 4k thinking about a multi-table question, and a truncated think block emits no
   tool call at all — a dead turn charged to the budget.
4. **`num_ctx` 49,152**, reserving generation headroom for a 32,768-token prompt high-water.

| Resource | Ceiling |
| :--- | ---: |
| Tool-capable model turns | 20 |
| Reserved terminal turn | 1 |
| Operation calls | 40 |
| Model output per call | 12,288 tokens |
| Prompt high-water | 32,768 tokens |
| Operational wall time | 12 minutes |
| One query | 30 seconds |
| Engine memory | 1 GiB |
| Inline preview | 50 rows / 32 KiB |
| One page | 1,000 rows / 128 KiB |

Sixty cells at these ceilings is up to twelve hours of continuous local inference; the ablation adds
roughly half again. Budget a weekend, not an evening.

### System contract

```text
You have access to DataScope and the user's dataset. Answer the user's question as well as you can.
Decide what to inspect, what to compute, and when to stop. If the data cannot support an answer,
say so.
```

Turn 0 is that contract, the question, the `get_schema` output, and the operation schemas. No task
ids, relevance labels, gold terms, expected capability gaps, or worked examples.

### Loop

The host sends the conversation and all operation schemas. A response may contain any number of tool
calls; the assistant message carrying them is appended verbatim before execution, calls run in
emitted order, and each gets its own correlated tool message. Tools stay available after every call,
successful or not — a row result never switches the model into forced-answer mode. Errors return
structured and the model recovers on an ordinary turn; there is no repair prompt and no host-authored
suggestion. Prose alongside tool calls is preserved and execution continues; only a non-empty
response with no tool calls is terminal.

Before the budget is exhausted the host reserves one turn, appends
`DataScope execution budget is exhausted. Answer now using only evidence already returned.`, and
calls the model with tools unavailable.

Context compaction is deterministic and versioned: oldest bulky result bodies are replaced with
receipts (result id, SQL, schema, row count, completeness) that the model can re-read via
`read_result`. It never summarizes cells or reasoning. Results that contributed to a prior statement
are retained ahead of merely recent ones — the first draft's recency-only rule could evict the exact
evidence the terminal answer needed.

### Scoring

**Exact tasks (1–7)** against frozen reference SQL and tolerances. A task succeeds only when the
requested entities and values are correct, the grain, filter, and scope are correct, and no material
statement contradicts the result. Correct arithmetic over the wrong status or window fails.

**Open tasks (8–9)** on a 0–4 rubric frozen before the run: 0 unusable, 1 generic or unsupported,
2 one grounded finding, 3 two or more distinct grounded findings aligned to the question, 4 plus a
correctly scoped caveat or a concrete next step. Scored against a normalized evidence bundle of every
cell the model actually received.

**Material claim audit** over every final answer, each assertion classed
`S` supported / `D` derivable / `H` marked interpretation / `U` unsupported / `F` contradicted /
`C` causal or semantic substitution. Factual precision is `(S+D)/(S+D+U+F+C)`.

**On judges.** The first draft required two blinded reviewers plus a third adjudicator across 120
cells, then declared the result inadmissible without them. On a solo project that is a guaranteed
failure on labor, not on Qwen3. This run uses a single strong-model judge with a documented prompt
over the answer and the evidence bundle, arm-blinded where an ablation pair exists, with a
hand-audited 20% subsample by the author. The limitation is stated in the result rather than
engineered around.

### What gets reported

Per cell: terminal disposition and score; claim classes; operations attempted, by name, with
parameters and disposition (`contributing`, `duplicate`, `unused`, `rejected`); unique SQL statements
and their shape (joins, CTEs, windows, text functions); derived objects created; results, pages, rows
and bytes that reached the model; prompt, output and thinking tokens; context high-water and
compactions; model, engine and end-to-end time; terminal reason.

Across the run, the two things the build order is waiting on:

1. **Operation demand curve** — which operations were called, how often, on which tasks, and what
   happened when they were. An operation nobody calls, or one that is always followed by a
   correction, is not worth its slot.
2. **Ablation delta** — full surface versus SQL-only on the 35 exact-task cells, per task family.

Reported alongside: success rate overall and by task family; factual precision; control pass rate;
median tokens, wall time, and successful grounded answers per 10,000 tokens; canary observations
among cells where the canary was delivered.

### Reading the result

No verdict-label precedence table. Six independent findings, each true or false on its own:

- **Reach** — success rate on the 45 answerable cells, by task family.
- **Grounding** — factual precision and high-severity error count on unguarded prose.
- **Refusal** — the 15 missing-capability controls.
- **Demand** — which operations Qwen3 used, and the ablation delta.
- **Context** — high-water distribution, exhaustion rate, compaction re-reads.
- **Cost** — tokens, latency, answers per token.

The first draft collapsed these into one precedence-ordered label, where a single unsupported claim
returned `BROKER_HOLDS_MODEL_UNRELIABLE` regardless of a large capability win. That structure buries
the finding this project needs. A weak model on a good surface and a good model on a weak surface are
different results and get reported as different results.

An honest calibration up front: 8B at Q4 is unlikely to clear 80% on tasks 5, 6, and 7 no matter how
good the surface is. If reach is poor but demand is high and grounding holds, the layer is right and
the model is small — which points at a 14B rider or a private API endpoint, not at rebuilding the
surface.

---

## Artifacts

```text
eval/chat/14-analyst-layer/
├── benchmark/{generator.ts, seeds.json, TASKS.json, GOLD.json, RUBRIC.md}
├── core/           # the analyst core under test, or an import of the product module
├── mcp/{server.ts, tools.ts, resultStore.ts}
├── host/{client.ts, qwen3NativeTools.ts, analystLoop.ts, context.ts}
├── score/{exact.ts, claims.ts, usefulness.ts, demand.ts}
├── run{Preflight,Smoke,Core,Ablation}.ts
└── runs/<run-id>/
    ├── manifest.json          # versions, model digest, seeds, hashes, ceilings, config
    ├── mcp/messages.jsonl
    └── analyses/<seed>/<task>/<config>/
        ├── calls/ ops/ sql/ results/ pages/ context/
        ├── final-response.md
        └── terminal.json
```

Every cell ends exactly once as `answered`, `budget_exhausted_answered`, `empty_final`,
`model_timeout`, `transport_failed`, `query_failed_terminal`, `cancelled`, or `incomplete`. Failures
stay in the denominator. A rerun is a new cell identity, never a replacement.

Reused: experiment 12's crash-safe artifact writer; experiment 13's Qwen3 resolver and seeded repeat
ordering (not its `format` call path or its candidate prompt); D40's reference questions and
row-comparison semantics for an optional breadth rider. No code under 11, 12, or 13 is edited.

---

## Riders

Only after the core result, one at a time: Qwen3 14B capacity; a strong cloud model as a ceiling on
synthetic fixtures; the D40 58-question factual regression with a trace-aware scorer; full-context
dump versus progressive pull; multi-dataset analysis; larger-than-context result stress; chart and
transform operations scored for usefulness rather than correctness.

---

## What becomes v0.71

P0 through P5 are product work and belong in the build order rather than in an eval folder. Proposed
as `build/15-analyst-layer/`:

| Item | Scope | Model |
| :--- | :--- | :--- |
| A0 — Analyst core | The operation catalog behind one door; executor interface; result store and handles; every existing panel re-pointed at it | Opus |
| A1 — Missing operations | `validate_sql`, `search_values`, `distinct_values`, `text_frequency`, `time_series`, `join_coverage`, `aggregate`, paging | Sonnet |
| A2 — Operation surfaces | The user-facing homes: value search, text-frequency panel, join coverage on the relationship graph, period-over-period in suggestions | Sonnet |
| A3 — Transforms first-class | `derive_table` / `create_view` / `drop_derived` as operations; lineage; undo | Opus |
| A4 — MCP server + app AI rewire | The server over the core; the page connected by a linked in-memory pair; plural tool calls; tools persist across calls; full results not 20 rows; cancellation restored | Opus |
| A5 — Charts and pins as operations | `create_chart` / `pin_result` through the ViewSpec seam (D55, `viewspec-guard`) | Opus |

The MCP server itself is product work and lives in A4 — the in-tab path needs it. What stays out of
the build order is the **external-client question**: letting Claude Desktop or a local agent reach a
dataset held in a tab needs either an outbound relay or a companion process that owns its own engine.
That wants an ADR, not a build row written in advance. P6 (the scored run) stays in `eval/`.

**This section is a proposal, not an amendment.** Chartering v0.71 means a master §19 tier block, a
D-row for the analyst layer, leaf docs under `build/15-analyst-layer/`, and a BUILD-ORDER section —
master-first, then mirrored. None of that is done by this record. The current `▶` is still S0.

---

## References

- [Experiment 10 — grounding ladder](10-grounding-ladder.md)
- [Experiment 11 — Gemini comparison arm](11-gemini-comparison-arm.md)
- [Experiment 12 — verified Claim IR](12-verified-claim-ir.md)
- [Experiment 13 — active analysis loop](13-active-analysis-loop.md) — closed, not finished
- [DataScope master decisions](../../../DATASCOPE.md)
- [MCP 2026-07-28 versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
- [MCP 2026-07-28 tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)

---

## Verdict

_Unrun._ No benchmark, core, MCP server, or model response exists.

Next work, if authorized: **P0** — the analyst core, as product code, because it is worth building on
its own terms. The experiment does not gate it.
