# 10 — The grounding ladder

**Thesis:** 08 proved the *mechanism* (compute facts deterministically, bind every claim to one
fact) and left three things open that 09 sharpened into a question worth one experiment:
**does the model actually read the data you give it, or does it recall?** With the privacy
constraint lifted for the local tier and the scope narrowed to one table that fits in context, that
question is finally answerable — and answering it decides whether every downstream design here
sends rows or doesn't.

**Amendment (2026-07-28) — the unit of measurement is the slot, not the paragraph.** 01–09 all
scored "the synthesis output" as one undifferentiated blob of prose. The thing that actually ships
is the **S6 synthesis panel** ([`SynthesisPanel.tsx`](../../../../src/features/map/SynthesisPanel.tsx)),
which is five slots with five different provenances, five different failure modes and five
different legal authors. Scoring them as one number cannot tell you that rows helped Behavioral
Trends and did nothing for the header counts — which is almost certainly the real result. This doc
therefore does three things at once, and the third is what makes it a standard rather than an
experiment:

1. **Measures** reading-vs-recall (the row ladder — unchanged, still the axis).
2. **Scores per slot and per claim class**, so the verdict is a shipping decision per surface
   rather than a research finding about "the model."
3. **Fixes the target artifact** — the panel decomposed into a claim-level answer key
   (`PANEL-KEY.json`), so every arm diffs against the same specification instead of a hand audit
   re-derived per session.

This also settles the 05-vs-10 question that keeps resurfacing. They are not rivals: **the ladder
is the axis, the slot is the unit, and the claim class picks the architecture.** 05 ("offers, not
claims") is the ship answer for the offers slot and for the interpretive residue in the header;
it does not have to win or lose globally, and this pass measures it rather than arguing about it.

**Status:** harness built (2026-07-28); **first live invocation attempted 2026-07-28 and produced
zero completed calls** — see "First run attempt" under "Ollama run" below. `panelSchema.ts`,
`slotFacts.ts`, `variants.ts`, `assemble.ts`, `scorePanel.ts`, `opaque.ts`, `corrupt.ts`, `run.ts`
exist under `eval/claude/10-grounding-ladder/` and typecheck/lint clean (`npx tsc -p eval/tsconfig.json
--noEmit`, `npx oxlint eval/claude/10-grounding-ladder/`); `npm run eval:grounding-ladder` has now been
invoked three times against the live rig and every attempt ended in a transport failure before any
panel was scored, so `RESULTS.json` still does not exist and no verdict in this doc has moved.

`PANEL-KEY.json` was generated for real against all five §14 fixtures via `verifyStats`'s gate
(`npm run eval:grounding-ladder:key`), but only its C1 (rowCount, temporal-span) and C3 (duplicate
rows, zero-variance columns) entries are populated — see "The answer key is the standard" below for
why C2/C4 stayed empty. `runChat.ts` and `runOffers.ts` (the other two measurement surfaces) are
now built — `run.ts` stays the panel arm only; its own offers-slot handling is structural
compliance only (does the model return the ranker's exact ids, does each verb clear the phrasing
guard), never SQL execution, which is `runOffers.ts`'s job. **06's platform check ran (2026-07-28,
throwaway script, see "06's platform check — result" under "Ollama run" below): holds on a 2-id enum
with 0/3 violations, but the run's own unconstrained baseline also complied, so it isn't yet proven
load-bearing** — and it surfaced a real `num_ctx: 32768` stability risk on this rig, independent of
the enum question; `run.ts` does not apply 06's constrained decoding (kept as a documented future
enhancement, not re-tested here). **Cost class:** moderate build (one new harness, two arms of an
existing one), cheap at runtime (local Ollama, free). **Scope:** two phases with a gate between
them. Phase 1 measures reading-vs-recall. Phase 2 tests who does the selecting. Do not start
phase 2 before phase 1 has a verdict.

**Rig-independent pass (2026-07-28) — handoff items 1–5 are done, and one arm has a real
result.** Everything in the handoff below that needed no model call has landed: the cold-load
warm-up and explicit `keep_alive` (now in a shared `ollamaRig.ts`, so the panel and chat arms
cannot drift on `num_ctx`), `runOffers.ts` and `runChat.ts`, the chat path's missing `edges`, and
both phrasing-guard changes. **The offers arm ran for real and passes kill criterion (l) — and
found something the doc did not anticipate:** see "Offers arm — result" below. The chat arm is
built but unrun (it needs the rig); the panel arm still has zero scored panels. **Seven judgement
calls are owed to a human and are listed in "Open human calls" below — three of them are answerable
today and do not wait on the rig.**

---

## The policy change this experiment runs under

Invariant 1 (rows-free wire boundary, D20/D45/D46/D59) is **suspended for the local tier only** —
in-browser WebLLM and localhost Ollama, where no byte leaves the device — behind an explicit
opt-in disclosure the user enables. This is a deliberate, scoped override for experimentation,
not a repeal:

- **Cloud and BYOK are untouched.** D72 already governs the hosted path (graduated, hard-capped,
  transmit-only row sample, disclosure precedes egress, never the whole dataset). Nothing in this
  experiment changes that, and no result here licenses changing it. BYOK is *not* local — "we
  don't train on it" is a contract, not a technical barrier.
- **Invariants 2–6 stand unchanged.** Score through the product's own validators (D58). No tab
  choice by the model (D55). No unearned accuracy number (D40). Honest unavailable state. No emoji.
- **The disclosure is load-bearing, not decoration.** If the ladder wins, the shipped surface needs
  a real consent gate before it sends a single cell, and the local-only claim must be technically
  true at the point it is made (see [webllm.ts](../../../../src/services/webllm.ts) — zero egress
  after shard caching — and the Ollama endpoint, which is localhost by configuration, not by
  guarantee).

The scope narrowing — **one table whose rows fit in the model's context** — is what makes this
tractable. Larger-than-context is a separate design round; see "Designing so the big round isn't a
revamp" below, which is a seam note, not a plan.

---

## What this folds in from 01–09

| From | Take | Leave |
| :--- | :--- | :--- |
| **01** phrase library | `detectCapabilities` ([`src/lib/datasetCapabilities.ts`](../../../../src/lib/datasetCapabilities.ts)) as a fact source — it supplies the "suited for" clause no statistic reaches, and it is already shipped product code | The hand-authored phrasings. That is 01's R5 burden, and the model does wording here |
| **02** generate-then-verify | The `CLOSURE_RULES` discipline — enumerated, exported, logged, **length reported as a result**. 08 already built this as `derivableFrom` (3 rules) | The global token check. It validates against the whole payload, which is exactly why it cannot catch F1 misattribution |
| **03** clause citation binding | The whole mechanism, unchanged. It is shipped at [`src/lib/citableFacts.ts`](../../../../src/lib/citableFacts.ts) and is the guard rail that makes sending rows survivable | Nothing. 03 is the control arm |
| **04** model as editor | The architecture, as a **phase 2 arm**. 08's own post-verdict critique concludes the R2 + fact-dump failures are one failure, and that the fix is deterministic selection with the model reduced to wording — which is 04. Still unrun | Nothing. This is the most valuable unrun doc in the folder |
| **05** offers not claims | **Promoted into phase 1** by the slot framing: its offers slot is the third measurement surface (execute-to-verify), and its central argument is what the C4 residue count decides. Still also a phase-2 output-shape variant | The framing that it competes with the other candidates — it competes for *slots*, not for the whole panel |
| **06** schema-constrained slots | **Run the platform check first, it is 20 minutes.** Ollama supports a JSON-schema `format` parameter; if it holds, the `cites` field's enum becomes the live fact-id set at decode time and an invalid citation is unrepresentable rather than post-hoc rejected | Don't build the full candidate. Apply it to 08's existing JSON shape |
| **07** diagnostics | **Both instruments, mandatory.** D1 (N-sampling variance) because R2 is not optional. **D2 (opaque-schema ablation) because it is the other half of 09's probe** — see below | Nothing |
| **08** computed facts + data | `computeStats.ts` (~20 fact kinds), `verifyStats.ts` (the pre-flight gate that caught 2 of 4 live bugs before any model call), `sampleLeakCheck.ts`, `enrichedFacts.ts`, the row-ladder rung design, the `num_ctx` amendment | The sprawl. Custody tiering and exhaustive-vs-curated stay parked; this doc tests one question |
| **09** cognition & alignment | The corruption probe (conditions A/B/C) and the "data reporter" role-constraint prompt | Condition D (negated). It is condition B with a larger delta and buys one cell's worth of information for a cell's worth of cost |

### The load-bearing synthesis: 09's probe and 07's D2 are the same question from two sides

09 asks: corrupt a fact, does the model report the corrupted value (reading) or the true one
(recall)? 07's D2 asks: strip the schema of meaningful names, does output quality collapse
(reading) or survive (recall)?

Run alone, each has an escape hatch. Corrupt titanic's mean fare and the model may report the true
value because it *knows the Titanic*, not because it ignored your prompt — you'd read that as
"model overrides data" when it's really "model recognized the dataset." Opaque-ify the schema alone
and you lose the ability to tell whether a degraded answer means the model stopped reading or just
lost useful column-name priors.

**Crossed, they close each other's hatch.** Under OPAQUE + CORRUPTED there is no recall to fall
back on: the model has no idea it's looking at the Titanic, so whatever value it states came from
the prompt or from nowhere. That cell is the sharpest single measurement in this folder, and
neither 07 nor 09 specifies it, because neither knew about the other.

---

## The measured artifact: the S6 panel

Every cell in this experiment emits **the panel**, not a paragraph. The panel is already built and
already has a shape, so the experiment inherits its slots rather than inventing a scoring scheme.

### Slot inventory — what ships, what the target mock-up wants, what backs it

