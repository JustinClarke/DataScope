# Doc index — file → purpose map for the DataScope docs tree

A flat, cheap-to-scan map of every Markdown file in the design workspace (`DATASCOPE.md` + `CLAUDE.md` + `_implementation/**`), so a file can be found by purpose without grepping the tree. Complements [`question-index.md`](question-index.md) (question → source §) and [`technical-overview.md`](technical-overview.md) (narrative walkthrough); this one is the plain file directory.

The sibling code repos (`app/`, `spike-ingestion/`) are out of scope by design — they never reference this tree (the `BUILD-ORDER.md` writing rules).

**Regenerate** by re-running the extraction from the D70 session's scratchpad, or by hand when files are added or removed. Purposes come from each file's title + lead line, lightly edited.

**97 files.** Non-build docs first, then the `build/` phase tree (51 files).

## Root — master spec + workspace rules

| File | Purpose |
| :--- | :--- |
| [CLAUDE.md](../../CLAUDE.md) | Workspace rules: Part I behavioral guidelines, Part II the DataScope tiered-agent workflow + efficiency rules. |
| [DATASCOPE.md](../../DATASCOPE.md) | The living master spec — Decision Record (D1–D73), architecture, phases, every §-numbered section. Everything else derives from this. |

## `_implementation/` — tree root + `status/` (README, build checklist)

| File | Purpose |
| :--- | :--- |
| [README.md](../README.md) | Entry point to the split tree — how `_implementation/` is organised and how leaf docs cite the master. |
| [status/BUILD-ORDER.md](../status/BUILD-ORDER.md) | The build checklist — the only place build status, phase language, and process history live. One ▶ marks the next item; the log records w… |
| [status/BUILD-ORDER-HISTORY.md](../status/BUILD-ORDER-HISTORY.md) | Archived historical execution log, split off from `BUILD-ORDER.md`. |
| [status/DEFERRED-OBSERVATIONS.md](../status/DEFERRED-OBSERVATIONS.md) | Live table of non-blocking checks that close on real-world passage of time (e.g. R2 lifecycle TTL expiry), not on engineering work. |

## `product/` — *why*: vision, strategy, roadmap, landscape

