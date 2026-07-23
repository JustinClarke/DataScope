# Deferred architecture

**Tier:** backlog — noted-not-adopted at the D58 coherence round · **Master spec:** §6, §9, D58

Items surfaced by the D58 system-design reviews that were **recorded but deliberately not
built** — deferred, not rejected (nothing here contradicts a decision; each is a plausible
later refinement). Recorded so they are not re-proposed from scratch and so the D58 row can
stay terse.

## 1. Quality-gated capabilities broker

**Idea.** Let the broker (§9) consult profile statistics, not just column *types*, when
deciding which modules to enable — e.g. suppress Time-Series on a temporal column that is
98% null, or hide Correlation when a numeric column is constant.

**Why deferred.** The v0 broker is deliberately **type-count-only**: `evaluateCapabilities`
takes `ClassifiedColumn[]` and branches on `semanticType` counts alone
([`../build/03-profiling/03-capability-engine.md`](../build/03-profiling/03-capability-engine.md)).
That keeps it a pure, exhaustively-testable function and keeps the `SUMMARIZE → classify →
broker` flow a clean linear chain (the profile feeds classification; the broker reads
classification). Adding a profile→broker edge is a real feature (quality-aware gating), not a
diagram correction — so the linear data-flow is **accurate as drawn** and is not a DAG.

**Revive trigger.** Evidence that type-only gating offers modules that then produce
degenerate output on messy real-world data often enough to annoy users (watch the §18
iteration-loop pain list). If revived, thread the relevant profile aggregates into
`DataCapabilities` and add per-module *why-disabled* copy ("this column is 98% null").

## 2. Post-~40k-LOC structural refactors

Raised by the reviewers as "not today" — expected around 40–50k LOC, recorded so they are
deliberate later moves rather than drift:

- **Split `lib/`** into `core/` (domain logic — classifier, capabilities, relationship
  inference, quality score) and `contracts/` (schema/versioning modules — `viewspec.ts`,
  `dsps.ts`). Today `lib/` mixes both; the split is cheap discipline once the folder is large.
- **Move the deterministic domain hooks behind plain services.** `useSchemaClassifier` and
  `useCapabilities` are thin React adapters over pure `lib/` functions (D58); if `lib/`
  splits, the pure logic stays put and the hooks wrap it only where UI state is needed.
- **Rename `lib/`** to something more intentional ("lib" tends to become "miscellaneous").
  Lowest priority; only worth it alongside the split above.

**Revive trigger.** The codebase actually approaching that size, on a deliberate refactor
pass — never a mid-feature detour (D18 spike-first discipline; keep refactors out of the
D27 launch path).