| Panel slot | Renders today ([`SynthesisPanel.tsx`](../../../../src/features/map/SynthesisPanel.tsx)) | The mock-up wants | Fact source that exists | Class |
| :--- | :--- | :--- | :--- | :--- |
| **Header** (`AiSynthesisCard`) | one `FactRef.statement` — the deterministic Verdict headline, replaceable by the D56 seam | domain guess + two counts + date span + "well-suited for CLV/churn/seasonality" | `fact:<t>.rowCount` and `fact:<t>.<col>.dateRange` ([`citableFacts.ts`](../../../../src/lib/citableFacts.ts) L244/L271). **`domain-guess` is a declared `ComputedFactKind` with no builder**; "suited for" has no fact at all | **C1** + **C4** |
| **Suggested Explorations** | `rankNextActions(...).slice(0, 3)` — deterministic, **no model involved today** | same three offers | `RULE_ROUTES` + generic fallbacks ([`capabilities.ts`](../../../../src/lib/capabilities.ts) L343) | **C5** |
| **Structural Patterns** | insights filtered to `null-pattern`, `id-exclusion`, `concentration`; cap 5 | Time-Series Detected · Category Skew · Format Match (99.8% email) | `concentration` ✓. `trend`/`temporal-span` exist **only in eval** (`computeStats.ts`). **Format Match has no source anywhere** | **C2** |
| **Data Quality & Health** | **does not exist** — the shipped panel has two finding columns, not three | nulls + outliers + "Health Checks Passed" | `null-structure` ✓, `outlier` ✓ (eval-only). **"checks passed" has no source anywhere** | **C2** + **C3** |
| **Behavioral Trends** | insights filtered to `change-point`, `outlier-group`, `leakage`, `duplicates`; cap 5 | Seasonality (weekday/hour) · Correlation Signals (+0.42, with a cohort interpretation) | `seasonality` ✓ and `correlation` ✓ — **in `ComputedFactKind`, absent from `InsightRuleId`** | **C2** + **C4** |

Four things fall out of that table that no prior doc in this folder states:

- **The product fact vocabulary and the eval fact vocabulary have diverged.** `InsightRuleId` has
  **7** rules ([`insights.ts`](../../../../src/lib/insights.ts) L18); `ComputedFactKind` has **21**
  ([`computeStats.ts`](../../../../eval/claude/08-computed-facts/computeStats.ts) L25). The panel renders
  `InsightCandidate`s, so 08's richer facts — seasonality, correlation, variance-explained,
  referential integrity — **reach nothing on screen today.** Any arm that wins here needs that
  bridge built, and it is not a prompt change.
- **`domain-guess` is declared and never minted.** 20 of the 21 kinds have a builder; that one is a
  type-union entry only. The mock-up's opening clause ("This appears to be an E-Commerce dataset")
  is therefore *unrepresentable*, not merely unverified — which is a cleaner answer than trying to
  ground it.
- **Format Match has no substrate at all.** `SemanticType` is five values
  (`Temporal | Quantitative | Categorical | Textual | Identifier`,
  [`schema.ts`](../../../../src/types/schema.ts) L3) — no format/regex layer exists. "99.8% matched
  Email Address" needs a new detection pass, not a new sentence.
- **The column split disagrees with the mock-up.** `duplicates` is routed to *Behavioral Trends*
  (`BEHAVIORAL_RULES`, L160) while the mock-up reads duplicate-checking as Data Quality. The
  answer key forces this to be resolved rather than left to whoever writes the next component.

### The claim-class taxonomy

Decompose the mock-up and five classes fall out. Each has a **different check mechanism** and a
**different legal author** — which is the whole reason one global fabrication count was never going
to be actionable.

| Class | Examples from the mock-up | How it is checked | Who may author it |
| :--- | :--- | :--- | :--- |
| **C1** counts / spans | "10,420 customers", "45,092 orders", "January 2021 to January 2024" | **byte-equality** against the computed value | **app only** — the model never authors a C1 |
| **C2** computed-fact restatement | "84% of rows are DELIVERED", "12 Nulls in customers.email", "Max $2,450 vs Median $45", "+0.42" | cited fact exists **and** every stated value is in that fact's value set or `derivableFrom` it under `CLOSURE_RULES` | model, citation-bound (03/08 mechanism, unchanged) |
| **C3** negative / absence | "No duplicate rows detected", "No zero-variance columns" | requires an **exhaustive** check; no curated fact can express it | **app only** — see the new `check-passed` fact below |
| **C4** interpretive | "appears to be E-Commerce", "well-suited for CLV", "Older cohorts exhibit steadily increasing order values" | **no data check exists, by construction** | 05 territory: convert to an offer, or drop |
| **C5** offers | the three Suggested Explorations | **execute the SQL** — it runs and returns rows, or the offer dies | model selects / orders / verbs |

C1, C2, C3 and C5 are all **auto-scorable**. Only C4 needs a human, and C4 is precisely the class
05 argues should not exist. That is the collapse that makes this affordable: the hand audit shrinks
from "every claim in every run" to "the C4 residue", which is a handful of sentences per cell.

### Two guard gaps this taxonomy exposes, both live in shipped code

- **The phrasing guard does not catch C4.** (Instrumented since 2026-07-28 by an unshipped second
  guard — see the architecture-changes bullet below.) `FORBIDDEN_PHRASING`
  ([`producerValidators.ts`](../../../../src/lib/producerValidators.ts) L49) bans
  *always / never / because / causes / due to / leads to / drives*. The mock-up's two most
  interpretive sentences — "Orders **consistently peak** on Tuesdays" and "Older cohorts **exhibit
  steadily increasing** order values" — clear it **clean**. The guard blocks causal *vocabulary*,
  not unhedged generalisation, and the panel's Behavioral column is exactly where unhedged
  generalisation lives.
- **`RankedAction.verb` was unguarded — fixed 2026-07-28.** `rankedActionValidator` compared the
  identity multiset of `{module, tab, prefill, evidence, score}` and **never called
  `passesPhrasingGuard`**, so the one free-text field the model is allowed to write on the offers
  path had no honesty check on it at all. 05 flagged it; it now rejects a candidate set whose any
  verb trips the guard. The hole is closed *before* the offers slot is where C4 gets pushed, which
  is the order that matters.

---

## Three measurement surfaces, one substrate

Everything 01–09 measured is the **synthesis** path — prose, hand-audited, expensive to score, no
ground truth. The **chat / NL→SQL** path measures the same underlying question with an objective
oracle that already exists and nobody in this folder has used:

[`eval/harness/`](../../../../eval/harness/) — 58 labeled questions across the five §14 fixtures,
scored by [`scorer.ts`](../../../../eval/harness/scorer.ts) on exec-rate, **result-correctness by
execution-match** (order-insensitive, numerically rounded — a differently-shaped equivalent query
still scores correct), and repair-rate. Provider-agnostic. `npm run eval`.

So: **run all three surfaces on the same prompt-assembly variants.**

| | Panel arm (was: synthesis) | Chat arm | Offers arm |
| :--- | :--- | :--- | :--- |
| What varies | Prompt assembly (rows, facts, schema legibility) | The same | The same |
| What's measured | Per-slot, per-class: C1 equality, C2 citation+closure, C3 occurrences, C4 residue | Exec-rate, result-correctness, repair-rate | Does every surfaced offer's SQL run and return rows |
| Ground truth | **Yes** — `PANEL-KEY.json`, except C4 | Yes; `referenceSql` execution | Yes; execution |
| Cost to score | Free for C1/C2/C3; hand audit only the C4 residue | Free, instant | Free, instant |
| Weakness | C4 still needs a human | Doesn't measure prose grounding at all | Measures runnability, not usefulness |

The chat arm is the cheap oracle. If sending rows lifts result-correctness, that is a hard number
nobody has to hand-audit, on the surface users actually touch. If it lifts result-correctness while
*worsening* panel grounding, that is a genuinely interesting result and it means the two paths
want different prompt assemblies — worth knowing before either ships.

The **offers arm** is new here and is 05's kill criterion (b) promoted to a standing instrument: an
offer whose SQL errors or returns zero rows is that path's version of a fabrication, and it costs
nothing to detect. It matters because `rankNextActions` is deterministic today — the offers slot is
the one place where "no model at all" is already the shipped answer, so it doubles as the control
for whether letting a model near the panel buys anything.

