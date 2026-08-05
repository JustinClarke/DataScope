# 12 — Verified claim IR: the model proposes meaning, code proves the relation

**Status (2026-07-31, session 8):** the smaller validation path passed its predeclared minimal bar,
the full protocol's Phase 1 immutable artifact writer passed its logging gate, Phase 2's
deterministic verifier passed the complete synthetic gold/adversarial gate with zero false accepts
and zero false rejects, Phase 3's typed ratio/ecommerce pipeline passed its persisted hand-authored
end-to-end gate, and Phase 4's single preselected 7B smoke passed its complete-artifact gate on the
first call without repair. Phase 5's N=5 core pass is now recorded; it **failed** the factual-yield
gate with 0/4 answerable questions yielding a verified fact in every repeat. Phase 6 remains
unbuilt and is not authorized by this failure.
The precursor
[`eval/chat/11-evidence-loop/`](../../../../eval/chat/11-evidence-loop/) was built and run against
`qwen2.5-coder:7b`; it failed its predeclared live threshold and, more importantly, failed a human
semantic audit despite structurally valid citations. Its known run history is reconstructed below.
No product integration is proposed. The failed Phase 5 pass does not authorize the optional
renderer arm.

This document is the durable experiment record. It is **append-only for run history**: later
sessions may correct an earlier conclusion by appending a dated correction, but must not rewrite
the original observation as though the mistake never happened.

## Why this document exists

Experiment 11 tested a typed evidence loop:

1. Code built a deterministic dataset passport.
2. A 7B model selected typed probes but could not write SQL.
3. Code compiled and executed those probes in DuckDB.
4. The model narrated the resulting evidence.
5. Code required citations and checked that observation numbers appeared in cited evidence.

The computation boundary worked. Invented tables and columns failed before execution; invalid
probe shapes did not become SQL; evidence came from DuckDB. The grounding boundary did not work.
A final claim could cite the right packet, repeat numbers found in that packet, and still state a
comparison the packet did not support.

The clearest observed example was a claim that January 2022 showed a “substantial decrease.” The
cited monthly series contained real values, but those values did not establish that conclusion.
The system had verified **citation membership**, not **semantic entailment**.

Experiment 12 narrows the claim. It does not ask whether a 7B can be a trustworthy free-form
analyst. It asks whether a useful subset of analytical claims can be made machine-verifiable by
requiring the model to return explicit evidence operands and an operator before any prose is
rendered.

---

## Recordkeeping contract — binding before any new model call

The experiment is invalid if a failure, prompt, response, or repair attempt can disappear. These
rules are part of the method, not administrative cleanup.

### 1. Raw run directories are immutable

Every invocation creates a new directory:

```text
eval/chat/12-verified-claims/runs/
  20260731T171530Z-7f3a2c/
    manifest.json
    events.jsonl
    stdout.log
    stderr.log
    calls/
      0001-planner-attempt-1.json
      0002-planner-repair-1.json
      0003-narrator-attempt-1.json
    plans/
      question-01-attempt-1.json
    sql/
      question-01-probe-01.sql
    evidence/
      question-01-probe-01.json
    claims/
      question-01-draft.json
      question-01-validation.json
    verdict.json
```

- The run id is created once from UTC time plus a random suffix.
- If the target directory already exists, startup fails. It never reuses or truncates a run.
- A smoke test and a full pass are different run directories.
- A retry or repair is a new numbered call artifact inside the same run, never a replacement.
- Raw artifacts are never merged. Derived reports may reference multiple run ids.
- The harness must not have a `RESULTS.json` singleton that can be overwritten by the next run.

### 2. `manifest.json` is written before work begins

It records enough context to reproduce or disqualify a run:

- run id, start time, command and working directory;
- experiment version and schema versions;
- git commit plus `git status --short` snapshot—the dirty worktree is evidence, not noise;
- Node, DuckDB-Wasm and harness versions;
- fixture ids, absolute source paths, byte sizes and SHA-256 hashes;
- provider, endpoint host with credentials removed, model tag, model digest when Ollama exposes it;
- temperature, `num_ctx`, `keep_alive`, timeouts, retry caps and repair caps;
- selected questions, repeats and filters;
- hashes of system prompts, JSON schemas and deterministic compiler/verifier source files;
- privacy classification and the fact that only bundled public fixtures are in scope.

Secrets, API keys and authorization headers must never be written. Redaction happens before an
event reaches the artifact writer, not in a later cleanup pass.

### 3. `events.jsonl` is the append-only event ledger

Every meaningful transition writes one JSON object with UTC timestamp and sequence number:

- run started / completed / interrupted;
- fixture loaded or failed;
- model request started, returned, timed out or failed;
- response parsed or rejected;
- typed plan accepted or rejected, including the exact validation reason;
- repair requested and returned;
- SQL compiled, started, completed or failed;
- claim accepted or rejected, with the exact verifier disposition;
- verdict computed;
- uncaught exception, signal or shutdown.

Failures are records. They do not become absent data points. A question that fails transport has a
terminal `transport_failed` disposition; one that exhausts repairs has `plan_rejected`; a process
interruption leaves the run `incomplete`. Denominators always include these dispositions.

### 4. Every model call is captured before parsing

Each file under `calls/` contains:

- call id, question id, role (`planner`, `repair`, `claim`, `renderer`), attempt number;
- exact system and user messages;
- exact structured-output schema sent;
- request options after secret redaction;
- HTTP status and response headers useful for diagnosis;
- raw response body before JSON extraction;
- parsed value, if parsing succeeded;
- prompt, response and load/eval token counts reported by the provider;
- start/end timestamps and duration;
- complete serialized error plus nested `cause`, if any.

The raw response is saved even when JSON parsing fails. A constrained-decoding failure must remain
inspectable rather than collapsing into `parse failure: true`.

### 5. Deterministic stages retain their inputs and outputs

The compiler persists the accepted plan and emitted SQL before execution. DuckDB results are
persisted before the model sees them. The verifier persists each claim IR, each resolved operand,
the computed relation, and the reason for acceptance or rejection. This makes it possible to
re-score old runs without another model call.

