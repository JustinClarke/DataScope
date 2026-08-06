# 15 — Cleared-context loop: fixed-boundary, equal-ceiling context clearing

**Status (2026-08-06): Checkpoints 1-8 complete, plus task authoring and the pilot runner.**
"The only build 15A requires" (contracts, provider usage accounting, ledger persistence, midpoint
briefing builder, checkpoint validation, the forked harness, the gold-file check runner, truthful
tool descriptions) was done first; task authoring (`tasks.ts`, twelve frozen tasks against the
existing `orders`/`customers` fixture) and the pilot runner (`runPilot.ts`) are now built on top of
it. Neither has produced a real result yet: `resolveQwen3`'s live-host preflight has never
succeeded — no Ollama endpoint has been reachable from wherever this has been run so far — so the
unscored pilot run itself (§ Task set and repetitions, run order #1) has not started. `runPilot.ts`
is code-complete and its wiring is proven against a scripted fake provider (`runPilot.test.ts`);
it has not yet been proven against the real model.

Building the pilot runner surfaced one real bug in already-"complete" Checkpoints 6/7: `Artifact`
carried no `arm` tag, so `createGoldFileChecker`'s unscoped `listArtifacts` scan let control's
phase-two evidence silently satisfy treatment's copy of the same `Requirement` row (`runExperiment15A`
always runs control before treatment). `forkedHarness.test.ts` never caught this because every one
of its scenarios injects a hand-rolled fake `checkRequirements`, never the real gold-file checker,
across a real two-arm run — `runPilot.test.ts` is the first thing in this directory that does both
at once. Fixed by giving `Artifact` an `arm: ArmTag` field and threading `visibleArms` through
`checkRequirements`'s signature (`contracts.ts`, `ledger.ts`, `forkedHarness.ts`, `goldFile.ts`),
mirroring the scoping `Attempt`/`findAttemptsByRequestHash` already had. All 245 tests across this
directory and `eval/analyst/conformance.test.ts` pass with the fix in place.

Builds [15-cleared-context-loop.md](../../../_implementation/_misc/_ideation/_experiments/15-cleared-context-loop.md)
§§18-387 (Experiment 15A) — the only part of that document authoritative for a build. Everything
past "Design history below — non-authoritative for Experiment 15A" in the source doc (the product
architecture, the full reasoning ledger, MCP parity) is design history, not this experiment's
scope; do not pull from it without amending the protocol first.

15A tests one causal question: with the same instructions, tools, evidence system, midpoint
briefing, terminal synthesizer and whole-analysis resource ceilings, does clearing the first
half's transcript at a fixed midpoint improve analytical performance over retaining it?

**Model, amended 2026-08-06: Ollama `qwen3:8b`**, superseding the Gemini Flash family the protocol
had proposed. The protocol marked that input "proposed, confirm before the pilot," and this is the
confirmation. `geminiProvider.ts` stays in the directory — the amendment makes cloud-model
portability the later ablation, and deleting the seam would only mean rebuilding it to run one.

## Build order

15A's own "The only build 15A requires" section names seven pieces, in the order this directory
builds them as checkpoints (mirroring how `../13-active-analysis/` was built — additive,
contracts before harness before model calls):

1. **Contracts** (this checkpoint) — the five-relation ledger vocabulary (Requirements, Attempts,
   Artifacts, Checkpoint state, Round accounting), the checkpoint schema, and provider usage
   accounting types. No harness, no provider, no model call exists yet.
2. Provider usage accounting — raw vs. billable prompt/output tokens per call, the "hard
   prerequisite" the doc names: every equal-enforced-ceiling claim in 15A rests on this, and the
   current common provider response does not supply it (§7.3).
3. The five-relation ledger persisted in DuckDB, plus exact-duplicate identity (`requestHash`
   canonicalization).
4. The deterministic midpoint briefing builder and its frozen ranking rule.
5. Typed checkpoint validation — schema, id existence, allowed transitions, one bounded repair
   attempt.
6. The forked harness — shared phase one, snapshot, fork into two isolated branches, enforce
   ceilings, record terminal reasons.
7. The gold-file check runner for machine-executable mandatory-requirement satisfaction.
8. Truthful tool descriptions for the frozen operation profile (closing the `get_schema` /
   `describe_table` / `column_stats` / chart-form drift §7.3 names).

Task authoring (the twelve frozen tasks) and the pilot runner are explicitly *not* part of "the
only build 15A requires" — they start only once this directory's harness is frozen, which it now
is. Both are built (see below); the pilot *run* itself and the scored run have not started, both
gated on a reachable Ollama host.

