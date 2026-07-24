# 03 — Profiling

**Tier:** v0 · **Phase:** 1 (§19) · **Depends on:** [`../02-ingestion/`](../02-ingestion/)
(registered tables to profile).

The brain of the application (§8): every registered table runs through
SUMMARIZE → semantic classification → capability evaluation, and the results drive both the
UI (which modules light up) and, in v0.5, the AI layer's schema-pruned prompts.

| Doc | Covers |
| :--- | :--- |
| [01-summary-statistics.md](01-summary-statistics.md) | §8 step 1 — SUMMARIZE extraction |
| [02-column-classifier.md](02-column-classifier.md) | §8 step 2 — semantic types + manual override |
| [03-capability-engine.md](03-capability-engine.md) | §9 — broker, adaptive module gating |
| [04-profile-ui.md](04-profile-ui.md) | §10 M1 — column cards; insight feed (D10, lands Phase 3) |
| [05-dataset-dossier.md](05-dataset-dossier.md) | §13.1 M1+ — post-ingest folder overview; info-design spec (D48, Phase 3) |

**Profile output feeds two same-round consumers (D45/D48).**
- **Fact provenance (D45):** the D24 evidence+confidence pattern generalizes to *all*
  structural/quality facts this substrate emits — each fact is labeled *"computed as of
  {snapshot date + file hash}"* with a provenance tag (`derived-this-run` / `user-asserted` /
  `carried-unverified`), and "verified"/permanence wording is banned. The labeling contract
  lives in the DSPS spec ([`../08-persistence/03-dsps-spec.md`](../08-persistence/03-dsps-spec.md));
  v0 emits facts exactly as they are today, the unified fact object being v0.5 spec work.
- **Dataset Dossier (D48, §13.1):** the post-ingest folder-level overview is packaged from this
  profile output (tables × rows, quality flags, time coverage, top insights) plus the Join
  Graph thumbnail — no new engine, ~3–5 days of UI assembly — and the per-table profile view
  here is its **degrade target** (never the launch date, D27). Full info-design spec (layout,
  the D24 above-the-fold hedge, opinionated-not-over-claiming next steps, positives-only PII
  copy, graduated cut line) in [05-dataset-dossier.md](05-dataset-dossier.md).

**Workbench fold (2026-07-24, D71 — master §13.3):** in the flag-on shell the Dossier re-homes
as the map's Blueprint face (+ persistent Verdict band) and the broker's `RankedAction[]` gains
the options strip as a subject-scoped second consumer — see
[03-capability-engine.md](03-capability-engine.md), [05-dataset-dossier.md](05-dataset-dossier.md),
and [`../12-workbench/`](../12-workbench/).

**Exit criteria (= the Phase-1 deliverable):** drop a folder of CSVs → every table
registered and statistically profiled → correct modules lit up, with reason tooltips on
everything disabled.