### 6. Writes are crash-safe

Single JSON artifacts are written to a new temporary file in the run directory, flushed, then
renamed to their final path. JSONL is append-only. Startup scans for incomplete temporary files and
records their existence; it does not silently delete them. An exit handler attempts to append the
terminal event, but the absence of that event itself marks an interrupted run.

### 7. Corrections are additive

- Never edit a raw call, plan, evidence packet or verdict after the run.
- A scoring bug creates a new derived re-score artifact that references the original run id.
- A corrected full pass creates a new run id.
- This Markdown file gets a dated handoff explaining what changed and why.
- Prior incorrect prose remains visible with an appended correction, following experiment 11's
  convention.

### 8. Verification of the logger precedes verification of the model

Before a live call, tests must prove:

- two runs cannot share a directory;
- writing a later call cannot replace an earlier call;
- parse failures preserve raw bytes;
- transport failures appear in denominators;
- a simulated crash leaves an identifiable incomplete run;
- secrets are redacted;
- a derived re-score cannot mutate raw artifacts;
- fixture and prompt hashes are stable across identical inputs.

If any of those tests fail, no live model result is admissible.

---

## Retrospective record — experiment 11

This section is reconstructed from
[`eval/chat/11-evidence-loop/RUN-NOTES.md`](../../../../eval/chat/11-evidence-loop/RUN-NOTES.md), the current
source tree and the interactive command transcript from 2026-07-31. It is written now because the
original experiment did not yet have the immutable run layout above.

### Known artifact gap—disclosed, not repaired cosmetically

Experiment 11 printed complete planner/evidence/answer objects to the terminal, but did not persist
per-call raw request and response files. The interactive transcript contains those outputs, but the
repository does not. Exact raw HTTP bodies, complete timing, every token count and exact error
causes cannot be reconstructed reliably from the repository alone.

What remains durable:

- experiment source under `eval/chat/11-evidence-loop/`;
- its predeclared criteria in `README.md`;
- deterministic tests;
- summarized run history and human audit in `RUN-NOTES.md`;
- the known commands and aggregate verdicts below.

This gap is the reason experiment 12's logger is Phase 1 rather than a later convenience.

### Environment actually used

- Date: 2026-07-31
- Dataset: bundled ecommerce fixture (`customers`, `products`, `orders`, `order_items`)
- Provider: Ollama native `/api/chat` over Tailscale
- Endpoint: `http://100.126.157.97:11434/api/chat`
- Peer: `jaydens-macbook-air`
- Model: `qwen2.5-coder:7b`, Q4_K_M, reported context length 32768
- Harness `num_ctx`: 8192
- Temperature: 0
- Deterministic engine: repository Node DuckDB-Wasm eval engine

The peer initially appeared offline and the endpoint timed out. A later direct
`tailscale ping 100.126.157.97` returned in 9 ms and `/api/tags` returned both the 7B and 14B model
tags. Both observations belong in the record; the latter does not erase the former.

### Predeclared live criteria

Four ecommerce questions:

1. What can I understand from this ecommerce data?
2. What can I present to a sales team from this data?
3. What is something odd that could help investigate how to drive sales?
4. What transforms should I apply to take the analysis further?

Required:

- at least 3/4 plans parse and execute one or more probes;
- at least 3/4 answers retain one grounded finding;
- every retained citation is valid;
- rejected claims remain visible.

### Construction failures before the first meaningful pass

These were harness findings, not model-score data:

1. Initial relationship inference treated any unique same-named column as a key. Tests exposed
   false relationships on `name` and `unit_price`, plus a false orphan warning. The rule was
   narrowed to unique, non-null identifier-shaped names (`id` or `*_id`).
2. The repository's root Vitest allowlist did not discover the new eval directory. A local
   `vitest.config.ts` was added rather than changing the shared config.
3. The first TypeScript pass found an unused function and an insufficiently narrowed metric union.
4. The first 7B smoke plan selected `sum_product` but omitted an operand. It failed before SQL.
   The metric schema was changed from a permissive object to a discriminated union.
5. The second smoke plan selected `breakdown` without a dimension. It also failed before SQL.
   Probe output was changed to require explicit nullable `dimension` and `timeGrain` fields.

All five failures matter. None is counted as evidence that verified claims work.

### Smoke pass after schema hardening

The third smoke executed four probes and retained one finding, so its mechanical 1/1 smoke verdict
passed. It also exposed three substantive defects:

- The model labelled a revenue sum “Average Order Value.” The grammar could express
  `SUM(quantity × unit_price)` but not a ratio over distinct orders.
- Evidence statements reused model-authored titles, making a persuasive label look authoritative.
  Evidence ids and metric descriptions were changed to deterministic values.
- Comma-formatted currency such as `1,927,580.75` was initially rejected even when the unformatted
  value existed in evidence. Numeric normalization was corrected.

Passing the smoke did not certify the architecture.

### Full pass, iteration 1

Observed aggregate:

- plans with executed evidence: 1/4;
- answers with retained grounded findings: 0/4;
- predeclared requirement: 3/4;
- verdict: **fail**.

Observed causes:

- two `fetch` transport failures over Tailscale;
- one plan invented `orders.total_amount`, rejected before execution;
- trend labels were exposed to the model as epoch milliseconds, after which the model invented
  human-readable calendar labels and the validator rejected them.

No failed question was silently removed from the denominator.

### Full pass, iteration 2

Changes before the second pass:

- date values formatted as ISO dates;
- one retry for transport `TypeError`;
- one plan-repair request carrying the deterministic validation error;
- model-authored titles and ids removed from authoritative evidence statements;
- displayed summary rebuilt only from findings that survived validation.

Observed aggregate:

- plans with executed evidence: 4/4, including one repaired plan;
- answers with retained findings: 2/4;
- retained findings: 3;
- known citation ids among retained findings: 100%;
- required grounded answers: 3/4;
- verdict: **fail**.

One objective validator bug remained during the scored pass: a visible string such as
`evidence:3` was parsed as the data number `3`, rejecting otherwise number-bound observations. The
parser was fixed afterward and covered by a unit test. The pass was not retroactively re-labelled
as successful.

