# Roadmap — Development Phases & Release Tiers

**Master spec:** §19 (phases), §0 D15 (release cutline), §18 (gates + steering bars), §24
(launch strategy), D22–D36 (launch revamp).

**Release cutline (D15, amended D24/D30/D31/D70):** v0 = Phases 1–3 (local, deterministic, zero
server surface — first public ship, pulling forward locally-relevant Phase-6 polish: error
boundaries, empty states, bundled samples, guided tour). **v0.25 = the Blueprint-forward opening +
edge-warm synthesis → WebLLM handoff + BYOK (D70)** — a post-launch tier after Oct 6 that curates a
slice of the v0.5 AI work forward, never touching the v0 cutline or the fixed date. v0.5 = Phases 4–6
(AI, connectivity, persistence, edge). v1 = Studio arc (Phases 7–9). Tier gating for acceptance
criteria is in [`../foundations/testing-strategy.md`](../foundations/testing-strategy.md).

**Launch date (D27): v0 ships Tuesday, October 6, 2026 — date fixed, scope flexes.**
Cut order if the plan slips (**re-ranked 2026-07-12, viability round**): (1) consumer
templates + pages (D30), (2) guided-tour polish beyond the D15 minimum, (3) extra landing
pages, (4) **Join Graph slice — last-cut, cuttable only by its own D24 kill criteria**
(quality / ambiguity / timebox / performance), never to save schedule while lower-
differentiation items survive (§3.4: the graph is the sole unclaimed capability). Month-1
steering bars in §18; launch plays in §24.

**Delivery artifact (D50):** every release publishes the static build as a versioned zip
(GitHub Releases) with COOP/COEP + degraded no-SharedArrayBuffer docs, plus an `/security`
page enumerating the complete network surface — "unzip onto your intranet," sovereignty-ladder
rung 2 (§23, §24.4). **~1–2 days; v0 if free days exist, else v0.5; never a date risk (D27).**

**Build sequencing (D67) — demo-spine first, not phase-complete layers.** Within these
settled phases, build the launch-demo **spine** end-to-end before filling breadth around it:
**drop → profile → Join Graph → one offline query → Dataset Dossier → "Copy for AI" /
structure-report export** — the single critical path shared by all four §24 plays. Treat that
spine working end-to-end (rough is fine) as the **first integration milestone**, ahead of
completing Phase 2's chart auto-mapper breadth. And **inside Phase 3, build the differentiators
first** (Join Graph D24 → Dossier D48 → DSPS/"Copy for AI" D31 → structure-report export D20)
**before** the commodity chart suite (correlation/distribution/categorical) and the pivot/
cross-tab UI (D53) — this already matches the cut order above (Join Graph last-cut, pivot
cuttable above it); the phase text below merely lists the charts first. This is a build-order
emphasis only — no scope, tier, date, or cut-order change (clears §24.5/D42).

**Composition-layer recompose (D68) — the encapsulated decision ladder.** A parallel build-order
emphasis over the *same* settled phases: the built Phases 1–5 compose as a four-rung ladder —
**drop → Verdict → Thread → Takeaway** — with a typed, rows-free contract at each seam (the Action
Broker `rankNextActions`; the `FactRef` / `RankedAction` / `DatasetVerdict` / `ThreadConfig`
contracts; the tiered Verdict + confidence floor; the 12→4 intent-group nav). It recomposes the
composition layer of the already-built engine and defines the seam AI (Phase 4 / D56) plugs into —
**no scope, tier, date, or cut-order change.** **Rollout complete** — see `BUILD-ORDER.md`'s
composition-layer-recompose log (2026-07-19–20); `REVAMP-PLAN.md` has since been repurposed for a
later, separate design round (D69).

## v0 — local, deterministic (first public ship)

