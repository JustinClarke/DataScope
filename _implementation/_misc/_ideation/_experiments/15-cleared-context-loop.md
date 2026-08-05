# 15 — Cleared-context loop: the database is the memory

**Status (2026-08-04): draft, actively being ideated. Not ready to build.** This record captures
the mechanism as designed so far in discussion. Limits, ceilings, and further optimizations are
still open — see **Open questions** below. Do not start P0-equivalent infra from this doc until
that section is empty and a verdict-readiness pass has happened.

The governing sentence:

> **The model's context resets every round. What it learned does not — because it never lived in
> the context. It lived in the database.**

---

## Why this experiment exists

Experiment 13 tested whether a model could get smarter by accumulating evidence across many
tool-calling turns inside **one unbroken conversation**. It lost: the active arm used 4.6x the
prompt tokens and 1.8x the context high-water of a single fixed-evidence round, and produced a
*worse* answer (`13-active-analysis-loop.md` L1358). The likely cause was never isolated, because
13 never tried the alternative — clearing context between rounds and carrying state some other
way. 13 names that alternative directly and puts it out of scope: "Cross-repeat cache warmth is a
real and separate product question (does a second session benefit from a first session's
computation on the same dataset?). It is deliberately out of scope for the core verdict"
(`13-active-analysis-loop.md` L348).

This experiment is that separate question, scoped down from "cross-session" to "cross-round
within one analysis," and run on top of 14's analyst core (`14-open-analyst-mcp.md`) rather than
13's Claim-IR-gated loop — 14 already settled that constraint is not the lever (11-13 all asked
"how tightly must we restrict the model," 15 does not reopen that).

**What's different from 13, precisely:** 13 never cleared context — evidence packets accumulated
turn over turn inside one growing conversation. 15 clears context every round and carries state
through DuckDB tables instead, so if a penalty still shows up, it isolates *whether multi-round
reasoning helps at all* rather than *whether unbounded accumulation hurts* — 13 conflated those
two questions and this experiment is designed not to.

---

## The mechanism, as designed so far

```text
round 1: get_schema() [+ analysis.findings index, empty on round 1]
      -> model computes via the 14 catalog, bounded by round ceilings
      -> round ends on budget, not on model say-so
      -> harness materializes everything computed into analysis.findings (classified)
      -> model's context is fully wiped

round 2: get_schema() [+ analysis.findings index: counts per category]
      -> model reorients: what's already known, what's still open
      -> pulls findings detail on demand via run_sql, filtered by category
      -> computes more, bounded by the same round ceilings
      -> harness appends new findings; context wiped again

...repeat until a round adds zero new findings, or a round-count ceiling is hit...

terminal: last round's answer is scored; analysis.findings is the full audit trail
```

### Step-by-step

1. **Round starts.** Turn 0: question, full dataset schema (`get_schema()`, per 14), the operation
   catalog, and — new in this experiment — a compact **findings index**: counts per category
   (e.g. `distribution: 6, relationship: 3, quality: 2, observation: 3`), not the findings
   themselves.
2. **The model works within a bounded round** — reuse 14's existing per-round ceilings (operation
   calls, turns, wall time; `14-open-analyst-mcp.md` L540) unchanged.
3. **Detail is pulled, not pushed.** If the model wants prior findings, it queries
   `analysis.findings` with `run_sql`, filtered by `category` / `table_ref` / `column_ref` — no
   new tool. This is the MCP-shaped "ask for what you need" pattern, but implemented as ordinary
   SQL over a classified table rather than a bespoke retrieval op.
4. **The round ends on budget**, harness-forced, never model-declared — same reasoning as every
   other structural boundary in 13 and 14 (13 rejected model-reported confidence; 14 rejected an
   opaque session id as "ceremony an 8B model will fumble," L533).
5. **The harness deterministically materializes the round's results into `analysis.findings`** —
   a dedicated writable DuckDB schema, one running append-only table, not one table per finding.
   This does not depend on the model choosing to save anything; the guarantee is structural.
6. **Context is fully cleared.** No transcript, no prior turns.
7. **Next round starts cold** and repeats from step 1 — the schema now includes the prior round's
   findings, discovered through the same `get_schema()` call that already existed, not through
   special reseeding logic.
8. **Stop** when a round contributes zero new findings, or a round-count ceiling is reached,
   whichever first.

### `analysis.findings` shape

```text
analysis.findings(
  round       integer,
  category    text,   -- structure | distribution | relationship | quality | observation
  table_ref   text,
  column_ref  text,
  kind        text,   -- 'computed' | 'observation'
  sql         text,   -- null only for kind = 'observation'
  summary     text
)
```

`category` is assigned mechanically at write time from which operation produced the row — no
inference step, no embedding, the same deterministic-tagging pattern `classifier.ts` already uses
for column semantic types elsewhere in the codebase.

---

## Design decisions locked so far

1. **Fact unit is 14's `OpResult`**, not a new format — already typed, already grounded by the
   attached SQL (`14-open-analyst-mcp.md` L159).
2. **No vector DB, no external store.** DuckDB itself is the store; `run_sql` /
   `describe_table` are the retrieval mechanism once `analysis.findings` is classified. A vector
   DB would only earn its place for *cross-dataset* semantic recall — that's backlogged
   separately (`../backlog/analyst-layer-persistence.md`), not this experiment's problem.
3. **Round boundaries are harness-forced**, using 14's existing per-round ceilings unchanged.
4. **Reseeding is free.** No bespoke memory-injection prompt — `get_schema()` already reports
   every table, so round N+1 sees prior findings by discovering them the normal way.
5. **Findings live in a dedicated `analysis` schema**, separate from source and
   user-made derived tables, so provenance stays legible and the UI can render it as its own
   labeled group ("AI findings") rather than mixing into the general table list.
6. **One running table, not one table per finding.** Avoids table-count bloat in the explorer
   rail and gives a single canonical place both the model and the user look.
7. **Persistence is harness-guaranteed, not model-initiated.** The model doesn't have to remember
   to save anything; everything a round computes gets written, regardless of whether the model
   also chooses to `derive_table` something more prominently.
8. **`get_schema()` shows an index, not full content** — counts per category, bounded regardless
   of how many rounds have run. This is the direct fix for the growth risk named below.
9. **Pull is the model's judgment call, not a structural one** — distinct from decisions 3/7
   above. Deciding *what to compute next* is already the model's job everywhere else in 14's
   design ("the model chooses the analysis"); deciding what findings to pull is the same category
   of choice, not a new trust exposure.

---

## Comparison arms

| Arm | Shape | Status |
| :--- | :--- | :--- |
| **A** | 14's single bounded round, no clearing, no persistence | designed, unrun (14's own primary run) |
| **B** | 13's accumulate-in-context, never-clear active loop | **already run, N=1** — the result this experiment is positioned against |
| **C1** | This mechanism, `get_schema()` full-dumps `analysis.findings` every round | new |
| **C2** | This mechanism, `get_schema()` shows the classified index only; model pulls detail via `run_sql` | new |

C1 vs. C2 is its own sub-question, not an assumed win for classification: C2 costs an extra
round-trip every round even when there's nothing worth filtering, so it only earns its place if
it measurably beats C1 — consistent with 14's own standard for promoting an operation ("promotion
requires... a measurable gain," `14-open-analyst-mcp.md` L316).

Scoring reuses 13's ROI formula (verified useful results per 1,000 total model tokens,
`13-active-analysis-loop.md` L510) and 14's reach/grounding rubric on the terminal answer, rather
than inventing new metrics.

---

## Open questions — still ideating, not decided

Nothing below is settled. This section is why the doc is a draft.

- **What counts as "zero new findings" for the stop condition?** Exact duplicate rows, or
  content-similar findings that would need dedup logic of their own?
- **Round-count ceiling** — no number chosen yet. Needs to be small enough to bound wall time
  (14's primary run already budgets up to 12 minutes per cell at a single round; multiply that by
  an unset round count) and large enough to let convergence actually show up.
- **Does round N+1 re-attack the same original question, or pursue open sub-questions the model
  identifies from what's missing?** Raised earlier in discussion, not yet answered.
- **Does this run against 14's full 18-operation catalog, or a reduced subset** for this
  experiment specifically? 14 itself warns small models degrade with tool-list size
  (`14-open-analyst-mcp.md` L152) — unclear if that concern compounds across many rounds.
- **Long-run growth of `analysis.findings` beyond what classification bounds.** The index caps
  turn-0 payload growth, but the table itself still grows unboundedly across rounds — is there a
  cap, an eviction/consolidation rule, or a per-dataset ceiling before this becomes a problem in
  its own right?