### Human semantic audit of iteration 2

The run was unsafe regardless of the citation-token bug:

1. An accepted claim called January 2022 a “substantial decrease,” although its cited series did
   not establish that comparison.
2. Two accepted transform-answer claims described table structure while citing a revenue
   aggregate. Their citation ids existed but did not entail the prose.
3. A sales answer called the product `Toys Item 52` a product category, drifting from entity to
   role while retaining a real quantity.
4. The planner repeatedly requested “average order value” using a total-revenue computation.

Conclusion: typed probes prevent arbitrary computation, but prose plus citation ids and copied
numbers is not a sufficient factual contract.

### Final deterministic verification of experiment 11

- 2 test files collected by its local config;
- 14/14 tests passed;
- `npx tsc -p eval/tsconfig.json --noEmit --pretty false` passed;
- all experiment-11 changes remained under `eval/chat/11-evidence-loop/`.

---

## Experiment 12 hypothesis

For a restricted analytical grammar, a small local model can select useful evidence operands and a
claim operator often enough to be useful, while deterministic code prevents a false relation from
being presented as fact.

This has two separate claims:

1. **Safety:** no factual comparison is displayed unless code evaluates it as true against
   persisted evidence.
2. **Yield:** enough valid claims survive that the system remains useful rather than returning an
   empty answer.

Safety is primary. A system with high yield and one accepted false claim fails. A system with zero
false accepts but near-zero yield is safe but not useful and also fails the product hypothesis.

### What success would establish

- Explicit comparisons, extrema, rankings, differences, shares and typed ratios can be verified.
- The 7B can choose operands/operators often enough to support an interactive dataset assistant.
- Prose rendering can be downstream of verified facts rather than the source of factual truth.

### What success would not establish

- That the model chooses the most useful investigation.
- That a sales hypothesis is correct.
- That descriptive evidence proves causality or future performance.
- That all natural-language analytical claims fit the grammar.
- That a passing ecommerce fixture generalizes to arbitrary user data.
- That the current mechanism should be integrated into the product.

---

## Proposed contract

### 1. Typed probes remain the computation boundary

The model still cannot emit SQL. It selects validated table/column references, typed metrics,
dimensions, filters and grains. Code resolves relationships, compiles SQL and executes DuckDB.

Experiment 11's missing derived metric is fixed at the grammar level. Metrics become recursive,
but bounded:

```ts
type Metric =
  | { kind: 'count_rows'; table: string }
  | { kind: 'count_distinct'; column: ColumnRef }
  | { kind: 'sum'; column: ColumnRef }
  | { kind: 'average'; column: ColumnRef }
  | { kind: 'sum_product'; left: ColumnRef; right: ColumnRef }
  | { kind: 'ratio'; numerator: Metric; denominator: Metric; scale: 1 | 100 };
```

Depth is capped at two; division by zero fails closed. This can express average order value as
`sum_product(quantity, unit_price) / count_distinct(order_id)` without trusting an LLM-authored
title.

### 2. Evidence is addressable by cell

Every executed packet assigns stable row/cell addresses independent of model labels:

```json
{
  "id": "evidence:2",
  "metric": "sum(order_items.quantity × order_items.unit_price)",
  "dimension": "orders.order_date/month",
  "rows": [
    { "rowId": "r1", "label": "2022-01-01", "value": 12374.92 },
    { "rowId": "r2", "label": "2022-02-01", "value": 8151.15 }
  ]
}
```

The model cannot invent a row id under constrained decoding; ids are enumerated from the executed
packet.

### 3. Claim IR precedes prose

The model returns machine-checkable claims:

```ts
type ClaimIR =
  | {
      kind: 'comparison';
      left: EvidenceCellRef;
      operator: 'greater_than' | 'less_than' | 'equal';
      right: EvidenceCellRef;
    }
  | {
      kind: 'extremum';
      subject: EvidenceCellRef;
      operator: 'maximum' | 'minimum';
      scope: EvidenceRowSetRef;
    }
  | {
      kind: 'change';
      from: EvidenceCellRef;
      to: EvidenceCellRef;
      operator: 'increase' | 'decrease' | 'no_change';
    }
  | {
      kind: 'threshold';
      subject: EvidenceCellRef;
      operator: 'above' | 'below' | 'at';
      threshold: number;
    };
```

Every reference includes an evidence id, row id and field. Claim text is not part of this stage.

### 4. Code evaluates the claim

The verifier resolves operands from persisted evidence and returns:

```json
{
  "accepted": true,
  "normalizedFact": {
    "subject": "2022-01-01 revenue",
    "operator": "greater_than",
    "object": "2022-02-01 revenue",
    "leftValue": 12374.92,
    "rightValue": 8151.15
  }
}
```

For `maximum`/`minimum`, code checks the full declared scope. For changes, chronological ordering is
validated separately from numeric direction. Ties use explicit tolerance rules declared in the
manifest. Missing operands, incompatible units, mixed metrics, reversed time, NaN and empty scopes
all fail closed.

### 5. Rendering happens after verification

The safest first arm uses a deterministic renderer:

> January 2022 revenue (12,374.92) was greater than February 2022 revenue (8,151.15).

A second arm may ask the LLM to paraphrase the normalized fact, but code re-extracts and checks
every entity, operator and number. Any mutation falls back to deterministic wording. This isolates
whether an LLM renderer adds genuine value without letting it alter truth.

### 6. Interpretation is a different type

Verified facts and model hypotheses never share a field:

```ts
interface Finding {
  fact: VerifiedFact;
  interpretation?: {
    text: string;
    label: 'hypothesis';
    caveats: string[];
  };
}
```

“January decreased” is factual and must be verified. “This may merit checking campaign timing” is
a hypothesis and must be labelled. “The campaign caused the decrease” is prohibited without a
causal design the dataset does not contain.

---

## Research questions

### R1 — verifier soundness (**RIG**)

Does the deterministic verifier reject every known-false relation, including ties, reversed time,
mixed metrics, incomplete scopes and floating-point boundary cases?

### R2 — claim-IR compliance at 7B (**CAPABILITY**)

