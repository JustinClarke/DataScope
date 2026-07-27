# W4 — The Dataset Map

**Tier:** v0.60 (the Workbench, D71) · flag-gated `WORKBENCH_ENABLED`, flag-on only ·
**Master spec:** §13.3 ("The dataset map — the opening tab"), §19 (W4 row), D24 (connector-source
guardrail, transferred), D48 (Dossier re-home — Blueprint face + selected-table side panel),
D68c (tier-1 Verdict discipline), D55/D56/D70 (synthesis-upgrade badge, unchanged mechanism)

> **Amended by D73 (2026-07-26) — v0.70 / S6, S7.** The map tab's **composition** changes; the
> ERD, the Verdict band, the D24 connector-source guardrail and the Blueprint face do not.
> Final order becomes: Verdict band → **AI Dataset Synthesis ‖ Suggested Explorations** → ERD →
> **Structural Patterns ‖ Behavioral Trends** (independent column heights — forced equal-height
> manufactures the dead space this composition removes). The **options strip above the map is
> deleted**, its prompts relocating into Suggested Explorations, where picking one opens a
> **pre-run query tab** rather than seeding the console. Every finding card is a claim about the
> user's data and must name a deterministic producer; **the synthesis block is blocked, not
> scheduled** (S7) until the prose's producer question is answered — it may not imply a model ran
> when none did (§5.2). See [`../14-workspace-streamline/`](../14-workspace-streamline/README.md).

## Objective

W3 gave the `'map'` tab type a real host slot but no content (`<div>Dataset map (W4)</div>`).
W4 fills it: a multi-table ERD fed by the existing D24 inference pipeline with a persistent
Verdict band, and a single-table Blueprint face for the one-table case. **The auto-layout
algorithm (longest-path layering + barycenter) and the field-row-anchored connector rendering
are not new design work this phase** — both were designed, prototyped, and signed off in the
hallmark mock `dataset-map.html` (formerly `_misc/ideation/hallmark/`, deleted post-v0.69) during
the formal-pass ideation. This leaf ports that proven algorithm to a typed, tested module and a React
component; it does not re-derive it. That is also why this phase builds at Sonnet tier rather
than the Opus the charter proposed — see the BUILD-ORDER.md log for the correction and its
reasoning (same pattern as W0's Opus→Sonnet correction).

## Scope calls (made this session, decided before building — see reasoning per item)

1. **Visual skin: functional-first, existing `--color-*` tokens — not the mock's dark-HUD
   palette.** Confirmed with the human directly (AskUserQuestion) before building. The hallmark
   mock's hardcoded dark palette (amber-PK/purple-FK, `#0a0c10` canvas) was explicitly signed
   off as *visual* reference only, and the ideation record flags map light-mode theming as an
   **unresolved open item** — reskinning now would mean deciding that open question as a side
   effect of a build step, not a deliberate design pass. W1–W3 already established the
   precedent ("visual fidelity to the hallmark mocks is explicitly not a W1 goal") — W4 follows
   it. What ports from the mock is the **algorithm and interaction pattern** (columns by
   longest-path depth, barycenter reordering, DOM-measured field-row connector anchors,
   solid/dashed by D24 confidence, click-to-select), styled with the same tokens
   `JoinGraphModule`/`DatasetDossier` already use. A full reskin is deferred to a later,
   dedicated pass.
2. **No manual ERD/Blueprint toggle control.** The mock's segmented "Multi-table · ERD /
   Single-table · Blueprint" control existed to demo both faces standalone in one static file.
   Master §13.3's prose doesn't call for a persistent toggle — face selection is structural:
   `tables.length === 1` renders the Blueprint face directly (there is nothing to diagram with
   one node); `tables.length >= 2` renders the ERD as the hero, with the Blueprint reachable as
   the selected-table side panel. Building a redundant top-level toggle would duplicate the
   ERD's own selection affordance for no spec-required behavior.
3. **"Blueprint face" vs. "selected-table side panel" resolve to two different existing
   components, not one new one.** D48's amendment names "the Dossier" as filling both roles,
   which reads as one component until the two cases are worked through concretely:
   - **Single-table Blueprint face** (`tables.length === 1`) = `DatasetDossier` rendered
     unchanged. With exactly one table, `DatasetDossier`'s existing dataset-wide Verdict/
     overview *is* the single-table summary — no new component needed, this is D48's "home
     moves, content survives verbatim" applied literally.
   - **Selected-table side panel** (clicking one card in a multi-table ERD) = `ProfileDashboard`
     reused with `initialTableId={selectedTableId}`, the same per-table profile component W3
     already wired to `'profile'` tabs (row/column counts, per-column cards, insight feed) — not
     `DatasetDossier`, which has no notion of "just show table X" (it always summarizes the
     whole registered set). The mock's per-table Blueprint markup (row count, columns, PK, fill
     rate) is exactly `ProfileDashboard`'s existing content, already built and tested.
   - **Known accepted overlap, not a bug:** `ProfileDashboard` renders its own table-picker
     pills whenever more than one table is registered, so the side panel shows a second way to
     switch tables alongside the ERD's own cards. Suppressing that picker in this embedding is a
     visual-polish call, deferred with scope call 1 above.
