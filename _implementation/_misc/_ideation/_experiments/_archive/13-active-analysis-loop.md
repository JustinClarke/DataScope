# 13 — Lucky 13: Qwen3 asks, DataScope computes, code proves

**Status (2026-08-01):** designed and pre-registered. No harness, model pull, model call, or product
integration was performed while creating this record. The first target is Ollama `qwen3:8b`
(`Q4_K_M`), with the exact tag, digest, quantization, context, sampler, and thinking mode captured
before any scored call. `qwen3:14b` is a separately authorized capacity rider, not part of the core
result.

This document is the active successor to experiments 11 and 12. It combines 11's useful half—the
model may request typed computations that DataScope compiles and runs—with 12's useful half—the
model must express any factual conclusion as Claim IR that deterministic code verifies before a
deterministic renderer may display it.

The short version:

```text
question
  -> compact dataset map + bounded computation menu
  -> Qwen3 requests evidence
  -> DataScope validates, computes, caches, and returns a compact evidence packet
  -> Qwen3 requests more evidence, selects a verified claim, selects an executable offer,
     or proposes a typed capability gap
  -> code verifies
  -> code renders
```

The model is the investigator. DataScope remains the calculator, evidence custodian, verifier, and
authoritative writer.

---

## Why this experiment exists

Experiment 11 showed that a small model can participate in a typed computation loop. After its
mechanical fixes, all four plans executed, invented fields failed before SQL, and DuckDB—not the
model—computed the values. It failed because prose plus citation ids did not prove that the prose
was entailed by the cited evidence.

Experiment 12 repaired that grounding boundary with explicit operands and operators. Its verifier
recorded zero false acceptances, and unsupported claims never reached display. Its N=5 core pass
still failed: `qwen2.5-coder:7b` returned the same `causal_inference` refusal for all 20 answerable
trials, producing zero factual yield. Fixed evidence plus a terminal `claim | unsupported` choice
made the system safe but useless.

Experiment 13 changes two things at once, then separates them in the comparison arms:

1. **Model fit:** use a general reasoning/agent model instead of a code-specialized model. Qwen3's
   official model card describes explicit thinking/non-thinking modes and tool integration. The
   core target is the local 8B tier, not a cloud ceiling.
2. **Active evidence acquisition:** `unsupported` is no longer the only alternative to making a
   claim. The model may request one or two bounded computations, inspect compact results, then
   decide what the evidence proves.

This is not permission for model-authored SQL, raw-row upload, free-form factual prose, or an
unbounded agent loop.

---

## Thesis and falsifiable hypotheses

### Thesis

A general tool-oriented model given a bounded computation menu can obtain more relevant evidence
with a lower per-call context high-water mark than a fixed-evidence prompt, while deterministic
execution, Claim IR verification, and rendering preserve experiment 12's zero-false-display
boundary.

### H1 — active evidence improves useful yield

On the same four answerable ecommerce questions used by experiments 11 and 12, Qwen3 with the
active loop yields a verified useful result on at least 3/4 questions in every N=5 repeat. A factual
answer must survive Claim IR verification. A next-step answer must reference an executable,
deterministically authored offer id.

### H2 — the loop buys context compression, not context elimination

The active arm's largest individual model request uses fewer prompt tokens than the fixed-evidence
Qwen3 arm's largest request. Total tokens across all turns may be higher and must be reported. No
claim may be made that tool execution is "free context"; only compact tool results replace bulk
evidence.

### H3 — Qwen3 reduces terminal-refusal collapse

No typed unsupported reason is reused indiscriminately across answerable questions. An
uncorroborated unsupported proposal counts as a yield failure even though it is safe to suppress.

### H4 — safety remains architectural

Across all answerable questions and negative controls, no false, unverifiable, scope-incompatible,
or semantically substituted claim reaches the renderer. A single false displayed claim fails the
experiment, regardless of model or ROI.

### H5 — model choice and loop value are distinguishable

The scored comparison includes a fixed-evidence Qwen3 arm and an active-loop Qwen3 arm using the
same pinned model and generation configuration. Their difference measures the loop. Experiment
12's immutable Qwen2.5-Coder run remains a historical reference for the combined model-and-contract
pivot, not a clean causal control.

---

## What this experiment does not claim

- It does not prove that Qwen3 is a trustworthy calculator.
- It does not allow Qwen3 to write or execute SQL.
- It does not infer authoritative business semantics from column names alone.
- It does not prove that `sum(quantity * unit_price)` is revenue or that revenue is profit.
- It does not prove causation, forecast quality, or statistical significance.
- It does not send raw rows to a cloud provider or reopen the product's rows-free wire decision.
- It does not certify arbitrary datasets from one ecommerce fixture.
- It does not authorize product integration, an ADR amendment, or removal of D65.
- It does not treat valid JSON, valid tool calls, or fluent analysis as grounding.

---

## The boundary: four jobs, four owners

| Job | Owner | Why |
| :--- | :--- | :--- |
| Interpret the user's analytical intent and choose which bounded evidence would help | Qwen3 | This is the semantic judgment being tested |
| Validate plans, compile SQL, execute DuckDB, label metrics literally, track scope/completeness, cache results | DataScope | These operations are deterministic and inspectable |
| State a factual relation as explicit evidence operands plus an operator | Qwen3 | The model may propose meaning, but not establish truth |
| Verify the relation and render user-visible text | DataScope | False relations and unsupported semantics must be unrepresentable at display |

The model never owns a numeric value, SQL string, join path, authoritative metric label, unit,
completeness assertion, or rendered factual sentence.

---

## Output lanes: do not force every question into Claim IR

Experiment 12's Claim IR can express `comparison`, `extremum`, `change`, and `threshold`. That is a
good grammar for atomic factual relations. It cannot literally answer "What transforms should I
apply?" Treating a creative bridge over that mismatch as model quality would reward an impossible
contract.

Experiment 13 therefore has two final lanes:

1. **Verified fact:** a Claim IR over persisted evidence. The existing experiment 12 verifier and
   deterministic renderer remain authoritative.
2. **Executable next step:** an id from a deterministic `AnalysisOffer[]`. The app owns the probe
   definition and wording; the model only selects the relevant id.

There is no free-form factual or recommendation lane.

---

## The bounded analysis protocol

### Turn 0 — DataScope prepares state

DataScope creates and persists:

- a compact dataset passport: tables, fields, physical/semantic types, row counts, candidate keys,
  inferred relationships, null counts, cardinalities, and temporal ranges;
- a deterministic capability-gap map for concepts that are provably absent, such as cost or age;
- a bounded `ProbeCandidate[]` generated from field types and known relationships;
- a bounded `AnalysisOffer[]` for executable next steps;
- the original user question and budgets.

No raw rows, sample values, SQL, model-authored labels, or precomputed narrative enter the first
prompt.

### Turn 1 — Qwen3 chooses an action

The response is schema-constrained to exactly one of:

```ts
type AnalysisAction =
  | { action: 'request_probes'; candidateIds: string[] }
  | { action: 'final_claim'; claim: ClaimIR }
  | { action: 'final_offer'; offerId: string }
  | { action: 'unsupported'; reason: CapabilityGapCode };
```

Rules:

- `candidateIds` contains one or two unique ids from the supplied menu.
- A first-turn `final_claim` is legal only if a cited evidence packet already exists in the cache
  and was supplied in the prompt. During Checkpoint 5, cache reads are repeat-isolated (see Cache
  and context rules), so this path is reachable only within a repeat that has itself already
  produced the cited evidence — never from a different repeat, arm, or question.
- `final_offer` must reference an offered id byte-for-byte.
- `unsupported` is a proposal, not an authority. DataScope corroborates it against the deterministic
  capability-gap map. An uncorroborated refusal is suppressed and scored as a yield failure.
- Invalid structure permits at most one structural repair. A bad semantic choice does not.

### DataScope executes requested probes

For every accepted candidate id, DataScope:

1. resolves the immutable candidate definition;
2. validates referenced tables, fields, types, relationships, filters, limits, and cost;
3. compiles SQL locally;
4. executes it in DuckDB;
5. writes the plan, SQL, full result, compact evidence packet, timing, and cache key before the next
   model call;
6. returns only the compact evidence packet to Qwen3.

### Turn 2 — Qwen3 concludes or asks once more

The second prompt is regenerated from minimal state. It contains:

- the question;
- compact evidence returned so far;
- unresolved candidate ids with short deterministic descriptions;
- remaining probe and turn budgets;
- the same final output contract.

It does not replay raw provider responses, hidden reasoning, SQL, full query results, or the entire
first prompt.

