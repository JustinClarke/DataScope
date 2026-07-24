# DataScope — `_implementation/`

Implementation documentation for **DataScope Studio**, split from the master spec
[`../DATASCOPE.md`](../DATASCOPE.md). The master doc remains the living source of truth;
every file here cites the sections it was derived from as `§n` (and `A.n` for Appendix A).
Read a leaf doc to build a feature; open the cited `§` only when you need the full narrative.

## Layout

| Folder | Concern |
| :--- | :--- |
| [`meta/`](meta/) | **Navigation** — [technical walkthrough](meta/technical-overview.md), the [agent question index](meta/question-index.md), and the [file→purpose doc index](meta/doc-index.md); sits above the other four, not tied to one concern |
| [`product/`](product/) | **Why** — identity, target users, positioning, competitive landscape, strategy, roadmap, [rejected ideas](product/rejected-ideas.md) |
| [`architecture/`](architecture/) | **How it holds together** — system design, data flow, decision record (D1–D69) |
| [`foundations/`](foundations/) | **Cross-cutting constraints every phase answers to** — privacy, security, performance, testing, samples, infrastructure |
| [`build/`](build/) | **How it's built**, phase by phase, numbered in build order |
| [`backlog/`](backlog/) | Designed-but-deferred work (§20 remainder; incl. [deferred architecture](backlog/deferred-architecture.md)) |
| [`maintenance/`](maintenance/) | **Keeping the docs consistent** — the [consistency runbook + mirror map](maintenance/README.md) and `sweep.sh` (run before landing a doc change) |
| [`status/`](status/) | **Where the build stands** — [`BUILD-ORDER.md`](status/BUILD-ORDER.md) (model-assigned checklist + session log; the only place build status lives), its archived [`BUILD-ORDER-HISTORY.md`](status/BUILD-ORDER-HISTORY.md), and [`DEFERRED-OBSERVATIONS.md`](status/DEFERRED-OBSERVATIONS.md) (time-based checks awaiting real-world passage of time) |

The `_misc/` folder sits **outside** the master-derived canonical tree — exploratory concepts
(`_misc/ideation/`) and code spikes (`_misc/spike-*/`) that don't cite `§n` and aren't governed
by the mirror rule.

## Release tiers (D15 — canonical)

| Tier | Phases (§19) | Contents | Ship condition |
| :--- | :--- | :--- | :--- |
| **v0** | 1–3 (`build/01`–`05`) | Local, deterministic: ingest (multi-table + ZIP), profile, SQL, charts, insight feed, **Join Graph (beta) (D24)**, **analyst-completion surface — pivot / cross-tab, guided answers, take-it-with-me export (D53)**, structure report + DSPS + "Copy for AI" (D31), consumer templates (D30, unmarketed). No server, no AI, no persistence. | **First public ship — Tuesday, October 6, 2026 (D27; date fixed, scope flexes).** Pulls forward the locally-relevant Phase-6 polish (error boundaries, empty states, bundled samples, guided tour); launch craft per §24. |
| **v0.25** | §19 v0.25 block (`build/v0.25`) | Blueprint-forward opening (D48/D68/D69, no new engine), edge-warm synthesis → WebLLM handoff (D43 gate cleared — GO, ADR-007), BYOK — a post-launch curation of v0.5 AI work (D70). | **Post-launch tier, after Oct 6; never touches the v0 cutline or the D27 date.** |
| **v0.5** | 4–6 (`build/06`–`09`) | AI chat (NL→SQL), API ingestion, R2 save/share, edge services. | Gated on v0 acceptance criteria (§18). |
| **v1** | 7–9 (`build/10`) | The Studio arc: quality report, relationship inference + schema graph, semantic/dbt export. | Gated on foundation profiling proven in the wild. |
| backlog | — (`build/11`, `backlog/`) | ML modules and the §20 remainder. | On demand signal. |

Terminology note: text predating D15 that said "v1" in the D1 sense meant the foundation
scope (now v0 + v0.5). "v1" alone now means the Studio release.

Looking for the answer to a specific question rather than reading the whole tree? Start at
[`meta/question-index.md`](meta/question-index.md) instead of the reading order below.

## Reading order for an implementing agent

1. [`architecture/decisions.md`](architecture/decisions.md) — the 56 decisions that bound everything else.
2. [`architecture/system-design.md`](architecture/system-design.md) — component diagram, tech stack, planned `src/` layout.
3. [`foundations/`](foundations/) — all six docs; these are constraints, not suggestions.
4. [`build/`](build/) in numeric order. Each section `README.md` states its tier, the §19 phase it maps to, and its dependency on the section beneath it.

## Conventions

- Every section `README.md` opens with its `Tier:` tag, the phase it maps to (§19), and its
  dependency on the section beneath it.
- Each leaf doc mirrors §21's issue shape: **objective → spec → files to create/modify →
  dependencies → acceptance criteria → test plan → definition of done.**
- File paths in leaf docs follow the planned structure in
  [`architecture/system-design.md`](architecture/system-design.md) (§16) — frozen up front.
- **Spike-first (D18):** only the TypeScript interfaces and state tree are defined before
  code. The Phase-1 ingestion spike and the D17 relationship-inference spike run first;
  ADRs, epics, and sequence diagrams are written *after* the spikes, from evidence.
  Appendix A's library survey is a July-2026 snapshot — re-verify before building.
- `build/10-studio/` is deliberately three sub-folders, not one file — three phase-sized
  efforts, each gated on the layer below being trustworthy first. Do not build it as one drop.
- Process rule (A.5): build and verify one pipeline stage at a time. Never one enormous
  "build DataScope" prompt; per-issue prompts stay small and deterministic (§21.10).
