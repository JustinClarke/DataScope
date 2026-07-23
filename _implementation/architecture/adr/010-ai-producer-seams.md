# ADR-010: AI producer seams (the view-layer drop-in contract)

**Status:** Accepted — 2026-07-20 (D68e "AI seam freeze"). This ADR freezes the *shapes*
of the two view-layer producer seams so Phase 6 (`build/06-ai`) is a drop-in; it decides no
AI implementation, model, routing, or cost. Those stay in **ADR-007** (routing / provider /
BYOK-vs-vault / model choice + neurons-per-turn), which is still Pending. The two ADRs
**compose and do not overlap:** ADR-007 owns *how a turn reaches a model*; ADR-010 owns
*where the model's output is allowed to plug into the composition layer and what it must
preserve*. No AI code exists in v0 (D2/D28); the frozen interfaces live at
[`app/src/types/producers.ts`](../../../app/src/types/producers.ts).

**Referenced by:** `build/06-ai/README.md` (Phase 6 implements the two producers against these
shapes); master §6, §9, §12.2, §13.1 (the seams these freeze).

## Context

The D68 composition layer (§6) routes the view through four typed, rows-free slices —
`FactRef`, `RankedAction`, `DatasetVerdict`, `ThreadConfig`. Two of them are *producer
outputs* where an optional v0.5+ AI producer (D56) may substitute for the deterministic one
D68f already charters exactly two such seams — no more:

1. **Action ranking (§9, D68a).** Deterministic producer: `rankNextActions(tables,
   insights) → RankedAction[]` (`lib/capabilities.ts`) — joins broker legality with the D10
   interestingness score, floor-gated, evidence attached. The AI producer "may *re-rank or
   re-phrase* within the broker grammar, emitting the same `RankedAction[]`."
2. **Findings narration (§12.2/§13.1, D65).** Deterministic producer: template-filled
   plain-language `FactRef.statement`s over the D10/D45 facts (the honesty-guarded insight
   descriptions today; fuller templates at v0.5). No LLM in the loop. The optional AI layer
   "polishes" the same facts under D56-style gating.

The freeze must make Phase 6 a genuine drop-in: adding an AI producer touches **one file per
seam**, never the UI, never the four D68 contracts, and never the deterministic floor. It
must also make the honesty invariants (D45, D55, D2/D28) *structural* rather than a runtime
check a future producer could quietly skip.

## Decision

**1 — Deterministic-first, always.** Each seam computes and paints its deterministic output
synchronously, first. That output is the complete product with AI off (D2/D28) and the
fallback on every degrade. Non-negotiable; it is both the floor and the safety net.

**2 — AI is a *replace-in-place* producer over the deterministic baseline, never a
from-scratch one.** Each AI producer's input is the deterministic slice the app already
computed (`RankedAction[]` / a `FactRef`) plus its cache fingerprint — **never** the raw
registry or DSPS. This is the load-bearing choice: it makes "bound to the broker grammar"
*unrepresentable to violate* rather than a rule to police. The model reorders or re-phrases
what the deterministic producer already legitimated; it cannot originate a claim or a route.

**3 — Seam 1 (action ranking) invariant.** The AI re-ranker may **reorder the list and
re-phrase each `verb` string** — nothing else. It may not add or drop an action, nor alter
any action's `module`, `tab`, `prefill`, `evidence`, or `score`. The seam validator enforces
set-identity (the multiset of actions keyed by `module` + `prefill` + `evidence` is
unchanged); any violation degrades to the deterministic baseline.

**4 — Seam 2 (narration) invariant.** The AI narrator may **re-phrase the `statement` prose
only**. Every other `FactRef` field — `sql`, `snapshot`, `confidence`, `provenance` — must
be byte-identical to the baseline, the numeric claim preserved, and the D45 phrasing guard
upheld (no permanence / causal / "verified" / invariant wording). The narrator receives
`sql` as **read-only provenance** and never emits or runs SQL. Any violation degrades to the
baseline.

**5 — Async after paint.** The AI call fires *after* the deterministic paint and never
blocks it. If and when it returns *and passes its validator*, it replaces in place. A slow,
down, or absent edge is invisible to the user beyond the deterministic answer already shown.

**6 — Cached per D45 fingerprint (§11.2).** A stable fingerprint over the deterministic
baseline's *fact identities* (per action: `module` + `prefill` columns + `evidence.sql` +
`evidence.snapshot`; per narration: the `FactRef`'s `sql` + `snapshot` + `statement`) **plus
the active model id** keys the cache. Same data + same model ⇒ same fingerprint ⇒ the cached
AI output is reused with no second call, surviving a re-profile of unchanged data (identical
snapshots hash identically); a model swap invalidates. The concrete hash and cache store
(KV vs. in-memory) are a Phase-6 detail, not frozen here.

**7 — Four honest degrade states, never a silent wrong answer.** When the deterministic
output is what shows, one `ProducerDegradeReason` is recorded: `ai-off` (no-cloud mode or AI
disabled, §5.1), `ai-down` (edge error / timeout / exhausted Workers-AI budget, §11.2),
`ai-uncached` (first paint, request in flight), `ai-rejected` (returned but failed the seam
validator). Reported as **content-free** telemetry only (D41/§23.5) — counts and latency,
never fact prose or dataset content.

**8 — Never executes model output (D55).** The AI reorders data and re-phrases prose; the
renderer still consumes only the fixed contracts and runs no model output. The validator, not
the producer, is the trust boundary — a producer does **not** self-certify.

## Alternatives considered

- **AI producer from raw inputs (`(tables, insights) → RankedAction[]`).** Rejected: it
  demotes broker-grammar binding from a structural guarantee to a runtime check and lets the
  model invent illegal destinations (a map for a geo-less dataset). Baseline-in makes the
  illegal case unrepresentable (Decision 2).
- **Narrator returns a bare re-phrased string.** Rejected: it discards the ability to verify
  the non-prose `FactRef` fields are untouched. Returning the whole `FactRef` makes the D45
  honesty guard checkable byte-for-byte (Decision 4).
- **Block on the AI before first paint (or a spinner where the Verdict goes).** Rejected:
  violates D2/D28 (complete with AI off) and the async-after-paint rule; a slow or down edge
  would stall the tier-1 Verdict — the one screen that must always paint (D68c).
- **Producer self-validates.** Rejected: a buggy or adversarial producer must not vouch for
  its own output. The seam owns the validator; the orchestrator applies it (Decision 8).

## Consequences

- Phase 6 adds, per seam, one producer implementation + the shared fingerprint/cache +
  the seam validator — and **zero** UI or contract changes. The deterministic producers
  (`rankNextActions`, the template narrator) are untouched.
- The validators are the honesty boundary and are the one part of the seam that **must** be
  unit-tested against the D45 guard before any AI producer ships.
- The fingerprint couples cache invalidation to the model id, so ADR-007's model choice feeds
  this cache key — the only coupling between the two ADRs.
- **Open (Phase-6 details, deliberately not frozen):** the concrete hash function, the cache
  store, and the orchestrator's resolve-function signature that wraps a producer attempt into
  a `ProducerResult`. Frozen here is only the seam shape and its invariants.

## Spike evidence

None required. This is a pure interface-shape decision derived from settled decisions (D68f /
D45 / D55 / D56 / D65), not an empirical or technical-risk one — so it is not D18
spike-gated, unlike ADR-007's model/routing/cost, which awaits Phase-4 measurement.