Qwen3 may request one final probe round or return `final_claim`, `final_offer`, or `unsupported`.

### Hard stop

- Maximum two probe rounds.
- Maximum two probes per round.
- Maximum four executed probes per question.
- Maximum twelve rows returned to the model per evidence packet.
- Maximum eight evidence packets in model context.
- No repeated normalized probe in the same question.
- No automatic semantic retry after a verifier rejection.
- Exhausting the budget without a verified result is `no_useful_verified_result`, not success and
  not a fabricated answer.

---

## Probe candidates: DataScope authors, Qwen3 selects

The core experiment deliberately uses candidate selection rather than model-authored plans. This is
the smallest implementation that tests active analysis without asking an 8B model to invent a safe
query language program.

Each candidate contains:

```ts
interface ProbeCandidate {
  id: string;
  kind:
    | 'summary'
    | 'group_metric'
    | 'time_series'
    | 'compare_periods'
    | 'distribution'
    | 'top_k'
    | 'missingness'
    | 'join_coverage';
  metric: MetricSpec;
  dimension?: ColumnRef;
  timeGrain?: 'month' | 'quarter' | 'year';
  filters: TypedFilter[];
  maxResultRows: number;
  estimatedCostClass: 'small' | 'medium';
  relevanceTags: string[];
}
```

The prompt receives only `id`, a compiler-authored literal description, cost class, and relevance
tags. The complete typed definition remains server-side and immutable.

The initial ecommerce candidate set must include, where the schema supports them:

- monthly `sum(quantity * unit_price)`;
- average order value as the existing typed ratio;
- category `sum(quantity * unit_price)`;
- category quantity;
- status `sum(quantity * unit_price)`;
- distinct orders by customer country;
- table/field missingness;
- relationship join coverage;
- largest complete month-to-month change derived from the monthly packet;
- deterministic analysis offers corresponding to the above operations.

The compiler uses literal metric identities. A candidate may say
`sum(order_items.quantity * order_items.unit_price)`; it may not call that value `profit`, and it
must not upgrade it to authoritative `revenue` without a separately established semantic contract.

### Post-core rider: model-authored typed probes

Only if candidate selection passes may a later, separately authorized rider allow Qwen3 to author
the bounded `ProbePlan` grammar inherited from experiment 11. The same validator, cost guard, SQL
compiler, artifact writer, Claim IR verifier, and renderer apply. This rider measures whether extra
planning freedom earns reach or merely adds invalid and irrelevant probes. It cannot revise the
core verdict.

---

## Compact evidence contract

The model-facing packet contains no SQL and no prose title:

```ts
interface CompactEvidencePacket {
  id: string;
  metric: string;          // compiler-authored canonical identity
  unit: string;            // schema/metric-derived
  dimension?: string;      // canonical field identity and grain
  filters: string[];       // canonical typed filters
  completeness: 'complete' | 'truncated';
  sourceRowCount: number;
  returnedRowCount: number;
  rows: Array<{
    rowId: string;
    label: string;
    value: number | null;
    order?: number;
  }>;
}
```

The full result and SQL remain in immutable artifacts. Compactness never removes the metadata
needed to reject a false global maximum, reversed chronology, incompatible metric, or incompatible
unit.

---

## Cache and context rules

### Cache identity

```text
dataset content hash + normalized candidate definition + compiler version
```

A cache hit reuses the persisted deterministic evidence packet. It does not reuse a prior model
claim. Cache hits and writes are recorded separately.

### Repeat isolation for the scored core (Checkpoint 5)

The identity above is a product-shaped cache: it is deliberately blind to which run, arm, or
repeat asked for a candidate, because a real deployment should reuse a warm computation. Left
unmodified, this identity leaks across the N=5 core repeats: repeat 1 populates the cache for a
question's candidates, and repeats 2-5 then see those evidence ids already resolved in their Turn
0 prompt, so Turn 1's `final_claim` escape hatch ("legal only if a cited evidence packet already
exists in the cache") becomes trivially available from repeat 2 onward. That would turn "3/4
useful yield in every N=5 repeat" and the Stability metric into a measurement of one real trial
plus four cache-assisted ones, not five independent trials of the model's active-loop judgment.

For Checkpoint 5 only, every cache read and write is additionally keyed by `repeat id`. Each of the
five repeats therefore starts every question with a cold cache: no question's Turn 0 prompt may
carry a cached-evidence id from a different repeat, and no first-turn `final_claim` is legal on
repeat >1 unless that same repeat's own earlier turn produced the cited evidence. The
product-shaped (repeat-blind) identity above remains correct for Checkpoints 1-4 and for any later
product integration; repeat isolation is a scoring-only constraint that applies solely to
Checkpoint 5.