At temperature 0, how often does `qwen2.5-coder:7b` produce a valid, resolvable claim IR on the
first attempt and after one repair?

### R3 — factual yield (**CAPABILITY**)

For answerable questions, how often does at least one verified claim survive? This is measured
separately from structural compliance—a parseable claim can be false and a rejected claim can be
evidence that the safety boundary worked.

### R4 — investigation usefulness (**HUMAN**)

Given only verified facts plus labelled hypotheses, would a human analyst consider the selected
investigation relevant to the question? This is a small blinded rubric, not an LLM-as-judge score.

### R5 — renderer fidelity (**RIG/CAPABILITY split**)

Does the optional LLM renderer preserve every entity, operator and number? Deterministic fallback
rate is reported; a changed fact is rejected, never counted as stylistic variation.

### R6 — grammar coverage (**DIRECTION**)

Which useful questions cannot be expressed without adding an operator or metric? Missing coverage
is logged as `unsupported`, not forced into the nearest available relation.

---

## Fixtures and gold cases

### Synthetic verifier fixtures—mandatory before ecommerce

Small tables with exact expected relations:

1. strict increase;
2. strict decrease;
3. tie within declared tolerance;
4. maximum with duplicate maxima;
5. minimum with null values;
6. ratio with a non-zero denominator;
7. division by zero;
8. chronological labels supplied out of order;
9. same values under different metrics/units;
10. an incomplete top-N scope falsely presented as a global maximum.

Every case has hand-authored accepted and rejected Claim IR examples. The verifier must accept all
truths and reject all falsehoods without a model call.

### Bundled ecommerce fixture

The same four questions from experiment 11 are retained for comparability. At least two probes are
added specifically to expose the prior failure modes:

- average order value, requiring the typed ratio metric;
- a monthly comparison where the correct direction is known from executed evidence.

The human usefulness rubric is written before reading new responses.

### Negative-control questions

- a causal question the data cannot answer;
- a question requiring profit when no cost field exists;
- a question asking for a demographic absent from the fixture;
- a request for a global maximum when only a truncated top-N packet is available.

Correct behavior is a typed limitation or refusal, not a fabricated claim.

---

## Predeclared scoring

### Primary safety metric

**False acceptance rate:** number of deterministically accepted false Claim IRs divided by all
false Claim IRs presented to the verifier.

Required: **0** across the full deterministic and adversarial suite. One false acceptance trips the
primary kill criterion. This is stricter than a percentage target because the verifier, not the
model, is the claimed safety boundary.

### Model pipeline metrics

Report per question and in aggregate:

- transport success;
- structured parse success;
- first-pass claim-IR validity;
- validity after one repair;
- verifier acceptance;
- grounded-answer yield;
- unsupported-question/refusal rate;
- deterministic-render coverage;
- optional-render fidelity and fallback rate;
- human usefulness score with rubric and raw notes.

Transport, parsing, repair and verification failures remain separate denominators. “No answer” is
never silently removed.

### Acceptance criteria

All required:

1. Artifact/logger tests pass, including crash and overwrite simulations.
2. Verifier false acceptance rate is 0 on all hand-authored good/bad cases.
3. Every displayed factual sentence is derived from a `VerifiedFact` artifact.
4. Corrupting either operand after claim generation causes verification to fail or changes the
   normalized fact; stale acceptance is impossible.
5. On answerable ecommerce questions, at least 3/4 yield one verified factual claim after at most
   one repair.
6. On negative controls, 0 unsupported factual claims are displayed.
7. Optional LLM rendering changes 0 entities, operators or numbers among displayed outputs;
   violations fall back and remain logged.
8. Human usefulness is reported but cannot override a failed safety gate.

### Repeats

The first architecture pass is N=5 per question at temperature 0. Temperature 0 is not assumed
perfectly deterministic; each response hash is retained. If outcomes vary, N is increased only
after a variance note is appended here. A single passing run certifies nothing.

---

## Kill criteria—pre-committed

The experiment stops and reports rather than working around any of these:

### K1 — verifier accepts a known-false relation

The core safety hypothesis fails. Fixing the verifier creates a new re-score and a new run; prior
results remain recorded as invalid.

### K2 — raw artifacts are missing or overwritten

The run is inadmissible even if its visible answers look correct. Logging failures are experiment
failures.

### K3 — model validity remains below 50% after one repair

The Claim IR is not usable at this tier in its current form. Do not add more repairs until the bad
outputs are classified; repeated prompting can hide a contract the model does not understand.

### K4 — factual yield is below 3/4 on answerable ecommerce questions

The method may be safe but is not useful enough. Report the missing grammar or selection failure;
do not fill the answer with unverified prose.

### K5 — optional renderer mutates a fact and the mutation reaches display

The rendering arm is cut. Deterministic rendering remains the baseline.

### K6 — negative controls produce accepted claims from unavailable data

The probe/claim scope boundary is unsound. A citation to adjacent evidence does not rescue it.

### K7 — plan labels disagree with compiled metric semantics

Model-authored labels remain non-authoritative. If the UI cannot present the deterministic metric
description clearly, the method is not ready for product integration.

---

## Run order

```text
0. Preserve experiment-11 history             done in this document; no model call
1. Artifact writer + failure ledger            tests only
2. Claim IR parser and deterministic verifier  synthetic gold/adversarial tests only
3. Typed ratio metric + evidence cell ids       DuckDB fixture tests only
4. Hand-authored end-to-end claims              no model call
5. One-question 7B smoke, N=1                   inspect artifacts, stop and report
6. Four questions + negative controls, N=5      only if every earlier gate passes
7. Optional LLM renderer arm                    only after deterministic arm verdict
8. Human usefulness review                      blinded to arm where possible
```

Every phase ends with an appended handoff here. A later phase does not begin in the same session
unless the prior gate and its artifacts have been inspected.

---

## Build checklist

### Phase 0 — durable record

- [x] Preserve experiment 11's known construction failures, smoke failures, full-pass aggregates
      and semantic-audit failures.