- **Should the harness persist *everything* a round computes, or filter out low-value results**
  (e.g. a `sample_rows` preview probably shouldn't become a permanent "finding")? Right now the
  design says "everything," which may produce junk rows in `analysis.findings`.
- **How does a qualitative `kind = 'observation'` row actually get written?** Is this
  model-triggered (an explicit call/insert the model chooses to make) or harness-synthesized from
  something else? Not yet designed.
- **Cost/latency ceiling for the whole multi-round loop** — 14 has a per-cell ceiling table
  (`14-open-analyst-mcp.md` L540); this experiment needs the equivalent scaled across rounds, not
  yet written.
- **Judge/scoring labor.** 14 already flags this as a real constraint for a solo project (single
  judge, hand-audited 20% subsample, `14-open-analyst-mcp.md` L602) — unclear whether a
  multi-round loop needs proportionally more judged material or reuses the same sampling rate.

---

## References

- [Experiment 13 — active analysis loop](13-active-analysis-loop.md) — the never-cleared
  precedent this experiment isolates a variable from
- [Experiment 14 — open analyst MCP](14-open-analyst-mcp.md) — the catalog, ceilings, and
  `derive_table`/schema machinery this experiment builds on
- [Backlog — analyst-layer persistence](../backlog/analyst-layer-persistence.md) — the two
  deferred persistence angles (cross-session same-dataset recall; cross-dataset semantic recall)
  this experiment does not attempt

---

## Verdict

_Unrun, and not yet ready to run._ No benchmark, harness, or `analysis.findings` schema exists.
The mechanism is coherent enough to reason about but the **Open questions** section above is not
empty — do not begin infra (a `P0`-equivalent build step) until it is, and until this doc has had
an explicit decision pass on each item.

---

## Prebuild design-review packet — added after the 2026-08-04 ideation pass

**Status: proposed prebuild direction, not an amendment to master and not authority to implement.**
This packet records the fuller product direction discussed after the first draft above. It is
deliberately appended rather than silently rewriting the original proposal, so a design reviewer
can see which assumptions changed. Where this packet conflicts with an earlier “locked” decision,
the conflict is an explicit review item; **nothing is newly locked until the reviewer resolves it.**

The proposed direction in one sentence:

> Build one content-addressed evidence and provenance layer for DataScope; make every DataScope
> capability reachable through the same MCP-backed product paths; then make the cleared-context
> analyst one bounded workflow over those primitives, not a separate AI subsystem.

### 1. Strategic reset: retain the evidence, not the previous architectures

Experiments 1–14 should be treated as an archive of observations and failed constraints, not as a
stack of mechanisms experiment 15 must inherit. Do not spend more build time extending their
phrase libraries, Claim IRs, custom evidence packets, accumulated transcripts, or experiment-only
renderers unless a specific retained invariant below requires it.

Retain these lessons:

1. Free model prose is not factual evidence. A real number and real column names can still be
   combined into a false statement.
2. Exact SQL plus the result it produced is DataScope's strongest existing grounding and audit
   boundary.
3. More conversational history is not automatically more intelligence. Experiment 13's one paired
   sample went in the wrong direction on cost, context and answer quality.
4. Tight intermediate representations can preserve safety while suppressing useful analytical
   yield; constraint is not itself the product goal.
5. A single passing run certifies nothing. Repeats and frozen comparisons remain required.
6. The deterministic DataScope answer remains an acceptable fallback. AI must earn the additional
   cost and surface area.

The external patterns worth borrowing are similarly ingredients, not proof of this exact design:

- **ReAct:** interleave model decisions with actions against a real external environment.
- **MemGPT-style tiering:** keep durable information outside the active context and retrieve it on
  demand rather than growing the transcript indefinitely.
- **Reflexion-style iteration:** later attempts may benefit from state saved by earlier attempts,
  but DataScope must not treat free-form reflection as verified evidence.

The narrow claim experiment 15 must actually test is therefore:

> **Under one equal total budget, does resetting model context while retaining deterministic
> evidence and compact task state improve useful analytical yield, grounding, or cost over a
> single conversation?**

It is not yet established that “the database is the model's memory.” The first build should prove
the narrower claim before the slogan is promoted into product architecture.

### 2. Corrections and confounds the reviewer must resolve first

The original draft is directionally coherent but is not yet a clean experiment:

1. **Experiment 13 did not conclusively lose.** Its core verdict is unrun; the adverse result cited
   above is N=1. Describe it as preliminary evidence, not a settled comparison.
2. **The proposed arms do not hold total budget constant.** Several fresh rounds, each receiving
   14's full per-round allowance, cannot be compared fairly with one bounded round. Any gain could
   be caused by more calls, tokens or wall time rather than clearing context.
3. **Evidence is not the same as learned reasoning.** An `OpResult` remembers what was computed. It
   does not remember why it was computed, which hypothesis failed, what remains unanswered, or why
   one result matters to the question.
4. **One `OpResult` is not naturally one finding.** It can contain zero, one or many rows and may be
   orientation, an error, a preview, a reusable dataset or an answer-bearing computation.
5. **`summary` reopens the grounding hole.** If the model writes it, attached SQL does not prove the
   prose follows from the rows. If the harness writes it, deterministic operation-specific
   extraction rules still have to be specified.
6. **`get_schema()` does not currently provide the proposed findings index.** The shipped operation
   returns table/column schema, not counts by finding category, and its engine query currently omits
   `table_schema`. A bounded round-start index therefore needs an explicit product contract; it is
   not “free reseeding.”
7. **Scoring only the last analysis round confounds retrieval with synthesis.** Use a separate
   fresh terminal synthesis round with a frozen evidence-access policy.
8. **Full replay versus indexed pull is a retrieval ablation, not the first product decision.** Do
   not build both until the core equal-budget cleared-context comparison is affordable and ready.
9. **The current model-facing catalog overstates several handlers.** `get_schema`,
   `describe_table`, `column_stats` and some `create_chart` variants promise richer product data or
   chart forms than their current handlers return. Freeze conformance against real output before
   expanding MCP; a reasoning model cannot choose tools robustly from aspirational descriptions.
10. **The live workspace is not yet externally reachable.** The analyst MCP is an in-process tab
    connection. The edge MCP reads explicitly shared DSPS artifacts, not the tab-held DuckDB.
    “Every feature via MCP” therefore also requires a reviewed reach model (tab relay, local
    companion or staged server data); adding schemas to the in-process server alone does not give a
    design-review agent access to a user's live workspace.

### 3. Target product architecture

```text
DuckDB + workspace registry + OPFS
                 |
                 v
        shared analyst operations
                 |
                 v
  evidence artifacts + provenance graph
          /                  \
         v                    v
 DataScope product UI      MCP capability surface
                               |
                               v
                    cleared-context orchestration
             planner -> analyst rounds -> synthesizer -> verifier
```

Dependency rules:

1. The LLM is one caller of DataScope, never the owner of a parallel computation path.
2. A UI click, an in-tab model, and an external MCP client performing the same action must reach
   the same service/core implementation and produce the same artifact shape.
3. MCP exposes product capabilities, not arbitrary Zustand writes, DOM events or unvalidated tab
   envelopes.
4. App code continues to author UI envelopes. Model input may fill only validated inner specs and
   ordinary labels, as the current chart/pin boundary already requires.
5. Evidence identity, provenance, paging, caching, staleness and persistence are product
   infrastructure. Planning rounds, prompts, token budgets and challenger passes stay in a thin
   orchestration layer above it.
6. “One path” means one shared execution/evidence primitive, not forcing every caller through one
   globally serialized queue. Interactive SQL, bounded concurrent profile probes and agent calls
   have different scheduling needs but must share statement guards, artifact recording and result
   contracts.

### 4. Replace the first-draft `analysis.findings` table with a reasoning ledger

The six-column table in the original draft is too lossy. The model needs to recover five different
kinds of state after a clear, and their trust levels must not be conflated:

1. **Evidence:** what DataScope actually computed.
2. **Findings/claims:** what a producer says the evidence means.
3. **Requirements:** what the answer must establish.
4. **Work state:** open questions, planned checks and dependencies.
5. **Attempts:** successful, failed, duplicate and abandoned actions.

Use normalized storage for those concerns and expose `analysis.findings` as the one convenient,
model-facing joined relation. DuckDB remains the only data store; no vector database is proposed.

The trust boundary has two lanes and the UI, MCP resources and prompts must preserve the label:

```text
deterministic lane                         model-authored lane
------------------                         -------------------
attempt receipts                           candidate claims / interpretations
operation parameters                       concise rationales
exact SQL                                  hypotheses and open questions
actual result values and metadata          proposed requirement updates
dataset/input fingerprints                 suggested next steps
mechanical verification outcomes           semantic-review notes
```

The harness can deterministically save what happened. It cannot deterministically infer why a
result matters. That “why” arrives through a typed, model-authored handoff and stays visibly
model-authored even when later evidence verifies the claim.

Logical relations proposed for review:

| Relation | Purpose |
| :--- | :--- |
| `analysis.runs` | Original question, dataset revision, semantic-catalog version, privacy mode, total budget and run status |
| `analysis.rounds` | Phase, enforced ceilings, actual usage, progress counters and stop reason |
| `analysis.requirements` | Answer contract and evidence-backed satisfaction state |
| `analysis.work_items` | Open questions, hypotheses, checks, caveats and follow-ups |
| `analysis.attempts` | Every call, including errors, cancellation and exact duplicates |
| `analysis.artifacts` | Immutable deterministic computation receipts |
| `analysis.artifact_inputs` | Exact table/column/object revisions an artifact depends on |
| `analysis.evidence_slices` | Harness-copied, bounded actual rows/cells used by a claim |
| `analysis.run_artifacts` | Which run/round discovered or reused an artifact |
| `analysis.claims` | Human- or model-authored findings and interpretations |
| `analysis.claim_evidence` | Many-to-many support, qualification, contradiction and context links |
| `analysis.reasoning_notes` | Concise public decision records, never raw chain-of-thought |
| `analysis.claim_relations` | Duplicate, supersedes, qualifies and contradicts relationships |
| `analysis.verifications` | Integrity, mechanical, model-review and human-review outcomes kept distinct |
| `analysis.requirement_claims` | Claims that satisfy or partially address requirements |
| `analysis.answers` / `analysis.answer_claims` | Versioned terminal answers and sentence-level provenance |

Only curated views should appear in ordinary schema discovery. The physical ledger tables should
be hidden or clearly marked internal, and model access to them is read-only; only host code performs
parameterized writes.

#### 4.1 Deterministic evidence artifacts

```text
analysis.artifacts(
  artifact_id          text primary key,
  request_hash         text not null,
  hash_version         integer not null,
  dataset_fingerprint  text not null,
  operation_version    text not null,
  operation            text not null,
  operation_category   text not null,
  parameters_json      json not null,
  normalized_sql       text,
  result_hash          text,
  materialization_id   text,
  schema_json          json not null,
  row_count            bigint not null,
  complete             boolean not null,
  body_status          text not null,
  table_refs_json      json not null,
  column_refs_json     json not null,
  warnings_json        json not null,
  created_at           timestamp not null,
  materialized         boolean not null,
  stale                boolean not null default false
)
```

- `artifact_id` is the durable identity of the observed evidence artifact: hash the dataset
  fingerprint, operation name/version, canonical request and observed result.
- `request_hash` is the pre-execution identity used to avoid exact repeated work; the durable
  artifact identity also includes the result and input revisions.
- `result_hash` separately identifies the observed output. Input identity and output identity must
  not be conflated: the same query against a changed dataset is the same analytical intent but not
  the same evidence.
- `materialization_id` points at the current `ResultStore` body and may disappear under compaction.
  The receipt survives and carries enough SQL/schema information to recompute with an explicit
  stale/recomputed transition.
- Do not claim semantic equivalence from hashes. Exact hashing deduplicates exact normalized work;
  two different SQL statements that happen to mean the same thing remain distinct initially.
- Define result hashing carefully for unordered relations. Either hash a canonical multiset form or
  explicitly record that the digest is materialization-order-specific; never pretend an arbitrary
  row order is semantic.
- Every successful factual operation creates or reuses an artifact, including small inline
  operations that never enter today's `ResultStore`. Non-factual actions such as navigation and
  pinning create attempts/action receipts, not factual artifacts.
- For small complete results, persist canonical rows. For a large result, retain the immutable
  receipt, hash, a harness-copied bounded evidence slice, its completeness for the cited claim and
  an explicit recomputation path. The model may choose a locator; it never writes evidence values.

#### 4.2 Claims and concise rationales

```text
analysis.claims(
  claim_id             text primary key,
  claim_hash           text not null,
  fact_key_hash        text,
  run_id               text not null,
  round_id             text not null,
  claim_kind           text not null,
  epistemic_class      text not null,
  statement            text not null,
  structured_scope_json json,
  verification_status  text not null,
  confidence_class     text not null,
  created_by           text not null,
  duplicate_of         text,
  created_at           timestamp not null
)
```

Allowed `claim_kind` values should distinguish at least `comparison`, `trend`, `relationship`,
`quality`, `structural`, `limitation` and `unsupported`. `verification_status` should distinguish
`draft`, `mechanically_verified`, `reviewed`, `rejected`, `superseded`, `conflicted` and `stale`.
`epistemic_class` separately distinguishes `computed`, `derived` and `interpretation`.

`structured_scope_json`, where applicable, records measure, aggregation, dimensions, filters, time
range, grain, comparator, denominator, unit and population. This is more useful to a later round
than prose matching and makes wrong-scope claims mechanically detectable.

Rationale belongs in a separate note record:

```text
analysis.reasoning_notes(
  note_id,
  claim_id,
  work_item_id,
  note_kind,       -- why_relevant | derivation_summary | caveat |
                   -- alternative_considered | next_question
  text,
  created_round,
  author,          -- model | harness | human
  trust            -- model_note | deterministic
)
```

The text is a short, user-readable procedural note such as “grouped completed-order line value by
calendar month and compared adjacent periods.” It is **not raw chain-of-thought**, hidden reasoning,
or trusted evidence. Do not persist private provider reasoning even if a provider emits it. A claim
may cite several artifacts through a join table:

```text
analysis.claim_evidence(
  claim_id,
  artifact_id,
  evidence_slice_id,
  locator_or_derivation_json,
  role,                  -- supports | qualifies | contradicts | context
  verification_status
)
```

The locator names the exact rows/cells or deterministic derivation used, so “the SQL exists” is not
mistaken for “the prose follows from its result.”

#### 4.3 Answer requirements

```text
analysis.requirements(
  requirement_id       text primary key,
  analysis_id          text not null,
  description          text not null,
  requirement_kind     text not null,
  status               text not null,
  satisfied_by_json    json not null,
  created_round        integer not null,
  updated_round        integer not null
)
```

Before computation, convert the question into a small answer contract: requested measure, grain,
scope, comparison, entity/value, time window and material caveat. Requirement text is planning
state, not evidence. A requirement becomes `satisfied` only through a deterministic check or a
verified claim link; the model merely saying it is satisfied is insufficient.

#### 4.4 Work items and hypotheses

```text
analysis.work_items(
  work_item_id          text primary key,
  analysis_id           text not null,
  requirement_id       text,
  parent_id             text,
  question              text not null,
  why_needed            text,
  expected_evidence     text,
  status                text not null,
  priority              integer not null,
  depends_on_json       json not null,
  proposed_by_round     integer not null,
  resolved_by_json      json not null
)
```

This is how a cleared round recovers useful direction without replaying a transcript. It may record
“check join multiplicity before summing line value” or “determine which status values really
exist.” These are untrusted planning notes. They guide the next action but never reach the user as
facts without evidence.

#### 4.5 Attempt and failure receipts

```text
analysis.attempts(
  attempt_id            text primary key,
  analysis_id           text not null,
  round_id              text not null,
  operation             text not null,
  parameters_json       json not null,
  artifact_id           text,
  disposition           text not null,
  error_code            text,
  error_message         text,
  duplicate_of          text,
  contributed           boolean not null,
  elapsed_ms            bigint not null,
  prompt_tokens         bigint,
  output_tokens         bigint,
  created_at            timestamp not null
)
```

Dispositions should include `contributing`, `orientation`, `unused`, `duplicate`, `rejected`,
`failed`, `cancelled` and `abandoned`. Persisting failure receipts prevents a cold round from
retrying the same nonexistent value, invalid join or equivalent SQL and makes cost visible.

#### 4.6 Round and progress state

```text
analysis.rounds(
  round_id                    text primary key,
  analysis_id                 text not null,
  round_number                integer not null,
  phase                       text not null,
  terminal_reason             text,
  new_artifact_count          integer not null,
  new_verified_claim_count    integer not null,
  requirements_satisfied      integer not null,
  duplicate_attempt_count     integer not null,
  failed_attempt_count        integer not null,
  operation_calls             integer not null,
  prompt_tokens               bigint not null,
  output_tokens               bigint not null,
  wall_ms                     bigint not null,
  started_at                  timestamp not null,
  ended_at                    timestamp
)
```

Progress is host-computed. Continue only when the round adds useful evidence or satisfies an open
requirement within the remaining whole-analysis budget. “The model wants another round” and a new
piece of prose are not progress.

#### 4.7 The model-facing `analysis.findings` relation

`analysis.findings` should be a view over claims, evidence links, artifacts and requirements, not
the canonical storage for every raw operation result:

```text
analysis.findings(
  finding_id,
  analysis_id,
  round_number,
  requirement_id,
  category,
  claim_kind,
  epistemic_class,
  statement,
  rationale,
  structured_scope_json,
  verification_status,
  confidence_class,
  artifact_ids,
  evidence_count,
  evidence_glance_json,
  primary_operation,
  primary_sql,
  result_hash,
  evidence_locator_json,
  table_refs_json,
  column_refs_json,
  row_count,
  complete,
  warnings_json,
  conflict_count,
  is_current,
  duplicate_of,
  stale,
  created_at
)
```

Rules for making this relation genuinely useful to reasoning:

1. Default retrieval ranks `verified` and non-stale findings before drafts and interpretations.
2. Every row makes its trust class visible; no consumer infers trust from prose style.
3. Findings can be filtered by requirement, table, column, category, operation, round, status and
   contribution—not just category.
4. Store exact evidence locators and warnings alongside the claim, so a later round sees scope and
   caveats without rereading an entire result.
5. Keep rejected and duplicate findings queryable but outside the default verified view; they are
   valuable for avoiding repeated mistakes.
6. Never automatically promote `sample_rows` or an arbitrary preview into a finding. Orientation
   artifacts remain attempts unless a later whole-data computation verifies the claim.
7. An `interpretation` can help the model decide what to do next but cannot satisfy a factual answer
   requirement without supporting evidence.
8. Mark all dependent findings stale when their dataset fingerprint no longer matches the active
   dataset. Never silently relabel old evidence as current.
9. Surface conflicts and competing scoped facts; do not silently choose the newest claim.
10. `evidence_glance_json` may contain only harness-copied bounded values and explicit completeness,
    never a model-invented synopsis.

Expose `analysis.finding_evidence` as the detail view behind a finding: exact operations,
parameters, SQL, schema, row count, body/completeness state, validated evidence slices and layered
verification records.

Expose bounded companion views:

```text
analysis.findings_index    -- counts by status/category/requirement/table plus newest round
analysis.open_work         -- unresolved requirements and runnable work items
analysis.failed_attempts   -- compact fingerprints and mechanical errors
analysis.verified_findings -- only verified, non-stale claims
```

The round-start packet should be built deterministically from those views and remain bounded:

```text
original question
+ answer contract and satisfaction state
+ relevant schema/relationship summary
+ findings index
+ highest-priority open work
+ compact duplicate/failure fingerprints
+ remaining total budget
```

Detail remains pull-based through SQL or a thin evidence-read capability. The model should not
receive the whole findings table every round.

Proposed typed retrieval surface, backed by the same views:

```text
query_analysis_memory(
  kind: index | finding | evidence | requirement | attempt | work_item,
  ids?,
  statuses?,
  categories?,
  tables?,
  columns?,
  requirement_ids?,
  text?,
  limit?
)
```

This saves a small model from remembering internal SQL while `run_sql` remains the flexible escape
hatch. `read_result` remains valid whenever a live materialization exists. `get_schema()` must add
`table_schema`, accept qualified names and expose the curated public analysis views; it must not
claim to return a findings index unless the handler actually does so.

### 5. Hashing, deduplication and staleness policy

Use hashes for identity and linkage, not as a substitute for meaning:

```text
artifact_id = hash(
  artifact_contract_version,
  dataset_fingerprint,
  operation_version,
  request_hash,
  result_hash
)

request_hash = hash(
  request_contract_version,
  sorted_input_fingerprints,
  operation,
  canonical_parameters,
  normalized_sql
)

fact_key_hash = hash(
  metric,
  aggregation,
  dimensions,
  filters,
  time_window,
  population,
  unit
)

claim_id = hash(
  claim_contract_version,
  fact_key_hash,
  normalized_assertion,
  sorted_evidence_links,
  claim_kind
)
```

Required properties:

- Version every canonicalization algorithm. A hash produced under v1 must remain explainable after
  v2 ships.
- Keep dataset fingerprint, request identity and output hash as separate fields.
- Use `request_hash` to avoid exact repeated computation, `result_hash` to detect changed output,
  `artifact_id` for durable evidence identity and `fact_key_hash` to surface competing answers to
  the same analytical question.
- Exact duplicate detection is enough for the first build. Do not introduce embeddings or semantic
  consolidation until measured table growth or retrieval failure justifies them.
- If later semantic deduplication is added, it may suggest `duplicate_of`; it must not delete or
  merge verified evidence without a deterministic rule.
- Hash-addressed metadata is durable. Result bodies remain subject to `ResultStore` and workspace
  storage ceilings.
- A hash is identity, not anonymization. Do not emit hashes, parameters, SQL or result-derived ids as
  telemetry under the assumption that hashing made them harmless. If ids ever cross workspace
  boundaries, review a workspace salt/HMAC design.

### 6. Reasoning workflow over the ledger

Use separated fresh contexts so each phase has one job:

```text
question
  -> answer-contract/planning round
  -> analysis round 1
  -> deterministic persistence + progress check + context clear
  -> analysis round 2 (only if progress and budget permit)
  -> fresh terminal synthesis round
  -> deterministic claim checks
  -> optional fresh targeted challenger
  -> final answer with evidence links
```

Initial ceiling proposed for review: **two analysis rounds plus one terminal synthesis round**.
The challenger is an explicit ablation or a bounded post-check, not an unlimited fourth analyst.

At each forced analysis-round end, reserve a small and fully counted typed checkpoint. The model may
propose candidate claims, concise rationale notes, requirement changes and open work items. Host
code validates every referenced id and structured field before writing the model-authored lane. If
checkpoint generation fails, automatic evidence and attempt persistence still succeeds; only the
optional handoff is absent.

Planner responsibilities:

- Produce the small answer contract and prioritized work items.
- Identify missing information and required safeguards such as join coverage.
- Never produce user-visible facts merely by planning them.

Analyst responsibilities:

- Use DataScope capabilities to satisfy requirements.
- Prefer typed operations; use `run_sql` as the escape hatch.
- Read relevant prior evidence, open work and failure receipts instead of a transcript.
- Attach candidate claims only to exact artifact locators.

Synthesizer responsibilities:

- Receive the question, answer contract and a bounded set of selected verified evidence.
- Cite artifact/finding ids for every material factual statement.
- Distinguish `computed`, `derived`, `interpretation` and `unsupported` language.
- Have no authority to invent a new computation during prose generation. If a required fact is
  absent, state the limitation or return the requirement to analysis before the terminal phase.

Targeted challenger responsibilities:

- Inspect only the proposed answer, original question and cited evidence.
- Flag unsupported entities/numbers, wrong filters or windows, incorrect ranking direction,
  revenue/profit substitution, causal language and missing material caveats.
- Never introduce new facts and never become an unreviewed second author.

Stop when a round adds no new unique current evidence, satisfies no new requirement through
accepted evidence and resolves no blocker—or when the fixed whole-analysis ceiling is reached. New
prose alone never counts as progress.

#### 6.1 Layered verification

Do not flatten different checks into one reassuring `verified` boolean:

1. **Integrity:** input revisions, hashes, schema, row count and body/materialization state agree.
2. **Link validity:** every cited artifact and evidence slice exists and belongs to the active
   dataset revision.
3. **Mechanical claim checks:** cited values/entities exist; formulas recompute; rank direction,
   filters, time windows, units, denominators and structured scope agree.
4. **Semantic review:** a bounded challenger or human checks whether the prose overstates what the
   evidence establishes.

Record the layer, verifier and outcome separately. A second model's approval is review, not
deterministic proof. “Largest,” “all,” “none” and “only” require complete evidence or a query shaped
to prove the assertion. Causal wording remains unsupported without a genuinely causal method and
data.

#### 6.2 Privacy and prompt safety

- Keep the complete ledger local to the workspace by default.
- Apply sensitive-column and privacy-mode policy before projecting rows, SQL literals, rationales
  or evidence slices into a cloud-model prompt.
- Treat dataset text as untrusted data, delimit it and cap it; it is never an instruction source.
- Retain exact local SQL for audit, but allow redacted prompt copies where SQL contains sensitive
  literals.
- Never emit findings, parameters, SQL, hashes or row values as telemetry.
- Provide run-, dataset- and workspace-level purge with cascading ledger cleanup.
- The model receives read-only access to curated `analysis` views and cannot forge evidence,
  verification outcomes or host-authored trust fields.

### 7. DataScope consolidation: replace overlap rather than adding a second system

#### 7.1 Keep and extend

- Keep `src/lib/analyst/resultStore.ts` for stable materialization, paging, receipts, compaction and
  memory ceilings. Add durable `artifact_id` beside its ephemeral `resultId`; do not make the
  evidence ledger own result-body memory.
- Keep the analyst operation catalog, DuckDB executors, statement authority, mutation guards, host
  `Catalog`/`Workspace` seams, MCP transport, chart validation and query tabs.
- Keep ingestion/OPFS restoration and the deterministic dossier as product primitives and fallback
  behavior.

#### 7.2 Replace or converge

1. **Query history:** replace random-id entries containing copied `QueryResult` row arrays in
   `stores/query.ts` with attempt receipts referencing `artifact_id`. Resolve previews from the
   result/evidence service.
2. **Read-only SQL execution:** introduce a shared artifact-producing execution primitive used by
   both the console and analyst core. Today `services/sql.ts` executes an ad-hoc preview, then
   re-executes through `run_sql` only when “load more” is requested. One execution should create one
   stable artifact from page one onward, but do not blindly route every UI probe through
   `analystCore().call`: the core serializes calls, while profiling/insight work intentionally uses
   bounded concurrency, and full materialization has a different first-paint/memory shape from the
   console's capped preview. Design explicit interactive, batch and agent scheduling lanes over the
   same lower-level guard/recorder. Keep DDL/DML on the guarded transform path.
3. **Query tabs/pins:** make a tab hold an artifact reference plus editable SQL instead of adopting
   a copied result as its durable identity. The existing app-authored tab envelope remains.
4. **Insights and dossier:** keep their deterministic probe builders and ranking rules, but route
   probe execution through the shared artifact-producing path rather than direct worker calls in
   `services/insights.ts` and `services/dossier.ts`.
5. **Facts:** introduce `ClaimRef { claimId, statement, evidenceIds, classification,
   verification }` and adapt it temporarily to the existing `FactRef`. Once every consumer has
   migrated, stop duplicating SQL/snapshot/provenance inside every prose carrier.
6. **Lineage:** extend the current derived-object lineage into an artifact graph:
   `dataset -> query -> derived object -> chart/pivot -> claim -> report/export`. Keep the existing
   name-based derived-object inference as the first implementation; record known inputs at
   execution time rather than reparsing everything later.
7. **Workspace persistence:** persist artifact receipts, attempts, claim/work state and pinned
   artifact references alongside registry metadata. Result bodies remain evictable; a missing body
   is reported and may be explicitly recomputed from SQL.
8. **Synthesis:** retain today's deterministic baseline and validated rephrasing seam during
   migration. Replace the AI rephrasing path only after evidence-bound synthesis passes its frozen
   benchmark and degradation behavior remains honest.

#### 7.3 Concrete current-path constraints for migration

The implementation plan must account for these observed details rather than designing over an
imagined clean slate:

- Add artifact/attempt recording as middleware around the core/execution boundary, not persistence
  calls scattered through individual handlers. That is how inline results, errors and cancellations
  are captured uniformly.
- Replace today's blanket `markContributed(resultId)` behavior with explicit
  claim/artifact, pin/artifact and answer/claim edges. “The agent eventually answered” does not mean
  every materialization contributed.
- Introduce explicit table and dataset revisions. `createdAt`, optional file hashes and API refresh
  timestamps are insufficient: sampled/API/shared/derived inputs and semantic overrides can change
  meaning without a comparable source-file hash.
- Run the ledger in shadow mode first and prove it does not change operation outcomes before any UI
  begins depending on it.
- Preserve the console's large-result behavior deliberately. Today it can show a capped preview when
  full analyst materialization would exceed the store ceiling. Choose a bounded non-pageable preview
  artifact, two-tier body store, OPFS-backed body or reviewed UI-specific policy before removing the
  old path.
- Stop accumulating every loaded result row in Zustand. Sessions should retain current SQL,
  artifact id and a bounded page cache; history and tabs retain references. Closing a tab removes one
  reference, not necessarily an artifact still cited by a finding, chart, answer or export.
- Syntactic insights derived from profile metadata need `source_kind = profile_snapshot`; do not
  present illustrative SQL that never ran as execution evidence. Dossier/relationship invalidation
  must depend on dataset revision, not merely table id or unchanged column count.
- Treat charts as artifacts linked to source artifacts and validated specs. Exports operate on an
  explicit `preview`, `full_materialization` or `source_table` scope so “export result” never silently
  means only the rows presently loaded in the grid.
- Store content-bearing ledger records in OPFS or another workspace-governed content store, not
  `localStorage`. The existing clear-workspace action must cascade through ledger, result bodies,
  MCP/core session and registry metadata.
- Add normalized provider token/latency usage before claiming product-enforced equal budgets; the
  current common provider response does not supply enough accounting for that gate.

#### 7.4 Likely code ownership map

| Concern | Existing owners to extend or migrate |
| :--- | :--- |
| Artifact envelope and core middleware | `src/lib/analyst/types.ts`, `core.ts`, `operations.ts` |
| Ephemeral bodies and paging | `src/lib/analyst/resultStore.ts` |
| Dataset/table revisions | `src/types/dataset.ts`, `stores/datasets.ts`, `services/ingestion.ts`, `services/transforms.ts` |
| Shared evidence execution lanes | new service below `services/sql.ts`, profiling/insight/dossier/quality/relationship services and analyst executors |
| Query sessions/history/tabs | `src/stores/query.ts`, `src/types/query.ts`, `src/services/queryTabs.ts`, SQL result components |
| Claims and deterministic findings | `src/types/actions.ts`, `lib/citableFacts.ts`, `lib/capabilities.ts`, `lib/dossier.ts`, producer validators |
| Provenance graph | `src/lib/analyst/lineage.ts`, dataset registry generating SQL, artifact/claim link tables |
| Workspace content persistence | `src/services/workspace.ts`, `rehydration.ts`, OPFS workers/protocol, persistence store |
| Chart and export artifacts | `src/lib/chartMapper.ts`, producer validators, `services/charts.ts`, export/result-export/recipe/Jupyter paths |
| Cleared-round orchestration | `src/services/ai.ts`, provider adapters/types, AI turn/audit UI |
| MCP registry, resources and reach | analyst tool schemas/server/connect/session, edge shared-artifact MCP, host seams and ADR-012 decision |

The end-state invariant:

> **Every computation creates one evidence artifact; every product surface reads that artifact;
> every material claim cites it; every agent round remembers through it.**

### 8. MCP parity: every DataScope capability must be reachable

“Every feature via MCP” means **capability parity, not DOM parity**. The model does not need tools
for clicking arbitrary pixels, setting raw store fields, exposing credentials or authoring unsafe UI
envelopes. It must be able to inspect, invoke, or—where human authority is required—request every
meaningful product capability through the same underlying implementation the UI uses.

No feature is exempt merely because it began as a visual control. Every shipped capability must be
registered in one product capability registry with one of these access classes:

- `read`: inspect state or metadata.
- `compute`: produce deterministic evidence.
- `write`: create or change a recoverable workspace artifact.
- `ui_action`: focus/open a safe app-authored destination or request a browser-mediated action.
- `external_effect`: network upload, share creation, download or other egress; explicit user
  approval and a preview are required.
- `destructive`: delete/clear/drop; exact target resolution plus explicit confirmation is required.
- `secret/admin`: inspect availability/status only. Raw keys, tokens and authority settings are
  never returned to the model and cannot be silently changed by it.

#### 8.1 Capability groups and proposed MCP coverage

| DataScope area | Capabilities that must be reachable | Proposed MCP surface | Access / boundary |
| :--- | :--- | :--- | :--- |
| Workspace | active dataset, tables, tabs/artifacts, storage/restore status, workspace summary | `workspace_status`, `list_datasets`, `list_artifacts`, workspace resources | read |
| Ingestion | supported formats/size tiers, bundled samples, file/folder/ZIP, URL/API/relay, shared object/DSPS import, progress and failures | `list_ingest_sources`, `ingest_sample`, `ingest_url`, `ingest_share`, `request_file_ingest`, `ingest_status` | URL/network and file-picker calls are consented UI actions; accept attached resources/blobs, never fabricated host paths |
| Dataset registry/lifecycle | inspect, rename where supported, origin, sampled/full status, fingerprint, refresh, recover, remove table/dataset | `get_dataset`, `get_table`, `refresh_table`, `recover_table`, guarded rename/remove operations | read/write/destructive; refresh is explicit and atomic; source removal is confirmed |
| Schema/profile | whole schema, table description, column classification/reason, distributions, value domains, samples, sensitive-column hints | retain and make truthful `get_schema`, `describe_table`, `column_stats`, `distinct_values`, `search_values`, `sample_rows`; add `get_semantic_profile` and sensitivity/status resources | read/compute; sampling is never whole-data proof |
| Semantic overrides | correct/restore an inferred semantic type when the product supports it | `set_semantic_type`, `restore_semantic_type` | write; auditable and reversible, with user/model provenance |
| Data quality | null concentration, constants, duplicates, type/shape warnings and quality report | retain `data_quality`; evidence-backed quality artifact reads | compute |
| Insights/capability broker | deterministic insight candidates, capability availability, suggested explorations and frozen suggestion SQL | `get_insights`, `get_capabilities`, `get_suggestions`, `run_suggestion` | read/compute/ui_action; do not merge deterministic candidates with model interpretations |
| Relationships/map | inferred edges, ERD/dataset map, join SQL, coverage, multiplicity, orphan keys, accept/reject/override relationship where product supports it | retain `join_coverage`; add `list_relationships`, `infer_relationships`, guarded `set_relationship` | read/compute/write; overrides are explicit artifacts |
| SQL | validate, execute, cancel, format, page, inspect history/failures, query suggestions, save/pin | retain `validate_sql`, `run_sql`, `read_result`, `pin_result`; add `cancel_operation`, `list_attempts`, `get_attempt`, `suggest_queries` | compute/write |
| Derivation | create table/view, inspect lineage, drop derived object, replay/recover | retain `derive_table`, `create_view`, `drop_derived`; add lineage/artifact reads | write/destructive; source tables remain non-droppable through this path |
| Guarded source transforms | preview a source mutation, create a safe copy, or request confirmed mutation where the product permits it | `preview_transform`, `apply_transform` with copy default, separate confirmed source-mutation request | write/destructive; never bypass the existing guard or silently mutate a source |
| Pivot | inspect pivot capability, compile/run a pivot, retain its SQL/result, open it in the app | `build_pivot` producing the same compiler SQL and evidence artifact | compute/ui_action |
| Charts | recommend compatible forms; distribution/box plot, categorical, time-series/moving average/seasonality, scatter/correlation and join graph; validate/refine, create and pin/open | make `create_chart` truthful; add `list_chart_options`, typed `chart_analysis`, `open_artifact` | compute/write/ui_action; reuse existing builders and validated inner specs only |
| Dossier/Blueprint | deterministic dataset identity, counts/span, quality, time coverage, insights, ranked next actions, full report | `build_dossier`, `get_dossier`, evidence resources | compute/read; deterministic result remains fallback |
| Findings/evidence | list/search artifacts, verified findings, open requirements/work, failed attempts, exact provenance and staleness | `find_evidence`, `get_evidence`, `get_finding`, `list_open_work`; SQL views remain available | read; model-written notes are visibly untrusted |
| Navigation/workbench | open/focus Profile, Map, SQL console, Pivot, Charts, Correlation, Export, Ingestion, History and a particular artifact | `open_destination`, `open_artifact` routed through existing navigation/tab services | ui_action; app authors the envelope |
| Tabs/selection/drawer | inspect tabs and current selection, open/activate/close safe destinations, focus a table/column/relationship/result | `get_ui_state`, `list_tabs`, `select_subject`, `activate_tab`, `close_tab` | read/ui_action; semantic targets only, never arbitrary selectors or envelope payloads |
| Export | table/result CSV/Parquet and supported spreadsheet formats, transformation recipe, Jupyter snippet, DSPS/HTML/AI-context and report/artifact export | `prepare_export`, `export_result`, `build_transform_recipe`, `build_jupyter_recipe`, `build_dsps`, `build_dsps_html`, `build_ai_context` | external_effect/ui_action; return a resource/download handle and require the host gesture |
| Share/persistence | structure-only share, redacted structure share, full-dataset share, list/revoke links, open share | `preview_share`, `create_share`, `list_shares`, `revoke_share`, `open_share` | external_effect/destructive; structure-only default, sensitive-column warning, explicit full-row escalation |
| Viewer/trust | validate, inspect, render/open and close DSPS or reports; provenance/snapshot and validation disposition | `validate_dsps`, `inspect_dsps`, `open_dsps_resource`, `open_report`, `close_viewer` | read/ui_action; imported documents are untrusted read-only data |
| Workspace durability | stage/restore status, stale/lost/recoverable artifacts, storage estimate, clear workspace | `persistence_status`, `restore_workspace`, `request_clear_workspace` | read/ui_action/destructive; clear requires exact confirmation |
| AI session/runtime | selected privacy mode, provider availability, local-model download/warm status, quota/degradation, current turn/trace and cancellation | `ai_runtime_status`, `get_ai_trace`, `cancel_ai_turn`; browser-mediated `request_local_model_download` if needed | read/secret/admin/ui_action; prevent recursive self-calls and never reveal keys or broaden authority |
| Preferences/settings | inspect relevant feature/privacy posture and open the corresponding settings surface | `get_preferences`, `open_settings`; narrowly typed confirmed changes only where justified | read/secret/admin/ui_action; credentials never enter or leave through a model call |
| Privacy/security | data-boundary state, likely-sensitive columns, whether an operation sends rows off-device, applicable approval | capability metadata plus `privacy_status` and per-call effect preview | read; boundary enforcement lives below prompts |
| Status/telemetry | running/cancelled operations, memory/headroom, result-store pressure, ingestion/query status | `system_status`, progress notifications | read |
| Future ML/NLP modules | clustering, regression, classification and NLP capabilities only as each becomes a real DataScope product path | register typed operation, artifact output and MCP binding in the same change that ships the feature | compute; no aspirational tool before a real implementation and evaluation gate exist |

The final names are reviewable; the required capability coverage is not. A local-file picker,
clipboard write or browser download may necessarily finish through a human-mediated host action,
but it still needs an MCP-visible request/preview/result contract so the analyst can help the user
reach it.

The reviewer must also select how an external MCP client reaches the live browser workspace. The
current in-process connection is sufficient for DataScope's own chat but not for a desktop/design
review agent. A tab relay, local companion or deliberately staged server workspace each has
different custody and availability consequences. The edge shared-artifact MCP should remain a
separate read-only surface unless that reach decision explicitly folds it in; it must never be
mistaken for live-workspace parity.

#### 8.2 Avoid a fifty-tool prompt

Full product reach must not mean sending every schema on every model turn. The existing catalog is
already near the measured small-model limit. Add a capability registry and progressive disclosure:

1. Every capability has a stable id, domain, description, access class, input/output schema,
   privacy effect, approval policy, product service owner and MCP binding.
2. MCP clients can discover the full registry. The in-tab analyst receives a task-relevant tool
   profile plus a small discovery surface; it can load another domain when needed.
3. Prefer MCP resources for large read-only state (`schema`, evidence index, history, dossier) and
   typed tools for computation or effects.
4. Do not collapse everything behind one untyped “invoke anything” tool. Native typed schemas and
   clear effect metadata are part of the safety boundary.
5. Keep the full external MCP surface and the in-tab prompt subset generated from the same registry,
   so accessibility and prompt economy cannot drift into separate catalogs.

Possible resources:

```text
datascope://capabilities
datascope://workspace
datascope://schema
datascope://relationships
datascope://evidence/index
datascope://evidence/{artifact_id}
datascope://findings/verified
datascope://analysis/open-work
datascope://history
datascope://dossier
datascope://privacy
```

#### 8.3 MCP parity enforcement

Add a build-time/test-time coverage gate:

```text
product capability registry
        |-- UI binding
        |-- MCP binding or human-mediated MCP request binding
        |-- access/effect metadata
        `-- conformance tests
```

- Every registered feature must declare its MCP status.
- A shipped feature with neither an MCP binding nor an explicit human-mediated request contract
  fails the parity test.
- The parity declaration does not authorize unsafe automation. Destructive, egress and secret/admin
  features pass only when their confirmation/status-only boundary is tested.
- Path-identity tests should prove UI and MCP calls reach the same service/core function rather than
  two implementations that merely agree in fixtures.
- Native and Wasm conformance remains required for analytical operations.

### 9. Prebuild work packages

Do not start implementation until a reviewer has accepted or amended the contracts below.

#### P-1 — reviewer decisions

- Approve the narrow equal-budget hypothesis and retire “13 lost” as a premise.
- Decide whether the canonical model-facing `analysis.findings` is a view as proposed.
- Freeze trust classes, claim kinds, verification states and stale behavior.
- Freeze dataset/artifact/result/claim identity inputs and hash-version policy.
- Decide the initial total budget, proposed two-analysis-round ceiling and challenger status.
- Decide which host effects require confirmation and how an external MCP client receives it.
- Select and threat-model the live-workspace external MCP reach model; do not confuse the in-process
  tab connection or shared-DSPS edge reader with that decision.
- Decide progressive-disclosure mechanics without creating a second tool catalog.

#### P0 — contracts and failing tests, no orchestration

- Add types for artifacts, claims, evidence links, requirements, work items, attempts and rounds.
- Add the capability registry contract and access/effect metadata.
- Add hash canonicalization fixtures, including unordered results and dataset changes.
- Add stale-invalidation, exact-dedup, claim/evidence-locator and trust-separation tests.
- Add an MCP parity test over the full registered product feature inventory.
- Add tool-contract conformance fixtures proving descriptions and schemas match actual handler
  output; close the current `get_schema` / `describe_table` / `column_stats` / chart-form drift.
- Freeze an artifact schema version and migration behavior before storing anything durable.

#### P1 — evidence ledger and result-store bridge

- Add durable artifact identity beside ephemeral `ResultStore` ids.
- Persist every analyst outcome and attempt mechanically; do not ask the model to remember to save.
- Capture bounded inline operations as artifacts even though they do not enter today's `ResultStore`.
- Create the normalized `analysis.*` tables/views and bounded round-start index.
- Add paging/recomputation behavior when a receipt survives but its body has been compacted.
- Add dataset-fingerprint staleness propagation.

#### P2 — converge existing DataScope paths

- Build the shared evidence-execution primitive and explicit interactive/batch/agent scheduling
  lanes; converge the read-only console and analyst core on it without serializing all profile work.
- Replace history row copies with artifact/attempt references.
- Make pins/query tabs adopt artifact identity.
- Route insight and dossier probes through shared execution.
- Begin `FactRef` -> evidence-bound `ClaimRef` migration through an adapter.
- Extend workspace restore/clear to ledger metadata and reset the MCP/core session in the same path.

#### P3 — MCP capability parity

- Register the existing analyst catalog in the capability registry without changing behavior.
- Add missing grouped capabilities in the matrix above, using existing product services.
- Add resources and task-relevant discovery/profiles so the in-tab model does not see every tool at
  once.
- Add approval previews and audit records for egress, destructive and browser-mediated actions.
- Close every parity-test gap or record the exact host-mediated boundary the model can request.

#### P4 — cleared-context orchestration

- Implement answer-contract, analyst-round, progress-gate and terminal-synthesis phases over the
  product ledger.
- Start with deterministic evidence only. Do not enable free qualitative observations as findings.
- Persist concise rationale/work notes separately and keep their untrusted class visible.
- Add evidence selection by requirement, table/column, verification, contribution, category and
  recency; no embeddings in the first pass.
- Add deterministic final claim checks and the optional challenger behind a measurable ablation.

#### P5 — frozen evaluation and product promotion decision

- Run one-round and cleared-context arms with the same total operation, token, output, wall-time and
  result-byte budgets.
- Use repeated exact, open and missing-capability tasks; include joins, text, time series, quality,
  unsupported profit/causal/demographic questions and stale-dataset cases.
- Report correctness, factual precision, requirement coverage, useful verified findings per 1,000
  total tokens, duplicate/failure rate, context high-water, wall time and user-visible provenance.
- Separately report retrieval failures, reasoning failures, computation failures and synthesis
  failures.
- Promote only if the cleared-context path earns a material benefit over both the equal-budget
  one-round arm and the deterministic fallback without weakening privacy or path identity.

### 10. Acceptance gates before deleting old paths

- The same UI and MCP request on the same dataset revision produces the same `artifact_id` and
  outcome contract.
- Every successful factual `OpResult`, including inline results, has a retrievable artifact receipt;
  every failed/cancelled call has an attempt receipt.
- No SQL, result preview, finding prose or model reasoning note is placed in `localStorage`.
- Clear workspace removes content-bearing ledger state as well as source staging and registry
  metadata; restore never leaves an MCP session pointing at a closed core.
- Query tabs restore editable SQL plus artifact receipt after reload, even when a result body was
  evicted.
- Source, derived-object, schema, semantic-definition and operation-version changes make dependent
  artifacts/claims visibly stale.
- Existing mutation guards, source non-drop rules, tab-envelope validation and privacy-mode tests
  remain intact.
- Large-query first paint and export scope do not regress when the console adopts shared evidence
  execution.
- Profiling, insights, dossier and relationship latency do not regress through accidental global
  serialization.
- Every capability-registry entry declares MCP reach, host requirements, privacy/egress effect and
  confirmation policy, and its parity/path-identity test passes.
- Destructive, credential, local-resource and network-egress actions cannot execute outside their
  reviewed host confirmation boundary.
- The deterministic dossier and old synthesis fallback stay available until the cleared-context path
  wins under an equal total budget.

Only after the relevant gate passes should copied query results, duplicated provenance fields,
transient chart identity or the old growing-conversation path be removed.

### 11. Design-review checklist

The design reviewer should reject or return this plan if any answer below is vague:

- Can a model-written statement ever enter `verified_findings` without an exact evidence locator?
- Can an old finding survive a dataset change without becoming visibly stale?
- Can a compacted result be distinguished from an empty result?
- Can a cold round see what remains unanswered and what already failed without transcript replay?
- Can it distinguish verified evidence, interpretation and planning notes at a glance?
- Can identical work be avoided without claiming semantic equivalence from a hash?
- Are total budgets equal across comparison arms?
- Does the final synthesizer see only bounded, relevant evidence and explicit caveats?
- Does every DataScope feature have an MCP binding or a tested human-mediated MCP request path?
- Do UI and MCP reach the same implementation for each capability?
- Do model-facing descriptions match the handlers' real output rather than the intended future
  output?
- Can an authorized external MCP client actually reach the live workspace under an explicit custody
  model?
- Are local file access, clipboard/download, network egress, sharing, deletion, workspace clearing,
  credentials and authority changes protected below the prompt?
- Can the full MCP surface grow without placing the full catalog in every small-model context?
- Is the deterministic, no-AI DataScope path still complete and honest?

Until those questions have reviewed answers, this packet remains **prebuild work only**.


**Plain English**

The short version: this document proposes giving DataScope’s AI a reliable memory without keeping an ever-growing chat conversation.

Instead of asking the model to remember everything, DataScope would save the actual analytical work—queries, results, failures, evidence, and unfinished questions—inside the local workspace. Each AI round could then start fresh, look up only what it needs, and continue from verified evidence.

But this is still a design proposal. Nothing described here is approved for implementation yet, and the document explicitly says not to build until several decisions are settled.

## The problem being addressed

The earlier experiment kept adding every AI turn and result to one conversation. That created three problems:

- The prompt became increasingly large.
- Running the analysis became expensive.
- The model did not necessarily become more accurate.

Experiment 13 produced one discouraging result, but this document correctly points out that one run is not enough to declare the approach a failure.

Experiment 15 asks a cleaner question:

> If the total budget stays the same, does an AI perform better when each round starts with a clean context but can retrieve previous evidence from the database?

The equal-budget part is important. If the cleared-context version gets twice as many tool calls or tokens, then a better result would not prove that clearing context helped.

## The basic idea

Imagine asking an analyst to investigate why sales fell.

In a normal long AI conversation:

1. The analyst checks monthly sales.
2. The analyst checks product categories.
3. The analyst investigates refunds.
4. All the questions, answers, query results, and discussion remain in one increasingly long transcript.
5. Eventually the transcript becomes noisy and expensive to process.

The proposed approach works differently:

1. A fresh AI round receives the question and a small description of what needs answering.
2. It runs real DataScope operations and SQL queries.
3. DataScope saves the operations and results.
4. The AI leaves a short, structured handoff: what it thinks the evidence means and what still needs checking.
5. The conversation is erased.
6. A new AI round starts fresh.
7. It reads the saved evidence, outstanding questions, and failed attempts.
8. It continues the investigation without receiving the old transcript.
9. A separate fresh AI round writes the final answer from the selected evidence.

The database becomes more like an analyst’s case file than a chat history.

## What “the database is the memory” really means

The original draft used that phrase quite strongly. The later review packet makes it more precise.

The database can remember:

- Which operations ran.
- The exact SQL.
- The actual results.
- Which tables and columns were used.
- Which attempts failed.
- Which work was duplicated.
- What evidence supported a statement.
- Which questions remain unanswered.
- Whether the dataset changed after a result was calculated.

It cannot automatically remember genuine reasoning.

For example, a query result might show:

```text
January revenue: 100,000
February revenue: 70,000
```

That is evidence.

“Revenue fell by 30%” is a claim derived from that evidence.

“The decline was caused by customer dissatisfaction” is an interpretation—and probably unsupported unless the analysis contains appropriate causal evidence.

The design therefore separates actual computed evidence from model-written conclusions. That separation is one of the most important parts of the proposal.

## Why the first `analysis.findings` idea was rejected

The first part of the document proposed one fairly simple table:

```text
round
category
table
column
kind
sql
summary
```

The later prebuild review concludes that this is too simple.

The main problem is that it mixes together things that have different levels of trust:

- What DataScope actually computed.
- What the AI believes the computation means.
- What the AI intends to investigate next.
- What already failed.
- What the final answer must cover.

It also contains a `summary` field. If the model writes that summary, the presence of valid SQL does not prove the summary is correct.

For example, the SQL may correctly calculate revenue, while the summary incorrectly calls it profit. The SQL is real, but the claim is still false.

The revised proposal replaces this single table with a “reasoning ledger.”

## The reasoning ledger

The ledger is a collection of related records stored locally in DuckDB.

### Evidence artifacts

An artifact is a receipt for something DataScope actually computed.

It would contain information such as:

- The operation that ran.
- The exact parameters.
- The exact SQL, where applicable.
- The dataset version.
- The shape and size of the result.
- A fingerprint of the result.
- Warnings.
- Whether the full result is still stored.
- Whether the result has become stale.

An artifact is the strongest factual object in the design. It is created by DataScope, not invented by the model.

### Claims

A claim is a statement about the evidence, such as:

- “Revenue fell by 30% in February.”
- “Table A probably joins to Table B through `customer_id`.”
- “The email column contains 18% null values.”

A claim must point to the exact evidence supporting it. Ideally it also identifies the precise result cells or rows involved.

Claims carry labels describing what they are:

- `computed`: directly present in a computation.
- `derived`: calculated from evidence.
- `interpretation`: a judgment about the evidence.

They also carry a verification state, such as draft, mechanically verified, reviewed, rejected, stale, or conflicted.

This prevents all confident-sounding prose from being treated equally.

### Requirements

Requirements describe what the final answer needs to establish.

If the user asks, “Which product lost the most revenue last quarter, and why?”, the requirements might be:

- Identify the relevant quarter.
- Calculate revenue by product.
- Determine the largest decline.
- State whether the data can actually establish why it happened.
- Include important data-quality limitations.

A requirement is not evidence. It is a checklist for the analysis.

### Work items

Work items describe what still needs investigating.

Examples:

- Check whether joining orders to order lines duplicates revenue.
- Determine which status values count as completed orders.
- Check whether the date field contains missing months.
- Compare refund rates for the affected product.

These are planning notes. They can guide a future round, but they cannot appear as facts in the final answer without evidence.

### Attempts

Every operation gets an attempt receipt, including operations that:

- Succeeded.
- Failed.
- Were cancelled.
- Repeated earlier work.
- Produced irrelevant orientation information.
- Contributed to the answer.

This allows a fresh round to see that a join already failed or that a nonexistent value was already searched for. It also exposes wasted work and makes costs measurable.

### Rounds

Each AI round gets a record of:

- Its budget.
- Actual token usage.
- Number of operations.
- New artifacts found.
- New verified claims.
- Requirements satisfied.
- Duplicate attempts.
- Failed attempts.
- Why the round stopped.

DataScope—not the model—decides whether meaningful progress happened.

A new paragraph of model prose does not count as progress. A new piece of useful evidence or a newly satisfied requirement does.

## How evidence is identified

The proposal uses hashes, which are stable fingerprints.

There would be separate fingerprints for:

- The dataset version.
- The requested operation.
- The observed result.
- The final evidence artifact.
- The analytical meaning or scope of a claim.

These fingerprints serve different purposes.

For example:

- A request fingerprint can detect an exact repeated query.
- A result fingerprint can detect that the same query now returns different data.
- An artifact fingerprint identifies the evidence from a particular dataset revision.
- A fact-key fingerprint can reveal two competing answers to the same question.

The document is careful not to treat hashes as intelligence. Two differently written SQL queries might calculate the same thing, but the first version will not try to recognize that semantic equivalence. It will only detect exact normalized duplicates.

Hashes also do not make information anonymous. A hash derived from sensitive data still has to be treated carefully.

## What happens when the data changes

Every dataset and table needs an explicit revision identity.

Suppose the AI concludes that February revenue was AED 70,000. Then the user refreshes the source file.

The old result must not silently remain “verified.” All dependent evidence and claims should become visibly stale.

The system can later recompute them, but it must preserve the distinction between:

- The original observation.
- The changed dataset.
- The recomputed result.

This is provenance: a trace showing exactly where a conclusion came from and which version of the data supported it.

## The proposed AI workflow

The full workflow would look like this:

1. Planning round  
   Break the question into a small answer contract and prioritized work.

2. Analysis round one  
   Inspect the data and run useful operations.

3. Save everything mechanically  
   DataScope records evidence, results, failures, and costs. The model may also submit structured claims and work notes.

4. Clear the context  
   The entire conversation is discarded.

5. Analysis round two  
   Start fresh with the original question, remaining requirements, evidence index, important open work, known failures, and remaining budget.

6. Fresh synthesis round  
   A separate model context writes the answer using selected verified evidence.

7. Deterministic checks  
   DataScope checks numbers, entities, filters, rankings, time windows, units, and evidence links where possible.

8. Optional challenger  
   A separate bounded review can look for unsupported claims or important caveats. It is a reviewer, not another unrestricted analyst.

The proposed initial maximum is two analysis rounds plus one synthesis round. That number has not been approved yet.

## Why synthesis is separate

If the final answer is written inside the last analysis round, the experiment cannot tell whether a bad answer came from:

- Poor investigation.
- Failure to retrieve earlier evidence.
- Insufficient time to write the answer.
- The model becoming distracted by its recent tool calls.

A fresh synthesis round isolates the writing stage. It receives only the question, answer requirements, and selected evidence.

It should not run new calculations. If required evidence is missing, it must state the limitation or send the requirement back for more analysis.

## Verification has several levels

The document avoids one vague “verified” label.

It proposes four layers:

1. Integrity  
   Do the dataset version, hashes, result size, schema, and stored result agree?

2. Link validity  
   Does the cited evidence exist, and does it belong to the active dataset?

3. Mechanical claim checking  
   Are the quoted values really present? Is the percentage correct? Do the filter, unit, denominator, ranking, and time window match?

4. Semantic review  
   Does the wording overstate what the calculation establishes?

A model reviewer can help with level four, but its approval is not deterministic proof.

Words such as “all,” “none,” “only,” and “largest” require evidence that truly covers the whole relevant population. Causal language requires more than correlation.

## How a new round finds previous work

The whole ledger should not be dumped into every new prompt. That would recreate the growing-context problem.

Instead, the round starts with a bounded packet containing:

- The original question.
- The answer requirements.
- Which requirements are satisfied.
- Relevant schema and relationship information.
- Counts and summaries of available findings.
- Highest-priority open work.
- Compact records of duplicate and failed attempts.
- Remaining total budget.

The model can then request details as needed.

The proposal includes two retrieval options:

- Query the curated ledger views using SQL.
- Use a typed `query_analysis_memory` operation.

The typed operation is intended to help smaller models that may struggle to remember the ledger’s internal SQL structure. Ordinary SQL remains available as the flexible escape hatch.

## Relationship with existing DataScope features

This is not supposed to become a second AI-only analytics engine.

The stronger architectural proposal is:

> Every calculation creates the same kind of evidence artifact, whether it was initiated by the user interface, the AI, or an external MCP client.

That means:

- A query run in the SQL console should create an artifact.
- A profile calculation should create an artifact.
- A dossier fact should reference an artifact.
- A chart should reference its source artifact.
- A pinned result should reference an artifact.
- An exported report should reference the claims and artifacts it contains.
- An AI answer should cite the same artifacts the normal interface uses.

Currently, several DataScope paths execute or store results differently. The proposal would gradually converge them on a shared evidence-producing layer.

This is a major internal refactor, not just an AI experiment.

## What would change in the existing application

The plan proposes eventually changing several areas:

- Query history would stop copying entire row arrays and instead store artifact references.
- Query tabs would keep editable SQL plus an artifact reference.
- Pins would point to artifacts.
- Dossier and insight calculations would use the shared evidence execution path.
- Charts would become validated artifacts connected to their source results.
- Exports would explicitly say whether they export a preview, a full materialization, or a source table.
- Workspace persistence would save evidence receipts, claims, attempts, and open work.
- Large result bodies could still be evicted, while their receipts and recomputation instructions survive.
- Clearing a workspace would also clear the content-bearing ledger and reset the AI/MCP session.

The existing result store would remain responsible for holding and paging result bodies. The ledger would hold durable identity and provenance; it would not become an unlimited duplicate result store.

## What MCP parity means

MCP is the interface that lets models or other clients use DataScope capabilities.

The proposal says every meaningful DataScope capability should be reachable through MCP. That does not mean giving the model control of the screen or raw application state.

It means that if DataScope lets a person:

- Inspect a schema.
- Run a query.
- Build a pivot.
- Create a chart.
- View quality findings.
- Inspect relationships.
- Open a result.
- Prepare an export.
- Create a share.
- Restore a workspace.

Then an MCP client should be able to inspect, invoke, or request that same product capability through the same underlying service.

Different capabilities require different authority:

- Read: inspect information.
- Compute: produce evidence.
- Write: create a recoverable workspace object.
- UI action: ask the browser to open or focus something.
- External effect: upload, share, or download.
- Destructive: delete or clear something.
- Secret/admin: report status only; never expose credentials.

Sensitive actions would still require browser-controlled confirmation. MCP reach does not mean unrestricted automation.

## Why external MCP access is unresolved

DataScope’s current analyst MCP runs inside the browser tab. It is sufficient for DataScope’s own AI.

An external desktop agent cannot currently reach the live DuckDB workspace inside that tab.

A separate decision is needed between approaches such as:

- A relay connected to the browser tab.
- A local companion process.
- A deliberately uploaded or staged server workspace.

Each option changes the privacy and custody model. Merely adding more MCP operations inside the browser does not solve external access.

The existing edge MCP only reads explicitly shared artifacts. It is not a connection to the live browser workspace.

## Avoiding an enormous tool prompt

MCP parity could result in dozens of tools. Sending all of them to a small model on every turn would be costly and confusing.

The proposal introduces a capability registry containing:

- Stable capability name.
- Description.
- Input and output shapes.
- Privacy effect.
- Required approval.
- Owning product service.
- MCP binding.
- UI binding.

An external client could discover the entire registry, while the in-tab model receives only the tools relevant to its current task. It could load another area when needed.

Large read-only information—schema, evidence, history, dossier—would preferably be exposed as resources. Actual computations and effects would remain typed operations.

## Privacy posture

The complete ledger remains local by default.

The design requires:

- Sensitive-column rules before data enters a cloud prompt.
- Dataset text to be treated as untrusted data, never as instructions.
- Bounded evidence samples.
- Redacted prompt copies where SQL contains sensitive literals.
- No SQL, findings, hashes, parameters, or row values in telemetry.
- Workspace-, dataset-, and run-level deletion.
- Model read-only access to curated ledger views.
- Host-only authority to create factual evidence and verification records.
- No content-bearing ledger records in `localStorage`; use workspace-controlled storage such as OPFS.

The model may propose claims and notes, but it cannot manufacture the underlying evidence records.

## What the build packages mean

No implementation should begin with the AI loop itself.

The proposed order is:

### P-1: Make the unresolved decisions

This is the real current stage.

A reviewer must settle:

- The exact experiment hypothesis.
- Equal total budgets.
- Trust and verification labels.
- Identity and hashing rules.
- Number of rounds.
- Whether the challenger is included.
- Confirmation rules.
- External MCP reach.
- Tool-discovery design.

### P0: Write contracts and failing tests

Define the data structures and expected behavior before orchestration exists.

This includes tests for:

- Duplicate detection.
- Dataset changes.
- Stale evidence.
- Claim-to-evidence links.
- Trust separation.
- MCP parity.
- Truthfulness of tool descriptions.
- Schema migration.

### P1: Build the evidence ledger

Add artifact identity, attempt receipts, normalized ledger tables, bounded views, paging and recomputation links, and staleness propagation.

### P2: Converge existing product paths

Move query history, tabs, pins, insights, dossier calculations, and workspace persistence toward shared artifacts.

### P3: Establish MCP capability parity

Create the capability registry, add missing bindings, expose resources, and enforce confirmation around sensitive effects.

### P4: Build the cleared-context AI loop

Only at this point implement planning, bounded analysis rounds, context clearing, progress checks, synthesis, and optional review.

### P5: Run the experiment

Compare:

- A normal one-round analysis.
- A cleared-context analysis.
- The deterministic DataScope fallback.

All arms must receive the same total token, operation, time, output, and result-size budgets.

Promotion happens only if the cleared-context version produces a meaningful improvement without weakening privacy or creating separate product paths.

## What must remain working during migration

The old behavior must not be removed early.

Among other things:

- The deterministic dossier remains available.
- The current synthesis fallback remains available.
- Large query previews must continue working.
- Profiling must not become slow because all work was accidentally serialized.
- Query tabs must survive reloads.
- Missing result bodies must not look like empty results.
- Mutation and privacy protections must remain intact.
- Clearing a workspace must clear the ledger as well.
- UI and MCP calls must produce the same artifact when they perform the same computation.

Old paths are deleted only after their replacements pass the relevant acceptance gates.

## The most important unresolved issue

The document started as a relatively focused experiment:

> Can cleared AI contexts outperform a growing conversation?

The appended packet expands it into three connected projects:

1. A product-wide evidence and provenance system.
2. MCP access to essentially every DataScope capability.
3. A cleared-context AI workflow built on top.

That expansion is logically coherent: the AI memory system is much stronger if it uses the same evidence system as the rest of DataScope.

But it is also a major increase in scope. This is closer to a foundational DataScope architecture programme than a small experiment. The reviewer needs to decide whether the full evidence/MCP consolidation must happen before the experiment, or whether a smaller faithful experimental slice can test the equal-budget hypothesis first.

The packet itself leans toward building the foundation first, but it has not yet been approved.

## Plain-English status

Right now:

- No cleared-context loop has been built.
- No benchmark for it has been run.
- The proposed ledger does not exist.
- The original six-column findings table has effectively been superseded by the proposed ledger, but that change is not formally approved.
- The exact round and total budgets remain undecided.
- External access to the live browser workspace remains undecided.
- The capability registry and MCP parity system do not exist.
- Several current MCP tool descriptions need to be brought into line with what their handlers actually return.
- The document is asking for a design review, not authorizing implementation.

So “prebuild” here means: settle the architecture and experiment rules, freeze the contracts, and decide whether the large product-wide consolidation is justified before touching the implementation.

The controlling sections are the [prebuild packet](</Users/justin/github/DataScope/_implementation/_misc/_ideation/_experiments/15-cleared-context-loop.md:207>), [reviewer decisions](</Users/justin/github/DataScope/_implementation/_misc/_ideation/_experiments/15-cleared-context-loop.md:1071>), and [design-review checklist](</Users/justin/github/DataScope/_implementation/_misc/_ideation/_experiments/15-cleared-context-loop.md:1174>).