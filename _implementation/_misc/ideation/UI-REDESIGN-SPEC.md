# UI Redesign Spec — the DataScope Workbench

**Status: design-spec draft for iteration — not yet a decision.** Drafted 2026-07-24 from
design conversations (2026-07-22 → 24), replacing the scrapped `UI-REDESIGN-CONCEPT.md`.
This document is the working surface for product-design iteration (`/hallmark`, wireframing,
copy passes) **before** the formal pass: when adopted, it goes design-reviewer → triage →
synthesizer, master-first into DATASCOPE.md as its own decision(s). Nothing here edits the
settled Decision Record; §9 lists exactly which D-numbers an adoption would touch.

**Companion doc:** `UI-REDESIGN-PLAN.md` (same directory) is the *how and in what order* —
it takes explicit stances on every §9 open decision (its §5) as inputs to triage, not
decisions, and expands §11's adoption path into concrete phases (W0–W8). Read both before
the formal pass runs.

**Provenance of the inventory:** a full sweep of the codebase on 2026-07-24 — all 214
tracked non-test source files plus the ~30 untracked files of the in-flight
connectivity/persistence wave, headers read for every file, full reads for every shell/nav
surface. §6 is the guarantee that the redesign re-homes **every coded feature**; §8 is the
drift found along the way.

---

## 1. Thesis

The drop/choose-dataset opening is good. Everything after it is overwhelming: too much
text, too many questions, too much on screen at once. This is a **feature-density and
journey-curation problem**; the layout is the vehicle for fixing it.

The fix is a VS Code-shaped workspace — not because VS Code is fashionable, but because its
mental model maps one-to-one onto what DataScope already is:

| VS Code | DataScope |
| :--- | :--- |
| File explorer | Ingested tables & schema |
| Editor tabs | Analysis outputs — profile, query results, charts, the map |
| Copilot Chat (secondary sidebar) | AI chat — optional; the deterministic path never depends on it |
| Panel (bottom) | Inspector — metadata/scent for whatever is selected |
| Command palette | The escape hatch that makes curation non-imprisoning |
| Welcome tab | The dataset map — the thing that's already open when the shell appears |

Three principles carried over from the original concept note, still load-bearing:

1. **AI outputs are visual/structural artifacts, not text-only.** The AI opens a tab and
   drops its output there when the answer isn't words — by **generating specs, never
   artifacts** (`ChartSpec` through the existing translator, ViewSpec through the D55
   renderer that never executes model output).
2. **Nothing built gets thrown away.** Every deterministic module is re-homed, not rebuilt
   (§6 is the proof).
3. **Privacy and weight are unchanged.** Data stays in DuckDB-Wasm; the AI sees the same
   pruned structural facts it already does (D37/D58); a rewire of where things render
   touches zero privacy surface.

## 2. The journey — five acts

The shell is a **pure function of session state**. No animation orchestration: panes exist
when their preconditions exist. This is what makes the choreography testable and lets a
share link (`?share=`) or a dropped `.dsps` land directly in the correct assembled state.

