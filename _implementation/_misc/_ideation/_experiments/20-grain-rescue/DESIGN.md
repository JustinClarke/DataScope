# Experiment design v2: does an auto-generated grain-correct layer rescue small local models?

Phase 2 of the exp20 brief. **v1 was adversarially reviewed by Opus (`OPUS_REVIEW.md`) and
found not runnable as written** — 5 blocking defects (a mis-described dataset, a headline
mechanism that couldn't compute its own target measure, a duplicate arm, no statistical power,
and an unfalsifiable core claim). All 5 blocking, all 10 important, and all 9 minor findings
were independently spot-checked (3/3 direct verifications confirmed exactly) and accepted —
see `TRIAGE.md`. This is the rewrite. **Net cost is budget-neutral to lower**: the review's own
proposed N=5→N=2 cut (gated on a determinism probe) pays for every addition below.

## 1. Hypothesis and pre-registered decision rule

A 4B-class local model, given raw table DDL, reproduces the ecommerce grain trap and similar
traps on the other datasets. Claim under test: a **deterministically inferred** (not
hand-authored) profiling + grain-correct view layer measurably closes that gap.

**Primary endpoint**: correct-rate on grain-family checks (`G`/`V`/`M`/`TG`/`X` tags, defined
below), A2 vs A1, paired per check (McNemar's exact test on paired per-check outcomes — the
paired design has adequate power at n≈20+ where two independent proportions would not).
**Pre-registered falsification**: H1 (the grain layer helps) is rejected if the A2−A1
discordant-pair split is not significant at p<0.05, or if the point estimate of the
improvement is below +15pp. Whatever the numbers say, this is the test applied to them —
decided before the run, not fit after.

**Secondary claim**: `4B + full stack ≥ 14B baseline`, and separately, whether the method's
effect size is *larger* at 4B than at 14B (the scale-interaction question — measurable now
that the 14B control runs both A0 and A4, not A0 alone).

Per RESEARCH.md, no cited literature tests automatic (not hand-authored) grain-layer
generation at ≤14B — this experiment's result is new evidence either way it lands.

## 2. Question bank

Every gold answer is computed by **two independently written SQL formulations that must
agree numerically before the fixture is committed** — for grain-tagged checks, one an
explicit two-step rollup (CTE to target grain, then outer aggregate), one structurally
different (window function or `DISTINCT`-based de-duplication). A disagreement is a bug in
the *question*, not a rounding issue — the question is rewritten or dropped. No LLM-as-judge
for numerics, ever.

