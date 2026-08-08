# Build order

Working checklist for building DataScope from this tree. This file holds only the
checklist — every log entry, deviation, and process note lives in
[BUILD-ORDER-HISTORY.md](BUILD-ORDER-HISTORY.md). The code repo never references either
file, the phases, or this doc tree. One `▶` marks the next item to build.

Each item is one leaf doc in `build/`; build to its definition of done. Model shown is
who _builds_ the item; the orchestrating session (Fable) triages, reviews the diff, and
maintains this file.

## Rules

**Models.** Sonnet is the default builder. Opus takes spikes, anything doing inference
or judgment (classifier, capability engine, chart translator, NL→SQL, Studio), and
security-sensitive edge code. Haiku takes mechanical scaffolding. Never substitute up
without a reason — log it in `BUILD-ORDER-HISTORY.md`.

**Checking a box.** Only when the leaf doc's definition of done is met, tests included.
No partial checks — an incomplete item stays unchecked, with what exists logged in
`BUILD-ORDER-HISTORY.md`. Boxes only go from unchecked to checked; a regression gets
unchecked and logged, never left silently checked.

**Order.** Dependency order — don't start an item whose section dependency (each
`build/*/README.md` header) has unchecked blockers, and don't reorder rows to suit a
session. Exactly one `▶` exists at all times; move it when you check its item.

**No `src/` code starts until a phase's own leaf doc lands** — the binding constraint
introduced at v0.60, unchanged since.

**Every session ends by updating this file and appending one entry to
`BUILD-ORDER-HISTORY.md`** — what now works and why it matters, the next concrete
action, and any open blocker — so a fresh session can resume cold from this file, the
leaf docs, and the history file alone. If a session deviates from a leaf doc, the
deviation is logged _and_ the leaf doc corrected (master-first), so the checklist never
silently diverges from the spec.

## Writing rules for the code repo

The built repository follows the same discipline as its comments and READMEs — adapted
from `off-the-pace/.github/CONVENTIONS.md`:

- Describe what the code does and why, in place. Never how it came to be.
- Banned in code, comments, commits, and READMEs: "Phase n", "Sprint", "Wave", "Step n
  of", "newly", "now supports", "complete" — process narration, not what the code does.
- Spec citations are allowed and encouraged: `§n`, `D-`numbers, and links into
  `_implementation/` all resolve in a fresh clone, and supplement the reason without
  replacing it — `renders four intent groups (§13.2, D68d)`, never a bare `see §13.2`.
- Ordered _instructions_ for a genuine procedure are fine; ordered _history_ is not.

## Checklist

### Spikes — run first; ADRs and interfaces freeze from their evidence (D18)

- [x] Ingestion spike — DuckDB-Wasm worker + file drop viability — Opus
- [x] Relationship-inference spike (D17) — Opus

### v0 — local, deterministic · ships Tuesday, October 6, 2026 (D27)

- [x] **01 foundation**
  - [x] 01 project-bootstrap — Sonnet
        → [`01-project-bootstrap.md`](../build/01-foundation/01-project-bootstrap.md)
  - [x] 02 state-management — Sonnet
        → [`02-state-management.md`](../build/01-foundation/02-state-management.md)
  - [x] 03 routing — Haiku
        → [`03-routing.md`](../build/01-foundation/03-routing.md)
- [x] **02 ingestion**
  - [x] 01 file-drop — Sonnet
        → [`01-file-drop.md`](../build/02-ingestion/01-file-drop.md)
  - [x] 02 duckdb — Opus
        → [`02-duckdb.md`](../build/02-ingestion/02-duckdb.md)
  - [x] 03 table-registry — Sonnet
        → [`03-table-registry.md`](../build/02-ingestion/03-table-registry.md)
  - [x] 04 multi-file — Sonnet
        → [`04-multi-file.md`](../build/02-ingestion/04-multi-file.md)
  - [x] 05 large-files — Sonnet
        → [`05-large-files.md`](../build/02-ingestion/05-large-files.md)