Cross-repeat cache warmth is a real and separate product question (does a second session benefit
from a first session's computation on the same dataset?). It is deliberately out of scope for the
core verdict and belongs, if pursued, on the Checkpoint 6 rider list, scored on its own terms and
not blended into H1 or Stability.

### Context accounting

For every call, record:

- exact prompt and response tokens reported by Ollama;
- locally estimated tokens, so estimator error remains visible;
- prompt bytes;
- number of candidate cards and evidence rows supplied;
- cumulative tokens for the question;
- per-question maximum prompt tokens;
- whether any state was repeated across turns;
- thinking tokens or thinking text bytes when the provider exposes them.

Report both total tokens and the single-call high-water mark. A lower high-water mark with a much
higher total is a tradeoff, not an unconditional win.

---

## Qwen3 model and generation contract

### Core target

- Ollama tag requested: `qwen3:8b`.
- Expected public package: about 8.2B parameters, `Q4_K_M`, approximately 5.2 GB, with tool and
  thinking support.
- Exact local tag and digest are resolved from `/api/tags` and written to the manifest before the
  first scored call. A mismatch stops the run.
- Harness context begins at 8192 because the experiment is testing compact active retrieval, not
  long-context packing. No scored prompt may approach the ceiling silently.

Primary references:

- [Qwen3-8B model card](https://huggingface.co/Qwen/Qwen3-8B)
- [Ollama `qwen3:8b` package](https://ollama.com/library/qwen3:8b)
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)

### Thinking and sampling preflight

Qwen's published guidance warns that greedy decoding can degrade thinking-mode behavior. Experiment
12's `temperature: 0` therefore must not be copied blindly.

Before any task call, one fixed synthetic, non-ecommerce compatibility case is run in each of two
modes:

1. thinking enabled with Qwen's documented sampling starting point (`temperature: 0.6`,
   `top_p: 0.95`, `top_k: 20`);
2. thinking disabled with the documented non-thinking starting point (`temperature: 0.7`,
   `top_p: 0.8`, `top_k: 20`).

Both use the exact `AnalysisAction` JSON schema. The preflight selects the first mode that:

- returns schema-valid JSON;
- keeps thinking separate from the JSON payload;
- selects the only valid synthetic candidate id;
- stays within the predeclared token cap.

If both pass, thinking mode is the core default because analytical planning is the hypothesis under
test. If neither passes, the experiment is blocked at platform compatibility; prompt repair on the
real questions is forbidden. The chosen mode and sampler are frozen for both scored arms.

### Optional 14B rider

`qwen3:14b` may run only after the 8B core has a terminal verdict and only with explicit
authorization. It is a capacity diagnostic:

- If 8B fails mechanically and 14B passes, the architecture has a tier floor.
- If both fail the same way, extra size did not repair the contract.
- If 8B passes, 14B is unnecessary unless a measured quality gap justifies its latency and memory.

The 14B result cannot retroactively turn an 8B shipping-tier failure into a pass.

---

## Scored arms

### Historical reference — experiment 12

`qwen2.5-coder:7b`, fixed hand-authored evidence, terminal Claim IR or unsupported, N=5. Its immutable
result is zero factual yield with zero false display. Do not rerun or merge its artifacts.

### Arm A — Qwen3 fixed evidence

Purpose: establish what the model swap earns without active evidence acquisition.

- Same Qwen3 digest and sampler as Arm B.
- Same four answerable questions and four negative controls.
- DataScope supplies the same deterministic evidence packets predeclared for experiment 12.
- The prompt explicitly asks for one verified supporting fact for factual questions or one
  executable offer for the transform question; it does not pretend an atomic fact is a complete
  narrative answer.
- One model call per question; no probe request permitted.

### Arm B — Qwen3 active analysis loop

Purpose: measure the incremental value and cost of model-directed computation.

- Same Qwen3 digest, sampler, questions, candidate generator, Claim IR verifier, offer registry, and
  renderer as Arm A.
- Starts with dataset map, capability gaps, candidate cards, and cached-evidence ids—not fixed full
  evidence. During Checkpoint 5, those cached-evidence ids are repeat-isolated (see Cache and
  context rules): they can only reflect the current repeat's own prior turns.
- Uses the bounded two-round protocol above.

Arm A versus Arm B measures the loop. The historical reference versus the Qwen3 arms is descriptive
because both model and contract changed.

---

## Question set and pre-response scoring intent

Reuse experiment 12's eight questions verbatim.

### Answerable

1. `understand-ecommerce` — a verified descriptive fact from monthly value or average-order-value
   evidence is relevant.
2. `sales-presentation` — a verified category quantity or category value extremum/comparison is
   relevant.
3. `odd-sales-investigation` — a verified unusual period, category, or status comparison is
   relevant; causal language is not.
4. `further-transforms` — an executable analysis offer is the correct lane; an atomic factual claim
   alone does not satisfy the question.

### Negative controls

1. Marketing campaign causation — `causal_inference`.
2. Most profitable category with no cost — `missing_cost`.
3. Customer age-group performance with no age — `missing_demographic`.
4. Global maximum from a truncated packet — `incomplete_scope`.

The answer key, candidate relevance tags, capability-gap expectations, and human-usefulness rubric
must be persisted before the first task response is read.

---

## Metrics and ROI

Report every metric per question, repeat, arm, and in aggregate.

| Metric | Meaning |
| :--- | :--- |
| Verified useful yield | Answerable questions ending in an accepted relevant Claim IR or executable relevant offer |
| False display | Any rendered claim/offer whose verifier or id boundary should reject it |
| Correct unsupported | Negative controls with the exact corroborated gap code |
| Refusal collapse | Reuse of one unsupported code where different evidence/capabilities apply |
| First-pass action validity | Schema-valid action using only supplied ids |
| Probe relevance | Requested probes whose pre-registered relevance tags match the question |
| Probe productivity | Executed probes contributing to the final verified result |
| Duplicate/wasted probes | Repeated, irrelevant, rejected, or unused probes |
| Total model calls | Includes repairs and every loop turn |
| Total prompt/response tokens | Sum across the complete question, not average per call |
| Context high-water | Largest single prompt in the question |
| Database cost | Compile and DuckDB execution milliseconds plus rows scanned/returned when available |
| End-to-end latency | Wall time including model, database, retries, and cache |
| Cache reuse | Hits, misses, and avoided executions — within-repeat only during Checkpoint 5; cross-repeat warmth is a separate, out-of-scope product question |
| Stability | Final disposition and selected evidence/offer overlap across N=5 |

Primary ROI is **verified useful results per 1,000 total model tokens**, reported alongside absolute
yield. If an arm has zero yield, do not manufacture an infinite ratio; report it as undefined and
state the zero denominator plainly.

Arm B earns positive ROI only if:

1. false display remains zero;
2. it meets the 3/4-per-repeat useful-yield bar;
3. useful yield is strictly higher than Arm A, or equal with lower total model tokens;
4. its single-call context high-water is lower than Arm A's;
5. median end-to-end latency is no more than 3x Arm A's; and
6. fewer than 25% of executed probes are duplicate, rejected, irrelevant, or unused.

These thresholds are predeclared. A better anecdote cannot override them.

---

## Kill criteria

Any one of the following fails the core candidate:

1. **False display:** any false or unverified factual statement reaches deterministic rendering.
2. **Boundary bypass:** model-authored SQL, numeric values, authoritative metric labels, units,
   completeness, or user-visible factual prose bypass deterministic ownership.
3. **Raw-row leakage:** any original row or sample value reaches a model prompt outside a compact
   aggregate evidence packet produced by an accepted probe.
4. **Scope failure:** a truncated packet supports a global extremum or an incomplete row set passes
   verification.
5. **Semantic substitution:** profit becomes revenue, age becomes country, causation becomes trend,
   or another adjacent metric is displayed.
6. **Yield failure:** Arm B produces fewer than 3/4 useful answerable results in any repeat.
7. **Control failure:** any unsupported control claim is displayed, or fewer than 3/4 controls have
   the exact corroborated reason in any repeat.
8. **Loop escape:** more than two rounds, more than four probes, a repeated normalized probe, or an
   unbounded result reaches the model.
9. **Untraceable run:** a model call, repair, plan, SQL statement, evidence packet, cache event,
   verifier result, or terminal disposition is absent from immutable artifacts.
10. **No ROI:** Arm B meets safety but fails the positive-ROI conditions above.

Structural JSON failure is a model-capability result, not a grounding failure. One repair is allowed
and remains in the denominator.

---

## What to build

Create only:

```text
eval/chat/13-active-analysis/
├── README.md
├── contracts.ts
├── candidateGenerator.ts
├── capabilityGaps.ts
├── compactEvidence.ts
├── analysisLoop.ts
├── qwen3Rig.ts
├── score.ts
├── runPreflight.ts
├── runFixed.ts
├── runActive.ts
├── *.test.ts
└── runs/<immutable-run-id>/...
```

Reuse by import, not copy:

- experiment 11's passport concepts and typed probe compiler where still sound;
- experiment 12's `ArtifactWriter`, metric grammar, ecommerce compiler/evidence representation,
  Claim IR parser, verifier, renderer, fixtures, and synthetic verifier cases;
- the repository DuckDB-Wasm eval engine.

Do not edit product code. If a reusable seam cannot be imported without side effects, extract the
smallest behavior-preserving shared eval module with tests; do not duplicate it into 13.

### Deterministic test gate before Qwen3 is pulled or called

Tests must prove:

- candidate generation is stable for identical dataset hashes;
- every candidate compiles or is rejected before exposure to the model;
- unknown, duplicate, over-budget, and wrong-type candidate ids fail;
- cache keys include dataset hash, normalized plan, and compiler version;
- cache hits reproduce byte-identical compact evidence;
- result compaction enforces row/packet limits without lying about completeness;
- capability gaps distinguish profit/revenue, age/country, causation/description, and
  complete/truncated scope;
- unsupported proposals require deterministic corroboration;
- final offers must be exact ids from the registry;
- final claims pass through experiment 12's unchanged verifier;
- false claims from F1/F2/F3 and experiment 12's complete synthetic suite still reject;
- token/context accounting sums turns correctly;
- the hard loop stop cannot be bypassed;
- immutable run logging covers calls, repairs, probes, SQL, evidence, cache, claims, offers, and
  terminal failures;
- no product module imports the experiment.

No live model call is admissible until this gate is green.

---

## Phased execution and stop rules

Six checkpoints, strictly sequential. Each has an explicit stop condition; none may be skipped or
reordered to save time.

**Model tier.** Checkpoints 1-3 are fully specified code and mechanical checks (contracts,
generators, preflight, diversity screen) — Sonnet is sufficient. Checkpoints 4-5 add a hand audit
of whether each rendered claim is truly entailed by its cited evidence, not a subtle misattribution
— the F1 failure class from the original probe doc: a real, adjacent-column, plausible-sounding,
wrong claim, of the kind a fast read misses. Run that audit pass on Opus. A misattribution
surviving the pass that produces the terminal verdict is the one mistake this experiment exists to
prevent.

### Checkpoint 0 — durable record

This document and the experiment index only. No code, pull, or model call. **Complete in the session
that created this record.**

**Status: complete (2026-08-01).**

### Checkpoint 1 — deterministic core

Build contracts, candidate generator, capability gaps, cache identity (including the Checkpoint 5
repeat-isolation key), compact evidence, loop state machine, scorer, and tests. Reuse the existing
deterministic compiler/verifier/renderer. No model call.

Stop if any deterministic test gate fails.

**Status: complete (2026-08-01).** `eval/chat/13-active-analysis/` (58 tests, `npx tsc -p
eval/tsconfig.json --noEmit` clean). Every deterministic test gate is green, including the full
experiment 12 synthetic verifier suite replayed through this loop unchanged, F1/F2/F3-shaped false
claims rejected end to end, and a `noProductImports`/no-model-call guard. `qwen3Rig.ts`,
`runPreflight.ts`, `runFixed.ts`, and `runActive.ts` remain unbuilt; they belong to Checkpoint 2.

### Checkpoint 2 — Qwen3 platform preflight

Resolve or pull `qwen3:8b`, pin its digest, and run only the two fixed synthetic compatibility calls.
Freeze the selected thinking/sampling mode. Do not inspect a task response.

Stop if neither mode satisfies the platform contract.

**Status: complete (2026-08-01).** `qwen3Rig.ts` and `runPreflight.ts` added (Checkpoint 1's
guardrail test now names these, plus the still-unbuilt `runFixed.ts`/`runActive.ts`, as the only
files in the directory permitted to call the provider). Resolved against the live endpoint:
`qwen3:8b`, digest `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`, `Q4_K_M`,
8.2B params, 40960 context — matches the expected public package. Both fixed synthetic calls
passed all four conditions (run `20260801T115146Z-734e7a`); thinking mode is the frozen core
default.

One platform finding worth carrying forward: with `format` (structured output) and `think:true`
combined, Ollama's reported `eval_count` was observed to count only the final constrained-JSON
tokens and silently exclude the thinking trace (16 reported vs. a ~614-character/~202-token
thinking block actually generated). `qwen3Rig.ts` now also reports a local byte-based token
estimate over content+thinking, and the preflight's token-cap check uses the max of the two —
otherwise a mode with runaway hidden thinking could pass on an under-reported count. Any later
checkpoint's context accounting (§ Context accounting) should use the same max(reported,
estimated) convention, not `eval_count` alone, whenever `format` and `think:true` are both set.