The bank is committed as `fixtures/questions.json`; **question and check counts in this
document are not hand-counted** (v1's arithmetic was wrong — see `OPUS_REVIEW.md` M1) — a
build-order test asserts the doc and fixture agree on counts, generated from the fixture.

Before the bank is frozen, the harness generates `fixtures/dataset-facts.json` (row count,
column list, distinct count of every Categorical column, min/max of every Temporal column)
and every question's premise is asserted against it — no question may name an entity
dimension the data doesn't actually have. This is the gate that would have caught v1's
weather.csv error at design time instead of in review.

Every argmax/top-N question is verified tie-free against the data before the fixture is
frozen (adjust the threshold or drop the question if a tie exists at the reported boundary).
Grading granularity (`scalar` / `row-set` / `ranked`) is stated per question in the fixture;
row-set questions are all-or-nothing and reported separately from scalar accuracy.

**Trap legend**: **G**=grain (single fan-out), **X**=chasm (multi-fan-out double-count),
**V**=view-selection (a generated view is name-plausible but wrong for this question),
**M**=measure-selection (multiple candidate measures in one view, only one right),
**TG**=temporal grain, **N**=null-handling, **F**=filter, **-**=no trap (floor/regression
guard).

**Paraphrase requirement**: every `G`/`X`/`V`/`M`/`TG`-tagged question is committed in two
wordings — the explicit one below, and a paraphrase that never names the correct grain (e.g.
"average order value" → "when someone places an order here, how much do they typically spend
on it?"). Both share one gold value, graded as separate checks. The report presents
grain-family accuracy split by wording — if an arm's advantage exists only on the explicit
wording, the effect is lexical pattern-matching, not grain reasoning, and the report says so.

### titanic.csv (891 rows, synthetic — not the canonical Kaggle file: 48 null Ages here, not
177, and generated names; any answer matching canonical-Titanic statistics rather than this
file's is scored wrong and flagged as suspected memorization)

| # | Category | Trap | Question |
|---|---|---|---|
| T1 | profiling | - | How many rows are in the dataset? |
| T2 | profiling | N | What percentage of rows have a null Age? |
| T3 | profiling | - | How many distinct values does Pclass have? |
| T4 | analytical | - | What is the overall survival rate (%)? |
| T5 | analytical | - | What is the survival rate (%) by Pclass and Sex? |
| T6 | analytical | N | What fraction of *all* passengers were under 18? (denominator is all 891, not just the 843 with known Age — `COUNT(*) FILTER (WHERE Age<18)/COUNT(Age)` silently uses the wrong denominator; the v1 version of this trap wasn't a real trap — DuckDB's AVG already ignores NULLs by default) |
| T7 | analytical | F | What is the average Fare for passengers who embarked at 'C'? |

### weather.csv (3650 rows, single-location daily series, 2015-01-01 → 2024-12-28 — **v1
described this as multi-city; verified it is 100% `City='Springfield'`**, so it's recast here
as the temporal-grain dataset, which is what the data actually supports)

| # | Category | Trap | Question |
|---|---|---|---|
| W1 | profiling | - | How many rows are in the dataset, and what date range does it cover? (2 checks) |
| W2 | profiling | - | Is there more than one location in this data? |
| W3 | analytical | TG | On average, how windy is the windiest day of a month? (per-(year,month) MAX(WindKph), then averaged — naive `AVG(WindKph)` is roughly 2x low) |
| W4 | analytical | TG | What is the average daily temperature swing (TempHighC − TempLowC) in each calendar month of the year? |
| W5 | analytical | - | What is the single global average TempHighC across all days? (floor/regression guard) |
| W6 | analytical | TG+F | Considering only days with Humidity above 70, what is the average monthly-mean TempLowC? |
| W7 | analytical | F | What is the average WindKph in 2024? |

### stock_prices.csv (2500 rows, single-entity daily OHLCV — **role: the regression guard**.
Trap-light by design; an arm that wins on ecommerce/chasm but loses accuracy here is reported
as a tradeoff, not a win)

| # | Category | Trap | Question |
|---|---|---|---|
| S1 | profiling | - | How many rows / what date range does this cover? (2 checks) |
| S2 | analytical | - | What is the average daily trading range (High − Low)? |
| S3 | analytical | - | On how many days did the stock close higher than it opened? |
| S4 | analytical | - | What is the highest single-day Close price, and on what date? |
| S5 | analytical | TG | What is the average total monthly trading volume? (naive `AVG(Volume)` is off by roughly the number of trading days per month, ~21x — unmissable, free trap on this data) |

### product_reviews.csv + ecommerce/products.csv (520 reviews, simple 2-table join)

| # | Category | Trap | Question |
|---|---|---|---|
| R1 | profiling | - | How many distinct ProductIds are referenced in the reviews? |
| R2 | analytical | join | What is the average Rating per product category (product_reviews.ProductId → products.product_id)? |
| R3 | analytical | F (small-N) | Which product has the highest average rating among products with at least 7 reviews (threshold raised from an initial 5, which ties at exactly 4.2 between two products — checked tie-free before freezing, see BUILD_NOTES.md)? |
| R4 | analytical | - | What is the overall average Rating across all reviews? |