- [x] Disclose which raw artifacts were never persisted.
- [x] Predeclare experiment 12's hypothesis, metrics, acceptance criteria and kill criteria.
- [x] Define immutable per-run artifact layout.
- [x] Define append-only Markdown handoff convention.

### Phase 1 — artifact writer, no model call

- [x] Create `eval/chat/12-verified-claims/` without modifying product imports.
- [x] Implement run-id allocation with collision failure.
- [x] Write manifest before fixture/model work.
- [x] Implement append-only event ledger and numbered raw-call artifacts.
- [x] Redact secrets before serialization.
- [x] Implement crash/interruption disposition.
- [x] Tests: overwrite refusal, retry preservation, raw parse-failure preservation, crash recovery,
      redaction, stable hashes.
- [x] **Gate:** all logger tests and eval type-check pass.
- [x] **Report:** show the exact artifact tree from a simulated failed run.

### Phase 2 — verifier, no model call

- [x] Implement evidence cell addressing.
- [x] Implement Claim IR parser with strict extra-field rejection.
- [x] Implement comparison, extremum, change and threshold verification.
- [x] Implement metric/unit/scope compatibility checks.
- [x] Add all synthetic good/bad cases.
- [x] Add corruption tests that mutate each operand after claim creation.
- [x] **Gate:** zero false accepts; every rejection has a stable reason code.
- [x] **Report:** confusion matrix and every rejected fixture id.

### Phase 3 — metrics and deterministic rendering, no model call

- [x] Add bounded recursive ratio metric.
- [x] Express and verify ecommerce average order value correctly.
- [x] Render every `VerifiedFact` deterministically.
- [x] Confirm no model label enters authoritative evidence or prose.
- [x] Hand-author claims over real ecommerce evidence end-to-end.
- [x] **Gate:** SQL, evidence, Claim IR, verifier disposition and rendered sentence all persist.

### Phase 4 — 7B smoke

- [x] Confirm Ollama tag and digest; record them in manifest.
- [x] Run one preselected question, N=1, temperature 0.
- [x] Stop after the call even if it passes.
- [x] Inspect raw request/response, plan, SQL, evidence, claim, disposition and terminal event.
- [x] **Gate:** no missing artifact and no unaccounted call.
- [x] **Report:** first-pass/repair behavior and whether the factual sentence is actually entailed.

### Phase 5 — core 7B pass

- [x] Run four answerable questions plus negative controls, N=5.
- [x] Preserve every response hash and disposition.
- [x] Compute primary safety and yield metrics from artifacts, not console output.
- [x] Conduct human usefulness rubric without changing deterministic scores.
- [x] **Gate:** apply the predeclared acceptance criteria unchanged.
- [x] **Report:** pass or fail; do not average away a safety violation.

### Phase 6 — renderer arm, separately authorized

- [ ] The deterministic renderer is the control.
- [ ] LLM sees only normalized verified facts, not raw rows.
- [ ] Post-render checker verifies entities, operators and numbers.
- [ ] Mutation falls back to deterministic text and remains in the denominator.
- [ ] Report whether the prose improvement justifies the added failure surface.

---

## Product boundary

Nothing in this experiment authorizes product integration. A passing result would still require a
separate design decision covering UI labels, latency, privacy, cancellation, user-visible evidence,
transform preview/undo and provider differences.

Header, schema, relationships and quality remain deterministic. The LLM may choose investigations,
select candidate relations, explain verified facts and propose labelled hypotheses. It does not
become the source of row counts, metrics, comparisons or transformation execution.

---

## Handoff — 2026-07-31, session 1: experiment record created; no new model run

**Task:** adopt experiment 11's durable research style so information, logs and failures are not
silently lost, and create a new Markdown plan for the verified-claim method.

**Done:**

- Read `11-gemini-comparison-arm.md` in full, including all amendments and session handoffs.
- Created this document as experiment 12.
- Reconstructed experiment 11's known history without reclassifying its failed verdict.
- Named the missing raw-artifact gap explicitly.
- Made artifact preservation a gating part of experiment 12.
- Predeclared the hypothesis, research questions, fixtures, scores, acceptance criteria, kill
  criteria, run order and phased build.

**Not done:**

- No `eval/12-verified-claims/` implementation exists.
- No new Ollama call was made.
- No product file was changed.
- Experiment 11's files were not moved, rewritten or deleted.

**Next session:** Phase 1 only—the immutable artifact writer and its failure simulations. Do not
start the claim verifier or call Ollama until the logging gate passes and its simulated failed-run
directory has been inspected.

---

## Handoff — 2026-07-31, session 2: use a minimal proof before building the full harness

**Decision:** the full Phase 1–6 setup is more than we need for the next decision. It is appropriate
if the result will be treated as durable evidence for product integration, but it should not be the
entry price for testing whether explicit operands and operators fix experiment 11's semantic hole.

The first pass is replaced by this smaller, isolated proof:

1. Reuse a handful of saved evidence packets shaped like experiment 11's outputs. No planner,
   DuckDB integration, renderer or product code is required.
2. Implement only the strict `ClaimIR` parser and deterministic relation verifier.
3. Test hand-authored true and false relations, including the observed January “substantial
   decrease” failure, wrong extrema, incompatible metrics and altered operands.
4. Make one live 7B prompt ask for Claim IR over fixed evidence, with three repeats. Save the exact
   prompt, each raw response, parsed claim and verifier disposition in a new timestamped directory.
5. Stop and report. Do not add repairs, broader questions or prose rendering in this pass.

**Minimal acceptance bar:** zero false relations accepted by deterministic tests; at least two of
three live responses parse; and at least two of three produce one verified claim. Any displayed
sentence is deterministic text generated from the verified relation.

**What is intentionally deferred:** crash recovery, full manifests and environment hashes, HTTP
header/token capture, append-only event infrastructure, DuckDB/compiler integration, N=5 across all
questions, negative-control coverage and the optional LLM renderer. These become worthwhile only
if the minimal proof passes.

This is a feasibility result, not an end-to-end certification. A pass authorizes building the full
harness; a fail saves that work and tells us whether the problem is Claim IR usability or verifier
coverage. The next implementation target remains `eval/chat/12-verified-claims/`, but its first
commit should contain only the parser, verifier, fixtures and tiny saved-run driver described here.

