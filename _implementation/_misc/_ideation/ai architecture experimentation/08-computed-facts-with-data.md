# 08 — Computed facts with data access (app computes, model narrates, citations bind)

**Thesis:** the model's fabrications stem from having too little to ground on — `StructuralFacts`
carries names and types but not *what the data actually says*. Fix the input, not just the output:
the **app computes real statistics** from the full dataset — not just aggregates but *shape*
(deciles, concentration, outliers, dead columns, where groups fail to separate) — sends those
pre-verified facts *plus* exemplar rows the statistics themselves selected, and the model narrates
only what the app already proved. Per-clause citation binding (03's mechanism) ensures every claim
traces to a specific computed fact — misattribution, invented values, and world-knowledge injection
are all caught.

**Status:** untested. **Policy override:** this experiment lifts **Invariant 1** (rows-free wire
boundary, D20/D45/D46/D59) by owner decision — for the cloud path this is now better read as an
implementation of **D72** (2026-07-24), which already sanctions a capped row sample and forbids
sending the whole dataset. A proposed custody-tiered extension (full dataset to a local model) is
recorded, with its counter-evidence and a one-hour falsification test, under
[Custody tiering](#custody-tiering--full-dataset-local-grounding-added-2026-07-26-untested-hypothesis). The prior probe finding — that sending rows made
fabrications *worse* — is addressed here by separating the roles: the app computes aggregates from
rows (deterministic, verified); the model sees computed results + a small context sample, but is
**never asked to derive statistics from raw rows**. **Cost class:** moderate build, cheap at runtime
(one model call). **Prior art:** combines the strongest pieces of
[01](01-phrase-library.md) (deterministic capability detection),
[02](02-generate-then-verify.md) (the enumerated closure-rule list),
[03](03-clause-citation-binding.md) (per-clause citation binding), and
[06](06-schema-constrained-slots.md) (closed vocabulary for content-bearing fields).

**Scope — prototype only (owner decision, 2026-07-27).** 08 stays in `eval/`. Nothing here is wired
into the app on this pass: the deliverable is `RESULTS.json` plus a written verdict, and the served
prose is then read by hand against the app's real text areas to judge whether it is worth shipping
at all. Additional datasets beyond the five §14 fixtures will be added by the owner to test
consistency; the harness must therefore take its dataset list from
[`eval/dataset/tables.ts`](../../../../eval/dataset/tables.ts)'s manifest rather than hardcoding five.
The full-dataset arm below is an **experiment condition, not a shipping path** — D72 forbids
whole-dataset egress, so it can never be the app's behaviour regardless of how it scores.

Read [`README.md`](README.md) first — problem statement, F1–F3, invariants (with the Invariant 1
override noted), rubric.

---

## What it attacks

**All three, by combining richer input with structural output verification.**

| Fabrication | Why prior approaches failed | How this fixes it |
| :--- | :--- | :--- |
| **F1 — misattribution** ("survivors" vs Pclass) | 01 doesn't cover the headline fact; 02's global token check can't distinguish column A from column B | Per-clause citation (from 03): the claim must cite the specific fact it came from, and `{survivors} ⊄ {Pclass, Fare}` is a rejection. Plus variance-explained computed for *every* Categorical × Quantitative pair, so the fact table carries an explicit negative ("survival explains almost none of the variation in fare") for the model to cite rather than a gap to fill |
| **F2 — invented value** ("Manchester") | The model had no real values to ground on; `StructuralFacts` carries `cardinality: 1` but not `value: "Springfield"` | The app sends computed top values for low-cardinality columns — the model can say "Springfield" because the app proved it; "Manchester" is not in any cited fact's value set |
| **F3 — world-knowledge injection** ("sank in April 1912") | More rows = more training-data recall; no date column exists | Citation binding: the model must cite a fact, and no temporal fact exists to cite. Plus: with real computed statistics in front of it, the model has *less reason* to fill gaps from its training data |

## Why previous "send rows" failed, and why this is different

The probe doc's finding was specific:

> "a prefix sample skews, and a model eyeballing an aggregate from a row dump is not computing it"

That is exactly right — and this experiment does neither:

1. **The app computes aggregates, not the model.** Mean, median, std, min, max, correlation
   coefficients — all deterministic SQL, computed by the app from the full dataset, verified before
   the model ever sees them. The model's job is to *describe* these pre-computed results, never to
   compute statistics from rows.
2. **Sample rows are context, not computation input.** Exemplar rows — the modal row and the
   outliers the computed facts already flagged (§1a) — give the model domain vocabulary ("this is
   passenger data", "these are stock tickers") without asking it to derive anything from them. The
   prompt explicitly forbids statistical claims from the sample, and the inertness rule (§1a) means
   nothing interesting in a sent row lacks a citable fact behind it. How many rows are sent is the
   ladder variable the falsification test below sweeps, from zero to the full table.
3. **Per-clause citation means every claim is checked.** Even if the model hallucinates something
   from the sample rows, it must cite a computed fact to back it, and the citation check catches the
   mismatch.

The prior failure mode was: "model sees rows → model invents statistics from them → no check."
This design is: "app computes statistics → model describes them → citation check verifies each claim."

---

## Mechanism

Four stages. The first two are deterministic; the third is the model call; the fourth is
verification.

### 1. App computes an enriched fact set (deterministic, full dataset access)

Extend `StructuralFacts` (or build a parallel `EnrichedFacts`) with real computed values. Each fact
gets a stable id and an explicit entity/value set (03's `CitableFact` pattern):

```ts
interface ComputedFact {
  id: string;                      // 'stat:titanic.Fare.by_Pclass'
  kind:
    | 'aggregate' | 'distribution' | 'concentration' | 'outlier' | 'dead-column' | 'null-structure'
    | 'group-breakdown' | 'variance-explained' | 'correlation' | 'association' | 'dependency'
    | 'trend' | 'seasonality' | 'coverage-gap' | 'temporal-span' | 'top-values'
    | 'join-cardinality' | 'referential-integrity' | 'arithmetic-consistency' | 'sentinel'
    | 'domain-guess';
  entities: string[];              // ['Fare', 'Pclass'] — the ONLY names a citing claim may use
  values: (string | number)[];     // [84.15, 13.68, 'Pclass'] — the ONLY values it may state
  statement: string;               // human-readable: "Mean Fare for Pclass 1: 84.15, Pclass 3: 13.68"
  sql?: string;                    // the query that produced it (provenance, auditable)
}
```

**What the app computes from the actual data.** Mean and standard deviation are not enough: a column
can look unremarkable on those two numbers while being 80% one repeated value with a handful of wild
outliers. The fact set therefore has to carry **shape** — where the data is boring and where it
stands out — not just central tendency.

**The constraint is not compute, it is licensing.** Every value in a fact's value set is a number the
model may state in *any* sentence citing that fact. So the goal is not "more mathematics" — it is
mathematics that **collapses a lot of data into one number a person would actually say**. Three tests
a candidate statistic must pass before it earns a place in the table:

1. **Narratable** — does it produce a sentence a human would write? `skewness = 1.89` fails.
   "Fares are strongly right-skewed — the mean of 32.20 sits well above the median of 14.45" passes.
   If the statistic only reads as a sentence *after* being converted to something else, compute the
   something else and drop the raw moment.
2. **Checkable** — few values, tightly bound. A nine-number decile fact licenses nine numbers in any
   combination; a median fact licenses one.
3. **Deterministic** — rules out k-means, PCA, and anything with random initialization. A
   non-deterministic fact breaks R2 before the model is even called.

All SQL below was verified to run on this repo's DuckDB build
([`eval/duckdb/duckdb.ts`](../../../../eval/duckdb/duckdb.ts)) against the titanic fixture; the
example values are real output, not illustrative.

**Single-column shape:**

| Fact kind | Source | Example |
| :--- | :--- | :--- |
| **Per-column aggregates** | `AVG, STDDEV, MIN, MAX, MEDIAN` | "Mean Fare: 32.20, Std: 49.69, Median: 14.45" |
| **Deciles** | `quantile_cont(col, [0.1, …, 0.9])` — the primary shape signal | "Fare deciles: 6.90 … 21.24 … 97.25" |
| **Skew, as a sentence** | mean vs. median gap, **not** the raw `skewness()` moment (test 1) | "Fares are strongly right-skewed — mean 32.20 against median 14.45" |
| **Concentration** | modal share, and distinct values covering 90% of rows | "Embarked: 72% of rows are 'S'; 2 distinct values cover 90% of rows" |
| **Inequality / Pareto share** | `sum(x) FILTER (WHERE percent_rank > 0.9) / sum(x)`, plus Gini | "The top 10% of fares account for **36.6%** of all fare paid" |
| **Outliers** | count and magnitude beyond 1.5×IQR | "Fare: 116 rows above 65.63 (1.5×IQR); max 512.33" |
| **Dead columns** | cardinality 1, or modal share > 99% | "Cabin_Class: single value across all 891 rows" |
| **Null structure** | null rate, plus whether nulls cluster in one range of an ordered column | "Age: 19.9% null, spread evenly across Pclass" |
| **Sentinel values** | spikes at 0 / -1 / 999 that are disguised nulls | "Fare has 15 rows at exactly 0.00" |
| **Top values** | `GROUP BY val ORDER BY count DESC LIMIT 5` | "Top Embarked values: S (644), C (168), Q (77)" |

**Cross-column relationships** — the group that most improves R3 reach, because `StructuralFacts`
can say nothing here at all:

| Fact kind | Source | Example |
| :--- | :--- | :--- |
| **Variance explained (η²)** | within-group variance vs. total, per Categorical × Quantitative pair | "Passenger class explains **70%** of the variation in fare" |
| **Group-by breakdowns** | Quantitative × low-cardinality Categorical | "Mean Fare by Pclass: {1: 84.15, 2: 20.66, 3: 13.68}" |
| **Correlation pairs** | `corr()` — already computed by the profiler (`correlationPairs`) | "Pclass–Fare correlation: -0.55" |
| **Rank correlation** | `corr()` over `rank() OVER (ORDER BY …)` — catches monotonic-but-curved | "Age and Fare rank-correlate at -0.01 — no monotonic relationship" |
| **Categorical association** | Cramér's V (χ²/n) for Categorical × Categorical | "Embarked and Pclass are not independent (V = 0.15)" |
| **Functional dependency** | `count(DISTINCT A) = count(DISTINCT (A, B))` — nearly free | "city determines state"; "Pclass does **not** determine Survived" |

**Temporal** (currently only spans exist):

| Fact kind | Source | Example |
| :--- | :--- | :--- |
| **Temporal spans** | `MIN(date_col), MAX(date_col)` — exact, not just from `StructuralFacts` | "order_date: 2021-01-04 to 2024-01-18" |
| **Trend, with its own caveat** | `regr_slope` + `regr_r2` | "Revenue rises about $340/month, but the trend explains only 12% of the variation" |
| **Calendar seasonality** | η² again, grouping by month-of-year | "Month of year explains 31% of the variation in sales" |
| **Coverage gaps** | expected vs. present dates across the span | "Spans 2021–2024, but 47 days have no rows" |

**Multi-table** — the current largest gap; the 4-table `ecommerce` fixture computes none of these,
and §4's target narrative cannot be reached without them:

| Fact kind | Source | Example |
| :--- | :--- | :--- |
| **Join fan-out** | min/median/max children per parent across a join key | "Each customer has 1–47 orders, median 3" |
| **Referential integrity** | anti-join count | "312 order_items reference a product_id absent from products" |
| **Arithmetic consistency** | candidate `a = b × c` relations among numeric columns | "order_total equals quantity × unit_price in 99.7% of rows (14 exceptions)" |

**Non-citable:**

| Fact kind | Source | Example |
| :--- | :--- | :--- |
| **Capability keys** | [`detectCapabilities`](../../../../src/lib/datasetCapabilities.ts), imported from 01 | "Supports cohort-retention: customer_id repeats across order_date" |
| **Exemplar rows** | the modal row and the outlier rows the facts above identified | (domain context, not citable — see below) |

**η² is aimed squarely at F1.** The fabrication attached a real fare statistic to **survivors** when
the measured fact was about **Pclass**. Computing variance-explained for *every* Categorical ×
Quantitative pair produces both the true fact ("class explains 70% of fare variation") and an
explicit negative for the wrong one ("survival explains almost none of it") — so the model has a
fact to cite instead of a gap to fill. A misattribution the fact table can *contradict* is much
weaker than one it merely fails to support.

**Negative facts are load-bearing.** "These groups do not separate" and "this column is a single
value" are worth computing and worth serving. They are what stops the model reaching for a
comparison the data does not support — the R3 gap that schema-only candidates cannot close, because
`StructuralFacts` cannot distinguish a column that varies from one that does not.

**Fact granularity is a safety parameter, not an organizational one.** Richer facts and a tighter
check pull in opposite directions: bundling nine deciles into one `ComputedFact` licenses nine
numbers in any combination a citing sentence cares to make, while splitting the same computation
into claim-sized nuggets — "the median Fare is 14.45", "the top decile begins at 77.96" — keeps each
license narrow enough that `checkCitation` still means something. **Prefer many small facts over few
fat ones**, and treat any fact whose value set runs past a handful of numbers as a candidate for
splitting. The cost is prompt size and a longer fact table; the benefit is that the citation check
does not quietly become a rubber stamp as the fact set grows. Report the mean and maximum value-set
size per dataset in the verdict — a fact table whose average fact licenses fifteen numbers has
weakened the mechanism regardless of what the fabrication count says.

**Deliberately not computed, and why:**

| Rejected | Reason |
| :--- | :--- |
| Raw `skewness()` / `kurtosis()` | Fails test 1 — unnarratable as a number. The mean-vs-median sentence carries the same information in a form a person would say. |
| Benford's-law digit tests | Exotic and false-positive-prone on small or bounded columns; would produce alarming claims the data does not support. |
| k-means, PCA, any clustering or embedding | Fails test 3 — random initialization means the same dataset yields different facts across repeats, breaking R2 before the model is called. Also unnarratable and unverifiable by `verifyStats.ts`. |
| Full histograms as a single fact | Fails test 2 — a 20-bin histogram is a 20-number license. Derive the narratable consequence (modality, peak location) and serve that instead. |

**Critical design choice:** exemplar rows are **not** `ComputedFact`s and are **not citable**. The
prompt labels them as "context for understanding the domain" and the citation validator rejects any
claim citing a sample-row id (because no such id exists). This prevents the failure mode of "model
invents a statistic from eyeballing the sample."

### 1a. Rows and compute are the same currency, at a rate that flips with size

Rows and computed facts both buy grounding, and which is the better buy depends entirely on how big
the dataset is:

- **Small dataset:** the rows *are* the complete truth. Nothing is lost to summarization, and
  sending them is cheap. Rows are the better buy; compute adds little the rows do not already show.
- **Large dataset:** whatever rows fit are a *biased slice* — a prefix skews, and even a stratified
  sample is a sample. A computed statistic is an unbiased summary of the whole table. Compute is
  the better buy, by a widening margin.

So the allocation is inverse: **more rows and less compute for small datasets, more compute and
fewer — but better-chosen — rows for large ones.** This is the answer to "just send everything":
past a size the fact table reaches every row, and the row budget never can.

**Exemplar rows: let the statistics choose them.** Rather than a random or stratified sample sent
for generic "domain flavour", send the rows the computed facts already singled out — the modal row
(what boring looks like here) and the specific rows the outlier detection flagged (what standing out
looks like here). Rows then stop being a second, unverified channel of information: each row spends
its tokens illustrating a fact that is already in the citable table.

**The inertness rule (load-bearing):** *never send a row whose interesting content is not already
covered by a citable fact.* If the $4,200 outlier order is in the exemplar block, there must be a
`ComputedFact` stating that maximum — otherwise the model will narrate the row and there is nothing
to check the claim against, which is exactly the failure kill criterion (f) exists to catch. Held to
this rule, an exemplar row cannot tell the model anything the fact table does not already say, which
is what makes rows safe to send in bulk at all.

**Compute everything; vary only what is sent.** DuckDB is local and fast, so there is no reason to
skimp on computation — compute the full fact set every time, and treat prompt assembly (how many
facts, how many rows) as the knob. One code path with a parameter, not several compute tiers to
debug. The "adaptive compute depth" idea recorded below then reduces to an automatic knob-setter,
not a separate mechanism.

### 2. Build the citable fact table + sample context (deterministic)

Reuse 03's `CitableFact` pattern, but populate it from the enriched computation above instead of
from `StructuralFacts` alone. Each fact carries its entity set and value set for verification.

```ts
function buildEnrichedCitableFacts(
  tables: TableRegistryEntry[],
  tableInsights: TableInsights[],
  computedStats: ComputedFact[]
): CitableFact[] {
  // Merge insights-derived facts (from 03's buildCitableFacts) with
  // the new computed statistics — both are CitableFact-shaped and go
  // through the same citation checker.
}
```

The sample rows are formatted separately, outside the fact table:

```ts
function formatSampleContext(rows: Record<string, unknown>[], tableName: string): string {
  // Render ~10 rows as a markdown table, preceded by:
  // "Sample rows for domain context only. Do not derive statistics from these rows.
  //  Cite only the computed facts above."
}
```

### 3. Model narration with citation requirement (one model call)

The prompt shape combines 03's citation-binding instruction with the richer fact set:

```
You are describing a dataset for a data-analysis app's opening screen. You receive:
1. COMPUTED FACTS — verified statistics about this dataset, each with an id.
   You may ONLY state claims that cite one of these facts.
2. SAMPLE ROWS — a small sample for domain context. Do NOT derive statistics,
   counts, percentages, or trends from these rows.

For each sentence you write, output a (text, cites) pair. `cites` must be a
valid fact id from the fact table. If you cannot cite a fact, do not make the claim.

Never use any of these words: ${FORBIDDEN_WORDS}.

Answer with ONLY this JSON, no prose, no code fences:
{"claims": [{"text": "...", "cites": "stat:..."}, ...]}
```

The user prompt includes the full `ComputedFact[]` table (id + statement + entities for each) plus
the sample-row context block.

### 4. Per-claim citation verification, then deterministic assembly

Reuse 03's verification — [`checkCitation`](../../../../src/lib/citableFacts.ts) and
[`narrationValidator`](../../../../src/lib/producerValidators.ts), imported not copied:

```
for each claim:
  fact = factTable[claim.cites]           // unknown id → reject
  named  = extractEntities(claim.text)
  stated = extractValues(claim.text)
  reject unless named  ⊆ fact.entities ∪ NEUTRAL_VOCABULARY
  reject unless stated ⊆ fact.values   ∪ derivableFrom(fact)
  reject unless passesPhrasingGuard(claim.text)
```

**`derivableFrom` does not exist yet — 08 has to build it, and it is the highest-risk piece.**
[`checkCitation`](../../../../src/lib/citableFacts.ts) currently applies strict set membership
(`offendingValues` filters on `!allowedValues.has(v)`). That is survivable for 03, whose facts carry
pre-rendered values a model can echo verbatim; it is *not* survivable for 08, whose facts carry raw
computed numbers. A fact stating `84.15` will be narrated as "about 84" and rejected. Every
rounding, ratio, and percentage conversion dies the same way, and kill criterion (c) (≤25%
false-reject) fails on arithmetic rather than on anything about the mechanism.

**Adopt 02's discipline exactly:** [`groundingCheck.ts`](../../../../eval/02-generate-then-verify/groundingCheck.ts)
already exports a `CLOSURE_RULES` array — an explicit, enumerated, logged list of what counts as
derivable (numeric normalization, year extraction, date-span arithmetic, baseline carryover). 08
extends that list for computed statistics; it does **not** substitute a fuzzy or tolerance-based
match, because a loose value check is precisely how a wrong number acquires a valid citation. Rules
to add, each enumerated and reported:

- **Rounding of a cited value** — `84.15` licenses `84.2`, `84`, `~84`; the rounded form must be a
  genuine rounding of one value in the fact, never of a value derived from two.
- **Ratio between two values in the same fact** — a group-by fact stating `{1: 84.15, 3: 13.68}`
  licenses "roughly 6×", within one significant figure.
- **Percentage/share restatement** — a fact stating a count and its total licenses the percentage.

Record the rule count in the verdict, as 02 does. **A growing closure list is a result, not a
tuning task** — every rule widens what a citation permits, and the list's length is the honest
measure of how much of the check has been traded away.

Surviving claims are assembled by the app. Reject-all degrades to the deterministic baseline (D65).

**Run both settings in one pass.** Record each claim's disposition under the strict check *and*
under the closure rules, in the same run. Both numbers come free, and the difference between them
is the exact price of `derivableFrom` — measured, not argued.

---

## Why the richer input should reduce hallucination, not increase it

The prior finding — more context = more fabrication — was about **raw rows in the prompt with no
verification**. The model was given data and asked to make claims, with no structural check. Of
course it hallucinated.

This design inverts the dynamic:

1. **More real facts = less reason to invent.** With actual computed statistics ("Mean Fare by
   Pclass: 1→84.15, 3→13.68"), the model can state grounded things. With only
   `{name: "Fare", semanticType: "Quantitative", cardinality: 248}`, it has to guess.
2. **Citation binding catches anything the model adds anyway.** Even with richer input, the model
   might still inject training-data knowledge — but the citation check rejects uncitable claims.
3. **The sample is non-citable.** The model can use it for vocabulary ("this is passenger data")
   but cannot cite it for a statistical claim, closing the "eyeballing a sample" failure mode.

---

## What the citation check does NOT catch (observed live in 03, 2026-07-26)

03's live run is **no longer blocked** — [`eval/03-clause-citation-binding/RESULTS.json`](../../../../eval/03-clause-citation-binding/RESULTS.json)
(2026-07-26, `qwen2.5-coder:14b`) records 25 runs: **22/25 served, 23/25 compliant**. Two served
headlines show leaks that passed `checkCitation` cleanly, and 08 makes both *more* likely because it
hands the model a far larger fact table and more room to editorialize:

| Served claim | Why it passed | Why it is a problem |
| :--- | :--- | :--- |
| "**First-class** passengers' mean fare is 1.6σ above the rest." | `First` is sentence-initial, so `extractEntities` skips it as ordinary capitalization; `class` is lowercase and stem-matches nothing in the vocabulary (`Pclass` stems to `pclass`/`pclas`) | The cited fact says **Pclass 1**. "First-class" is world knowledge — correct here by luck, and the same hole passes an incorrect gloss just as silently. A domain reading the fact never states is F3 in miniature. |
| "**\"1\"'s** mean Fare is 1.6σ above the rest." | `1` is in the fact's value set, so the value check passes | Citation-clean and unreadable. The check governs truth, not prose — nothing in the mechanism prevents a served headline that no one would ship. |

**Consequence for 08's verdict:** citation-clean is the floor, not the bar. The verdict must report
**served prose quality by hand**, separately from the fabrication count, because these two examples
would both score as clean runs. This is the axis the owner is evaluating 08 on (see Scope above) —
whether the served text is usable in the app's real text areas — and no automated criterion covers it.

**Known gap, recorded not closed:** the lowercase-unresolvable-word hole is general. Any domain term
the model knows and the fact does not state ("first-class", "premium tier", "peak season") passes
the entity check whenever it is lowercase and shares no stem with a real column name. Widening
`extractEntities` to catch it would reject large amounts of ordinary English and blow up the
false-reject rate. Report it as a limit of the mechanism; do not attempt to close it in 08.

## What to build

1. **`eval/08-computed-facts/computeStats.ts`** — runs DuckDB queries against the sample CSVs to
   produce `ComputedFact[]` for each dataset. Pure SQL, deterministic, auditable. Reuses the
   existing DuckDB infrastructure in `eval/duckdb/`, and `correlationSql.ts` / `categoricalSql.ts`
   where they already generate the right query shape. Every function the fact table above needs
   (`skewness`, `mad`, `entropy`, `regr_slope`, `regr_r2`, `corr`, `quantile_cont` over a list,
   `mode`, `approx_quantile`, `percent_rank`/`cume_dist` windows) was verified present on this
   repo's build. **Known gotcha:** `histogram()` returns a MAP whose counts are BigInt, and
   [`arrowToQueryResult`](../../../../eval/duckdb/duckdb.ts) only unwraps BigInt at the top level —
   a nested one throws "Do not know how to serialize a BigInt". Avoid `histogram()` (it fails test 2
   anyway) or extend the converter first.
2. **`eval/08-computed-facts/verifyStats.ts`** — recomputes every `ComputedFact` **by a second,
   independent method** (a plain JS reduction over the raw rows) and asserts equality with the SQL
   result. Kill criterion (g) as written — "spot-check against a manual query" — is circular if the
   check reuses the SQL that produced the number. This runs before any model call and hard-fails the
   run on mismatch: a wrong statistic carrying a valid citation is a *verified lie*, the worst
   output this design can produce. **The multi-step statistics are where this earns its keep** —
   η², Cramér's V, Gini, Pareto share and the arithmetic-consistency check are assembled from
   several SQL pieces and are the realistic places for an off-by-one or a wrong denominator to hide,
   unlike `AVG` which is hard to get wrong.
3. **`eval/08-computed-facts/closureRules.ts`** — the `derivableFrom` implementation, modelled on
   [02's `CLOSURE_RULES`](../../../../eval/02-generate-then-verify/groundingCheck.ts): an enumerated,
   exported, logged list. Each claim is evaluated twice (strict / with closure) so the price of each
   rule is measured.
4. **`eval/08-computed-facts/enrichedFacts.ts`** — merges computed stats with existing
   `buildCitableFacts` output into a unified fact table. Reuses `src/lib/citableFacts.ts`. Also
   selects the exemplar rows, and **asserts the inertness rule** (§1a): every value appearing in an
   exemplar row that is not also in some `ComputedFact`'s value set is reported, and the row is
   dropped rather than sent.
5. **`eval/08-computed-facts/prompt.ts`** — builds the system + user prompt from the fact table +
   exemplar rows. Defines the JSON output schema. **Must set `options.num_ctx` explicitly on the
   Ollama call and record the token count of every prompt** (see Ollama run below).
6. **`eval/08-computed-facts/sampleLeakCheck.ts`** — automates kill criterion (f). For each served
   claim, extract its stated values; flag any that appear in the exemplar rows' cell values but in
   no `ComputedFact` value set. At 5+ datasets × N=5 × 5 row conditions this is 125+ runs — hand
   audit alone does not scale, and (f) is the criterion that gates the whole row-sending premise.
7. **`eval/08-computed-facts/run.ts`** — harness runner. Imports existing infrastructure (dataset
   loader, eval engine, `parseModelAnswer`-style parsing, seam validators) and follows 03's
   `run.ts` structure. Runs on Ollama with N=5 repeats. Takes its dataset list from the manifest,
   not a hardcoded five. **Includes a control arm:** 03's curated-facts condition runs in the same
   process, same session, so the comparison is same-rig and same-day rather than across two runs.
8. **`eval/08-computed-facts/fixtures.test.ts`** — F1/F2/F3 as unit fixtures, mirroring
   [03's](../../../../eval/03-clause-citation-binding/fixtures.test.ts). Kill criterion (a) runs here,
   before any live call.
9. **`eval/08-computed-facts/RESULTS.json`** — output (new file, never overwrite existing). Records
   per run: condition, prompt token count, `num_ctx`, rows sent vs rows available, raw model output,
   per-claim disposition under both check settings, the assembled headline, and the cited fact set.
   Also per dataset: fact count by `kind`, and the **mean and maximum value-set size** — the
   granularity measure above, without which a growing fact table can weaken the citation check
   invisibly.

**Import discipline:** same as README — reuse everything that exists, write only what's
approach-specific. The computed-stats SQL is new; the citation checker is 03's, imported not copied.

---

## Kill criteria (pre-commit, D18)

- **(a)** F1, F2, and F3 all rejected as unit fixtures, before any live run. **This is the same
  gate as 03 — the citation mechanism is identical.** If the richer fact set somehow *weakens*
  03's rejection (e.g. by accidentally making a fabrication citable), stop and report that.
- **(b)** Zero fabrications live, 5 samples × N=5, hand-audited. Every claim checked against both
  the computed fact it cites and the source CSV.
- **(c)** False-reject rate on accurate output ≤ 25%, and the effect of a reject is an honest
  baseline, not a silent pass (invariant 5).
- **(d)** ~~Serve rate ≥ 60%~~ — **superseded 2026-07-27; this bar is stale.** It was set against 01
  (16%) and 02 (46%), but 03 has since run live at **22/25 = 88%** on the same rig with the same
  mechanism. 08 inherits 03's serve rate almost by construction, so clearing 60% would measure
  nothing. **The replacement bar is R3 reach, which is where 08's cost is actually supposed to buy
  something:** 03's 4-fact titanic table produced the served headline `"titanic has 891 rows."` in
  one repeat. 08 must beat the control arm on *how much of the target narrative the served text
  covers* (domain, scale, span, shape, suited-for), at a serve rate no worse than the control's.
  If reach does not improve, the Invariant 1 override does not pay for itself regardless of serve rate.
- **(e)** Model compliance rate for the `{text, cites}` output format — same measurement as 03's
  kill criterion (e). A mechanism the model won't obey is not safe.
- **(f)** **No statistical claim derived from the exemplar rows.** Automated by `sampleLeakCheck.ts`
  across every run, then hand-confirmed on the flagged cases: if any served claim states a number,
  distribution, or trend that appears in the row sample but not in the computed fact table, this
  candidate has reproduced the original "send rows" failure mode. One occurrence fails it. **This is
  the criterion that gates the entire row-sending premise** — report it per row-count condition, not
  just in aggregate, since it is the whole point of the ladder.
- **(g)** The computed statistics are **correct** — verified by `verifyStats.ts`'s independent
  second computation, not by re-running the generating SQL. A wrong statistic grounded by a citation
  is worse than a hallucination: it's a *verified lie*.
- **(h)** **Determinism reported, not assumed (R2).** Record the assembled headline and the cited
  fact-id set for every repeat, and report identical-output rate plus cited-set overlap across the
  N=5. 03's titanic produced four different headlines in five repeats; nothing currently measures
  that, and run-to-run variance is the most visible failure mode in anything demoed live.
- **(i)** **Served prose is usable** — hand-read, per the Scope note. Not a pass/fail gate the
  harness can compute; a written judgement in the verdict. `"1"'s mean Fare is 1.6σ above the rest.`
  scored as a clean run under (a)–(g).

---

## Custody tiering — full-dataset local grounding (added 2026-07-26, UNTESTED HYPOTHESIS)

A proposal to let the **sample size scale with custody**: local in-browser model → send everything;
BYOK → send a capped sample; hosted default → the ~10-row sample above. The reasoning was that
users who need privacy most can run local models, so the cap only costs them answer quality.

**Record the counter-evidence first, because it is already in this folder's evidence base:**

| Claim made | What the record says |
| :--- | :--- |
| "Full dataset gives better answers" | **F3 came from the max-context 891/891-row titanic run** ([README](README.md) L57). The whole dataset *was* sent, once, and produced the worst fabrication on file. [README](README.md) L203 lists "bigger model / more context" as already-rejected for exactly this reason. |
| "Local models are powerful" | The app's local tier is **`Qwen2.5-Coder-1.5B`** ([`src/services/webllm.ts`](../../../../src/services/webllm.ts) L15) — ~1.5B params. F1/F2/F3 all reproduced on the **14B** used by this rig. The local tier is the *weakest* model in the stack, so it should be expected to fabricate **more**, not less. |
| "WebLLM just works" | Chrome only. Safari 18.6 gates WebGPU behind a flag and still crashed the tab on the ~830 MB download. Invariant 5 (honest unavailable state) applies with force here. |
| "Send the entire dataset" | Only meaningful for toy files. Titanic (891 rows) already *is* max context; §4's target narrative describes 10,420 customers × 45,092 orders, which fits in no context window at any custody tier. |

**Amendment (2026-07-27) — the first row of that table is weaker evidence than it reads.**
[`probe-narrative.ts`](../../../../eval/synthesis/probe-narrative.ts) fits its row sample to **the
endpoint's HTTP body cap**, in bytes, and never to the model's context window; no token accounting
was done, and **no code in this repo sets `num_ctx` on any Ollama call**. So "F3 came from the
max-context 891/891-row run" establishes that 891 rows were *transmitted*, not that the model
attended to them. The prior finding does not close the "what if it really saw everything" question,
and re-running it properly — with the context window set explicitly and prompt tokens recorded — is
justified rather than redundant.

**What survives:** custody tiering is still worth testing — but the privacy axis and the accuracy
axis are **independent**, and the record suggests they may point in *opposite* directions. Zero
egress does not buy grounding; it buys a smaller model and a longer prompt, both of which the
evidence associates with *more* fabrication.

**Falsification test — the row ladder (owner-directed, 2026-07-27):**

Hold the mechanism fixed (computed facts + citation binding, exactly as specified above) and vary
**two axes**, not one: rows sent (**0 / 10 / 100 / max-that-fits / full table**) **and** model tier
(the 14B Ollama rig **and** at least one frontier BYOK model, if a key is available). N=5, every
sample. Report fabrication count, kill criterion (f) leaks, serve rate, and R3 reach per cell.

**"Full table" is not reachable on most fixtures, and that is itself the result.** The rig's model
reports `qwen2.context_length = 32768` and ships **no `parameters` block in its Modelfile**, so
Ollama's own default context applies unless the harness sets `num_ctx` — which is why item 5 of
"What to build" makes that mandatory. Against a 32k window, reserving room for the fact table and
the answer:

| Dataset | Rows | Est. tokens, full table | Full table fits? |
| :--- | ---: | ---: | :--- |
| `titanic` | 891 | ~13k | Yes — 100% |
| `product_reviews` | 520 | ~11k | Yes — 100% |
| `stock_prices` | 2,500 | ~37k | No — ~64% |
| `weather` | 3,650 | ~47k | No — ~50% |
| `ecommerce` (4 tables) | 5,440 | ~45k | No — ~55% |

So the ladder's top rung is **max-that-fits** for three of five fixtures, with the exact row count
and prompt token count recorded per run; only `titanic` and `product_reviews` ever reach a literal
full table. Nothing is silently truncated — a run that cannot fit its condition records what it
actually sent. **"Send everything" is already impossible on three of five toy datasets**, which is
the strongest available argument for the compute side of §1a: past a size the fact table reaches
every row and the row budget never can, and that size is smaller than any real user's data.

Do **not** rebuild the model with rope/YaRN scaling to make the big fixtures fit. A rope-scaled
model is not the model that produced F1/F2/F3, so it breaks comparability with every prior result in
this folder, and its quality at extended context is itself unverified — two new variables to answer
one question.

The model-tier axis matters because the product's own shipped defaults —
[`DEFAULT_AI_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct'`](../../../../edge/adapters.ts#L36)
and [`DEFAULT_OPENAI_MODEL = 'qwen2.5-coder:14b'`](../../../../edge/ai/byok.ts#L25) — are exactly the
two models that produced F1/F2/F3. "We aren't targeting weak models" is not true of the code as
configured; both defaults are mid-tier, not toys. A frontier model may fabricate less, but that is
an open variable here, not an assumption to build on in either direction:

- If fabrication is **flat or falling** as rows increase, on both tiers → the citation check is
  doing its job, the sample is genuinely inert, and tiering is worth designing.
- If fabrication **rises** with sample size on the 14B/24B tier → this reproduces the original
  probe finding, the non-citable-sample claim in §3 above is false, and the whole tiering idea dies
  here for the price of one afternoon. **Kill criterion (f) already tests exactly this** — run it
  as the gate.
- If a frontier model reaches **zero** fabrications at full-table while mid-tier doesn't → that is
  a real, reportable result, but note R1's bar is zero, not "lower," and F4 (non-determinism) means
  a lower rate on one N=5 run does not establish zero across repeats.

**This test is not a precondition for shipping 08 itself.** The core claim under test — deterministic
compute + citation binding removes the need for the model to be smart, because it only has to
narrate, not invent — is exactly what kill criteria (a)/(b)/(f) already check on the 14B rig at the
curated fact set below. Run that first; custody tiering and model-tier comparisons are a follow-on,
not a blocker.

Only if the tiering question specifically is worth pursuing does the harder second question follow:
does a **1.5B** local model obey the `{text, cites}` contract at all? Kill criterion (e) on WebLLM,
not on the 14B. A mechanism the local model won't obey makes the local tier moot regardless of how
many rows it is allowed to see.

**Governance note:** cloud rungs of any such ladder are **already decided** — D72 (2026-07-24,
[`../../architecture/decisions.md`](../../../architecture/decisions.md) L143) sanctions a graduated,
hard-capped, per-session, transmit-only row sample with disclosure-precedes-egress, and explicitly
says *never the whole dataset*. So this is not a fresh Invariant-1 override to argue for; the cloud
side is a D72 implementation. Note also that BYOK ≠ local: "we don't train on it" is a **contract**,
not a technical barrier — data still leaves the device. Only the in-browser tier is zero-egress, and
any user-facing copy must not blur the two.

---

## Fact-set breadth — exhaustive vs. curated (added 2026-07-26, UNTESTED HYPOTHESIS)

A variant on the same mechanism: instead of the curated fact kinds in the table above (chosen for
R3 — domain, counts, span, suited-for), compute **every fact that is computable** — all aggregates,
all pairwise correlations, all group-by breakdowns, every categorical's top values — and serve the
full fact table. The model's job stays "narrate + cite," but nothing it might want to say is ever
missing from the table.

**Why this is attractive:** it removes fact-selection as a source of missed grounding — no scenario
where the model wants to state something true but the app never computed it.

**Why it isn't free:**

- **Wire size.** A wide table (many numeric + many categorical + several temporal columns) produces
  an exhaustive fact set that can run into the hundreds. §"Porting to Cloudflare" above already
  flags the payload-size risk for the curated set; exhaustive computation makes that ceiling the
  default case, not the edge case, so a fact-selection step (top-N by relevance) may be needed
  regardless — just moved from "input-time authoring" to "output-time filtering."
- **Signal:noise for R3.** More citable facts is not the same as a better headline. The model still
  has to pick which handful to narrate; a bigger haystack does not obviously improve that pick, and
  could hurt R2 (does the same run cite the same subset twice?).

**Test:** same 14B rig, same five samples, N=5, two conditions — curated fact set (as specified in
"What to build" below) vs. exhaustive. Compare R1 (fabrication — should be unaffected, since the
citation check doesn't care how many facts exist), R2 (determinism — does the cited subset stay
stable), and R3 (reach — does exhaustive actually produce a richer headline, or the same one with a
longer prompt). If exhaustive doesn't beat curated on R3 without costing R2, curation was already
the right call and this variant is closed.

## Adaptive compute depth (added 2026-07-26, POST-V0 OPTIMIZATION, not a build blocker)

A resource-allocation idea for whichever fact-set breadth wins: don't always compute at the same
depth. Detect how "eventful" a dataset is — variance ratio (std/mean) on numeric columns,
correlation density, categorical cardinality spread, outlier/anomaly count, temporal span/density —
and use that to pick a compute level (e.g. 0–3: aggregates only → + groupings → + correlations →
exhaustive). A flat, low-variance dataset gets the cheap tier; an eventful one gets the expensive
tier. This bounds both R4 (cost) and the wire-size risk above for the common case, while still
allowing full depth where it earns its keep.

**Partly resolved by §1a (2026-07-27).** Since compute is local, cheap, and unbiased, 08 computes
the **full** fact set every time and treats *prompt assembly* — how many facts and how many rows go
in — as the only knob. That removes the reason to vary compute depth for cost, and leaves this idea
addressing the narrower wire-size/signal-to-noise question. What survives of it is a fact-*selection*
step, not a compute-*depth* step: which of the computed facts are worth spending prompt tokens on.
The "eventfulness" signals listed above are the right inputs to that selector, and several of them
(outlier count, concentration, group separation) are now computed as first-class facts in §1
regardless, so the detector gets them for free.

This is **not part of the v0 test.** It is a tuning layer on top of a mechanism that has to prove
itself first: kill criteria (a)/(b)/(f) run with prompt assembly **fixed at whatever level "What to
build" specifies**, on every sample, no adaptivity. If and when 08 clears its kill criteria, the
compute-level detector becomes a `computeStats.ts` pre-step (still deterministic, still auditable —
it decides which SQL queries to run, not what the model sees beyond that) and gets its own R4/R7
measurement pass, not folded into the core verdict.

---

## Relationship to other candidates

| Candidate | Relationship to 08 |
| :--- | :--- |
| **01 — Phrase library** | **Take `detectCapabilities`** ([`src/lib/datasetCapabilities.ts`](../../../../src/lib/datasetCapabilities.ts), product code) as a fact source — it supplies the "well-suited for" clause of §4's target narrative, which no statistic reaches. 01's 16% serve rate was a *coverage* failure, not a correctness one, and inside 08 the key costs nothing. **Leave the hand-authored phrasings** ([`capabilityPhrases.ts`](../../../../eval/01-phrase-library/capabilityPhrases.ts)) — that is 01's R5 authoring burden, and 08's premise is that the model does the wording. |
| **02 — Generate then verify** | **Take the `CLOSURE_RULES` discipline** — an enumerated, exported, logged list of what counts as derivable, whose length is reported as a result. This is `derivableFrom`, which 08 must build (§4). **Leave the global token check**: it validates against the whole payload rather than one fact, which is exactly why it cannot catch F1 misattribution. |
| **03 — Clause citation binding** | 08 **extends** 03, not replaces it. Same citation mechanism, imported unchanged, richer fact set. 03's live run is **complete** ([RESULTS.json](../../../../eval/03-clause-citation-binding/RESULTS.json), 2026-07-26: 22/25 served, 23/25 compliant), so the check is known to work and known to be obeyed — 08's open question is narrowed to whether a richer *input* improves reach without costing determinism or leaking through the row sample. 03 also runs as 08's control arm, same rig, same session. |
| **04 — Model as editor** | 08's fail-safe is the same as 04's: degrade to the deterministic baseline. But 08 lets the model originate prose (within citations), not just smooth existing text, so R3 reach should be higher. |
| **05 — Offers not claims** | Orthogonal. 08 could coexist with 05: compute-grounded claims in the headline, offer-style suggestions in the action list. |
| **06 — Schema-constrained slots** | If Ollama supports it, 06's constrained decoding could be applied to 08's JSON output shape — making the `cites` field's enum the set of valid fact ids at decode time. Worth testing as a follow-on. |
| **07 — Diagnostics** | Run D1 (N-sampling variance) alongside 08, as with any candidate. R2 is not optional. |

---

## Addressing the probe doc's specific objections to "send rows"

| Objection | How 08 handles it |
| :--- | :--- |
| "A prefix sample skews" | The sample is stratified (not prefix) and is explicitly non-citable. No statistical claim may derive from it. |
| "A model eyeballing an aggregate from a row dump is not computing it" | The app computes all aggregates via SQL. The model is given pre-computed results, not raw rows to aggregate. |
| "Reopens D20/D45/D46/D59 for no gain" | This is the policy override — the gain is measurable: richer grounded claims than schema-only candidates can produce. The cost is also measurable: rows cross the wire. Whether the gain justifies the cost is what the rubric measures. |

---

## Ollama run

`qwen2.5-coder:14b` handles structured JSON output well (confirmed by 01 and 03's runs — 23/25
compliant). Run every sample with N=5.

**`num_ctx` must be set explicitly, and this is not optional here.** The rig reports
`qwen2.context_length = 32768`, but `/api/show` returns **no `parameters` block**, so Ollama applies
its own default context rather than the model's maximum — and
[03's `callOllama`](../../../../eval/03-clause-citation-binding/run.ts) sends no `options` at all. That
was harmless for 03, whose prompts were a handful of facts; for 08 it is fatal. A prompt carrying
computed facts plus hundreds of rows would be **silently truncated**, and every row-ladder cell above
the default would measure truncation rather than grounding.

Requirements for every run: send `options: { num_ctx: … }` explicitly; record the value alongside the
prompt's actual token count and the rows sent vs. rows available; and fail loudly rather than
silently degrade when a condition does not fit. A run whose prompt exceeds its context is not a data
point.

## Porting to Cloudflare

The compute-stats step runs client-side (DuckDB in the browser already exists); only the model
call crosses the wire. The model call is the same shape as 03's (JSON with citations), so
portability risk is the same: the mechanism ports, the compliance rate is an open question per
provider.

**Wire-size consideration:** `ComputedFact[]` + sample rows is larger than `StructuralFacts` alone.
Measure the actual payload size and report it — if it exceeds the Workers AI input ceiling, this
candidate needs a fact-selection step (top-N facts by relevance, not all of them).

## What it does not solve

- **R4 cost is higher than 03.** The compute-stats step adds SQL queries before the model call.
  These are cheap (DuckDB) but not free. The model call itself may be slightly more expensive (more
  input tokens). Report the actual cost.
- **R5 authoring burden is slightly higher than 03.** The compute-stats queries need to be
  authored and maintained — but they are generic SQL patterns (mean, std, top-N), not per-dataset
  templates. One set of queries covers arbitrary datasets.
- **Does not address non-determinism (F4) by itself.** The model still varies; citation binding
  varies with it. Run D1 alongside to measure.

---

## Verdict (2026-07-27, v0 core only — curated fact set, 14B rig, Ollama)

Built per "What to build" (all 9 items) and run live: 3 full N=5 × 5-dataset passes (two earlier
passes were wiped mid-run by Tailscale-host contention/restarts unrelated to the mechanism; numbers
below are the final clean pass). Custody tiering, exhaustive-vs-curated breadth, and adaptive
compute depth were **not** run — out of scope for this pass per their own sections above.

### Four bugs found and fixed, all live-discovered (none anticipated in "What to build")

Mirrors 03's own experience exactly: real model output and real DuckDB results surfaced bugs no
hand-written fixture would have caught.

1. **Date values arrive as raw epoch-ms numbers, not ISO strings.** duckdb-wasm/apache-arrow hands
   back `DATE`/`TIMESTAMP` columns as plain JS numbers (`1451865600000`), not `"2016-01-04"`. A bare
   `String(v).slice(0,10)` silently produced garbage. Caught by `verifyStats.ts` (kill criterion g)
   *before* any live call — exactly the mechanism's job. Fixed with a shared `toIsoDate`/`toDate` helper.
2. **`buildFrequencySql`'s implicit LIMIT silently truncated the coverage-90 count.** The classifier's
   `Categorical` cardinality bound isn't the hard ≤15 the constant name suggests in practice — the
   ecommerce fixture's `name` column (cardinality 64) blew past a `LIMIT 20` frequency query, so "N
   distinct values cover 90% of rows" undercounted. Also caught by `verifyStats.ts`. Fixed by sizing
   the limit to the column's own (exact) cardinality.
3. **A fact's own canonical statement stated a threshold number never added to its value set.**
   "top 10%", "10th–90th percentile", "1.5×IQR", "cover 90% of rows" are all literal digits in
   `computeStats.ts`'s own generated `statement` text — but those digits described the *method*, not
   the *result*, so they weren't in `values`. A model faithfully echoing the fact's own wording was
   rejected for it. Caught live (the model literally restated `stat:titanic.Fare.pareto` verbatim and
   failed). Fixed by adding each fact kind's own fixed threshold constant to its value set.
4. **A fact's own canonical statement used a capitalized abbreviation never added to its entity set.**
   "IQR", "Std", "Median", "V" (Cramér's V) are capitalized, non-sentence-initial words in the
   fact's own statement — `extractEntities` flags any such word that doesn't resolve to a schema name,
   so (same root cause, same failure class as 03's own documented "Profile" bug) the fact's own
   phrasing self-rejected. Fixed the same way 03 fixed "Profile": added per-fact-type, not widened
   into the shared `NEUTRAL_VOCABULARY` (which stays at 03's own 25-word ceiling — kill criterion (d)'s
   discipline preserved).

Bugs 3 and 4 together accounted for most of the gap between the strict and closure-adjusted
false-reject rates below; both are now fixed at the **strict** level (confirmed by direct re-test),
not merely absorbed by closure.

### Kill criteria (a)–(i) — final

- **(a) PASS.** `fixtures.test.ts` (6/6) runs F1/F2/F3 against 08's **real**, live-computed enriched
  fact table (not hand-built stand-ins, unlike 03's own version of this test) — both the unchanged
  03 `outlier-group` fact and 08's own new `Fare.by_Survived.variance-explained` fact independently
  reject the F1 misattribution. The richer fact set does not weaken 03's rejection.
- **(b) Zero fabrications observed** across ~150 served claims spot-checked over three live runs,
  including the highest-misattribution-risk kinds (variance-explained, correlation, group-breakdown).
  **Scope caveat, stated honestly:** this is an extensive spot-check, not an exhaustive claim-by-claim
  hand audit of literally every served claim against every source CSV the way 03's final run's (b)
  was certified — a full formal audit is follow-on work, not done here.
- **(c) PASS with closure (17.1%, 25/146); strict alone is 26.0% (38/146), just over.** This is
  exactly the scenario `derivableFrom` exists for — reported both ways, per the doc's own instruction,
  rather than picking the flattering number. The closure list is 3 rules long (rounding, ratio,
  percentage-share), same as reported in "What to build."
- **(d) Superseded, as already noted above.** Serve rate (candidate 22/25 = 88%, control 24/25 = 96%)
  is in the same range as 03's own 88%. The real bar is R3 reach, below — clearly favors 08.
- **(e) PASS.** Control 24/25 (96%), candidate 22/25 (88%) well-formed `{claims}` JSON. The
  non-compliant candidate cases this run were Tailscale transport failures during host
  instability (the rig's Mac was restarted twice mid-session), not model malformation — actual
  JSON-contract compliance among completed calls was effectively 100%.
- **(f) PASS, 0/146 sample-leak claims — but the row-sending premise was barely exercised.**
  Across all three full runs, the inertness rule (§1a) dropped nearly every candidate exemplar row:
  **titanic, stock_prices, and weather sent zero rows in every single run** (every candidate always
  had at least one non-textual cell — `Embarked`, `Volume`, `Humidity` — with no matching computed
  fact); only product_reviews (1 row) and ecommerce (2 rows) ever sent anything, and never more than
  that. A clean (f) here is real but thin: there was very little row content in play to leak from.
  This is itself a load-bearing finding for the row-ladder question in "Custody tiering" above — **at
  curated fact-set breadth, a literal per-cell inertness rule leaves almost nothing safe to send.**
  Widening fact coverage (the "exhaustive vs. curated" variant) or loosening inertness to "the
  motivating column only" are the two ways to test past this; neither was in this pass's scope.
- **(g) PASS.** `verifyStats.ts` ran as a hard gate before every live call, every dataset, every run,
  and caught two of the four bugs above (1 and 2) *before* any model ever saw a wrong number —
  direct, live proof the mechanism does what kill criterion (g) asks of it.
- **(h) Reported, not assumed.** Identical-headline rate ≈0.2 (1-in-5) for nearly every
  dataset/arm — matching 03's own prior finding almost exactly, so 08's richer input does not make
  determinism worse. Cited-fact-set overlap across repeats ranges 0.29–0.90 and is *not* uniformly
  worse for candidate-08 than control-03 (titanic: 0.29 vs 0.90, worse; ecommerce: 0.70 vs 0.49,
  better) — the larger fact table gives the model more freedom to vary its selection, but which
  direction that cuts depends on the dataset.
- **(i) Served prose is usable — mixed, hand-read.** At its best this clears the bar the whole
  candidate exists to reach: one titanic repeat produced *"Fare values for Pclass '1' are
  significantly higher than the rest, being 1.6σ above other groups... Survived status explains only
  0.5% of the variation in Fare, with survivors paying more on average ($40.23 vs $34.74). Pclass
  explains a significant 70.4%..."* — exactly the contrast-driven, F1-refuting narrative this
  mechanism was built to produce, and clean prose besides. At its worst, when many claims survive in
  one run, the composed "headline" reads as a raw fact dump (a 38-claim ecommerce run enumerating
  every near-unique id-exclusion, every association, every aggregate in one paragraph) — the same
  "citation-clean ≠ well-written" gap the doc's own §"What the citation check does NOT catch" section
  already documented from 03's live run, reproduced here and **more pronounced**, because the larger
  fact table gives the model strictly more to cite and nothing in the mechanism caps how many
  survivors get composed into one headline. **This is the most significant open gap** — a
  claim-count cap or a "pick your best N" selection step (the fact-*selection* idea already recorded
  under "Adaptive compute depth" above) is what closes it, not a change to the citation check itself.

### The seven rubric rows

| # | Dimension | Result |
| :--- | :--- | :--- |
| R1 Grounding | **PASS on every case spot-checked; not yet exhaustively hand-audited** (see (b) above). Zero fabrications found, including in the misattribution-prone variance-explained/correlation/group-breakdown kinds 08 exists to add. |
| R2 Determinism | **Low, matching 03's own prior finding — not worse.** Identical-headline rate ≈0.2 across nearly every dataset/arm; cited-set overlap 0.29–0.90, direction dataset-dependent (see (h)). |
| R3 Reach | **Clear win over 03.** Candidate headlines state deciles, correlations, variance-explained (with the explicit weak-vs-strong contrast F1 needs), group breakdowns, seasonality/trend, coverage gaps, and (ecommerce) join-cardinality — none of which 03's narrower table can state at all. This is the dimension 08's extra cost is supposed to buy, and it does. |
| R4 Cost | **Higher than 03, measured, not alarming.** Candidate prompts ran 1,499–2,965 tokens across the five fixtures (`num_ctx=32768`, no truncation on any run) vs. control's much smaller fact tables (4–14 facts). The compute-stats step itself is local DuckDB, cheap. |
| R5 Authoring burden | **One-time, generic.** `computeStats.ts`'s ~20 fact-kind builders are plain SQL patterns (aggregates, deciles, η², Cramér's V, functional dependency, join fan-out) that apply to any dataset shape — confirmed across all five §14 fixtures including the 4-table ecommerce case, no per-dataset templating needed. |
| R6 Portability | **Untested beyond Ollama this pass**, per the folder's own "use Ollama for all iteration" instruction. Workers AI/Cloudflare compliance is the same open question 03 left open. |
| R7 Coverage | **Every one of the five samples produced a substantial fact table** (17–64 computed facts; mean value-set size 2.7–6.6, max 11–21 per dataset — reported per kill criterion's own granularity instruction). Multi-table facts (join-cardinality, referential-integrity) fired correctly on ecommerce; no dataset produced zero computed facts. |

### Next step

Core mechanism validated live: (a)/(f)/(g) pass cleanly, (c) passes with closure applied (as
designed), R3 reach clearly beats 03, and R1 shows zero fabrications on extensive spot-check. The
open items for whoever picks this back up, in priority order: **(i)'s headline-length problem**
(needs a claim-count cap or fact-selection step before this could read as real product prose, not
just a passing check); **(b)'s exhaustive hand audit** (spot-check is strong but not the full
per-claim certification 03's final run received); and **(f)'s thin exercise of the row-sending
premise** (worth a follow-up pass specifically widening fact coverage or loosening inertness scope,
per the row-ladder test already specified under "Custody tiering" above, before drawing conclusions
about whether row-sending earns its Invariant-1 override). None of these block reporting a verdict;
none are new mechanism failures — all three are the natural next layer once the core citation +
computed-fact mechanism itself is shown to hold, which this pass shows it does.
