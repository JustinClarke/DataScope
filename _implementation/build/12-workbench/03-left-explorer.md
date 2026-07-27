# W2 — Left Explorer

**Tier:** v0.60 (the Workbench, D71) · flag-gated `WORKBENCH_ENABLED`, flag-on only ·
**Master spec:** §13.3 ("The explorer (left)" paragraph), §19 (W2 row), §16 (file-structure
additions — `features/explorer/`, `stores/selection.ts`), D68d (structural "skip to data")

> **Amended by D73 (2026-07-26) — v0.70 / S1, S2.** This leaf's two deferrals are claimed and
> its row layout is superseded. **Add-data becomes a `+` on the explorer header** (S1), closing
> the deferral this doc opened and moving the palette's `ingestion` entry out of
> `NOT_YET_WIRED`. **The share-links list stays deferred** — R5 sends it to user accounts,
> since there is no zero-dataset session for it to live in. Rows **reflow to two lines** (name
> unclamped on line 1, `N rows × N cols · sample` demoted beneath — which is also where V6e's
> deferred 255px row-composition finding lands), each gains an explicit **chevron column
> disclosure** working for every table, and a dataset-scoped **Data Quality & Health** panel
> takes a second stacked region beneath the list (S2). The selection store this leaf built is
> unchanged; its consumers now include the drawer rather than a scent-only inspector.
>
> **The rail is rung 1 of the detail ladder (resolved 2026-07-26)** — the **lightest** of three
> levels, and it always links out. Its disclosure carries **structure only**: column names, key
> markers, type chips, a warning affordance. It does **not** carry per-column stats or
> distribution previews (rung 2/3 content) and does not grow panels. Its Data Quality & Health
> findings that carry a query get a **run action** into the console — that is where D68e's
> `duplicates` insight lands now that the SQL page is deleted. See
> [`../14-workspace-streamline/`](../14-workspace-streamline/README.md).

## Objective

W1 shipped the explorer region as an empty placeholder div. W2 mounts real content there: the
existing table registry view (`TableList`) grown with a click-through to each table's Profile
tab, plus the shell-wide selection store the map (W4) and inspector (W7) will read from later.