4. **`useDatasetBaseline` extracted from `DatasetDossier`.** The persistent Verdict band needs
   the same `{ tableInsights, timeCoverage, edges, baseline }` data `DatasetDossier` already
   computes inline. Duplicating that fetch-and-build logic inline a second time is real
   duplication, not just similar-looking code, so it is extracted to
   `features/profiling/dossier/useDatasetBaseline.ts` and `DatasetDossier` is refactored to call
   it instead of holding the logic itself — a refactor triggered directly by this phase's need,
   not a speculative cleanup. `DatasetDossier`'s rendered output and props are unchanged.
   **`VerdictBand` takes its slice as props rather than calling the hook itself** — `DatasetMap`
   calls `useDatasetBaseline` once (it already needs `edges` for the `Erd`) and hands the
   relevant fields to `VerdictBand`, so the two mounting together (the multi-table case) never
   issues the underlying insight/relationship queries twice. The single-table case
   (`DatasetDossier` alone) still calls the hook itself, since nothing else needs its data in
   that branch.
5. **No edge-editing UI in the ERD itself.** `JoinGraphModule`'s `AddRelationshipForm` /
   `EdgeEvidencePanel` (add/remove/repoint an edge) are not ported here. Master §13.3 names "map
   edge → the FK evidence + confidence + override controls" as the **bottom inspector's** job
   (W7), not the map's — the ERD this phase builds is read-only display plus table selection.
   The old shell's `JoinGraphModule` keeps its editing UI unchanged (`§13.0`, untouched until
   W8).
6. **Map tab subject.** `TabSpec.subject` is required per the D55 envelope, but the map is
   dataset-wide, not per-table — there is no natural per-table subject the way `'profile'` has
   one. Uses a fixed constant subject (`'workspace'`) so the single map tab dedupes to itself
   under the existing singleton mechanism (W3) with zero store changes.
7. **Auto-open on shell entry, gated on a genuinely empty tab set.** Master calls the map "the
   opening tab," but nothing before this phase ever calls `openTab('map', …)` — `WorkbenchShell`
   only ever showed a map tab if some other caller happened to route there. This phase adds a
   ref-guarded auto-open (same pattern as W1's `useSampleAutoLoad`) that decides once, the first
   time the shell has datasets, whether to open the map tab — and only does so if zero tabs are
   already open at that moment. **Found during this build, not designed upfront:** an earlier
   version gated only on `hasDatasets`, which auto-opened a second, unwanted map tab into any
   session that already had tabs open by the time datasets appeared — including the existing
   `WorkbenchShell.test.tsx` "tab host" suite, which opens specific tabs before rendering to set
   up its own scenarios. The zero-tabs gate fixes both: it matches the actual intent ("the
   opening tab" means what a fresh landing opens to, not a tab that force-inserts itself into an
   already-populated session) and stops clobbering pre-existing test setup. A manual way to
   reopen the map tab after closing it is W5's job (the palette must reach every feature home) —
   not duplicated here. **One pre-existing W3 test retired, not just adjusted:**
   `WorkbenchShell.test.tsx`'s "shows an empty-state placeholder when no tabs are open" asserted
   a state (datasets present, zero tabs, fresh mount) that W4's auto-open makes unreachable
   except transiently right after closing the last tab — which "closing a tab removes it from
   the host" already asserts the identical `tab-host-empty` markup for. Keeping the retired test
   would mean either asserting a fictional scenario (auto-open artificially suppressed) or
   asserting the pre-W4 behavior as if this phase hadn't shipped.

## Spec

- **`src/features/map/layout.ts`** — pure functions, no React, no DOM. Input: the table list +
  the (override-applied) `FkEdge[]` already computed by `applyOverrides` (`lib/
  relationshipInference.ts`). Output: an ordered array of columns, each an ordered array of
  table names, per the mock's two-pass algorithm — `computeColumns` (longest FK-directed path
  from each node, columns = `maxDepth - depth`, cycle-guarded) then `orderColumns` (barycenter
  reordering within each column, forward/backward/forward passes to reduce crossings).
