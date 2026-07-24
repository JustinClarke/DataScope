# UI Redesign — Implementation Plan (Workbench evolution)

**Status: near-final draft for iteration, 2026-07-24 — companion to `UI-REDESIGN-SPEC.md`.**
This is the *how and in what order*, grounded in the current code (shell nucleus read
2026-07-24: `App.tsx`, `stores/ui.ts`, `Sidebar.tsx`; nav-seam call-site inventory below).
It takes explicit stances on the spec's §9 open decisions — those stances are **inputs to
the formal pass** (design-reviewer → triage → synthesizer, master-first), not decisions.
On adoption, each phase below becomes a build-order leaf doc. Nothing here edits master,
the tree, or the Decision Record.

---

## 1. Strategy — parallel shell behind a flag

Build the Workbench as a **second composition root behind a feature flag**
(`WORKBENCH_ENABLED` in `lib/featureFlags.ts`, precedent: `JOIN_GRAPH_ENABLED`), branched
in exactly one place — `App.tsx` renders `WorkbenchShell` or today's `AppContent`. Not an
in-place rewrite.

Why this is the right shape and not hedging:

- **The current shell is launch-ready and the date is fixed (D27).** Main must stay
  shippable every day between now and Oct 6. A flag keeps it so; an in-place evolution
  puts the launch surface through weeks of half-states.
- **It converts §9.1 (ship surface & timing — the human's biggest call) from a blocker
  into a late decision.** The flag flip *is* the decision, and it can be made the week
  before launch with both surfaces working.
- **Dual-maintenance cost is unusually low here.** The shell is ~450 lines
  (`App.tsx` + `Sidebar*` + `stores/ui.ts`); every module, store, service, worker, and
  the whole edge tier is shared between the two shells untouched. The redesign is a
  re-homing (spec §6) — the homes are cheap, the residents don't move house twice.

Discipline: the flag lives at the composition root and in the nav facade (§2) **only**.
The moment a feature module needs to know which shell is live, that's a design error in
the facade, not a place for a second flag check.

## 2. The migration seam — one nav facade

Today's nav API is `useUIStore.setActiveModule(module, tabId?, prefill?)` plus the
one-shot `pendingPrefill`/`useThreadPrefill` dance (D68e). The 2026-07-24 sweep finds the
full non-test seam at **13 files**:

| Role | Files |
| :--- | :--- |
| Shell (replaced at cutover) | `App.tsx`, `Sidebar.tsx`, `SidebarCard.tsx`, `stores/ui.ts` |
| Prefill consumers (mechanical swap) | `ChartsModule`, `CorrelationModule`, `SqlModule`, `PivotBuilder`, `ProfileModule` via `useThreadPrefill` |
| Nav dispatchers (route through facade) | `DatasetDossier` (ranked actions), `DossierModule`, `IngestionPanel` (+ `landing.ts`), `App.tsx` share-open path |

The move: a single facade — `openDestination(action: RankedAction | NavIntent)` — that
all dispatchers call. Flag off → it drives `useUIStore` exactly as today. Flag on → it
opens/focuses a tab instance in the new `stores/tabs.ts`, with the prefill payload stored
as the tab's **initializer** (same D68e semantics; no self-clearing, because the
initializer belongs to the tab instance, not to a global slot). At cutover the old branch
and `stores/ui.ts` are deleted. `useThreadPrefill` keeps its signature so the nine
consumer modules change trivially or not at all.

## 3. Preconditions (before phase W0 starts)

