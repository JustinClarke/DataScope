# W1 — Workbench Scaffold

**Tier:** v0.60 (the Workbench, D71) · flag-gated `WORKBENCH_ENABLED`, flag-on only ·
**Master spec:** §13.3 (macro structure, the five acts, the "state model" closing paragraph),
§19 (W1 row), §16 (file-structure additions), D71

## Objective

W0 froze the tab envelope contract with nothing visible. W1 is the first phase that actually
renders the Workbench when the flag is on: the grid shell (the five named regions), the act
assembly that decides which surface mounts given session state, and a crude host for the
canvas region wired to W0's `stores/tabs.ts`. It is deliberately unpolished — every region is a
placeholder. Real content lands with its own phase: explorer (W2), map (W4), strip/palette (W5),
Acts 0–2 content + AI-mode defaults (W6), AI pane/inspector/status bar (W7). W1's job is proving
the *assembly* is correct, not building anything it assembles.

## Spec

- **Act assembly is a pure function of session state (§13.3's "State model" paragraph, which
  names the W1 assembly tests explicitly).** `selectWorkbenchAct(session): WorkbenchAct` takes
  `{ hasDatasets: boolean; workerStatus: WorkerStatus }` (both already-available store shape —
  `useDatasetsStore().datasets.length > 0` and `useDatasetsStore().workerStatus`) and returns
  one of three states, no React, no store reads inside the function itself:
  - `'act0'` — no datasets and the worker isn't mid-ingest (`workerStatus` idle/ready/error).
  - `'act1'` — no datasets and the worker is mid-ingest (`workerStatus` loading/compiling).
  - `'shell'` — `hasDatasets` true, regardless of `workerStatus` (once data exists, later
    worker hiccups don't collapse the shell back to a landing page).
  Act 2 (AI defaults) gets **no branch of its own** — §13.3 is explicit that it's "no forced
  gate," and the fold record (2026-07-24) already superseded the old blocking Act-2 gate design
  in favor of mode switches living inside the assembled shell (W7's AI-pane switches). Viewer
  mode is **not** a W1 branch either — it's W8's cutover-adjacent scope, not scaffold scope.
- **Act 0 and Act 1 are chrome-free, full-bleed placeholders — the grid never mounts under
  them.** This matches the signed-off `workbench-shell.html` hallmark finding: Act 0 is a single
  chrome-free surface, and "the VS Code shell only assembles Act 3." W1 ships each as a minimal
  stub (`data-act="act0"` / `data-act="act1"`, one line of placeholder text) proving the
  assembly routes to them — their real editorial content is W6's.
- **The `'shell'` act mounts the grid skeleton — five named, individually-targetable regions,
  all empty except the canvas.** Explorer (left), canvas (middle), AI pane (right, optional —
  render its slot but no content), inspector (bottom), status bar. No command-palette overlay
  yet (W5). Each empty region is a distinguishable placeholder (`data-region="explorer"` etc.)
  so W2/W4/W5/W6/W7 have a stable mount point to replace, not a fresh layout to invent. Visual
  fidelity to the hallmark mocks is explicitly **not** a W1 goal — "crude" per §19's own wording.
- **The canvas region is the crude tab host.** Reads `useTabsStore()` (W0, unchanged) and
  renders each open `TabSpec` as a minimal line (`type` / `id` / `subject`), the entry matching
  `activeTabId` visually distinct from the rest, and a distinct empty-state placeholder when
  `tabs` is empty (nothing yet produces a tab in the flag-on flow until W2's explorer exists, so
  the empty state is the realistic default). W1 explicitly does **not** add tab-switching
  interaction, singleton dedup, keep-mounted preservation, or pinning — those are W3's job,
  building on this display-only base. Prove the host with tabs opened directly via
  `useTabsStore.getState().openTab(...)` in tests, not through any real user flow (none exists
  yet).
- **`App.tsx` becomes the second composition root's branch point (§16).** `WORKBENCH_ENABLED`
  false (default): today's `AppContent` renders, byte-for-byte unchanged. `WORKBENCH_ENABLED`
  true: `WorkbenchShell` renders instead. No feature module branches on the flag directly — same
  discipline W0 established for the nav facade, restated here for the composition root itself.

## Files

`src/app/WorkbenchShell.tsx` (new — grid shell + crude tab host, consumes `useTabsStore` /
`useDatasetsStore` read-only), `src/app/workbenchActs.ts` (new — `WorkbenchAct` type +
`selectWorkbenchAct`, pure), `src/app/App.tsx` (modified — branch on `WORKBENCH_ENABLED` from
`lib/featureFlags.ts`). No store changes: `stores/tabs.ts` and `stores/datasets.ts` are read-only
inputs, unmodified from W0 / the existing baseline.

## Dependencies

W0 (tab contract) — satisfied, shipped 2026-07-24.

## Acceptance criteria

- [x] `selectWorkbenchAct` is a pure function (no React, no store access inside it) covering the
      full `hasDatasets × WorkerStatus` matrix; exhaustively unit-tested
- [x] Act 0 and Act 1 render as chrome-free, full-bleed placeholders — no grid region mounts
      under either (`data-region` query returns nothing when `data-act` is `act0` or `act1`)
- [x] The `'shell'` act mounts all five named regions (explorer/canvas/AI-pane-slot/
      inspector/status-bar) as empty, individually-targetable placeholders — none has real
      content
- [x] The canvas region renders every open `TabSpec` from `useTabsStore` as a minimal
      placeholder line, visually marks `activeTabId`, and shows a distinct empty-state
      placeholder when no tabs are open — no switching/dedup/preservation behavior implemented
- [x] `App.tsx` renders today's `AppContent` unchanged when `WORKBENCH_ENABLED` is false
      (regression against the existing `App.test.tsx` assertions) and `WorkbenchShell` when true
      (proven via `VITE_WORKBENCH` stub-env + `vi.resetModules()` + dynamic re-import, the same
      pattern W0 used for the nav facade)
- [x] No component outside `src/app/` changed; `stores/tabs.ts` / `stores/datasets.ts` accessed
      read-only
- [x] Full existing suite green; flag-off path has zero behavior change

## Test plan

Vitest + React Testing Library. `workbenchActs.test.ts` first — the pure function's full input
matrix (2 × 5 `WorkerStatus` members), table-driven. Then `WorkbenchShell.test.tsx`: act0/act1
render chrome-free under the relevant `useDatasetsStore` state; shell act renders all five
regions empty; canvas region renders the tab-host empty state with zero tabs, then renders an
opened tab (via direct `useTabsStore.getState().openTab('map', 'test-subject')` call in the test)
with the active-tab marker present. Finally extend `App.test.tsx` with the flag-on/flag-off
branch case using the `VITE_WORKBENCH` stub-env pattern. Run the full existing suite last to
confirm zero regression to the flag-off default.

## Definition of done

`selectWorkbenchAct` fully tested; Act 0/Act 1 proven chrome-free; the shell act's five regions
proven present and empty; the crude tab host proven against both the empty and one-tab-open
cases; `App.tsx`'s flag branch tested both ways; full existing suite green. No visual polish
claimed anywhere — every placeholder region is a mount point later phases replace, not a design
deliverable in itself.
