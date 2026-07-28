# 01 — Capability-keyed phrase library

**Thesis:** the model never originates a claim about purpose. The app detects what the dataset's
*shape* supports, looks up human-authored phrasings for that capability, and the model only
**selects and lightly adapts** among pre-vetted options.

**Status:** untested. **Prior art:** this is the probe doc's own **"answer 2"**, the middle outcome
it named but never ran. **Cost class:** cheap at runtime, expensive in authoring.

Read [`README.md`](README.md) first — problem statement, F1–F3, invariants, rubric.

---

## What it attacks

**F2 and F3 directly.** "Manchester" and "sank in April 1912" are *content the model originated*.
If the model's only output is a selection among authored strings, neither is expressible — the same
structural argument ADR-010 already makes for numbers, extended to purpose language.

**F1 only partially** — see "What it does not solve".

## Mechanism

Three deterministic stages, one narrow model call.

**1. Capability detection (deterministic, no model).** Reduce `StructuralFacts` to a set of
capability keys. The signals already exist on the wire: `semanticType`, `cardinality`,
`nullPercentage`, `rowCount`, `minDate`/`maxDate`, and cross-table shape.

```
Temporal + Quantitative + a low-cardinality Categorical   → 'seasonality'
Temporal + an entity-ish key repeated across rows          → 'cohort-retention'
two tables joined on a key, one with a Temporal + a money-ish Quantitative
                                                            → 'lifetime-value'
a Categorical with cardinality 2 + Quantitative columns     → 'group-comparison'
Quantitative columns with correlated pairs (already computed by the profiler)
                                                            → 'correlation-study'
```

**2. Phrase lookup (deterministic).** Each key maps to N authored phrasings, each carrying the
evidence it requires. A key whose evidence is absent is not offered — the table is the contract.

```ts
interface CapabilityPhrase {
  key: 'lifetime-value' | 'cohort-retention' | 'seasonality' | ...
  requires: Array<'temporal' | 'quantitative' | 'join-key' | ...>
  phrasings: string[]   // human-authored, reviewed once
}
```

**3. Model selection (the only model call).** The model receives the detected keys and the candidate
phrasings and returns **indices**, not prose:

```json
{ "domain": 2, "suitedFor": [0, 3], "order": [1, 0] }
```

Anything not an in-range integer is rejected before rendering. The app renders the final paragraph
from the deterministic parts (counts, span from `minDate`/`maxDate`) plus the selected phrases.

### The extractive floor (zero-freedom variant)

Dial phrasing freedom to **zero**: the model doesn't even select, it only **orders** pre-computed
fact sentences. Safest possible version; reads the most templated. **Worth running as the control
arm inside this same session** — if the extractive floor is rated as good as the selective version
by eye, the model is contributing nothing and this collapses into D65 (the control), which is a
valid and cheap finding.

## What to build

1. `src/lib/datasetCapabilities.ts` — `detectCapabilities(facts: StructuralFacts): CapabilityKey[]`.
   Pure, deterministic, unit-tested against all five samples. **This is the real deliverable** and it
   is worth having even if the model half is discarded.
2. A phrase asset — 5–8 capability keys × 3 phrasings. Author by hand; keep it in one file so review
   is one diff.
3. A selection prompt returning indices only, plus an index validator (in range, right arity).
4. Harness arm in `eval/synthesis/run.ts`: `phrase-library` and `phrase-library-extractive`.

## Kill criteria (pre-commit, D18)

- **(a)** Zero fabrications across all five samples, N=5 each. Structurally expected — **if this
  fails, the implementation leaked free text somewhere**; find it, don't tune it.
- **(b)** Capability detection is *right*, not just safe: on ecommerce it must detect
  `lifetime-value` and `cohort-retention` (the §4 target), and on titanic it must **not** detect
  `seasonality` (no Temporal column exists).
- **(c)** R7 coverage: on how many of the five samples does detection fire at all? **If it fires on
  fewer than 3, the authoring burden does not pay for itself** and this loses to D65.
- **(d)** Blind comparison: does the selective arm read better than the extractive floor? If not,
  the model call is dead weight.

## Ollama run

Selection-only output is tiny, so this is the cheapest arm here to iterate on. `qwen2.5-coder:14b`
returning a JSON index object is well within its reliability envelope — but **verify it returns
in-range integers rather than restating the phrase**, and count how often it doesn't. That rate is
an R2 number.

## Porting to Cloudflare

