# Build order

Working checklist for building DataScope from this tree. This file is the **only** place
build status, phase language, and process history live — the code repo never references
it, the phases, or this doc tree. One `▶` marks the next item to build; the log at the
bottom records what shipped.

Each item is one leaf doc in `build/`; build to its definition of done. Model names are
who *builds* the item; the orchestrating session (Fable) triages, reviews the diff, and
maintains this file.

**Model rule:** Sonnet is the default builder. Opus takes the spikes, anything doing
inference or judgment (classifier, capability engine, chart translator, NL→SQL, Studio),
and security-sensitive edge code. Haiku takes mechanical scaffolding. Never substitute up
without a reason logged below.

## Update rules

1. Check a box **only** when the leaf doc's definition of done is met — tests included.
   No partial checks; if an item lands incomplete, leave it unchecked and log what exists.
2. Update this file **in the same session** the work lands. Never batch updates.
3. Exactly one `▶` exists at all times. Move it when you check its item.
4. Boxes only go from unchecked to checked. If shipped work regresses or must reopen,
   uncheck it and log why — that log entry is mandatory.
5. Model column is a commitment: if a different model ends up doing the work, correct the
   column and log the reason.
6. Order is dependency order. Don't start an item whose section dependency (each
   `build/*/README.md` header) has unchecked blockers, and don't reorder rows to suit a
   session.

## Handoff rules

Every working session ends by making this file sufficient for a cold start:

1. Append one log entry: date, **what now works and why it matters**, the next concrete
   action, and any open blocker. A fresh session must be able to resume from this file
   plus the leaf docs alone — no memory of the previous session assumed.
2. Log comments describe the work, not the process: write "CSV/ZIP drop registers tables
   with typed columns", never "finished phase 2 items 1–4" or "mostly done". No
   percentages, no "almost", no phase numbers in the prose.
3. If a session deviates from a leaf doc, the deviation is logged here *and* the leaf doc
   is corrected (master-first per the workspace rule) — the checklist never silently
   diverges from the spec.
4. Blockers name the blocking fact, not a feeling: "OPFS quota API returns 0 in Safari
   18", not "large files are being difficult".

## Writing rules for the code repo

The built repository follows the same discipline as its comments and READMEs — adapted
from `off-the-pace/.github/CONVENTIONS.md`:

- **Describe what the code does and why, in place.** Never how it came to be.
- **Banned in code, comments, commits, and READMEs:** "Phase n", "Sprint", "Wave",
  "Step n of", "newly", "now supports", "complete" — process narration tells a reader
  where the work sat in a schedule, not what the code does.
- **Spec citations are allowed and encouraged.** The design tree ships in this
  repository, so `§n` citations, `D-`numbers, and links to `_implementation/` all resolve
  in a fresh clone; they are the shortest path from a line of code to the reasoning
  behind it. They *supplement* the reason, never replace it — the comment or test name
  must still stand on its own, with the citation trailing as a pointer:
  `renders four intent groups (§13.2, D68d)`, never a bare `see §13.2`.
- Every reference must resolve inside a fresh clone of the code repo.
- Ordered *instructions* for a genuine procedure are fine; ordered *history* is not.

## Checklist

### Spikes — run first; ADRs and interfaces freeze from their evidence (D18)

- [x] Ingestion spike — DuckDB-Wasm worker + file drop viability — **Opus**
- [x] Relationship-inference spike (D17) — evidence only, build lands in 10 — **Opus**

### v0 — local, deterministic · ships Tuesday, October 6, 2026 (D27)

- [x] **01 foundation**
  - [x] 01 project-bootstrap — Sonnet
  - [x] 02 state-management — Sonnet
  - [x] 03 routing — Haiku
- [x] **02 ingestion**
  - [x] 01 file-drop — Sonnet
  - [x] 02 duckdb — Opus
  - [x] 03 table-registry — Sonnet
  - [x] 04 multi-file — Sonnet
  - [x] 05 large-files — Sonnet
- [x] **03 profiling**
  - [x] 01 summary-statistics — Sonnet
  - [x] 02 column-classifier — Opus
  - [x] 03 capability-engine — Opus
  - [x] 04 profile-ui — Sonnet
  - [x] 05 dataset-dossier — Sonnet
- [x] **04 sql**
  - [x] 01 monaco-editor — Sonnet
  - [x] 02 query-suggestions — Sonnet
  - [x] 03 results-grid — Sonnet
  - [x] 04 chart-translator — Opus
  - [x] 05 transformation-layer — Sonnet
  - [x] 06 pivot-crosstab — Sonnet
- [x] **05 charting** — the v0 ship gate
  - [x] 01 time-series — Sonnet
  - [x] 02 correlation — Sonnet
  - [x] 03 distribution — Sonnet
  - [x] 04 categorical — Sonnet
  - [x] 05 join-graph-beta — Opus

### composition-layer recompose (D68) — within v0; recomposes Phases 1–5, no scope/date change

Each step extends already-built modules with the D68 contracts — build to the **amended**
leaf-doc definitions of done (the new acceptance-criteria rows). Phases A–E, itemized below.
Sequenced **before `06-ai`**: the AI producer (D56) plugs into these contracts, so the
deterministic seam freezes first (D68e/f). Order A → B → C → D → E; A is the highest-ROI item
(a genuine bug fix, no new UI).

- [x] **A — Action Broker** — `rankNextActions` in the broker; delete the every-step-"profile
  again" dead loop; wire each ranked action to a real module (not pre-filled yet) — **Opus**
  → [`03-capability-engine.md`](build/03-profiling/03-capability-engine.md), [`05-dataset-dossier.md`](build/03-profiling/05-dataset-dossier.md)
- [x] **B — Tier the Dossier** — `tier: 1|2|3` on ViewSpec panels; the Verdict (identity + one
  headline `FactRef` + top-3 actions) + confidence floor; disclosure for tiers 2–3 — **Sonnet**
  → [`05-dataset-dossier.md`](build/03-profiling/05-dataset-dossier.md)
- [x] **C — Nav restructure** — 12→4 capability-gated intent groups (DATA/EXPLORE/ANALYZE/OUTPUT);
  chart sub-types collapsed into one Charts destination; sticky "skip to data"; Studio/ML/Learn
  out of v0 nav — **Sonnet** → [`03-routing.md`](build/01-foundation/03-routing.md)
- [x] **D — Thread pre-config** — analysis modules accept a `ThreadConfig` prefill; ranked actions
  open modules **on the answer** — **Sonnet** → [`build/04-sql/`](build/04-sql/), [`build/05-charting/`](build/05-charting/)
- [x] **E — AI seam freeze** (design only, no AI code) — freeze the two §6 producer interfaces
  (action ranking, narration) so Phase 6 is a drop-in — **Opus** → an ADR + `types/*`

### v0.25 — Blueprint-forward opening + edge synthesis → WebLLM + BYOK (D70) · post-v0-launch tier

