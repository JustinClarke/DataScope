# 13 — Lucky 13: deterministic core, platform preflight, turn-1 diversity screen

Checkpoints 1-3 of [13-active-analysis-loop.md](../../../_implementation/_misc/_ideation/_experiments/13-active-analysis-loop.md).

Checkpoint 1: contracts, candidate generator, capability gaps, cache identity (including the
Checkpoint 5 repeat-isolation key), compact evidence, the loop state machine, and the scorer. No
harness, model pull, or model call was performed while building this part of the directory —
`guardrails.test.ts` asserts everything except the Checkpoint-2+ files named below stays that way.

Checkpoint 2: `qwen3Rig.ts` (tag/digest resolution, the AnalysisAction-schema chat call under a
fixed sampler mode) and `runPreflight.ts` (the two fixed synthetic compatibility calls). Pinned
`qwen3:8b`, froze thinking mode as the sampler default; see the experiment doc's Checkpoint 2
status for the result and a token-accounting finding about `format` + `think:true` combined.

Checkpoint 3: `runActive.ts --turn1-only` — one real-ecommerce Turn-1 `AnalysisAction` call per
Phase 5 question (all four answerable, all four negative controls) under the frozen thinking-mode
sampler, with no probe execution and no second turn. Scores the experiment-12 collapse signature
(response-hash reuse, coarse action-plus-candidate-ids reuse, and any answerable/negative-control
selection collision) directly from the persisted calls.

The first pass passed; preparing Checkpoint 4 then found two prompt-surface defects it had run
under — question ids projected onto candidate cards as `relevanceTags`, and experiment 11
`compactPassport` column extremes carrying verbatim VARCHAR cell values into the first prompt.
The corrected re-run blocked on the answerable/control collision rule, a 24-sample platform
re-check did not reproduce the collision, and the screen **passed** across three scored runs
under an amended (two-of-three-repeats) collision rule. Full detail in the experiment doc's
Checkpoint 3 status.

Checkpoint 4 (paired N=1 smoke on `sales-presentation`): **complete**, no stop condition tripped.
`runActive.ts` without `--turn1-only` runs the full Turn 0/1/2 protocol with probe execution;
`--questions=<id,...>` selects the subset a checkpoint calls for. Five findings are recorded in
the experiment doc; the three harness fixes they required — `renderer.ts` below, Arm A's own
prompt-surface guard, and raw response/thinking retention in every call record — have landed, so
Checkpoint 5 is unblocked.

Everything here is additive. No file under `11-evidence-loop/` or `12-verified-claims/` was
edited; those directories are imported unchanged:

- `../11-evidence-loop/passport.ts` — `buildPassport`, reused for the compact dataset passport.
- `../12-verified-claims/phase3Plans.ts` and `phase5Protocol.ts` — the exact ecommerce plans and
  the exact eight Phase 5 questions (reused verbatim, not re-authored).
- `../12-verified-claims/ecommercePipeline.ts` — `compileEcommercePlan` / `executeEcommercePlan`,
  the SQL compiler behind every metric-bearing probe candidate.
- `../12-verified-claims/claimIr.ts`, `verifier.ts`, `renderer.ts` — Claim IR, `verifyClaim`, and
  `renderVerifiedFact`, unchanged. `analysisLoop.ts`'s `final_claim` handler calls `verifyClaim`
  directly; it does not reimplement any part of it. Every fact kind but `extremum` is rendered by
  `renderVerifiedFact` verbatim (see `renderer.ts` below).
- `../12-verified-claims/artifactWriter.ts` — `ArtifactWriter`, reused for immutable run logging.

## What's new in this directory