**Scope call (made this session, confirmed with the human before starting):** §13.3's explorer
paragraph names five things — the table list, per-table actions, Add data, the share-links
list, and the click-to-Profile behavior. Unlike the map/strip/AI-pane content, no later W-phase
row explicitly claims Add-data or the share-links list for the explorer, so this leaf takes the
narrower phase-table wording ("Left explorer grown from `TableList` + shell-wide selection
store") as this session's contract and defers the other two pieces the same way W0/W1 deferred
pieces to named future phases:
- **Add data** (drop / URL / samples) is deferred — `IngestionPanel.tsx`'s current form is a
  479-line full-page component built for wide real estate; recomposing its `DropZone` /
  `SamplePicker` / `UrlInputForm` pieces into a compact rail widget is its own scoped unit of
  work, not a corollary of growing `TableList`.
- **The share-links list** is deferred — it's reachable-with-zero-datasets in the flat v0
  sidebar (`Sidebar.tsx` renders regardless of data), but the Workbench's explorer only mounts
  under the `'shell'` act (`hasDatasets` true, per W1's `selectWorkbenchAct`); the zero-datasets
  entry point is Act 0's job, i.e. W6's, not W2's.
- **Column-level and map-edge selection** (the other two slots `stores/selection.ts` is named
  for in §16) are deferred to whichever phase first reads them — map edges to W4, columns to
  whichever of W4/W7 needs them — rather than shipped now with no consumer.

Both deferred items remain open scope, not cut scope — they need their own leaf doc(s) before
their `src/` code lands, same binding constraint as every other phase.

## Spec

- **`stores/selection.ts` — the shell-wide selection store.** A Zustand store holding
  `selectedTableId: string | null`, with `selectTable(tableId)` and `clearSelection()`. This is
  the seam the options strip (W5) and inspector (W7) will read the "current selection" from;
  W2 ships only the table slot because it's the only one with a consumer today — column and
  map-edge slots land with their own first reader (§16 names the eventual shape; nothing here
  forecloses adding them).
- **`TableList` grows an optional `onSelectTable` prop.** When provided, each row's table name
  renders as a button that calls `onSelectTable(table.id)`; when omitted (the flag-off
  `IngestionPanel` call site, unchanged), the name renders exactly as it does today — byte-for-
  byte identical markup, so `IngestionPanel`/`TableList`'s existing behavior and tests are
  unaffected. This is "grown from `TableList`," not a forked copy: one shared component, one new
  optional capability, consumed differently by each shell.
- **`features/explorer/ExplorerPanel.tsx` — the new explorer-region content.** Wraps `TableList`
  with the Workbench-side wiring: `onSelectTable` calls `useSelectionStore.getState().selectTable`
  and then `openDestination('profile', tableId)` (the D71 nav facade — explorer clicks are
  named in W0's own spec as one of the facade's call sites); `onRemove`/`onRefresh` call the
  same `services/ingestion.ts` functions `IngestionPanel` already calls (`removeTable`,
  `refreshTableFromSource`), with minimal local state (a `refreshingTableId` and an inline error
  string) — the richer telemetry/redo-offer UX around those calls stays `IngestionPanel`'s,
  since that's presentation, not the registry contract.
- **`TabType` gains `'profile'`.** W0 seeded the registry with only its `'map'` placeholder and
  named "W2's Profile tab" as the next member to land — this is that addition. `services/
  navigation.ts`'s module→tab-type mapping (documented there as "provisional... until each
  module migrates off the flat sidebar in a later phase") gains one entry: `profile` module →
  `'profile'` tab type. Every other module still provisionally maps to `'map'` until its own
  phase migrates it — unchanged, so the existing `navigation.test.ts` case (module `'sql'` →
  type `'map'`) keeps passing without modification.
- **`WorkbenchShell.tsx`'s explorer region mounts `ExplorerPanel`.** One-line change: the
  placeholder `<div data-region="explorer" ... />` gets `<ExplorerPanel />` as a child. No other
  region changes; canvas/ai-pane/inspector/status-bar stay W1's placeholders.

## Files

`src/stores/selection.ts` (new — `selectedTableId` + `selectTable`/`clearSelection`),
`src/features/explorer/ExplorerPanel.tsx` (new), `src/features/ingestion/TableList.tsx`
(modified — adds the optional `onSelectTable` prop, additive only), `src/types/tabs.ts`
(modified — `TabType` gains `'profile'`), `src/services/navigation.ts` (modified — adds the
`profile` → `'profile'` mapping entry), `src/app/WorkbenchShell.tsx` (modified — explorer region
mounts `ExplorerPanel`). No changes to `IngestionPanel.tsx`, `stores/ui.ts`, or `stores/
datasets.ts`.

## Dependencies

W1 (Workbench scaffold) — satisfied, shipped 2026-07-24.

## Acceptance criteria

- [x] `stores/selection.ts` holds `selectedTableId` (defaults `null`), with `selectTable` and
      `clearSelection`, unit-tested
- [x] `TableList` with no `onSelectTable` passed renders identically to before this phase (every
      existing `TableList.test.tsx` assertion passes unmodified); with `onSelectTable` passed,
      clicking a table's name calls it with that table's id
- [x] `ExplorerPanel` mounted with tables in the registry: clicking a table name updates
      `useSelectionStore`'s `selectedTableId` **and** opens a tab of type `'profile'` with
      `subject` equal to the table id (proven via `useTabsStore` state after the click, flag-on)
- [x] `ExplorerPanel`'s remove/refresh actions call `services/ingestion.ts`'s `removeTable` /
      `refreshTableFromSource` with the clicked table's id, matching `IngestionPanel`'s existing
      call contract
- [x] `WorkbenchShell`'s `'shell'` act renders `ExplorerPanel`'s content inside the explorer
      region (regression: the W1 `data-region="explorer"` mount point still exists)
- [x] `navigation.test.ts`'s existing flag-on case (`'sql'` module → `'map'` tab type) still
      passes unmodified; a new case proves `'profile'` module → `'profile'` tab type
- [x] No component outside `features/explorer/`, `stores/selection.ts`, and the named modified
      files changed; `IngestionPanel.tsx` untouched
- [x] Full existing suite green

## Test plan

Vitest + React Testing Library. `stores/selection.test.ts` first (the new store, table-driven
default/select/clear). Then extend `TableList.test.tsx` with the new `onSelectTable` case
alongside the existing cases (proving the additive prop doesn't regress the no-prop path).
Then `ExplorerPanel.test.tsx`: render with a couple of registered tables, click a name, assert
both the selection store and the tabs store (flag-on, same `VITE_WORKBENCH` stub-env +
`vi.resetModules()` dynamic-import pattern W0/W1 used); assert remove/refresh call the expected
service functions with the right table id. Extend `navigation.test.ts` with the `profile`
mapping case. Run the full existing suite last.

## Definition of done

`stores/selection.ts` tested; `TableList`'s grown prop proven additive (old behavior unchanged,
new behavior wired); `ExplorerPanel` proven to select + open a Profile tab and to call the
existing remove/refresh services; `navigation.ts`'s new mapping entry tested without disturbing
its provisional default; `WorkbenchShell` mounts it; full suite green. Add-data, the
share-links list, and column/map-edge selection remain explicitly open scope for a later leaf.
