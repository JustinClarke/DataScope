# 03 — Per-clause evidence binding (citation-required output)

**Thesis:** the model may not emit a sentence. It emits **(claim, citation)** pairs, where the
citation is a machine-checkable pointer to the specific fact the claim came from — and each claim is
verified **against its own cited fact**, not against the dataset at large.

**Status:** live-verified, closed (see Verdict) — kill criteria (a)–(e) all PASS.
**This is the one candidate that catches all three recorded fabrications.**
**Cost class:** cheap at runtime; moderate build. **Prior art:** this is the probe doc's own
"fourth option" (the `narrationValidator` same-evidence check), taken to its structural conclusion.

Read [`README.md`](README.md) first — and [02](02-generate-then-verify.md), which this fixes.

---

## The insight

[02](02-generate-then-verify.md) fails F1 because it checks the paragraph against **the whole
payload**. `Survived` is a real titanic column, so "survivors" passes a global subset check even
though the underlying statistic is about `Pclass`.

Change the unit of verification and F1 dies:

```
claim:    "Fares for survivors average 1.6σ higher than non-survivors."
cites:    fact:titanic.Pclass.mean_fare_zscore
check:    entities named in claim ⊆ entities named in THAT fact
          {Fare, survivors/Survived}  ⊄  {Fare, Pclass}
          → REJECT
```

The same check catches F2 (`Manchester ⊄ {Date, City, temp columns}`) and F3
(`April 1912 ⊄ {no temporal fact exists to cite}` — there is nothing citable, so the claim cannot be
made at all). **One mechanism, three failure classes**, which is what makes this the strongest
technical candidate.

## Mechanism

**1. The app builds an addressable fact table.** Every deterministic fact gets a stable id and an
explicit entity set. `FactRef` ([`src/types/actions.ts`](../../../src/types/actions.ts) L26) already
carries `statement`/`sql`/`snapshot`/`confidence`/`provenance` — this adds the addressing layer
around it.

```ts
interface CitableFact {
  id: string                    // 'fact:titanic.Pclass.mean_fare_zscore'
  entities: string[]            // ['Pclass', 'Fare']  — the ONLY names a citing claim may use
  values: (string | number)[]   // [1.6]               — the ONLY values it may state
  ref: FactRef                  // the existing seam object, untouched
}
```

**2. The model returns bound claims, never prose.**

```json
{ "claims": [
    { "text": "Fare for \"1\"s is 1.6σ higher than other Pclass groups.",
      "cites": "fact:titanic.Pclass.mean_fare_zscore" }
] }
```

**3. Per-claim verification, then deterministic assembly.**

```
for each claim:
  fact = table[claim.cites]                    // unknown id → reject
  named  = extractEntities(claim.text)
  stated = extractValues(claim.text)
  reject unless named  ⊆ fact.entities ∪ neutralVocabulary
  reject unless stated ⊆ fact.values   ∪ derivableFrom(fact)
  reject unless passesPhrasingGuard(claim.text)   // reuse the existing guard
```

Surviving claims are assembled by the app in the app's order. **Reject whole on any failure** —
degrade to baseline, never repair, never retry.

**4. `narrationValidator` gains the check as a real amendment.** The upgraded signature becomes
`narrationValidator(baseline, candidate, citedFact)` — the byte-identity checks stay exactly as they
are (L62-L69) and the entity-subset check is added. That keeps **one** validator (D58), not a
harness-local second path.

### The neutral vocabulary is the risk surface

Words like "rows", "records", "values", "column", "average", "higher" must be allowed or nothing
passes. Every word added is a widening. **Keep the list short, keep it in one place, and report its
final contents in the verdict** — a long neutral list is how this quietly becomes [02](02-generate-then-verify.md).

## What to build

1. `src/lib/citableFacts.ts` — build the `CitableFact[]` (with `entities`) from the deterministic
   baseline + `StructuralFacts`. Note `entities` must be derived where the facts are *computed*, so
   the true column is recorded rather than re-guessed from prose. **This is the load-bearing piece.**
2. `extractEntities` / `extractValues` — pure, unit-tested, and deliberately over-inclusive (better
   to over-extract and reject than under-extract and pass).
3. The `narrationValidator` amendment, additive, with the existing tests
   ([`producerValidators.test.ts`](../../../src/lib/producerValidators.test.ts)) still green.