1. **Commit the 07/08 wave** (Justin's call, spec §8.2). Shell work touches `App.tsx` and
   ingestion surfaces; it needs a committed baseline to diff against.
2. **Hallmark briefs for the two visual-risk surfaces** — the dataset map and the welcome
   act (spec §10) — iterated at least to wireframe sign-off before their phases (W4, W6)
   start. All other phases are layout-idiomatic (tabs, palette, panes) and don't gate on
   design iteration.
3. Graphify current — done 2026-07-24 (`graphify update .`; spec §8.1 cleared).
4. **The formal pass itself** — spec + this plan go design-reviewer → triage →
   synthesizer into master and the tree; phases enter `status/BUILD-ORDER.md` as leaf
   docs (proposed home: `build/10-workbench/`). Code phases W0–W1 are safe to start in
   parallel with the formal pass (they're invisible behind the flag and decision-neutral);
   W2+ waits for adoption.

## 4. Phases

Each phase is one build-order leaf doc, one committed increment, main shippable
throughout. Sequence expands the spec §11.3 seed (shell scaffold → explorer → tab host →
map → strip/palette → pane migrations).

| Phase | Deliverable | Depends on |
| :--- | :--- | :--- |
| W0 | Tab contract + tabs store + nav facade (flag-off, invisible) | wave committed |
| W1 | Workbench scaffold: grid shell, act assembly, crude tab host | W0 |
| W2 | Left explorer (grown from `TableList`) + selection store | W1 |
| W3 | Tab model maturation: singletons/artifacts, preservation, pinning | W1 |
| W4 | The dataset map (ERD + Blueprint face) | W2, hallmark brief |
| W5 | Options strip + command palette | W3, W4 |
| W6 | Acts 0–2: welcome page + workflow question (D2 retiming) | W1, hallmark brief |
| W7 | Right AI pane, bottom inspector, status bar consolidation | W2 (selection), W3 |
| W8 | Viewer mode; cutover: flag default flip, old shell deleted | all, §9.1 decided |

### W0 — Contracts and state (no visible change)

- `types/tabs.ts`: serializable `TabSpec` — the D55 ViewSpec discipline generalized
  (spec §4). Workspace tabs keyed `(type, subject?)` for singleton identity; artifact
  tabs keyed by artifact id carrying their spec (`ChartSpec`/ViewSpec/pinned result).
- `stores/tabs.ts`: instance list + active id; `openTab` idempotent-focuses singletons,
  always-creates artifacts; `closeTab`, `pinTab`; initializer field per instance.
- Nav facade (§2) wired through all dispatcher call sites, old path behaviorally
  identical.
- **DoD:** tabs store fully unit-tested (singleton idempotency, artifact multiplicity,
  initializer lifecycle); entire existing suite green; zero rendered diff flag-off.

### W1 — Workbench scaffold

- `app/WorkbenchShell.tsx`: CSS grid — left / middle / right / bottom / status regions.
  Assembly is a **pure function of session state** (spec Act 3): no dataset → welcome
  slot (placeholder for W6; `IngestionPanel` serves meanwhile); tables ≥ 1 → explorer +
  canvas; AI path → right pane; inspector with shell. No animation orchestration.
- Crude tab strip over the canvas; existing modules render as tab bodies **unchanged**.
- **DoD:** assembly unit tests (state → pane set); flag on: every module reachable as a
  tab; flag off: byte-identical behavior.

### W2 — Explorer + selection

- `features/explorer/`: grown from `TableList` — tables with derived-table badges,
  expandable columns with semantic-type icons, per-table actions (profile,
  refresh-from-source, remove), *Add data* (drop / URL / samples), share-links entry
  (reachable with zero datasets, preserving today's `ExportModule` guarantee).
- `stores/selection.ts`: the shell-wide selection (table / column / map edge) — the
  explorer writes it, W4's map extends it, W7's inspector reads it, the strip resolves
  its subject from it.
- **DoD:** parity checklist against the spec §6.1 `TableList` row + per-table actions;
  selection store tested.

### W3 — Tab model maturation

- Singleton-vs-artifact behavior end to end; pinning; pin-query-result → artifact tab.
- **Preservation contract: restore-from-spec is the norm; keep-mounted is a per-type
  optimization** (stance on §9.4, rationale in §5). Lift chart-module selections and
  pivot wells into their tab-instance specs; SQL already survives via `stores/query`.
- Prefill → initializer swap on the new path; `useThreadPrefill` consumers migrate.
- **DoD:** switch-away/switch-back preserves state for every tab type (test per type);
  a serialized tab list round-trips to an identical canvas.

### W4 — The dataset map

- `features/map/`: multi-table ERD fed by the **existing** inference pipeline
  (`lib/relationshipInference` → `services/relationships`) — a re-skin of the Join Graph,
  not new analysis. SqlErd aesthetic port with the two named upgrades (spec §10):
  automatic layout and field-row edge anchors. Confidence styling + evidence per D24.
- **Auto-layout spike first** — the one algorithmic unknown; timebox it, and pick the
  boring layered-graph answer if the spike drags.
- Blueprint face for 1 table (Dossier components re-hosted); selected-table side panel;
  synthesis upgrade badge (D56) on the face; `JOIN_GRAPH_ENABLED=false` degrades to
  Blueprint-face-only (kill-path preserved).
- **DoD:** parity checklist against spec §6.2; map renders arbitrary fixture schemas
  (1, 2, 8, 20 tables) without manual placement.

### W5 — Options strip + command palette

- Strip: capability-gated exactly as `Sidebar` gates cards today, **ordered by
  `rankNextActions` (D68a)**, subject from the selection store, opening tabs on the
  answer via initializers (D68e preserved end to end).
- Palette: action registry derived from destinations + per-table actions + exports +
  settings; keyboard-first. The registry is the curation escape hatch (spec §3) — every
  strip decision must have a palette entry, so curation never imprisons.
- **DoD:** strip order matches broker output in tests; palette reaches every §6 feature
  home; keyboard path exercised in tests.

### W6 — Acts 0–2

- Welcome act: editorial page per its hallmark brief; all ingestion entry points (drop /
  multi / folder / ZIP / URL / samples); privacy story as headline copy.
- Act 2: the one post-ingest workflow question; AI branch surfaces the existing
  three-mode consent (`AIModeChooser` retimed, D2 substance preserved — no silent
  default, consent before first AI call); non-AI branch never sees an AI dialog; AI
  reachable later via palette/settings → same consent.
- Whole-window drop target + explorer *Add data* carry ingestion post-welcome.
- **DoD:** journey test — cold start → drop → question → assembled shell with map tab
  focused; non-AI path shows zero AI chrome; format-policy modals unchanged over both
  surfaces.

### W7 — Right pane, inspector, status bar

- Right: `AIChatModule` docked, collapsible, absent until the AI workflow is chosen;
  audit trail untouched.
- Bottom inspector: scent-only per selection (table → name/rows/memory/columns/quick
  stats; column → profile scent; edge → `EdgeEvidencePanel` re-homed). Click-through to
  the full tab. **Hold the no-charts line** (spec §3).
- Status bar: `StatusConsole` grown into the single ambient-state home; `WebLLMDock`
  condenses to a status-bar item + flyout; kill-switch "paused" states surface here.
- **DoD:** parity checklists for §6.4 chat row, §6.2 evidence row, §6.6 status/dock rows.

### W8 — Viewer mode and cutover

- Share-link open and `.dsps` receiver land in the **read-only shell** (map-forward,
  unmistakably not-your-session, D63 trust-chrome slot reserved) replacing the
  `SharedStructureReportView` overlay usage.
- Cutover, once §9.1 is decided and W-phases are at parity: flip flag default → soak →
  delete `Sidebar*`, `stores/ui.ts`, `landing.ts`, the old `App.tsx` branch, the facade's
  old arm, the flag itself. Retire `skipToData` per the §5 stance.
- **DoD:** spec §6 inventory walked row by row against the Workbench — every "new home"
  reachable; old shell gone; no orphaned exports; suite green; `graphify update .` run.

## 5. Stances taken on spec §9 (for triage, not fiat)

| §9 item | This plan's stance |
| :--- | :--- |
| 1. Ship surface & timing | Deferred by construction — flag flip decides at W8; both surfaces launch-capable until then. The call stays Justin's. |
| 2. D2 timing | **Reframed, not just retimed** (LIFECYCLES §4): a single **data-handling gate** in Act 2, post-upload/pre-map, replacing today's app-open `AIModeChooser`. Two options — keep-on-device (default, no data-derived facts leave the browser) / allow-cloud (the existing three-mode D2 consent nested inside). Re-asked every upload for now (no stored posture). Palette "Ask AI" from keep-on-device **re-opens the same full gate**, not a lighter confirm. Implemented in W6; this is a larger D2 edit than originally scoped — Decision-Record edit happens in the formal pass before W6 builds. |
| 3. D68/D69 supersession | Broker/Verdict/contracts survive as the strip's engine (W5); sidebar + Blueprint-as-module dissolve at W8. Scattered-action placement is now settled by LIFECYCLES §3's per-action table (strip acts on the current selection; producing lives near the artifact; managing lives in the explorer; palette is the universal fallback). `skipToData` **retired** as a toggle — structural explorer click-through to a table's Profile tab, plus an optional settings-pane "default tab" preference (LIFECYCLES §5), cover the intent without contradicting "zero questions." |
| 4. Tab persistence | **Restore-from-spec is the contract**, keep-mounted an opt-in optimization per type. Rationale: it forces spec completeness (specs are what viewer mode, share, and the hosted tier serialize — D61 leverage), and it makes the memory ceiling a non-policy (nothing accumulates by default). |
| 5. EducationalPanel home | Inspector section (a scent surface is where explanations belong); revisit only if W7's inspector gets crowded. |
| 6. No mode switch | Affirmed; palette + disclosure only. No phase builds a switch. |
| 7. Small-viewport floor | SqlErd precedent for the *map only* (honest "optimized for desktop" fallback); the rest of the shell keeps Phase 6's tablet commitment — collapse right pane and inspector, explorer becomes a drawer. **Deferred — not prioritized (2026-07-24, owner call).** |
| 8. Welcome-page routes | Consumer pages (D30) render **as Act 0 variants** (prop-driven copy/sample slot), not separate funnels — one welcome surface to maintain. |

## 6. Risks

- **Dual-shell drift.** Mitigation: modules shared, flag confined to two files, W-phases
  are weeks not months; the parity checklists in each DoD are drawn from spec §6 rows, so
  drift is auditable, not vibes.
- **State lifting regressions (W3).** The per-type preservation tests are the contract;
  chart/pivot lifting lands one module at a time.
- **Map auto-layout (W4)** is the only algorithmic unknown — hence spike-first with a
  timebox and a boring fallback.
- **Restore-from-spec lossiness** — any tab state that can't round-trip through its spec
  is a spec gap; the W3 round-trip test makes it fail loudly, and keep-mounted is the
  named escape hatch per type.

## 7. Test discipline

Old shell's suite stays green untouched until W8 deletes it with its subjects. The
Workbench gets: tabs-store unit tests (W0), assembly pure-function tests (W1), per-type
preservation + round-trip tests (W3), broker-order and palette-coverage tests (W5), the
journey test (W6), and the §6 row-walk as the W8 gate. The shell being a pure function of
session state is what makes all of this cheap — that property is load-bearing; defend it
in review.