- [x] **03 profiling**
  - [x] 01 summary-statistics — Sonnet
        → [`01-summary-statistics.md`](../build/03-profiling/01-summary-statistics.md)
  - [x] 02 column-classifier — Opus
        → [`02-column-classifier.md`](../build/03-profiling/02-column-classifier.md)
  - [x] 03 capability-engine — Opus
        → [`03-capability-engine.md`](../build/03-profiling/03-capability-engine.md)
  - [x] 04 profile-ui — Sonnet
        → [`04-profile-ui.md`](../build/03-profiling/04-profile-ui.md)
  - [x] 05 dataset-dossier — Sonnet
        → [`05-dataset-dossier.md`](../build/03-profiling/05-dataset-dossier.md)
- [x] **04 sql**
  - [x] 01 monaco-editor — Sonnet
        → [`01-monaco-editor.md`](../build/04-sql/01-monaco-editor.md)
  - [x] 02 query-suggestions — Sonnet
        → [`02-query-suggestions.md`](../build/04-sql/02-query-suggestions.md)
  - [x] 03 results-grid — Sonnet
        → [`03-results-grid.md`](../build/04-sql/03-results-grid.md)
  - [x] 04 chart-translator — Opus
        → [`04-chart-translator.md`](../build/04-sql/04-chart-translator.md)
  - [x] 05 transformation-layer — Sonnet
        → [`05-transformation-layer.md`](../build/04-sql/05-transformation-layer.md)
  - [x] 06 pivot-crosstab — Sonnet
        → [`06-pivot-crosstab.md`](../build/04-sql/06-pivot-crosstab.md)
- [x] **05 charting** — the v0 ship gate
  - [x] 01 time-series — Sonnet
        → [`01-time-series.md`](../build/05-charting/01-time-series.md)
  - [x] 02 correlation — Sonnet
        → [`02-correlation.md`](../build/05-charting/02-correlation.md)
  - [x] 03 distribution — Sonnet
        → [`03-distribution.md`](../build/05-charting/03-distribution.md)
  - [x] 04 categorical — Sonnet
        → [`04-categorical.md`](../build/05-charting/04-categorical.md)
  - [x] 05 join-graph-beta — Opus
        → [`05-join-graph-beta.md`](../build/05-charting/05-join-graph-beta.md)

### composition-layer recompose (D68) — within v0, no scope/date change

Recomposes Phases 1–5 with the D68 contracts. Sequenced before `06-ai` so the AI
producer has a frozen deterministic seam to plug into. Order: A → B → C → D → E.

- [x] A — Action Broker — Opus
      → [`03-capability-engine.md`](../build/03-profiling/03-capability-engine.md), [`05-dataset-dossier.md`](../build/03-profiling/05-dataset-dossier.md)
- [x] B — Tier the Dossier — Sonnet
      → [`05-dataset-dossier.md`](../build/03-profiling/05-dataset-dossier.md)
- [x] C — Nav restructure — Sonnet
      → [`03-routing.md`](../build/01-foundation/03-routing.md)
- [x] D — Thread pre-config — Sonnet
      → [`build/04-sql/`](../build/04-sql/), [`build/05-charting/`](../build/05-charting/)
- [x] E — AI seam freeze (design only, no AI code) — Opus
      → an ADR + `types/*`

### v0.25 — Blueprint-forward opening + edge synthesis → WebLLM + BYOK (D70) · post-v0-launch tier

Curates a slice of v0.5's AI work forward around the Blueprint-forward opening. Runs
before `06-ai`, except the two rows that reuse 06-ai's provider routing (edge synthesis,
BYOK), which follow it.

- [x] WebLLM spike (D43) — Opus
      → no leaf doc (spike); verdict in [`architecture/adr/007-ai-routing.md`](../architecture/adr/007-ai-routing.md)
- [x] Blueprint-forward opening — Sonnet
      → [`01-blueprint-opening.md`](../build/v0.25/01-blueprint-opening.md)
- [x] Edge synthesis worker — Opus
      → [`02-edge-synthesis.md`](../build/v0.25/02-edge-synthesis.md)
- [x] WebLLM client handoff — Opus
      → [`03-webllm-handoff.md`](../build/v0.25/03-webllm-handoff.md)
- [x] BYOK forward — Opus
      → [`06-ai/02-modes-byok.md`](../build/06-ai/02-modes-byok.md) (reuses this row, not a duplicate)

### v0.5 — AI, connectivity, persistence, edge · gated on §18 acceptance criteria

