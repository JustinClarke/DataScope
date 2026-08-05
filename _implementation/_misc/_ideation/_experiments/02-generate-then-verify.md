# 02 — Generate then verify

**Thesis:** let the model write freely, then mechanically reject any claim whose named entities and
values aren't derivable from the payload it was given.

**Status:** untested as built, but **partially pre-refuted on paper** — read the hole below before
spending a session. **Cost class:** cheap. **Recommended posture:** run this only as the *baseline
arm* against [03](03-clause-citation-binding.md), which fixes its defect.

Read [`README.md`](README.md) first.

---

## What it attacks

**F2 and F3.** Both name things absent from the payload — "Manchester" (a value class that never
crosses the wire) and an 1912 sinking (no date column exists). A subset check over payload-derivable
tokens catches both.

## The hole — why this doc exists mainly as a warning

**It does not catch F1.** The fabrication was:

> "Fares for **survivors** average 1.6σ higher than non-survivors." — where the measured fact is
> about **Pclass**.

`Survived` **is a real column in the titanic payload.** `Fare` is real. Every token in that sentence
is payload-derivable, so a global subset check over "names anywhere in `StructuralFacts`" passes it
cleanly. The sentence is grounded in the *dataset* and false about the *evidence*.

This is the whole reason [03](03-clause-citation-binding.md) exists: the unit of verification has to
be **the clause against its own cited fact**, not the paragraph against the whole dataset. A session
running this approach should expect F1 to survive and should **report that as the finding** rather
than patching around it.

## Mechanism

```
1. model writes free prose from StructuralFacts
2. tokenize output; extract candidate entity mentions (proper nouns, quoted strings,
   column-shaped tokens, numerals, date literals)
3. build the allowed set deterministically from the payload:
   table names ∪ column names ∪ semanticType vocabulary ∪ rowCounts ∪
   cardinalities ∪ minDate/maxDate (and derivable forms: year of, span in years)
4. any extracted mention not in the allowed set → reject the whole statement,
   degrade to baseline (never retry, never partially strip)
```

**Reject whole, never repair.** Stripping the offending clause and keeping the rest produces prose
no human authored and no validator understands. Degrade to the deterministic baseline — the existing
`degrade()` path already does this.

### The two hard parts (where the session's time will actually go)

- **Derivable forms.** "spanning ten years" is legitimately derived from `minDate`/`maxDate`; a naive
  token check rejects it because "ten" appears nowhere. The allowed set must be a small **computed
  closure** (year extraction, span arithmetic, count formatting with separators), and every rule
  added to that closure is a rule that widens what passes. **Log every closure rule** — the list
  length is itself a result.
- **False-reject rate.** Ordinary connective language ("customers", "records", "data") must not trip
  it. Measure the reject rate on *good* output; a check that rejects 80% of accurate paragraphs is
  D65 with extra steps.

## What to build

1. `allowedMentions(facts: StructuralFacts): Set<string>` plus the closure rules, as a pure module.
2. `groundingCheck(statement: string, allowed: Set<string>): { ok: boolean; offending: string[] }`.
3. Harness arm `generate-then-verify`, reusing the widened prompt already in
   `eval/synthesis/run.ts`, with the check applied after `parseModelAnswer`.

## Kill criteria (pre-commit, D18)

- **(a)** F2 and F3 are caught. If either passes, the check is broken.
- **(b)** **F1 is expected to pass the check (i.e. not be caught).** Confirm it explicitly — that
  confirmation is the deliverable, and it is what justifies [03](03-clause-citation-binding.md).
- **(c)** False-reject rate on accurate output ≤ 20% across 5 samples × N=5. Above that, unusable.
- **(d)** Closure-rule count stays small (≤ 6). A sprawling closure means the check is being tuned to
  let output through, which is scoring the test to the answer.

## Ollama run

Free prose from `qwen2.5-coder:14b`, then the check offline — the check needs no model at all, so
iterate on it against **recorded** outputs in `SYNTHESIS-VARIANT-RESULTS.json` before generating
anything new. F1/F2/F3 are all in there already: **this arm can be substantially evaluated with zero
model calls.** Do that first.

## Porting to Cloudflare

Trivial — the check is client-side and deterministic, so it runs identically regardless of provider.
That is this approach's one genuine strength: **it makes provider choice irrelevant to safety.**

## What it does not solve