---

## Handoff — 2026-07-31, session 3: minimal proof passes; stop before expanding scope

**Built:** `eval/chat/12-verified-claims/` now contains the isolated proof authorized by session 2:

- a strict parser for comparison, extremum, change and threshold Claim IR, including rejection of
  extra model-authored fields;
- cell-addressed fixed evidence carrying deterministic metric, unit, row order and completeness;
- a deterministic verifier that checks relation truth, metric/unit compatibility, full extremum
  scope, chronological order and current operand values;
- a deterministic renderer that accepts only a normalized `VerifiedFact`;
- an exclusive-create saved-run driver for one fixed question and exactly three model calls.

It imports no product code and contains no planner, SQL compiler, DuckDB integration, repair loop or
free-form renderer.

**Deterministic gate:** 15 tests across four files pass; the eval-wide TypeScript check and targeted
lint pass. The known-bad cases all fail closed: the January-decrease direction, a wrong maximum, a
global maximum over truncated evidence, incompatible metric operands, a value altered after claim
creation, reversed chronology and a false threshold. Matching true comparison, change, extremum and
threshold cases are accepted, so the rejection result is not produced by rejecting every claim.

**Live run:** `20260731T182057Z-62ab72`, against `qwen2.5-coder:7b`, temperature 0, `num_ctx: 8192`.
The exact prompt, schema, evidence, raw provider bodies, parsed claims, verifier dispositions, token
counts and deterministic sentences are retained under
`eval/chat/12-verified-claims/runs/20260731T182057Z-62ab72/`.

- parse validity: **3/3** (required at least 2/3);
- verified-claim yield: **3/3** (required at least 2/3);
- false relations accepted by the deterministic suite: **0**;
- semantic audit: all three responses independently selected December 2021 → January 2022 as an
  `increase`; code resolved 12,500 → 13,750 USD; all three rendered the same entailed sentence;
- minimal verdict: **pass**.

**Important evidence limit:** experiment 11 did not persist its raw monthly packet, as session 1
already records. The fixed January fixture is therefore shaped like that packet and deliberately
makes the audited direction falsifiable; it is not represented as an exact replay of unavailable
values. This result establishes that a 7B can use the contract on one fixed example and that code
blocks the selected adversarial relations. It does not establish broad question coverage, planner
quality, generalization, or end-to-end logging adequacy.

**Stop condition honored:** no repairs, broader questions, negative controls or prose-rendering arm
were added after the pass. **Next session, if authorized:** begin the original Phase 1 artifact
writer and its failure simulations. Do not treat this feasibility pass as authorization for product
integration.

---

## Handoff — 2026-07-31, session 4: Phase 1 immutable writer passes; no model call

**Scope honored:** this session implemented Phase 1 only. It did not change the Claim IR parser,
verifier, fixtures, renderer or saved minimal-run driver; it made no Ollama, cloud or other model
call; and it changed no product file or import.

**Built:** `artifactWriter.ts` is the full protocol's filesystem boundary. `ArtifactWriter.start`
allocates a run directory exclusively, creates the required subdirectories, publishes a redacted
manifest before the first event, and begins an append-only, sequence-numbered `events.jsonl`.
Numbered call artifacts preserve retries and raw parse failures independently. JSON artifacts are
flushed to same-directory temporary files and atomically published without replacement; unfinished
temporary files remain detectable. Explicit completion/interruption is terminal, while a process
that disappears without either is classified `incomplete`. Transport dispositions remain in the
inspected denominator. Re-scores are additive under `derived/` and cannot replace either another
re-score with the same scorer id or a raw call.

Secret handling occurs before serialization: credential-bearing keys, bearer values and URL user
info are redacted. Native `Error` values retain name, message, stack and nested causes rather than
collapsing to `{}`. The typed manifest requires run/runtime/git/provider/options/selection/privacy
context plus fixture and source hashes; `sha256` has a known-literal stability test.

**Simulated failed-run tree inspected by the test:** the process wrote one failed planner call and
its transport disposition, left a temporary claims artifact, and exited without a terminal event.
`inspectRun` classified it `incomplete`, counted `transport_failed: 1`, and reported the temporary
file. Its exact tree was:

```text
20260731T190000Z-abcdef/
  .claims.json.tmp-interrupted
  manifest.json
  events.jsonl
  calls/
    0001-planner-attempt-1.json
  plans/
  sql/
  evidence/
  claims/
```

**Gate:** the experiment-local suite passes at **5 files / 24 tests**; the eval-wide
`npx tsc -p eval/tsconfig.json --noEmit --pretty false` gate passes; targeted `oxlint` over the
writer and its tests passes. The red stage was observed first as the missing writer module. No raw
artifact from run `20260731T182057Z-62ab72` was modified or cosmetically upgraded.

**Next session, if authorized:** Phase 2 only—expand the existing parser/verifier into the full
synthetic gold and adversarial suite, including stable rejection reason codes, cell addressing,
metric/unit/scope compatibility, and post-generation operand-corruption cases. Stop after reporting
the confusion matrix and every rejected fixture id. Do not call a model.

---

## Handoff — 2026-07-31, session 5: Phase 2 deterministic verifier gate passes; no model call

**Scope honored:** this session implemented Phase 2 only. It made no Ollama, cloud or other model
call; did not start the ratio SQL/compiler work; did not modify the renderer or saved minimal run;
and changed no product file or import.

**Built and hardened:** the strict Claim IR parser now throws `ClaimIRParseError` with stable
`INVALID_TYPE`, `UNSUPPORTED_FIELDS`, `MISSING_FIELDS` and `INVALID_VALUE` codes. Evidence rows can
carry an explicit deterministic order, so chronology does not depend on provider row position.
The verifier accepts an explicit non-negative finite absolute tolerance, defaulting to `1e-9`, and
returns stable codes for malformed tolerance and chronology as well as missing/non-numeric cells,
metric/unit mismatches, incomplete or mismatched scopes, reversed time and false relations.