| File | Purpose |
| :--- | :--- |
| [analyst-discovery-note.md](../product/analyst-discovery-note.md) | **Scope:** product positioning / audience validation note |
| [competitive-landscape.md](../product/competitive-landscape.md) | Master spec: §3.4 (competitive map), §3.3 (differentiation), §24.3 (competitor-response |
| [rejected-ideas.md](../product/rejected-ideas.md) | Master spec: §3 (positioning), §4 (non-goals), Decision Record (D12/D22/D23/D32/D37/D44–D59). |
| [roadmap.md](../product/roadmap.md) | Master spec: §19 (phases), §0 D15 (release cutline), §18 (gates + steering bars), §24 |
| [strategy.md](../product/strategy.md) | Master spec: §3.5 (strategy), §3.4 (competitive map), §24 (launch strategy & evidence |
| [vision.md](../product/vision.md) | Master spec: §1 (executive summary), §2 (target users), §3 (positioning), §4 (constraints). |

## `architecture/` — *how it holds together*

| File | Purpose |
| :--- | :--- |

| [data-flow.md](../architecture/data-flow.md) | Master spec: §7 (ingestion), §8 (classification), §9 (broker), §11.1 (AI pipeline), |
| [decisions.md](../architecture/decisions.md) | Master spec: §0. These decisions bound every phase doc in this tree — check here before |
| [system-design.md](../architecture/system-design.md) | Master spec: §6 (architecture + stack), §16 (planned file structure). |

## `architecture/adr/` — Architecture Decision Records

| File | Purpose |
| :--- | :--- |
| [001-duckdb-wasm-worker-setup.md](../architecture/adr/001-duckdb-wasm-worker-setup.md) | **Status:** Accepted — 2026-07-19. Decided from Phase-1 ingestion-spike evidence, per D18 (spike-first process). |
| [002-state-library.md](../architecture/adr/002-state-library.md) | **Status:** Accepted — 2026-07-19. Decided from the Phase-1 ingestion-spike's worker-communication shape (ADR-001) plus the frozen §21.7 |
| [003-react-query.md](../architecture/adr/003-react-query.md) | **Status:** Accepted (not adopted for v0) — 2026-07-19. Decided from the Phase-1 ingestion-spike's worker-communication shape (ADR-001), a |
| [004-monaco-integration.md](../architecture/adr/004-monaco-integration.md) | **Status:** Accepted — 2026-07-19. Decided from this phase's own Monaco integration build, per D18 (spike-first process). |
| [005-recharts-d3-split.md](../architecture/adr/005-recharts-d3-split.md) | **Status:** Pending — not yet decided. Written from Phase-3 charting-module evidence, per D18 (spike-first process). This stub exists to r |
| [006-edge-stack.md](../architecture/adr/006-edge-stack.md) | **Status:** Pending — not yet decided. Written when v0.5 edge work starts, per D18 (spike-first process). This stub exists to reserve the |
| [007-ai-routing.md](../architecture/adr/007-ai-routing.md) | **Status:** Pending — not yet decided. Written during Phase-4 (v0.5) AI-router work, per D18 (spike-first process). This stub exists to re |
| [008-sql-lint-parser.md](../architecture/adr/008-sql-lint-parser.md) | **Status:** Pending — not yet decided. Written during Phase-4 (v0.5) SQL-lint work, per D18 (spike-first process); re-verify A.3's library |
| [009-terraform-state-backend.md](../architecture/adr/009-terraform-state-backend.md) | **Status:** Pending — not yet decided. Written when v0.5 infrastructure work starts, per D18 (spike-first process) and D19. This stub exis |
| [010-ai-producer-seams.md](../architecture/adr/010-ai-producer-seams.md) | **Status:** Accepted — 2026-07-20 (D68e "AI seam freeze"). This ADR freezes the *shapes* |

## `foundations/` — cross-cutting constraints every phase answers to

| File | Purpose |
| :--- | :--- |
| [infrastructure.md](../foundations/infrastructure.md) | Tier: cross-cutting — sequenced per release tier (table below). |
| [performance-budgets.md](../foundations/performance-budgets.md) | Tier: cross-cutting — every phase answers to this. |
| [privacy-model.md](../foundations/privacy-model.md) | Tier: cross-cutting — every phase answers to this. |
| [sample-datasets.md](../foundations/sample-datasets.md) | Tier: cross-cutting — used by every phase's tests and demos. |
| [security-model.md](../foundations/security-model.md) | Tier: cross-cutting — every phase answers to this. |
| [testing-strategy.md](../foundations/testing-strategy.md) | Tier: cross-cutting — every phase answers to this. |

## `meta/` — reader-facing navigation aids (this file lives here)

| File | Purpose |
| :--- | :--- |
| [question-index.md](question-index.md) | This file is the answer-index for the product. If an AI agent, newcomer, peer reviewer, or casual browser asks a question about the app, thi |
| [technical-overview.md](technical-overview.md) | DataScope is a **browser-native analytics IDE**. It's built for people who inherit data they don't understand — CSVs, JSON, Parquet droppe |

## `build/` — *how it's built*, phase by phase (build order)

Each phase folder's `README.md` states its section dependency and exit criteria; leaf docs are the individual build items. Status lives only in [`BUILD-ORDER.md`](../status/BUILD-ORDER.md), never here.

### `01-foundation`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/01-foundation/README.md) | Tier: v0 · Phase: 1 (§19) · Depends on: nothing — this is the bottom of the stack. |
| [01-project-bootstrap.md](../build/01-foundation/01-project-bootstrap.md) | Tier: v0 · Phase 1 · Master spec: §6 (stack), §16 (structure), §15 (budgets), §17 (COOP/COEP risk) |
| [02-state-management.md](../build/01-foundation/02-state-management.md) | Tier: v0 · Phase 1 · Master spec: §21.7 (state tree), §16 (`src/stores/`) |
| [03-routing.md](../build/01-foundation/03-routing.md) | Tier: v0 · Phase 1 · Master spec: §13 + §13.2 (layout & navigation; D68 nav restructure) |

### `02-ingestion`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/02-ingestion/README.md) | Tier: v0 · Phase: 1 (§19) · Depends on: `../01-foundation/` |
| [01-file-drop.md](../build/02-ingestion/01-file-drop.md) | Tier: v0 · Phase 1 · Master spec: §7.1 (formats), §7.2 (flow) |
| [02-duckdb.md](../build/02-ingestion/02-duckdb.md) | Tier: v0 · Phase 1 · Master spec: §6, §15, §17 (risks), A.2 |
| [03-table-registry.md](../build/02-ingestion/03-table-registry.md) | Tier: v0 · Phase 1 · Master spec: §7.5 (D13) |
| [04-multi-file.md](../build/02-ingestion/04-multi-file.md) | Tier: v0 · Phase 1 · Master spec: §7.5 |
| [05-large-files.md](../build/02-ingestion/05-large-files.md) | Tier: v0 · Phase 1 · Master spec: §7.3 (D16), §15 |

### `03-profiling`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/03-profiling/README.md) | Tier: v0 · Phase: 1 (§19) · Depends on: `../02-ingestion/` |
| [01-summary-statistics.md](../build/03-profiling/01-summary-statistics.md) | Tier: v0 · Phase 1 · Master spec: §8 step 1 |
| [02-column-classifier.md](../build/03-profiling/02-column-classifier.md) | Tier: v0 · Phase 1 · Master spec: §8 step 2, §17 (misclassification risk) |
| [03-capability-engine.md](../build/03-profiling/03-capability-engine.md) | Tier: v0 · Phase 1 · Master spec: §9 |
| [04-profile-ui.md](../build/03-profiling/04-profile-ui.md) | Tier: v0 · Phase 1 (column cards) + Phase 3 (insight feed, D10) · Master spec: §10 Module 1 |
| [05-dataset-dossier.md](../build/03-profiling/05-dataset-dossier.md) | Tier: v0 · Phase 3 (UI assembly) · Master spec: §13.1 (D48) · Decisions: D48, D24, D46, D45, D10, D20, D52, D55/D56, D68, D69 |

### `04-sql`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/04-sql/README.md) | Tier: v0 · Phase: 2 (§19) · Depends on: `../03-profiling/` |
| [01-monaco-editor.md](../build/04-sql/01-monaco-editor.md) | Tier: v0 · Phase 2 · Master spec: §10 Module 2, §15 |
| [02-query-suggestions.md](../build/04-sql/02-query-suggestions.md) | Tier: v0 · Phase 2 · Master spec: §10 Module 2 |
| [03-results-grid.md](../build/04-sql/03-results-grid.md) | Tier: v0 · Phase 2 · Master spec: §10 Module 2, §15/§19 Phase 6 (virtualization) |
| [04-chart-translator.md](../build/04-sql/04-chart-translator.md) | Tier: v0 · Phase 2 · Master spec: §10 Module 2, §11.1 stage 6 |
| [05-transformation-layer.md](../build/04-sql/05-transformation-layer.md) | Tier: v0 · Phase 2 · Master spec: §10 Module 2 (transformation), §12.1 (undo) |
| [06-pivot-crosstab.md](../build/04-sql/06-pivot-crosstab.md) | Tier: v0 · Phase 2 (surface) / Phase 3 (ship gate) · Master spec: §10 Module 7 (D53), §12.2 (export) |

### `05-charting`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/05-charting/README.md) | Tier: v0 · Phase: 3 — the v0 ship gate (§19, D15) · Depends on: |
| [01-time-series.md](../build/05-charting/01-time-series.md) | Tier: v0 · Phase 3 · Master spec: §10 Module 3 · Gate: `canDoTimeSeries` |
| [02-correlation.md](../build/05-charting/02-correlation.md) | Tier: v0 · Phase 3 · Master spec: §10 Module 4 · Gate: `canDoCorrelation` |
| [03-distribution.md](../build/05-charting/03-distribution.md) | Tier: v0 · Phase 3 · Master spec: §10 Module 5 · Gate: `canDoDistribution` |
| [04-categorical.md](../build/05-charting/04-categorical.md) | Tier: v0 · Phase 3 · Master spec: §10 Module 6 · Gate: `canDoCategoricalBreakdown` |
| [05-join-graph-beta.md](../build/05-charting/05-join-graph-beta.md) | Tier: v0 · Phase 3 — v0 ship gate item · Master spec: §19 Phases 1/3, D24 (amends |

### `v0.25`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/v0.25/README.md) | Tier: v0.25 (D70) · Phase: §19 v0.25 block · post-launch re-sequencing of AI work; order-neutral, sequencing vs. 06-ai is an open call |
| [01-blueprint-opening.md](../build/v0.25/01-blueprint-opening.md) | Tier: v0.25 · Master spec: §13.1, §19 (v0.25) · Dossier/D68 Verdict promoted to the primary post-ingest surface (D48/D68/D69, no new engine) |
| [02-edge-synthesis.md](../build/v0.25/02-edge-synthesis.md) | Tier: v0.25 · Master spec: §6, §11.2, §13.1, §23.5 · Cloudflare warm-start synthesis Worker over DSPS facts (D56 async; D9/D45/D59) |
| [03-webllm-handoff.md](../build/v0.25/03-webllm-handoff.md) | Tier: v0.25 · Master spec: §11.2, §13.1 · in-browser WebLLM/WebGPU client-side takeover, zero egress (D43 gate cleared — GO, ADR-007) |

### `06-ai`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/06-ai/README.md) | Tier: v0.5 · Phase: 4 (§19) · Depends on: the full v0 stack — especially the |
| [01-pipeline.md](../build/06-ai/01-pipeline.md) | Tier: v0.5 · Phase 4 · Master spec: §11.1, Appendix A (A.1–A.5) |
| [02-modes-byok.md](../build/06-ai/02-modes-byok.md) | Tier: v0.5 · Phase 4 · Master spec: §11.2 (D2, D3, D9), §5.1, §23.5 |
| [03-privacy-disclosure.md](../build/06-ai/03-privacy-disclosure.md) | Tier: v0.5 · Phase 4 · Master spec: §11.3, §5.1 |

### `07-connectivity`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/07-connectivity/README.md) | Tier: v0.5 · Phase: 5 (§19) · Depends on: `../02-ingestion/` |
| [01-api-tier1-fetch.md](../build/07-connectivity/01-api-tier1-fetch.md) | Tier: v0.5 · Phase 5 · Master spec: §7.4 Tier 1 |
| [02-api-tier2-relay.md](../build/07-connectivity/02-api-tier2-relay.md) | Tier: v0.5 · Phase 5 · Master spec: §7.4 Tier 2 |
| [03-refresh-from-source.md](../build/07-connectivity/03-refresh-from-source.md) | Tier: v0.5 · Phase 5 · Master spec: §7.4 |

### `08-persistence`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/08-persistence/README.md) | Tier: v0.5 · Phase: 5 (§19) · Depends on: `../04-sql/` (tables |
| [01-parquet-export.md](../build/08-persistence/01-parquet-export.md) | Tier: v0.5 · Phase 5 · Master spec: §12.2 |
| [02-r2-save-share.md](../build/08-persistence/02-r2-save-share.md) | Tier: v0.5 · Phase 5 · Master spec: §12.3 (D5, D20–D21, D46) |
| [03-dsps-spec.md](../build/08-persistence/03-dsps-spec.md) | Tier: schema designed in v0 (Phase 1, §19) · renderers land v0/v0.5 · Master spec: |

### `09-edge`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/09-edge/README.md) | Tier: v0.5 · Separate deploy — the `edge/` tree in §16, wrangler-managed, |
| [01-ai-router.md](../build/09-edge/01-ai-router.md) | Tier: v0.5 · serves Phase 4 · Master spec: §11.2 (D2/D3/D9), §6 |
| [02-cors-relay.md](../build/09-edge/02-cors-relay.md) | Tier: v0.5 · serves Phase 5 · Master spec: §7.4 Tier 2 |
| [03-vault.md](../build/09-edge/03-vault.md) | Tier: v0.5 · serves Phase 4 · Master spec: §11.2 (D9), §7.4 Tier 3 (future consumer) |
| [04-persistence-endpoints.md](../build/09-edge/04-persistence-endpoints.md) | Tier: v0.5 · serves Phase 5 · Master spec: §12.3 (D5) |

### `10-studio`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/10-studio/README.md) | Tier: v1 · Phases: 7–9 (§19, D12) · Depends on: the complete v0 + v0.5 stack, |

### `10-studio/01-quality-report`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/10-studio/01-quality-report/README.md) | Tier: v1 · Phase: 7 (§19, D14) — but the Drift Report component (D44) is pulled |

### `10-studio/02-relationship-graph`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/10-studio/02-relationship-graph/README.md) | Tier: v1 · Phase: 8 (§19, D11) · Design: §20.6 · Depends on: |

### `10-studio/03-semantic-dbt-export`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/10-studio/03-semantic-dbt-export/README.md) | Tier: v1 · Phase: 9 (§19, D11) · Design: §20.6 · Depends on: |

### `11-ml`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/11-ml/README.md) | Tier: backlog — designed, deferred (D1) · Design: §20.1 · Depends on: the core |

### `12-workbench`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/12-workbench/README.md) | Tier: parallel shell work, flag-gated (D71) · Phases W0–W8 (§19) · Master spec: §13.3 — the leaf-group charter; per-phase leaves land as picked up. Cut over to the app's only shell 2026-07-25; amended by D73 |

### `13-hallmark-replication`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/13-hallmark-replication/README.md) | Tier: v0.69 · Phases V1–V6e (§19) · Master spec: §13.3 + §19's v0.69 subsection · D71 execution, **no new decision** — the Workbench's deferred visual layer, ported from the five signed-off hallmark mocks against the locked `.hallmark/design.md`. Complete 2026-07-25 |

### `14-workspace-streamline`

| File | Purpose |
| :--- | :--- |
| [README.md](../build/14-workspace-streamline/README.md) | Tier: v0.70 · Phases S0–S7 (§19) · Master spec: §13.3 + §19's v0.70 subsection · **decision D73** (amends D71) — the shell after a dataset is loaded: the two-view drawer with the SQL console, query tabs, the shared guarded run path, the retired options strip, and the map's findings surfaces. Act 0/Act 1 out of scope |
| [00-synthesis-and-limits-probe.md](../build/14-workspace-streamline/00-synthesis-and-limits-probe.md) | **S0 — a D18-style probe, not a feature.** Measures the two things D73 refused to guess at: whether a widened prompt reaches the §4 purpose narrative *inside* the ADR-010 honesty seam (Probe A, on the v0.25 edge + WebLLM rungs, structure-only), and the query-tab memory ceiling on real hardware (Probe B, M1 Air base + M4 Air). Also records item **C** — the Settings model-rating pane — as new scope needing an ADR-007 amendment |
