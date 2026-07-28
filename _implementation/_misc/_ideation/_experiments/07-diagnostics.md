# 07 — Diagnostics (instruments, not candidates)

**These two are measurement tools, not architectures.** Neither ships. Both are cheap, both run on the
free Ollama box, and both answer questions every other doc in this folder currently has to *assume*.

Run **D1 alongside whichever candidate you're testing** — rubric **R2 is not optional**, and a single
passing run certifies nothing (that is finding **F4** in [`README.md`](README.md)). D2 is a one-off that
should be run early, because its answer changes how much anyone should trust *any* good result.

Read [`README.md`](README.md) first.

---

## D1 — N-sampling variance (the F4 instrument)

**Question:** how much of a candidate's safety is real, and how much is one lucky roll?

**Why it matters, concretely.** The probe doc records the identical 891-row titanic input producing
*"the Titanic, which sank in April 1912"* on one call and *"not explicitly stated in the data"* on the
next — same session, same input. A fabrication rate of 1-in-5 looks like a clean pass if you sample once.

**Method.** For each candidate arm × each of the five samples, run **N=5** identical requests. Record:

| Metric | Definition |
| :--- | :--- |
| **Claim-set stability** | fraction of runs producing the same set of content claims |
| **Fabrication rate** | fabricating runs ÷ N (**not** a boolean per sample) |
| **Reject rate variance** | for validator-based arms: does the same input sometimes pass and sometimes reject? |

**Report fabrication as a rate, never as pass/fail.** A candidate at 1/25 is not "safe" — it is a
1-in-25 falsehood shipped to a user, which for a data-integrity product is a different kind of bad than
a crash. State it that way in verdicts.

**Possible shipping spin-off (secondary):** self-consistency filtering — run N=3, keep only claims
appearing in a majority. It would have caught F3. But at N× cost per synthesis it is hard to justify
against rubric R4 (≤ ~2× current), especially given the shared free pool is exhaustible. Consider it only
for a single high-value sentence (the domain guess), and only if a cheaper candidate loses. **Record the
measured cost multiplier if tested.**

---

## D2 — Opaque-schema ablation (the F3 instrument)

**Question:** when the model produces something impressive, is that **derivation from structure** or
**recall of a public dataset it has memorized?**

This is the question the probe doc keeps circling and never isolates. Its structure-only runs produced
"specific, non-generic well-suited-for recommendations on all five datasets" — genuinely encouraging.
But the five samples are titanic, weather, stock_prices, product_reviews and ecommerce: **exactly the
kind of canonical fixtures a model has seen thousands of times.** F3 ("sank in April 1912") proves recall
is in play. So the encouraging result may be substantially unearned — and if it is, everything measured
on these five samples is optimistic about arbitrary user data, which is the only data that matters.

**Method.** Run each candidate twice per sample:

```
CLEAR:   real identifiers  — titanic, Survived, Pclass, Embarked, Fare
OPAQUE:  tbl_a, col_1 … col_n; types, cardinalities, null %, min/max PRESERVED EXACTLY
```

Everything structural is identical. Only the *names* change. Then diff the outputs.

| Observation | Interpretation |
| :--- | :--- |
| OPAQUE ≈ CLEAR in usefulness | the model is genuinely deriving from structure — **the good news case**, and it means the five-sample results transfer to unseen data |
| OPAQUE much worse / declines to answer | CLEAR results were substantially **recall**; every number measured on these fixtures is optimistic |
| OPAQUE fabricates *more* | the model fills naming voids with invention — a serious finding about behaviour on unfamiliar user data |

**A second, sharper use.** OPAQUE mode is a **fabrication tripwire**, not just an ablation: in OPAQUE
mode, *any* domain-specific noun in the output ("customers", "passengers", "weather", a city, a year like
1912) is necessarily invented, because the payload contains no such word. **The oracle is exact and needs
no hand audit** — grep the output for domain nouns and every hit is a confirmed fabrication. This makes
OPAQUE the cheapest reliable fabrication detector available, and it should probably be a **permanent arm
in `eval/synthesis/run.ts`**, not a one-off: an unfamiliar-data proxy that a fixed public fixture set can
never provide.

**Note on scope:** OPAQUE is a *diagnostic* mode, not a shipping proposal — obfuscating real user schemas
would destroy the domain guessing that makes synthesis worth having at all. Don't confuse the instrument
with a candidate.

---

## What to build

1. `opaqueFacts(facts: StructuralFacts): StructuralFacts` — deterministic renaming, structure preserved
   bit for bit. Pure and trivially testable (assert every non-name field is untouched).
2. A domain-noun tripwire list for OPAQUE scoring (place names, entity nouns, four-digit years).
3. `--repeat=N` on the harness, with per-run results retained (**not** collapsed to a pass/fail — the
   individual runs are the data).
4. A results shape that keeps all N runs so rates are recomputable later without a re-run.

## Kill criteria

Instruments don't have kill criteria; they have **correctness checks**:

- `opaqueFacts` must preserve every structural field exactly — assert it, don't trust it.
- The tripwire must produce **zero hits on OPAQUE deterministic-baseline output** (the control). Any hit
  means the tripwire itself is wrong.
- N=5 must be genuinely independent calls (**no cached responses** — check the provider isn't returning
  an identical cached completion, or R2 will read as perfect stability for the wrong reason).

## Verdict

_Unrun. Append here: the D1 rate tables per candidate arm, and the D2 CLEAR-vs-OPAQUE comparison with the
interpretation it supports. If D2 shows recall dominance, say so loudly — it re-scopes every other result
in this folder._