- **F1**, as established above. Structural, not fixable by a better token set.
- Nothing about R2/determinism: the model still varies run to run; the check just filters. Expect a
  *stable safety* floor with *unstable content* above it — which the UI has to tolerate (the same
  dataset narrating differently on two loads is a product problem, not just an eval one).

## Verdict

**Run 2026-07-26.** Built the two files "What to build" specified as a pure module —
[`eval/claude/02-generate-then-verify/groundingCheck.ts`](../../../../eval/claude/02-generate-then-verify/groundingCheck.ts)
(`allowedMentions` + `groundingCheck`) — plus a harness arm
([`eval/claude/02-generate-then-verify/run.ts`](../../../../eval/claude/02-generate-then-verify/run.ts)) that reuses
the widened prompts verbatim (relocated from `eval/synthesis/run.ts` into a new side-effect-free
[`eval/synthesis/prompts.ts`](../../../../eval/synthesis/prompts.ts) — see the incident note below) and
the real seam (`requestSynthesis`, D58 unbroken) over Ollama. Evaluated in the order the doc itself
prescribes: **zero-cost first**, against every composedHeadline already recorded in
`SYNTHESIS-VARIANT-RESULTS.json` plus F1/F3 hand-typed verbatim from the probe doc's own quotes; only
then N=5 fresh repeats × 2 widened variants × 5 samples = 50 live Ollama calls
(`qwen2.5-coder:14b`). Every claim below was hand-audited against the recorded `facts`/baseline and,
for the two dataset-specific numbers (city name, product-review date span), against the raw
`public/samples/*.csv`.

### Closure rules (kill criterion d) — 5, under the ≤6 bar

1. Case-insensitive match for table names, column names, and `semanticType` values.
2. Numeric normalization — thousands separators and trailing `%`/`σ` stripped before comparing digit runs.
3. Year extraction — the 4-digit year prefix of any `minDate`/`maxDate` is allowed.
4. Date-span arithmetic — `|maxYear - minYear|` and that value `+ 1` are both allowed as span-length numbers.
5. Baseline-headline carryover — every numeric token and quoted substring already present in the
   *given* baseline headline is allowed verbatim (it crosses the wire in the request's `headline`
   field, not `StructuralFacts`, but the model was given it and told to preserve it — without this
   rule every compliant numeric carryover, e.g. "1.6σ", "0.976", would itself look ungrounded).

Deliberately **not** a closure rule, by design rather than omission: word-form numerals ("ten
years"). Only three candidate-mention classes are ever extracted (capitalized words, digit runs,
quoted substrings) — an ordinary lowercase English word is invisible to the check regardless of
whether it's a number spelled out. This is what keeps the false-reject mechanism narrow enough to
measure at all, at the cost of leaving spelled-out numerals completely unchecked in either direction.

### F1/F2/F3 disposition (kill criteria a, b)

| Case | Statement tested | Result | Expected? |
| :--- | :--- | :--- | :--- |
| **F1** | "Fares for **survivors** average 1.6σ higher than non-survivors." | **PASS (not caught)** | **Yes — this is the doc's predicted hole, confirmed exactly as written.** `Fare`, `1.6σ`, and (via closure rule 1) `Survived`'s casual inflection aren't what's checked — "survivors"/"non-survivors" are lowercase, non-numeric, non-quoted, so the misattribution is structurally invisible to a per-token check. |
| **F2** | "5 years of daily weather data in **Manchester** shows strong temp correlations." (recorded) | **CAUGHT** (`Manchester`, `5`) | Yes |
| **F3** | "The data covers the single voyage of the Titanic, which sank in **April 1912**." | **CAUGHT** (`April`, `1912`) | Yes |

F2 did not stay a one-off. The live N=5 run on `weather`/`widened-v2-suited-for` — the exact
dataset/variant pair F2 came from — fabricated **something in all 5 of 5 repeats**, never twice the
same way: invented cities **Seattle**, **Boston**, and **Berlin** (true value, confirmed against
`public/samples/weather.csv`: **Springfield** — `City` has `cardinality: 1`, so no value ever
crosses the wire, exactly as the payload boundary predicts) and wrong spans ("7-year" ×2, "5-Year"
×1 against a true ~10-year span, `2015-01-01` to `2024-12-28`). The check caught all 5/5. This is
the strongest evidence in this session that F2 is a *systematic* property of this prompt/dataset
combination, not a sampling fluke — and, combined with F1 reproducing exactly as predicted and one
more Titanic/1912 recurrence observed incidentally during the run (see incident note), a third
confirmation of F4 (non-determinism): the same input keeps landing on different fabrications, never
reliably safe twice.