Curates a slice of v0.5's AI work forward around the Blueprint-forward opening (master §19 v0.25 block).
**Leaf docs authored** in [`build/v0.25/`](build/v0.25/) (the three genuinely-new buildable items; the
WebLLM spike's brief/verdict lives in ADR-007 like the v0 spikes, and BYOK reuses `06-ai/02-modes-byok`) —
this section records the milestone and its items; several **re-sequence existing v0.5 rows** rather than
add new scope (BYOK = `06-ai/02-modes-byok`; edge AI routing = `09-edge/01-ai-router`); v0.25 reuses 06-ai's
provider routing and the D55/D68 ViewSpec. **Sequencing call made (2026-07-21, human "lets go v0.25 · go in
the order that seems logical"):** v0.25 runs **before** `06-ai`, in the order **Blueprint-opening → WebLLM
spike → (06-ai provider routing) → edge synthesis / WebLLM handoff / BYOK**. The three AI-dependent rows
reuse 06-ai's routing, so they follow it; the Blueprint opening and the spike depend on neither, so they
lead. The `▶` led with the Blueprint opening then the WebLLM spike, then moved through `06-ai/01-pipeline`
(06-ai provider routing, now done), the edge-synthesis row, the WebLLM-handoff row, and the
BYOK-forward row — **the v0.25 section is complete (2026-07-22)**; the `▶` moved on to `06-ai/02`. Model column is a proposal.

- [x] WebLLM spike (D43) — in-browser WebLLM/WebGPU kill criteria: DuckDB-Wasm memory coexistence, an
  SQL-quality floor vs. cloud, acceptable download UX; **verdict = GO (2026-07-21), recorded in ADR-007** — **Opus**
  → no build doc (spike, like the v0 spikes); brief/verdict in [`architecture/adr/007-ai-routing.md`](architecture/adr/007-ai-routing.md); gate on the handoff row below is now cleared
- [x] Blueprint-forward opening — promote the Dataset Dossier / D68 Verdict to the primary post-ingest
  surface with the D69 intelligence-layers; reuses D48/D68/D69 + the D55/D68 ViewSpec, no new engine — **Sonnet**
  → [`build/v0.25/01-blueprint-opening.md`](build/v0.25/01-blueprint-opening.md)
- [x] Edge synthesis worker — Cloudflare warm-start synthesis over **DSPS structural facts only**, opt-in,
  stateless pass-through, never stored (D9/D59), local-only never calls it (D2); the D56 async upgrade — **Opus**
  → [`build/v0.25/02-edge-synthesis.md`](build/v0.25/02-edge-synthesis.md)
- [x] WebLLM client handoff — background download/warm (consent-gated, 2026-07-22 human decision), then
  client-side takeover of conversation + synthesis, degrading to edge/deterministic when off/down/uncached — **Opus**
  → [`build/v0.25/03-webllm-handoff.md`](build/v0.25/03-webllm-handoff.md)
- [x] BYOK forward (re-sequences `06-ai/02-modes-byok`) — D2c / D3 / D9 stateless pass-through custody — ~~Sonnet~~ **Opus** (matches the `06-ai/02` model-column correction below); **the row's
  pass-through scope is built + live-verified (2026-07-22)** — the `06-ai/02` leaf box itself
  stays open on its vault` criterion + an Ollama live run, per the no-partial-checks rule
  → [`build/06-ai/02-modes-byok.md`](build/06-ai/02-modes-byok.md) (existing — re-sequenced, not duplicated)

### v0.5 — AI, connectivity, persistence, edge · gated on §18 acceptance criteria

- [x] **06 ai**
  - [x] 01 pipeline — Opus
  - [x] 02 modes-byok — ~~Sonnet~~ **Opus** (D9 key custody is security-sensitive; see 2026-07-21 log) · *vault round-trip closed 2026-07-23; re-pointed Ollama live run closed 2026-07-24*
  - [x] 03 privacy-disclosure — Sonnet
- [x] **09 edge** (built alongside its clients below; separate deploy)
  - [x] 01 ai-router — Opus
  - [x] 02 cors-relay — Sonnet
  - [x] 03 vault — Opus
  - [x] 04 persistence-endpoints — Sonnet
- [x] **07 connectivity**
  - [x] 01 api-tier1-fetch — Sonnet
  - [x] 02 api-tier2-relay — Sonnet
  - [x] 03 refresh-from-source — Sonnet
- [ ] **08 persistence**
  - [x] 01 parquet-export — Sonnet
  - [x] 02 r2-save-share — Sonnet
  - [ ] 03 dsps-spec — Sonnet *(deferred 2026-07-24 — human "skip the dsps spec we will do it later"; its two open criteria were already deliberate confirmation pauses, not stuck work)*

### v0.60 — the Workbench (D71) · parallel shell behind `WORKBENCH_ENABLED`

Fold landed 2026-07-24 (master §13.3 restructure + §19's W0–W8 table, D71/D72, full tree
mirror + new [`build/12-workbench/`](build/12-workbench/README.md)) — the app's second shell,
built as a parallel composition root so main stays shippable every day. **Depends only on the
committed v0 baseline, not on v0.5 finishing** (the charter's own dependency line) — sequenced
here, between v0.5 and v1, by human instruction, not because it's gated on either. Each phase
becomes one build-order leaf under `build/12-workbench/` **as it is picked up**; W0's leaf
landed 2026-07-24 (below), the rest don't exist yet beyond the charter (`README.md`). **No
`src/` code for this redesign starts until a phase's own leaf doc lands** — the binding
constraint the fold itself recorded (§13.3). D72 ("deeper cloud grounding") gets no row of its
own — it's realized as deltas inside W6/W7, already noted in `build/06-ai/02-modes-byok.md` and
`build/06-ai/03-privacy-disclosure.md`. Model column is a proposal, corrected when each phase
is actually picked up.

- [x] **W0 — Tab contract** — tabs store + nav facade, flag-off and invisible; the envelope
  invariant (D55 generalization: model output never authors the tab envelope, only validated
  inner artifact specs) tested before anything is visible — **Sonnet** *(corrected from the
  Opus proposal per Update rule 5 — see log)*
  → [`01-tab-contract.md`](build/12-workbench/01-tab-contract.md)
- [x] **W1 — Workbench scaffold** — grid shell, act assembly (pure-skeleton tests), crude tab
  host — **Sonnet**
  → [`02-workbench-scaffold.md`](build/12-workbench/02-workbench-scaffold.md)
- [x] **W2 — Left explorer** — grown from `TableList` + a shell-wide selection store; Add-data
  and the share-links list left as open scope for a later leaf — **Sonnet**
  → [`03-left-explorer.md`](build/12-workbench/03-left-explorer.md)
- [x] **W3 — Tab model maturation** — singletons/artifacts, keep-mounted-first preservation
  (switch-away/back preserves state per tab type, manual test), pinning — **Sonnet**
  → [`04-tab-model-maturation.md`](build/12-workbench/04-tab-model-maturation.md)
- [x] **W4 — Dataset map** — multi-table ERD + single-table Blueprint face + persistent Verdict
  band; auto-layout spike (longest-path layering + barycenter) first, timeboxed — ~~Opus~~
  **Sonnet** *(corrected — see log)*
  → [`05-dataset-map.md`](build/12-workbench/05-dataset-map.md)
- [x] **W5 — Options strip + command palette** — subject-scoped filter, disabled-with-reason;
  **hard gate: the palette (⌘K) must reach every feature home** — **Sonnet**
  → [`06-options-strip-palette.md`](build/12-workbench/06-options-strip-palette.md)
- [x] **W6 — Acts 0–2** — welcome page + AI defaults per the §5.1 switch model (off-by-default,
  capable-device WebLLM pre-select, "Configure workspace," no forced gate) — ~~Opus~~ **Sonnet**
  *(corrected — see log)*
  → [`07-acts-welcome-ai-defaults.md`](build/12-workbench/07-acts-welcome-ai-defaults.md)
- [x] **W7 — Right AI pane** — mode switches + per-turn audit trail, bottom inspector, status
  bar consolidation (density budget) — **Sonnet**
  → [`08-right-ai-pane.md`](build/12-workbench/08-right-ai-pane.md)
- [x] **W7.5 — Module wiring** — SQL/Pivot/Charts/Correlation/Export as real Workbench tab
  types, mounting the existing modules; inserted 2026-07-25, discovered as a blocker on W8's
  own row-walk gate — **Sonnet**
  → [`09-module-wiring.md`](build/12-workbench/09-module-wiring.md)
- [x] **W8 — Viewer mode + cutover** — viewer mode shipped; §9.1 decided Workbench-only + soak
  accepted 2026-07-25; old shell + flag deletion in code landed the same day — **Opus**

### v0.69 — the hallmark visual replication (D71 execution) · closes the W-phases' deferred visual layer

Chartered 2026-07-25 (master §19's v0.69 subsection + Revised(15), new
[`build/13-hallmark-replication/`](build/13-hallmark-replication/README.md)). W0–W8 built the
Workbench's structure and behaviour against the pre-existing generic tokens and deliberately
deferred the visual layer — the shell's own code recorded the mocks as "content/copy reference
only, same precedent W4 set for the map." This tier ports the five signed-off hallmark mocks
(formerly `_misc/ideation/hallmark/`, deleted once V6e closed the tier — see `.hallmark/log.json`)
into the shipped shell. **Charters no new decision** — D71 already names those mocks as the
visual reference; this only sequences honouring them, and moves no scope, cutline, or date.
Sequenced before v1 by human instruction.

The locked system is `.hallmark/design.md` (portable copy `tokens.css`); departing from it
means amending that file, never overriding locally. **Diversification is deliberately inverted
for this tier** — every surface must cohere with the dataset map, not differ from it. Accent
registers are semantic: amber = active/selected/PK, purple = copilot/FK, never interchangeable.
Same binding constraint as §13.3's: **no `src/` code for a phase starts until that phase's own
leaf doc lands** — V1 deviated, see its row and the log.

- [x] **V1 — Token layer + locked system** — `design.md` + `tokens.css` + `theme.css` rewritten
  to the HUD surface ladder, legacy aliases so the existing 76 components inherit it unrewritten,
  self-hosted Geist + JetBrains Mono — **Opus**
  *(code landed 2026-07-25 ahead of its leaf doc — a logged deviation from the binding constraint;
  the leaf doc landed the same day, written against what shipped with its criteria re-run on the
  tree, and the box is checked on those re-runs.)*
  → [`01-token-layer.md`](build/13-hallmark-replication/01-token-layer.md)
- [x] **V2 — Shell chrome** — the title bar (a sixth region W1 never scaffolded: wordmark, active
  dataset, ⌘K affordance, settings) + tab-strip voice + region surfaces — **Sonnet**
  → [`02-shell-chrome.md`](build/13-hallmark-replication/02-shell-chrome.md)
- [x] **V3 — Explorer + status bar voice** — `.trow` key-square/role/inset-accent selection,
  posture dot, mono density budget — **Sonnet**
  → [`03-explorer-status-bar.md`](build/13-hallmark-replication/03-explorer-status-bar.md)
- [x] **V4 — Inspector + AI pane** — confidence pill, evidence row, and the purple copilot
  register held distinct from the amber HUD — **Sonnet**
  → [`04-inspector-ai-pane.md`](build/13-hallmark-replication/04-inspector-ai-pane.md)
- [x] **V5 — Options strip + command palette** — HUD button voice, ranked top action, palette
  overlay — **Sonnet**
  → [`05-options-strip-palette.md`](build/13-hallmark-replication/05-options-strip-palette.md)
- [x] **V6a — Status register + chrome sweep** — add `--color-error`/`--color-warn` to
  `design.md`/`tokens.css`/`theme.css` (the system ships only `--color-ok`), then move the
  error/warning blocks and modal scrims onto them; semantic-type badges re-voiced to the HUD's
  mono register — **Opus**
  → [`06a-status-register.md`](build/13-hallmark-replication/06a-status-register.md)
- [x] **V6b — Chart + canvas palette** — a validated categorical series palette on steps distinct
  from the reserved amber/purple registers, the diverging correlation scale, and the canvas paths
  that can't read `var()` directly — **Opus**
  → [`06b-chart-canvas-palette.md`](build/13-hallmark-replication/06b-chart-canvas-palette.md)
- [x] **V6c — Export artifact** — `lib/dspsHtml.ts`'s standalone share HTML (D63) carries resolved
  token values as literals, so an exported report matches the app it came from — **Sonnet**
  → [`06c-export-artifact.md`](build/13-hallmark-replication/06c-export-artifact.md)
- [x] **V6d — Act 0** — the welcome page's editorial composition ported from `welcome-act0.html`
  onto the HUD register (resolved 2026-07-25: composition yes, Specimen palette no) — **Sonnet**
  → [`06d-act0.md`](build/13-hallmark-replication/06d-act0.md)
- [x] **V6e — Conformance gate** — contrast measurement, slop-test gate, live-browser
  verification, residual-zero re-measurement — **Opus**
  → [`06e-conformance-gate.md`](build/13-hallmark-replication/06e-conformance-gate.md)
  *(ran 2026-07-25 and did not come back clean — 7 token values + 3 call sites corrected; the
  contrast matrix and residual census are now tests. Two follow-ups deferred, see the log.)*

### v0.70 — the workspace streamline (D73) · the shell after a dataset is loaded

Fold landed 2026-07-26 (master Revised(17): D73 + the §13.3 restructure + §19's S0–S7 table,
D71 amended, full tree mirror + new
[`build/14-workspace-streamline/`](build/14-workspace-streamline/README.md)). v0.60 built the
Workbench's structure and v0.69 its visual layer; this tier changes what the shell *is* once a
dataset is loaded — the explorer rail and the `map · workspace` tab. **Act 0/Act 1 are
explicitly out of scope**, and so is the AI pane's content.

Unlike v0.69, this **charters a decision** (D73): it deletes a shipped tab type, adds a shell
region, rewires every generated-SQL affordance in the app, and reverses three D71 positions —
the inspector's "scent, not dashboard" charter, the "one SQL playground" singleton worked
example, and the "Settings tab." **Sequenced before v1 by human instruction (2026-07-26), same
as v0.69; the Studio section's standing gate is unchanged.** Same binding constraint as §13.3's
and v0.69's: **no `src/` code for a phase starts until that phase's own leaf doc lands.** Model
column is a proposal, corrected when each phase is picked up.

- [ ] ▶ **S0 — Probe: synthesis reach + query-tab ceiling** — a D18-style throwaway, **not a
  feature**; measures the two things this tier refuses to guess at. (a) Can a widened system
  prompt reach §4's purpose narrative *inside* the ADR-010 honesty seam — measured on the v0.25
  staging endpoint and the WebLLM local rung, through the existing `eval/synthesis` harness,
  **structure-only, no row uploads** (unnecessary, not merely deferred). (b) What a query tab
  actually costs in memory, on the **M1 Air base (8 GB)** and **M4 Air** reference machines, with
  WebLLM warm and absent. Gates **S7 entirely** and **S5's ceiling number only** — **Opus**
  → [`00-synthesis-and-limits-probe.md`](build/14-workspace-streamline/00-synthesis-and-limits-probe.md)
- [ ] **S1 — Explorer rail reflow** — two-line rows (name unclamped, metadata demoted — also
  where V6e's deferred 255px row-composition finding lands), chevron column disclosure working
  for **every** table (**structure only** — rung 1 of the detail ladder, links out, no stats
  panels), Add-data `+` (closes W2's deferral, un-`NOT_YET_WIRED`s the palette's `ingestion`
  entry) — **Sonnet**
  → leaf doc not yet written
- [ ] **S2 — Data Quality & Health panel** — dataset-scoped warnings + passed checks in the
  rail's bottom region, empty-state-capable; every finding names a deterministic producer —
  **Sonnet**
- [ ] **S3 — The item-inspector drawer** — Info + console as two user-controlled views of the
  bottom region, resize/expand-to-viewport, no auto-expand on results, composed cold state,
  Monaco's lazy boundary moved to the console's first open, viewer-mode absence — **Opus**
- [ ] **S4 — Run from anywhere + the shared guarded run path** — a run action on every surface
  that displays SQL; `TransformGuardModal` moved into the one run path every runner calls
  (**data-safety, not chrome**) — **Opus**
- [ ] **S5 — Query tabs + the registry amendment** — the artifact kind's first live member with
  both producers; `'sql'` removed from the union / `TAB_TYPE_BY_MODULE` / the palette; Pivot's
  own results home; Export's entry point to the title bar; settings confirmed as the overlay;
  **tab-strip horizontal scrolling** (decided). **The ceiling number and refuse-vs-evict come
  from S0** — no leaf doc invents one — **Opus**
- [ ] **S6 — Map composition** — strip removed, Suggested Explorations (top 3 + view-more → a
  pre-run query tab), Structural ‖ Behavioral finding columns at independent heights; ranked
  actions land per the §13.3 routing table (four scopes, four existing homes) — **Sonnet**
- [ ] **S7 — AI Dataset Synthesis** — **blocked on S0's verdict.** The gate is narrower than
  first recorded: a producer *exists* (v0.25's edge + WebLLM rungs, already structure-only and
  eval-gated); what is unproven is whether a widened prompt reaches §4's purpose narrative
  **inside the ADR-010 seam**, which is built so an invented claim is unrepresentable. Falling
  back to D65 deterministic narration is a valid outcome — **Opus**

**Design gates, resolved and remaining.** **Resolved 2026-07-26 (human calls, both were
blockers):** the **detail ladder** — rail = lightest signpost linking out, drawer Info = ambient
and now also linking to the tab, tab = full depth; one escalation, not three competing answers,
and S1's rail therefore stops at structure rather than growing the ideation round's second-level
stats. And **ranked-action routing** — resolved by scope into four homes that already exist, the
substantive fix being a **run action on quality-panel findings**, which is where D68e's
`duplicates` insight lands now that the SQL page is gone (it would otherwise have had no
destination at all). **Remaining:** S5 and S6 still touch the same wiring and land together; and
S0's two measurements gate S7 and S5's ceiling.

### v1 — the Studio arc · gated on profiling proven in the wild

- [ ] **10 studio** — three phase-sized efforts, never one drop. **Gated on "profiling proven
  in the wild"** (this section's own standing gate, not a new condition) — flagging explicitly
  rather than starting silently: picking up 01 below is a judgment call for whoever does, not an
  automatic green light. The `▶` sat here from the W8 close-out until v0.69 was chartered
  2026-07-25, returned when v0.69 closed the same day, and moved away again on 2026-07-26 when
  v0.70 was chartered and sequenced ahead of this section by human instruction; the standing gate
  is unchanged by any of it.
  - [ ] 01 quality-report — Opus
  - [ ] 02 relationship-graph — Opus


### Backlog

- [ ] **ml** — unscheduled; assign a model when pulled forward
- [ ] **semantic-dbt-export** — unscheduled; assign a model when pulled forward


## Log

*The historical execution log has been archived to [BUILD-ORDER-HISTORY.md](BUILD-ORDER-HISTORY.md).*

- **2026-07-26** — **S0 Probe A's row-upload sub-question tested and closed; the formal probe
  itself still open.** New throwaway script `eval/synthesis/probe-narrative.ts` (`npm run
  eval:synthesis:narrative-probe`, D18 discipline, outside `eval:synthesis`'s gate) asks the
  `ai-router` endpoint — not the synthesis seam, whose `{headline, actions}` contract cannot emit
  free prose regardless of input — for §4's narrative two ways: structure-only, and structure plus
  every table's rows (human-authorized 2026-07-26, unbounded/full-table, synthetic §14 fixtures
  only, per D20/D45/D46/D59). **Structure alone already produces specific "well-suited for"
  recommendations — no rows needed there.** The one gap rows were meant to close — date range,
  which `StructuralFacts` deliberately omits — **got worse with rows, not better**: a byte-capped,
  chronologically-ordered row prefix produced confidently wrong ranges (weather claimed 1 of 10
  real years; stock_prices claimed 2.5 of 9.5), while structure-only stayed accurate by staying
  vague. **No case for row upload; a deterministic temporal min/max on `StructuralFacts` is the
  right fix instead.** Master §19's v0.70 subsection and `00-synthesis-and-limits-probe.md` (new
  verdict subsection under Probe A) both updated, master-first. Full evidence:
  `eval/synthesis/NARRATIVE-PROBE-RESULTS.json`.
  **S0's box stays unchecked and `▶` stays at S0** — this closes one sub-question, not Probe A's
  formal method (seam-validator-style scoring, the WebLLM local rung, hand-audited kill criteria,
  none of which ran here) and not Probe B (query-tab ceiling on the M1/M4 Air) at all.
  **Next concrete action:** run Probe A's formal method now that rows are off the table, and run
  Probe B on the two reference Macs.
  **Blocker:** none. Still uncommitted — Justin commits.

- **2026-07-26** — **Workspace-streamline fold lands (docs only, no code). New tier v0.70,
  new decision D73.** `_misc/_ideation/WORKSPACE-STREAMLINE.md` is folded master-first and
  mirrored into the tree. **What the app becomes: SQL is written in exactly one place.** The
  bottom inspector becomes a two-view drawer — `Info` (W7's content, unchanged) plus a **SQL
  console** — the standalone SQL tab is deleted, every surface that *displays* SQL gains a run
  action into that console **without navigating away from the chart or answer on screen**, and
  results worth keeping promote into **query tabs**: the artifact tab kind's first live member
  after eight W-phases with zero callers. The options strip is retired into the map's Suggested
  Explorations; the map gains finding columns; the explorer rail gains two-line rows, universal
  column disclosure, a persistent Data Quality & Health panel, and the Add-data `+` that closes
  W2's deferral.
  **Three D71 positions are reversed on the record, not quietly** — the inspector's "scent, not
  dashboard" charter (re-scoped to the Info view), the "one SQL playground" singleton *worked
  example* (the model stands, its illustration changes), and the "Settings tab" (settings stays
  the overlay the code already ships). That is why this is D73 and not more D71 execution, unlike
  v0.69.
  **Two things were deliberately not smoothed over.** `TransformGuardModal` is an
  **interception, not an affordance** — with N independent query-tab runners it must live in the
  shared run path both surfaces call, or a query tab becomes a data-loss path the single SQL page
  never had; it is the one non-optional item in the tier. And the **AI Dataset Synthesis block is
  blocked, not scheduled** (S7): the prose and its "well-suited for" recommendations have no local
  producer, and a block labelled that way may not imply a model ran when none did — §5.2's
  no-silent-egress invariant and the status bar's "nothing leaves your browser" claim both hold.
  The shape-of-data-only edge fallback (schema + aggregate stats, never rows) needs its own
  privacy review before it touches that guarantee.
  Master: Revised(17), D73 added, D71 amended, §13.3 restructured (explorer, tab registry, map
  composition, strip retirement, drawer, viewer mode, settings), §9/§10 M2/§15/§16/§22 amended,
  §19's v0.70 subsection added, Appendix C's build list corrected (12/13/14 were missing).
  Tree: new [`build/14-workspace-streamline/`](build/14-workspace-streamline/README.md) charter;
  amendment notes in `12-workbench/`'s README + five leaves, `04-sql/`'s README + four leaves,
  `03-profiling/03-capability-engine.md`, `08-persistence/03-dsps-spec.md`,
  `architecture/decisions.md`, `architecture/system-design.md`, `product/roadmap.md`,
  `meta/question-index.md`, `meta/doc-index.md`, `foundations/performance-budgets.md`.
  **No `src/` code touched, no box checked, no scope/cutline/date moved.** `▶` moves from
  `10 studio` to **S0**; Studio's standing gate ("profiling proven in the wild") is unchanged.
  Still uncommitted — Justin commits.

- **2026-07-26** — **Two v0.70 gates resolved by human call; two unknowns split out into a probe
  (S0). Docs only, no code.** **The detail ladder is settled**, which unblocks S1 and S3: the
  explorer rail, the drawer's Info view and the Profile tab are **one escalation, not three
  answers** — rail = lightest (structure only: names, key markers, type chips) and always links
  out; Info = **ambient**, filling from the selection while the user explores, and now also
  linking onward to the tab; tab = full depth. The concrete build consequence is that **S1's rail
  does not grow the ideation round's second-level per-column stats** — those are rung-2/rung-3
  content, and putting them in the rail is exactly what would have made three surfaces answer one
  question.
  **Ranked-action routing is settled by scope, without building a strip replacement:** dataset-wide
  explorations → the map's Suggested Explorations (→ pre-run query tab); dataset-wide quality
  findings carrying a query → **a run action on the finding in the Data Quality & Health panel**
  (→ the console); selection-scoped findings → the drawer's Info; legal-but-unranked → the palette
  with its disabled-with-reason copy. Four render sites, **one ranker** (D58) unchanged. The
  quality-panel row is the substantive part: D68e's `duplicates` insight opens on the exact query
  that found the rows, and with the SQL page deleted it had **no destination at all**.
  **Two questions were deliberately not answered, and are now S0** — a D18-style throwaway probe
  ([`00-synthesis-and-limits-probe.md`](build/14-workspace-streamline/00-synthesis-and-limits-probe.md)),
  because both are measurements, not design calls. **(a) Synthesis reach.** Research this session
  found the gate was mis-stated: a producer already exists — v0.25's `edge/handlers/synthesis.ts`
  and `services/webllmSynthesis.ts` both emit synthesis through the ADR-010 seam, already
  structure-only (live-audited, no rows), opt-in, stateless, kill-switched, and passing
  `eval/synthesis` at 100%/100%. What that seam **cannot** do is invent a claim absent from the
  deterministic slice, and §4's "well-suited for CLV / churn / seasonal demand" is that category —
  the harness's own ecommerce output (*"4 tables, 5,437 rows, 0% null values"*) shows the gap. S0
  measures whether a widened prompt closes it inside the seam, needs a new bounded contract, or is
  honestly out of reach (→ D65 narration, a valid outcome). **Row uploads are out of scope as
  unnecessary, not deferred** — §4's narrative is derivable from schema/counts/types/ranges, which
  the structure-only payload already carries. **(b) Query-tab ceiling**, measured on the M1 Air
  base (8 GB) and M4 Air, WebLLM warm and absent. Tab-strip horizontal scrolling is **decided** and
  ships with S5 regardless; the ceiling number and refuse-vs-evict wait for numbers, and master now
  forbids a leaf inventing one. Scaling the ceiling off the WebLLM capability probe was considered
  and **not adopted on the evidence** — that probe answers "can this device hold a 1.6 GB static
  model," which has no established relationship to a small dynamic per-tab cost; measure first.
  **New scope flagged, not started:** the Settings **model-rating pane** (several WebLLM models to
  download, each with an accuracy estimate) is recorded as item C in the probe doc. It is not
  folded into D73 — it changes **ADR-007 constraint 1** (exactly one pinned model, because that is
  the one measured to coexist with DuckDB) and runs into **constraint 4** (D40 gates any local
  accuracy number shown to a user; the existing 92% is a simple-schema floor with no cloud
  head-to-head). It needs an ADR-007 amendment and possibly a consent-shape decision; it blocks
  nothing in v0.70.
  Master: D73's row extended with both resolutions and both probe pointers; §13.3 gained the
  detail-ladder table, the ranked-action routing table, the ambient-Info clause, and the
  tab-scrolling/ceiling paragraph; §19's v0.70 subsection gained the **S0** row and its opens list
  rewritten. Tree: new probe doc; charter's open-questions section rewritten. **No `src/` code
  touched, no box checked, no scope/cutline/date moved.** `▶` at **S0**.
  **Next concrete action:** run S0 — Probe A against the staging synthesis endpoint + the local
  rung through `eval/synthesis`, Probe B on both Macs — and record verdicts in the probe doc, then
  update master's S7/S5 rows from them, master-first. **Blocker:** none. Still uncommitted —
  Justin commits.

- **2026-07-25** — **V6e lands: the conformance gate ran, and v0.69 closes.** Leaf doc written
  first per §19's binding constraint, then executed in the same session. **The gate did not come
  back clean, and the failures share one cause:** V1–V6d each evaluated their gates against a
  *representative* case rather than the worst one — a representative surface, plain text instead
  of text on its own tint, adjacent pairs instead of all pairs.
  **Contrast:** seven failures fixed. `--color-ink-3` shipped at 4.03:1 on `elev` (solved against
  `canvas` only); the light amber shipped at **3.17:1** as amber-text-on-amber-wash — the badge
  and ranked-action pattern V4/V5 had already built — and is re-solved 54.5% → 46%; light
  `--color-ok` and `--color-error` likewise; and light `--chart-4` sat ΔE **8.6** from `--chart-1`
  (**5.7** under simulated protanopia) because V6b's separation gate measured only slots adjacent
  *in assignment order*, though all four are on screen at once. **The dark register — the ported
  one — moves only on `--color-ink-3`,** so mock fidelity is intact and the four recorded
  departures still number four.
  **Slop gate (58 + six-axis critique, scored P5 H4 E4 S5 R4):** three failures — zero-chroma
  light `--color-card`, the five-copy scrim literal (now `--color-scrim`, bit-identical colour),
  and a `ResultsGrid` NULL marker dimmed to **2.9:1** by an opacity modifier no token-level gate
  can see. Three adjudicated passes recorded with reasoning rather than waved through.
  **Live-browser (Chrome, 7 viewports, both registers — the tier's first):** zero console errors;
  V6d's no-scroll-at-`lg` claim verified. Caught **every explorer table name rendering at 1px**,
  collapsed behind a `flex-1` basis and invisible to every jsdom test because the name was in the
  DOM all along. Half-fixed (`flex-auto`); the rest is a V3 row-composition job, deferred.
  **Residual-zero:** 82 → **0** unsanctioned literals against a four-file allowlist, asserted as
  set equality — which immediately rejected an entry this leaf had added on assumption.
  Contrast and the census are now tests (`src/app/conformance.test.ts`), so the next leaf to
  break them fails CI. Suite **136 files / 1385 tests** green (from 135/1334); `tsc -b` clean;
  `oxlint` clean apart from the pre-existing `_misc/spike-webllm/smoke.mjs` warning. Master
  Revised (16), `design.md` and this tier's README updated.
  **Deferred, not absorbed:** (1) the explorer row needs its own composition at 255px — one
  `TableList` row layout serves both the narrow explorer and the full-width Act 0 panel, and it
  truncates in the former; (2) `design.md` § What pages MUST share still describes a wordmark
  "accent-coloured dot" that V2 never built — flagged by V6c, V6d and now V6e, and it needs
  whoever next amends that section rather than a fourth pass-through mention.
  **Blocker:** none. **`▶` moves to `10 studio`, whose standing gate ("profiling proven in the
  wild") is unchanged** — pointer position is not permission to start.

- **2026-07-25** — **File maintenance, no build work:** the 2026-07-24→2026-07-25 log entries
  (the prior "file maintenance" entry itself, through V2's leaf-doc-authored entry — everything
  since the last archive point) moved to `BUILD-ORDER-HISTORY.md` per human instruction, keeping
  this file to the pointer line. **No checklist state changed** — `▶` stays at
  `13-hallmark-replication/V2`, no boxes checked or unchecked.
  **V2 is mid-build, paused for usage, not a stuck state.** A session built
  `TAB_GLYPH`/`stores/paletteOpen.ts`/`TitleBar.tsx` (+ tests) and retargeted `CommandPalette`
  onto the shared store against `02-shell-chrome.md`'s spec, then was told to stop before
  reaching `StatusBar`'s gear removal, `WorkbenchShell.tsx`'s mount/tab-strip/region-surface
  work, the §13.3 master-first edit, or any verification. The exact remaining steps, in
  dependency order, are written up at `/HANDOFF-V2-SHELL-CHROME.md` (repo root) — not repeated
  here. That file is safe to pick up cold, same convention as the earlier
  `/HANDOFF-W8-CUTOVER.md`/`/HANDOFF-WORKBENCH-FOLD.md`, and should be deleted once V2 lands and
  this file's own box/log are updated to match.
  **Blocker:** none — usage-limited pause, not a design or engineering blocker.

- **2026-07-25** — **V3 leaf doc lands (no code).** Per §19's binding constraint, authored
  `build/13-hallmark-replication/03-explorer-status-bar.md` before any `src/` work on V3 — mirrors
  V2's doc structure. Six scope calls made while writing it, the load-bearing one being that no
  fact/dimension/junction table-role classification exists anywhere in this codebase (checked
  `types/dataset.ts`, `DatasetMap.tsx`, `services/`), so the mock's `.trow` key-square role color
  and role badge can't be data-driven yet — the doc has the row render a neutral key square and
  repurposes the role-badge slot for the origin label the app actually has, rather than fabricating
  data (same posture V2 took toward its inert artifact-tab glyph). Also scoped: selected-row
  highlighting reads `useSelectionStore` directly (no new prop), row actions stay two buttons with
  a hover/focus-reveal treatment rather than collapsing into the mock's single overflow trigger
  (that trigger opens a per-table palette scope this codebase doesn't have), and the status bar
  keeps every real ambient item it has today instead of trimming to the mock's shorter illustrative
  list. README.md's per-phase-leaves list updated to link it. `▶` stays at V3 — its box stays
  unchecked until the code + tests land against this doc, per Update rule 1.
  **Next concrete action:** build `03-explorer-status-bar.md`'s spec — `TableList`'s `hideHeading`
  prop and `.trow` markup, `ExplorerPanel`'s new header, `StatusBar`'s container/posture-dot
  restyle — then re-run this leaf's acceptance criteria against the tree.
  **Blocker:** none.

- **2026-07-25** — **V2 — Shell chrome lands.** Picked up `/HANDOFF-V2-SHELL-CHROME.md` cold and
  finished its "still to do" list against `02-shell-chrome.md`'s spec: `StatusBar`'s gear/
  `onOpenSettings` removed, `TitleBar` mounted in `WorkbenchShell.tsx`'s `ShellGrid` above the body
  row, the tab strip restyled to the chrome/canvas voice with per-`TabType` `TAB_GLYPH` glyphs (the
  `TAB_KIND`-gated artifact/purple branch wired but inert, per spec), and the five pre-existing
  `data-region` containers moved onto their design.md-assigned surface tokens. §13.3 amended
  master-first (title bar named in the macrostructure line; the status-bar paragraph's "gear →
  Settings tab" clause moved to the new title-bar paragraph) and mirrored into this tier's
  `README.md`'s per-phase-leaves bullet. Verified: `tsc -b` clean; suite green at 133 files / 1298
  tests (up from V1's 131/1289 baseline); `oxlint` clean apart from the pre-existing unrelated
  `_misc/spike-webllm/smoke.mjs` warning. `▶` moves to V3.
  **Blocker:** none.

- **2026-07-25** — **V3 — Explorer + status bar voice lands.** Built `03-explorer-status-bar.md`'s
  spec: `TableList` rows carry the `.trow` treatment (neutral key square, mono truncating name,
  mono uppercase-styled origin badge in the role slot, `--color-elev` hover, inset-accent
  `--color-active` highlight reading `useSelectionStore().selectedTableId` directly) on both call
  sites (`ExplorerPanel`, `IngestionPanel`'s zero-datasets act); refresh/remove buttons hidden at
  rest, revealed on hover and `:focus-within`; a new `hideHeading` prop lets `ExplorerPanel` draw
  its own `.explorer__head` ("Explorer" + a live `{n} tables · {m} rows` count) instead of
  `TableList`'s own `<h2>`, which `IngestionPanel`'s call site still renders unchanged. `StatusBar`
  moved to the mono/`--text-sm` density with a haloed posture dot (`--color-ok`/`--color-active`
  per mode, `color-mix` halo) — every existing ambient item (engine, table/row count, memory,
  query timing, paused notice) kept, none trimmed to the mock's shorter illustrative list. No
  table-role classification fabricated (scope call 1 — no fact/junction data source exists
  anywhere in the codebase), no `.trow__more` overflow collapse, no theme toggle. Verified: `tsc -b`
  clean; suite green at 133 files / 1304 tests (up from V2's 133/1298 baseline); `oxlint` clean
  apart from the pre-existing unrelated `_misc/spike-webllm/smoke.mjs` warning. `▶` moves to V4.
  **Blocker:** none — V4 has no leaf doc yet; per §19's binding constraint, that doc lands before
  any V4 code.

- **2026-07-25** — **V4 leaf doc lands (no code).** Per §19's binding constraint, authored
  `build/13-hallmark-replication/04-inspector-ai-pane.md` before any `src/` work on V4 — mirrors
  V2/V3's doc structure. Ten scope calls made while writing it; the load-bearing one is that
  `--color-accent` (the legacy alias `ModeSwitches.tsx`/`AIChatModule.tsx`/`AITurnView.tsx` all
  reach for) resolves to `--color-active` — the amber HUD accent — so the AI pane renders amber
  throughout today, exactly the "amber on an AI surface... is a semantics bug" case `design.md`
  names. V1 shipped the fix's tokens (`--color-ai`/`--color-ai-2`/`--color-ai-ink`/
  `--color-ai-soft`) 2026-07-25 but nothing in `src/` consumes them yet — V4's real work is that
  swap, not new UI. Also scoped: the confidence pill stays amber-for-confident on purpose (a
  structural-inference property, not AI-authored content — the mock itself colors it amber); the
  evidence row decomposes `FkEdge`'s real `nameAgreement`/`containment`/`coverage`/
  `parentKeyUniqueness` fields (checked `relationshipInference.ts` and `Inspector.test.tsx`'s own
  fixture — all four already exist) rather than the mock's illustrative name/type/overlap/
  cardinality set, reusing the engine's own frozen thresholds instead of inventing UI cutoffs; the
  mock's `.aimode` header chip is skipped as redundant with `ModeSwitches`' already-visible active
  state (same reasoning V3 used to skip `.trow__more`); and a `✦ Copilot` per-turn label is added
  to `AITurnView` since it's the one element "the purple copilot register" names with no existing
  analog to restyle. `README.md`'s per-phase-leaves list updated to link it. `▶` stays at V4 — its
  box stays unchecked until the code + tests land against this doc, per Update rule 1.
  **Next concrete action:** build `04-inspector-ai-pane.md`'s spec —
  `EdgeEvidencePanel.tsx`'s pill/evidence-row, and the `--color-ai` swap across `AIPane.tsx`/
  `ModeSwitches.tsx`/`AIChatModule.tsx`/`AITurnView.tsx` — then re-run this leaf's acceptance
  criteria against the tree (baseline: 133 files / 1304 tests).
  **Blocker:** none.

- **2026-07-25** — **V4 — Inspector + AI pane lands.** Built `04-inspector-ai-pane.md`'s spec:
  `EdgeEvidencePanel.tsx`'s `ConfidenceBadge` restyled to a bordered pill with a solid/dashed
  line glyph (confident → `--color-active`, candidate → `--color-rule-hi`/`--color-ink-2`); new
  `EvidenceRow` decomposes the engine's real `nameAgreement`/`containment`/`coverage`/
  `parentKeyUniqueness` fields against their frozen thresholds (`CONTAINMENT_SOLID`,
  `MIN_STRUCTURE_COVERAGE`, `KEY_UNIQUENESS_MIN`) into four ✓/⚠ items, replacing the old single
  prose `edge.evidence` sentence; the ambiguity paragraph's hardcoded `text-amber-600
  dark:text-amber-400` moved to the `--color-active` token. Fixed the amber-on-an-AI-surface
  defect: every `--color-accent` reference in `ModeSwitches.tsx`, `AIChatModule.tsx`, and
  `AITurnView.tsx` moved to the `--color-ai`/`--color-ai-2`/`--color-ai-ink`/`--color-ai-soft`
  family V1 shipped but nothing consumed yet (`AttemptView`'s failure-state text stays
  `text-red-500`, the one exception). `AIPane`'s header gained a `✦` mark in `--color-ai-2` on a
  new `--color-chrome` strip; every assistant turn in `AITurnView` gained a `✦ Copilot` who-label;
  the user-turn bubble dropped its amber wash for `--color-elev`; `AttemptView`'s card gained the
  `--color-ai-soft`/purple-border audit-trail treatment with its embedded SQL `<pre>` staying
  neutral. No new AI behavior, no `.aimode` chip, no renamed copy, no new caption text — exactly
  the leaf doc's ten scope calls. Extended `Inspector.test.tsx` (four evidence items on the
  existing confident fixture + a new candidate-tier partial-evidence case) and `AITurnView.test.tsx`
  (the `✦ Copilot` label + the user bubble's dropped accent class); `ModeSwitches.test.tsx`/
  `AIPane.test.tsx` needed no changes — all their assertions select by text/role/`aria-label`/
  `aria-pressed`. Verified: `tsc -b` clean; suite green at 133 files / 1306 tests (up from V3's
  133/1304 baseline, +2 new cases); `oxlint` clean apart from the pre-existing unrelated
  `_misc/spike-webllm/smoke.mjs` warning. No file under `features/explorer`, `features/status`,
  the options strip, the palette body, `AISettingsPanel.tsx`, `WebLLMDock.tsx`, or `DatasetMap.tsx`
  touched. `▶` moves to V5.
  **Blocker:** none — V5 has no leaf doc yet; per §19's binding constraint, that doc lands before
  any V5 code.

- **2026-07-25** — **V5 — Options strip + command palette lands (doc + code, one session).**
  Authored `build/13-hallmark-replication/05-options-strip-palette.md` before touching `src/`, per
  §19's binding constraint, then built its spec against the tree in the same session (this tier's
  established doc-then-code-same-session pattern since V2). Eight scope calls; the load-bearing
  one corrects the leaf doc's own first draft: `rankNextActions` (`lib/capabilities.ts`) only ever
  emits `profile`/`sql`/`charts`/`correlation`, and W7.5 already wired all four into
  `TAB_TYPE_BY_MODULE` — so "the top-ranked action might be for an unwired module," true at W5,
  no longer happens with real data. The `ready &&` guard on the amber top-rank treatment stays in
  the code anyway (amber asserting "click this" on a disabled control would be a live semantics
  bug the day a fifth route is added or one gets un-wired) but is verified in the tests by mocking
  `isDestinationReady`, not by claiming a realistic fixture. Also scoped: the mock's subject-lead
  pill and "more in ⌘K" hint are skipped as redundant with selection state already visible
  elsewhere (map card, V3's `.trow` inset-accent) and not named in the master row; palette rows
  reuse `TAB_GLYPH` (V2) for their icon column rather than a second glyph table, with the two
  not-yet-wired rows (`ai`, `ingestion`) getting the mock's own literal glyphs (`✦`/`＋`) for
  those exact commands; no group headers or dynamic "Actions on `<table>`" context block (would be
  new data flow — a `useSelectionStore` read — not a restyle); disabled-row reasons stay
  `Tooltip`-only, not also permanent inline text; the scrim's `rgba(4,5,7,0.6)` ports the mock's
  own literal value rather than staying on `bg-black/40`. `OptionsStrip.tsx` moved to
  `--color-panel`/`--color-rule-2` chrome with the `.act`/`.act--top` button voice;
  `CommandPalette.tsx` moved to `--color-card`/`--color-rule`/`--shadow-overlay` chrome with the
  `.pcmd` row voice. Extended `OptionsStrip.test.tsx` (two cases: the first-rendered button always
  carries `▲ top`; forcing `isDestinationReady` to `false` proves no button ever does) and
  `CommandPalette.test.tsx` (one case: a wired-module row renders an SVG icon, `ai`/`ingestion`
  render their literal glyphs). Verified: `tsc -b` clean; suite green at 133 files / 1309 tests (up
  from V4's 133/1306 baseline, +3 new cases); `oxlint` clean apart from the pre-existing unrelated
  `_misc/spike-webllm/smoke.mjs` warning; `graphify update .` run. `▶` moves to V6.
  **Blocker:** none.

- **2026-07-25** — **V6 split into five leaves (V6a–V6e); two flagged questions resolved by human
  call. No code yet.** Research before writing V6's leaf doc found the charter's "tokenize the
  residual hardcoded palette colours" understates three different problems wearing one number.
  The 82 occurrences (22 files, re-measured — the charter said 20) break down as: **~60 error and
  warning feedback blocks plus modal scrims that have no token to move to**, because V1 shipped
  `--color-ok` but never an error or warn register — so a `design.md` amendment has to land before
  any sweep can start, which is exactly the procedure the drift policy and the hallmark skill's
  own locked-token gate prescribe; **`ColumnCard`'s semantic-type legend**, which spends purple on
  "Categorical" and amber on "Textual" and so collides head-on with the locked rule that purple =
  copilot/FK and amber = active/PK, *never interchangeable*; **chart series palettes and canvas
  fills**, where the current `['#6366f1','#f59e0b','#10b981','#ef4444',…]` array puts a
  byte-identical copy of `--color-active`'s amber next to a status red, and where canvas 2D
  contexts can't read `var()` at all; and **`lib/dspsHtml.ts`'s exported share HTML**, which
  cannot reference the app's custom properties under any circumstance because the file leaves the
  app. Only the first group is a sweep — the others each needed a decision first.
  **Two decisions taken (human, not defaulted).** *Act 0's register* — the question master §19 and
  `design.md` both flagged as wanting a human call: resolved as **composition ports, register does
  not**. Act 0 keeps the HUD register and gains the mock's editorial structure (display headline,
  vertical rhythm, grid mark, dropzone/URL/samples arrangement); the Specimen palette, Fraunces and
  the cool-violet accent stay unported, so no light→dark seam is introduced at ingest and no second
  font ships. *Sweep scope* — resolved as **everything, export HTML included**, so V6c inlines
  resolved token values into the standalone D63 artifact rather than excluding it. The type-badge
  collision resolves to the HUD's own mono voice ("on theme with the workbench"), which lands in
  V6a. Master §19's phase table, heading, Act 0 paragraph and Revised(15) clause all amended
  master-first; mirrored into `design.md` § Variants and this tier's `README.md` (table, per-phase
  leaves list, and a new note recording why 82 is not one problem).
  **Model column corrected per Update rule 5:** the original single V6 row was **Opus**; the split
  keeps Opus where judgment actually lives (V6a's token design, V6b's palette validation, V6e's
  final gate) and drops **V6c/V6d to Sonnet**, which are a mechanical literal-inlining pass and a
  composition port against an existing mock respectively — neither carries a design call once V6a
  has landed the tokens.
  **Next concrete action:** write `06a-status-register.md` — V6a's own leaf doc — then build it;
  the binding constraint applies per leaf, so each of V6a–V6e still lands its doc before its code.
  **Blocker:** none.

- **2026-07-25** — **V6a — Status register + chrome sweep lands (doc + code, one session).** The
  design system now has a real status family. `--color-warn` is a **port**: all five signed-off
  mocks style their warning glyph `.ev__i--warn { color: var(--c-active) }`, so warn resolves to
  the same amber as `--color-active` and `design.md`'s amber register is widened, on the record,
  from "active / selected / primary key" to include warning. `--color-error` is **derived** — no
  mock has an error state anywhere, so it becomes the tier's *third* recorded departure alongside
  `--c-fg-3` and the light register, and it was solved rather than eyeballed: an oklch→sRGB
  conversion plus WCAG contrast computed with the dataviz skill's own exported `contrast()`
  against the real four-surface ladder gives `oklch(68% 0.2 25)` dark / `oklch(52% 0.21 25)`
  light, clearing **5.49:1** and **5.26:1** against `--color-elev`, their worst surface, and
  ≥4.5:1 on canvas/panel/card/elev in both registers. Every error, warning and success surface in
  the app chrome plus all four modal scrims now render on those tokens; the manual `dark:` pairs
  collapsed to single utilities, since the tokens already flip by `prefers-color-scheme`.
  `ColumnCard`'s semantic-type legend dropped hue entirely per the human call ("keep it on theme
  with the workbench") — it had been spending purple on `Categorical` and amber on `Textual`,
  making a profiling badge indistinguishable from an AI marker or a selection; the badges are now
  mono micro-caps matching V3's explorer role badge, with the type name carrying the encoding it
  always really carried. `Tooltip` left pure black-on-white for the surface ladder. **Residual
  hardcoded palette utilities outside the V6b/V6c exclusion sets: zero**, by the same grep that
  produced the original 82.
  **A pre-existing V1 defect was found and deliberately NOT fixed here.** The same computation,
  run against V1's shipped tokens as a method sanity-check, measured `--color-ok` light at
  **4.46:1** and `--color-active` light at **4.40:1** against `--color-elev` — both under AA for
  normal text. `design.md` claims the light register was re-solved for ≥4.5:1, which holds against
  canvas (5.05 / 4.99) but was never checked against the hover/selected surface those colours also
  land on. Re-solving two shipped accent tokens inside a sweep leaf would be exactly the scope
  creep this tier keeps refusing, so it is recorded here and in V6a's leaf as a **known input to
  V6e**, the contrast gate. `--color-warn` inherits the same shortfall by aliasing
  `--color-active`; one fix closes both.
  Verified: `tsc -b` clean; suite green at 133 files / 1310 tests (up from V5's 133/1309, +1 new
  case asserting no type badge carries a hue class so the collision can't silently return);
  `oxlint` clean apart from the pre-existing unrelated `_misc/spike-webllm/smoke.mjs` warning.
  `viewspec-guard` run before touching `ViewSpecRenderer.tsx` — all five D55 invariants HOLD, the
  change being a `className` string on its existing `!valid` early-return. Master §19's
  "Two recorded departures" corrected to three master-first and mirrored into `design.md` and this
  tier's `README.md`. No file in the V6b (chart/canvas palettes), V6c (`dspsHtml.ts`) or V6d
  (`WorkbenchShell.tsx`'s `Welcome`) sets touched. `▶` moves to V6b.
  **Blocker:** none — V6b has no leaf doc yet; per §19's binding constraint, that doc lands before
  any V6b code.

- **2026-07-25** — **V6b — Chart + canvas palette lands (doc + code, one session).** Authored
  `build/13-hallmark-replication/06b-chart-canvas-palette.md` before touching `src/`, per §19's
  binding constraint, then built its spec in the same session — this tier's pattern since V2.
  Charts in this app no longer spend the HUD's reserved registers on data. Two separate defects
  were behind the charter's one line: **every single-series data mark rendered `--color-accent`**
  (the module histogram, the profile card's sparkline and top-values bars, the box plot's
  box/median, and the seasonality heatmap's whole intensity ramp), so a bar chart was drawn in the
  same colour as "this row is selected"; and **the multi-series arrays were eyeballed with four of
  five slots impersonating a reserved register** — `['#6366f1','#f59e0b','#10b981','#ef4444',
  '#a855f7']` carried byte-identical copies of `--color-active`'s amber, `--color-ok`'s green, a
  status red and the copilot purple, cycled with `% length` and never validated for colourblind
  separation.
  **The palette is solved and measured, not picked.** Search over every OKLCH step in each
  register's band at maximum in-gamut chroma, gated on ≥12 ΔE from all four reserved accents, ≥3:1
  contrast against **all three** surfaces a chart lands on (canvas/card/elev), and the dataviz
  skill's own six checks run through its `validate_palette.js` (Machado–Oliveira–Fernandes CVD
  simulation at severity 1.0). Result: azure / magenta / lime / indigo, worst adjacent CVD ΔE
  **15.6** dark / **19.2** light against a target of 8, normal-vision floor 31.4 in both against a
  hard floor of 15, worst contrast 3.03:1 / 3.08:1. **Four slots is a measured ceiling, not a
  preference** — `--color-error` (hue 25), `--color-active` (70), `--color-ok` (163) and
  `--color-ai` (304) reserve four hue families outright; a fifth slot (teal) was solved for and
  **rejected on measurement**, because its only light-register steps clearing 3:1 on white sit ΔE
  7–10 from `--color-ok`, which would have let a series impersonate the "good" status colour.
  That rejection is written into the leaf so V6e doesn't re-attempt it.
  Slots are assigned in fixed order with the modulo deleted — cycling is unreachable today
  (`chartMapper.ts`'s `MAX_Y_SERIES` is 3) but it was a latent slop generator, and past the fourth
  series the palette is now exhausted onto the neutral rather than recycled. The donut's cap moved
  from 8 wedges to 5 (four categories + `Other`), pinned to the palette by a test. The seasonality
  heatmap became a real sequential ramp — `color-mix` toward the *surface* token, which is what
  makes one expression ramp up in lightness on dark and down on light. The correlation scale kept
  its direction but lost both its white midpoint (a bright hole in a dark instrument) and its
  status-red pole, becoming azure → neutral → magenta. `CanvasScatter`'s baked
  `rgba(99,102,241,0.35)` split into a token read and `ctx.globalAlpha`, and its two stale fallback
  greys (colours belonging to no register) went with it.
  **`src/lib/chartPalette.ts` is new, and it exists under protest.** Canvas 2D cannot resolve
  custom properties and the diverging scale needs numeric colour maths, so the resolved literals
  have to live somewhere in TS — which is a second source of truth the drift policy would
  otherwise forbid. `chartPalette.test.ts` is the mechanism that makes it legal: it parses
  `theme.css`, converts each `--chart-*` oklch declaration to sRGB, and fails if any literal has
  drifted from its token.
  Deliberately left amber: hover/selected cell outlines, chart-type tab underlines, the
  `GeneratedSql` links, the profile card's selected ring, and `JoinGraph`'s confident-edge colour
  — the last on the same reasoning V4 used for the confidence pill, that a structural-inference
  property is a *state*, not a data series. Master §19's "Three recorded departures" corrected to
  **four** master-first (the chart palette is derived — no mock contains a chart) and mirrored into
  `design.md` (a new § Chart palette) and this tier's `README.md`. Verified: `tsc -b` clean; suite
  green at 134 files / 1317 tests (up from V6a's 133/1310 — one new file, +7 cases); `oxlint` clean
  apart from the pre-existing unrelated `_misc/spike-webllm/smoke.mjs` warning; zero `#rrggbb`
  literals remain anywhere under `src/features/charts/` or `src/components/charts/`;
  `graphify update .` run. No file in the V6c (`dspsHtml.ts`) or V6d (`WorkbenchShell.tsx`'s
  `Welcome`) sets touched. `▶` moves to V6c.
  **Blocker:** none — V6c has no leaf doc yet; per §19's binding constraint, that doc lands before
  any V6c code.

- **2026-07-25** — **V6c — Export artifact lands (doc + code, one session).** Authored
  `06c-export-artifact.md` first, per §19's binding constraint, then built it. **A shared DSPS
  report now looks like the app that produced it.** `lib/dspsHtml.ts` is the one surface the token
  layer cannot reach — it builds a string that leaves the app, so `var(--color-canvas)` resolves to
  nothing wherever a recipient opens it, and it had kept a stylesheet of its own: `#fff` paper,
  `#1a1a1a` ink, `-apple-system` type, eight hardcoded hexes in the single artifact this product
  hands to another person. It now emits the design system's own token declarations in its `<style>`
  block and reads `var()` like every other surface.
  **New `src/lib/exportTheme.ts` mirrors the token subset the report uses**, in both registers, with
  the same anti-drift contract V6b's `chartPalette.ts` carries — and a stricter gate, because both
  sides are CSS strings: `exportTheme.test.ts` compares them by **string equality**, per token per
  register, no conversion and no tolerance. Verified the gate fails on a deliberately mutated value
  before trusting it.
  **The artifact follows its reader's register, not its author's session.** It mirrors theme.css's
  own structure — dark on `:root`, light in a `prefers-color-scheme` query — so it behaves exactly
  as the app does, with no script. A third `@media print` block re-declares the light register and
  sits last so it wins: a dark report otherwise either lays down a full-bleed black slab or, once
  the browser's economy mode strips the background, prints 96.6%-lightness ink onto white paper.
  Confirmed in a real browser — body resolves to canvas-dark, canvas-light and canvas-light under
  `prefers-color-scheme: dark` / `light` / `media: print` respectively.
  **One departure, and it is from `design.md` rather than from the mocks — so the tier's recorded
  count stays at four.** The app self-hosts Geist + JetBrains Mono; a file that has left the app
  cannot reach them, and embedding the latin subsets costs ~93 KB base64 against a report of ~6 KB,
  defeating D63's premise. The export takes this system's own fallback tails (`--font-sans` /
  `--font-mono` minus their leading self-hosted family) and honours mono-as-working-face with
  whatever mono the reader has; the test asserts that tail relationship, so the departure is
  enforced rather than described. Recorded in `design.md` § Exports.
  Amber is spent exactly twice — the shipped `Data`/`Scope` wordmark and the D26 attribution link —
  and the `.micro` device carries every column header. Two other genericisms went with the hexes:
  the default `disc` list marker (now `◆` from § Iconography's dingbat set) and the `-apple-system`
  stack. **Content is byte-for-byte unchanged**: all seven pre-existing `dspsHtml.test.ts` cases
  pass **unmodified**, which is the guard that this was a re-voicing and not a redesign.
  **No master edit:** §19's V6c row already described this work, the departure count did not move,
  and no decision changed — nothing to land master-first. Noted but deliberately not fixed here:
  `design.md` § What pages MUST share describes the wordmark as carrying "the accent-coloured dot,"
  which is not what V2 shipped (`TitleBar.tsx` splits the word, `Data` ink / `Scope` amber). The
  export matches the shipped treatment; correcting that sentence is V2's or V6e's business.
  Verified: `tsc -b` clean; suite green at 135 files / 1327 tests (up from 134/1317 — one new file,
  +10 cases); `vite build` clean; `oxlint` clean apart from the pre-existing unrelated
  `_misc/spike-webllm/smoke.mjs` warning; zero hex literals remain in `src/lib/dspsHtml.ts`;
  `graphify update .` run. No file in the V6d (`WorkbenchShell.tsx`'s `Welcome`) set touched.
  `▶` moves to V6d.
  **Next concrete action:** V6d — write `06d-act0.md` first (binding constraint), then port
  `welcome-act0.html`'s editorial composition onto the HUD register per the resolved call
  (composition yes, Specimen palette no).
  **Blocker:** none. Still uncommitted — Justin commits.

- **2026-07-25** — **V6d — Act 0 lands (doc + code, one session).** Authored `06d-act0.md` first,
  per §19's binding constraint, then built it. **The screen a user meets before the instrument
  exists now looks like the instrument.** What shipped until today was the placeholder W6 wrote
  deliberately and labelled in place — a centred `max-w-2xl` stack with one `h1`, one sentence, and
  `<IngestionPanel />`, under the comment *"the signed-off hallmark mock is content/copy reference
  only."* That comment is retired for this surface: `welcome-act0.html`'s editorial composition is
  now ported for real — masthead (privacy line, hairline grid mark, `Data`/`Scope` wordmark, double
  rule), three numbered sections with mono eyebrows, display-scale headline, the drop / URL /
  samples arrangement, and the footer band — rendered entirely in the HUD register per the
  2026-07-25 human call (composition yes, Specimen palette no).
  **Built where the content already lives.** `IngestionPanel` has had exactly one mount since the
  W8 cutover (`Welcome`), so its layout *is* Act 0's layout; the mock's `.ingest` grid was built in
  place rather than in a second welcome component that would have duplicated six `useState` hooks
  and five async callbacks or threaded them all back through props. `Welcome` supplies the frame
  around it.
  **The mock's closing copy was rewritten, because it describes an app this one deliberately is
  not.** It promises *"we'll ask exactly one thing — how you'd like to work"*; §13.3/§5.1 ship **no
  forced gate** and W6 built exactly that. The section keeps its slot and rhythm; its copy became
  what actually ships (AI off by default, everything before it local). Same posture V3 took when it
  repurposed the role-badge slot rather than fabricating data. A test asserts the mock's promise
  appears nowhere in `src/`.
  **No token was added — two dead ones went live.** `--text-display-s` and `--color-footer` were
  declared by V1 in both registers and referenced nowhere in `src/`; they are the headline step and
  the footer band this page needed. The mock's own `--text-display` (2.75–5.25rem) is >3× the app's
  largest step and § Typography forbids inflating the scale, so the editorial quality comes from
  rhythm, measure and the mono eyebrows instead. The mock's staggered entrance reveal is **not
  ported** — § Motion is one line on it ("Reveal pattern: none") and honouring the letter (it fires
  on load, not scroll) while breaking the intent is the drift § Drift policy exists to stop.
  Also dropped: the dropzone's 32px centred cloud icon, which is the enrichment § Per-page
  allowances bans on app pages. No amber-filled button anywhere — the fill is reserved for
  `.btn-primary` and the options strip's ranked top action, so `Fetch` took the HUD secondary voice
  V2/V5 established; amber on this page is the wordmark's second half, two of the grid mark's nine
  cells, the drag-active border and the samples' hover hairline. All five real `SAMPLE_MANIFEST`
  entries ship as the mock's typographic rows, not its three fictional ones.
  **No behaviour changed**: not one handler, state field, ingest path, `accept` list or aria-label.
  The guard is that all 89 pre-existing ingestion tests pass **unmodified**. The status surfaces Act
  0 mounts (telemetry, the V6a error/warn blocks, toast, rejection modal, `TableList`) were
  re-slotted, never re-styled. Act 1 inherits the composition unchanged, per W6's own reasoning.
  **No doc amendment:** `design.md` § Variants, master §19's V6d row and its "Act 0's register"
  paragraph already recorded this resolution on 2026-07-25, ahead of the build — no decision moved,
  no departure was added (still four), no token was introduced, so there was nothing to land
  master-first. `design.md`'s stale "accent-coloured dot" wordmark sentence is still noted and still
  not fixed here, same call V6c made — it stays V6e's business.
  Verified: `tsc -b` clean; suite green at 135 files / 1331 tests (up from 135/1327 — +4 cases, no
  new file); `vite build` clean; `oxlint` clean apart from the pre-existing unrelated
  `_misc/spike-webllm/smoke.mjs` warning; zero hex literals and zero named CSS colours in the five
  touched components; `graphify update .` run. `▶` moves to V6e.
  **Next concrete action:** V6e — the conformance gate. Write `06e-*.md` first (binding constraint),
  then run it: contrast measurement across the tier, the slop-test gate, live-browser verification,
  and residual-zero re-measurement of the 82 hardcoded palette colours V6 started from. It is also
  where `design.md`'s "accent-coloured dot" sentence gets reconciled with what V2 shipped.
  **Blocker:** none. Still uncommitted — Justin commits.