- [x] **06 ai**
  - [x] 01 pipeline — Opus
        → [`01-pipeline.md`](../build/06-ai/01-pipeline.md)
  - [x] 02 modes-byok — Opus
        → [`02-modes-byok.md`](../build/06-ai/02-modes-byok.md)
  - [x] 03 privacy-disclosure — Sonnet
        → [`03-privacy-disclosure.md`](../build/06-ai/03-privacy-disclosure.md)
- [x] **09 edge** (built alongside its clients above; separate deploy)
  - [x] 01 ai-router — Opus
        → [`01-ai-router.md`](../build/09-edge/01-ai-router.md)
  - [x] 02 cors-relay — Sonnet
        → [`02-cors-relay.md`](../build/09-edge/02-cors-relay.md)
  - [x] 03 vault — Opus
        → [`03-vault.md`](../build/09-edge/03-vault.md)
  - [x] 04 persistence-endpoints — Sonnet
        → [`04-persistence-endpoints.md`](../build/09-edge/04-persistence-endpoints.md)
- [x] **07 connectivity**
  - [x] 01 api-tier1-fetch — Sonnet
        → [`01-api-tier1-fetch.md`](../build/07-connectivity/01-api-tier1-fetch.md)
  - [x] 02 api-tier2-relay — Sonnet
        → [`02-api-tier2-relay.md`](../build/07-connectivity/02-api-tier2-relay.md)
  - [x] 03 refresh-from-source — Sonnet
        → [`03-refresh-from-source.md`](../build/07-connectivity/03-refresh-from-source.md)
- [ ] **08 persistence**
  - [x] 01 parquet-export — Sonnet
        → [`01-parquet-export.md`](../build/08-persistence/01-parquet-export.md)
  - [x] 02 r2-save-share — Sonnet
        → [`02-r2-save-share.md`](../build/08-persistence/02-r2-save-share.md)
  - [ ] 03 dsps-spec — Sonnet
        → [`03-dsps-spec.md`](../build/08-persistence/03-dsps-spec.md)

### v0.60 — the Workbench (D71) · parallel shell behind `WORKBENCH_ENABLED`

The app's second shell, built as a parallel composition root so main stays shippable
every day. Depends only on the committed v0 baseline, not on v0.5 finishing.

- [x] W0 — Tab contract — Sonnet
      → [`01-tab-contract.md`](../build/12-workbench/01-tab-contract.md)
- [x] W1 — Workbench scaffold — Sonnet
      → [`02-workbench-scaffold.md`](../build/12-workbench/02-workbench-scaffold.md)
- [x] W2 — Left explorer — Sonnet
      → [`03-left-explorer.md`](../build/12-workbench/03-left-explorer.md)
- [x] W3 — Tab model maturation — Sonnet
      → [`04-tab-model-maturation.md`](../build/12-workbench/04-tab-model-maturation.md)
- [x] W4 — Dataset map — Sonnet
      → [`05-dataset-map.md`](../build/12-workbench/05-dataset-map.md)
- [x] W5 — Options strip + command palette — Sonnet
      → [`06-options-strip-palette.md`](../build/12-workbench/06-options-strip-palette.md)
- [x] W6 — Acts 0–2 — Sonnet
      → [`07-acts-welcome-ai-defaults.md`](../build/12-workbench/07-acts-welcome-ai-defaults.md)
- [x] W7 — Right AI pane — Sonnet
      → [`08-right-ai-pane.md`](../build/12-workbench/08-right-ai-pane.md)
- [x] W7.5 — Module wiring — Sonnet
      → [`09-module-wiring.md`](../build/12-workbench/09-module-wiring.md)
- [x] W8 — Viewer mode + cutover — Opus
      → [`10-viewer-cutover.md`](../build/12-workbench/10-viewer-cutover.md)

### v0.69 — the hallmark visual replication (D71 execution)

Ports the five signed-off hallmark mocks into the shipped Workbench shell — the visual
layer W0–W8 deliberately deferred. The locked system is `.hallmark/design.md` (portable
copy `tokens.css`); departing from it means amending that file, never overriding
locally. Accent registers are semantic — amber = active/selected/PK, purple =
copilot/FK, never interchangeable.

- [x] V1 — Token layer + locked system — Opus
      → [`01-token-layer.md`](../build/13-hallmark-replication/01-token-layer.md)
- [x] V2 — Shell chrome — Sonnet
      → [`02-shell-chrome.md`](../build/13-hallmark-replication/02-shell-chrome.md)
