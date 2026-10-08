# Build notes (Phase 3, running log)

Implementation findings that came out of building the profiler — kept separate from
DESIGN.md so the Opus review's target file doesn't move under it mid-review.

## Profiler validated (`profiler.ts`, `profiler.test.ts`, `profiler.otherDatasets.test.ts`)

All 9 tests pass. Headline result: **the profiler independently recovers the known-correct
average completed order value (1337.35, previously established by hand in
`17-duckdb-local-chat/silverLayerProbe.ts`) purely from inference** — no dataset-specific
hardcoding. `generateCandidates`/`scoreCandidate`/`assembleEdges` (reused verbatim from
`src/lib/relationshipInference.ts`) and `classifyColumns` (`src/lib/classifier.ts`) did the
FK/type work; `describeGrain()` and `buildRollupView()` (new, this experiment) did the
grain-statement and view-synthesis work. This directly satisfies §6's requirement and is
strong positive evidence before a single model has answered a single question.

## Two real findings while validating against the combined 8-table catalog

Ran the profiler against all 5 datasets loaded into **one** DuckDB catalog (the realistic
"user has every sample loaded" scenario — `bootstrap.ts`, `ALL_TABLE_SOURCES`) rather than
per-dataset in isolation, specifically to pressure-test cross-dataset contamination:

1. **Bug, fixed**: `describeGrain()` originally returned on the *first* confident fanout edge
   found for a table. `order_items` genuinely fans out under **both** `orders` and
   `products` independently (it references two parents). The first version's grain sentence
   for `order_items` reported only the `products` relationship in the combined-catalog run —
   silently dropping the `orders` relationship our actual grain-trap questions (E2–E9)
   depend on, purely because of candidate-generation iteration order. Fixed to enumerate
   *all* confident fanout parents in one sentence. This is exactly the kind of thing a
   single-dataset test wouldn't have caught — worth noting in the final report as a reason
   the harness should test on the full combined catalog, not each dataset in isolation.

2. **Real, not a bug**: three spurious `candidate`-tier cross-dataset edges appear
   (`product_reviews.ReviewId -> titanic.PassengerId`, `titanic.Age -> customers.customer_id`,
   `weather.Humidity -> customers.customer_id`) — coincidental full-range numeric containment
   with no name agreement, an inherent risk once unrelated datasets share one catalog small
   enough that ID ranges overlap. The confidence-tiering already does its job here: none
   reach `confident` (no name agreement + failing/near the containment-solid bar), so
   `buildAllRollupViews` (which only consumes `confident` edges) never acts on them. Decision:
   **A1's profile context surfaces only confident-tier grain/FK information to the model —
   candidate-tier edges are not shown**, to avoid handing the model an unconfirmed cross-dataset
   join it might mistake for a real one. Worth one sentence in the final report either way:
   this is realistic noise a production auto-profiler would also hit at small-catalog scale.

## Plan-first schema (A4) validated live

`planFirstOllama.ts`'s nested nested-`oneOf` + required `plan{grain,tables,filters}` JSON
Schema was smoke-tested against live `qwen3:1.7b` — Ollama's structured-output constrainer
handled it correctly on the first try (filled `plan.grain`, `plan.tables`, `plan.filters`,
then `sql`/`assumptions`/`result_shape` in the same call). No fallback needed.

## Still open before the full build proceeds

Waiting on the Opus adversarial review (`OPUS_REVIEW.md`, not yet written) before finalizing
the question bank and computing gold answers — question-bank changes there would invalidate
gold-fixture work done before it lands.

## dataset-facts.json generator + premise-assertion gate built and validated (`datasetFacts.ts`, `premises.ts`, `datasetFacts.test.ts`)

DESIGN.md §2's pre-registered gate: `buildDatasetFacts()` reuses `buildTableRegistry`'s
already-computed `ClassifiedColumn[]` (no re-profiling) and adds one `SELECT DISTINCT` query
per Categorical column plus each Temporal column's SUMMARIZE-derived min/max, against the
combined 8-table catalog (`bootstrapAllDatasets`) — same "everything loaded at once" scenario
BUILD_NOTES.md's earlier combined-catalog run used to catch the profiler's first-match-only
bug. `assertPremises()` checks a question's declared `column`/`categoricalValue`/`temporalYear`
premises against that fact set. All 6 tests pass.

**Real catch, immediately**: the gate's Temporal-range check disagreed with DESIGN.md's own
prose. DESIGN.md described weather.csv as `2015-01-01 → 2024-12-27`; the generated fact from
the actual CSV is `2024-12-28` (3650 distinct dates, verified independently via a raw Python
CSV scan, not just the DuckDB path). Off-by-one, harmless as a design-doc typo since no gold
answer was computed against it yet — but it's exactly the class of error this gate exists to
catch before a question is frozen, and it caught it on the very first run against real data.
Fixed in DESIGN.md's weather.csv heading.

## Determinism probe built and run live (`determinismProbe.ts`, `determinismProbe.test.ts`)