### Checkpoint 3 — turn-1 diversity screen

Experiment 12 failed silently: 40 scored calls collapsed to 2 unique response hashes, and the
collapse was invisible until every call was diffed after the full run. Checkpoint 2 only proves the
platform can return schema-valid JSON on one synthetic case; it cannot catch a degenerate model that
always requests the same candidate or always refuses. This checkpoint is the cheapest place to look
before committing to Checkpoint 5's N=5 budget.

Using the frozen sampler from Checkpoint 2, issue one Turn-1 `AnalysisAction` call per question —
all four answerable questions and all four negative controls, eight calls total — with no probe
execution and no second turn. Record the raw response hash, the selected action, and (for
`request_probes`) the requested candidate ids for each.

Stop if:

- the same response hash, or the same action-plus-candidate-ids selection, appears for more than
  half of the eight questions; or
- any answerable question and any negative control receive the identical selection **in at least two
  of three repeats of the eight-question screen** (amended 2026-08-01 — see Pre-registration
  amendment below; as originally written this condition fired on a single occurrence in a single
  run).

Either condition reproduces experiment 12's collapse signature and blocks Checkpoint 4 pending a
sampler or platform re-check. It does not authorize a prompt rewrite on the real questions.

**Status: first pass complete (2026-08-01), then invalidated and re-run — see below.** `runActive.ts`
added (turn-1 only; Checkpoints 4-5 extend the same file with the second-turn/probe-execution
path). Real ecommerce dataset map, candidate cards, and offers built via the reused
passport/candidate generator; frozen thinking-mode sampler from Checkpoint 2. All eight calls (run
`20260801T120119Z-e340eb`) returned schema-valid JSON with `doneReason: "stop"` and no parse
errors: eight distinct response hashes, eight distinct action-plus-candidate-ids selections (the
two `unsupported` controls share the coarse action-only signature but that count of 2 does not
exceed the more-than-4 threshold), and no answerable question shares its selection with any
negative control. Neither stop condition triggered.

**Invalidated (2026-08-01).** Preparing Checkpoint 4 surfaced two defects in the prompt surface
that run `20260801T120119Z-e340eb` was built on, both of which make its pass unreliable:

1. **The answer key was in the prompt.** `candidateCard` projected `relevanceTags`, and those tags
   were generated as Phase 5 *question ids* (`['sales-presentation']`), so a prompt that states the
   question also stated which candidates belonged to it. All four answerable questions selected
   exactly their own tagged candidates, which is what a string match looks like. § Metrics and ROI's
   probe-relevance metric was measuring that match, not judgment. Fixed by splitting
   `ProbeCandidate.questionRelevance` (question ids, scoring only, never projected) from
   `topicTags` (semantic, model-facing), with the same split on `AnalysisOffer`.
2. **Sample values reached the first prompt.** The map came from experiment 11's `compactPassport`,
   which emits `min`/`max` for every column; on VARCHAR columns those are verbatim cell values
   (`customers.email` min `alex.chen129@example.com`, `customers.name` min `Alex Chen`). § Turn 0
   forbids sample values in the first prompt and kill criterion 3 counts them as raw-row leakage, so
   auditing that run against Checkpoint 4's own stop list would have stopped it. Fixed by a
   13-local `datasetMap.ts` that keeps the § Turn 0 authorized facts and restricts `min`/`max` to
   Temporal columns. Experiment 11 is still imported unedited.

`assertPromptSurfaceClean` now checks both classes before the first model call of any run, and
`datasetMap.test.ts` pins the experiment 11 leak so the seam cannot be swapped back silently.

**Status: re-run BLOCKED (2026-08-01).** Re-screened under the corrected prompt, same pinned
digest and frozen thinking-mode sampler (run `20260801T122631Z-92b0af`, eight schema-valid calls,
no parse errors, no mechanical audit findings). The second stop condition triggered: **an
answerable question and a negative control returned byte-identical responses.**
`sales-presentation` ("What can I present to a sales team from this data?") and `causal-control`
("Did the January marketing campaign cause revenue to increase?") both returned response hash
`28a15c1ec8f7…`, selecting `["monthly-revenue","largest-monthly-change"]`. Diversity otherwise
weakened but did not itself trip a rule: 5/8 distinct response hashes and 5/8 distinct selections,
with the more-than-four threshold untouched.

Three of the four answerable questions changed selection once the question ids left the prompt, so
the first pass's clean separation was substantially an artifact of defect 1 above. Per this
checkpoint's stop rule, **Checkpoint 4 is blocked pending a sampler or platform re-check**; a
prompt rewrite on the real questions is not authorized.

#### Platform re-check — complete, 24/24 samples (2026-08-01)

The re-check the stop rule authorizes, finished. Diagnostic only: it issues the exact scored turn-1
prompts by import, executes no probes, takes no second turn, and writes nothing into `runs/`. Same
pinned digest `500a1f067a9f7826`, same frozen thinking-mode sampler, three repeats of all eight
questions.

**The blocking collision did not reproduce.** No answerable question shared a selection with any
negative control in any of the three repeats. Both stop conditions clear in all three: 6/8 distinct
selections per repeat, against a threshold that trips only when one selection covers more than four
of the eight. The screen run's `sales-presentation` == `causal-control` identity is best read as a
sampling coincidence at `temperature: 0.6`, not a collapse.

| repeat | distinct selections | distinct hashes | answerable/control collisions | answerable/answerable duplicates |
| :--- | ---: | ---: | :--- | :--- |
| 1 | 6/8 | 6/8 | none | `sales-presentation` == `further-transforms` |
| 2 | 6/8 | 7/8 | none | `understand-ecommerce` == `further-transforms` |
| 3 | 6/8 | 7/8 | none | `sales-presentation` == `further-transforms` |

The two `unsupported` controls share the coarse action-only signature in every repeat, as they did
in the screen; that is the intended answer for both and is not a rule trip.

#### Pre-registration amendment — Checkpoint 3 collision rule (2026-08-01)

Recorded **before** the re-screen authorized below, so that the re-screen is not a re-roll against
an unchanged rule.

The re-check confirms the handoff's reading 2: turn-1 output is concentrated on a small set of
selections, and identical short JSON across unrelated questions arises readily. Every repeat
produced one answerable/answerable duplicate, two of three at byte-identical hashes. A rule that
fires on a single occurrence in a single run is therefore measuring output entropy at least as much
as it measures an inability to separate answerable questions from controls.

The second stop condition is amended to read: **the screen trips when the same answerable/control
selection identity recurs in at least two of three repeats of the eight-question screen.** A single
occurrence in a single repeat is recorded and carried into the Checkpoint 4 audit, but does not
block.

Scope of the amendment, deliberately narrow:

- It governs Checkpoint 3's screen only.
- It does not touch the first stop condition (the more-than-half response-hash rule), which was
  never close to tripping.
- It does not touch § Kill criteria, § Metrics and ROI, the Claim IR verifier, or any Checkpoint 5
  scoring. Nothing about what counts as a false display, a yield failure, or a control failure
  changes.
- It is not a licence to rewrite the prompt on the real questions. That remains forbidden.

The sampler re-check the original stop rule offered as the alternative is **not** taken. It existed
to find a sampler under which the screen passes; the frozen thinking-mode sampler passes across
three repeats. Switching to `NON_THINKING_MODE` now would unfreeze a Checkpoint 2 decision with no
failure motivating it.

#### Two findings that outlast the block

Neither trips a stop condition. Both are pre-registered here so the Checkpoint 4/5 audit reads them
as evidence rather than discovering them late.