### Phase 1: Foundation → [`../build/01-foundation/`](../build/01-foundation/), [`02-ingestion/`](../build/02-ingestion/), [`03-profiling/`](../build/03-profiling/)
Vite/React/TS/Tailwind; DuckDB-Wasm in a Web Worker (lazy, Cache API); file drop with format
validation + tiered size detection; **folder drop / multi-file ingestion + table registry
(D13)**; CSV + Parquet; schema classifier + capabilities broker over all registered tables;
auto-profile dashboard per table; **client-side ZIP ingestion (D30, §7.5)** feeding the
multi-file path; **DSPS schema design (D31, §12.2)** and the **`QueryEngine` boundary (D49, §6)** —
execute/register/summarize, with profiling/classification/insight/DSPS written against it,
never against duckdb-wasm directly (pre-work for the D51 desktop sidecar) — both alongside the
D18 interfaces-first work.
Includes the **D17 de-risk spike (amended D24)**: 1–2 day disposable FK-containment/
cardinality prototype against the e-commerce sample folder once the table registry exists
(findings → §20.6, code thrown away) — now also answering *"is a thin productized slice
viable for v0?"* against D24's pre-written kill criteria (quality / ambiguity / 2-week
timebox / §18 performance; details in
[`../build/05-charting/05-join-graph-beta.md`](../build/05-charting/05-join-graph-beta.md)).
**Deliverable:** drop a folder of CSVs → every table registered and statistically profiled → correct modules lit up.

### Phase 2: SQL Playground + JSON → [`../build/04-sql/`](../build/04-sql/)
Monaco (lazy) with DuckDB autocomplete; auto-query suggestions; results grid; SQL → Chart
auto-mapper; JSON/JSONL ingestion.
**Deliverable:** write and execute SQL; results as tables and auto-selected charts.

### Phase 3: Chart Modules *(v0 ship gate)* → [`../build/05-charting/`](../build/05-charting/)
Time-series, correlation heatmap + drill-through, distribution histogram/box plot,
categorical bar/donut; **insight feed (D10)** — rule-based, ranked, SQL-visible, open-as-chart;
**structure-report export (D20/D31, §12.2)** — one-click client-side export (self-contained
HTML + DSPS JSON + "Copy for AI"), the v0 shareable artifact with zero server surface;
**Join Graph (beta) (D24)** → [`../build/05-charting/05-join-graph-beta.md`](../build/05-charting/05-join-graph-beta.md);
**Dataset Dossier (D48, §13)** — the post-ingest folder-level overview packaged from the
existing v0 modules (~3–5 days UI assembly, not new engine work), internal
degrade-to-per-table-profile cut line (never the date); in v0 no sensitive-columns row (the
D46 detector is v0.5);
**consumer templates + `/spotify` + `/google-takeout` pages, shipped unmarketed (D30, §14)**;
report design pass + attribution footer (D26); edge/CDN counters flowing (D25);
**universal `.dsps` receiver — built (D62, §13.1)**: the Dossier's read-only mode over a
handed `.dsps` (no data/login/install), zero new server surface — **already built
(2026-07-24)**, no longer a v0-stretch-or-else-v0.5 open item; internal cut line: degrade to
the §12.2 HTML report output, never the date (D27).
Full ship-gate additions table in §19 Phase 3 (now including the Dossier row); launch-craft
items (wifi demo; three intent landing pages — `/schema-diagram` flagship + `/csv-profiler` +
`/ai-context`, §24.1) in §24.
**Deliverable:** all chart modules light correctly per the broker; each bundled sample surfaces ≥ 3 correct insights and exports a self-contained structure report; the Dataset Dossier lands the folder as the post-ingest overview; the Join Graph (beta) assembles on the e-commerce sample and "Copy for AI" copies with zero raw rows.

## The Workbench adoption: W0–W8 *(parallel shell work, flag-gated — D71)* → [`../build/12-workbench/`](../build/12-workbench/)

**Not a release tier** — a parallel adoption track behind `WORKBENCH_ENABLED` (D71, master
§13.3/§19): the VS-Code-shaped second shell (explorer / tabbed canvas opening on the dataset
map / options strip / command palette / optional AI pane / inspector / status bar) built as a
second composition root while **main stays shippable every day and the current shell (§13.0)
is untouched until cutover; ship-timing is the open §9.1 call at W8** — nothing here forecloses
it. Nine phases, each one build-order leaf: W0 tab contract + tabs store + nav facade
(envelope invariant tested) → W1 scaffold → W2 explorer + selection store → W3 tab-model
maturation (keep-mounted-first) → W4 dataset map (ERD + Blueprint face + Verdict band) → W5
options strip + command palette (**hard gate: palette reaches every feature home**) → W6 Acts
0–2 (§5.1 switch model, no forced gate) → W7 AI pane / inspector / status bar → W8 viewer
mode + cutover (§9.1 decided, flag flip, soak, old shell + §13.0 deleted master-first). **No
`src/` code for the redesign until the fold → tree → build-leaf sequence has landed** (it now
has); per-phase DoDs live in the `12-workbench/` leaves. No v0 scope, date, or cut-order
change (D27).