DESIGN.md §4's pre-run gate: `summarizeDeterminismProbe` (pure — largest identical-response
group ÷ total, not "matches the first call," so one outlier first call can't understate an
otherwise-deterministic model) is unit-tested directly (8 tests, including the exact 95%
boundary), and `runDeterminismProbe` wraps it with sequential live calls through the same
`callForProposal` path A0-A3 use — tested against a mocked Ollama endpoint following
`17-duckdb-local-chat/chat.test.ts`'s existing `queueFetch` convention. A CLI entry point
(`npx tsx eval/chat/20-grain-rescue/determinismProbe.ts [model]`) runs it live against a
self-contained placeholder prompt (not the real arm prompts — arm assembly isn't built yet).

**Initially run against only `qwen3:1.7b`** (the design's fixed small-model floor,
`CHAT_THINK=0`, temperature 0): 20/20 calls byte-identical — 100%. This was under-scoped as
first written up: DESIGN.md's §4 wording ("one prompt, one model") was read as license to let a
single model decide N for the whole study, but the actual 4B-class primary model is still
undecided (pending the bake-off among `qwen3:4b` / `qwen3.5:4b` / `qwen2.5-coder:1.5b`, not yet
run), and determinism at temperature 0 is a property of a specific model+backend, not something
one model's result can be assumed to speak for another's.

**Re-run against every bake-off candidate available locally** — `qwen3:4b` and
`qwen2.5-coder:1.5b` (`qwen3.5:4b` is not pulled locally, still unverified): both also 20/20
byte-identical, 100%. **N=2 now holds across all three currently-available candidate models**,
not just the floor model — still open: `qwen3.5:4b`, `qwen3:14b` (14B control), and the
`qwen2.5:7b-instruct` / `qwen2.5-coder:7b-instruct` pair, none pulled locally yet.

Bonus: all three models independently produced their own variant of the exact ecommerce grain
trap on this one placeholder question, unprompted — real, live evidence the trap isn't
hypothetical for any of them:
- `qwen3:1.7b`: `SELECT AVG(unit_price * quantity) ... WHERE order_id IN (SELECT order_id FROM
  orders GROUP BY order_id)` — the `GROUP BY` is a no-op distinct-order-id filter, not an
  aggregation; still line-grain.
- `qwen3:4b`: `SELECT AVG(order_items.unit_price * order_items.quantity) FROM order_items` —
  no rollup attempted at all.
- `qwen2.5-coder:1.5b`: `SELECT AVG(quantity * unit_price) FROM order_items` — same.

## Arm prompt-assembly layer built (`armPrompts.ts`, `armPrompts.test.ts`) — and a second real profiler bug fixed along the way

Built `buildA0Prompt`/`buildA1Prompt`/`buildA2Prompt`/`buildA3Prompt`, entirely generic over
already-computed `TableRegistryEntry[]`/`DatasetFacts`/`RollupView[]` — no dataset-specific code
anywhere (validated by a genericity test that runs the same functions, unmodified, against
`product_reviews -> products`, an unrelated fanout, and gets a correct prompt with no
ecommerce vocabulary). A3's worked examples are synthesized purely from view/column metadata,
never from the real eval questions (DESIGN.md's requirement) — one direct `AVG(measure)`
example per view plus, when the parent table has a plausible filter column, a join-back
example, capped at 3 total examples.

**Motivation, not speculative**: an informal live check (not part of the scored harness) handed
A1+A2-equivalent text — profile, grain statement, the raw generated view SQL, no worked
example — to all three locally-available models for "average order value, completed orders
only." All three still got it wrong, three different ways: `qwen3:1.7b` ignored the view and
hand-rolled its own line-grain average (533 vs. gold 1337.35); `qwen3:4b` used the view but
multiplied its rollup sum by an `order_id` (930544 — nonsense); `qwen2.5-coder:1.5b` tried to
filter the view on `status`, a column that only exists on `orders`, and never joined back for
it. A3 exists specifically to close these three gaps, and the test suite locks in that its
worked examples actually demonstrate: (a) using the view directly with a bare `AVG`, (b) no
extraneous arithmetic on the result, (c) the join-back-to-parent pattern for a parent-level
filter.

**Second real bug caught building this**: writing armPrompts.test.ts surfaced that
`orders_rollup_by_customers` was generating `SUM(customer_id)`/`AVG(customer_id)` as a
"measure" — nonsense, since `customer_id` is the view's own grouping key, and exactly the class
of error `qwen3:4b` had just made unprompted (multiplying by a key column). Root cause:
`buildRollupView` classified any numeric column as a summable measure without excluding FK
columns. Fixed: `buildRollupView` now takes the full edge list and excludes every confident FK
column on the child table (not just the edge being rolled up — e.g. `order_items`'s `product_id`
is also excluded from `order_items_rollup_by_orders`'s measures, since it's a foreign key to a
*different* parent, not a value) from both the SUM/AVG set and the quantity×amount pairing
search. Side effect, and actually an improvement: `orders_rollup_by_customers` now correctly
has no measure columns at all beyond `orders_row_count` — which is exactly the "counts orders,
not money" decoy view DESIGN.md's E13 already pre-registers needing. All 40 tests still pass
after the fix (`profiler.test.ts`'s 1337.35 check included, unaffected since `quantity`/
`unit_price` were never FK columns).

**Informal live re-check with the real A3 prompt** (same throwaway-script pattern as above, not
part of the scored harness, n=1 per model — anecdote, not a result): `qwen3:4b` now answers
**correctly** — `1337.345941011236` vs. gold `1337.35`, using exactly the join-back-to-parent
pattern the worked example demonstrates. The other two are still wrong, but differently, and
arguably more safely: `qwen3:1.7b` now attempts a view (progress — A1/A2-alone text got it to
ignore views entirely) but picks the *wrong* one — `order_items_rollup_by_products` instead of
`order_items_rollup_by_orders` (order_items fans out under both parents; this is a live,
unprompted instance of exactly the view-*selection* trap DESIGN.md's E8/E11/E12/E13 questions
are built to test formally). `qwen2.5-coder:1.5b` now gets the correct view, correct join,
correct measure column, and breaks only on SQL aliasing (references the bare table name instead
of its own join alias) — a syntax slip, not a grain-reasoning failure. Both shifted from
bucket 2 (wrong-but-ran, confidently wrong number) to bucket 3c (execution-error, caught safely)
— a real, different failure mode, but per §5's floor rule this is not by itself claimable as a
"safety win" without the formal scored comparison.

## Scorer built (`score.ts`, `score.test.ts`)

DESIGN.md §5's tolerance rule and five-way outcome classification: `numericMatch` (single rule —
`max(0.01 absolute, 0.1% relative)`, replacing v1's three inconsistent ones, OPUS_REVIEW.md M3),
`matchesGold` (scalar via `numericMatch`/case-insensitive string equality; row-set via
sorted-row-signature comparison — order-independent, all-or-nothing, no partial credit), and
`bucketOutcome`, which maps a `CallOutcome` to one of `correct` / `wrong-but-ran` / `abstained` /
`malformed` / `execution-error` — the four-bucket split OPUS_REVIEW.md I2 required so abstention
can't masquerade as a safety win against wrong-but-ran. All 9 tests pass. Purpose-built rather
than reused from exp17's `score.ts`, which is tightly coupled to that experiment's multi-turn
session/repair/safety-category shape and isn't a fit for exp20's single-shot
question→proposal→execute→compare loop.

## Question bank built and gold-computed live (`fixtures/computeGold.ts`, `fixtures/questions.json`, `fixtures/dataset-facts.json`)

DESIGN.md §2's full gate, run end to end: 43 questions (T1-7, W1-7, S1-5, R1-4, C1-4, E1-16;
51 individual checks, several questions carrying 2-3 checks each — row counts, date ranges,
per-status breakdowns) across all six datasets (titanic, weather, stock_prices,
product_reviews+products, the chasm dataset, ecommerce), each with **two independently written
SQL formulations that had to agree numerically before being committed** — CTE-rollup vs.
window-function/`DISTINCT`-based for every grain-tagged (G/X/TG) check, per DESIGN.md's stricter
rule for those; simpler independent pairs (e.g. `AVG` vs. `SUM/COUNT`) for plain profiling and
floor/regression-guard questions. Every question's premises (`column`/`categoricalValue`/
`temporalYear`) were asserted against a freshly generated `fixtures/dataset-facts.json` before
being computed — all 43 passed the gate on the first pass (no repeat of the weather.csv-style
error the gate exists to catch, this time). Every argmax/top-N check ran a dedicated tie-freedom
query before being frozen, per §2's requirement.

**Strong end-to-end sanity check**: E4 ("average order value for completed orders") computed
**1337.3459410112375** — matching exp17's independently-established reference value (1337.35,
the same number the profiler's `buildRollupView` first reproduced from inference in the earlier
profiler validation pass) to five decimal places, via SQL written fresh for this script, never
copied from either prior source. Three completely independent computations of the same number
now agree.