1. **`further-transforms` never selects an offer.** Zero `final_offer` actions in 48 turn-1 samples
   (24 diagnostic plus the 24 scored screen calls below), across every question, not just this one.
   In all three repeats its turn-1 selection was byte-identical to another answerable question's.
   This is
   the one question whose correct lane is an executable offer (§ Question set). It can still reach an
   offer at turn 2 after seeing evidence, and turn 1 is not the terminal action — but it is 1 of the
   4 answerable questions, and H1 requires 3/4 useful yield in every repeat. Read a miss here as
   model fit, consistent with the existing carry-forward note about the category probe.
2. **`profit-control` requests `category-revenue` rather than proposing `missing_cost`,** in all six
   turn-1 samples (three diagnostic, three scored). The cost gap is deterministic and present in the
   capability-gap map. Turn 2 can still
   land the correct gap code after the evidence returns, and only the terminal action is scored
   against § Metrics and ROI's Correct-unsupported metric — but not recognizing a provable absence
   upfront is a model-fit signal for the audit.

#### Status: PASSED (2026-08-01) — three scored screen runs

Re-screened under the amended rule. Three independent `runActive.ts --turn1-only` runs, same pinned
digest and frozen thinking-mode sampler, no prompt/schema/candidate change. All 24 calls returned
schema-valid JSON with no parse errors.

| run id | distinct hashes | answerable/control collisions |
| :--- | ---: | :--- |
| `20260801T172901Z-6cd169` | 6/8 | none |
| `20260801T173436Z-c4370c` | 5/8 | none |
| `20260801T173845Z-2d1d61` | 6/8 | none |

Neither stop condition trips. The amended second condition requires an answerable/control identity
in at least two of three repeats; it occurred in zero. The first condition requires one response to
cover more than four of the eight; the maximum was three. **Checkpoint 4 is unblocked.**

#### Carry into the Checkpoint 4/5 audit: answerable-question convergence

The screen passed, but it passed alongside a pattern its rules are not shaped to catch, recorded
here before any Checkpoint 4 response is read.

`sales-presentation` and `further-transforms` returned byte-identical responses in all three scored
runs (`d669795f05b3`, requesting `monthly-revenue, average-order-value`), and `understand-ecommerce`
joined them in runs 1 and 2 — three of the four answerable questions converging on one turn-1
action. This falls between the two stop conditions: the second pairs answerable questions against
controls, and the first counts only whether a single response covers more than half of all eight.
Three answerable questions sharing one response satisfies neither test.

The consequence is for H1, not for safety. H1 requires a verified useful result on at least 3/4
answerable questions in every repeat. If three of those four questions are answered from identical
evidence, they may yield the same verified fact three times, which scores as 3/4 useful yield while
demonstrating substantially less than the hypothesis intends. As § Metrics and ROI is written,
"three useful results" and "one useful result reached three times" are indistinguishable.

This is deliberately **not** amended here. Changing what H1 counts is a scoring change to the core
verdict, categorically larger than the Checkpoint 3 screen amendment above, and it is not made
after seeing turn-1 behaviour. It is registered as a known measurement weakness, and the Checkpoint
4/5 Opus audit must report whether distinct answerable questions produced distinct verified facts
or the same fact repeated. Verdict wording at Checkpoint 5 must state which of those occurred.

One harness note: the diagnostic claimed in the previous handoff to be resumable was not — it
initialized its sample array empty and overwrote its output, so a kill discarded the whole run. It
now reloads persisted samples and skips completed `(repeat, question)` pairs. The five repeat-1
samples from the prior session were preserved and are included in the 24 above.

### Checkpoint 4 — paired N=1 smoke

Use only `sales-presentation`, preselected before responses. Run Arm A once and Arm B once. Inspect
every artifact on Opus (see Model tier above). Arm B must request a relevant category probe and end
in a verified category fact; both arms must stay inside their contracts.

Stop on any false display, missing artifact, raw-row leak, unbounded call, or verifier bypass.

**Status: complete (2026-08-01). No stop condition tripped; the checkpoint's stated expectation was
not met.** Arm A `20260801T174540Z-46f79f`, Arm B `20260801T180110Z-299a4b`. One earlier Arm B
attempt, `20260801T174637Z-b492ff`, is void: its first turn-1 call hung 13m36s and died on
`read ETIMEDOUT` before any response was received. No model output was seen, so re-running was not a
re-roll; the void run is retained, and its `run_interrupted` event and persisted call record are
themselves evidence that kill criterion 9 holds on the transport-failure path.

**Neither arm tripped a stop condition.** No false display, no missing artifact, no raw-row leak, no
unbounded call, no verifier bypass. Both claims are true against their packets:

- **Arm A** — `extremum` over `evidence:category-revenue`, subject r2, scope all six rows,
  `completeness: complete`. Books at 507,332.51 USD is genuinely the maximum (next: Toys,
  388,395.77). Rendered: *"Books (507,332.51 USD) was the maximum for the complete evidence scope."*
  One call, no repair.
- **Arm B** — three turns, four probes (`monthly-revenue`, `average-order-value`,
  `largest-monthly-change`, `status-revenue`), all four cold cache misses, no rejections, no repairs.
  `extremum` over `evidence:status-revenue`, subject r2, scope all four rows,
  `completeness: complete`. `completed` at 952,190.31 USD is genuinely the maximum. Rendered:
  *"completed (952,190.31 USD) was the maximum for the complete evidence scope."* Loop bounds held
  exactly: two rounds, two probes per round, four probes, three turns.

#### Finding 1 — the renderer omits the dimension **(fixed 2026-08-01)**

Both sentences use one template that never names the dimension it ranked over. Arm A's subject
`Books` is `products.category`; Arm B's subject `completed` is `orders.status`. The sentences are
indistinguishable in shape, and a reader of Arm B's cannot tell what `completed` is — the most
available reading is that it is another category.

This is not a false claim and not kill criterion 5: the metric is labelled literally, the unit is
correct, nothing calls the value revenue or profit. But § The boundary assigns DataScope the
rendered sentence precisely so that a false impression cannot be created at display, and a
dimension-free extremum sentence invites the reader to supply the wrong dimension. The verifier
proves the relation; the sentence then discards the context that makes the relation meaningful.
Fix the template to name the dimension before Checkpoint 5, as a deterministic-renderer change with
no effect on what the verifier accepts.

**Fixed.** `renderer.ts` (13-local, so experiment 12 stays imported unedited — the same seam
treatment as `datasetMap.ts`) renders an extremum as *"completed (952,190.31 USD) was the maximum
across orders.status for the complete evidence scope."* The dimension is the packet's existing
compiler-authored `dimension` field, so `VerifiedFact` is unchanged and the verifier's
accept/reject set is untouched; every other fact kind delegates to `renderVerifiedFact` verbatim.
Both arms and the loop's `final_claim` handler render through it. Tests pin the dimensioned
sentence, the no-dimension fallback, the other three kinds, and — end to end through `step()` —
the exact Arm B status claim that produced this finding.

#### Finding 2 — Arm B's answer is true and close to useless

"Completed orders are the largest status bucket" is an artifact of most orders being completed. As
an answer to "What can I present to a sales team?" it is materially weaker than Arm A's category
extremum, which came from fixed evidence the model did not choose. The active loop spent four
probes and three turns to arrive somewhere worse than the arm that did no acquisition at all.

Under § Metrics and ROI this still scores as verified useful yield if the relevance tags accept it,
which is itself a warning about the metric: it separates verified-and-relevant from
verified-and-irrelevant only as sharply as the pre-registered tags do. The Checkpoint 5 audit must
apply the human-usefulness rubric to this exact case and say plainly whether a status extremum
answers a sales-presentation question.

#### Finding 3 — H2 points the wrong way on this sample

H2 predicts the active arm's largest single request is smaller than the fixed-evidence arm's. On
this N=1 it is larger, by a wide margin:

| | Arm A | Arm B |
| :--- | ---: | ---: |
| context high-water (prompt tokens) | 1,373 | 2,504 |
| total prompt tokens | 1,373 | 6,303 |
| model calls | 1 | 3 |
| wall time | ~51s | ~101s |

Arm B's high-water is 1.8x Arm A's and its total prompt tokens 4.6x, for a less useful answer. On
these numbers Arm B would fail positive-ROI conditions 3 and 4. Latency stayed inside condition 5
(~2x, cap 3x).

N=1 on one question cannot settle H2 — the fixed-evidence packets for this question are small, and
a question needing more fixed evidence would move the comparison. But the mechanism is visible and
plausible: each Arm B turn resends the dataset map, candidate menu, and offer menu, and accumulated
evidence is added on top, so the last turn is the largest prompt of the run. Compact evidence
replacing bulk evidence does not by itself shrink the high-water when the menu is resent every
turn. Record this before Checkpoint 5 rather than discovering it in the aggregate.