- `contracts.ts` — `ProbeCandidate`, `CompactEvidencePacket`, `AnalysisAction`, `AnalysisOffer`,
  `CapabilityGapCode` (= experiment 12's `UnsupportedReason`, same vocabulary), loop budgets, and
  `FIXED_EVIDENCE_ACTION_SCHEMA` (Arm A's action space: the same grammar minus `request_probes`).
- `datasetMap.ts` — the model-facing projection of the passport, deliberately not experiment 11's
  `compactPassport`: that one emits `min`/`max` for every column, which on a VARCHAR column is a
  verbatim cell value and so a § Turn 0 / kill-criterion-3 leak. Keeps the § Turn 0 authorized
  facts and restricts extremes to Temporal columns. Also exports `assertPromptSurfaceClean`, run
  before the first model call of every run, which throws on either a leaked sample value or a
  leaked Phase 5 question id.
- `renderer.ts` — the display seam (§ Checkpoint 4, Finding 1). Experiment 12's extremum template
  never names the dimension it ranked over, so "completed (952,190.31 USD) was the maximum …" and
  "Books (507,332.51 USD) was the maximum …" are the same sentence shape and the first invites the
  reader to take an `orders.status` for a product category. `renderFact` adds the packet's
  compiler-authored dimension to that one sentence and delegates every other kind to
  `renderVerifiedFact`. No change to `VerifiedFact` and none to what the verifier accepts.
- `candidateGenerator.ts` — deterministic `generateCandidates(passport)`: wraps the reused
  ecommerce plans plus two passport-only candidates (`table-missingness`, `join-coverage`, read
  directly off `DatasetPassport` — no SQL) and one derived candidate (`largest-monthly-change`,
  computed from an already-resolved `monthly-revenue` packet). A candidate carries two separate
  tag sets: `questionRelevance` (the pre-registered Phase 5 question ids, used only by `score.ts`
  and never projected onto a card — sending them would let the model match the asking question's
  id against a tag string and make probe relevance circular) and `topicTags` (semantic,
  model-facing). `candidateCard` projects only `id`/`description`/`estimatedCostClass`/`topicTags`;
  `generateOffers` produces one deterministic `AnalysisOffer` per candidate operation, and
  `offerCard` applies the same split to offers.
- `capabilityGaps.ts` — `buildCapabilityGapMap` (schema-driven: profit/revenue and age/country are
  distinguished by column presence, not wording; causal claims are never corroborated because no
  dataset this generator serves carries experimental-design metadata) and
  `corroborateUnsupported`, which treats a model's `unsupported` action as a proposal to check, not
  an authority.
- `cache.ts` — `candidateCacheKey` (dataset content hash + normalized candidate definition +
  compiler version, plus an optional Checkpoint-5-only `repeatId`) and a plain `EvidenceCache`.
- `compactEvidence.ts` — turns a resolved candidate into a `CompactEvidencePacket`, capping every
  packet to 12 rows and recomputing `completeness` against the *true* source row count (obtained by
  wrapping the unmodified compiled SQL in a `COUNT(*)` subquery, not by re-deriving the join logic).
- `analysisLoop.ts` — the Turn 0/1/2 state machine: `request_probes` validation (unknown/
  duplicate/over-budget/wrong-type/unresolved-dependency all rejected before execution),
  `final_claim` via the unchanged verifier, `final_offer` via byte-exact registry lookup, and
  `unsupported` via capability-gap corroboration. Accepts an optional `ArtifactWriter` and logs
  every probe request/rejection/execution, cache hit/miss, claim/offer/unsupported evaluation, and
  terminal disposition.
- `score.ts` — pure metric functions from § Metrics and ROI (verified useful yield, correct
  unsupported, refusal collapse, probe relevance/productivity, cache reuse, primary ROI, stability).
  No live run exists yet at Checkpoint 1, so these are exercised with synthetic fixtures.

- `runFixed.ts` — Arm A (§ Scored arms): experiment 12's predeclared evidence packets recomputed by
  the unchanged compiler/executor, one model call per question plus at most one structural repair,
  and `FIXED_EVIDENCE_ACTION_SCHEMA` so `request_probes` is not even decodable. It carries no
  dataset map on purpose — adding one would inflate Arm A's prompt and hand H2's context high-water
  comparison to Arm B for a reason unrelated to the loop under test. Verification, rendering, offer
  lookup, and gap corroboration go through the same functions Arm B uses. `assertPromptSurfaceClean`
  runs over Arm A's own prompt — every line of it except the deterministic evidence packets, whose
  aggregate group labels legitimately coincide with a column extreme (`products.category` max is
  `Toys`, and a category-revenue packet must label a row `Toys`; kill criterion 3 forbids sample
  values *outside* a compact aggregate packet).

## Artifact directory mapping

§ Artifact additions names `candidates/`, `turns/`, `probes/`, `offers/`. Experiment 12's
`ArtifactWriter` is reused unchanged (it accepts `plans`/`evidence`/`claims` plus `calls/`, `sql/`,
and `events.jsonl`), so those land as: candidates and predeclared plans in `plans/`, every model
turn and repair in `calls/`, probe results in `evidence/` and `sql/`, and claims, offers, and
terminal dispositions in `claims/`. Kill criterion 9's list — call, repair, plan, SQL, evidence
packet, cache event, verifier result, terminal disposition — is covered by that mapping.

Each call record additionally keeps the model's raw response content and, where the provider
exposes it, its thinking trace (`contracts.ts`'s `CallArtifact`; § Artifact additions permits
retained provider reasoning). Neither is ever replayed into a later prompt or treated as evidence
— they exist so a Checkpoint 5 audit can read what the model actually said in a borderline case,
which `responseHash` alone does not allow.

## Running it

```sh
npx vitest run --config eval/chat/13-active-analysis/vitest.config.ts
npx tsc -p eval/tsconfig.json --noEmit --pretty false

npx tsx eval/chat/13-active-analysis/runPreflight.ts                        # checkpoint 2
npx tsx eval/chat/13-active-analysis/runActive.ts --turn1-only              # checkpoint 3 screen
npx tsx eval/chat/13-active-analysis/runFixed.ts  --questions=sales-presentation   # checkpoint 4 arm A
npx tsx eval/chat/13-active-analysis/runActive.ts --questions=sales-presentation   # checkpoint 4 arm B
```