## What's new in this directory

- `contracts.ts` — `Requirement`, `Attempt`/`AttemptFingerprint`, `Artifact`,
  `Checkpoint`/`CandidateClaim`/`WorkItem`/`EvidenceLocator`, `RoundAccounting`/`TaskOutcome`,
  `MidpointBriefing`, the frozen `PHASE_CEILINGS`/`WHOLE_ANALYST_CEILINGS`/
  `CONSECUTIVE_FAILURE_LIMIT` constants, the `TERMINAL_REASONS` table, and `CallUsage`/
  `UsageTotals`/`accountUsage` for raw-vs-billable token accounting. A "verified finding" is
  modeled as a reference to an `Artifact` (`FindingRef`), not a new ledger entity — 15A's minimum
  ledger is five relations, not the deferred packet's full claims/reasoning-notes system, and
  nothing here reaches past line 387 of the source doc for its shape.
- `contracts.test.ts` — exercises `accountUsage` and `toFingerprint`, and pins the frozen ceiling
  and terminal-reason constants against the doc's literal values so a future edit to either can't
  silently drift.
- `geminiProvider.ts` (Checkpoint 2) — `createUsageTrackedGeminiProvider`, a third self-contained
  Gemini caller alongside `../10-grounding-ladder/geminiRig.ts` and
  `../10-grounding-ladder/providers/geminiProvider.ts` (that experiment's own precedent: "one env
  var, two seams — do not try to unify them"; 15A is a new lineage, not a descendant of 10). Splits
  Gemini's `usageMetadata` into raw vs. billable `CallUsage` via `usageFromMetadata`:
  `rawOutputTokens` includes `thoughtsTokenCount` (thinking is sampling, not infrastructure) and
  `billablePromptTokens` subtracts `cachedContentTokenCount` (cached tokens are billed at a
  reduced, not zero, rate — this is the full-price/reduced-price split the doc's distinction
  needs). Unlike the two existing callers, a missing `usageMetadata` **throws** rather than
  falling back to a `-1` sentinel — 15A's enforced ceilings and its frozen verdict are keyed to
  raw token counts, so a silently-poisoned sentinel would corrupt every downstream sum.
- `geminiProvider.test.ts` — `usageFromMetadata`'s splits and its three throw cases, plus the
  provider's `onUsage` reporting, multi-call parsing, and 429-retry behavior against a mocked
  `fetchImpl` (no live network call in this suite).
- `qwen3Provider.ts` (Checkpoint 2, amended) — the seam 15A actually runs on. Self-contained rather
  than an import from `../13-active-analysis/qwen3Rig.ts` for a reason stronger than the usual
  precedent: 13 drives this model through **constrained JSON** (`format: schema`) and 15A drives it
  through **native tool calls**, so the two callers agree on a base URL and a model tag and almost
  nothing else. Three amendment consequences it exists to handle:
  - **Silent truncation.** Ollama defaults `num_ctx` to 4096 and truncates an over-long prompt
    without erroring. 15A's control arm carries the whole phase-one transcript and the treatment
    carries only the briefing, so a too-small window cuts the control and never the treatment — the
    measured effect would be Ollama's truncation policy wearing the mechanism's name. `NUM_CTX` is
    served identically to both arms, and a prompt reaching `TRUNCATION_MARGIN` of it throws
    `ContextTruncationError` **before** `onUsage`, so a cut-off call never enters the totals the
    verdict is computed from. This hazard does not exist on a cloud provider; it is the single
    biggest thing the model change introduces.
  - **Thinking tokens.** Experiment 13 recorded `eval_count` silently excluding the thinking trace
    (`../13-active-analysis/qwen3Rig.ts` L76). Thinking is sampling, not infrastructure, so it
    belongs in raw output tokens — the same call `geminiProvider.ts` makes for `thoughtsTokenCount`.
    `usageFromChatBody` substitutes a local estimate and sets `outputTokensEstimated` only when
    `eval_count` falls below a byte estimate of the trace *alone*, which is the point at which
    exclusion is certain rather than suspected. Accounting is exact with thinking off, which is why
    the frozen sampler defaults there.
  - **No billing.** Ollama has no per-token price and no prefix cache, so billable equals raw and
    the protocol's raw-vs-billable split collapses to one number. The fields are kept anyway so
    `accountUsage` stays provider-agnostic.

  `resolveQwen3` is the preflight the protocol means by "resolved to an exact digest before any
  scored call". It also asserts the `tools` capability, which has to be checked rather than assumed:
  13 used constrained JSON precisely because structured tool calling was not settled for the small
  models this repo has used (`DATASCOPE.md` §872 records `qwen2.5-coder:1.5b` never emitting
  `tool_calls`). **Not yet run against a live host** — no Ollama endpoint was reachable when this
  landed, so the capability is asserted at preflight, not verified here.
- `qwen3Provider.test.ts` — usage accounting including both thinking branches, digest/capability
  preflight failures, multi-call and JSON-string argument parsing, and the truncation guard both
  throwing and withholding usage. Mocked `fetchImpl` throughout; no live network call.
- `duplicateIdentity.ts` (Checkpoint 3) — `computeRequestHash` (pre-execution identity: dataset
  revision + operation + canonical parameters) and `computeResultHash` (observed-output identity,
  deliberately materialization-order-specific — see the file's comment on why that's the honest
  choice over an unordered-multiset hash). Exact hashing only; no semantic-equivalence claim.
- `ledger.ts` (Checkpoint 3) — the five-relation DDL (`createLedgerSchema`) and typed
  insert/list/get functions per relation. Structured fields are stored as `VARCHAR` containing
  `JSON.stringify` output rather than DuckDB's `JSON` type, so nothing depends on a JSON extension
  being loaded on either engine. Pure persistence only — `findAttemptsByRequestHash(engine, hash,
  arms)` is a scoped query a harness calls *before* deciding whether an attempt is a duplicate;
  this file never makes that decision itself, and branch isolation is enforced by which `arms` the
  caller passes in, not by anything internal to the ledger.
- `duplicateIdentity.test.ts`, `ledger.test.ts` — hash determinism/sensitivity, and full
  insert/round-trip coverage per relation (including arm-scoped duplicate lookup and the
  checkpoint/round-accounting upsert-replaces-not-duplicates behavior a bounded repair attempt
  needs) against a real in-process DuckDB engine (`createEvalEngine`, `@vitest-environment node`).
- `briefingBuilder.ts` (Checkpoint 4) — `buildMidpointBriefing`, assembling already-fetched ledger
  state into the bounded packet per § Midpoint briefing contract's frozen rank order: all
  requirements (never truncated) → verified findings (artifacts that satisfied a requirement,
  first; newest-first within each group) → model-authored caveats → open work by declared priority
  → deduplicated failure/duplicate fingerprints. Fills greedily in that strict order and stops the
  instant the next item would exceed `maxSerializedBytes` — no skip-ahead to fit a smaller
  lower-priority item once a bigger one didn't fit. `maxSerializedBytes` has no default: the doc
  reserves that ceiling for pilot measurement, so this file never fabricates an unmeasured "frozen"
  number. Schema/relationship text is accepted as an input, not computed here — that needs a live
  analyst-core connection this file deliberately doesn't hold (the forked harness's job).