**Two real ties caught live and fixed, not assumed away** — both per DESIGN.md §2's own rule
("adjust the threshold or drop the question if a tie exists at the reported boundary"):
- **R3** ("highest-rated product with ≥5 reviews") ties exactly at the ≥5 threshold: 'Home Item
  76' and 'Books Item 105' both average 4.2 across 5 reviews. Checked thresholds 5-10 directly
  against the data; **7** is the lowest clean cut (winner 4.0 avg / 8 reviews, runner-up 3.875 —
  no tie). DESIGN.md's R3 row updated to say "at least 7 reviews" and note why.
- **E9** ("top 5 products by total units sold") ties across ranks 2-4, all at 105 units, and
  again across ranks 5-6 at 102 — a top-5 cut is genuinely ambiguous, not a near-miss. Top-4 is
  clean (105 vs. the next distinct value, 102). DESIGN.md's E9 row updated to "top 4" and note
  why.

**One DuckDB syntax lesson, not a design bug**: `RANK() OVER (...)` cannot reference another
window function inside its own `ORDER BY` in the same `SELECT` — E9's window-based formulation
needed an extra nesting level (compute the windowed sum in an inner subquery, apply `RANK()` in
an outer one). Also: DuckDB accepts a bare parenthesized row-expression as a full statement
(`(SELECT ..., SELECT ...)` with no leading `SELECT`) in some contexts but not when the result
is post-processed with `::CAST` outside the parens — worth remembering if arm-prompt SQL
generation ever needs to validate model-emitted DuckDB syntax defensively.

**Design judgment calls made while authoring gold, recorded here since DESIGN.md's question
table doesn't have room for the reasoning**: E7 ("average number of items per order") is read as
average *units* (`SUM(quantity)` per order) as opposed to E2's average *line-item count*
(`COUNT(*)` per order) — the two questions are near-identical in wording, deliberately, to test
whether a model conflates "items" (units) with "line items" (SKUs/rows). E13's "average total
spend per customer" uses the plain-GROUP-BY denominator (customers with ≥1 completed order
only), by contrast with E16's explicitly pre-registered all-400-customers convention — E16 calls
that convention out specifically because it's the surprising one; E13's absence of that same
note is read as license to use the ordinary reading. E16 itself has no status filter in its
wording (unlike E4/E13's explicit "completed orders"), so its revenue sums across every order
status, not just completed — taken literally rather than assumed.

`fixtures/questions.json` and `fixtures/dataset-facts.json` are generated artifacts (rerun
`npx tsx eval/chat/20-grain-rescue/fixtures/computeGold.ts` to regenerate); the question bank
itself — text, traps, premises, and both SQL formulations per check — lives in
`fixtures/computeGold.ts` as the source of truth, not hand-edited in the JSON.

**Still not done from this step**: paraphrased wordings for every G/X/V/M/TG-tagged question
(DESIGN.md §2's paraphrase requirement — deliberately deferred, not forgotten) and the
`ecommerce-dirty/` mutation dataset with its repeated E-series questions (also deliberately
deferred, per its own scope note). Both are separate passes on top of this one, not blocked by
anything built here.

## Paraphrase pass built (`fixtures/computeGold.ts`)

DESIGN.md §2's paraphrase requirement, done for all 20 G/X/V/M/TG-tagged questions (W3, W4,
W6, S5, C2, C3, C4, E2, E3, E4, E6, E7, E8, E9, E11, E12, E13, E14, E15, E16) — every other
question (F/N/- traps only) correctly has none, verified programmatically (tagged-question set
== paraphrased-question set, exactly, no gaps or extras).

**Mechanism**: `QuestionSpec` gained an optional `paraphrase` field; `assertParaphrasesPresent`
runs before any DB work and throws naming any tagged question missing one — a build-time gate,
not a convention to remember. `ComputedQuestion` gained a `wording: 'explicit' | 'paraphrase'`
tag. Since the gold value doesn't depend on wording, `main()` computes each question's checks
once and reuses that same `ComputedCheck[]` for both the explicit entry (id `E3`) and, when a
paraphrase exists, a second entry (id `E3P`) — "graded as separate checks" per DESIGN.md, not
recomputed. `fixtures/questions.json` is now 63 entries (43 explicit + 20 paraphrase, 71 checks,
up from 51) — regenerated end to end, all values unchanged from the explicit-only run (E4 still
`1337.3459410112375`), all 40 existing tests still pass, `tsc --noEmit` clean.

**Design choices worth recording**:
- **E14 duplicates E3's paraphrase verbatim, not a fresh one.** E14's explicit text already
  duplicates E3's exactly (deliberately, per the earlier gold-computation pass — E14 exists to
  probe measure-selection via `viewUsage`, not wording variation), so giving it an independent
  paraphrase would introduce wording as a second variable where the design calls for one. Both
  of E14's wordings mirror E3's exactly.
- **E2/E7 paraphrases preserve the original pair's deliberate ambiguity.** E2 ("line items")
  and E7 ("items") are a near-identical pair testing whether a model conflates line-item count
  with unit count (BUILD_NOTES, gold-computation pass). E2's paraphrase ("separate line
  entries") stays unambiguous; E7's ("items... end up with") stays exactly as ambiguous as the
  original — matching the original pair's asymmetry rather than resolving it.
- Paraphrases avoid the literal trap-phrase (e.g. "order value", "monthly-mean") in favor of
  ordinary spoken framing, per DESIGN.md's own worked example ("average order value" → "when
  someone places an order here, how much do they typically spend on it?" — used verbatim for
  E3/E14), but keep necessary nouns (order, month, customer) where removing them would make the
  question incoherent — the requirement is no lexical shortcut to the SQL pattern, not a puzzle.

**Still open**: the `ecommerce-dirty/` mutation dataset, A4 wiring, the model bake-off, the full
ablation run, and the final report — unchanged by this pass, see README.md.

## A4 wiring, viewUsage tagger, and the run/scoring loop built (`runner.ts`, `manifest.ts`, `armPrompts.ts`/`planFirstOllama.ts` additions, `score.ts` addition)

Closes three of README's five open items — `ecommerce-dirty/` (explicitly the first item DESIGN.md's
own scope note says to cut if a session runs long) and the model bake-off/full ablation run are
still open.

**A4 wiring**: `armPrompts.ts` gained `buildA3ContentBlocks`/`assembleWithFooter` (exported) so
A3's stats/views/worked-examples content can be reused verbatim without re-deriving it, and
`planFirstOllama.ts` gained `buildA4Prompt`, which layers those same content blocks under a new
plan-aware response-format footer instead of A3's own. This mattered, not just for module
boundaries: A3's footer text describes the *old* `{"status","sql",...}` shape with no `plan`
field — reusing it verbatim under `PLANNED_PROPOSAL_JSON_SCHEMA` would have told the model one
contract in prose while the schema silently enforced a different one. 9 new tests
(`planFirstOllama.test.ts`), all passing.