- **`src/features/map/Erd.tsx`** — renders the layout as columns of entity cards (table name,
  row count, field rows with PK/FK indicator dots — PK from `semanticType === 'Identifier'`
  matching `lib/dossier.ts`'s existing `keyColumnsFor`, FK from whether a column is any accepted
  edge's `childColumn` for that table). A connector layer measures each field row's
  `getBoundingClientRect()` (same technique the mock uses — no graph-layout dependency, matching
  the existing `JoinGraph.tsx`'s "hand-rolled SVG, no dependency" precedent) and draws one path
  per edge, field-row to field-row, solid for `confidence === 'confident'` / dashed for
  `'candidate'` (the D24 guardrail, unchanged rule, new renderer). Clicking a card calls
  `useSelectionStore.selectTable`.
- **`src/features/profiling/dossier/useDatasetBaseline.ts`** (new) — the fetch-and-build logic
  lines out of `DatasetDossier` (tableInsights/timeCoverage/edges state + effect, `baseline`
  memo via `buildDatasetVerdict`), taking `tables`/`datasets` and returning
  `{ tableInsights, timeCoverage, edges, baseline }`. `DatasetDossier.tsx` is edited to call it;
  no prop or rendered-output change.
- **`src/features/map/VerdictBand.tsx`** (new) — a props-driven presentational component
  (`tables`, `datasets`, `baseline`, `tailored`, `paused`, `headlineFact`) rendering the
  identity + one headline `FactRef` under D68c tier-1 discipline, plus the existing "Tailored to
  your data" / "Cloud features paused" badges `DatasetDossier` already shows — same badge logic,
  new small host so it can sit in the map tab header rather than inline in the scrollable
  Dossier body. Deliberately doesn't call `useDatasetBaseline` itself (scope call 4). Mounted
  only when `tables.length >= 2` (the single-table case shows the full Blueprint face instead,
  which already carries this content).
- **`src/features/map/DatasetMap.tsx`** (new) — the `'map'` tab's content component. One table:
  renders `DatasetDossier` directly (scope call 3). Two or more: calls `useDatasetBaseline`
  once and renders `VerdictBand` (fed from that call) + `Erd` (fed the same `edges`) as the
  hero, and — when `useSelectionStore.selectedTableId` names a table — a side panel rendering
  `ProfileDashboard` with `initialTableId` set to it (scope call 3). `Erd`'s `onSelectTable`
  calls `useSelectionStore.selectTable`, the same store W2's explorer already writes to, so
  selecting a table from either the explorer or the map agree.
- **`src/app/WorkbenchShell.tsx`** — `TabContent` renders `<DatasetMap />` for `tab.type ===
  'map'` in place of the W3 placeholder. A new ref-guarded effect (mirroring
  `useSampleAutoLoad`) calls `useTabsStore.getState().openTab('map', 'workspace')` once when
  `hasDatasets` first becomes true.

## Files

New: `src/features/map/layout.ts` (+ `.test.ts`), `src/features/map/Erd.tsx` (+ `.test.tsx`),
`src/features/map/VerdictBand.tsx` (+ `.test.tsx`), `src/features/map/DatasetMap.tsx` (+
`.test.tsx`), `src/features/profiling/dossier/useDatasetBaseline.ts`. Modified:
`src/features/profiling/dossier/DatasetDossier.tsx` (extracted to the new hook, output
unchanged), `src/app/WorkbenchShell.tsx` (`TabContent` + auto-open effect). No changes to
`JoinGraphModule.tsx`, `JoinGraph.tsx`, `stores/tabs.ts`, `stores/selection.ts`, or
`services/navigation.ts` — the old shell's Join Graph module is untouched (§13.0, unchanged
until W8); the existing selection store and singleton dedup already cover this phase's needs.

## Dependencies

W2 (left explorer — the shared `useSelectionStore`) — satisfied, shipped 2026-07-24. The
hallmark brief dependency (the signed-off `dataset-map.html` mock) is satisfied — it is this
leaf's algorithm/interaction-pattern source per the Objective above.

## Acceptance criteria

- [x] `layout.ts`'s `computeColumns`/`orderColumns` tested against: a single table (one column,
      no edges), a linear FK chain (columns match longest-path depth), a table with two parents
      at different depths (takes the longer path), a self-referencing FK and an FK cycle (cycle
      guard terminates, doesn't throw or infinite-loop), and the mock's own worked example
      (MovieLens-shaped schema/edges) proving the ported reorder logic is deterministic and
      exercised. **Correction made during this build:** the acceptance criterion originally
      drafted here claimed barycenter reordering "measurably reduces the naive crossing count" —
      empirically false for this algorithm (verified by running it against several
      permutations of the mock's own fixture; one even went from 5 crossings to 7). This is a
      faithfully-ported property of the mock's frozen-per-pass-snapshot heuristic, not a porting
      bug, so the test asserts determinism and exact output against the reference fixture
      instead of a false improvement guarantee — see `layout.test.ts`'s second `orderColumns`
      test for the documented reasoning.
- [x] `Erd.tsx` renders one card per table with PK/FK dots matching `semanticType`/edge-child
      derivation, draws a connector per accepted edge, solid for `confident` / dashed for
      `candidate` (never a cardinality label the engine didn't compute — D24 guardrail), and
      calls `selectTable` on card click/Enter
- [x] `useDatasetBaseline` returns identical `{ tableInsights, timeCoverage, edges, baseline }`
      shape to what `DatasetDossier` computed inline before the refactor. **Correction:** the
      test plan below originally assumed a `DatasetDossier.test.tsx` existed to rerun — it
      doesn't; no direct component-level test for `DatasetDossier`/`DossierModule` existed
      before this leaf (`layers.test.ts`/`dossier.test.ts`/`ViewSpecRenderer.test.tsx` cover the
      pure functions it calls, not the component itself). The refactor is instead verified by
      `tsc -b` (the hook's return type matches every destructured use site) and exercised
      transitively — `DatasetMap.test.tsx`/`VerdictBand.test.tsx` mock the same service layer
      (`services/dossier.ts`, `services/relationships.ts`) `useDatasetBaseline` calls, so a
      broken extraction would fail there
- [x] `VerdictBand` renders the headline `FactRef` + identity, only mounted for `tables.length
      >= 2` (by its caller, `DatasetMap`), and reflects the synthesis-upgrade badges
      (`tailored`/`paused`) the same way `DatasetDossier` does — including preferring the
      AI-upgraded headline over the deterministic baseline when present
- [x] `DatasetMap`: one table → `DatasetDossier` full-face, no ERD/side panel; two or more
      tables → `VerdictBand` + `Erd` hero, no side panel until a table is selected, then
      `ProfileDashboard` appears scoped to that table; selecting via the explorer (W2) and via
      the map agree (shared `useSelectionStore`) — proven by pre-seeding the store before mount
      and observing the side panel already open
- [x] `WorkbenchShell`: a `'map'` tab renders `DatasetMap`; the map tab auto-opens exactly once
      per session when datasets first appear (from a genuinely empty tab set), and does not
      reopen itself if the user closes it or if the session already had tabs open when datasets
      appeared
- [x] Full existing suite green (124 files / 1238 tests, up from 120/1208); `tsc -b` clean;
      `oxlint` clean on every changed file; `graphify update .` run

## Test plan

Vitest + React Testing Library, same conventions as W2/W3. `layout.test.ts` first (pure, no
mocking) — the cases listed in the acceptance criteria, using the mock's exact MovieLens-shaped
fixture (six tables, six edges) as the `orderColumns` reference case rather than an invented
one. `Erd.test.tsx` next: since the
connector layer depends on `getBoundingClientRect`, tests assert on the data-level output
(edge count/confidence attributes, selection callback) the way `JoinGraph.test.tsx`/
`JoinGraphModule.test.tsx` already do, not on measured pixel geometry. No direct `DatasetDossier` component test exists to rerun (see the acceptance-criteria
correction above) — `tsc -b` plus the transitive coverage below stand in for it.
`VerdictBand.test.tsx` ended up not needing service mocks at all — it takes its data as props
(scope call 4), so its tests just pass fixture props directly. `DatasetMap.test.tsx` and the
`WorkbenchShell.test.tsx` additions follow `JoinGraphModule.test.tsx`'s static
`vi.mock`/`vi.hoisted` pattern for `services/dossier.ts`/`services/relationships.ts`/
`services/profiling.ts`/`services/insights.ts` — none of these tests use
`vi.resetModules()` + dynamic re-import, so W2's sequential-await hazard (which is specific to
that pattern) doesn't apply here. `WorkbenchShell.test.tsx` gains the auto-open assertions
(opens once from zero tabs, doesn't reopen after close, doesn't clobber a session that already
has tabs open) alongside its existing W1–W3 coverage; one pre-existing test there is retired
per scope call 7. Run the full existing suite last.

## Definition of done

The auto-layout algorithm is ported and unit-tested against the cases the mock's algorithm was
designed to handle (chains, branching depth, cycles, deterministic barycenter reordering against
the reference fixture); the ERD renders real D24 data with the confidence guardrail intact; the
Verdict band and Blueprint face both work from one shared, tested data hook; the map is the tab
a fresh multi-table session actually lands on; full suite green; `tsc -b` clean; `oxlint` clean;
`graphify update .` run. Edge editing, the visual reskin, and a manual "reopen the map"
affordance stay explicitly open scope, deferred per the scope calls above.

**Shipped 2026-07-25**, Sonnet, inline in the orchestrating session (no docs pipeline —
implementation is reviewed as code per this repo's `CLAUDE.md`). All acceptance criteria met;
see `BUILD-ORDER.md`'s log entry for the full build record and the `▶` handoff to W5.