## v0.25 — Blueprint-forward opening + edge synthesis → WebLLM + BYOK *(post-launch tier, D70)*

A named tier shipped **after** the v0 Oct 6 launch and **before** v0.5 — a curation of already-decided
AI work (D2/D43/D56) around one UX thesis: the app **opens on the informative Dossier-forward
"Blueprint," not the mechanical sidebar flow.** Never touches the v0 cutline or the D27 date.

- **Blueprint-forward opening (D48/D68/D69, no new engine):** the Dataset Dossier / D68 Verdict is
  promoted to the *primary* post-ingest surface — schema + inferred relationships + the D69
  intelligence-layers (profiling / heuristics / AI-synthesis) as the opening view — assembled through
  the D55/D68 ViewSpec over shipped v0 modules; the D68d "skip to data" escape hatch stays for the §2
  second audience.
- **Cloudflare-edge AI synthesis (warm start):** a Worker emits the initial dataset-synthesis narrative
  + suggested explorations fast, covering WebLLM's model-download cold-start — the **D56 async "tailored
  this view" upgrade, never on the first-paint path**; the deterministic Verdict paints first and is the
  whole surface with AI off (D2/D28). **Opt-in, structure-only (DSPS facts, never rows), stateless
  pass-through (D9), never stored (D59); local-only mode never calls the edge (D2).**