### Act 0 — Welcome (no dataset)
An editorial, branded page. **Zero toggles, zero questions.** Its jobs, in order: say what
DataScope is, make the privacy story land ("runs entirely in your browser — nothing leaves
your machine" is the differentiator and belongs in the editorial copy, not a tooltip), and
invite the drop. Every current ingestion entry point is reachable here: drag-drop (file /
multi-file / folder / ZIP), URL fetch, bundled samples. The consumer landing pages
(`/spotify`, `/google-takeout`, D30) and the intent pages (§24.1) funnel into this act.

### Act 1 — Upload
The existing ingestion machinery runs unchanged (format policy, size tiers, headroom check,
aggregate budgeting, telemetry). Progress is honest phase labels, as today.

### Act 2 — One question: "How do you want to work?"
Asked **once, after first ingest** — a workflow question, not an AI-plumbing question.
The current first-run surface is an AI-mode modal that blocks everyone at app open
(`App.tsx` renders `AIModeChooser` whenever `aiMode === null`). Reframed:

- The question offers ways of working (e.g. *explore it myself* / *with an AI copilot*) —
  labels are a design-iteration item; they must describe workflow, never skill level.
- Choosing the AI path surfaces the existing three-mode consent (D2's substance — no silent
  default, no inference before an explicit choice — is **preserved**: the consent still
  happens before the first AI call; it just stops taxing people who never wanted AI).
- Choosing the non-AI path means never seeing an AI dialog. AI remains reachable later
  (palette, settings) — reaching it triggers the same consent then.

This changes D2's *timing*, not its substance — an explicit Decision-Record touch (§9).

### Act 3 — The shell assembles
Dataset ingested → left explorer + middle canvas appear. AI path chosen → right pane
appears. The bottom inspector appears with the shell (empty until a selection exists).

### Act 4 — The map
The middle canvas opens on the **dataset map** — the one tab already open (VS Code's
welcome-tab move). The map is adaptive:

- **≥ 2 tables:** the ERD — entity cards with PK/FK-marked field rows, inferred FK edges
  with confidence styling (solid = name-agreeing, dashed = structure-only, per D24), edge
  labels, overrides reachable. Data comes from the **existing** inference pipeline
  (`lib/relationshipInference.ts` → `services/relationships.ts`); this is a re-skin of the
  Join Graph module, not new analysis. Aesthetic reference: the SqlErd portfolio component
  (§10).
- **1 table:** the Blueprint face — the Dossier's Verdict/identity band takes the slot.
  The Blueprint is not superseded; it is **the single-table face of the same map**, and the
  hero of the multi-table map's side panel when a table is selected.

Above the map, the **options strip**: the curated feature buttons (Profile, SQL, Charts,
Pivot, Correlation, …), capability-gated exactly as the sidebar cards are today, **ordered
by the existing Action Broker** (`rankNextActions`, D68a) so curation is computed, not
hardcoded. The map is the **selection surface** that gives the strip its object: select a
table on the map, then *Profile* knows what it profiles. Ranked actions keep their D68e
behavior — they open a tab **on the answer**, pre-filled via the existing `ThreadConfig`
prefill contract.

## 3. The shell — pane by pane

| Pane | Contents | Today's ancestor |
| :--- | :--- | :--- |
| **Left — Explorer** | Ingested tables (and derived tables, badged), expandable to columns with semantic-type icons; per-table actions (profile, refresh-from-source, remove); an *Add data* affordance (drop / URL / samples); share-links list entry | `TableList`, sidebar DATA group |
| **Middle — Canvas** | Options strip + tab strip + the active tab; map tab always openable, open by default post-ingest | `activeModule` switch in `App.tsx` |
| **Right — AI chat** (optional) | The existing chat with its full per-turn audit trail; collapsible; absent entirely in the non-AI workflow until invited | `AIChatModule` as a nav destination |
| **Bottom — Inspector** | Scent for the current selection: table → name, rows, memory, column list, quick stats; column → profile scent + re-classify (planned); map edge → the evidence panel (D24) | `EdgeEvidencePanel`, parts of `StatusConsole`/`TelemetryPanel` |
| **Status bar** | Dataset aggregates, worker status, query stats, WebLLM state (dock condenses to a status-bar item with a flyout), AI-mode indicator | `StatusConsole`, `WebLLMDock` |
| **Command palette** | Every destination and action, one keystroke away — the answer to "curation trades flexibility for clarity"; also the home for rare actions that shouldn't cost chrome | — (new) |

**Inspector discipline:** it is a *scent* surface with click-through to a full tab. The
moment it grows its own charts it becomes a second profiling surface competing with the tab
it advertises. Hold this line.

**Chrome we explicitly refuse** (VS Code's overwhelm, not its idiom): activity bar, split
editors, resizable-everything, a settings *editor*, bottom-panel tab zoo. Three panes +
tabs + palette + status bar is the complete subset. VS Code itself has no beginner mode —
it has a welcome surface, sane defaults, and a palette; that's the disclosure model here
too. **No Guided/Workbench mode switch unless the guided surface proves insufficient** (§9).

## 4. The tab model

The genuinely new contract. Everything else is a re-homing; this needs design care.

- **A tab is a spec.** Tab state must be serializable — the D55 ViewSpec discipline
  generalized to the whole canvas. `ViewSpecRenderer` (deterministic registry, never
  executes model output) is the seed and the security precedent.
- **Identity:** workspace tabs (SQL, Pivot, a chart module, a table's Profile) are
  **singletons per subject** — one SQL tab, one Profile tab per table. **Artifact tabs**
  (a pinned query result, an AI-produced chart/view, a report) are **per-artifact** — this
  is what "the AI opens a tab and drops its output there" requires, and what lets users
  iterate on an artifact and export it.
- **Preservation:** switching tabs must not visibly reset a tab. Modules whose state
  already lives in stores (SQL via `stores/query`) survive remount today; modules holding
  component-local state (chart module selections, pivot builder wells) need their state
  lifted into their tab-instance spec. Implementation may keep-mounted or
  restore-from-spec per tab type — the *visible* contract is "as you left it." Memory
  ceiling (many mounted grids/charts) decides which, per tab type.
- **The `ui` store's `activeModule/activeTabId/pendingPrefill` triple** is replaced by a
  tab-instance list + active-tab id; `pendingPrefill` becomes the initializer field of a
  new tab-instance spec (same D68e semantics, no one-shot self-clearing dance).

## 5. What we borrow from VS Code, precisely

**Borrow:** explorer/editor/panel/secondary-sidebar layout grammar; welcome-tab-as-map;
tabs with pinning; the command palette; the status bar as the home of ambient state
(worker, model download, mode); keyboard-first affordances; "open editors are cheap,
closing is free" spirit.

**Refuse:** activity bar; split/drag editor groups; extensions surface; settings-as-editor;
notification toasts stack (we keep the single `SummaryToast` / error-banner discipline);
any beginner/advanced fork.

## 6. Feature inventory — every coded feature, mapped

Method: sweep of 2026-07-24 (all tracked non-test files + the untracked wave). Each row
carries its files; nothing user-facing is omitted. **"Kept" means kept — this redesign
deletes no capability.**

### 6.1 Ingestion & welcome

| Feature | Files | New home |
| :--- | :--- | :--- |
| Drag-drop: file / multi / folder / ZIP (§7.5, D30) | `DropZone`, `folderTraversal`, `zip`, `IngestionPanel` | Act 0 welcome (primary); explorer *Add data* + whole-window drop target thereafter |
| Format policy + rejection / large-file refusal | `formatPolicy`, `FormatRejectionModal` | Unchanged modals over both surfaces |
| Size/memory guards | `aggregateSize`, `memoryHeadroom`, `tabMemory` | Unchanged logic; surfaced in inspector + status bar |
| Bundled samples (§14) | `samples`, `SamplePicker` | Welcome act; palette |
| URL / API ingestion Tier 1 + Tier 2 relay (§7.4) | `UrlInputForm`, `apiIngestion`, `relayClient` | Welcome act + explorer *Add data*; relay/pagination telemetry → bottom inspector |
| Refresh-from-source (07-connectivity/03) | in `services/ingestion` path | Per-table explorer action |
| Ingestion telemetry (honest phase labels) | `TelemetryPanel`, `SummaryToast`, `summarize` | Status bar progress + one toast; detail in inspector |
| Table registry list | `TableList` | **Becomes the left explorer** |
| Post-ingest landing decision (D68d/D70) | `landing.ts` | Superseded by Act 3/4 assembly (`skipToData` fate: §9) |

### 6.2 The map (Blueprint + Join Graph, merged)

| Feature | Files | New home |
| :--- | :--- | :--- |
| Dossier/Blueprint: Verdict, identity band, quality headline, table strip, time coverage, top insights, hero grid/graph, tiers + disclosure (D48/D68/D69) | `DossierModule`, `DatasetDossier`, `IdentityBand`, `Verdict`, `QualityHeadline`, `TableStrip`, `TimeCoverage`, `TopInsights`, `HeroTableGrid`, `HeroJoinGraph`, `layers`, `lib/dossier`, `services/dossier` | Single-table map face; selected-table panel on the multi-table map; Verdict's ranked actions order the options strip |
| ViewSpec contract + deterministic renderer (D55) | `ViewSpecRenderer`, `lib/viewspec`, `types/viewspec` | Generalizes into the tab-spec contract (§4) |
| Synthesis upgrade badge (D56, edge-warm → WebLLM) | `useSynthesisUpgrade`, `services/synthesis`, `webllmSynthesis` | Same async upgrade, rendered on the map face |
| FK inference + confidence + overrides (D24) | `relationshipInference`, `services/relationships`, `stores/relationships`, `JoinGraphModule`, `JoinGraph`, `EdgeEvidencePanel`, `featureFlags` | **The multi-table map itself**; evidence/overrides via inspector; `JOIN_GRAPH_ENABLED=false` degrades the map to Blueprint-face-only (kill-path preserved) |

### 6.3 Analysis tabs

| Feature | Files | New home |
| :--- | :--- | :--- |
| Per-table profile: column cards, sparkline histograms, supplemental stats | `ProfileModule`, `ProfileDashboard`, `ColumnCard`, `columnStats`, `services/profiling`, `lib/profile` | Profile tab (singleton per table) |
| Insight feed (D10, rule-based, open-as-chart) | `InsightFeed`, `lib/insights`, `services/insights` | Section of the Profile tab + map top-insights; open-as-chart spawns artifact tabs |
| Classification + capability gating | `classifier`, `capabilities`, `useCapabilities`, `useSchemaClassifier`, `types/schema` | Unchanged engine; gates strip buttons exactly as it gates sidebar cards today |
| SQL playground: Monaco (lazy), completions, suggestions, windowed grid, auto-chart, CSV/XLSX export | `SqlModule`, `MonacoWrapper`, `completionProvider`, `QuerySuggestions`, `querySuggester`, `ResultsGrid`, `QueryResultsPanel`, `AutoChartPanel`, `cellFormat`, `resultsExport`, `xlsxWriter`, `stores/query`, `services/sql` | SQL tab (singleton); results pinnable into artifact tabs |
| Transform layer: CREATE TABLE AS, mutation guard, undo, recipe (§12.1, D53) | `transforms`, `TransformGuardModal`, `statementClass`, `recipeExport` | Unchanged; derived tables appear badged in explorer |
| Pivot / cross-tab (D53) | `PivotModule`, `PivotBuilder`, `pivotCompiler` | Pivot tab |
| Time-series (trend / period comparison / seasonality) | `TimeSeriesModule`, `TrendView`, `PeriodComparisonView`, `SeasonalityHeatmap`, `timeSeriesSql` | Chart tab |
| Distribution (histogram / box plot / moments) | `DistributionModule`, `Histogram`, `BoxPlot`, `StatsPanel`, `distributionSql` | Chart tab |
| Categorical (frequency / donut / grouped) | `CategoricalModule`, `FrequencyBar`, `Donut`, `GroupedBarView`, `categoricalSql` | Chart tab |
| Correlation (heatmap + canvas scatter drill-through) | `CorrelationModule`, `CorrelationHeatmap`, `CanvasScatter`, `ScatterDrillThrough`, `correlationColor`, `correlationSql` | Chart tab |
| "SQL shown alongside the chart" honesty panels | each module's `GeneratedSql` | Kept per tab — the auditability rule survives the re-skin |
| SQL→Chart translator + shared renderers | `chartMapper`, `services/charts`, `ChartRenderer`, `KpiCard`, `types/chart` | Unchanged; also the AI's artifact-tab spec target |

### 6.4 AI

| Feature | Files | New home |
| :--- | :--- | :--- |
| Chat + full per-turn audit trail (§11.1 trust model) | `AIChatModule`, `AITurnView`, `aiStatusUtils`, `stores/aiSession` | Right pane; audit trail non-negotiable |
| Six-stage NL→SQL pipeline + providers (API/WebLLM/Ollama-by-URL) + overflow routing | `services/ai`, `aiProvider`, `cloudProvider`, `ollamaProvider`, `webllmProvider`, `inputNormalizer`, `schemaPrune`, `sqlLint`, `types/ai` | Unchanged engine |
| Mode chooser (D2) + settings (BYOK auto-detect field, D3 routing, metadata-only repair, disclosure) | `AIModeChooser`, `AISettingsPanel`, `stores/settings`, `stores/byokKey` | Chooser retimed to Act 2's AI branch; settings via palette/gear |
| "Remember my key" vault | `vaultClient`, `stores/vault` | Unchanged, in settings |
| WebLLM consent, download, warm state | `WebLLMDock`, `services/webllm`, `stores/webllm`, `workers/webllm.worker` | Status-bar item + flyout |
| "Copy for AI" (D31) | `aiContext`, `structuralFacts` | Share/export actions + palette |
| AI opens artifact tabs (spec-filling only) | producer seams: `types/producers`, `producerValidators` | The §4 artifact-tab contract; validators remain the honesty boundary |

### 6.5 Output, sharing, DSPS

| Feature | Files | New home |
| :--- | :--- | :--- |
| Table/result export: CSV, XLSX, Parquet (client-side COPY TO) | `services/export`, `resultsExport`, `xlsxWriter` | Per-tab export actions + palette |
| Structure report: DSPS JSON + self-contained HTML (D20/D31) | `structureReport`, `dsps`, `dspsHtml`, `packages/dsps-validator`, `schemas/` | Export surface; unchanged formats |
| Jupyter handoff | `jupyterSnippet` | Per-table/tab action |
| R2 save/share + links management + delete (§12.3) | `ShareDialog`, `ShareLinksList`, `ExportModule`, `services/export` | Share dialog from canvas/explorer; links list in explorer (reachable with zero datasets, as today) |
| Sensitive-column nudge (D46, positives-only) | `sensitiveColumns` | Inside share flow, unchanged |
| Share-link open + universal `.dsps` receiver (D62) | `SharedStructureReportView`, `stores/dspsReceiver`, `services/ingestion.loadSharedDataset` | **Viewer mode**: the same shell, read-only, map-forward — a stronger answer than today's modal overlay |

### 6.6 Chrome & cross-cutting

| Feature | Files | New home |
| :--- | :--- | :--- |
| Status bar | `StatusConsole` | Kept — already the VS Code status bar |
| Educational panel (workspace slot for explanations) | `EducationalPanel`, `EducationalPanelContext`, `useEducationalPanel` | Open question (§9): inspector section vs. in-tab |
| Action Broker + typed rows-free contracts (D68) | `types/actions`, broker in `capabilities`, `useThreadPrefill`, `threadPrefill` | Orders the strip; initializes tab instances |
| Nav store | `stores/ui` | Replaced by tab-instance model (§4) |
| Shared primitives | `Tooltip`, `DataTable`, `formatBytes`, `theme.css`, `arrow`, error banners in `App` | Kept |
| Engine & edge (unchanged by design) | `duckdb.worker`, QueryEngine boundary (D49, `types/query`, `types/worker`), all of `edge/` (ai-router, synthesis, cors-relay, vault, persistence, MCP, counters, limiter, kill-switches), `eval/`, `infra/` | The shell is a client of the same seams; zero changes. Kill-switch "cloud features paused" states render in status bar + affected surfaces |

## 7. Anticipated features — homes assigned now

The redesign must not be a layout the next two years fight against. Each planned item
(roadmap §19/§20, build tree) gets its home *in this shell*:

| Planned feature | When | Home in the Workbench |
| :--- | :--- | :--- |
| DSPS spec publication (`▶ 08-persistence/03`) | now | No new chrome; export surface already carries the formats |
| **Theme control (light / dark / system)** — *user-facing*, not just OS `prefers-color-scheme` follow (today's `theme.css` behaviour) | v0.5 | Full control in the **settings pane** (below); quick toggle in status bar / palette |
| **Thorough settings pane** — consolidates the prefs today scattered across stores (`settings`, `privacy`/telemetry, AI mode + BYOK keys per `06-ai/02`, engine/memory ceilings, locale/number format, sample-data) into one deliberate surface; hosts the theme control | v0.5 | A **Settings tab** in the middle canvas (VS Code "Settings editor" idiom, fits the tab-instance model §4) + a gear affordance in the status bar / explorer; opened via palette. *Contents above are candidate scope, not decided.* |
| Responsive pass, empty/error states (Phase 6) | v0.5 | Per-pane empty states; small-viewport stance is §9.7 |
| Manual column re-classification (Phase 6) | v0.5 | Inspector action on a column |
| Guided tour (D15) | v0 | Largely absorbed by Acts 0–4; residue = welcome copy + first-map coach marks |
| Deterministic narration (D65) | v0.5 | Narration blocks on map face + report tabs |
| Signed `.dsps` / provenance (D63) | v0.5 | Trust chrome in viewer mode + share dialog |
| **Drift Report (D44)** — first post-launch ship | v0.5+ | Explorer re-drop affordance on a table → Drift Report **tab**; drifted tables badge on the map |
| Studio 7 — Data-Quality Report ("Lighthouse for data") | v1 | Report tab type (screenshotable, score-as-noun); quality badges on map entities |
| Studio 8 — Relationship inference & schema graph | v1 | **The map, v2** — same surface, deeper engine (confidence/evidence idiom already established) |
| Studio 9 — Semantic model & dbt export | v1 | Proposal as artifact tabs; export via share surface; GitHub handoff action |
| ML modules (`features/ml`, anticipated `ml.worker`) | backlog | Analysis tab types; worker invisible to shell |
| Consumer templates & landing pages (D30/D35) | v0/v1 | Funnels into Act 0 |
| XLSX/SQLite ingestion, semi-structured (D66), httpfs bucket mode | backlog | New sources into explorer *Add data*; bucket mode = an explorer root |
| Hosted tier (D61/D39) | post-v0.5 | The shell's state-purity is the enabler: a workspace becomes a persistable session |
| Desktop (D51, Tauri + sidecar) | post-hosted | Same shell; engine swap behind D49 is invisible |
| MCP stage B, share-tier extensions (D21) | backlog | Server-side / share-dialog escalations; no new panes |

Design rule going forward: **a feature that cannot name its home (tab type, pane, palette
entry, or explorer node) is not ready to build.**

## 8. Drift index — found during the sweep

Recorded as observations, not fixes; none are this spec's scope. Severity: ▲ worth acting
on soon, △ bookkeeping.

1. ▲ **Knowledge graph stale.** `graphify-out/` was built from the initial commit
   (`279b07d`); every working-tree change and all ~30 untracked files (entire export/DSPS/
   relay wave) are absent; `wiki/` doesn't exist and GRAPH_REPORT's community hubs are
   unnamed numbers. Run `graphify update .` (and consider regenerating the report).
2. ▲ **The whole 07/08 wave is uncommitted.** `features/export/*`, `dsps*`,
   `sensitiveColumns`, `apiIngestion`, `relayClient`, `dspsReceiver`, `packages/`,
   `schemas/` exist only as untracked files. (Committing is Justin's call, per workspace
   practice — noted because this inventory cites files git history doesn't show yet.)
3. △ **BUILD-ORDER group checkboxes inconsistent:** `01 foundation`, `03 profiling`,
   `05 charting` sit `[ ]` with every child `[x]`, while `02 ingestion`/`04 sql` are `[x]`.
   Either group-level criteria are genuinely open or the boxes lag.
4. △ **Roadmap tier language vs. build reality:** v0.25 ("post-launch tier") and nearly
   all of v0.5 are *built* as of 2026-07-24, pre-launch. Cutline language now describes
   ship order, not build order — and makes §9's ship-surface question acute.
5. △ **D62 `.dsps` receiver tier bookkeeping:** roadmap still says "v0 stretch … else
   early-v0.5"; it is built (untracked wave). Reconcile at the next design pass. **Resolved
   2026-07-24 — `roadmap.md` updated to "built".**
6. △ `stores/aiSession.ts` header still describes itself as a stub "until build/06-ai/*" —
   06-ai landed and `AIChatModule` consumes it.
7. △ `types/worker.ts` names `ml.worker.ts`, which doesn't exist (anticipatory; `features/
   ml/` is a `.gitkeep`).
8. △ `App.tsx`'s final else-branch placeholder panel is unreachable — the `SidebarModule`
   union is fully enumerated above it.
9. △ Ideation-doc churn: `_implementation/_ideation/` → `_misc/ideation/` move in flight;
   the concept note is superseded by this spec (scrapped 2026-07-24, per instruction).

## 9. Open decisions — for the formal pass, not for drift

*See `UI-REDESIGN-PLAN.md` §5 for this plan's stances on each item below — inputs to
triage, not decisions.*

1. **Ship surface & timing.** Does the Workbench become the Oct 6 v0 launch UI, or land
   post-launch as a tier? The date is fixed (D27), scope flexes; the current shell is
   launch-ready. This is the biggest single call and it is the human's.
2. **D2 timing** (Act 2): consent moves from app-open to the AI branch of the workflow
   question. Substance preserved; placement is a Decision-Record edit.
3. **D68/D69 supersession scope.** The Verdict, ranked actions, tiers, and contracts all
   survive (they power the map + strip); the 12→4 *sidebar* and the Blueprint-as-module
   dissolve into explorer + map + strip + palette. Needs an explicit re-decision, not drift.
   `skipToData` (D68d) likely becomes "default tab = selected table's Profile" — decide.
4. **Tab persistence semantics** per tab type (keep-mounted vs restore-from-spec) and the
   memory ceiling policy.
5. **EducationalPanel's home** (inspector section vs. in-tab explanations).
6. **No mode switch** is the recommendation (palette + disclosure instead); revisit only if
   the guided surface demonstrably can't serve both audiences.
7. **Small-viewport stance.** The SqlErd precedent (honest "optimized for desktop" fallback)
   vs. Phase 6's tablet commitment — decide the floor. **Deferred — not prioritized
   (2026-07-24, owner call).**
8. **Welcome-page routes.** Whether D30 consumer pages render *as* Act 0 variants or link
   into it.

## 10. Design-iteration briefs (`/hallmark` targets)

Each brief is independently iterable against this spec:

- **Welcome page (Act 0).** Editorial, branded, zero chrome. The privacy pitch is the
  headline material. Reference tone: product editorial, not dashboard.
- **The dataset map.** Port the aesthetic of the portfolio SqlErd
  (`justinclarke.github.io/src/pages/projects/SqlDisasterPage/SqlErd.tsx`: entity cards,
  measured SVG connector overlay, path-draw entrance, PK/FK legend, HUD framing) onto real
  data. Two required upgrades: **automatic layout** for arbitrary schemas (the portfolio
  piece is hand-placed on a grid) and **field-row edge anchors** (real data knows which
  field is the FK; anchor connectors to the field row, not the card center). Plus the
  single-table Blueprint face as a first-class variant, and confidence styling per D24.
- **Options strip + tab chrome.** The strip is the journey curation — small, ranked,
  capability-gated; tabs need pin/close affordances and artifact-vs-workspace visual
  distinction.
- **Bottom inspector.** Scent density without becoming a dashboard.
- **Right AI pane.** The audit trail (SQL, timings, retries, sampled-rows badges) styled as
  a feature, not fine print.
- **Command palette.** Standard idiom; needs the action taxonomy (destinations, per-table
  actions, exports, settings).
- **Viewer mode.** The read-only shell for share links / `.dsps` — same map, unmistakably
  "not your session," with the D63 trust chrome slot reserved.

## 11. Adoption path

1. Iterate §10's briefs (wireframes/mock passes) until the middle-canvas strip and map feel
   right — the concept note's warning stands: **the strip is the whole game.**
2. Formal pass: design-reviewer over this spec → orchestrator triage → synthesizer applies
   accepted findings **master-first** into DATASCOPE.md (new §/D-numbers for the shell, the
   tab contract, Act 2, and the D68/D69 supersession) → mirrored into the split tree.
3. Build items enter `status/BUILD-ORDER.md` as leaf docs (shell scaffold → explorer → tab
   host → map → strip/palette → pane migrations), each with its own definition of done.

See `UI-REDESIGN-PLAN.md` §4 for the phase-by-phase breakdown (W0–W8) of step 3, and its
§3 for explicit preconditions before phase W0 can start.