#### Finding 4 — the pre-registered category expectation failed, as anticipated

"Arm B must request a relevant category probe and end in a verified category fact" did not happen:
no category probe was requested in four, and the final fact is a status fact. This was flagged in
advance (below) once the question ids left the prompt, and the doc directed that a miss be read as
model fit rather than a harness bug. That reading stands. Checkpoint 4's listed stop conditions are
separate from this expectation and none of them fired, so the checkpoint does not stop — but it
completed without meeting its stated success expectation, and Checkpoint 5 inherits that.

#### Finding 5 — two harness gaps to fix before Checkpoint 5 **(both fixed 2026-08-01)**

Neither affects the results above; both would degrade Checkpoint 5's audit.

1. **Arm A does not run the prompt-surface guard.** Arm B logs `prompt_surface_checked` (0 question
   ids, 0 sample values) before its first call; Arm A's event stream has no such event.
   `runFixed.ts` composes its own prompt, including a source-field listing. Its prompt was read
   by hand for this checkpoint and is clean — aggregate evidence only, field names without sample
   values — but kill criterion 3 applies to both arms, and Arm A is currently clean by luck rather
   than by construction. Call `assertPromptSurfaceClean` in `runFixed.ts`.
2. **Raw response text is not persisted.** Call records keep `parsedValue` and `responseHash` but
   not the model's actual output, and `message.thinking` is dropped. That is enough to prove a call
   occurred and to detect tampering, but not enough for the Checkpoint 5 Opus audit to read what the
   model actually said in a borderline case, which is the audit's purpose. § Artifact additions
   permits retaining provider reasoning. The Checkpoint 3 diagnostic had to be written specifically
   because the harness drops it.

Also minor: `durationMs` is 0 on the error path (visible in the void run) while correct on success.
End-to-end latency is scored in § Metrics and ROI and gates ROI condition 5, so failed calls in
Arm B would silently understate exactly the arm with more calls to fail.

**Fixed, with one correction to 5.1 as written.** `runFixed.ts` did call
`assertPromptSurfaceClean` before the Checkpoint 4 run — the source hash in run
`20260801T174540Z-46f79f`'s manifest is byte-identical to the file audited — but it checked the
wrong surface: it passed Arm B's *candidate menu*, which Arm A never sends, and omitted both the
source-field listing and the offer menu, which Arm A does send. So the finding's conclusion was
right for a reason it did not state: Arm A's prompt was clean by inspection, not by construction.
Arm A now guards its own prompt, composed from the same strings the prompt is built from, for
every selected question before the first model call, and emits `prompt_surface_checked` like Arm
B. Verified against the real fixture: all eight questions clean, no false positive.

One line is deliberately excluded from that guard — the deterministic evidence packets. The
guard's sample-value rule rejects any non-temporal column extreme, and an aggregate group label
legitimately *is* one (`products.category` max is `Toys`; a category-revenue packet must label a
row `Toys`). Kill criterion 3 forbids a sample value "outside a compact aggregate evidence
packet", and these packets are compiled from predeclared plans by experiment 12's unchanged
compiler, so they are aggregate by construction. Guarding them would fail every run for no
reason, in the same way the guard already skips numeric extremes.

5.2: every call record in both arms now carries the raw response content and `message.thinking`
where the provider exposes it (`contracts.ts`'s `CallArtifact`, an extension of experiment 12's
`RawCallArtifact` so 12 stays unedited). Retained per § Artifact additions; never replayed into a
later prompt and never treated as evidence. `durationMs` is now measured on the error path too.

Both arms are built and green against the deterministic gate, so this checkpoint is one command per
arm once the block clears: `runFixed.ts` (Arm A — experiment 12's predeclared packets, the
`request_probes`-free schema, one call plus at most one structural repair) and `runActive.ts`
(Arm B — full Turn 0/1/2 protocol, bounded at two rounds, four probes, three turns), both filtered
with `--questions=sales-presentation`.

One expectation in this checkpoint is in doubt independently of the block, and the evidence against
it has since hardened. "Arm B must request a relevant category probe and end in a verified category
fact" was written against pre-registered relevance tags that named the question in the prompt; the
category selection recorded in Checkpoint 3's first pass came from that defect. Under the corrected
prompt, `sales-presentation` selected no category probe in any of the three scored screen runs — it
returned `["monthly-revenue","average-order-value"]` in all three. Expect Arm B to miss the category
probe here, and read that as a finding about model fit, not as a harness bug to fix.

### Checkpoint 5 — scored N=5 core

Run all eight questions, both arms, N=5, with order randomized by a persisted seed, and with Arm B's
cache reads and writes repeat-isolated per the Cache and context rules above — no question's Turn 0
prompt may carry a cached-evidence id from a different repeat. No prompt, schema, candidate,
sampler, or score changes after the first task response. Audit every artifact on Opus (see Model
tier above) before writing the verdict, then produce a terminal verdict from persisted artifacts
and append a dated handoff here.

**Status: in progress, paused mid-run (2026-08-01).** The three harness fixes Checkpoint 4
required, plus the repeat/seed harness (`--repeats`, `--seed`, repeat-isolated artifacts,
non-fatal transport failure, `scoreCheckpoint5.ts`) this checkpoint itself needed, have landed. A
scored `--repeats=5` attempt was launched and paused by user request partway through Arm A repeat
4/5; Arm B has not run. A finding from the partial data — `profit-control` affirmatively answering
past its `missing_cost` gap in all four completed repeats — is flagged for an Opus audit verdict
before restarting. See the most recent session handoff below for the full state and the exact
next steps.

### Session handoff — 2026-08-01 (earlier session; superseded by the handoff below)

**State when written: Checkpoint 4 blocked, not started.** Retained for the record of how the block
arose and what the partial re-check showed; its "Next, in order" list has since been executed and is
superseded.

What changed in `eval/chat/13-active-analysis/` in that session (all green: 65 tests, `tsc` clean;
experiments 11 and 12 still imported unedited):

- `datasetMap.ts` (new) — the model-facing passport projection, replacing experiment 11's
  `compactPassport` in the prompt path, plus `assertPromptSurfaceClean`, which runs before the
  first model call of every run and throws on a leaked sample value or question id.
  `datasetMap.test.ts` pins the experiment 11 leak so the seam cannot be swapped back silently.
- `candidateGenerator.ts` — `questionRelevance` (question ids, scoring only) split from
  `topicTags` (semantic, model-facing); `offerCard` applies the same split to offers.
- `prompts.ts` (new) — Arm B's prompt surface extracted from `runActive.ts` so a diagnostic can
  issue the exact scored prompts rather than a copy. `SYSTEM_PROMPT` is byte-identical to the one
  Checkpoint 3 ran under.
- `runFixed.ts` (new) — Arm A, complete.
- `runActive.ts` — full Turn 0/1/2 loop with probe execution; `--turn1-only` preserves the
  Checkpoint 3 screen, `--questions=<id,...>` selects a checkpoint's subset. Repairs and
  transport failures are now both counted and persisted.
- `contracts.ts` — `FIXED_EVIDENCE_ACTION_SCHEMA` / `parseFixedEvidenceAction` for Arm A;
  `capabilityGaps.corroborateUnsupported` widened to the base `EvidencePacket` so both arms
  corroborate through the same function.

**The block.** Run `20260801T122631Z-92b0af`: `sales-presentation` and `causal-control` returned
byte-identical responses selecting `["monthly-revenue","largest-monthly-change"]`. One sample
cannot separate a systematic collapse from a sampling coincidence at `temperature: 0.6` over a
nine-candidate menu, which is what the in-flight re-check is for.

**Platform re-check — partial (5 of 24 samples).** A diagnostic (writes nothing into `runs/`)
reissuing the exact turn-1 prompts three times per question and retaining `message.thinking`,
which the harness drops. It was killed at a session boundary after five samples. Script and
output:
`/private/tmp/claude-501/-Users-justin-github-DataScope/2a22973b-8b50-44c9-b92c-07e5ecc72eb6/scratchpad/`
(`thinkingProbe.ts`, `thinking-probe.json`, `thinking-probe.log`); it appends after every call and
is safe to resume by rerunning. If that scratchpad is gone, `runActive.ts --turn1-only` run twice
answers the reproducibility half without it. *(Correction: it was not resumable — see the harness
note under Checkpoint 3. It is now.)*

Repeat 1, against run `20260801T122631Z-92b0af`'s screen selections:

| question | kind | re-check selection | hash | thinking |
| :--- | :--- | :--- | :--- | ---: |
| understand-ecommerce | answerable | join-coverage, table-missingness | `814375275c20` | 1696c |
| sales-presentation | answerable | average-order-value, monthly-revenue | `d669795f05b3` | 1751c |
| odd-sales-investigation | answerable | country-orders, status-revenue | `f4890510ba14` | 1674c |
| further-transforms | answerable | average-order-value, monthly-revenue | `d669795f05b3` | 2482c |
| causal-control | control | largest-monthly-change, monthly-revenue | `28a15c1ec8f7` | 6233c |

Three readings, all provisional on five samples:

1. **The blocking pair was not deterministic.** `sales-presentation` moved off the colliding
   selection entirely, and `odd-sales-investigation` moved too. The specific
   answerable/control collision that blocked the screen did not reproduce.
2. **But collisions are cheap.** Two *answerable* questions collided with each other on identical
   hashes in this repeat, and `causal-control` landed on precisely the hash `sales-presentation`
   had produced in the screen run. Turn-1 output is concentrated on a small set of selections, so
   identical short JSON across unrelated questions arises readily. The pre-registered rule may
   therefore be measuring low output entropy rather than an inability to separate answerable from
   control — which is a real finding about the contract, not a reason to ignore the rule.
3. **The reasoning is not collapsing even where the JSON coincides.** `causal-control` produced a
   6233-character thinking trace against `sales-presentation`'s 1751. The model reasons very
   differently about the causal question and still emits the same 21-token shape. That points at
   the constrained-output path flattening a distinction the model did make.

**Not committed.** The working tree carries all of the above unstaged, per this repository's
convention that commits are the human's.

### Session handoff — 2026-08-01 (earlier session; its "Next" items 1-3 are now done)

**State when written: Checkpoints 3 and 4 complete. Checkpoint 5 not authorized — three harness
fixes to land first (Finding 5 and Finding 1 under Checkpoint 4).**

What this session did, in order:

1. Finished the platform re-check — all 24 samples, no answerable/control collision in any of three
   repeats. The blocking pair did not reproduce.
2. Recorded the Checkpoint 3 rule amendment (two-of-three repeats) **before** re-screening, with its
   scope fenced to the screen.
3. Re-screened: three scored `runActive.ts --turn1-only` runs, all passing —
   `20260801T172901Z-6cd169`, `20260801T173436Z-c4370c`, `20260801T173845Z-2d1d61`.
4. Declined the `NON_THINKING_MODE` sampler re-check, with the reason recorded.
5. Ran Checkpoint 4, both arms, and audited every artifact on Opus. No stop condition tripped; five
   findings recorded under Checkpoint 4 above.

No code changed this session except the diagnostic's resume logic (scratchpad only). No product
code, no prompt, no schema, no candidate, no sampler, no scoring change. Experiments 11 and 12
remain imported unedited.

**Next, in order. Checkpoint 5 must not start until items 1-3 are done** — each degrades the scored
run or its audit, and all three are cheap now and expensive to retrofit after 80 scored calls:

1. Name the dimension in the deterministic renderer's extremum template (Finding 1). Renderer-only;
   the verifier's accept/reject set must not change. Extend the existing renderer tests.
2. Call `assertPromptSurfaceClean` in `runFixed.ts` (Finding 5.1), so Arm A is guarded by
   construction rather than by inspection.
3. Persist raw response content, and `message.thinking` where the provider exposes it, in every call
   record (Finding 5.2). Fix `durationMs` on the error path while there.

Then Checkpoint 5, unchanged in scope: all eight questions, both arms, N=5, order randomized by a
persisted seed, Arm B's cache repeat-isolated. Brief the audit before it reads any artifact on:
answerable-question convergence (H1 may count one fact three times), `further-transforms` never
selecting an offer, `profit-control` probing instead of proposing `missing_cost`, and Findings 1-4
from Checkpoint 4. The audit must report whether distinct answerable questions produced distinct
verified facts, and must apply the human-usefulness rubric to verified-but-trivial extrema such as
Arm B's status result.

An honest prior going in: on the single paired sample, the active loop cost 4.6x the prompt tokens
and produced a worse answer than the fixed-evidence arm. H2 and the ROI conditions are the live risk
to this experiment, not safety — the grounding boundary has now held everywhere it has been tested.

**Not committed.** The working tree carries all of the above unstaged, per this repository's
convention that commits are the human's.

### Session handoff — 2026-08-01 (current)

**State: Checkpoints 0-4 complete, the three pre-Checkpoint-5 harness fixes landed, and Checkpoint
5 is authorized to start. No model call was made this session.**

What changed in `eval/chat/13-active-analysis/` (70 tests green — 65 before, +4 renderer, +1 loop
wiring — and `npx tsc -p eval/tsconfig.json --noEmit` clean; experiments 11 and 12 still imported
unedited):

- `renderer.ts` + `renderer.test.ts` (new) — Finding 1. `renderFact` names the dimension in the
  extremum sentence and delegates every other kind to experiment 12's `renderVerifiedFact`. Wired
  into `analysisLoop.ts`'s `final_claim` handler and `runFixed.ts`.
- `runFixed.ts` — Finding 5.1. Guards Arm A's own prompt surface (every line but the evidence
  packets) for every selected question before the first model call, and emits
  `prompt_surface_checked`. `promptFor` now returns the prompt and that guarded surface from one
  line array, so the guarded string cannot drift from the prompt.
- `contracts.ts`, `runFixed.ts`, `runActive.ts` — Finding 5.2. `CallArtifact` extends experiment
  12's `RawCallArtifact` with `rawContent` and `thinking`; both arms persist them, and both fixed
  `durationMs` on the transport-failure path.
- Both manifests hash `renderer.ts` alongside the other deterministic sources.

No prompt, schema, candidate, sampler, or scoring change. The verifier's accept/reject set is
untouched: the only display change is the added dimension clause on the extremum sentence.

Two notes for whoever runs Checkpoint 5:

1. Finding 5.1 was slightly wrong as recorded, and the correction is written into it above: Arm A
   *did* call the guard, on the wrong surface. Nothing about the Checkpoint 4 verdict changes —
   Arm A's prompt was read by hand and was clean — but the fix is a redirect, not an addition.
2. The Checkpoint 4 artifacts keep the old dimension-free sentence. That is correct; they record
   what was displayed at the time. Only Checkpoint 5's own runs will carry the new template, and
   the audit brief below should say so, since the two runs' rendered sentences are not comparable
   byte-for-byte.

Then Checkpoint 5, unchanged in scope: all eight questions, both arms, N=5, order randomized by a
persisted seed, Arm B's cache repeat-isolated. Brief the audit before it reads any artifact on:
answerable-question convergence (H1 may count one fact three times), `further-transforms` never
selecting an offer, `profit-control` probing instead of proposing `missing_cost`, and Findings 1-4
from Checkpoint 4. The audit must report whether distinct answerable questions produced distinct
verified facts, and must apply the human-usefulness rubric to verified-but-trivial extrema such as
Arm B's status result.

The honest prior from the previous handoff stands unchanged: on the single paired sample the
active loop cost 4.6x the prompt tokens and produced a worse answer than the fixed-evidence arm.
H2 and the ROI conditions are the live risk, not safety.

**Not committed.** The working tree carries all of the above unstaged, per this repository's
convention that commits are the human's.

### Session handoff — 2026-08-01 (current, mid-Checkpoint-5, paused by user)

**State: Checkpoint 5's harness gaps are closed and green, a scored attempt was launched and
paused partway through Arm A, and one finding from the partial data needs an Opus audit verdict
before any restart.** No Checkpoint 5 verdict exists. Nothing committed.

**What this session built**, all green (93 tests, up from 70; `npx tsc -p eval/tsconfig.json
--noEmit` clean):

- `repeats.ts` (new) — `--repeats=`/`--seed=` parsing, a seeded per-repeat question order derived
  deterministically from `sha256(seed|repeat|questionId)` (reproducible from the manifest alone,
  no unlogged PRNG state), `repeatId()` (namespaces a repeat only when the run has more than one),
  and `artifactStem()` (`rep<N>-<questionId>` prefix so N repeats of one question cannot collide
  in one run directory). `Checkpoint5Manifest` extends experiment 12's `RunManifest` with a
  `checkpoint5: { seed, repeats, order }` block.
- `analysisLoop.ts` — `resolveOne`'s and `handleFinalClaim`'s artifact filenames now go through
  `artifactStem`, keyed by `state.repeatId`.