**`tagViewUsage`** (`score.ts`): DESIGN.md §5's `none`/`correct-view`/`wrong-view`/`mixed`
classifier, word-bounded and case-insensitive regex matching against a dataset's generated view
names. Deliberately takes `correctViewName` as a caller-supplied parameter rather than trying to
infer "the right view for this question" itself — that mapping is a per-question judgment call
DESIGN.md doesn't pre-register in the question bank, and belongs with whoever authors the sweep
config, not hardcoded into a generic tagging primitive. 7 new tests, including a same-prefix
false-positive check (`order_items_rollup_by_orders` vs. `..._v2`).

**`runner.ts`** (`runOneCall`) and **`manifest.ts`** (`runAndLog`/`appendManifestRow`): the actual
run/scoring loop wiring, previously entirely unbuilt — nothing in this experiment's own code was
wired to call a model against a real question before this. One cell (`{arm, model, question}`) in,
one scored `RunOneCallResult` out: dispatches to the right arm prompt builder and the right call
path (`callForProposal` for A0-A3, `callForPlannedProposal` for A4), executes the emitted SQL,
applies DESIGN.md §3's one-shot repair uniformly (never more than one repair call, unlike exp17's
multi-call follow-up budget — deliberately not reused, for the same single-shot-vs-multi-turn
reason `score.ts`'s module comment gives for not reusing exp17's scorer), and scores via
`bucketOutcome`/`tagViewUsage`. Also implements DESIGN.md §4's prompt-token-overflow rule (a call
whose prompt exceeds 0.8x num_ctx fails the run unscored, not silently truncated-and-scored).

**Not exp17's `sqlGuard.ts`**: that gate's `ALLOWED_VIEWS`/`ANALYTICS_SCHEMA` are hardcoded to
exp17's own fixed dataset — not a fit for six datasets and dynamically-generated per-dataset
views (same reuse call `score.ts` already made for the same reason). In its place, a minimal
generic guard rejects anything but a single `SELECT`/`WITH` statement before it reaches the local
DuckDB file — cheap defense against a destructive statement, without an exp17-specific allowlist.
Live-caught immediately in the smoke test below (`qwen3:1.7b` emitted a `DROP TABLE` in one
throwaway trial run of the guard test itself, not the scored smoke test — the guard rejected it,
the table survived, confirmed by a direct row-count check in `runner.test.ts`).

9 new tests in `runner.test.ts` against a real bootstrapped combined catalog (with the generated
views actually `CREATE VIEW`'d this time, not just synthesized as SQL text — `armPrompts.test.ts`
never needed to execute them, since it only builds prompt strings) and mocked Ollama responses,
covering every branch: correct first try, repaired-then-correct, repaired-but-still-wrong
(execution-error), wrong-but-ran, abstained, malformed, prompt overflow, and the read-only guard.
2 new tests in `manifest.test.ts`. 40 total new tests this pass, all passing; `tsc --noEmit`
clean across the whole experiment.

**Live smoke test, `qwen3:1.7b`, E4 ("average order value for completed orders", gold
1337.3459410112375) across all five arms, real Ollama calls, real DuckDB execution** — an
informal end-to-end check that the wiring actually works, n=1 per arm, not a scored result:

| Arm | Bucket | viewUsage | Repair | What happened |
|---|---|---|---|---|
| A0 | abstained | none | used, failed | First SQL filtered `order_items.status` (doesn't exist there); repair round, model gave up rather than fix it. |
| A1 | wrong-but-ran | none | — | Line-grain `AVG(unit_price * quantity)` over `order_items`, dressed up with two decoy `IN` subqueries that don't fix the grain — dangerous bucket, exactly as designed to be caught. |
| A2 | abstained | correct-view | used, failed | Found the right view, then tried to filter it on `status` — the view doesn't carry that parent column, a live instance of the exact "join back for a parent filter" gap A3's worked examples exist to close (BUILD_NOTES' earlier A1+A2-only informal check predicted this). Repair round: model gave up instead of joining back. |
| A3 | execution-error | correct-view | used, failed | Same `status`-on-the-view mistake as A2, but with the wrong-distractor measure (`unit_price_sum`, ignoring quantity) — and the repair round repeated the identical mistake rather than fixing it. Repair does not reliably rescue a grain/binding error, which is exactly RESEARCH.md's pre-registered expectation for repair, not a harness bug. |
| A4 | **correct** | correct-view | not needed | First try: correct measure column, correct view, filtered via a join-back subquery on `orders.status` — exactly the pattern A4's forced-plan schema and A3's worked example both target. No repair needed. |

Token counts, elapsed time (3.5-8.9s per cell), and peak RSS (53-210MB) were all logged to the
manifest correctly. One honest gap surfaced by actually building this rather than assuming it:
**`peakRssBytes` as currently measured is the Node harness process's own memory, not Ollama's** —
DESIGN.md §4's viability budget ("peak RSS under 6GB") means the model-serving process, which runs
separately from this harness and isn't observable via `process.memoryUsage()`. Sampling Ollama's
actual server-side memory (e.g. `ollama ps`, or reading the server process's RSS directly) is a
still-open piece of instrumentation before the viability budget can be checked for real, not
solved by this pass.

**Still open**: the `ecommerce-dirty/` mutation dataset, the model bake-off, real per-model
`num_ctx` pinning (currently one shared `CHAT_NUM_CTX` env var across every call, not yet wired
to vary by model as DESIGN.md §4 requires), Ollama-side memory sampling for the viability budget,
the full ablation run, and the final report.

## Model bake-off run, live, real Ollama calls (`bakeoff.ts`, `bakeoffSummary.ts`)

DESIGN.md §4's bake-off among `qwen3:4b` / `qwen3.5:4b` / `qwen2.5-coder:1.5b`, run for real —
no sweep driver existed before this pass, only the single-cell `runOneCall`/`runAndLog`
primitives. `qwen3.5:4b` was not pulled locally until this pass (3.4GB, matches DESIGN.md's
spec exactly); its determinism probe was run live for the first time here — 20/20 identical,
100%, so **N=2 now holds for all three candidates**, closing the last open item under DESIGN.md
§4's determinism gate.

**Scope, decided here** (DESIGN.md pre-registers the candidate list and the viability budget,
not a bake-off protocol of its own): A0 + A4 only (floor and full-stack ceiling, not the whole
5-arm ladder — the bake-off's job is picking which candidate benefits most from the complete
mechanism, not measuring each rung's marginal contribution, which is the full run's job on the
winner only); 38 of 43 explicit-wording questions across all 6 datasets (excludes the 5
multi-check questions W1/S1/S4/C1/E1, which would need a per-check result-extraction step
`score.ts` doesn't have — `matchesGold` compares one executed result to one `GoldCheck`, and a
compound "row count + date range" question needs its one result addressed by two checks; all 5
excluded questions are non-trap profiling/compound-lookup questions, so no grain-trap signal is
lost); num_ctx pinned to one shared `8192` for all three candidates deliberately (not a
per-model value — varying context budget between bake-off candidates would confound the
comparison), chosen after measuring every dataset's real A4 prompt (largest: ecommerce, ~1444
tokens) for headroom; `correctViewName` passed `null` uniformly (viewUsage as a diagnostic, not
part of the decision rule — see the real per-question map is still-open authoring work for the
full run). Decision rule pre-registered before running: **winner = highest A4 correct-rate.**

**Crashed once, recovered properly, not by re-running from scratch.** First launch died at cell
92/456 on `Error: ollama response is missing token counts` inside `callForPlannedProposal` — a
real, live-caught gap: the sweep had no resilience for a single bad Ollama response, and
`manifest.ts`'s own module comment already promised resumability ("a sweep can be killed and
resumed without losing completed rows") that `bakeoff.ts` didn't actually implement (it deleted
the manifest on every launch). Fixed properly before relaunching: `bakeoff.ts` now counts
already-logged `{model, arm, questionId}` reps and only runs the remainder, and wraps each cell
in one retry before logging a persistent failure to `errors.jsonl` and moving on rather than
aborting the whole run. `bakeoffSummary.ts` folds `errors.jsonl` counts into each model/arm's
`n` — dropping them silently would let whichever candidate hits this failure mode most look
artificially more accurate from a shrunken denominator.

Relaunched, resumed correctly from cell 93. **452/456 cells completed (99.1%)**; 4 failed twice
each after retry and are logged in `errors.jsonl`, folded into their model/arm's `n`: 2x
`qwen3:4b`/A4/W3 ("windiest day of a month" — same missing-token-counts response both attempts,
isolated to that one question/arm/model triple, everything around it on the same arm completed
normally) and 2x `qwen2.5-coder:1.5b`/A0/C2 (client timeout both attempts). Neither pattern
recurred elsewhere in the 452 completed cells — treated as isolated Ollama-side flakiness, not
investigated further under this pass's time budget.

**Results** (n=76 per model/arm cell = 38 questions × N=2, except the two cells above at
n<76 for the reasons noted):

| Model | Arm | Correct | Wrong-but-ran | Abstained | Exec-error | p95 latency |
|---|---|---|---|---|---|---|
| `qwen3:4b` | A0 | 57.9% [46.7, 68.4] | 24 | 0 | 8 | 9.6s |
| `qwen3:4b` | A4 | 47.4% [36.5, 58.4] | 25 | 2 | 11 | 23.6s |
| `qwen3.5:4b` | A0 | 50.0% [39.0, 61.0] | 32 | 4 | 2 | 19.9s |
| `qwen3.5:4b` | A4 | 50.0% [39.0, 61.0] | 18 | 0 | 20 | **47.7s** |
| `qwen2.5-coder:1.5b` | A0 | 47.4% [36.5, 58.4] | 22 | 16 | 0 | 5.8s |
| `qwen2.5-coder:1.5b` | A4 | 36.8% [26.9, 48.1] | 26 | 18 | 4 | 5.1s |

(95% Wilson CI in brackets; p95 measured live on the actual 8GB M1 target machine, not a
headroom machine — this is exactly what DESIGN.md §4's viability budget is checked against.)

**The mechanical decision rule and the pre-registered viability budget disagree, and the
viability budget wins.** By raw A4 correct-rate, `qwen3.5:4b` (50.0%) edges `qwen3:4b` (47.4%) —
but that edge sits well inside both models' overlapping 95% CIs (not distinguishable at n=76),
and `qwen3.5:4b`'s A4 p95 latency is **47.7s, over DESIGN.md §4's pre-registered 30s budget** —
exactly the "accurate but not shippable at this tier" case that section says must be reported in
the headline, not a footnote. **Recommendation: `qwen3:4b`** as the 8GB-viable 4B-class primary
for the full ablation run — statistically indistinguishable A4 accuracy from `qwen3.5:4b`, clears
the latency budget with margin, and runs roughly 2x faster. Not yet acted on — this is a
recommendation for the next session to confirm before committing the full run's time budget to
one model.

**A headline surprise the bake-off wasn't primarily built to explain, worth flagging plainly
rather than smoothing over**: A4 did *not* clearly beat A0 in this two-arm slice. `qwen3:4b`
dropped 10.5pp (57.9%→47.4%) and `qwen2.5-coder:1.5b` dropped 10.6pp (47.4%→36.8%) going from
floor to full stack; only `qwen3.5:4b` held flat (50.0%→50.0%, though its bucket composition
shifted — wrong-but-ran fell 32→18 while exec-error rose 2→20, a shift from the dangerous bucket
toward the caught one at unchanged correct-rate, which is at least directionally the pattern
DESIGN.md §5's floor rule is willing to call a partial win). None of this is a same-arm apples-
to-apples read on the ladder's marginal contributions — the bake-off deliberately only ran the
two bookends, and the full 5-arm run (on the winner) is what can actually show whether A1/A2/A3
build accuracy steadily or whether A4's heavier plan-first schema is where the regression
concentrates.

**A likely real cause for `qwen3:4b` specifically, not a scoring artifact**: of its 16 non-correct
A4 cells on `ecommerce` (the one dataset where the generated views are relevant at all), **26 of
30 total A4 ecommerce cells referenced no generated view whatsoever** (`viewUsage: 'none'`) —
the model mostly isn't reaching for the views even under A4's forced-plan-first framing, and its
misses reproduce plain baseline-style binding/grain errors (`Binder Error: Table "o" does not
have a column named "quantity"`, raw joins across base tables instead of the rollup views). Real
per-question `correctViewName` wasn't wired for this bake-off (see scope above), so `viewUsage`
here can only distinguish "referenced some view" from "referenced none," not right-view from
wrong-view — but "none" is unambiguous, and `qwen3:4b` sat at 13% view-reference on A4 ecommerce
vs. `qwen3.5:4b`'s 47%. Worth a real per-question view-correctness pass before the full run, not
just this bake-off's aggregate accuracy number.

**`chasm` scored 0% correct across all three models, both arms, every attempt** (n=6 or n=4 per
cell — one model's C2 fell into the two logged failures above). Checked this isn't a harness bug
before writing it up: pulled the actual emitted SQL and errors for several cells, and every
failure is either a genuine cross-table fan-out mistake (`C2`'s A0 attempt joins `products`
directly to both `order_items` and `product_reviews` in one query — exactly the sibling-fanout
corruption the `chasm` dataset's `trap: ["X"]` questions exist to catch) or outright malformed
SQL the model itself emitted (a stray `AS avg:` / `oi.unit:unit_price` colon syntax error,
repeated identically across both N=2 reps, i.e. a deterministic model mistake, not a fluke). This
reads as a real, sharp limitation, not noise: `buildRollupView`'s measure-synthesis rule only
ever emits a single-hop child→parent rollup — nothing in A0–A4's mechanism teaches composing two
sibling rollups (`order_items_rollup_by_products` and `product_reviews_rollup_by_products`) via
their shared parent, which is exactly what `chasm`'s C2–C4 need and none of these three small
local models found on their own, with or without the generated views in the prompt.

**Still open**: everything from the list above except the model bake-off, plus (newly surfaced
by this pass) a real per-question `correctViewName` map for accurate `viewUsage` tagging, and a
decision on whether the `chasm` composed-rollup gap needs a new mechanism (a second-order
"sibling rollup via shared parent" view) before the full run, or gets reported as a known
limitation.

## Full-ladder diagnosis on `qwen3:4b`, run live (`ladderDiagnosis.ts`, roadmap item 1)

Answers the bake-off's own open question directly: is the A0→A4 regression it found (57.9%→47.4%)
concentrated in one rung, or spread across the ladder? Ran all 5 main arms (A0–A4) across all 6
datasets, plus the 2 diagnostic arms (A2′, A1x — DESIGN.md §3, newly wired: `describeGrainCorrupted`
in `profiler.ts`, `buildA2PrimePrompt` in `armPrompts.ts`, both arms plumbed into `runner.ts`'s
`Arm` union and `buildArmPrompt`) on `ecommerce` only, per that section's own scope note. Same
machinery as `bakeoff.ts` (num_ctx=8192, N=2, resumable manifest), single model, 438/440 cells
logged (2 failed after retry, in `errors.jsonl`). A live smoke test against real Ollama (one
question, both new arms) confirmed the new prompt builders before the full run.

**Headline: the ladder does not climb monotonically, and the regression is not concentrated in
A4.** All-dataset correct-rate (n=76/arm, 95% Wilson CI):

| Arm | Correct-rate | 95% CI | wrong-but-ran | exec-error |
|---|---|---|---|---|
| A0 — baseline | 57.9% | [46.7, 68.4] | 24 | 8 |
| A1 — +profile | 47.4% | [36.5, 58.4] | 28 | 12 |
| A2 — +views | 50.0% | [39.0, 61.0] | 24 | 14 |
| A3 — +few-shot | 55.3% | [44.1, 65.9] | 26 | 8 |
| A4 — +plan-first | 47.4% | [36.5, 58.4] | 25 | 11 (+2 client-error) |

A0 is the single best-performing arm. A1 alone accounts for most of the drop — already visible
before A2's views or A4's plan-first schema enter the picture — and A2 doesn't recover it; A3's
worked examples claw back most (not all) of the gap; A4 gives it back. Every CI overlaps every
other, so none of this is individually significant at n=76 — the correct claim is "no arm showed
a significant improvement over A0," not "A1/A2/A4 hurt." Consistent with, and sharpening, the
bake-off's own A0-vs-A4 finding on this model.

**Ecommerce-only (n=30/arm, the one dataset the diagnostic arms also ran on — matched
comparison)** makes the pattern starker and lets the two diagnostic arms be read directly against
their same-dataset main-arm counterparts:

| Arm | Correct-rate | view-referenced |
|---|---|---|
| A0 | 66.7% | 0/30 (no views in prompt) |
| A1 | 40.0% | 0/30 (no views in prompt) |
| A2 | 40.0% | 6/30 (20%) |
| A3 | 53.3% | 14/30 (47%) |
| A4 | 46.7% | 4/30 (13%) — matches the bake-off's own independently-measured 13%, a real cross-check |
| A2′ (views, no profile) | 46.7% | 6/30 (20%) |
| A1x (corrupted profile) | 36.7% | 0/30 (no views in prompt) |

Two diagnostic reads, both weak-signal at n=30 (wide, overlapping CIs) but directionally
consistent with a real effect:

- **A2′ (46.7%) beats real A2 (40.0%)** on the same 15 questions — the generated views do
  *something* on their own, and pairing them with A1's profile text doesn't help and may actively
  hurt at this model size. Answers DESIGN.md §3's question ("are the views load-bearing on their
  own, without A1 already having primed the model?") in the affirmative, at least directionally.
- **A1x (36.7%) scores below real A1 (40.0%)** — accuracy *does* drop when the grain statement is
  corrupted, which is the direction the negative control needs to *not* dismiss A1's mechanism as
  a pure prompt-length artifact. But the gap (3.3pp) is small relative to the noise floor at
  n=30, so this is weak supporting evidence, not a clean confirmation either way — a larger N
  would be needed to say more.
- **A4's view-reference rate (13%) is lower than A3's (47%)**, despite A4 = A3 + forced
  plan-first — the forced-plan schema is associated with *less* engagement with the pre-built
  views, not more, which lines up with A4 scoring below A3 on both the all-dataset and
  ecommerce-only tables above. This is the most concrete, actionable lead this run produced:
  A4's plan-first framing may be pulling the model's attention away from the views rather than
  toward correct grain reasoning as intended.

**Caveat repeated deliberately**: `viewUsage` still can't distinguish right-view from wrong-view
(`correctViewName` passed `null` throughout, matching the bake-off's own known limitation) — every
"view-referenced" count above is "referenced *some* generated view," not "referenced the correct
one." The real per-question `correctViewName` map (roadmap item 2) would sharpen every number in
this section, especially A3 vs A4's engagement gap.

**Implication for the roadmap**: this reinforces item 2 (real `correctViewName` map, per-model
`num_ctx`, real Ollama-process RSS sampling) as the right next step ahead of item 5's full
multi-model ablation — spending that run's multi-hour/~19GB budget is premature while "referenced
a view" and "referenced the *right* view" are still conflated, especially given A3-vs-A4's
engagement gap is exactly the kind of question a real correctness map would resolve cleanly
instead of arguing from aggregate accuracy alone.

## Roadmap item 2: technical debt the full run needs

Three infrastructure gaps, fixed in code (not run against a live model sweep — that's item 5's
job; this is the prep work). All three are additive/backward-compatible: `bakeoff.ts` and
`ladderDiagnosis.ts`'s already-collected manifests and reported results are untouched (verified —
see below), and every existing test still passes (153/153, `npx vitest run eval/chat/20-grain-rescue
eval/chat/17-duckdb-local-chat`).

**1. Per-model `num_ctx` pinning, actually wired to the call.** `runner.ts`'s `RunOneCallParams`
already had a `numCtx` field, but it was only ever used for the 0.8x prompt-overflow arithmetic —
the real `/api/chat` call went through `ollama.ts`'s `callForProposal` / `planFirstOllama.ts`'s
`callForPlannedProposal`, both of which read `num_ctx` from a module-level `CHAT_NUM_CTX` constant
(or, for the A4 path, `process.env.CHAT_NUM_CTX` read at call time — still one process-wide value).
`bakeoff.ts`'s own header comment already named this exactly: "`ollama.ts` reads it once at module
import... setting it internally would be silently too late." That's true for the *env var*, but
the actual fix is to stop relying on it for the value that matters: `callOllama`, `callForProposal`,
and `callForPlannedProposal` now all take an explicit optional `numCtx` parameter (default = the
prior module-constant behavior, so every exp17 caller that omits it — `chat.ts`, `score.ts`,
`thinkOffPrimingProbe.ts`, `silverLayerProbe.ts`, all frozen for exp17's own scored runs — is
byte-for-byte unaffected), and `runner.ts`'s `callArm` now threads `params.numCtx` through to both
the initial call and the one-shot repair call. `RunOneCallParams.numCtx` is now the single source
of truth for both the overflow check and the real call, which is what lets a future full-run sweep
pin a different `num_ctx` per model tier (`qwen3:1.7b` through `qwen3:14b`) within one process
instead of needing a separate process launch per model. Verified with two new `runner.test.ts`
cases that capture the actual outgoing fetch body and assert `options.num_ctx` matches the
per-call value, on both the A0-A3 path and the A4 (plan-first) path — not just that it compiles.
`bakeoff.ts`/`ladderDiagnosis.ts` are unaffected in practice: both already passed
`numCtx: REQUIRED_NUM_CTX` (8192) while also requiring `CHAT_NUM_CTX=8192` be exported by the
caller, so the value flowing through the fix is identical to what those two already-run scripts
used.

**2. Ollama-runner RSS sampling, not harness-process RSS.** `manifest.ts`'s `peakRssBytes` sampled
`process.memoryUsage().rss` — this harness's own Node process. Checked live against the actual
Ollama install on this machine (0.32.1): `ollama serve` itself never exceeds ~50MB RSS regardless
of what's loaded; it spawns a separate `llama-server` child process per loaded model (confirmed via
`ps aux` while a live `/api/chat` call was in flight — the child appeared with `--model
<blob-path> --port <ephemeral>`), and *that* process is where the model weights and KV cache
actually live. So neither the harness process nor `ollama serve` itself was ever going to reflect
DESIGN.md §4's "peak RSS under 6GB" viability budget — the field was measuring the wrong process
entirely. New `ollamaRssBytes` field on `ManifestRow`: sums RSS (bytes) across every process whose
command line matches `llama-server` or `ollama_llama_server` (both names Ollama's runner binary has
used across versions), sampled every 200ms while a call is in flight (coarser than the harness
sampler's 50ms — shelling out to `ps` per tick is real overhead the in-process `process.memoryUsage()`
read isn't). `peakRssBytes` is kept as-is (not repurposed) for comparability with the bake-off's and
ladder-diagnosis's already-collected manifests. Verified live, not just against a mocked test: a
real `runAndLog` call against `qwen3:0.6b` reported `peakRssBytes` ≈173MB (harness) vs.
`ollamaRssBytes` ≈1028MB (the actual runner) — the harness number alone would have wildly
understated the real memory cost.

**3. Real per-question `correctViewName` map.** Added `correctViewName: string | null` to every one
of `computeGold.ts`'s 28 `QuestionSpec` entries (flows through to both the explicit and paraphrase
rows in `questions.json` — 63 questions total now carry it), replacing the `null` every caller was
passing uniformly. Grounded in two things, not guessed: (a) DESIGN.md §2's own prose, which already
names the correct/trap view explicitly for every `V`/`M`-tagged ecommerce question (E8/E11/E13/E15
are explicitly "the view is the trap, use raw tables instead"; E12 is explicitly "the product-grain
view IS correct here"; E3/E4/E14 share `order_items_rollup_by_orders`, the M-trap being *which
column* inside it, not which view); (b) live enumeration of the real views `buildAllRollupViews`
generates against the actual combined catalog (a throwaway script, not committed — 4 real views
survive FK inference: `orders_rollup_by_customers`, `order_items_rollup_by_orders`,
`order_items_rollup_by_products`, `product_reviews_rollup_by_products`; three more edges get
inferred — `product_reviews.ReviewId → titanic.PassengerId`, `titanic.Age → customers.customer_id`,
`weather.Humidity → customers.customer_id` — but `buildRollupView` silently rejects all three as
non-fanouts, so they never produce views; this is the exact cross-dataset FK-inference risk
`profiler.otherDatasets.test.ts`'s own module comment already flags as deliberately not designed
away).

**Real finding, not assumed**: two systematic measure-column gaps, verified against the live
catalog's actual `semanticType` classifications, not inferred from behavior. `buildRollupView` only
SUMs/AVGs columns the profiler classifies `Quantitative` — and `order_items.quantity` and
`product_reviews.Rating` both classify `Categorical` (small-integer scales read as low-cardinality
categoricals by the classifier), so **no view anywhere carries a units-sold or a rating measure**.
Concretely: `order_items_rollup_by_orders` / `order_items_rollup_by_products` have
`order_items_row_count`, `unit_price_sum`/`avg`, and `quantity_unit_price_product_sum` (the
revenue pairing) — but no `quantity_sum`. `product_reviews_rollup_by_products` has only
`product_reviews_row_count` — no rating measure at all. Consequences, cross-checked against
`computeGold.ts`'s own gold SQL (which independently needed `SUM(oi.quantity)` for E9 and
`AVG(pr.Rating)` for every R/C rating question, confirming the gap rather than assuming it from the
view schema alone):
- **E7 and E9** (`quantity`-based: avg items/order, top-4-by-units) are `correctViewName: null` —
  not because DESIGN.md tags them `V` (it doesn't; only `G`), but because the mechanism genuinely
  has nothing to offer them. DESIGN.md's authors couldn't have caught this without running the
  profiler live against real data — it's an emergent property of the semantic-type classifier's
  cardinality threshold, not a design oversight.
- **Every rating question** (R2, R3, R4, and the rating half of C2/C3/C4) is `correctViewName:
  null` for the same root cause. C2/C3/C4 still get `order_items_rollup_by_products` as their
  `correctViewName` — the revenue half of those chasm questions *is* view-assisted (this is the
  mechanism's intended chasm fix, per DESIGN.md's chasm section), it's specifically the rating half
  that has no view to lean on.
- This isn't itself a bug to fix in this pass (item 2 is instrumentation/plumbing, not a mechanism
  change — fixing the classifier's cardinality threshold, if that's even the right fix, is separate,
  undiscussed scope) but it's a real, generalizable limitation worth carrying into item 6's final
  report: the current view-synthesis rule structurally can't assist with count/quantity/rating-style
  measures, independent of anything the model does.

`computeGold.ts` re-run end to end after the edit (`npx tsx eval/chat/20-grain-rescue/fixtures/computeGold.ts`):
all 43 base questions recomputed identically (every gold value byte-identical to before — confirmed
via `git diff`, the only non-`correctViewName` diff was E9's tied-at-105 row ordering, which
`score.ts`'s row-set comparison sorts before comparing, so it's a pre-existing SQL-has-no-tiebreaker
nondeterminism artifact with zero effect on scoring, not a regression). `bakeoff.ts` and
`ladderDiagnosis.ts` are deliberately left reading `correctViewName: null` — both are finished,
already-reported one-time decision scripts (bake-off's model pick, the ladder diagnosis's findings
above) with their own comments explaining why `null` was the right choice *for those scripts*
specifically; retroactively rewiring them wouldn't change anything they've already reported and
would blur what ran under what instrumentation. The map exists now so item 5's full-run script can
read `correctViewName` straight off `questions.json` instead of authoring it from scratch.

## Roadmap item 3 investigated, and a bigger finding: prompt size (`a5Probe.ts`, `buildA5Prompt`)

**Status: A5 arm built, tested, and ready to run — the sweep itself is not done.** Started live,
stopped after 2 cells at the session boundary. Resume with the command at the bottom of this
section.

### Item 3: what the chasm arm actually contains

Went to decide `chasm`'s fate (report the 0% as a known limitation, or build a second-order
sibling-rollup view) and found the README's framing of the choice was wrong. Bootstrapped the full
8-table catalog exactly as `ladderDiagnosis.ts` does and enumerated the real prompt contents:

- **Both sibling rollup views already exist and are already in the chasm prompt** —
  `order_items_rollup_by_products` and `product_reviews_rollup_by_products`, both at
  `products.product_id` grain. There is nothing to build for the composition. BUILD_NOTES' earlier
  "nothing in the mechanism teaches composing two sibling rollups" is about the *model* not
  composing them, not about the views being absent; DESIGN.md's chasm section ("A2's per-edge
  rollup views are exactly the right fix here") is structurally correct.
- **C4 is fully answerable from those two views today.** Joining them on `product_id` and filtering
  `product_reviews_row_count >= 5` reproduces C4's gold (`Toys Item 24`) exactly — verified by
  running it. So C4's 0% is a pure model-composition failure with the correct tools in the prompt,
  not a missing mechanism.
- **C2/C3 are blocked by something else entirely.** `product_reviews_rollup_by_products` carries
  exactly one measure, `product_reviews_row_count`. No rating measure, because `Rating`
  (cardinality 5) classifies `Categorical` — the same classifier gap item 2 already logged for
  `quantity`/`Rating`, not a chasm-specific one. Both questions need `AVG(Rating)`, so no
  second-order view fixes them without fixing the classifier first.

The run scores C2/C3/C4 only (C1 has 3 checks, filtered out). Two of the three were unwinnable for
a reason unrelated to the chasm trap; the third was winnable and every model missed it.

Minor, uncharted: the chasm arm is also offered `order_items_rollup_by_orders`, keyed on
`orders.order_id`, while `orders` is not in the chasm DDL block — `ladderDiagnosis.ts`/`bakeoff.ts`
filter `dViews` by child table only. The view is queryable (it only reads `order_items`) so nothing
breaks, but the model is shown a view keyed on a table it cannot see. Not changed.

**Item 3 is therefore not yet decided** — the evidence changed the question, and the prompt-size
finding below is the more likely explanation for chasm's 0% anyway.

### Why every arm above A0 might be losing: prompt size

Measured every arm's assembled prompt (scratchpad script, ~4 chars/token):

| arm | ecommerce tokens | vs A0 | ecommerce correct (ladder run) |
| :--- | ---: | ---: | ---: |
| A0 bare DDL | ~102 | 1.0x | **66.7%** |
| A2′ DDL + views | ~604 | 5.9x | 46.7% |
| A1 + profile | ~643 | 6.3x | 40.0% |
| A2 + profile + views | ~1145 | 11.2x | 40.0% |
| A3 + few-shot | ~1378 | 13.5x | 53.3% |
| A4 + plan-first | ~1400 | 13.7x | 46.7% |

The best-scoring prompt is 102 tokens and everything else is 6-14x longer and worse. A3's worked
examples buy some of it back, so it isn't purely length — but the cliff sits between 102 and 604,
and **the ladder never tested anything in that gap.**

Then, counting who the views are even for (explicit single-check questions, i.e. the run set):

```
ecommerce         8/15 questions have a correctViewName
chasm             3/3
titanic           0/7      weather 0/6      stock_prices 0/3      product_reviews 0/4
------------------------------------------------------------------
                 11/38
```

**27 of 38 questions cannot be helped by any view, and all 38 carry the full profile + all-views
payload regardless.** On the three single-table datasets it is pure overhead by construction. That
is a sufficient explanation for A0 winning, and it is a packaging problem, not a mechanism one.

### A5: the minimal-prompt ceiling arm

`buildA5Prompt(tables, view | null)` — bare DDL plus *only* the one view this question needs, no
stats block, no grain prose, no sibling views. ~322 tokens on ecommerce; byte-identical to A0 when
the question has no view (asserted in a test — the mechanism should cost nothing where it cannot
help). `viewsBlock` is reused verbatim rather than reworded for the one-view case, so the only
variable between A5 and A2′ is *which* views are present.

Wired as `Arm` `'A5'` with a new `ArmContext.selectedView` (`undefined` throws; `null` is a valid,
meaningful "this question has no view"). `a5Probe.ts` is the run script: `qwen3:4b`, arms A0+A5,
ecommerce + chasm (the only datasets with any `correctViewName`), N=2, num_ctx=8192, resumable
manifest, same machinery as `ladderDiagnosis.ts`. It is **the first script to actually read item 2's
`correctViewName` map**, so `viewUsage` finally distinguishes right-view from wrong-view rather than
only some-view from none. A built-in summary reports A0-vs-A5 split three ways (all / view-backed /
no-view-possible), view engagement, and a paired per-question table.

**A5 is a ceiling, not a shippable arm** — it selects the view by the question's pre-registered
`correctViewName`, an oracle a real system would have to infer. That is the point: if a perfectly
selected, minimally packaged view still doesn't beat A0, no selection strategy built on these views
will, and the negative result is conclusive rather than a packaging artifact. Labelled a diagnostic
alongside A2′/A1x.

72/72 exp20 tests pass (run with `--no-file-parallelism`; two files time out under vitest's default
parallel file execution from DuckDB contention — pre-existing, unrelated to this change).
`npx tsc --noEmit` clean.

**To resume:**

```
CHAT_NUM_CTX=8192 npx tsx eval/chat/20-grain-rescue/a5Probe.ts       # ~15-20 min, 72 cells
SUMMARY_ONLY=1  npx tsx eval/chat/20-grain-rescue/a5Probe.ts         # re-print summary only
```

`runs/a5-probe/manifest.jsonl` already holds 2 cells (A0 C2, both reps, both `wrong-but-ran`, 122
prompt tokens, ~6-10s each). The script resumes from those — **do not delete the manifest**, that
was `bakeoff.ts`'s original crash bug. Observed cell latency suggests the full sweep is ~15-20
minutes, not the hour originally estimated.