Clean. The mechanism is app-side; the model call is small and provider-agnostic (short prompt, JSON
out). Expect **lower** cost than today's arm, since the payload shrinks to keys + candidate phrases.

## What it does not solve

- **F1 (misattribution) is only partly addressed.** Authored *purpose* phrases can't misattribute,
  but the headline fact is still a re-phrased statistic. **If this arm wins, it needs
  [03](03-clause-citation-binding.md)'s check on the headline anyway.** Say so in the verdict.
- **R5 is the real risk.** Every dataset shape a human didn't anticipate gets nothing. That is
  *safe* but it may be *useless* — which is what criterion (c) exists to measure.
- Reads more templated than a model writing freely. That is the trade being priced, not a defect.

## Implementation plan (handoff, 2026-07-26)

Design work below is done — a prior session read this doc + the README, inspected the real sample
CSVs and the actual classifier (`src/lib/classifier.ts`), and resolved every ambiguity needed to
start writing code. **Nothing has been implemented yet.** Resume by building exactly this.

**Blocker this session hit:** the Ollama rig (`100.126.157.97:11434`) was unreachable from that
sandbox. Resume once `ollama serve` is actually reachable (e.g. running the session from the M4
laptop itself) — `curl -s -m 3 http://100.126.157.97:11434/api/version` should return version JSON
before trusting any run result.

### Files to build

1. `src/lib/datasetCapabilities.ts` + `.test.ts` — `detectCapabilities`. **Real product code**, not
   eval-scoped — this doc's own "What to build" #1 calls it worth having independent of this
   candidate's fate.
2. `eval/01-phrase-library/capabilityPhrases.ts` — the hand-authored phrase asset. Experiment-scoped
   (ideation README: "nothing here ships").
3. `eval/01-phrase-library/selection.ts` — prompt builder, index-response parser/validator,
   deterministic headline assembly (counts + span + selected phrases).
4. `eval/01-phrase-library/run.ts` — the harness. **Import, do not copy:** `eval/dataset/tables.ts`
   (sample loader), `eval/duckdb/` (engine), and the real seam — call `requestSynthesis`
   (`src/services/synthesis.ts`) with a custom Ollama `fetchImpl`, exactly like
   `eval/synthesis/run.ts`'s `makeOllamaFetch` does, so `narrationValidator`/`rankedActionValidator`
   score every candidate for real (D58). **Copy/write fresh:** everything candidate-specific (prompt,
   model-call shape, parse/reassembly) — this candidate's answer shape (`{"suitedFor": [...]}`, see
   below) doesn't fit the existing `PromptVariant`/`makeVariantFetch` machinery in
   `eval/synthesis/run.ts`, which assumes the production `{headline, actions}` contract. That's *why*
   this candidate gets its own folder rather than a new arm in the shared file.
5. `package.json`: add `"eval:phrase-library": "tsx eval/01-phrase-library/run.ts"`.

Write results to `eval/01-phrase-library/RESULTS.json` (new file, per the README rig rules).

### Two deviations from this doc's illustrative JSON (§ Mechanism, step 3)

