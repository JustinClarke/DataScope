# AI architecture experimentation — index

**Status:** ideation. **Nothing here is decided, and nothing here ships.** These are candidate
*architectures* for AI dataset synthesis, written so each can be prototyped in its own isolated
session and compared on one rubric.

**Where this sits in the pipeline.** This folder is **upstream of master** — it is not part of the
`_implementation/` split tree, so the master-first mirroring rule does not apply and **no session
working here edits `DATASCOPE.md`, the Decision Record, or any leaf doc.** A candidate that wins
becomes a proposed **D-row + ADR-010 amendment**, drafted only after a verdict exists. The
governing prior art is [`../../build/14-workspace-streamline/00-synthesis-and-limits-probe.md`](../../build/14-workspace-streamline/00-synthesis-and-limits-probe.md)
(Probe A, S0) — read its verdict sections before starting any experiment here. Everything below
assumes them.

---

## The problem, stated once

The product wants §4's narrative:

> "This appears to be an E-Commerce dataset with two tables containing 10,420 customers and 45,092
> orders. The data spans from January 2021 to January 2024. This dataset is well-suited for
> calculating Customer Lifetime Value (CLV), analyzing churn, and forecasting seasonal demand."

The shipped ADR-010 seam produces:

> "4 tables, 5,437 rows, 0% null values — see what's inside."

Both are true. Only one answers *"what is this for?"*

### Why the shipped seam can't get there

The seam lets the model do exactly two things: re-phrase one headline, and re-order/re-verb existing
actions. The slice is reassembled from the deterministic baseline, so an invented *number* is
unrepresentable. That is a real guarantee and it holds. But the two validators
([`src/lib/producerValidators.ts`](../../../src/lib/producerValidators.ts)) check **shape, not
meaning**:

| Validator | What it actually enforces |
| :--- | :--- |
| `rankedActionValidator` (L30) | same length; same multiset of `{module, tab, prefill, evidence, score}`. Only `verb` and order are the model's |
| `narrationValidator` (L62) | `sql` / `snapshot` / `confidence` / `provenance` byte-identical to baseline, plus `passesPhrasingGuard(statement)` — a regex banning permanence/causal/verified wording (L48) |

**Neither has any notion of whether the prose still describes the evidence it is attached to.**
`statement` is free text; the guard is a word blocklist. That is the gap every experiment here
attacks.

### The three recorded fabrications (the evidence base)

All hand-audited, all from the probe doc's verdict sections. Any candidate architecture must be
tested against **these specific cases** before anything else.

| # | Case | What the model said | Why it's wrong | Failure class |
| :--- | :--- | :--- | :--- | :--- |
| F1 | titanic, cloud `widened-v1` | "Fares for **survivors** average 1.6σ higher than non-survivors." | The measured fact is about **Pclass**, not `Survived`. Real stat, real column names — **wrong attribution** | Misattribution |
| F2 | weather, ollama `widened-v2` | "5 years of daily weather data in **Manchester**…" | `City` has `cardinality: 1` and **no value ever crosses the wire**; true city is Springfield; true span ~10 yrs not 5 | Invented value class |
| F3 | titanic, max-context (891/891 rows) | "…the Titanic, which **sank in April 1912**." | Schema has **no date column at all**; pure training-data recall about the real ship | World-knowledge injection |

Plus a fourth property that constrains how anything here may be certified:

**F4 — non-determinism.** The identical 891-row input, same session, produced F3 once and correctly
answered *"not explicitly stated in the data"* the next call. **A single passing run certifies
nothing.** Every experiment below must report an N>1 repeat count.

**The load-bearing insight:** F1, F2 and F3 reproduced across three different models and three
different serving paths (Workers AI Mistral Small 3.1, the same at max context, and a 14B Qwen over
Ollama). This is a **property of the contract, not of any provider** — which is precisely why a
better prompt is not on the table here, and why a fix in the *validation/composition architecture*
should port across providers unchanged.