4. Harness arm `clause-citation`, plus **regression fixtures for F1, F2 and F3** asserted to reject.

## Kill criteria (pre-commit, D18)

- **(a)** F1, F2 and F3 all rejected, as unit fixtures, before any live run. **If F1 isn't rejected,
  stop — the mechanism isn't implemented, and F1 is its entire reason to exist.**
- **(b)** Zero fabrications live, 5 samples × N=5, hand-audited.
- **(c)** False-reject rate on accurate output ≤ 25%, and the *shipped* effect of a reject is an
  honest baseline, verified on screen (invariant 5).
- **(d)** Neutral vocabulary ≤ 25 words. Above that, report it as a failure of the approach, not a
  tuning task.
- **(e)** The model actually complies: measure how often it returns a well-formed `cites` id versus
  free prose. **Non-compliance rate is a first-class result** — a mechanism the model won't obey is
  not safe just because the check is sound.

## Ollama run

`qwen2.5-coder:14b` is a code-tuned model, so structured `{text, cites}` output is close to its
strength — a fair test of (e). Iterate the checker offline against the recorded F1/F2/F3 outputs in
`SYNTHESIS-VARIANT-RESULTS.json` first; only then generate live.

## Porting to Cloudflare

The checker is deterministic and client-side, so safety ports unchanged. **The open question is
(e)** — whether Mistral Small 3.1 complies with the citation format as reliably as a code-tuned 14B.
Test (e) specifically on the Cloudflare leg once the pool resets; a lower compliance rate means more
degradations, i.e. a *quality* regression, not a safety one. Report both numbers.

## What it does not solve

- **R3 reach is capped by what the app already computes.** The model can only say things that have a
  citable fact, so "well-suited for CLV" needs a *capability fact* to cite — which means this pairs
  naturally with [01](01-phrase-library.md)'s `detectCapabilities` as the thing that manufactures
  citable purpose facts. **These two are complements, not rivals**; note that in the verdict.
- Doesn't improve R2 by itself — the model still varies; rejections just vary with it.
- Adds a real maintenance obligation: every new deterministic fact must declare its `entities`, or it
  silently becomes uncitable.

## Verdict

**Status (2026-07-26): live-verified, four rounds (blocked → live → three fix-and-rerun cycles).**
The Ollama rig became reachable mid-session; the first live run surfaced a real false-reject rate
and, on hand audit of the *second* run, one live fabrication. Both were root-caused (not
worked around) in `src/lib/citableFacts.ts` and closed by a third live run. Full suite green
(1430 tests, up from 1416 — 14 new regression tests for the six fixes below), `tsc -b` clean,
`oxlint` clean.

### The four live runs

| Run | Trigger | Claims rejected | Compliant | Served | Finding |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | doc's own "Next step" | 39/99 (39%) | 24/25 | 20/25 | (b) hand-audit clean; (c) fails ceiling — root-caused to 3 checker bugs |
| 2 | fixes 1–4 applied | 22/93 (24%) | 23/25 | 22/25 | (c) clears ceiling; hand-audit finds **one live fabrication** ("Seven" vs. real "20") |
| 3 | fix 5 applied | 19/85 (22%) | 22/25 | 21/25 | snake_case misattribution (`order_items`→`orders`) confirmed fixed; fabrication fix not yet re-verified live |
| 4 | fix 6 applied (final) | 25/101 (25%) | 23/25 | 22/25 | hand-audited clean — reported below |

### Six bugs found and fixed, all in `src/lib/citableFacts.ts`

None of these were anticipated in "What to build" — they surfaced only because the live run gave
the checker real model prose to run against, not the doc's own hand-written fixtures. Each is a
narrow, root-caused fix, not a blocklist widening (kill criterion (d)'s own warning against exactly
that):

1. **ISO date tokenization.** `extractValues`'s digit regex split on hyphens, so even a
   byte-identical restatement of a fact's own `"2016-01-04"` fractured into `"2016"`, `"01"`,
   `"04"` — and the day/month components never matched anything in the fact's value set. Every
   `dateRange`-citing claim, in every dataset, every repeat, was rejected. Fix: match the whole
   `\d{4}-\d{2}(-\d{2})?` token before the generic digit scan runs, so it's consumed once, not
   re-split.