- `briefingBuilder.test.ts` — required-content-survives-any-budget, ranking (linked-before-unlinked,
  newest-first, priority-ascending, fingerprint dedup), and bounded-truncation behavior, including a
  regression test for a self-referential sizing bug the greedy loop originally had (the
  `serializedByteSize` field's own digits inflated the packet after being written in — fixed by
  measuring content excluding that field, the same reason an HTTP `Content-Length` header doesn't
  count its own bytes).
- `checkpointValidator.ts` (Checkpoint 5) — `validateCheckpointSubmission` (schema + id-existence
  checking against a caller-supplied set of known artifact ids) and a small submission state
  machine (`awaiting_first → awaiting_repair → closed`) implementing the one-bounded-repair-attempt
  rule. 15A's own checkpoint schema has no requirement-status field to validate a transition on —
  "the model may add work items... it may not reframe a mandatory requirement" is enforced
  structurally, by the schema having no channel for it, not by a runtime check.
- `checkpointValidator.test.ts` — schema rejection cases (unknown fields, empty evidence locators,
  unknown artifact ids, duplicate claim/work-item ids), and the full state-machine matrix (valid
  first submission, repaired second, still-invalid second, and the throw on a third attempt).
- `forkedHarness.ts` (Checkpoint 6) — `runOperationLoop` (one phase's provider round-trip loop:
  ceilings checked between turns, never mid-turn; exact-duplicate skip via
  `findAttemptsByRequestHash`; the 3-consecutive-failure `blocked` rule), `requestCheckpoint` (one
  structured request plus the bounded repair, reusing Checkpoint 5), and `runExperiment15A` (the
  full ASCII-diagram flow: shared phase one → early-exit check → checkpoint → briefing → fork →
  both arms' phase two → per-arm terminal-reason classification). Two deliberate simplifications
  are documented in the file's header: branch isolation is enforced by `arm`-tagging one shared
  DuckDB engine rather than physically cloning it (justified because the harness core here is
  read-only — no `Catalog` seam, so `derive_table`/`create_view`/`drop_derived` all refuse and
  there's no mutable state to leak); and the doc's terminal-reason table has a genuine gap for "the
  model voluntarily stopped early with partial but incomplete progress," which this file resolves
  by treating that case as `exhausted` rather than inventing a seventh value.
- `forkedHarness.test.ts` — ceiling behavior (including the operations ceiling being checked
  between turns, not mid-turn), the blocked rule (including that a duplicate never counts toward
  the failure streak), duplicate detection and its `visibleArms`-scoped branch isolation, early
  completion via `checkRequirements`, all four reachable `classifyPhaseTwoOutcome` branches, the
  checkpoint-request repair flow, and full `runExperiment15A` scenarios — including a regression
  test for a fixed bug where `[].every(...)` on zero seeded requirements is vacuously `true` and
  would have made an unconfigured task instantly "satisfied."
- `goldFile.ts` (Checkpoint 7) — the generic check-evaluation engine implementing § Task set and
  repetitions' five machine-executable check kinds (`accepted_value`, `required_entity`,
  `required_caveat`, `prohibited_substitution`, `structural_scope`) plus `createGoldFileChecker`,
  the concrete `checkRequirements` implementation `forkedHarness.ts`'s generic seam expects.
  Re-evaluates every check against current ledger state on each call rather than ratcheting
  satisfy-only, because a `prohibited_substitution`/`required_caveat` check can newly violate just
  as easily as newly satisfy. Does not author the twelve frozen tasks — that's later, explicitly
  out of "the only build 15A requires."
- `goldFile.test.ts` — all five check kinds (satisfied and unsatisfied cases each, including
  column-scoped `accepted_value`, SQL-vs-row-cell `required_entity` matching, and
  `structural_scope` fragments split across two artifacts never satisfying), plus
  `createGoldFileChecker` integration against the real ledger: transition counting, idempotent
  re-checks, un-satisfying a previously-satisfied prohibited-substitution requirement, and ignoring
  a check whose requirement was never seeded.

### Checkpoint 8 — truthful tool descriptions

The only checkpoint whose edits land outside this directory, because the drift is in the product's
own catalog: `src/lib/analyst/toolSchemas.ts` is the single tool list both the MCP server and the
in-tab chat read, and 15A's frozen operation profile is that list. §2 item 9 named four operations
whose descriptions overstated their handlers, and all four were confirmed against real output
before being rewritten:

- **`get_schema`** claimed "every table with row and column counts, every column with its physical
  type, semantic class, null fraction and distinct count, plus inferred relationships and their
  join SQL." It returns three columns — `table_name`, `column_name`, `data_type` — from
  `information_schema.columns`. None of the statistics, none of the relationships. It now says so
  and points at `describe_table` and `join_coverage` for what it does not carry.
- **`describe_table`** claimed classification reasons, key columns, shared columns and time
  coverage, "inline and complete." It runs `SUMMARIZE`, returns that operation's twelve columns,
  and materializes — so it has a `resultId`, which the old text denied. The rewrite names the real
  columns and flags that `approx_unique` is an estimate that can exceed the true distinct count.
- **`column_stats`** was the worst: it claimed to branch on *semantic class* and to return a
  10-bucket histogram, IQR bounds, whiskers, outliers, top values with shares, tail share, word
  counts and samples. It branches on the column's **declared SQL type** and returns none of those.
  There is no categorical branch at all — a `VARCHAR` column gets the text projection, so
  "top values with counts and shares" was pointing at output that does not exist for any column.
- **`create_chart`** offered five chart forms in its `type` enum. `specForType` has cases for
  three; naming `distribution` or `join-graph` is refused for *every* result shape, so the schema
  now offers only the three that can be built. The handler still accepts all five as valid enum
  members — this is a change to what a caller is told to choose from, not to what it validates.

The freeze lives in `../../analyst/conformance.test.ts` rather than in `toolSchemas.test.ts`,
because a description can only be checked truthful against what the handler actually returned and
the unit test has no engine. It asserts in both directions and in two registers:

1. every column an operation really returns is named in its description (catches output growing
   silently past what the model was told to read);
2. every snake_case identifier a description uses is either a real column of that operation or the
   name of a sibling operation it is pointing at (catches invented column names);
3. a small vocabulary of statistics that **no** handler in the catalog computes — histogram,
   outlier, IQR, whisker, tail share, time coverage, key column, semantic class — may appear in a
   description only under a negation. This third one is what catches prose claims, and it is the
   one that matters: `column_stats` never promised a column called `histogram`, it promised "a
   10-bucket histogram" in a sentence, which no field-name check would have seen. The vocabulary is
   grounded in real output first — each term is shown to name nothing any operation returns before
   it is required to be absent-or-denied.

Verified by reverting all three prose descriptions and confirming six of the new assertions fail.

### Task authoring — the twelve frozen tasks

`tasks.ts` freezes § Task set and repetitions' distribution (3 exact computation, 3 open
analytical, 2 join/multiplicity, 2 missing-capability, 1 data-quality, 1 time-series) against the
existing `orders`/`customers` fixture (`../../analyst/fixtures.ts`) rather than a second dataset —
15A's held-constant list freezes dataset *revision*, not which dataset. Every `accepted_value`
expectation was read off that live fixture, not estimated; `tasks.test.ts` re-derives each one by
running hand-written reference SQL through a real ledger and the real `createGoldFileChecker`, so a
future fixture edit that changes a number cannot silently strand a frozen task. It also proves the
five check kinds discriminate (wrong/missing evidence stays unsatisfied, a fabricated claim
violates `prohibited_substitution`) rather than only ever passing. `OPERATING_MANUAL` is the one
frozen, task-agnostic system prompt sent byte-identically to both arms across all twelve tasks;
`composeOriginalTask` appends each task's own requirement descriptions to its question so the
phase-one prompt and the midpoint briefing's requirement list can never disagree on wording.