The doc's example — `{ "domain": 2, "suitedFor": [0, 3], "order": [1, 0] }` — is being simplified to
`{ "suitedFor": [2, 0] }` (array order *is* presentation order, so a separate `order` field over the
same set is redundant), and **`domain` is dropped entirely**: none of the four kill criteria test
domain-naming, and this doc's own rendering description ("the app renders the final paragraph from
the deterministic parts — counts, span — plus the selected phrases") never mentions a domain name
either. If a future session wants domain-naming (the "This appears to be an E-Commerce dataset..."
clause from the README's target quote), that's a scope addition to design fresh, not something this
plan already covers.

### Capability rules — verified against the real sample CSVs, not just the doc's abstract examples

Five keys, all derivable from `StructuralFacts` alone (no signal beyond `semanticType`, `cardinality`,
`nullPercentage`, `rowCount`, `minDate`/`maxDate`, and column names):

- **`seasonality`, `cohort-retention`, `group-comparison` — same-table only.** A global
  "this evidence exists somewhere in the dataset" check false-positives on ecommerce (e.g. pairing
  `customers.signup_date` with an unrelated Quantitative column on `products`). Verified per-table:
  - `seasonality` (Temporal + Quantitative + low-card Categorical, same table): fires on `weather`
    (`Date` + `TempHighC`/etc. + `City`, cardinality **1** — matches the README's F2 case exactly).
    Does **not** fire on `titanic` (no Temporal column at all) or `stock_prices` (no categorical
    column). Arguably over-fires on `product_reviews` (`ReviewDate` + `Rating`, card 5, + `ProductId`
    misclassified Quantitative by the existing classifier's numeric/cardinality split) — documented
    as a known false-ish-positive, not silently avoided.
  - `cohort-retention` (Temporal + a non-unique, non-trivial-cardinality column, same table): fires on
    `orders` (`order_date` + `customer_id`, cardinality 396 of 1400 rows — repeats ~3.5x/customer).
    Note the real classifier calls `customer_id` **Quantitative** here (numeric physical type,
    cardinality 396 > the 15-value categorical ceiling), not Identifier or Categorical — the rule
    can't gate on `semanticType === 'Categorical'`, only on the cardinality/rowCount ratio.
  - `group-comparison` (Categorical, cardinality exactly 2, + Quantitative, same table): fires on
    `titanic` (`Survived` or `Sex`, card 2, + `Age`/`Fare`). No other sample has a card-2 categorical.
- **`lifetime-value` — cross-table, via a shared column name as the join key.** Verified it fires on
  `orders` ↔ `order_items` (shared `order_id`; `orders.order_date` is Temporal, `order_items.unit_price`
  matches a money-ish name pattern). This is the §4 target pairing (with `cohort-retention` above) on
  ecommerce, which kill criterion (b) requires.
- **`correlation-study` — honest caveat, not a corner cut.** The doc says this needs "correlated pairs
  already computed by the profiler," but `StructuralFacts` carries no correlation field at all — that
  signal doesn't cross the wire. Implemented as a weaker structural proxy (≥2 Quantitative columns on
  one table), which verified to fire on 4 of 5 samples (`stock_prices`, `titanic`, `weather`,
  ecommerce via `order_items`). Flag this explicitly in the eventual Verdict rather than overclaiming
  precision the mechanism doesn't have.

Coverage check (kill criterion c, needs ≥3/5 firing at all): `titanic` (group-comparison,
correlation-study), `weather` (seasonality, correlation-study), `stock_prices` (correlation-study),
`ecommerce` (lifetime-value, cohort-retention, correlation-study) all fire. `product_reviews` fires
only on the arguable seasonality case above — worth flagging in the hand audit rather than counting
cleanly.

### Not yet done

Nothing has been written to disk. The next session should build the five files above in order (1→ 4
are dependencies of `run.ts`), confirm Ollama reachability, then run `npm run eval:phrase-library`
with N=5 repeats per sample per variant (selective + extractive-floor), hand-audit every composed
headline against its source CSV and `facts` payload, and append the Verdict section below with all
seven rubric rows.

## Verdict

**Run 2026-07-26.** Built exactly the five files the implementation plan specified —
[`src/lib/datasetCapabilities.ts`](../../../../src/lib/datasetCapabilities.ts) +
[`.test.ts`](../../../../src/lib/datasetCapabilities.test.ts) (9/9 passing, fixtures built from the real
classified shape of all five samples, not the doc's abstract examples), `eval/01-phrase-library/`'s
`capabilityPhrases.ts`, `selection.ts`, `run.ts`, and `package.json`'s `eval:phrase-library` script.
Full project typecheck clean. Ran N=5 repeats × 5 samples × 2 arms (selective, extractive-floor) =
50 calls against `qwen2.5-coder:14b` over the Ollama rig, through the real seam
(`requestSynthesis` → `narrationValidator`/`rankedActionValidator`, D58 unbroken). Every composed
headline's counts, date span, and column names were independently re-derived from the raw CSVs
(not just trusted from the harness) before writing this section.

### Detection results per sample (kill criteria b, c)

| Sample | Detected keys | Notes |
| :--- | :--- | :--- |
| titanic | `group-comparison`, `correlation-study` | **No `seasonality`** — correctly excluded (no Temporal column at all). Kill criterion (b) ✓ |
| weather | `seasonality`, `correlation-study` | The README's own F2 target case (`Date` + `City` + `TempHighC`/etc.) |
| stock_prices | `correlation-study` | No Categorical column at all — no `seasonality`, no `group-comparison` |
| product_reviews | `seasonality` | The doc's own documented false-ish-positive: `ProductId` is classified `Quantitative` (cardinality 119 > 15) by the real classifier, propping up the "Quantitative" leg of the rule with an ID column, not a measurement |
| ecommerce | `seasonality`, `cohort-retention`, `lifetime-value`, `correlation-study` | `lifetime-value` + `cohort-retention` both present — kill criterion (b) ✓ |

Coverage: **5/5 samples fire at least one key** (kill criterion (c) needs ≥3/5) — comfortably clears
the bar.

**One discrepancy from the handoff plan's own hand-verification, found only once this was actually
coded and run:** the plan's coverage-check section didn't list `seasonality` firing on ecommerce, but
it does — via `orders` (`order_date` Temporal + `customer_id` Categorical→no, **Quantitative**
[ratio 0.283, cardinality 396 > 15, the same classifier quirk the plan itself flags for
`cohort-retention`] + `status` Categorical). This is structurally the *same* failure mode as the
already-accepted product_reviews case (an ID-shaped column propping up the "Quantitative" leg), so
it's documented here rather than patched with an ad hoc exclusion that would inconsistently protect
`seasonality` on one sample and not the other. Confirmed empirically: ecommerce's `selective` arm
runs #1/#2 and every served `extractive-floor` run actually surfaced this claim ("comparing periods
to find recurring patterns" / the literal `orders.order_date alongside orders.status...` sentence).
Doesn't fail kill criterion (b), which only requires `lifetime-value` + `cohort-retention` on
ecommerce and `seasonality` absent on titanic — both hold.

A second, separate implementation decision beyond the plan's prose: `cohort-retention`'s "repeated,
non-unique key" check needed a column-name gate (`/_id$/i`) in addition to the cardinality/ratio band
the plan specifies. Verified concretely that ratio alone over-fires: weather's `TempHighC`
(281 distinct / 3650 rows = 0.077) sits *inside* the same band a real entity key like `customer_id`
(396/1400 = 0.283) occupies — without the name gate, `cohort-retention` would fire on any dataset with
a time column and any non-identifier numeric column, which is not what "an entity-ish key repeated
across rows" means. See `src/lib/datasetCapabilities.ts`'s `isRepeatedEntityKey` and its regression
tests.

### R1 — Grounding: PASS, zero fabrications

Every served `composedHeadline` across all 25 served runs was hand-checked against the raw sample
CSVs directly (independent Python counts, not the harness's own numbers): table counts, row counts,
every `minDate`/`maxDate` span, and every cited column name and cardinality are exactly correct. No
run stated a value, city, date, or count the structure didn't carry. This holds *structurally*, not
by luck: the model's only representable output is an array of in-range integers indexing into a
candidate list the app already built (either hand-authored phrasings or deterministic fact sentences)
— free text from the model was never on the table, so F2/F3-shaped fabrication has no path to the
final string. Also notable: **every degrade in the run was `ai-down` from this harness's own parser
rejecting an out-of-contract answer (a duplicate-group pick, an empty array) — never `ai-rejected`
from the real seam validators.** No served headline was ever a validator catching a dishonest
candidate; the validators never had a dishonest candidate to catch.

### R2 — Determinism: claim-safety is deterministic; claim-*presence* is not

The candidate set offered per dataset never varies across repeats (`detectCapabilities` runs once,
deterministically, per dataset — confirmed identical `detectedCapabilities` on every one of the 5
repeats per arm per sample). What *does* vary run-to-run: whether the model's answer parses at all,
and — when it does — which subset of the detected keys it chooses to voice and in what order (e.g.
ecommerce `selective` #1 named 2 of the 4 detected keys, #2 named 3 of 4, in different orders). So the
safety guarantee (never a claim outside the detected, evidenced set) is 100% stable; the *reach*
(how much of what's true gets said) is not. That instability is exactly what the low selective serve
rate below is measuring.

### R3 — Reach

When served, states table/row counts + Temporal span (when present) + 1–3 suited-for phrases — matches
the plan's own scoped-down mechanism (no `domain` naming). This is a *different* kind of statement
than D65's, not a strict upgrade over it: D65 states one specific computed finding (e.g. `"High" and
"Close" correlate at 1.000"`); this candidate states a shape-level orientation ("what is this dataset
for"). The two read as complementary — this doesn't make D65's own headline redundant, and a real
integration would need to decide which one leads.

### R4 — Cost

One small model call per synthesis request, same call count as production, but the expected output is
a short JSON index array (`{"suitedFor":[0,1,2]}`, well under 20 tokens) versus production's full
rewritten headline + re-verbed action list. Materially cheaper per the doc's own porting expectation;
not measured in actual Workers-AI neurons this session (see R6).

### R5 — Authoring burden

15 hand-authored strings total (5 keys × 3 phrasings), reviewed once, one file. Honest cost beyond
that: any dataset shape outside the five rules (no Temporal column at all with only 1 table, more than
2 categories in every categorical column, single-table datasets with no cross-table join, geographic/
hierarchical data) gets nothing — R5's flip side is R7 below.

### R6 — Portability

**Not run against Workers AI this session.** The rig's own policy is "confirm on Cloudflare only once
a candidate passes on Ollama" — given the selective arm's 16% serve rate (below), this candidate
hasn't cleanly passed yet, so a Workers-AI call (against the shared, exhaustible free pool) wasn't
spent confirming portability of a mechanism that, as currently prompted, mostly doesn't serve at all.
The mechanism itself (index-only JSON answer, app-side reassembly) has no Ollama-specific dependency,
so portability risk is believed low, but that's a belief, not this session's measurement.

### R7 — Coverage

5/5 on the §14 samples — but these five rules were tuned and verified directly against these five
CSVs, so this number is closer to "the rules were built to cover the test set" than an independent
coverage measurement. Real coverage on an arbitrary uploaded dataset is unknown and plausibly much
lower — the mechanism is silent (not wrong, just silent) on anything outside: no Temporal column at
all, no 2-value categorical, fewer than 2 Quantitative columns, no cross-table join with a money-ish
column. Stated honestly per R5/R7's own trade, not assumed.

### Kill criterion (d) — the selective vs. extractive-floor comparison

This is the headline finding of the run. Serve rate (headline actually AI-composed, not degraded to
baseline):

| Sample | selective served | extractive-floor served |
| :--- | :--- | :--- |
| titanic | 0/5 | 5/5 |
| stock_prices | 1/5 | 4/5 |
| weather | 0/5 | 5/5 |
| product_reviews | 1/5 | 2/5 |
| ecommerce | 2/5 | 5/5 |
| **Total** | **4/25 (16%)** | **21/25 (84%)** |

Every one of the 21 selective-arm *failures* (raw model output visible in `RESULTS.json` and the
console log) has the identical shape: the model picked **more than one phrasing from the same
capability group** (e.g. titanic, 6 candidates across 2 groups: `{"suitedFor":[0,1,4]}` — two picks
from group 0) — a direct violation of the prompt's explicit "pick at most one option per group"
instruction. This is a prompt-following failure, not a grounding failure: the index validator caught
every one of them correctly (no malformed slice ever reached the seam validators), but catching the
violation still means degrading to the deterministic baseline, so **on this exact prompt shape, the
selective arm mostly just is D65** — it read as intended only 16% of the time. The extractive-floor's
much higher serve rate (84%) comes from asking strictly less of the model: order N given items,
nothing to select or skip, so there's no "which one from this group" judgment call to get wrong (its
own 4 failures were out-of-range indices, not duplicate picks — a different, rarer failure mode).

On the *quality* half of (d) — does selective read better than extractive, when both serve — yes,
clearly, by inspection: compare ecommerce selective #2 ("comparing periods to find recurring
patterns, tracking repeat activity per customer over time, and estimating how much each customer is
worth over time") against ecommerce extractive-floor's comma-dump of raw column names and cardinality
counts. The authored prose reads like product copy; the extractive floor reads like a debug log. But
"reads better 100% of the time it fires, and it fires 16% of the time" is a materially worse product
outcome than D65's 100%-reliable deterministic template.

### What it still doesn't solve (per the doc's own scoping)

**F1 is untouched**, exactly as the doc predicted — this candidate only ever rewrites the *suited-for*
clause; D65's own headline statement (the specific computed finding) rides through unchanged, so a
misattributed statistic in that baseline sentence would still ship as-is. If this arm advances, it
needs [03](03-clause-citation-binding.md)'s citation check on the headline anyway.

### Recommendation

**Grounding is solved and free — that part of the thesis holds.** Zero fabrications, structurally
guaranteed, across every run. But the selective arm as specified is not yet a working product
candidate: an 84%-of-the-time silent fallback to D65 fails kill criterion (d) in practice, even though
every individual safety property (a), (b), (c) passes clean. The likely fix is mechanical, not a
rethink of the thesis: the flat `{"suitedFor":[...]}` array makes "at most one pick per group" a rule
the model has to remember and apply across a flat index space; a shape that makes it structurally
impossible to violate (e.g. one optional index *per key*, keyed by name, rather than one array shared
across all keys) would likely turn most of these 21 failures into successes without touching the
grounding guarantee at all. That's the concrete next step for whoever picks this candidate back up —
not tuning wording, changing the JSON contract shape. Until that's tried, this candidate is
**inconclusive against D65**, not a clean win: safe, cheap, but unreliable as prompted.