2. **Month names as invented entities.** `extractEntities` flagged any capitalized non-schema word
   as a fabricated proper noun — including "August" in an otherwise-correct, correctly-cited date
   claim. Fix is *conditional*, not blanket: `checkCitation` now exempts a month name only when the
   cited fact itself asserts a date (a year or ISO date among its own values) — F3 ("sank in April
   1912," cited against a fact with **no** date at all) still correctly flags `April`, confirmed by
   a regression test, because the exemption never fires there.
3. **Quoted entity names read as values.** `extractValues` scanned every `'...'`/`"..."` span as a
   stated value. `'stock_prices'` written for emphasis got checked against the fact's *numeric*
   value set and rejected. Fix: a quoted span matching a real vocabulary name is recognized as an
   entity mention, not a value.
4. **The fact's own canonical phrasing self-rejected.** `id-exclusion` facts' stored statement —
   `"PassengerId" is near-unique — excluded from analysis (override in Profile)` — was rejected
   when the model reused it verbatim, because "Profile" (a UI term) wasn't in either `fact.entities`
   or the (already-at-ceiling) neutral vocabulary. Fix: `entitiesFromInsightId` adds `Profile` to
   this fact *type's own* entity set — scoped to `id-exclusion` facts specifically, so `NEUTRAL_VOCABULARY`
   stays at 25 words and (d) still passes cleanly, not as the widening (d) warns against.
5. **snake_case identifier fragmentation.** `extractEntities` split on any non-letter, so
   `order_items` (written verbatim, unquoted) broke into `order` + `items`; the fragment `order`
   then stem-matched the *sibling* table `orders` — a real misattribution produced by the checker's
   own tokenizer, on exactly the class of error this mechanism exists to catch. Fix: underscore
   stays part of a token, so a snake_case identifier resolves as one name against the vocabulary
   before any stemming is tried. (Residual, accepted: a *space*-separated paraphrase like "order
   items" with no underscore still can't be told apart from "orders" — that needs real semantics,
   not string matching, and is out of scope here.)
6. **Spelled-out numbers were invisible — a live fabrication, not just a false reject.** Run 2's
   hand audit caught `product_reviews` repeat 1 serving *"Seven review entries are fully
   replicated"* against a fact whose real value was `20` — `checkCitation` returned `ok: true`.
   Root cause: `extractValues` only matches digit characters, so "Seven" was never extracted as a
   candidate value at all, and separately it was exempt from the entity check as an unresolved
   sentence-initial capitalized word. Two independent blind spots stacked to let a materially wrong
   number through cleanly. Fix: a closed `WORD_NUMBERS` map (zero–ninety, hundred/thousand/million)
   normalizes a spelled-out cardinal to its digit form before the value check runs. This is the most
   important of the six — a false accept, not a false reject, and it directly falsified the run-1
   hand audit's "(b) PASS" conclusion, which is exactly why the doc's own F4 (non-determinism —
   "one passing run certifies nothing") matters even for a hand audit, not only for a pass/fail count.

### Kill criteria (a)–(e) — final (run 4)

- **(a) PASS**, unchanged from the offline result — `fixtures.test.ts` still rejects F1/F2/F3, and
  now also asserts the month-name exemption does **not** fire for F3 (regression-tested; see bug 2).
- **(b) PASS, hand-audited, run 4.** All 22 served composed headlines checked against the real
  `CitableFact` values (dumped directly from `buildCitableFacts`, not eyeballed): every surviving
  claim is accurate, including the hardest cases — ecommerce's four tables (400/150/1,400/3,487
  rows) kept straight with no cross-table leakage, and weather's four independent change-point
  facts (`TempLowC`/`TempHighC`/`WindKph`/`Humidity`) each correctly attributed. Zero fabrications.
  This PASS came only after finding and fixing bug 6 above — the run-1 "clean" audit had missed a
  real hole that a later run happened to exercise.
- **(c) PASS, but closer to the ceiling than comfortable.** 25/101 = 24.75%, under the ≤25% bar but
  not by much, and it moved run to run (39% → 24% → 22% → 25%) as different claims happened to hit
  the one remaining known gap: a *prose* date restatement with an explicit day-of-month
  ("January 7, 2019" instead of "2019-01-07") still fails, because the day number was never added
  to a `dateRange` fact's value set — and it deliberately wasn't (see below). Every dateRange
  rejection in run 4 traces to this one residual cause, not a new bug.