### chasm dataset — products + order_items + product_reviews together (**new, per
OPUS_REVIEW.md I1**: both `order_items` and `product_reviews` fan out independently from
`products` — the textbook chasm trap. Verified: `product_reviews.ProductId` normalizes to
`product_id` so name-agreement fires, containment is 1.0, the edge is confident. A naive
three-way join multiplies revenue by review count and rating by line-item count — both
silently wrong. A2's per-edge rollup views are exactly the right fix here — aggregate each
fan-out separately, then join — so this is a genuine second test of the mechanism, not a
repeat of the first)

| # | Category | Trap | Question |
|---|---|---|---|
| C1 | profiling | - | How many products, line items, and reviews are there? (3 checks) |
| C2 | analytical | X | For each product category, what is the total revenue and the average review rating? |
| C3 | analytical | X | Which product category has the best average rating per dollar of revenue? |
| C4 | analytical | X+F | Among products with at least 5 reviews, which has the highest total revenue? |

### ecommerce/ (customers, orders, order_items, products — the sharpest single-fan-out grain
trap, now with the view-selection traps that make A2 actually falsifiable)

| # | Category | Trap | Question |
|---|---|---|---|
| E1 | profiling | - | How many rows in each of the four tables? |
| E2 | profiling | G | On average, how many line items does an order have? |
| E3 | analytical | G+M | What is the average order value? (gold = `quantity × unit_price` rolled up to order grain; the view also carries a `sum_unit_price` distractor — see A2's dual-measure rule below) |
| E4 | analytical | G+F | What is the average order value for orders with status = 'completed'? |
| E5 | analytical | F | What is the total revenue from completed orders? |
| E6 | analytical | G | Which customer has the highest total spend across their completed orders? |
| E7 | analytical | G | What is the average number of items per order? |
| E8 | analytical | G+F+V | Which product category generated the most total revenue from **completed orders only**? (the product-grain rollup view pre-aggregates across *all* statuses — using it here is silently wrong; this is the discriminating twin of E12) |
| E9 | analytical | G | What are the top 4 products by total units sold (cut from an initial top-5, which ties across ranks 2-4 at 105 units — checked tie-free before freezing, see BUILD_NOTES.md)? |
| E10 | analytical | F | How many orders are in each status? |
| E11 | analytical | V | What is the average price of a single line item across completed orders? (line grain is correct here — the order-grain rollup view is the trap) |
| E12 | analytical | V | Which product category generated the most revenue overall, across every order status? (the product-grain view **is** correct here — the discriminating twin of E8, where it's wrong) |
| E13 | analytical | V+G | What is the average total spend per customer, counting only completed orders? (two-hop; the customer-grain rollup view counts *orders*, not money — a decoy) |
| E14 | analytical | V+M | What is the average order value? — same gold as E3, graded specifically against `viewUsage` to see whether the model picks `quantity_x_unit_price` or the `sum_unit_price` distractor when both are visible in the same view |
| E15 | analytical | V | How many distinct customers placed at least one order in 2024? (no generated view helps here; raw `orders` is correct — a view-reflex model gets this wrong) |
| E16 | analytical | G | On average, how much revenue does a customer generate? — gold pre-registers the denominator as **all 400 customers**, including those with zero orders; the check passes only if the model's `assumptions` field states that convention explicitly |

### ecommerce-dirty/ (new, per I9 — **scope note: first item cut if the session runs long**;
everything else in this bank is load-bearing for whether the core claim is even measurable,
this one is about how far it generalizes)

A committed, seeded mutation of `ecommerce/`: 3% of `order_items` rows re-pointed to a
non-existent `order_id`; 1% of `orders.customer_id` set to NULL; 20 `orders` rows given no
line items at all; one `products.product_id` duplicated. The same E-series questions are
asked, gold recomputed against the mutated data (orphan line items excluded from order-grain
aggregates; orders with no items count as value 0, not missing — pre-registered convention).
Reported as a separate series: how much of the method's benefit survives imperfect keys. All
five other datasets are pristine synthetic fixtures with no orphans/nulls/dupes in their keys
— `relationshipInference.ts`'s thresholds (`CONTAINMENT_SOLID=0.95`, `KEY_UNIQUENESS_MIN=0.98`)
are met with perfect margins there, so this variant is the only place the inference step
itself is actually stress-tested rather than fed hand-perfect input.

## 3. Arms

Ladder is **cumulative** — each row's delta is that mechanism's marginal contribution *given*
the preceding ones. The report must not phrase a result as "X does not help," only "X does not
help given A1..A(n−1)." A2′ and A1✗ exist precisely because the cumulative design makes every
other arm's contribution order-dependent, and the claim needs at least one order-independent
measurement.

| Arm | Prompt contents | Mechanism under test |
|---|---|---|
| **A0 — baseline** | Raw DDL + question → SQL. | Floor. |
| **A1 — + deterministic profile** | A0 + computed stats (row count, per-column cardinality/null-rate/min-max/sample values from `summarizeTable`+`classifyColumns`) + inferred PK candidates + a plain-language grain statement per table (`describeGrain()`) — model-facing text shows the **resolved** edge only, never the raw `evidence` string's near-tie/ambiguity clause (confirmed present on every ecommerce edge; audited in the fixture, not shown to the model, since surfacing an unresolved structural coincidence to a small model is more likely to confuse than help). | Does showing structure (not fixing it) help? |
| **A2 — + auto-generated grain-correct views** | A1 + views generated from confident FK edges only (`relationshipInference.ts`, reused). **Deterministic, pre-registered measure-synthesis rule** (this is what makes the mechanism able to compute its own target measure — v1 didn't specify this and couldn't answer E3 correctly): for every confident child→parent edge, emit (a) `COUNT(*)` as `<child>_row_count`; (b) `SUM`/`AVG` for every Quantitative column; (c) `SUM(a*b)` as `<a>_<b>_product_sum` for every same-table pair where `a` matches `/quantity\|qty\|count\|units/i` (numeric-typed, regardless of semanticType — a real per-line quantity is exactly what the classifier's low-cardinality heuristic mislabels Categorical) and `b` matches `/price\|amount\|cost\|value\|revenue\|total\|fee\|rate/i` and is Quantitative. Both the correct measure and the wrong-measure distractor are visible in the same view — the model must choose, never told which. Already implemented and validated in `profiler.ts` (`findValuePairs`/`buildRollupView`); recovers the known-correct 1337.35 average-completed-order-value exactly. | The novel claim: does a *generated* (not hand-authored) grain fix, that can actually compute the target measure, transfer to small local models? |
| **A3 — + schema-derived few-shot** | A2 + 2–3 worked question→SQL examples synthesized from the schema+grain (never from the real eval questions). | Does a worked grain-correct example teach the pattern? |
| **A4 — + forced plan-first (full stack)** | A3 + a required `{grain, tables, filters}` object emitted before `sql`, in the same structured-output call (`planFirstOllama.ts`, live-validated against `qwen3:1.7b`) — directive, not optional, per the repo's own prior finding that passive planning offers go unused. | Ceiling. Does forcing an explicit grain statement prevent silent wrong-grain answers even with A2's views available? |

**Diagnostic arms — ecommerce/ only, do not run on the other datasets:**

| Arm | Prompt contents | Mechanism under test |
|---|---|---|
| **A2′** | A0 + generated rollup views, **no profile**. | Breaks the ladder's order-dependence: are the views load-bearing on their own, without A1 already having primed the model? |
| **A1✗** | A1 with the grain statement and fanout ratio **deliberately corrupted** (parent/child inverted, ratio negated). | Negative control: if accuracy does not drop vs. A1, the model isn't reading the profile and A1's gain is a prompt-length/token-count artifact, not comprehension. Cheapest falsifiability instrument in the whole design. |

**Not on the ladder as an arm, but applied uniformly to every arm** (revised from v1, which
excluded it entirely — see below): execution-guided one-shot repair on a DuckDB error, reusing
exp17's repair path. RESEARCH.md's finding stands — this mechanism cannot fix a syntactically
valid, successfully-executing, silently-wrong-grain query, so it's correctly excluded as a
*ladder arm*. But applying it only to some arms would let A1/A2's binding-error rescue (the
model now knows the column is called `unit_price`) masquerade as grain correction. Repair is
applied identically everywhere; `repairUsed`/`repairSucceeded` logged and reported per arm so
binding-rescue and grain-correction effects stay visible as separate lines, not conflated into
one delta.

## 4. Controls

- **Determinism probe, run first**: 20 identical calls, one prompt, one model, temperature 0.
  Record the identical-output rate in the manifest. If ≥95%, run **N=2** (one repeat is a
  determinism audit, not a statistical sample — repeats are never treated as independent
  trials in any confidence interval; the unit of analysis is the *check*). If <95%, the
  backend isn't deterministic enough and N=5 is used instead — report the probe result either
  way. **Run live against every candidate model available locally — `qwen3:1.7b`, `qwen3:4b`,
  `qwen2.5-coder:1.5b` (`determinismProbe.ts`, see BUILD_NOTES.md): 20/20 identical, 100% on
  each — this experiment runs at N=2.** `qwen3.5:4b`, `qwen3:14b`, and the
  `qwen2.5:7b-instruct`/`qwen2.5-coder:7b-instruct` pair are not pulled locally and remain
  unverified.
- `think` off, matching exp17 precedent.
- **`num_ctx` pinned explicitly per model** (never left at model default — `qwen3.5:4b`'s
  native 256K context makes an unpinned KV cache ruinous on 8GB), recorded in the manifest,
  and **never varies by machine** (so truncation behavior stays comparable between the 4B and
  14B runs). `prompt_eval_count` is asserted after every call: **a call whose prompt token
  count exceeds 0.8 × num_ctx fails the run rather than being scored** — Ollama truncates
  over-long prompts silently and from the *front* (where the DDL and grain statements live),
  so an unchecked overflow would be indistinguishable from "the mechanism didn't work."
- Model axis:
  - `qwen3:1.7b` (small-model floor, all main + diagnostic arms).
  - Winner of the bake-off among `qwen3:4b` / `qwen3.5:4b` (3.4GB Q4, 4.66B params, 256K
    ctx — verified; v1's ~2.5GB estimate was low) / `qwen2.5-coder:1.5b` (8GB-viable primary,
    all main + diagnostic arms).
  - `qwen3:14b` (M4-only capacity control) — **runs A0 and A4**, not A0 alone, so the report
    can state whether the method's effect size is larger at 4B than at 14B, not merely that a
    dressed-up 4B reaches an undressed 14B.
  - Coder-vs-general, **same base, same size, same quant**: `qwen2.5:7b-instruct` (4.7GB Q4)
    vs `qwen2.5-coder:7b-instruct` (4.7GB Q4), both Qwen2.5 — code-tuning is then the only
    variable. A0 and A4 only, M4. **Pre-registered claim scope**: with two arms and one model
    pair, this supports only a directional, family-and-size-scoped observation with its CI
    ("on this bank, at 7B within Qwen2.5, code tuning changed grain-family accuracy by X pp
    (95% CI …)") — the report must not generalize to "coder models are worse at semantic
    errors."
- **Viability budget, pre-registered**: p95 end-to-end latency per question on the 8GB machine
  must be under 30s and peak RSS under 6GB for a method to be reported as viable. An arm that
  wins accuracy but exceeds the budget is reported as "accurate but not shippable at this
  tier" in the headline table, not a footnote.
- Every prompt, emitted SQL, raw result, error, arm, model, machine, token counts (prompt +
  completion), and peak memory logged per call.

## 5. Scoring

- **One tolerance rule** (v1 stated three inconsistent ones): scalar numerics match if
  `|actual − gold| ≤ max(0.01, 0.001 × |gold|)` — absolute 0.01 or 0.1% relative, whichever is
  larger. Counts and IDs must match exactly. `score.ts`'s comparator implements this rule
  directly (not the stricter round-to-2dp-then-exact-equality it originally had, which would
  fail correct answers differing only in float summation order).
- **Four outcome buckets per call** (v1 had three; bucket 3 is gameable by abstention alone,
  see below):
  1. **Correct** — ran, matched gold within tolerance.
  2. **Wrong-but-ran** (dangerous) — executed successfully, produced a value, didn't match.
  3a. **Abstained** — model emitted `status: "unsupported"`.
  3b. **Malformed** — structured output failed schema/Zod validation.
  3c. **Execution error** — DuckDB rejected the SQL, or the guard blocked it.
- **Floor rule**: a "safety win" (bucket 2 → bucket 3) may only be claimed if the arm's
  correct-rate does not fall relative to the comparison arm, *and* the shift is into 3c, not
  3a. A method that only raises abstention is reported as a capability regression, not a
  partial win — otherwise A4's heavier structured-output burden could look like a safety
  improvement by simply making the model give up more.
- **`viewUsage` instrumentation**: every emitted SQL string is tagged by regex against that
  dataset's generated view names — `none` / `correct-view` / `wrong-view` / `mixed`. The
  report cross-tabulates outcome bucket × `viewUsage` per arm. An A2 win that shows up mostly
  as `none` is *not* a view effect and must not be reported as one; a `wrong-view` rate that
  rises from A1 to A2 is a cost of the mechanism, reported alongside the gain. Without this,
  the §6-open-question-2 worry (A2 wins by lexical noun-matching, not grain reasoning) is
  unanswerable after the fact.
- **Analysis plan** (see §1 for the primary endpoint and falsification rule). Secondary
  endpoints, each with its own CI: overall correct-rate, wrong-but-ran rate, abstention rate,
  grain-family rate split by explicit vs. paraphrased wording. Every arm-comparison figure in
  the report carries a CI — a bare bar chart of percentages is not an acceptable output.
  Binding-error rate (bucket 3c specifically) is reported per arm so a reader can see how much
  of any arm's gain is repair/binding rescue rather than grain correction.
  Report scalar and row-set accuracy separately (row-set checks are all-or-nothing, which
  makes bank-wide percentages misleading if mixed with scalar checks).

## 6. Resolved (v1's open questions — now answered by the review, not still open)

v1 asked six questions here for the Opus review. All six are answered in `OPUS_REVIEW.md`'s
closing summary and folded into the fixes above; nothing remains open at the design level.
Remaining genuine unknowns are empirical, not design gaps — e.g. whether A2 actually clears
the +15pp McNemar bar, and whether the coder-vs-general pair shows a real (if narrowly scoped)
effect. Those are for the run to answer, not this document.

## 7. What's new build vs. reuse

Reuse (adapt, don't rewrite): `summarizeTable`/`classifyTable` pattern (ingestion.ts, adapted
in `profiler.ts` for the Node/`@duckdb/node-api` runtime), `classifyColumns` (classifier.ts),
`generateCandidates`/`scoreCandidate`/`assembleEdges` (relationshipInference.ts), DuckDB
bootstrap pattern + Ollama structured-output wrapper (exp17's `bootstrap.ts`/`ollama.ts`),
exp17's one-shot repair path (for the now-uniform-across-arms repair step).

New, built and validated already: `describeGrain()` (multi-parent-aware, fixed after the
combined-catalog smoke test caught a first-match-only bug — see `BUILD_NOTES.md`),
`findValuePairs`/`buildRollupView()` (the dual-measure rule B2 required), `bootstrap.ts`
(combined 8-table catalog), `score.ts` (tolerance + bucketing — needs the 3a/3b/3c split and
tolerance-rule fix applied), `planFirstOllama.ts` (A4's schema, live-validated).

Still new, not yet built: `fixtures/dataset-facts.json` generator + premise-assertion gate,
`fixtures/questions.json` + dual-independent-SQL gold computation, `ecommerce-dirty/` mutation
script, the chasm-dataset registration, paraphrase authoring, `viewUsage` regex tagger, the
determinism probe, the arm prompt-assembly layer, and the run/scoring loop wiring all of the
above together.