This set is provisional the way every frozen artifact in this record has been until its pilot ran
— see `tasks.ts`'s header on why a `required_caveat`/`prohibited_substitution` pattern miscalibrated
against real `qwen3:8b` phrasing is exactly what the unscored pilot run exists to surface.

### The pilot runner

`runPilot.ts` is the CLI entrypoint that wires everything above together: a fresh `Executor` +
analyst core + MCP session per task (real dataset), a fresh ledger `EvalEngine` per task (kept
separate from the dataset engine — the ledger never queries `orders`/`customers` itself), the live
`qwen3:8b` provider adapted into `forkedHarness.ts`'s `MeteredComplete` shape, and `tasks.ts`'s gold
files as `checkRequirements`. It has never completed a real run: `resolveQwen3`'s preflight requires
a reachable Ollama host, and none has been reachable yet (see `qwen3Provider.ts`'s file header).
`runPilot.test.ts` proves the wiring itself is correct — real executor, real MCP session, real
ledger, a scripted `MeteredComplete` standing in for the unreachable live model — including a
genuine two-arm fork where control satisfies its requirement and treatment does not.

Building that test is what surfaced the cross-arm artifact leakage described in the status note
above: it is the first thing in this directory to combine the real `createGoldFileChecker` with a
real two-arm `runExperiment15A` run, which no existing Checkpoint 6/7 test did.

`maxBriefingBytes` and `num_ctx` are CLI-overridable (`--max-briefing-bytes`, `--num-ctx`,
`--task <id>`) with a generous, loudly-labeled provisional default — § Midpoint briefing contract
and § What is held constant both reserve the real numbers for pilot measurement, and this runner
prints what it actually observed rather than guessing a frozen value.

## Running it

```sh
npx vitest run --config eval/chat/15-cleared-context/vitest.config.ts
npx tsc -p eval/tsconfig.json --noEmit --pretty false
```

Checkpoint 8's assertions are not in that config — they need a real engine, and they live with the
rest of the operation-conformance suite:

```sh
npx vitest run eval/analyst/conformance.test.ts
```

Once an Ollama host serving `qwen3:8b` is reachable (`OLLAMA_BASE_URL`, default
`http://100.126.157.97:11434`), the pilot itself runs with:

```sh
npx tsx eval/chat/15-cleared-context/runPilot.ts                    # all twelve tasks
npx tsx eval/chat/15-cleared-context/runPilot.ts --task ts-peak-month  # one task, for a quick connectivity check
```