- [x] V3 — Explorer + status bar voice — Sonnet
      → [`03-explorer-status-bar.md`](../build/13-hallmark-replication/03-explorer-status-bar.md)
- [x] V4 — Inspector + AI pane — Sonnet
      → [`04-inspector-ai-pane.md`](../build/13-hallmark-replication/04-inspector-ai-pane.md)
- [x] V5 — Options strip + command palette — Sonnet
      → [`05-options-strip-palette.md`](../build/13-hallmark-replication/05-options-strip-palette.md)
- [x] V6a — Status register + chrome sweep — Opus
      → [`06a-status-register.md`](../build/13-hallmark-replication/06a-status-register.md)
- [x] V6b — Chart + canvas palette — Opus
      → [`06b-chart-canvas-palette.md`](../build/13-hallmark-replication/06b-chart-canvas-palette.md)
- [x] V6c — Export artifact — Sonnet
      → [`06c-export-artifact.md`](../build/13-hallmark-replication/06c-export-artifact.md)
- [x] V6d — Act 0 — Sonnet
      → [`06d-act0.md`](../build/13-hallmark-replication/06d-act0.md)
- [x] V6e — Conformance gate — Opus
      → [`06e-conformance-gate.md`](../build/13-hallmark-replication/06e-conformance-gate.md)

### v0.70 — the workspace streamline (D73) · the shell after a dataset is loaded

Changes what the shell _is_ once a dataset is loaded — the explorer rail and the
`map · workspace` tab. Act 0/Act 1 and the AI pane's content are out of scope. Reverses
three D71 positions: the inspector's "scent, not dashboard" charter, the "one SQL
playground" singleton, and the Settings tab. **S0 is paused, pending v0.71's A0** (see
that tier) — S1–S6 are unaffected. S5 and S6 land together on shared wiring; S0's two
measurements gate S7 and S5's ceiling.

- [ ] S0 — Probe: synthesis reach + query-tab ceiling — Opus
      → [`00-synthesis-and-limits-probe.md`](../build/14-workspace-streamline/00-synthesis-and-limits-probe.md)
- [x] S1 — Explorer rail reflow — Sonnet
      → [`01-explorer-rail-reflow.md`](../build/14-workspace-streamline/01-explorer-rail-reflow.md)
- [x] S2 — Data Quality & Health panel — Sonnet
      → [`02-data-quality-health.md`](../build/14-workspace-streamline/02-data-quality-health.md)
- [x] S3 — The item-inspector drawer — Opus
      → [`03-item-inspector-drawer.md`](../build/14-workspace-streamline/03-item-inspector-drawer.md)
- [x] S4 — Run from anywhere + the shared guarded run path — Opus
      → [`04-run-from-anywhere.md`](../build/14-workspace-streamline/04-run-from-anywhere.md)
- [x] S5 — Query tabs + the registry amendment — Opus
      → [`05-query-tabs.md`](../build/14-workspace-streamline/05-query-tabs.md)
- [ ] S6 — Map composition — Sonnet
      → [`06-map-composition.md`](../build/14-workspace-streamline/06-map-composition.md)
- [x] S6.5 — The drawer split view — Opus
      → [`06.9-drawer-split-view.md`](../build/14-workspace-streamline/06.9-drawer-split-view.md)
- [x] S6.7 — Info opens on content — Opus
      → [`06.95-info-on-content.md`](../build/14-workspace-streamline/06.95-info-on-content.md)
- [x] S6.9 — Workspace persistence across refresh
      → [`07-workspace-persistence.md`](../build/14-workspace-streamline/07-workspace-persistence.md)
  - [x] 07a persistence-spike — Opus → no leaf doc (spike); verdict in [`ADR-011`](../architecture/adr/011-workspace-persistence-storage.md)
  - [x] 07b durable-row-storage — Opus
  - [x] 07c registry-state-persist — Sonnet
  - [x] 07d rehydration-bootstrap — Opus
- [ ] S7 — AI Dataset Synthesis — Opus
      → no leaf doc yet; blocked on S0's verdict

### v0.71 — the analyst layer (D74) · one operation catalog, one door

Sequenced ahead of v0.70's remainder (v0.70's S0 is paused, not cancelled — see that
tier). Amends D38 (MCP staging binds transport reach, not the protocol — in-process MCP
over browser-local data is unrestricted) and D41 (AI transcripts persist locally, for
capability). A0–A3 are worth building regardless of whether any model succeeds — value
search is a search box, text frequency is a panel, paging removes a correctness cliff;
the scored experiment is a consumer of this layer, not a gate on it, and stays in
`eval/`.