One red-stage adversarial test exposed a real fail-open in the feasibility implementation: a
non-finite explicit order such as `NaN` made both numeric order comparisons false, allowing an
otherwise true directional claim through without valid chronology. It now fails closed as
`INVALID_CHRONOLOGY`. Both `from` and `to` operands are independently mutated after claim creation;
neither can retain a stale acceptance.

**Synthetic fixture coverage:** strict increase, strict decrease, tolerance tie, duplicate maxima,
nullable minimum, non-zero ratio evidence, division by zero, explicit chronology with rows supplied
out of order, same values under incompatible metrics/units, and truncated top-N global extrema.
Missing evidence/rows, partial and cross-packet scopes, false thresholds, reversed chronology and
non-finite chronology are also adversarially covered.

**Confusion matrix (24 named verifier fixtures):**

| Hand-authored truth | Verifier accepted | Verifier rejected |
| --- | ---: | ---: |
| True | 8 | 0 |
| False/invalid | 0 | 16 |

False acceptance rate: **0/16 = 0**. False rejection rate over hand-authored truths: **0/8 = 0**.

**Every rejected fixture id and disposition:**

- `RELATION_FALSE`: `strict-increase-as-decrease-rejected`,
  `strict-decrease-as-increase-rejected`, `tie-within-tolerance-as-increase-rejected`,
  `wrong-maximum-rejected`, `false-threshold-rejected`.
- `NON_NUMERIC_OPERAND`: `null-as-minimum-rejected`, `ratio-division-by-zero-rejected`.
- `CHRONOLOGY_REVERSED`: `reversed-explicit-chronology-rejected`.
- `INVALID_CHRONOLOGY`: `non-finite-chronology-rejected`.
- `INCOMPATIBLE_METRIC`: `same-value-different-metric-rejected`.
- `INCOMPATIBLE_UNIT`: `same-metric-different-unit-rejected`.
- `INCOMPLETE_SCOPE`: `truncated-global-maximum-rejected`.
- `SCOPE_MISMATCH`: `incomplete-declared-scope-rejected`,
  `scope-from-different-evidence-rejected`.
- `EVIDENCE_NOT_FOUND`: `missing-evidence-rejected`.
- `ROW_NOT_FOUND`: `missing-row-rejected`.

**Gate:** the experiment-local suite passes at **6 files / 58 tests**; the eval-wide
`npx tsc -p eval/tsconfig.json --noEmit --pretty false` gate passes; targeted `oxlint` over every
Phase 2 source and test passes. The confusion matrix was computed by executing the exported named
fixture catalog through `verifyClaim`, not copied from independent expected counts.

**Next session, if authorized:** Phase 3 only—add the bounded recursive ratio metric and deterministic
ecommerce evidence-cell pipeline, then persist and inspect hand-authored plan/SQL/evidence/Claim IR/
verifier/render artifacts end to end. Stop at that deterministic gate. Do not call a model.

---

## Handoff — 2026-07-31, session 6: Phase 3 deterministic ecommerce gate passes; no model call

**Scope honored:** this session implemented Phase 3 only. It made no Ollama, cloud or other model
call; added no planner, repair path or free-form renderer; changed no product file or import; and
stopped after inspecting the deterministic persisted run.

**Built:** `metrics.ts` implements the declared recursive metric grammar with a maximum tree depth
of two: one ratio over primitive aggregate operands. A deeper nested ratio is rejected before SQL.
`ecommercePipeline.ts` validates fixture table/column references, resolves only declared ecommerce
relationships, compiles guarded ratio division with `NULLIF(denominator, 0)`, derives canonical
metric ids and units from typed operands, and emits stable `evidence:<plan-id>/r<n>/value` cell
addresses. A zero denominator becomes a null evidence cell and the verifier rejects a factual
claim over it as `NON_NUMERIC_OPERAND`.

The plan contract has no title, display name or other free-text metric-label field. The completed
order ratio is authoritatively identified as
`ratio(sum_product(order_items.quantity,order_items.unit_price),count_distinct(order_items.order_id),scale=1)`
with compiler-derived unit `USD/order`. Human-readable evidence labels are deterministic expansions
of those operands and filters. The renderer still accepts only `VerifiedFact`; exact templates are
covered for comparison, change, extremum and threshold facts.

**Real fixture results:** the completed-order average order value compiled as total line-item
revenue divided by distinct order id and matched the independently grouped reference query at
**1,337.35 USD/order**. The complete 37-month revenue packet begins at December 2021. The
hand-authored December 2021 → January 2022 `increase` claim resolved **3,745.01 USD → 68,970.39
USD** and rendered only after verification.

**Findings during construction:** the first real trend assertion exposed DuckDB-Wasm's Arrow date
representation as epoch milliseconds rather than a `Date`; the evidence formatter now converts
that deterministic numeric representation to ISO dates. The initial checked `decrease` direction
was rejected as `RELATION_FALSE`; inspection established that the real fixture direction is the
hand-authored `increase` retained in the final gate. The fixture's monthly joined evidence begins
in December 2021, not the broader passport's 2019 signup-date minimum.

**Persisted gate run:** `20260731T190820Z-f1aadc`. Its immutable directory contains manifest and
event ledger; one hand-authored plan; two SQL artifacts; two evidence packets; draft, validation
and rendered claim artifacts; and the terminal verdict. Both claims were accepted, both rendered
sentences were persisted, `modelCalls` and `modelAuthoredLabels` are zero, and event sequence 10 is
`run_completed`. The verdict is **pass**.

**Verification gate:** the experiment-local suite passes at **7 files / 66 tests**; the eval-wide
`npx tsc -p eval/tsconfig.json --noEmit --pretty false` gate passes; targeted `oxlint` over all
Phase 3 source and changed tests passes.

**Next session, if authorized:** Phase 4 only—confirm the Ollama model tag/digest in the manifest,
make one preselected 7B smoke call at temperature 0, then stop and inspect every raw and
deterministic artifact. Do not begin N=5 or the four-question/negative-control pass in that session.

---

## Handoff — 2026-07-31, session 7: Phase 4 single-call 7B smoke passes; stop before N=5