**Chat-path finding, now fixed (2026-07-28).**
[`AIChatModule.tsx`](../../../../src/features/ai/AIChatModule.tsx) called `askAI` without `edges`,
so the FK-neighbour pull in [`schemaPrune`](../../../../src/lib/schemaPrune.ts#L67) was dead code
on the chat path and relationships never reached the model. It now reads the override-applied edge
set the same way `ExplorerPanel` and `Inspector` already do (`useInferredEdgesStore` +
`applyOverrides`, no second `loadRelationships` query) and passes it through. Note the chat arm as
scoped below runs only single-table fixtures, so this fix does not change what the arm measures —
it changes what the shipped chat surface can answer, which is why it was worth landing on its own.

### Chat arm scope, as built (2026-07-28): A1 only

`runChat.ts` drives the 34 labeled questions on the three single-table fixtures through the
product's own `askAI` at each of the four rungs, N=3, scored by the existing `eval/harness/scorer.ts`
— no second scoring path (D58). **It varies A1 and nothing else, deliberately.** A2 (OPAQUE) would
anonymize the table and column names the emitted SQL has to use, so every OPAQUE cell would score
zero for a reason unrelated to reading-vs-recall; A3 has no purchase because this path cites no
computed facts. Both stay panel-arm axes, and the verdict must say so rather than implying the chat
arm swept the same cross. The rig's `num_ctx`/`keep_alive` are injected into every request and
Ollama's own `prompt_eval_count` is read back per call, so kill criterion (b) is asserted on this
arm too, not just the panel arm.

### Offers arm — result (2026-07-28, no model involved)

`npm run eval:grounding-ladder:offers`, all five §14 fixtures, `verifyStats` gate applied as on the
panel arm. **Kill criterion (l): PASS — 8 of 8 executable offers ran and returned ≥1 row, 0 errors,
0 empty results, and every verb cleared the phrasing guard.**

**The finding the doc did not anticipate: 16 of the 24 surfaced offers carry no SQL at all.** A
`RankedAction`'s only query is its `evidence.sql`, and a schema-provenance `FactRef` carries `sql:
''` by contract — it is read off the registry, never queried. So the generic capability-routing
fallbacks ("Profile titanic", "Inspect the distribution of Age", "Break down the data by City")
are backed by nothing executable. That is not a fabrication and it is not scored as one, but it
means **"every surfaced offer executes" is a much weaker guarantee than kill criterion (l) sounds**:
two-thirds of the offers a user sees today are outside its reach entirely. `ecommerce` — the
fixture the mock-up is drawn from — surfaces five offers and **none** of them is executable.

Per fixture: `stock_prices` 5/5 executable and ok; `titanic` 1/4; `weather` 1/5; `product_reviews`
1/5 (its one executable offer is the duplicate-rows probe, which returns rows — see the answer-key
note below); `ecommerce` 0/5. Whatever wins the C5 slot, the incumbent it has to beat is a ranker
whose offers are mostly unfalsifiable, and that is a fair criticism of the incumbent, not of the
measurement.

---

## Phase 1 — does the model read, or recall?

Mechanism held **fixed** at 08's design (computed facts + citation binding, `verifyStats` as a
hard pre-gate). Three axes vary.

**The output contract is the panel object, not `{claims:[…]}`.** 08's prompt asks for a flat claim
list ([`prompt.ts`](../../../../eval/claude/08-computed-facts/prompt.ts) L42) and gets back an
undifferentiated pile the harness then has to interpret. Replace it with the shape the UI actually
consumes:

```jsonc
{ "header":     { "text": "...", "cites": ["stat:..."] },
  "structural": [ { "text": "...", "cites": ["stat:..."] } ],   // ≤ 3
  "quality":    [ { "text": "...", "cites": ["stat:..."] } ],   // ≤ 3
  "behavioral": [ { "text": "...", "cites": ["stat:..."] } ],   // ≤ 2
  "offers":     [ { "actionId": "act:...", "verb": "..." } ] }  // exactly 3, ids from the ranker
```

Same citation contract per item, same `checkCitationWithClosure` per item — but now every item
arrives pre-labelled with the slot it belongs to, so slot misassignment becomes measurable and the
per-slot ladder curves come out of one pass. The caps are part of the contract: 08's kill criterion
(i) was a 38-claim fact dump, and a schema that cannot express 38 claims cannot fail that way.

**A1 — rows sent:** `0 / 10 / 100 / max-that-fits`
**A2 — schema legibility:** `CLEAR` (real names) / `OPAQUE` (`table_a`, `col_1…col_n`, 07's D2)
**A3 — fact integrity:** `TRUE` / `CORRUPTED` (one value altered, id unchanged) / `DELETED` (fact absent)

Full cross is 24 cells and unjustified. The pruned design, ~10 distinct cells per dataset:

| Block | Cells | Question it answers |
| :--- | :--- | :--- |
| Row ladder | A1 ∈ {0,10,100,max} × CLEAR × TRUE = **4** | Does more data help, hurt, or do nothing? |
| Recall ablation | A1 ∈ {0,max} × OPAQUE × TRUE = **2** | How much of the output was ever about *this* data? |
| Anchor probe | A1 ∈ {0,max} × CLEAR × {CORRUPTED, DELETED} = **4** | Does the prompt win over training priors? |
| **The crossed cell** | A1 = max × OPAQUE × CORRUPTED = **1** | Reading vs. recall, with no escape hatch |

**Fixtures:** `titanic` (891 rows, ~13k tokens — fits) and `product_reviews` (520, ~11k — fits) are
the in-scope pair. `stock_prices` (~37k — does not fit) runs the ladder block only, as the ceiling
control: it shows what happens when "max-that-fits" is genuinely a fraction.

**N is no longer uniform, because auditing is no longer the constraint.** N=5 existed to keep the
hand audit affordable; with C1/C2/C3 auto-scored against the key, repeats cost wall clock and
nothing else — and R2 is the dimension every prior doc reports on statistics too thin to support
it (F4: one identical input produced F3 once and the correct refusal the next call).

- **Ladder block, N=20** — 4 rungs × 2 in-scope fixtures = **160 calls**. These are the cells R2 is
  read off, and 20 repeats put a real interval on identical-headline rate instead of a fraction
  over five.
- **Everything else, N=5** — 7 remaining cells × 2 fixtures = **70 calls**, plus `stock_prices`'
  ladder-only ceiling control at 4 × 5 = **20 calls**.

**250 panel calls** total. The panel object is longer than a paragraph, so budget ~30s/call on the
M4 (≈2 h), plus the chat arm at 34 questions × 4 rungs × N=3 = **408 chat calls** (≈2 h,
auto-scored, no audit), plus the offers arm which is SQL execution and effectively free.
**Roughly 4 hours of wall clock, unattended** — up from 3, and the extra hour buys R2 a confidence
interval rather than an anecdote.

### Non-negotiable rig detail

**`num_ctx` must be set explicitly on every call and the actual prompt token count recorded per
run.** 08's own amendment (2026-07-27) established that no code in this repo sets it, that
[`probe-narrative.ts`](../../../../eval/synthesis/probe-narrative.ts) sized its row sample to the
HTTP body cap in *bytes* with no token accounting, and therefore that the prior "F3 came from the
max-context 891-row run" finding proves 891 rows were **transmitted**, not attended to. This whole
experiment is about context; a run that silently truncates measures nothing. Ollama truncates
quietly — assert the recorded prompt tokens against `num_ctx` and fail the run, don't warn.

Practical note for the M4: a 14B q4 model with a 32k KV cache is a real memory commitment. Verify
the context actually holds under load before trusting a full pass, and record `num_ctx`,
`prompt_eval_count`, and rows actually sent in every record.

### Fixed choices, not axes

- **Encoding: column-oriented / TSV for row blocks, not row-JSON.** Row-JSON repeats every key on
  every row and runs ~3x the tokens for identical information. Record the measured saving; run one
  side-probe cell (max-fits, CLEAR, TRUE) in row-JSON to confirm comprehension didn't drop with the
  key names. If it did, that is a finding, not a reason to redesign the pass.
- **Fact set: curated**, as 08 shipped it. Exhaustive-vs-curated stays parked.
- **The `derivableFrom` closure list stays at 3 rules** and its length is reported. Growing it to
  make results look better is the failure mode 02 exists to warn about.

### What phase 1 decides

**Every outcome below is read per slot, and the slots are allowed to disagree.** "Rows help" is not
a finding this experiment can produce; "rows lift Behavioral C2 grounding, do nothing for Structural,
and inflate the C4 residue in the header" is. A single global curve would average exactly that
signal away — which is what 01–09 did.

Read first, because it is cheap and decides the shape of everything after it:

- **C1 disagreement rate.** If any arm at any rung emits a count or span that differs from the
  computed value, the header's counts come off the model permanently and the debate is over —
  it is one equality check, not a judgement call.
- **C3 occurrence count.** Any model-authored absence claim is a fabrication *regardless of whether
  it happens to be true*, because the model cannot have performed an exhaustive check. If this is
  non-zero at rung 0, more rows will not fix it.
- **C4 residue per rung.** The interpretive sentence count is 05's actual decision input. If the
  residue is small and the phrasing guard rejects most of it, 05 is unnecessary for the header; if
  it grows with rows, the model is using row exposure to editorialise, which is the worst outcome
  on this axis and a direct argument for 05.

Then the ladder itself:

- **Fabrication flat or falling as rows rise, on all three surfaces** → the citation check holds under
  row exposure, rows earn their place, phase 2 runs at the winning rung.
- **Fabrication rises with rows** → this reproduces the original probe finding, the sample is not
  inert, and the row-sending premise dies here for the price of one afternoon. Phase 2 runs at
  rung 0 and the product answer is "computed facts, no rows."
- **OPAQUE collapses output quality** → the model was reading. Good; grounding is real.
- **OPAQUE barely changes output** → most of what you were reading as grounding was recall, and
  every prior result in this folder needs re-reading in that light. **Say this loudly if it
  happens** — it re-scopes 01–09.
- **CORRUPTED: model states the true value, not the corrupted one** → training priors are beating
  your prompt. Citation binding is a speed bump. This is the single most important thing this
  experiment can find, and 09 is right that nobody has looked.

---

## Phase 2 — who selects?

Gated on phase 1. 08's post-verdict critique is unambiguous: R2 (identical-headline rate ≈0.2) and
kill criterion (i) (the 38-claim ecommerce fact dump) are **one failure, not two** — the model is
doing *selection*, not narration, and a richer fact table gives it strictly more freedom to vary.

**Confound to head off before this phase runs.** Phase 1 now ships slot-scoped fact tables, which is
already a weak form of arm 2 — the candidate set is partitioned before the model sees it. So arm 1
is no longer "08 as-built", and arm 2 must be defined as **ranking within a slot's partition**, not
ranking across the whole table. Stating it any other way makes arm 2 look like it won when what
actually won was the partition, which phase 1's control already has. Report the phase-1 slot-scoped
R2 as arm 1's baseline, not 08's global 0.2.

Three arms at the rung phase 1 picked:

1. **Free selection within each slot's partition** — control (phase 1's own candidate arm).
2. **Deterministic top-N selection + narrate, within each slot.** Rank that slot's computed facts in
   code by the eventfulness signals 08 already computes as first-class facts (outlier count,
   concentration, group separation, variance-explained magnitude), take the slot's cap, model
   narrates only those. The claim cap is already in the panel schema.
3. **Model as editor (04).** App composes each slot's text from selected facts; model may only
   smooth wording. Verification is a set-inclusion check on content words.

Plus 09's **role-constraint prompt** ("you are a DATA REPORTER, not an analyst") as a cross-cutting
variant on arms 1 and 2 — it costs one prompt string and tests 09's central hypothesis directly.

Measure R2 (identical-headline rate, cited-set overlap) and R3 (reach) primarily. The bet: arm 2 or
3 closes the determinism gap without giving up the reach 08 demonstrably won. If deterministic
selection closes R2 **and** holds R3, that architecture — not free narration from a large fact
table — is what gets formalized.

---

## What to build

```
eval/claude/10-grounding-ladder/                                                              [built 2026-07-28, unless marked]
├── assemble.ts        ← THE deliverable: budgeted prompt assembler (see below)
├── panelSchema.ts     ← the panel output contract + parser (replaces 08's flat {claims:[…]})
├── slotFacts.ts       ← ComputedFactKind → PanelSlot partition; builds one fact table per slot
├── PANEL-KEY.json     ← the answer key: every fixture's panel, claim by claim, class by class — C1/C3 only, see below
├── scorePanel.ts      ← diffs an emitted panel against the key; C1 equality, C2 closure, C3 count
├── variants.ts        ← the A1/A2/A3 cell definitions
├── opaque.ts          ← 07 D2 schema anonymizer (deterministic, reversible for audit)
├── corrupt.ts         ← 09 A/B/C fact-integrity variants; deterministic anchor fact, no RNG
├── run.ts             ← phase 1 driver (panel arm only); extends eval/08's runner, does not replace it
├── ollamaRig.ts       ← shared rig contract: num_ctx, keep_alive, cold-load warm-up, dispatchers
├── runChat.ts         ← chat arm; drives eval/harness's askAI at each rung (A1 only — see above)
├── runOffers.ts       ← offers arm; executes every surfaced offer's SQL — no model, runs rig-free
├── RESULTS.json       ← per-cell, per-repeat, per-slot, with num_ctx + prompt tokens + rows sent [3 attempts, 0 scored panels]
├── CHAT-RESULTS.json  ← per-rung exec/correctness/repair                                        [not run — needs the rig]
├── OFFERS-RESULTS.json ← per-offer execution + both guards' corpus counts                       [ran 2026-07-28]
└── README.md          ← findings                                                                [not built]
```

Plus, in product code because it is worth keeping regardless of the verdict:

```
src/lib/promptAssembly.ts   ← the assembler, if phase 1 validates it
src/lib/computedFacts.ts    ← eval/claude/08-computed-facts/computeStats.ts, re-homed
```

### The answer key is the standard

`PANEL-KEY.json` is what turns this doc from an experiment into a specification. One entry per
fixture, holding the panel as it *should* read, decomposed:

```jsonc
{ "ecommerce": { "slots": { "header": [
    { "class": "C1", "assertion": "customers.rowCount", "truth": 10420, "author": "app" },
    { "class": "C1", "assertion": "orders.order_date span", "truth": ["2021-01", "2024-01"], "author": "app" },
    { "class": "C4", "assertion": "domain = e-commerce", "truth": null, "author": "none — unrepresentable" },
    { "class": "C4", "assertion": "suited for CLV/churn/seasonality", "truth": null, "author": "offer (05)" } ],
  "quality": [
    { "class": "C2", "assertion": "customers.email nulls", "truth": 12, "citesKind": "null-structure" },
    { "class": "C3", "assertion": "no duplicate rows", "truth": true, "author": "app" } ] } } }
```

Truth values are computed from the source CSV by the same `verifyStats.ts` second-method path that
already gates the facts, so the key cannot drift from the data. Every arm's output diffs against
it; the diff *is* the result. Build the key **before** running anything — a key written after
seeing model output is a rationalisation, not a standard.

**Built-key gap (2026-07-28):** `buildKey.ts` populates C1 (rowCount, temporal-span) and C3 (no
duplicate rows, no zero-variance columns) for all five §14 fixtures mechanically — no invention
needed, both are exhaustive checks a script can run. It deliberately does **not** populate C2's
curated per-fixture assertions or any C4 assertion, for all fixtures except the ecommerce
illustration above: which computed facts are notable enough to belong in "the panel as it should
read" is the product judgment this doc itself says only a human can make (05's territory for C4;
a curation call for C2), and no per-fixture mock-up exists in this repo to derive it from. Each
fixture's key entry lists this gap in its own `pendingHumanAuthoring` field rather than silently
shipping a guessed spec. This does not block C2 scoring — `scorePanel.ts` checks C2 live against
each cell's own slot fact table (citation + closure), never against the key — only the human-legible
"what should this panel say" reference the doc's own example sketches. Worth noting: the mechanical
pass already found real facts — `product_reviews` has duplicate rows and `weather` has a
zero-variance column, both `false` in the generated key where the doc's own illustration assumed
`true`.

### Architecture changes that make the model's job smaller

Six changes, all cheap, all pointed at the same thing: the model currently has to guess at a
contract it was never shown, over a candidate set far larger than the output it is allowed to
produce. Fixing that is worth more than any prompt wording, and it is testable in the same pass.

- **Show the model the set it is scored against.** `buildComputedFactsPrompt` sends `{id, statement}`
  only ([`prompt.ts`](../../../../eval/claude/08-computed-facts/prompt.ts) L46), but `checkCitation` scores
  against `fact.entities` and `fact.values`. **The model is graded on a set it never sees.** Send
  `{id, statement, entities, values}` and the constraint becomes visible instead of inferred. This is
  the highest-leverage single change in the folder and it costs tokens, not architecture — and if
  strict-check rejects fall sharply when it lands, a real share of what 01–09 recorded as
  *fabrication* was the model guessing at an unstated contract. Report that delta explicitly.
- **Partition the fact table by slot** (`slotFacts.ts`). Header sees `rowCount`/`temporal-span` only;
  Structural sees `concentration`/`distribution`/`dead-column`/`top-values`/`dependency`; Quality sees
  `null-structure`/`sentinel`/`outlier`/`coverage-gap`/`referential-integrity`/`arithmetic-consistency`;
  Behavioral sees `trend`/`seasonality`/`correlation`/`association`/`variance-explained`. Selection
  pressure drops from *pick 5 of 38* to *pick 2 of 6*, and slot misassignment becomes
  unrepresentable rather than post-hoc detectable. 08's own post-verdict says R2 failure and the
  38-claim dump are one failure; this is the cheapest thing that attacks both. Cost: one
  `Record<PanelSlot, ComputedFactKind[]>`.
- **Scope 06's constrained decoding per slot.** If Ollama's JSON-schema `format` holds, the `cites`
  enum should be *that slot's* fact ids — six or so — not the whole table. The two changes compound:
  a six-value enum is a constraint a 14B can actually satisfy, and plausibly one a 1.5B can too,
  which is the only route to the WebLLM tier this doc otherwise writes off.
- **Mint `check-passed` facts.** New `ComputedFactKind`, `values: [0]`, entities `[table]`, minted
  whenever a probe runs and finds nothing: `check:<t>.duplicates.none`, `check:<t>.zeroVariance.none`.
  The probes already run ([`buildDuplicatesProbe`](../../../../src/lib/insights.ts) L123) — today
  their negative result is simply discarded. This makes C3 citable instead of unrepresentable, and
  it is the difference between the Health card being honest and it being off-limits.
- **Extend the phrasing guard to trend generalisation, and measure the cost. — Landed 2026-07-28,
  as a measured guard, not a shipped one.** `TREND_GENERALISATION_TERMS` (8 terms: *consistently /
  steadily / typically / tend to / tends to / continues to / increasingly / ongoing*) and
  `passesTrendGeneralisationGuard` are exported beside `FORBIDDEN_PHRASING`, and deliberately **not**
  folded into `passesPhrasingGuard`: it earns the shipped path with a number or not at all. Both
  halves of that number are now instrumented — the false-reject half ran, **0 of 279 deterministic
  statements rejected across all five fixtures** (computed facts, insight descriptions, offer verbs
  and their evidence; the shipped guard scores 0/279 on the same corpus), and the hit half is
  recorded per cell by `scorePanel` when the panel arm runs. A 0% false-reject rate on the app's own
  honest output is the necessary half; whether the guard catches anything real is the panel arm's to
  say. **The list may not grow to flatter the numbers** — 02's failure mode, in both directions.
- **Apply the phrasing guard to `RankedAction.verb`. — Landed 2026-07-28.** `rankedActionValidator`
  ([`producerValidators.ts`](../../../../src/lib/producerValidators.ts)) now rejects a candidate set
  whose any `verb` trips `passesPhrasingGuard`, with tests. It was the only free-text field the model
  may write on the offers path and it had no honesty check at all — which matters more, not less, if
  C4 gets pushed onto the offers slot as 05 proposes. All 24 deterministic verbs clear it today, so
  the change is a guard against a future producer, not a fix to current output.

Two of these are product-code changes to shipped files (`producerValidators.ts`, and the `check-passed`
kind if it lands in `src/lib/computedFacts.ts`). They are worth keeping whichever arm wins, which is
the bar this folder sets for touching product code at all.

### What a winning arm still owes the panel

Nothing in this experiment renders. `FindingsColumn` consumes `InsightCandidate`
([`SynthesisPanel.tsx`](../../../../src/features/map/SynthesisPanel.tsx) L121), not `ComputedFact`,
and the two vocabularies have diverged (7 rules vs 21 kinds). A winning arm therefore ships with an
adapter and a third finding column, or it does not ship. Name that cost in the verdict rather than
discovering it afterwards.

### The seam to get right: the assembler

**`assemble.ts` is a budgeted assembler, not string concatenation.**

```ts
assemble(question, tables, facts, rows, budgetTokens)
  → emits sections in priority order until the budget is spent
```

Priority: dialect rules → schema card → computed facts → conversation state → row evidence →
result digests. Every section declares a token cost and a priority; the assembler fills to budget
and records what it dropped.

Today's in-scope case is `budget = ∞` — everything fits, nothing is dropped. That is the point: the
assembler is trivial now and the seam is correct. **This is also what stops the large-table round
from being a revamp** — that round adds retrieval (which columns/facts earn a slot), sampling
(stratified rather than complete rows), and map-reduce over chunks, all *behind this interface*,
touching no caller. Every A1/A2/A3 cell in phase 1 is just a different call into it, which is why
building it first costs nothing extra and pays for itself immediately.

The same applies to row evidence: define it once as "an evidence section with a cost and a
priority." Full table, stratified sample, and column digest all satisfy that contract. The big
round swaps which one is emitted; it does not rewrite the path.

---

## Kill criteria (pre-commit, D18)

- **(a)** `verifyStats.ts` runs as a hard gate before every live call in every cell. A cell whose
  computed facts fail verification does not run. Non-negotiable — it caught 2 of 08's 4 live bugs
  before any model saw a wrong number.
- **(b)** Every run records `num_ctx`, prompt token count, rows actually sent, and rows available.
  A run whose prompt exceeded `num_ctx` is a **failed run**, not a data point.
- **(c)** The crossed cell (max × OPAQUE × CORRUPTED) produces an interpretable result on at least
  one fixture: the model demonstrably states the corrupted value, the true value, or refuses. "Model
  said something unrelated" on all 5 repeats is an inconclusive cell and must be reported as such,
  not smoothed over.
- **(d)** Phase 1's row-ladder block shows a **directional** effect on at least one slot of one
  surface — C2 fabrication count (panel, per slot) or result-correctness (chat). Flat everywhere,
  outside the N=20 interval the ladder block now buys, means rows don't matter at this scale and
  the answer is "don't send them."
- **(e)** Sample-leak count (08's kill criterion f) reported per cell. 08's clean 0/146 was *thin*
  — the inertness rule dropped nearly every candidate row, so titanic, stock_prices and weather sent
  literally zero rows in every run. At the max-fits rung this premise finally gets exercised
  properly; if leaks appear, that is the real answer to a question 08 could not reach.
- **(f)** `CLOSURE_RULES` stays at 3 and its length is reported. Growth to flatter the false-reject
  rate fails the criterion.
- **(g)** Chat arm reports exec-rate, result-correctness, and repair-rate per rung, and the D40 gate
  (`npm run eval`) stays green at its existing threshold and exit code.
- **(h)** Phase 2 only starts once phase 1 has a written verdict. A phase-2 result without a phase-1
  verdict is uninterpretable — you won't know whether the arm won because of selection or because of
  the rung it ran at.
- **(i)** **Zero C1 disagreements.** A model-authored count or span that differs from the computed
  value at *any* rung ends the question: counts come off the model, permanently, and the header's
  numeric slots are app-composed. This is an equality check against `PANEL-KEY.json`, so it is
  automatic and not a judgement call.
- **(j)** **C3 occurrences are fabrications by construction.** Any model-authored absence claim
  ("no duplicates", "no zero-variance columns") counts as a fabrication *even when it is true* — the
  model cannot have run an exhaustive check. Counted separately per cell, never folded into the C2
  rate.
- **(k)** **Slot misassignment rate reported per cell** — items whose cited fact belongs to a
  different slot's partition. Under slot-scoped fact tables this should be structurally zero; a
  non-zero rate means the partition leaked and the cell's other numbers are suspect.
- **(l)** **Every surfaced offer executes.** Offers arm: SQL runs and returns ≥1 row, on every
  repeat. An offer that errors is this surface's fabrication, and `verb` clears the phrasing guard.
  **Passed for the deterministic incumbent on 2026-07-28 (8/8, 0 rejects) — with the caveat the run
  itself exposed:** an offer whose evidence is a schema fact carries no SQL by contract, so 16 of 24
  offers are outside this criterion entirely. Report the executable count *and* the no-SQL count;
  a pass on 8 of 24 is not a pass on the surface.
- **(m)** **`PANEL-KEY.json` predates the first model call**, and its truth values come from
  `verifyStats.ts`' independent second computation. A key edited after seeing output is a
  rationalisation; if the key turns out to be wrong, say so in the verdict and version it, don't
  quietly amend it.

---

## Ollama run

```
make ollama-start          # qwen2.5-coder:14b, local M4
npm run eval:grounding-ladder:key        # build PANEL-KEY.json — no model call, run this FIRST
npm run eval:grounding-ladder            # phase 1, panel arm
npm run eval:grounding-ladder:chat       # phase 1, chat arm (A1 rungs only)
npm run eval:grounding-ladder:offers     # phase 1, offers arm — SQL execution, no model, no rig needed
npm run eval                             # D40 gate — must stay green
```

The smoke-test invocation, before committing to the full ~250-call, ~4h run:

```
EVAL_DATASET=titanic EVAL_CELL=row-ladder-0 EVAL_REPEAT_CAP=1 npm run eval:grounding-ladder
```

`EVAL_DATASET`/`EVAL_CELL` narrow to one fixture/cell id (ids are `variants.ts`'s own, e.g.
`row-ladder-0`, `crossed-cell`); `EVAL_REPEAT_CAP` caps N for a quick check. All three are optional
narrowing filters, not required for the real run — bare `npm run eval:grounding-ladder` runs every
cell at its full N.

### First run attempt (2026-07-28) — three failures, zero scored panels

**Nothing in this doc's verdict, kill criteria, or per-slot table has moved.** `RESULTS.json` does
not exist. Three invocations of the smoke cell above, all ending in `TypeError: fetch failed` from
`run.ts`'s own transport catch, none reaching `parsePanelAnswer`:

1. **Cold rig.** Failed; `/api/version` then unresponsive, which reads as a dead server. It wasn't —
   `/api/ps` minutes later showed the model **loaded and healthy** (11.5 GB VRAM,
   `context_length: 32768`). The box was saturated cold-loading a 14B q4 with a 32k KV cache, and a
   short-timeout `curl` against a machine doing that will fail every time. **This is the one real,
   reproducible harness bug found: cold load at `num_ctx: 32768` exceeds `run.ts`'s own 600 s
   `headersTimeout`** ([`run.ts`](../../../../eval/claude/10-grounding-ladder/run.ts) L56), so **call #1 of
   any cold run fails by construction**, independent of thermals or model quality.
2. **Warm model.** Failed at 460 s — under the 600 s timeout, so not that bug. Explained by (3).
3. **Cause of (2):** Justin stopped the Ollama service mid-call; the Air had got too warm.

**Rig availability is the blocker, and it is a hardware call, not a design one.** The endpoint is a
**fanless MacBook Air** (`jaydens-macbook-air`, `100.126.157.97`, reached over Tailscale) running
`qwen2.5-coder:14b` q4 — 11.5 GB resident. It got too warm on a single content-bearing call. Phase 1
is ~250 panel calls plus 408 chat calls, ~4 h unattended, on that machine. Whether that pass is
thermally viable is unanswered and is not this doc's to assume.

### Handoff — items 1–5 done (2026-07-28), item 6 is all that's left

Everything below was unblocked by the rig; none of it needed a model call or phase 1's verdict, and
all of it has now landed. Item 6 is the only remaining step, and it is a hardware call.

1. ~~**Fix the cold-load timeout in `run.ts`.**~~ **Done.** A warm-up call now runs before any
   scored cell, outside the timing path, on its own 30-min dispatcher
   ([`ollamaRig.ts`](../../../../eval/claude/10-grounding-ladder/ollamaRig.ts)). Its outcome is recorded in
   `RESULTS.json`/`CHAT-RESULTS.json` (`warmUp`), and a warm-up failure does not abort the run — the
   per-call transport catch still records what happens next honestly.
2. ~~**Record `keep_alive` explicitly on every call.**~~ **Done.** `keep_alive: '60m'` (overridable
   via `OLLAMA_KEEP_ALIVE`) on every panel-arm and chat-arm request, recorded alongside `num_ctx`.
3. ~~**Build `runChat.ts` and `runOffers.ts`.**~~ **Done.** The offers arm ran and has a real result
   (above). The chat arm is built, A1-scoped, and waiting on the rig.
4. ~~**Fix the chat-path bug this doc already names.**~~ **Done** — `AIChatModule` passes
   override-applied `edges` to `askAI`.
5. ~~**The two phrasing-guard changes.**~~ **Done**, with tests: `passesPhrasingGuard` on
   `RankedAction.verb`, and `TREND_GENERALISATION_TERMS` /
   `passesTrendGeneralisationGuard` exported beside `FORBIDDEN_PHRASING` but **not** wired into the
   shipped guard until it has both halves of its number (false-reject half: 0/279, measured).
6. **Then the rig**, once thermals are settled: smoke cell → confirm one scored panel end-to-end →
   full pass. Decide `num_ctx` deliberately (32768 is unproven in both directions, see the amendment
   below; `titanic` at ~13 k and `product_reviews` at ~11 k both fit inside 16384 with the 1500-token
   response reserve, so the in-scope pair does not require 32768 — only the `stock_prices` ceiling
   control does, and its whole role is to not fit). `OLLAMA_NUM_CTX` is read from
   `ollamaRig.ts` now, so both arms move together when that call is made.

Ollama only for all iteration. The Workers-AI free pool is account-wide and exhaustible (it was
exhausted on 2026-07-26 by the probe runs). Confirm on Cloudflare only if something wins, and note
that any cloud confirmation runs under D72's caps, not this doc's local override.

**Run 06's platform check first** — whether Ollama's JSON-schema `format` parameter constrains the
`cites` enum to live fact ids at decode time, **scoped to the slot's own partition** rather than the
whole table. Twenty minutes, and if it works it makes an entire class of citation failure
unrepresentable rather than post-hoc rejected — and a six-value enum is a small enough constraint
to be worth re-testing on the 1.5B WebLLM tier that this doc otherwise writes off.

### 06's platform check — result (2026-07-28)

Live-tested against titanic's real `quality` slot (2 live fact ids: `stat:titanic.Age.null-structure`,
`stat:titanic.Fare.outliers`) via a throwaway script
([`platformCheck06.ts`](../../../../eval/claude/10-grounding-ladder/platformCheck06.ts), not part of the
harness build list). Ollama's `/api/chat` `format` parameter, given a JSON schema whose `cites` array
is constrained to that 2-id enum, **held cleanly: 3/3 constrained calls returned valid JSON with
`cites` drawn from the live enum, 0 parse failures.** But the unconstrained baseline (same prompt, no
`format`) also stayed on-list in all 3 calls — this run never observed a case where the constraint
changed the outcome, so the result is suggestive, not proof the constraint is load-bearing. A sharper
design (a fact deliberately withheld from the enum, to see whether the model tries to cite it anyway,
constrained vs. not) is needed before trusting this beyond "the mechanism works technically." **06
stays scoped to F2/F3 per the README's candidate table regardless** — it was never meant to catch F1
misattribution, and nothing here changes that.

**A real, separate finding from getting here.** `num_ctx: 32768` (the ladder's own production setting)
crashed the Ollama runner mid-generation on this rig, twice in a row — trivial "Say OK." round trips at
that same `num_ctx` succeeded (9–28s), but the first real content-bearing generation closed the socket
(`UND_ERR_SOCKET`), and `/api/ps` then showed no model loaded. Dropping to `num_ctx: 4096` (this
diagnostic's prompt is a few hundred tokens, nowhere near max-that-fits) ran clean after Justin
restarted the Ollama service. This is exactly the risk the doc's own "Practical note for the M4"
already named ("verify the context actually holds under load before trusting a full pass") — now with
a live reproduction on this rig, not just a stated risk. Whoever builds `run.ts` should budget for
this: memory headroom at `num_ctx: 32768` under real generation, not just at model load, is unverified
on this hardware and failed once already.

**Amendment (2026-07-28, after the first run attempt) — treat the crash finding above as
unreproduced.** The first run attempt hit the same surface symptom and, on inspection, had a more
mundane explanation both times; the `/api/ps`-shows-no-model evidence in particular is exactly what a
saturated cold load looks like from the outside. **`num_ctx: 32768` is not currently established as
a stability fault on this rig, and it is not currently established as safe either** — the honest
state is that nobody has a clean reproduction in either direction. Do not design around the crash,
and do not assume it away; instrument for it. What *is* measured is the cold-load cost below.

---

## What it does not solve

- **Tables larger than context.** Explicitly out of scope. The assembler seam is the hedge; the
  retrieval/sampling/map-reduce design is its own round.
- **The 1.5B WebLLM tier.** Every number here is from a 14B. The shipped local model is
  `Qwen2.5-Coder-1.5B` and [`webllmProvider.ts`](../../../../src/services/webllmProvider.ts) already
  documents that it does not emit structured tool calls reliably — it is driven by single-shot text
  extraction. Whether it obeys the `{text, cites}` contract at all is a separate check (08's kill
  criterion (e) on WebLLM, not on the 14B), and a mechanism the local model won't obey makes the
  zero-egress tier moot regardless of what the ladder finds.
- **The honest-unavailable-state bug.** [`edge/handlers/synthesis.ts`](../../../../edge/handlers/synthesis.ts)
  returns HTTP 200 with the baseline echoed on any provider failure, so "AI unavailable" is
  indistinguishable from "AI agreed with the baseline" — to the client *and* to the eval harness.
  It lands on whichever architecture wins (Invariant 5) and needs a server-side typed code. Not
  fixed here, but the chat arm must not mistake a degraded echo for a result.
- **Exhaustive hand audit — mostly retired, not entirely.** C1, C2, C3 and C5 are certified per
  claim against `PANEL-KEY.json` automatically, which is a real improvement on 08's R1 (an extensive
  spot-check, not per-claim certification). **C4 still needs a human**, and no key can fix that: the
  whole definition of the class is "no data check exists." State the C4 residue count and who read
  it.
- **Whether the panel's target mock-up is the right product.** This doc measures how truthfully each
  slot can be filled, not whether a four-card panel is what a user wants on open. That judgement is
  05's kill criterion (c) and it stays a human call.

---

## Open human calls

**This doc is the handoff for these; nothing else asks them.** Each is a judgement no run can
make, so a session that finishes the machine work and stops here has finished. Listed with when it
becomes answerable, because three of them are answerable *now* and do not wait on the rig.

| # | The call | Answerable | Blocked until it's made |
| :--- | :--- | :--- | :--- |
| **H1** | **Which computed facts belong in "the panel as it should read"**, per fixture — the C2 half of `PANEL-KEY.json`. `buildKey.ts` filled C1/C3 mechanically and stopped; each fixture entry names the gap in its own `pendingHumanAuthoring` field. 21 fact kinds compete for ≤3 slots per column and no per-fixture mock-up exists to derive the choice from | **Now** | Nothing in the scoring — C2 is checked live against each cell's own slot fact table. Only the human-legible "what should this panel say" reference |
| **H2** | **Where duplicate-row findings belong** — the shipped code routes `duplicates` to Behavioral Trends (`BEHAVIORAL_RULES`); the mock-up reads duplicate-checking as Data Quality. One of the two is wrong | **Now** | The third finding column's spec, and any slot-misassignment number that touches duplicates (kill criterion k) |
| **H3** | **What "beat the deterministic ranker" means for the offers slot**, given that the 2026-07-28 offers run found 16 of 24 surfaced offers carry no SQL and `ecommerce` surfaces 5 with 0 executable. Execution reaches a third of the surface, so kill criterion (l) alone cannot decide C5 | **Now** — the evidence is in. Still unanswered as of 2026-07-30. The panel arm added a *second*, different offers number (id fidelity, 88.4% at the 7B) which does not answer it either — id discipline is not usefulness | The C5 row of the verdict table. Deciding it *after* seeing which arm won is a rationalisation |
| **H4** | **What happens to the C4 residue, per slot** — converted to an offer (05) or dropped. The doc argues 05 is the ship answer for the header's interpretive clause; that is an argument, not a decision | After phase 1 — the residue count is its input. Its input still does not exist: the C4 residue was counted (7B 335, Gemini 149) and never read by a human, and the header's own domain claim was never elicited at all | The Header (domain / suited-for) and Behavioral rows of the verdict table |
| **H5** | **Whether the trend-generalisation guard ships.** Its false-reject half is measured (0/279 deterministic statements). Its hit half comes from the panel arm. A guard that rejects nothing real is dead weight; one that rejects a lot is a live product change to `passesPhrasingGuard` | After phase 1 | Folding `passesTrendGeneralisationGuard` into the shipped guard, which is deliberately not done yet |
| **H6** | **`num_ctx` for the full pass** — 32768 or 16384. The in-scope pair fits inside 16384; only the ceiling control needs more, and its role is to not fit. 32768 is unproven as a stability fault *and* unproven as safe on this rig | Before the full pass; it is a thermals call on your own hardware. Answered in passing for the 7B: the 250-call cross ran at 32768 with no crash | The ~4h run. Both arms read it from `ollamaRig.ts`, so it is one decision, not two |
| **H7** | **Whether the four-card panel is the right product at all.** This doc measures how truthfully each slot can be filled, never whether a user wants that panel on open — 05's kill criterion (c) | Standing; independent of every result here | Nothing here. Named so a clean verdict is not mistaken for product validation |

H1, H2 and H3 are answerable today and the rig cannot answer them tomorrow.

### Decisions, 2026-07-31 (Justin)

Recorded here rather than rewritten into the table above, per this folder's own convention of
appending corrections rather than silently editing prior text.

- **H1 — resolved, with a dependency.** Method: compare against what real, widely-used BI
  dashboards (Tableau/Looker/PowerBI-class tools) actually surface for a given dataset shape, and
  use that to decide which of the 21 computed facts earn a slot per fixture. **Sequenced after the
  Map tab's ERD ships** — [`src/features/map/Erd.tsx`](../../../../src/features/map/Erd.tsx),
  intended to be visible as soon as the app opens — not before.
- **H2 — resolved.** Duplicate-row findings move to **Data Quality**, not Behavioral Trends.
  Behavioral Trends stays AI-authored, contingent on the semantic layer (H7, below) maturing first.
- **H3 — direction given, not yet a metric.** Goal stated as "accurate and useful." Not yet
  operationalized into a scoreable bar (e.g. accuracy = citation-grounded/correct; usefulness =
  surfaces something the deterministic ranker's own list wouldn't have) — that operationalization is
  still owed before H3 can close.
- **H4 — owned by the user, still open.** Will be tested against the user's own real data to judge
  whether accuracy is sufficient. Not decided here.
- **H5 — owned by the user, still open, with an existing lead.** Needs testing for (a) whether the
  guard blocks any real findings and (b) whether feeding the model too much context confuses it.
  (b) is not hypothetical — kill criterion (d) above already found the 7B's Behavioral-slot C2 rate
  falling 75.0% → 56.6% as rows increase, so this should be tested against that existing signal, not
  from scratch.
- **H6 — reframed, larger than originally scoped.** Not "32768 vs 16384." The actual ask is an
  **adaptive strategy by dataset size** — small datasets get full rows + computed facts; large
  datasets need a different mechanism (sampling, unique-vs-normal-row distinction, summarized
  computations), with a "sweet spot" still to be found. This is exactly the **"tables larger than
  context" round** this doc already parked as future work (see "What it does not solve," above), for
  which `assemble.ts`'s budgeted-assembler seam exists precisely so this round doesn't require a
  rewrite. Not started; this doc's row-ladder data (the A1 axis) is the starting evidence base for it.
- **H7 — largely resolved, one caveat.** Header, Structural and Quality confirmed as the intended
  deterministic slots; Behavioral Trends and free-form synthesis stay LLM-authored. **Caveat:** the
  Verdict table below still has Structural Patterns and Data Quality's C2 half tagged "provisional:
  model-narrated, citation-bound," not deterministic — not a contradiction, it reflects that the
  semantic layer (the computed-facts + citation-grounding mechanism) is still being iterated on to
  find an efficient, robust implementation before it's locked as deterministic. **Sequencing stated
  explicitly:** get the semantic layer solid enough to produce good synthesis first, *then* evolve
  toward a more cohesive, open-ended chat mechanism (free-form questions like "what's odd here that
  could drive sales," "what transforms should I apply next") — which goes beyond the existing chat
  arm's scope (factual NL→SQL only, no interpretive/coaching questions tested) and has no eval built
  for it yet.

---

## Verdict

> **Run, partially. Two arms have reported: Ollama `qwen2.5-coder:7b` schema-constrained
> (250/250 compliant, 2026-07-29) — the shipping-tier proxy that decides every cell below — and
> Gemini 3.6 Flash (265/265 compliant) — an **instrument**, per
> [11's transfer ledger](./11-gemini-comparison-arm.md#the-transfer-ledger); its numbers are
> CAPABILITY-tagged, live in the separate labelled block after the table, and decide nothing here.
>
> **What the table's decisions rest on, stated so it can be checked:**
> - The tier is `qwen2.5-coder:7b`, **not** the `qwen2.5-coder:14b` this doc was designed around,
>   and **neither** of the tiers the product actually ships (Workers AI, R6; WebLLM 1.5B). Every
>   row below is **provisional pending those two arms.**
> - The ledger's rule — "a CAPABILITY result from this arm may not appear in 10's verdict table" —
>   is scoped to **Gemini's** results. The 7B's own CAPABILITY-tagged numbers *are* the shipping
>   tier and are admissible here; the ledger's own sentence says the verdict is "made on the tier
>   that will actually ship." Read literally as a blanket ban it would empty this table; that is
>   not what it says.
> - `run.ts` persists C2/C3/C4 as **aggregates across structural+quality+behavioral**.
>   `scorePanel` computes them per slot (`C2Disposition.slot`) and the detail is discarded before
>   write. **Resolved 2026-07-30, no model call:** `eval/claude/10-grounding-ladder/rescorePerSlot.ts`
>   replays every compliant record's persisted `raw` panel through `scorePanel` with the slot fact
>   tables deterministically reconstructed (verified byte-exact against the originally-persisted
>   aggregates — see its own output). Per-slot C2, by rung, both providers, is in
>   `PER-SLOT-RESCORE.json`; the three C2 rows below still report one combined number each
>   (unchanged, since none of the three rows' verdicts turned on the split), but kill criterion (d)
>   is now assessable — see that criterion's own note.
> - **Kill criterion (d) ("a directional effect on at least one slot"), resolved 2026-07-30:** the
>   7B's per-slot C2 rate by rung (row-ladder block) is **not flat everywhere**. `behavioral` falls
>   75.0% → 71.6% → 70.3% → 56.6% (0→10→100→max) on titanic+product_reviews combined — a real,
>   monotonic decline concentrated in one slot, obscured by the combined number's noisier read.
>   `structural`/`quality` show no comparable trend (both bounce within a ~15-point band, no
>   monotonic direction). Gemini's per-slot rates stay within about 3 points at every slot, every
>   rung (quality is exactly flat at 100%) — so **the directional effect is 7B-specific**, consistent with `assemble.ts`'s own worry
>   that more rows dilute rather than help a smaller model's behavioral-slot claims. Criterion (d)
>   **passes** (a directional effect exists, on `behavioral`); it does not by itself say what to do
>   about it — that's still a product call.
>
> **Still not produced, from this section's own original ask:** R3 ("reach") — never computed, on
> either arm. The false-reject delta from showing the model its own value sets — that is rider R-D,
> never authorised, never run. **The rung-matched OPAQUE-vs-CLEAR contrast, computed 2026-07-30 at
> $0 (`PER-SLOT-RESCORE.json`, `row-ladder-{0,max}` vs `recall-ablation-{0,max}`, both `a3=TRUE`):
> no consistent recall-dominance signal.** 7B: OPAQUE C2 rate is *higher* than CLEAR on
> titanic-rows=0 (85.3% vs 75.8%, N=5 vs N=20) but *lower* on the other three rung/fixture pairs
> (titanic-max 57.6% vs 63.3%; product_reviews-0 60.7% vs 77.8%; product_reviews-max 68.8% vs
> 77.5%) — direction isn't stable, and OPAQUE's N=5 (28–34 claims) is thin next to CLEAR's N=20
> (111–140 claims). Gemini: OPAQUE trails CLEAR at every rung/fixture pair, but by a small and
> shrinking margin (titanic-0 tied at 100%/100%; titanic-max 94.3% vs 99.3%; product_reviews-0
> 73.3% vs 79.2%; product_reviews-max 80.0% vs 81.7%). **Reading:** the "recall dominance re-scopes
> everything" worry — that CLEAR's apparent grounding is substantially recall-assisted — is **not
> supported** at either tier: the 7B shows no stable direction at all, and Gemini's small,
> one-directional gap is consistent with OPAQUE being a slightly harder condition on its own terms
> (unfamiliar column tokens), not with CLEAR being propped up by memorised answers. Thin N throughout
> (R-C, never run, is what would firm this up). Riders **R-A and R-B have now run**
> (2026-07-30, [11's session 10](./11-gemini-comparison-arm.md#handoff--2026-07-30-session-10-r-a-and-r-b-run--opaque-does-not-blind-on-titanic)).
> **R-B found OPAQUE does *not* blind on titanic** — see the new CEILING block below the table. R-A
> found zero C3 at rows=0 on every runnable fixture, consistent with the existing zero-C3 finding.
> Rider **R-C (variance floor) was never authorised either, so the ladder's power is unquantified**
> — "flat by rung, no decline" below is an observation at N=5–20, not an established null result.

**The deliverable is this table, filled in.** It is what "the standard" means here: not a finding
about models, a decision per surface that someone can build from.

| Slot | Class present | Winning architecture | Evidence | Residual risk |
| :--- | :--- | :--- | :--- | :--- |
| Header — counts / span | C1 | **App-composed (D65) — beaten-attempt failed, not assumed.** Kill criterion (i) fired at the shipping tier, but see the 2026-07-30 correction: the margin is much thinner than the original count suggested | Ollama 7B, 250/250 compliant, 2026-07-29: **254 C1 disagreements on uncorrupted (`a3=TRUE`) cells**, so (i) ("zero C1 disagreements … at *any* rung") fails outright. **Not diffuse — two cells:** `product_reviews::row-ladder` 217 (71% of the run's 304 total) and `stock_prices::ceiling-control` 37 (15/20/2/0 by rung). `titanic::row-ladder` is 0/80; both fixtures' OPAQUE `recall-ablation` cells are 0/10. Counts are *disagreements*, not calls. **Correction, 2026-07-30 — the $0 header read named in Residual-risk is done, and it found a real scorer bug, not a model failure:** `scoreC1`'s `numericTokens` check splits on hyphens, so an ISO date truth (`2023-01-01`) never equality-matches even when a header echoes it byte-for-byte, and a prose date ("January 1, 2023") fails the same way — every digit group gets flagged. Fixed in `scorePanel.ts` (`c1TruthTokens` now also accepts a date truth's year/month/day, padded and bare; tests in `scorePanel.test.ts`) and replayed against the persisted headers (`eval/claude/10-grounding-ladder/rescorePerSlot.ts`'s reconstruction path, deterministic, no model call). Result: `product_reviews::row-ladder` **217 → 5**, `stock_prices::ceiling-control` **37 → 1**; titanic and `recall-ablation` were already 0 and have no date-truth exposure, so they're untouched. **Corrected total: 6, not 254.** The 6 residual cases are two citation-closure edge cases (header pivots to a second resolved fact — a different, pre-existing mechanism) and four "N years" roundings (23 months → "2 years", ~9.5 years → "9 years") — imprecision, not a wrong count or date | **Resolved:** the $0 header read this cell asked for is done (see Evidence's 2026-07-30 correction) — it was a scorer bug, not an unread mechanism, so criterion (m) doesn't apply (the *key* was never wrong; the *scorer* was). Gemini's 0-C1 result on the identical cell is now corroborated rather than merely uncontradicted. **This does not flip the row's verdict** — criterion (i) still requires *zero* and 6 isn't zero — but the practical case for foreclosing a model-narrated header is far weaker than "254 disagreements" implied; whether 6 residual imprecision-class cases still justifies app-composition over a narrower guard (e.g., accept "~N years" rounding, still reject a wrong count/date) is a call for whoever next revisits this row, not decided here. **C1's sign inverts by `a3`:** on `a3=TRUE` a disagreement is a fabrication; on `CORRUPTED` it is *grounding* (the model echoed the fact it was fed) — the date-truth fix does not touch `CORRUPTED`/`DELETED` scoring, since those anchors are `.rowCount` facts, not dates (`pickAnchorFact`'s own priority order). Never quote the 304 total as one rate. `DELETED`-cell C1 uses the session-2 closure fix; Gemini's pre-fix records were never replayed, so no cross-arm C1 total is comparable. Direction of risk is safe: app-composition can only be reopened by a *smaller* tier passing, and none has run |
| Header — domain / suited-for | C4 | **Open — H4.** Unchanged by either arm | **None. Not measured, on either provider.** `PANEL_RESPONSE_SCHEMA`'s header claim is `{text, cites}` only — there is no domain-guess field, so the harness never asked any model for this claim. Consistent with §"Slot inventory": `domain-guess` is a declared `ComputedFactKind` with **no builder**, and "suited for" has no fact at all — the clause is *unrepresentable*, not merely unverified. The C4 residue that was counted (7B 335, Gemini 149) is combined across structural/quality/behavioral and contains **no** header-domain claim | Nobody has read the residue: this doc's own requirement ("state the C4 residue count **and who read it**") is half-met — counted, unaudited — so H4's input does not exist yet either. One tempting artifact to refuse: the 7B's invented `"Crypto Market Data for Ethereum"` header at `stock_prices::ceiling-control-max` is a broken cell's header text, **not** a measurement of this slot |
| Structural Patterns | C2 | **Provisional: model-narrated, citation-bound, reject-on-closure-failure.** Not closable until the per-slot re-score below runs | **No per-slot number exists** (see preamble); the following is one figure shared with the two rows beneath, not three measurements. Ollama 7B, 250 calls: **C2 1080/1515 grounded (71.3%)** — ~29% of model-authored claims fail citation closure. By rung: `product_reviews::row-ladder` 77.8 / 74.4 / 82.4 / 77.5% (flat, N=20/rung); `titanic::row-ladder` 75.8 / 78.4 / 83.3 / **63.3**% (only the `max` rung falls, coinciding with leaks jumping to 28). Sample leaks 49, 48 of them on `titanic` | **Criterion (k) fired: 148 slot misassignments across 250 calls** — the fact partition leaked, and (k)'s own text then makes "the cell's other numbers suspect." Because per-slot C2 was discarded, you cannot tell *which* slot leaked. **Criterion (d) is therefore unassessed — neither passed nor failed** — since it requires a directional effect "on at least one *slot*." Unblock costs $0 and needs no model call: replay the persisted `raw` panels through `scorePanel` with the slot fact tables reconstructed, and persist `C2Disposition[].slot`. A 71.3% closure rate means an architecture that renders unclosed claims ships ~29% ungrounded text; one that drops them ships a visibly gappy panel. Which is acceptable is a product call this table cannot make |
| Data Quality & Health | C2 + C3 | C3 is app-only by construction — **unchallenged, and now also unexercised.** C2 half: as Structural Patterns | **C3: zero occurrences across 515 compliant panels, both tiers, every fixture, every cell** (7B 250/250, Gemini 265/265) — cross-checked twice, from the persisted aggregate and from an independent re-application of `scorePanel`'s own `ABSENCE_PATTERN` to the raw output. No model attempted an absence claim anywhere. C2 half: the same combined 1080/1515 as the row above, not a separate measurement | Zero C3 is a **lower bound from a regex**, not proof the class is absent: `ABSENCE_PATTERN` demonstrably catches an injected F3 (`scorePanel.test.ts`, Phase 1), but a paraphrase it does not match scores zero. And zero C3 does not license model-authored absence claims — criterion (j) makes them fabrications *even when true*, so the app-only ruling stands on construction, not on this count. Independently: the third finding column **does not exist in shipped code** and "checks passed" still has no fact source, so this row's architecture has nothing yet to be right or wrong about |
| Behavioral Trends | C2 + C4 | **Open.** C2 half as Structural Patterns (provisional, blocked on the same re-score); C4 half is **H4**, unchanged | No slot-specific evidence exists for either half. C2 is the combined figure above; the C4 residue (7B 335, Gemini 149) is likewise combined across three slots and unread by a human — which is also why **H5** (`passesTrendGeneralisationGuard`'s hit half) still has no number | This is the slot where unhedged generalisation lives and where the shipped guard is known not to reach — C4 phrasings clear `FORBIDDEN_PHRASING` clean (§"Two guard gaps"). Sample leaks (verbatim row values reaching claim text) are titanic-concentrated at both tiers (7B 48/49, Gemini 31/31), so "sending rows is safe" is unestablished for a fixture whose values are memorable. **Do not import Gemini's chat-arm "more rows → worse correctness" (71.6% → 56.9%) into this row:** it is the NL→SQL path, CAPABILITY-tagged, and the panel path's own C2 rate is flat by rung on both fixtures at both tiers |
| Suggested Explorations | C5 | Deterministic ranker is the incumbent — the model must beat it. **Still undecided: H3 is unanswered**, and H3's own rule is that deciding it after seeing which arm won is a rationalisation | Offers arm, 2026-07-28 (no model): 8/8 executable offers ran and returned rows, 0 phrasing-guard rejects — **but 16 of 24 surfaced offers carry no SQL at all**, and `ecommerce` surfaces 5 with 0 executable. **Separate mechanism, do not merge with the above:** the *panel* arm measures offers-array **id fidelity** (`checkOffersCompliance` — did the model return exactly the candidate action-id set, with no invented, dropped or duplicated ids; **no SQL is executed**). Ollama 7B: **221/250 (88.4%)**, with two bad cells — `stock_prices::ceiling-control` 10/20 and `titanic::row-ladder` 64/80 | The incumbent is mostly unfalsifiable, so "beat it" needs a second criterion beyond execution. The two offers numbers cover **disjoint** failure modes and cannot be averaged: an offer can have a perfectly valid id and no SQL at all — that is exactly the 16-of-24 case. And 88.4% id fidelity means the model invents or drops action ids ~12% of the time, i.e. offers pointing at actions that do not exist — a failure the deterministic ranker structurally cannot have. `stock_prices::ceiling-control`'s 50% coincides with that cell's C2 collapse; it is one more symptom, not an independent data point |

> #### Gemini 3.6 Flash — instrument column (CAPABILITY; **decides nothing above**)
>
> Per [11's ledger](./11-gemini-comparison-arm.md#the-transfer-ledger), a CAPABILITY result from
> that arm may not appear in the verdict table. These are recorded because they calibrate the
> *instrument* and the folder's premise, not the product's providers. 265/265 compliant,
> `responseSchema`-constrained, `thinkingLevel: minimal`, 0 thinking tokens on every call, ≈$7.16.
>
> - C2 1607/1756 (91.5%); C3 **0**; C1 **0 on all 199 uncorrupted calls**; offers id fidelity 265/265
>   (computed post-hoc in session 8, after the ledger's tags were meant to be assigned — treat as a
>   post-hoc metric, not a pre-registered ledger tag).
> - R2 (most-common-header-fraction) 0.40–1.00 across cells vs. the 7B's 0.15–0.85 — Gemini is more
>   deterministic at **every** rung on **every** fixture. Both figures are CAPABILITY in isolation;
>   what is worth carrying is only that a large tier-gap in header determinism **exists**, which is
>   08's R2 concern read at more than one tier. (Computed post-hoc in session 8, after the ledger's
>   tags were meant to be assigned — treat as a post-hoc metric, not a pre-registered ledger tag.)
> - Job 2 (folder's provider-independence premise): Gemini reproduces zero C3 and zero clean-data
>   C1; the 7B reproduces zero C3 but 254 clean-data C1 — a provider-dependent result on the one
>   axis the premise is loudest about. Not decided here; flagged for the folder's own
>   premise-status tracking, not resolved by this table.
> - Chat arm: result-correctness fell monotonically with rows, 71.6% → 64.7% → 63.7% → 56.9%.
>   **NL→SQL path only** — the panel arm's own C2 is flat by rung.
>
> **CEILING conclusions that do transfer downward (failure-dispositive only), and their limits:**
> - Zero C3 at the ceiling. Gemini failing here would have been dispositive; it did not fail, so
>   this does **not** by itself clear the 7B — the two results are merely consistent.
> - **Crossed cell (max × OPAQUE × CORRUPTED): kill criterion (c) PASS** — 10/10 compliant and
>   coherent at the ceiling, and scoreable at the 7B too. **This says the cell is *interpretable*.
>   It does not say OPAQUE *blinds* — and now there's a direct measurement.** Rider R-B ran
>   2026-07-30 and found OPAQUE does **not** blind on titanic: 10/10 re-identified as the Kaggle
>   Titanic dataset at `rows=0`, all `high` confidence, from anonymised schema statistics alone (row
>   count + column shapes) — no row values needed. product_reviews stayed blind (0/20), but only
>   because it has no documented public source corpus to recall in the first place, not because the
>   anonymisation held. **The crossed cell's "no recall to fall back on" premise is falsified for
>   titanic**, one of the two in-scope fixtures that cell runs on. See the new block below the table
>   for the full result and what it narrows the fix to.
> - Uncapped ≡ max-that-fits on all three fixtures — **tautological** (a ~1M window was never going
>   to bind), not the hoped-for "was the cap ever binding" finding. The informative half came from
>   the 7B: Ollama's 32k `num_ctx` **did** bind on `stock_prices` (2,338 of 2,500 rows sent).
>
> **RIG findings (transfer totally; they are properties of the harness):**
> - `scoreC1`'s `DELETED`-condition bug — fixed, session 2. No historical Gemini replay was run.
> - `estimateTokens` under-estimates real prompt tokens by **≈30% (titanic, N=1) to 41–74%, mean
>   ≈59% (stock_prices, N=25)**, and the gap grows with prompt density. `assemble.ts`'s
>   "max-that-fits" rung is sized against that estimator, so **the A1 axis's rung labels are
>   uncalibrated on every arm.**
> - **`compliant` in `RunRecord` means schema-valid, not grounded, and at the ceiling condition the
>   two came apart completely** — see the ceiling-cell note below. Any future report of a raw
>   compliance rate must say so.

> #### `stock_prices::ceiling-control-max`, Ollama 7B — compliant is not grounded
>
> 11's session 7 records the ceiling prose-collapse as "**eliminated** — 5/5 compliant, up from
> 0/5." Schema-constrained decoding did fix the *parse* failure. It did not fix the *grounding*
> failure; it changed the failure's shape.
>
> All 5/5 repeats are `compliant: true`. All 5/5 have **`c2Ok: 0`** against non-trivial `c2Total`
> (30 / 13 / 3 / 8 / 3) — every structural, quality and behavioral claim fails citation closure.
> `avgCiteJaccard` across the 5 is exactly **0.00**: no two repeats cite even one overlapping fact
> id. The five headers were raw Chinese CSV column names, the literal string `"stock_prices"`, an
> English paragraph guessing "Alpha Vantage", an invented `"Crypto Market Data for Ethereum"`, and
> raw English column names. `cites` arrays held column names and row values
> (`["Open","High","Low","Close","Volume"]`) rather than resolvable fact ids.
>
> This is the largest-token cell in the cross (~16.3k prompt tokens, 2,338 rows) and it is **not
> context-window truncation** — `truncated: false` on every record, well inside 32768 `num_ctx`.
> It is the row-packing budget's own upper edge. Gemini's identical cell is 40/40 C2-ok with zero
> degradation, so this is not fixture difficulty shared by both tiers; it is 7B-specific at this
> density. **N=5** — enough to establish the failure exists and reproduces, not enough to locate
> the threshold.
>
> **The product consequence, which is the reason this is here and not in a footnote:** if
> `compliant` is used as a health signal, a shipped panel can be 100% schema-valid and 0% grounded
> at exactly the large-table case the product is for, and every structural monitor reads green.

> #### `titanic`, crossed cell (`OPAQUE` + `CORRUPTED`) — OPAQUE does not blind
>
> Rider R-B ([11's session 10](./11-gemini-comparison-arm.md#handoff--2026-07-30-session-10-r-a-and-r-b-run--opaque-does-not-blind-on-titanic))
> asked Gemini directly, under OPAQUE anonymisation, "what real-world dataset is this?" N=10,
> `rows=0` and `rows=max`, titanic and product_reviews, scored against a keyword list
> pre-registered before the run — not against the panel path, so this does not touch `scorePanel`
> or `RESULTS-*.json` (D58 honored).
>
> **Titanic: 10/10 hit rate at `rows=0`, all `high` confidence — the anonymisation leaks through
> column statistics alone, before a single row value is shown.** Representative excerpt: *"The
> table has exactly 891 rows, which is the exact row count of the standard Kaggle Titanic
> train.csv dataset..."* Row values (`rows=max`) added nothing — the hit rate was already 10/10 at
> `rows=0` — so the leak is entirely in the schema/row-count statistics `opaque.ts` currently
> leaves untouched, not in the values it does anonymise.
>
> product_reviews: 0/20 at both rungs — but this is not evidence the anonymisation *works*; the
> fixture has no documented public source corpus, so there was nothing memorised to leak. The
> contrast is fixture-specific, not a validation of the mechanism.
>
> **What this means for the crossed cell:** its stated premise — "no recall to fall back on" —
> does not hold for titanic. Kill criterion (c) still passes (the cell is interpretable), but
> interpretable is not the same claim as blind, and the two had been read together until now.
> **Tagged CEILING, dispositive downward**: if the frontier model can't be blinded, no smaller
> tier should be assumed blinded either. The fix, if pursued, is narrower than "extend `opaque.ts`"
> in general — it would need to perturb or bucket row counts and column cardinalities specifically,
> since names and values already anonymise well enough that product_reviews (which has real values,
> just no famous identity) never leaked.
>
> **Not decided here:** none of the six rows above cite the crossed cell as evidence for a
> "Winning architecture" decision — its role has been calibration/interpretability, not a decision
> input — so no row is amended by this finding. If a future session wants to close the gap,
> `opaque.ts` extended to row-count/cardinality bucketing, then a repeat of the crossed cell under
> the extended anonymisation, is the next concrete step; not authorised or scoped here.

Rows may legitimately land on different architectures. **That is the expected result, not a failure
to converge** — a header of app-composed counts beside a model-narrated Behavioral column beside a
deterministic offer list is a coherent product, and it is what the claim classes have been pointing
at since 05 first argued the paragraph was the wrong ask.