---

## The control: what every candidate must beat

**D65 deterministic narration** — templated prose, no model involved. It is the probe doc's own
recommended answer 3, it cannot fabricate, it costs nothing, and it is **an acceptable outcome**.
A candidate that is not clearly better than D65 on the rubric loses to D65. "The AI is invisible"
is not a reason to ship a fabricating AI.

## Invariants no experiment may break

Non-negotiable. An experiment that wins by violating one of these has failed, not won.

1. **Rows-free wire boundary** (D20/D45/D46/D59). `StructuralFacts` carries table/column names,
   semantic + physical types, `nullPercentage`, `cardinality`, and `minDate`/`maxDate` for Temporal
   columns only ([`edge/protocol.ts`](../../../edge/protocol.ts) L44). **No cell values, no sample
   rows.** The row-upload question is *answered* (see the probe doc's first verdict), not reopened.
2. **No second validation path** (D58). Score through the product's own validators. A variant that
   passes only under a harness-local check has failed.
3. **The envelope invariant** (D55). Nothing here lets a model choose a tab type, identity, or
   initializer.
4. **No unearned accuracy number reaching a user** (D40, ADR-007 constraint 4).
5. **Degradation stays honest on screen.** If the mechanism can be unavailable, the UI must say so.
6. **No emoji.** HUD glyphs (`◈ ✦ ◆ ⚙ ✓ ⚠`) only.

---

## The shared rubric

Every verdict reports all seven. Same table, same order, so results are comparable across sessions.

| # | Dimension | How measured | Bar |
| :--- | :--- | :--- | :--- |
| R1 | **Grounding** | hand audit, all 5 samples, incl. F1–F3 | **zero fabrications — one fails the candidate** |
| R2 | **Determinism** | N=5 repeats per sample; claim-set stability | no claim appears in <100% or >0% of runs inconsistently |
| R3 | **Reach** | does output state domain + counts + span + suited-for? | must beat D65 to justify existing |
| R4 | **Cost** | calls × tokens per synthesis; Cloudflare neurons | ≤ ~2× current (~14 neurons/call) |
| R5 | **Authoring burden** | human-written assets required | stated honestly, incl. per-new-dataset-shape cost |
| R6 | **Portability** | does it survive a provider swap? | must work on both Ollama and Workers AI |
| R7 | **Coverage** | fraction of arbitrary datasets it can say something useful about | stated, not assumed |

## The rig

```
make ollama-start          # OLLAMA_URL=http://100.126.157.97:11434, qwen2.5-coder:14b (Makefile L88)
npm run eval:synthesis     # the D40 gate — MUST stay green, same threshold, same exit code
```

**Status (2026-07-26):** Ollama is reachable and running (`qwen2.5-coder:14b`). The five §14
samples (`titanic`, `weather`, `stock_prices`, `product_reviews`, `ecommerce`) are ready.
[01-phrase-library.md](01-phrase-library.md)'s implementation plan is fully designed but unrun —
all design decisions are made, the blocker (unreachable Ollama) is resolved, and the next session
can start building immediately.

- **Use Ollama for all iteration.** It is free and unmetered; the Workers-AI shared free pool is
  account-wide and exhaustible (it was exhausted on 2026-07-26 by the probe runs, which is what
  makes this folder urgent). Confirm on Cloudflare only once a candidate passes on Ollama.
- **Extend [`eval/synthesis/run.ts`](../../../eval/synthesis/run.ts)**, which already has a
  prompt-variant axis and an `__ollama` leg via injected `fetchImpl`. Do not write a new harness.
- Reuse the real seam functions: `parseModelAnswer`, `sliceFromAnswer`
  ([`edge/ai/synthesisProvider.ts`](../../../edge/ai/synthesisProvider.ts) L117/L155) and both
  validators. Write results to a **new** `*-RESULTS.json`; never overwrite an existing one.
- **Samples:** Five §14 fixtures in `public/samples/*.csv` are the default (`titanic`, `weather`,
  `stock_prices`, `product_reviews`, `ecommerce`). Additional datasets may be added for breadth,
  but the five are sufficient to validate any candidate against F1–F3 and all rubric dimensions.
  Hand-audit every claim against both the payload and the source CSV.

## Folder structure and import discipline

Each approach gets an **isolated eval-scoped folder**, named by approach number:

```
eval/01-phrase-library/          ← approach-specific harness, prompts, assets
├── run.ts                       ← harness runner (imports from existing code)
├── selection.ts                 ← prompt builder, parser, validator (NEW)
├── capabilityPhrases.ts         ← hand-authored phrases (NEW)
└── RESULTS.json                 ← output (new file, never overwrite existing)

src/lib/datasetCapabilities.ts   ← if the approach adds PRODUCT code (reusable)
src/lib/datasetCapabilities.test.ts
```

**Import discipline:**

- Reuse everything that already exists: dataset loader, eval engine, `StructuralFacts`, profiling, seam validators, type definitions
- Write only what's approach-specific (new prompt logic, phrase library, capability detection)
- If you add product code (like `datasetCapabilities.ts`), it's a real deliverable worth keeping even if the approach loses
- Write results to a **new** `*-RESULTS.json` in the approach folder; never overwrite `SYNTHESIS-EVAL-RESULTS.json`

**Do not:**
- Edit `_implementation/`, `DATASCOPE.md`, or the Decision Record
- Ship anything from this folder to users (it is ideation, not product)
- Create a new harness when extending an existing one is cleaner

## Running one isolated session

One approach per session, cold. Paste:

> Read `_implementation/_misc/_ideation/ai architecture experimentation/README.md` and then
> `<NN-approach>.md`. Build only that approach's "What to build" in an isolated `eval/<NN-name>/`
> folder, importing from existing code, not copying or rewriting it. Run on Ollama with N=5 repeats
> against all five samples, hand-audit every claim against the payload and the source CSV, and
> append a Verdict section to that doc reporting all seven rubric dimensions. Do not edit master,
> the Decision Record, or any other approach doc.

---

## The candidates

| Doc | Approach | Attacks | Who writes the words | First read |
| :--- | :--- | :--- | :--- | :--- |
| [01](01-phrase-library.md) | **Capability-keyed phrase library** — app authors phrases, model selects | F2, F3 | human, model picks | the probe doc's own "answer 2" |
| [02](02-generate-then-verify.md) | **Generate then verify** — free prose, post-hoc grounding check | F2, F3 (**not F1**) | model | documented mainly to show its hole |
| [03](03-clause-citation-binding.md) | **Per-clause evidence binding** — every clause cites the fact it came from | **F1, F2, F3** | model, bound | the sharpest fix to the actual gap |
| [04](04-model-as-editor.md) | **Model as editor** — app writes the paragraph, model may only smooth it | F1, F2, F3 | app, model polishes | cheapest mechanical verification |
| [05](05-offers-not-claims.md) | **Offers, not claims** — emit questions wired to queries, not statements | dissolves all three | either — the *form* changes | strongest product-shape move |
| [06](06-schema-constrained-slots.md) | **Constrained decoding into typed slots** — invalid output unrepresentable at decode time | F2, F3 | closed vocabulary | needs a platform check first |
| [07](07-diagnostics.md) | **Instruments** (not candidates) — N-sampling variance + opaque-schema ablation | measures F3, F4 | n/a | run alongside any of the above |
| [08](08-computed-facts-with-data.md) | **Computed facts + data access** — app computes real stats, model narrates with citations (**lifts Invariant 1**) | **F1, F2, F3** | model, citation-bound to app-computed facts | combines 03's citation check with richer, data-derived facts |
| [09](09-llm-cognition-data-alignment.md) | **Cognition & data alignment** — measure which mode the model is in (narrate / reason / pattern-complete), then design the input for it | the root cause under F1–F3 | n/a — an instrument plus a prompt redesign | 08's post-verdict critique |
| [10](10-grounding-ladder.md) | **The grounding ladder** — consolidation. Row ladder × opaque-schema ablation × fact corruption, scored **per panel slot and per claim class** against a pre-written answer key, across three surfaces (panel, NL→SQL, offer execution), under a local-tier-only Invariant 1 override | reading-vs-recall, plus which architecture each *slot* ships | n/a — decides what the input is, then what fills each slot | this README, then 08's verdict, then 09 |

**If you only run three:** [05](05-offers-not-claims.md) (may dissolve the problem outright and
reuses existing `RankedAction` infrastructure), then [03](03-clause-citation-binding.md) (the only
one that catches F1), then [04](04-model-as-editor.md) (verification is a set-inclusion check, so it
either works or it doesn't within an hour). Run [07](07-diagnostics.md)'s N-sampling alongside
whichever you pick — R2 is not optional.

**Superseded by 10 (2026-07-28).** With 03 and 08 both run and the privacy constraint lifted for
the local tier, the open question is no longer which mechanism to pick — it is whether the model
reads the data at all. [10](10-grounding-ladder.md) folds 01's `detectCapabilities`, 02's closure
discipline, 03's citation check, 04's editor architecture, 06's decode-time constraint, 07's two
instruments, 08's computed facts, and 09's corruption probe into one two-phase pass. Run it before
starting any remaining single-candidate session. Note the run-one-session prompt above still names
the folder's old path (`ai architecture experimentation`); it is now `_experiments/`.

## Already rejected — do not spend a session on these

| Idea | Why not |
| :--- | :--- |
| **A better prompt** | Tried, twice (`widened-v1`, `widened-v2`), on three providers. F1/F2/F3 are contract-level, not wording-level |
| **Send rows** | Answered and closed. Rows made the one real gap (date range) *worse* — a prefix sample skews, and a model eyeballing an aggregate from a row dump is not computing it. Also reopens D20/D45/D46/D59 for no gain |
| **Bigger model / more context** | Tried to the model's actual ceiling. F3 came from the *most* context, and a 14B produced the cleanest fabrication (F2) |
| **Model self-reported confidence gating** | Uncalibrated, and D40 forbids surfacing an unearned number |
| **Fine-tuning** | Cannot reduce fabrication to zero, cannot be verified per-claim, and is impractical on Workers AI |

---

## Correction to a related note (2026-07-26)

An operational follow-up added to the probe doc earlier today described the quota-exhaustion path
as the *client* swallowing a typed error code. **That was wrong, and the truth is worse.** Verified:

- `SynthesisErrorCode` is only `'bad-request' | 'rate-limited' | 'paused'`
  ([`edge/protocol.ts`](../../../edge/protocol.ts)) — there is **no** exhaustion code in the
  synthesis contract at all. `pool-exhausted` belongs to the sibling `ai-router` endpoint.
- On any provider failure, including the Workers-AI ceiling,
  [`edge/handlers/synthesis.ts`](../../../edge/handlers/synthesis.ts) L110's `catch` returns
  **HTTP 200 with the baseline echoed back** (counter: `degraded`).
- So the client's `res.ok` is **true**, `validateSlice` compares the echoed baseline against itself
  and **passes**. The client concludes the AI ran successfully and had nothing better to say.

This is why every `composedHeadline` in `SYNTHESIS-EVAL-RESULTS.json` is byte-identical to its
`baselineHeadline`: not a client bug, a **server-side design choice that makes "AI unavailable"
indistinguishable from "AI agreed with the baseline"** — including to the eval harness, which
scored 0% without being able to say why. Fixing it needs a new typed code (or a flag on
`SynthesisResponse`) on the **server**, not just a client change. Filed here because it lands on
whichever architecture wins: **all seven candidates need an honest unavailable state**, and
invariant 5 above is therefore not free for any of them.