- `runActive.ts` — threads `repeatId` into `createLoopState` per § Cache and context rules'
  Checkpoint-5-only repeat isolation; a transport failure (the `read ETIMEDOUT` class that voided
  a Checkpoint 4 run) now ends *one question*, marked `transportFailure` in the record and
  excluded from the scored denominator, instead of aborting the whole run. Manifest persists
  `checkpoint5.order`.
- `runFixed.ts` — same repeat plumbing and transport-failure isolation for Arm A.
- `scoreCheckpoint5.ts` (new) — reads only persisted `verdict.json`/`events.jsonl`, computes every
  § Metrics and ROI row per question/repeat/arm/aggregate, evaluates the six predeclared
  positive-ROI conditions and the scoreable kill criteria (1, 6, 7, 8, 10 — 2, 3, 4, 5, 9 need the
  Opus audit, not a scorer). Deliberately reports rather than judges the two things the § Model
  tier note reserves for Opus: whether a verified fact is *relevant*, and whether distinct
  answerable questions produced distinct facts or one repeated (`distinctRenderedFacts` alongside
  `usefulCount`, so H1's blind spot from the Checkpoint 3 carry-forward is visible in the output
  rather than folded away). Smoke-tested against the Checkpoint 4 runs and reproduces their
  numbers exactly (high-water 1,373 vs 2,504; 6,303 Arm B prompt tokens).
- `repeats.test.ts`, `scoreCheckpoint5.test.ts` (new) — cover seeded-order reproducibility,
  cache-key isolation across repeats, the "3 useful results" vs "1 fact repeated 3 times"
  distinction, kill-criterion-1/8 detection, and the ROI-4 (context high-water) failure shape from
  Checkpoint 4's own N=1 sample.

Harness note: `qwen3:8b` is not on the machine's local Ollama at `localhost:11434` (only
`openchat` and `qwen2.5-coder:1.5b` are) — that is a red herring, not a Checkpoint 2 break. The
rig's actual default endpoint (`qwen3Rig.ts`) is `OLLAMA_BASE_URL=http://100.126.157.97:11434`, a
Tailscale host, and `qwen3:8b` there still resolves to the pinned digest
`500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`. A local `ollama pull qwen3:8b`
was started against the wrong host before this was caught; it was killed and its partial blobs
removed (`~/.ollama/models/blobs`, ~700MB freed) — the local store is back to its prior state and
nothing about the pin changed. **Next session: check `OLLAMA_BASE_URL`, not `localhost`.**

**Harness validated** on `--questions=sales-presentation --repeats=2 --seed=harness-validation`,
both arms: per-repeat artifact stems didn't collide, the manifest's `checkpoint5.order` matched
what ran, and the two repeats' cache keys for the identical candidate differed (`6290…` vs
`af55…`) — repeat isolation holds at the artifact level, not just by inspection of the code.

**The scored attempt.** Launched `runFixed.ts --repeats=5 --seed=checkpoint-5-20260801` then
(chained) `runActive.ts` with the same flags, arms sequential rather than parallel so ROI
condition 5's latency comparison isn't distorted by GPU contention. **Stopped by user request**
partway through Arm A repeat 4 of 5 (~28 of 40 Arm A question-runs; Arm B never started). Run
`20260801T185254Z-32ee40` has no `verdict.json` (`inspectRun` will report it `incomplete`) but
every call, evidence packet, and per-question disposition up to the stop point is on disk under
`runs/20260801T185254Z-32ee40/`. The runners have no resume-in-place; restarting means a fresh run
id and re-running Arm A's five repeats from the top (~35 min), then Arm B (~70+ min).

**Flagged finding, unresolved, needs the Opus audit before deciding whether to restart.** In
**all four completed repeats** (not a coincidence in one), `profit-control` — "which category is
most profitable?", answer key `missing_cost` — did not refuse. It returned `final_claim`, the
verifier accepted it, and it rendered:

> Books (507,332.51 USD) was the maximum across products.category for the complete evidence scope.

The claim is an `extremum` over `evidence:category-revenue` and is true of that packet — the
verifier is behaving exactly as specified, the metric is labelled literally, and the sentence
never says "profit". But it is displayed as the answer to a profitability question on a dataset
with no cost column, which is the § Kill criteria 5 case by name: "profit becomes revenue... or
another adjacent metric is displayed." That is the F1 misattribution class this experiment exists
to prevent, per the § Model tier note.

Traced one level, not adjudicated: `capabilityGaps.ts`'s `corroborateUnsupported` only fires when
the model itself proposes `action: 'unsupported'` with a reason — it corroborates a *proposal*,
it does not intercept a `final_claim`. `verifyClaim` (experiment 12, unchanged) checks structural
entailment against the cited evidence packet, not whether the packet's metric is the semantic
concept the question asked about. So as built, nothing in the pipeline can block a category-revenue
extremum from answering a profit question if the model simply claims it rather than proposing
`unsupported`. Whether that is a genuine kill-criterion-5 violation requiring a fix, or an
accepted edge of "the model may propose meaning, but not establish truth" that the § Kill criteria
list already anticipates and scores as a control failure rather than a safety failure, is exactly
the judgment the Model tier note reserves for Opus — not resolved here.

**Next, in order:**

1. **Opus audit of the `profit-control` finding**, reading `capabilityGaps.ts`,
   `runs/20260801T185254Z-32ee40/claims/rep{1,2,3,4}-profit-control-disposition.json`, and the
   cited `evidence/rep*-profit-control-r*-category-revenue.json` packets. Verdict needed: does
   this trip kill criterion 5, and if so does the fix belong in the verifier (reject a claim whose
   evidence's declared metric doesn't match a semantic tag the question implies) or is it correctly
   a control-failure metric miss, not a display-safety miss, because the sentence itself never
   asserts "profit"?
2. Depending on (1)'s verdict: either patch the boundary (verifier or corroboration layer) with
   tests, or record why the current behavior is acceptable — before spending the ~2h scored run
   again.
3. Restart the scored core clean, same or new seed, both arms, N=5, all eight questions.
4. Full Opus audit per the brief already registered above: answerable-question convergence
   (`distinctRenderedFacts` now surfaces this in the scorer output), `further-transforms` never
   selecting an offer, `profit-control` probing instead of proposing `missing_cost` (now sharpened
   by finding 1 above — it didn't just fail to propose the gap, it affirmatively answered past
   it), and Findings 1-4 from Checkpoint 4, including the human-usefulness rubric on
   verified-but-trivial extrema.

**Not committed.** The working tree carries all of the above unstaged, per this repository's
convention that commits are the human's.

### Checkpoint 6 — optional riders

Separately authorized only after the core verdict:

- Qwen3 14B capacity diagnostic;
- model-authored typed-probe grammar;
- second dataset family for coverage;
- Workers AI or browser-tier portability;
- free-form editor over already rendered deterministic sentences;
- cross-repeat cache warmth as its own measurement, scored separately from H1/Stability.

No rider may revise the core result.

---

## Artifact additions over experiment 12

Retain experiment 12's manifest-first, append-only, crash-safe run contract. Add:

```text
runs/<run-id>/
├── candidates/<question-id>.json
├── turns/<question-id>-turn-01.json
├── probes/<question-id>-probe-01.json
├── sql/<question-id>-probe-01.sql
├── evidence/<question-id>-probe-01-full.json
├── evidence/<question-id>-probe-01-compact.json
├── cache/<question-id>-probe-01.json
├── claims/<question-id>-draft.json
├── claims/<question-id>-validation.json
├── offers/<question-id>-selection.json
└── verdict.json
```

The manifest additionally records Qwen3 thinking mode, sampler fields, output-token cap, loop
budgets, candidate-generator version, compiler version, cache version, and all prompt/schema hashes.

Raw provider reasoning is retained only if Ollama exposes it as a distinct field and the artifact
policy allows it; it is never replayed into later prompts or treated as evidence.

---

## Verdict

_Unrun._ Checkpoints 0-4 are complete. The core verdict requires Checkpoint 5's N=5 scored run,
which has not started.

What is established so far: the deterministic core and its test gate hold; `qwen3:8b` is pinned and
thinking mode frozen; the turn-1 screen passes across three scored runs after a recorded amendment
to its collision rule; and on one paired N=1 sample both arms stayed inside their contracts with no
false display, no raw-row leak, and no verifier bypass. The grounding boundary has held everywhere
it has been tested.

What is in doubt is the loop's value, not its safety. On that same sample the active arm used 4.6x
the prompt tokens and 1.8x the context high-water of the fixed-evidence arm — the wrong direction
for H2 — and ended in a true but near-useless status extremum where the fixed arm produced a
relevant category fact. The three harness fixes that had to precede Checkpoint 5 have landed; see
the current session handoff.