**Two fabrications neither README nor the original probe recorded, found this session:**

- `product_reviews`/`widened-v2-suited-for` claimed *"Explore 500 unique reviews spanning **3
  years**"* — true span (`ReviewDate`, confirmed against the CSV) is **2023-01-01 to 2024-11-29, ~1.9
  years**. Caught (`3` not in the allowed span set `{1, 2}`) — structurally the same error class as F2's
  wrong span.
- `ecommerce`/`widened-v1-domain-and-dates` claimed **"5,687 rows"** against a true, baseline-stated
  **5,437**. Caught (`5,687` not in the allowed rowCount set) — this is the cleanest true positive in
  the whole run: a plain invented number, exactly the failure mode `groundingCheck` exists to catch.
- `stock_prices`/`widened-v1-domain-and-dates` claimed **"No Leakage"** where the baseline's own
  flagged finding is "possible target leakage" from a perfect correlation — a **polarity reversal**,
  not an invented entity. It was rejected, but only because the sentence happened to be title-cased
  (`No`, `Leakage` both capitalized); a sentence-case version of the identical false claim ("...shows
  no leakage...") would sail through untouched, since neither word is a suspicious token. **This is a
  second structural hole beyond F1**, of the same shape: a check for invented *entities* has no
  opinion on inverted *conclusions* about entities that are entirely real.

### False-reject rate (kill criterion c) — **FAILS**

| Source | Accurate rows | False-rejected | Rate |
| :--- | ---: | ---: | ---: |
| Zero-cost pass (recorded `SYNTHESIS-VARIANT-RESULTS.json`, 18 served rows) | 18 | 3 | 17% |
| Live N=5×2×5 (this session, 40 accurate of 50 served) | 40 | 17 | **42.5%** |

The doc's own bar is ≤20% "across 5 samples × N=5" — the live figure is the one that evaluation
design actually calls for, and it **fails by more than double**. The zero-cost pass alone would have
looked passable; it understated the problem because the recorded sample happened to contain less
stylistic variance than fresh generations do. Cause breakdown across the 17 live false-rejects
(rows can have more than one cause):

- **10/17 — capitalized/title-case headline styling.** `qwen2.5-coder:14b` frequently answers in
  Title Case ("Weather Data ... Reveals Strong Temperature Correlation") or capitalizes a leading
  noun phrase ("Product Reviews spanning ..."). Every capitalized word is a candidate mention under
  this design; ordinary words capitalized only for style are indistinguishable from proper nouns.
- **4/17 — ISO date-fragment shredding.** `"2023-01-01"` is in the allowed set as a whole string, but
  the numeral extractor stops at `-`, so a statement citing the *exact* date gets torn into `01`,
  `01`, `11`, `29` — fragments that were never separately added to the allowed set. **The most
  precisely-grounded outputs in the entire run** — the ones stating exact ISO dates or exact
  year-months instead of vague years — were rejected for exactly the reason they should have been
  rewarded.
- **4/17 — second-clause capitalized word.** The exemption for sentence-initial capitalization only
  covers index 0 of the whole statement; a second sentence or a clause after a colon/dash
  ("... — Explore insights!") starts its own capitalized word the check has no exemption for.
- **3/17 — month names/abbreviations.** `minDate`/`maxDate` are in the allowed set as raw ISO
  strings and as extracted years (closure rule 3); a model correctly deriving "January 2019" or "Jan
  2023" from those same fields states a legitimate derivable form that was never added to the
  allowed set.

None of these are closure-rule candidates in the sense kill criterion (d) means — they're
extraction-side heuristic failures, not allowed-set gaps, and patching each one (a stoplist for
title case, a smarter date tokenizer, multi-sentence exemption, a month-name table) is exactly the
kind of ad hoc widening kill criterion (d) warns produces a check "tuned to let output through."
One outright bug *was* fixed during this session (a trailing sentence period being absorbed into a
numeral, e.g. `"1.000."`) since that was a correctness defect in the extractor, not a widening of
what counts as grounded — after the fix the live rate is still 42.5%.

### Rubric

| # | Dimension | Result |
| :--- | :--- | :--- |
| R1 Grounding | **FAILS.** F1-class misattribution (kill criterion b) and the newly-found polarity-reversal case are both structural blind spots that survive even a perfectly-tuned allowed set. Recall against genuine invented-entity/invented-number fabrications was 10/10 in this run, but several of those catches were coincidental (title-case or month-name artifacts), not the check "understanding" the error. |
| R2 Determinism | **FAILS**, as expected — not something this candidate attempts to fix. `weather`/`widened-v2` fabricated in 5/5 runs, never the same way twice (3 different invented cities across the session's evidence). Doc's own framing ("stable safety floor, unstable content above it") holds only if the check is actually wired into the seam; this harness measured it, did not wire it in. |
| R3 Reach | Partially met when content is accurate (40/50 served statements reached §4-style domain/date/suited-for claims D65 cannot) — but "reach" and "grounded" trade off directly against each other here: the more the widened prompt reaches, the more surface area for both real fabrications and false rejects. |
| R4 Cost | Met. One model call per synthesis, unchanged from production; `groundingCheck` itself is a pure, local, zero-cost function. |
| R5 Authoring burden | **Low — this candidate's clearest advantage.** No hand-authored asset (unlike 01's phrase library): `allowedMentions` derives entirely from generic `StructuralFacts` fields, so a new dataset shape needs zero new authoring. |
| R6 Portability | Structural, not independently confirmed live: `groundingCheck.ts` has no provider-specific code, so it should port to Workers AI unchanged. Not run against the live Workers AI endpoint this session to avoid further drawing on the free-tier pool (see incident note) — Ollama-only evidence. |
| R7 Coverage | 50/50 attempts served *some* AI content; only 23/50 (46%) were both accurate and would have passed the check. If wired into the seam, effective useful AI-sourced coverage ≈ 46%, with the remainder degrading to the D65 baseline. |

### Incident: an accidental live-infrastructure side effect (disclosed, fixed)

Exporting `WIDENED_V1_SYSTEM_PROMPT`/`WIDENED_V2_SYSTEM_PROMPT` directly from `eval/synthesis/run.ts`
and importing them into this candidate's harness triggered that file's own unconditional
`main().catch(...)` as an import side effect — `eval/synthesis/run.ts` was written to only ever be
executed directly, never imported. One `npm run eval:generate-then-verify` invocation therefore also
re-ran the full `eval:synthesis` harness: ~15 live calls against the deployed Cloudflare staging
Worker (drawing on the account-wide Workers-AI free-tier pool this README already flags as
exhaustible), and it overwrote `SYNTHESIS-EVAL-RESULTS.json` and the untracked
`SYNTHESIS-VARIANT-RESULTS.json` with a fresh run. Per the repo owner's decision this was left as-is
(the new content is real, valid eval output, just not the exact recorded run this doc's zero-cost
pass was computed against — the numbers above were captured before the overwrite). **Fixed at the
root**: the widened prompts now live in a new side-effect-free `eval/synthesis/prompts.ts`, imported
by both `eval/synthesis/run.ts` and this candidate's harness — importing prompt text can no longer
trigger a live run. Any future candidate reusing prompts or other constants from an
`eval/*/run.ts` entry point should import from a sibling non-`main()` module, never from the
executable file itself.

### Overall verdict

**Loses to D65, and loses to its own predicted successor.** Kill criterion (b) confirms exactly as
written — F1 passes untouched — and the false-reject rate fails kill criterion (c) by more than 2×
on the evaluation design the doc itself specifies (live N=5, not the smaller recorded sample). Recall
on genuine invented-entity/invented-number fabrications is excellent (10/10 including two previously
unrecorded cases), which validates that the *mechanism* — a payload-derived allowed set plus a narrow
three-class extractor — is sound for what it targets. But a global per-statement check fundamentally
cannot distinguish a real entity attached to the wrong claim (F1, and the newly-found polarity
reversal) from a real entity attached to the right one, and this session's evidence is that even
within its own lane (invented entities/numbers) it rejects nearly half of accurate live output on
formatting grounds alone. This is the confirmation the doc asked for, not a surprise: run only as the
baseline arm it was always meant to be. [03](03-clause-citation-binding.md)'s per-clause citation
design is the one that has to fix both F1 and the polarity-reversal case, since neither is a
tokenization problem — and whatever citation-carrying representation 03 lands on should be checked
against title-cased and exact-ISO-date output specifically, since those are exactly what defeated 02.