- **(d) PASS, still exactly at the ceiling (25 words), genuinely this time.** Bug 4's "Profile" case
  is fixed structurally (per-fact-type entity, not a blocklist add), so `NEUTRAL_VOCABULARY` itself
  never needed to move. The ceiling-exactness is still worth watching in any future round.
- **(e) PASS.** 23/25 (92%) well-formed `{claims}` JSON in the final run; 24/25, 23/25, 22/25 across
  the three earlier live runs. The non-compliant cases were genuine model malformation (a stray `)`
  inside a JSON string, a truncated `{}`), not harness artifacts — plus occasional raw
  `TypeError: fetch failed` transport hiccups over the Tailscale link, counted as `degrade: ai-down`,
  not compliance failures.

**Why the day-of-month gap was left unfixed:** the tempting fix — decompose `minDate`/`maxDate`
into day/month numbers and add them to a `dateRange` fact's own `values` — was rejected. Day-of-month
numbers (1–31) are common, small, and would start appearing as *allowed* values on facts that have
nothing to do with them, reopening a real accept-side hole in exchange for closing a reject-side
one. Kill criterion (c)'s ≤25% bar is a ceiling, not a target of zero — this residual gap is the
honest cost of keeping the value-matching strict rather than widening it, consistent with how bug 6
was fixed (recognize a genuine alternate *form* of an existing value) rather than how the date gap
would have to be "fixed" (accept a value the fact never actually stated in that shape).

### The seven rubric rows

| # | Dimension | Result |
| :--- | :--- | :--- |
| R1 Grounding | **PASS, live-confirmed.** Zero fabrications across 22 served headlines in the audited final run (and across runs 2–3 once bug 6 was known to look for it). |
| R2 Determinism | **Low, as expected for free-form claims.** Same facts, same dataset, 5 repeats: the *set* of facts mentioned and their phrasing varied every time (e.g. titanic repeat runs ranged from 1 claim to 4). No claim was ever wrong when present, but which claims survive is not stable — R2's bar ("no claim appears in <100% or >0% of runs inconsistently") is not met by this candidate; that is a property of the model's sampling, not the citation check. |
| R3 Reach | Structurally capped, as expected (the doc's own caveat): `buildCitableFacts` mints facts from `TableInsights` + row counts + Temporal spans only — no capability/"suited for" facts, so this candidate alone cannot reach §4's "well-suited for CLV" claim. Confirms 03 pairs with [01](01-phrase-library.md)'s `detectCapabilities`, not a rival to it. |
| R4 Cost | **~1×, by construction and live-consistent.** The claims prompt replaces the production synthesis prompt in the same single model call; nothing here adds a second round-trip. Exact token counts not separately instrumented. |
| R5 Authoring burden | **Zero hand-authored assets, including per-new-dataset-shape.** `buildCitableFacts` derives every fact and its entity set automatically — no phrase library, no per-shape template (contrast [01](01-phrase-library.md)). Confirmed on all five §14 samples, including the four-table ecommerce shape. |
| R6 Portability | **Mechanism itself is provider-agnostic** (a pure post-hoc text check), confirmed by construction; all six bugs found live are checker bugs that would reproduce identically on any provider's output, not Ollama-specific. Actual Cloudflare/Mistral compliance rate (the doc's own open question for this row) is still untested — Workers-AI free pool was exhausted this session per the folder README. |
| R7 Coverage | Every one of the five samples produced a non-empty fact table (4–14 facts), so zero-fact coverage wasn't exercised. Untested: a table with no ranked insights and no Temporal column. |

### Next step

03 is closed for this session: thesis validated live (R1 PASS), all found bugs fixed and
regression-tested, kill criteria (a)–(e) all PASS. Remaining open items, for whoever picks this back
up: R2's low determinism (inherent to free-form claims, not a bug — worth deciding if it's
acceptable product behavior), R6's Cloudflare-side compliance number, and R7's zero-fact-table case.
None of these block a verdict; they're follow-on measurement, not fixes. Per the folder README's own
priority order (05 → 03 → 04), [05-offers-not-claims.md](05-offers-not-claims.md) is next.