- **WebLLM client handoff (the one new architectural commitment):** in-browser WebLLM/WebGPU downloads
  and warms in the background, then takes over the NL/conversational surface **fully client-side, zero
  egress**. The **D43 spike passed (GO, 2026-07-21; ADR-007)** — kill criteria (DuckDB-Wasm memory
  coexistence, SQL-quality floor vs. cloud, download UX) cleared, within four recorded constraints; the
  D40 eval still gates any comparative "local" claim. The edge/BYOK path remains the conversational
  engine and WebLLM is progressive enhancement — it takes over once warm, degrading edge → deterministic.
  **Consent-gated download (human decision, 2026-07-22, §13.1/§19):** the ~830 MB model is never pulled
  silently — eligible sessions (AI mode chosen, no BYOK key, WebGPU present) are asked once; accept runs
  the resumable background download with a progress bar, decline keeps the quota'd free tier serving,
  and a BYOK key suppresses the handoff (the user's own provider serves).
- **BYOK:** pulled forward from v0.5 — D2 mode (c) / D3 "prefer my key" / D9 stateless-pass-through
  custody, no new custody design.
- **Deliverable:** drop a dataset → the Blueprint opens with a deterministic Verdict, an edge-warm
  synthesis resolves as an upgrade badge, WebLLM then serves conversation client-side, and a BYOK key
  routes per the D3 toggle — every AI surface degrading cleanly to deterministic when AI is off, down,
  or uncached. Eval-gated like any AI producer (D40/D56): the gate is on the feature, never the tier.

*Build items are tracked in [`../status/BUILD-ORDER.md`](../status/BUILD-ORDER.md)'s v0.25 section; its leaf docs live in
[`../build/v0.25/`](../build/v0.25/) (the milestone reuses Phase-4's provider routing and the D55/D68
ViewSpec, so it is partly a re-sequencing of existing build docs rather than all-new scope).*

## v0.5 — AI + connectivity + persistence

### Phase 4: AI Chat (NL→SQL) → [`../build/06-ai/`](../build/06-ai/)
Pipeline stages 1–6 (§11.1); transcript auditability; edge AI router (Workers AI default,
BYOK vault + prefer-key toggle); three AI modes wired into settings with disclosure UI.
*Prosumer-flow note (D33):* the consumer NL→SQL flow is §11.1/D2/D9 exactly — no new
architecture; templates (D30) make the LLM unnecessary for common questions, DSPS (D31)
makes it surgical for the tail.
*Eval gate (D40, §11.4):* the dev/CI NL→SQL eval harness (ground-truth set over the §14
samples — exec-rate/correctness/cost/repair-rate) must clear its declared thresholds before
this phase ships — a v0.5-only gate that never touches the Oct 6 v0 date.
*Sequencing note (D42):* re-sequencing a thin AI/MCP slice into v0 was reviewed and
**rejected** (2026-07-12) — it would edit settled D15 and load the fixed date; the
launch-moment AI signal is the already-v0 "Copy for AI" renderer (D31). Not re-litigated
without founder instruction.
*Deeper cloud grounding (D72, §5.2/§11.3):* the stage-5 3-row repair sample becomes the floor
of a **graduated, user-controlled, hard-capped** row-sample escalation for cloud answers —
default-off, per-session, disclosure-precedes-egress, **transmit-only** (never persisted,
never in a `.dsps`, never shared); entire-dataset stays behind the D39/D61 hosted-tier round.
**Deliverable:** plain-English question → SQL → chart, visibly self-correcting failure case; mode switching verified against the Network tab.

### Phase 5: Connectivity & Persistence → [`../build/07-connectivity/`](../build/07-connectivity/), [`08-persistence/`](../build/08-persistence/)
API ingestion Tier 1 + Tier 2 with pagination/telemetry; refresh-from-source; relay rate
limits; client-side Parquet export; R2 save/share (TTL, delete, private-by-default, caps) —
**structure-only artifact as the default share, raw-rows as labeled escalation (D20, §12.3)**;
**likely-sensitive-column nudge in the share flow (D46, §12.3)** — positives-only, a
suppression assist framed as reducing oversight risk, never an all-clear;
**token/no-auth API connections — GitHub (PAT), Lichess/Chess.com — on unchanged Tier 1/2
machinery (D34)**; consumer template format documented + opened to community (D30);
claimable share links re-evaluated at v0.5 planning (D29); **read-only DSPS-serving MCP
endpoint (D38 stage A)** over explicitly shared artifacts only, under the §23.5
ceilings/kill-switch/counters ([`../build/09-edge/`](../build/09-edge/)).
**Deliverable:** pull an API into a table, transform, download, and share a structure-only link that works on another device.

### Phase 6: Polish & Hardening
Theme toggle; tablet/desktop responsive; loading/error/empty states everywhere; virtualized
grids; large-file fallback enforcement; manual column re-classification; cross-browser pass
(Safari best-effort); bundled samples; in-app guided tour. *Locally-relevant items pull
forward to the v0 ship (D15).* Edge services live in [`../build/09-edge/`](../build/09-edge/).
Also v0.5: **deterministic narration (D65, §12.2/§13.1)** — template-filled plain-language
findings over the D10/D45 facts, no LLM in the loop, D45-compliant phrasing, re-framing D54(b)
as deterministic-first (optional AI polish layered later under D56-style gating); **format-first
published artifacts (D64, §6/§12.2)** — a published DSPS JSON Schema + a small npm
validator/parser library over the already-shipping spec, spec-first discipline, no new server
surface; **approval-kit provenance (D63, §23.2/§24.4)** — published build provenance (bundle
hashes + SLSA-style attestation on `/security`, D50) + the signed-`.dsps` design round. (The
**`.dsps` receiver (D62)** is now **built (2026-07-24)** — see Phase 3 above — no longer
carried here as a v0.5 fallback.)

**v0.5 first post-launch ship — Drift Report (D44, §20.8).** The aggregate Drift Report
(re-drop a newer version of an already-profiled dataset → rows added/removed, per-column
%-changed, null/cardinality drift, PSI/KS distribution shift, matching keys inferred,
folder-aware, **aggregate-only**) ships as the **first post-launch feature**, ahead of the
rest of Phase 7 — the retention mechanic and pillar #2 of the structure × time arc (D52).
Phase 7 later absorbs it as one section of the quality report
([`../build/10-studio/01-quality-report/README.md`](../build/10-studio/01-quality-report/README.md)).

**Post-v0.5 platform ladder (D61).** The chartered surface-investment sequence after v0.5:
**browser (shipped) → hosted tier → desktop (D51) → rest on request.** The **hosted tier** is
the D39 opt-in staging/execution tier promoted to the second rung and named the commercial arc
(§20.10, [`../backlog/monetization.md`](../backlog/monetization.md)); its **design round is
anchored at the v0.5 close** — it gates build, fixes custody/disclosure/cost ceilings and the
D61 privacy-and-deletion promise (§5.2), and is where D36 pricing revisits. **Desktop (D51)
re-sequences to rung 3, after the hosted tier ships**, with an air-gap design-partner early-pull
exception. **"Rest on request":** the D49 CLI/CI surface keeps its demand gate (the CLI
pull-forward was reviewed and **rejected**, D61); Excel/Slack/Teams/VS Code/Python-lib
on-request-only. None of this touches v0 scope or the Oct 6 date (D27).

## v1 — the Studio arc (D12) → [`../build/10-studio/`](../build/10-studio/)

Each a full phase-sized effort, sequenced after Phase 6, gated on §18 criteria holding.
Everything deterministic and SQL-derived unless marked AI-assisted — the whole arc works in
local-only mode.

- **Phase 7 — Data-Quality Report** ("Lighthouse for data", D14, §20.8): null heatmap,
  duplicates, skew/outliers, composite score, schema drift, exportable report. Commits to
  the **score-as-noun consequence (§24 Play 2)** — screenshotable, named, content series
  later; the only v0 obligation is visual-design continuity of the structure report.
- **Phase 8 — Relationship Inference & Schema Graph** (D11, §20.6): PK/FK discovery,
  entity inference, interactive ER graph with confidence + evidence, fact/dim classification.
  **Inherits the v0 Join Graph (beta) rather than starting from zero (D24).**
- **Phase 9 — Semantic Model & dbt Export** (D11, §20.6): star-schema proposal +
  materialization, dbt project export, semantic-model export, KPI suggestions, schema docs,
  optional GitHub handoff, companion how-to notebook.

**v1 consumer-rail additions (beside the Studio arc):** cross-platform combination
templates (D35) — time-joins, unified-timeline/timezone utilities, **gated on D30
traction** (wave 3); the OAuth-platform connection decision (D34 — Strava/Spotify/Fitbit,
ToS review required).

## Post-Studio backlog (rough priority order — §19)

1. ML modules → [`../build/11-ml/`](../build/11-ml/) (§20.1)
2. Tier-3 credential-vault ingestion → [`../backlog/tier3-vault-ingestion.md`](../backlog/tier3-vault-ingestion.md)
3. XLSX (SheetJS) + SQLite attach → [`../backlog/xlsx-sqlite.md`](../backlog/xlsx-sqlite.md)
4. Context Bundle export (insight/history half) → [`../backlog/context-bundle.md`](../backlog/context-bundle.md)
5. `httpfs` bucket-first workbench mode → [`../backlog/httpfs-bucket-mode.md`](../backlog/httpfs-bucket-mode.md)
6. Platform expansion (PWA / iPad / iOS) + the **desktop client charter (Tauri + native-DuckDB sidecar behind the D49 `QueryEngine`, D51)** — **rung 3 on the D61 platform ladder, after the hosted tier ships** (air-gap design-partner early-pull retained); trigger-gated, free forever → [`../backlog/platform-pwa-ios.md`](../backlog/platform-pwa-ios.md)
7. Live-DB hybrid bridge (concrete trigger only) → [`../backlog/live-db-bridge.md`](../backlog/live-db-bridge.md)
8. Off-the-pace / F1 integration (D7, §20.7) — separate app, own repo; the F1 warehouse becomes just another ingestible source
9. Temporary cloud staging >500MB (D16) — **revived by D39** as an opt-in staging tier + a server-side-execution design round, **chartered by D61 as the hosted tier — the second platform rung and the commercial arc, scheduled ahead of desktop** (bound by the D61 privacy-and-deletion promise, §5.2); also enabling D38 stage-B MCP → [`../backlog/temp-staging.md`](../backlog/temp-staging.md)
10. Share-tier extensions — aggregate stats + synthetic replica (D21, §20.11) → [`../backlog/shape-share-extensions.md`](../backlog/shape-share-extensions.md); the replica is post-Studio (depends on Phase 8 inference) — *re-tagged the venture headline demo when it arrives (§19 backlog note); its spike may pull earlier if design-partner conversations warrant*
11. Semi-structured & log ingestion — deterministic template extraction, no AI (D66, §20.14) → [`../backlog/semi-structured-ingestion.md`](../backlog/semi-structured-ingestion.md); designed, not scheduled — trigger is a concrete semi-structured data source or its own post-v0.5 design round

Monetization: free-forever local core (D28); pricing deferred until the product is ready
(D36) → [`../backlog/monetization.md`](../backlog/monetization.md).
Positioning & distribution strategy: [`strategy.md`](strategy.md); researched competitive
map: [`competitive-landscape.md`](competitive-landscape.md); launch plays & evidence plan:
master §24.