- [x] A0 — The analyst core — Opus
      → [`00-analyst-core.md`](../build/15-analyst-layer/00-analyst-core.md)
- [x] A1 — The eight missing operations — Sonnet
      → [`01-missing-operations.md`](../build/15-analyst-layer/01-missing-operations.md)
- [x] A2 — Operation surfaces — Sonnet
      → [`02-operation-surfaces.md`](../build/15-analyst-layer/02-operation-surfaces.md)
- [x] A3 — Transforms first-class — Opus
      → [`03-transforms-first-class.md`](../build/15-analyst-layer/03-transforms-first-class.md)
- [x] A4 — The tool loop — Opus
      → [`04-tool-loop.md`](../build/15-analyst-layer/04-tool-loop.md)
  - [x] **closed 2026-08-03:** edge Worker redeployed to staging; `cloud-edge` harness arm
        recovered to 96.6% exec-rate (was serving the stale pre-A4 turn shape).
  - [ ] **open:** the `qwen2.5-coder:1.5b` before/after gate — a Tailscale daemon is now
        reachable (closing the original blocker), but only `qwen3:8b` is pulled there, not the
        pinned `1.5b`. A substituted `qwen3:8b` run scored 46.6%/43.1%, under threshold and below
        the WebLLM `1.5b` baseline — informational only; still open pending a real `1.5b` run.
- [x] A5 — MCP server + app AI on the same surface — Opus
      → [`05-mcp-server.md`](../build/15-analyst-layer/05-mcp-server.md)
  - SDK pin corrected: there is no TypeScript SDK v2 — shipped `@modelcontextprotocol/sdk`
    **1.30.0** at protocol **`2025-11-25`**, not `2026-07-28`. See the leaf doc's table.
  - [x] **closed 2026-08-02:** the catalog was **seventeen** operations, not D74's
        eighteen — `data_quality` had a service but no handler. Closed as the
        A1-shaped follow-up this note called for; catalog is now twenty (eighteen
        analysis + two product-surface).
- [x] A6 — Charts and pins as operations — Opus
      → [`06-charts-and-pins.md`](../build/15-analyst-layer/06-charts-and-pins.md)
  - catalog is now **nineteen**: seventeen analysis + two product surface, the latter
    excluded from the D74 scored run by tag (`PRODUCT_SURFACE_OPERATIONS`), not by a
    name list in `eval/`

### v0.72 — collapsible workspace panels · remove Reveal

Removes the `WorkbenchShellReveal` intermediate page and makes all three workspace
side panels collapsible like VSCode — collapsed to a thin activity bar, expanded on
click, state persisted.

- [x] UX-1 — Remove Reveal, revert to production shell — Gemini
      → [`01-remove-reveal.md`](../build/16-workspace-ux/01-remove-reveal.md)
- [x] UX-2 — Collapsible explorer panel — Gemini
      → [`02-collapsible-explorer.md`](../build/16-workspace-ux/02-collapsible-explorer.md)
- [x] UX-3 — Collapsible AI pane (persisted) — Gemini
      → [`03-collapsible-ai-pane.md`](../build/16-workspace-ux/03-collapsible-ai-pane.md)
- [x] UX-4 — Inspector polish — Gemini
      → [`04-inspector-polish.md`](../build/16-workspace-ux/04-inspector-polish.md)
- [x] UX-5 — Map tab as overview home — Gemini
      → [`05-map-overview-home.md`](../build/16-workspace-ux/05-map-overview-home.md)

### Backlog

- [ ] **ml** — unscheduled; assign a model when pulled forward
- [ ] **semantic-dbt-export** — unscheduled; assign a model when pulled forward
- [ ] **relationship-graph-erd-ideas** — unscheduled; entity inference + fact/dimension
      classification, cut from the former `10-studio/02` (D11) 2026-08-02 — the shipped v0
      Join Graph (beta) already covers FK detection/rendering; see
      [`../backlog/relationship-graph-erd-ideas.md`](../backlog/relationship-graph-erd-ideas.md)

## Log

See [BUILD-ORDER-HISTORY.md](BUILD-ORDER-HISTORY.md) — every session's entry lives
there, oldest first.
