# Backlog: Share-Tier Extensions — Aggregate Stats & Synthetic Replica

**Tier:** backlog — designed, deferred (D21) · **Master spec:** §20.11, §12.3 (shipped
tiers), §0 D20–D21.

Extensions of the D20 "share the shape, not the data" model. The shipped tiers —
v0 client-side structure-report export (§12.2) and v0.5 hosted structure-only share
(§12.3) — capture most of the sharing value at near-zero risk; these two add real
disclosure-control engineering and are deliberately kept off the foundation critical path.

**Revive trigger:** user requests to share *distributions* (Tier 2) or *runnable data*
(Tier 3) that the structure-only artifact can't satisfy.

## Tier 2 — aggregate-stats share

Structure-only artifact **plus** bucketed distributions: histograms, top-N categories,
quantiles. Safe only with textbook statistical disclosure control, all deterministic and
client-side:

- **Small-bucket suppression** — buckets/categories under a disclosed count threshold are
  dropped or merged into "other" (extends §12.3's rare-category suppression).
- **Extreme-value clamping** — never report raw min/max (the max salary *is* a real row's
  value); report clamped percentiles (e.g. p1/p99) instead.
- Grounding: k-anonymity and quasi-identifier analysis are well-studied — see the
  [practical re-identification risk methodology (Nature, 2025)](https://www.nature.com/articles/s41598-025-04907-3).

## Tier 3 — synthetic-replica share

Generate a fake dataset matching the real one's **schema, per-column distributions,
cross-column correlations, and FK integrity** — client-side in DuckDB-Wasm — so the shared
artifact is *runnable* (recipient executes SQL/charts against it) with zero real rows.

- **Opportunity:** as of mid-2026, browser-native synthetic tabular generation is an
  essentially unclaimed intersection — a headline post-Studio feature and the strongest
  hard-engineering showcase in the plan. *Re-tagged (§19 backlog note, §24): this is the
  **venture headline demo** for design-partner conversations when it arrives — the
  runnable-fake-data share a partner remembers; its de-risking spike may pull earlier if
  those conversations warrant.*
- **Hazard:** 2026 research demonstrates
  [membership-inference attacks on synthetic tabular data](https://arxiv.org/pdf/2601.22434).
  The replica is a *structural stand-in*, never anonymization (D21 language rule applies
  in full).
- **Sequencing dependency:** needs trustworthy profiling (Phases 1–3) and relationship
  inference (Phase 8) to know *what* to preserve — hence post-Studio.
- **Monetization note:** if shipped, this is the natural paid line for privacy-constrained
  users (§20.10, [`monetization.md`](monetization.md)).

## Invariants (both tiers)

- **D21 language rule:** never "anonymized," "de-identified," or "GDPR/HIPAA-safe." Claims
  are constructive ("no data rows included") or relative ("reduces re-identification
  risk"), never absolute.
- Everything generates client-side; the hosted-share mechanics (TTL, delete, caps, abuse
  controls) are unchanged from §12.3.
- The privacy model ([`../foundations/privacy-model.md`](../foundations/privacy-model.md))
  is unaffected: both tiers are explicit, labeled, opt-in share actions.