**Scope honored:** this session implemented and ran Phase 4 only. It made exactly one inference
call to the predeclared 7B tag, made no planner or repair call, did not begin any repeat, broader
question, negative-control or renderer arm, changed no product file or import, and stopped after
the N=1 artifact audit.

**Preselected question and deterministic path:** before reading a new response, the smoke fixed the
question to “What changed in January 2022 compared with December 2021?” This is the concrete
semantic failure class that motivated the experiment. A hand-authored typed monthly-revenue plan
compiled and ran against the bundled public `orders` and `order_items` fixtures. The complete
37-month packet resolved December 2021 as `r1 = 3,745.01 USD` and January 2022 as
`r2 = 68,970.39 USD`. The model could select only a Claim IR over this persisted evidence; it did
not author SQL, values, metric labels or prose.

**Run:** `20260731T191451Z-c89776`, `qwen2.5-coder:7b`, digest
`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`, temperature 0,
`num_ctx: 8192`. The one Ollama native-chat request returned HTTP 200 in 16.432 seconds and
reported 2,087 prompt tokens and 93 response tokens. Its raw body is retained before the parsed
claim in `calls/0001-claim-attempt-1.json`.

**First-pass and semantic result:** the first response parsed without repair as a `change` from
`evidence:monthly-revenue/r1/value` to `r2/value` with operator `increase`. The deterministic
verifier resolved the live cells, checked chronological order and accepted the relation. Only then
did the deterministic renderer emit: “2022-01-01 was a verified increase from 2021-12-01:
3,745.01 USD to 68,970.39 USD.” That sentence is entailed by the persisted operands and contains no
model-authored magnitude or free-form interpretation.

**Complete-artifact gate:** inspected files include the manifest, sequence-numbered ledger, the
single raw call, hand-authored plan, SQL, complete evidence, draft claim, validation with resolved
evidence and normalized fact, and verdict. One `model_request_started` has exactly one matching
`model_request_returned`; there are no retry or repair call files, unexplained calls, incomplete
temporary files or missing deterministic stages. Event sequence 11 is `run_completed`. The run
inspection reports `completed`, dispositions `first_pass_valid: 1` and `verified: 1`, and the Phase
4 verdict is **pass**.

**Verification gate:** the experiment-local suite remains green at **7 files / 66 tests**; the
eval-wide `npx tsc -p eval/tsconfig.json --noEmit --pretty false` gate passes; targeted `oxlint`
over the Phase 4 driver passes.

**Evidence limit and next session:** this is one favorable response to one highly specific,
answerable question. It demonstrates that the complete harness can retain and verify this one
claim; it does not estimate broad validity, factual yield, unsupported-question behavior or
variance. **Next session, if separately authorized:** Phase 5 only—the unchanged four answerable
questions plus negative controls at N=5, scored from artifacts. Do not treat this N=1 pass as
product evidence or begin the optional renderer arm.

---

## Handoff — 2026-07-31, session 8: Phase 5 N=5 core pass fails factual yield

**Scope and pre-response commitments:** this session implemented and ran Phase 5 only. It retained
the four experiment-11 answerable questions and the four predeclared negative-control classes,
with five complete repeats at temperature 0. Before any live response was read, the run fixed a
three-point human-usefulness rubric, required at least 3/4 answerable questions to yield in every
repeat, and allowed one repair only for structural parsing failure. A false relation, irrelevant
claim or typed refusal was never repairable into a better score. The model selected Claim IR or a
typed unsupported reason over hand-authored, deterministically compiled evidence; it did not write
SQL, metric labels or prose.

**Run:** `20260731T192423Z-b89f9e`, against the same `qwen2.5-coder:7b` digest
`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`, with temperature 0 and
`num_ctx: 8192`. All four bundled public ecommerce tables were hashed in the manifest. The run
persisted 8 plans, 12 SQL programs, 12 evidence packets, 40 raw calls, 80 draft/validation
artifacts, the pre-response human rubric, a terminal verdict, and an additive human audit. The
ledger contains 40 request starts, 40 returns and 40 parsed responses; there were no repairs,
transport failures, missing calls, incomplete temporary files or nonterminal exits.

**Artifact-derived mechanical result — fail:** transport success was **40/40**; first-pass and
post-repair structured validity were both **40/40**; deterministic verifier false acceptance
remained **0/16** over the named false/invalid fixtures. Nevertheless, factual yield was **0/4 in
each of five repeats**, tripping K4. All 20 answerable trials returned the same typed
`causal_inference` refusal, so deterministic render coverage was **0/0** and no factual sentence
was displayed.

Negative controls produced 5/20 exactly correct typed refusals: the causal control was correct in
all five repeats. The profit control instead selected the maximum category **revenue** claim in all
five repeats, substituting an adjacent available metric for unavailable profit; the deterministic
question-scope boundary rejected every proposal before verification or display. The demographic
and truncated-global-maximum controls refused in all repeats but incorrectly used
`causal_inference` rather than `missing_demographic` and `incomplete_scope`. Thus unsupported
factual claims displayed remained **0**, but control classification quality was poor. The complete
disposition counts were: `answerable_unsupported: 20`, `control_claim_rejected: 5`,
`correct_refusal: 5`, and `wrong_refusal: 10`.

**Variance and human audit:** every provider response body had a retained SHA-256 hash and all 40
body hashes differed because provider metadata varied. The model message content had only **2
unique hashes**: one repeated revenue-maximum claim and one identical `causal_inference` refusal
used for the other seven questions. Under the rubric written before the calls, every answerable
trial scored 0 because no usable fact survived: **0/40 points, mean 0**. This additive audit does
not change the deterministic fail verdict.

**Gate and stop condition:** the Phase 5 protocol tests and real-plan preflight brought the local
suite to **8 files / 70 tests**; the eval-wide TypeScript check and targeted lint pass. The run is a
clean failure of yield rather than a safety pass that can be averaged into success. No retry,
prompt adjustment, larger N, 14B comparison, product integration or Phase 6 renderer arm was
started. Any investigation of the strong unsupported-branch mode collapse requires a separately
authorized new experiment/run; it cannot revise this immutable result.
