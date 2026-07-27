# W7 — Right AI Pane, Bottom Inspector, Status Bar

**Tier:** v0.60 (the Workbench, D71) · flag-gated `WORKBENCH_ENABLED`, flag-on only ·
**Master spec:** §13.3 ("The right AI pane" / "The bottom inspector" / "The status bar"
paragraphs), §5.1 (the switch model, D2 amendment), D24 (relationship trust rules), §19 (W7
row), depends on W2 (selection store) + W3 (tab model)

> **Amended by D73 (2026-07-26) — v0.70 / S3, S4.** **The bottom inspector this leaf built
> becomes one of two views in a drawer**, and the charter it was built to is reversed at the
> region level on the record: `Info` (this leaf's content, unchanged — table/column/edge scent,
> scent-level EducationalPanel with click-through, "no charts in the inspector") plus the **SQL
> console**. The split between them is user-controlled, VS Code terminal-panel style, but there
> is exactly **one console instance**; the region is resizable and fully expandable to the
> viewport, and **results never auto-expand it** (a taller result prompts). **Info is rung 2 of
> the detail ladder (resolved 2026-07-26): ambient, not a destination** — it fills from the
> selection while the user explores — and it **now links onward to the tab view**, so it is no
> longer a leaf. Its content is otherwise exactly what this leaf built. The AI pane's
> *content* is untouched — its **per-turn SQL gains a run action** into the console (S4), which
> leaves the D55 seam intact because the user runs text they read first. Bottom-edge stacking:
> status bar → WebLLM dock → drawer → canvas. See
> [`../14-workspace-streamline/`](../14-workspace-streamline/README.md).

## Objective

W1–W6 left three of `ShellGrid`'s five regions as empty placeholder `<div>`s: `ai-pane`,
`inspector`, `status-bar`. W7 fills all three with real content, and — named explicitly as its
first job by the W6 log — wires `workbenchAIDefaults.ts`'s pure `isCapableDevice`/
`recommendedWorkbenchAIMode` into the shared `useSettingsStore` and a real switch UI for the
first time.

## Scope calls (made this session, confirmed with the human before building via AskUserQuestion)

**1. D72 "deeper cloud grounding" — deferred, not built this leaf.** The AI-mode docs
(`build/06-ai/02-modes-byok.md`, `build/06-ai/03-privacy-disclosure.md`) name D72's graduated
sample-size control (3-row floor → hard cap N rows/M bytes, custody-differentiated labeling) as
landing in "the W6/W7 leaves." W6 shipped without it, and no code anywhere implements it — today's
`metadataOnlyRepair` is a plain boolean. Building D72 now would be new engine + UI scope well
beyond "wire the switches + reuse the audit trail." **Deferred to its own follow-up leaf**,
named explicitly so it isn't silently dropped; "Configure workspace" reuses today's binary
metadata-only-repair toggle unchanged.

**2. Status bar's kill-switch "paused" item — reactive, last-known signal only, no polling.**
Pause flags (`edge/shared/killSwitch.ts`) are per-endpoint env vars checked server-side only when
a request is actually attempted; there is no `/status` endpoint or client-side tracking today.
Building proactive polling infrastructure would be real new server + client scope, bigger than
"consolidation." **Built:** a small shared store (`stores/pauseSignal.ts`) that request paths
write to when they hit a `'paused'` code; the status bar shows the most recent known pause,
nothing proactive. **Wired only at the vault path** (`AISettingsPanel`'s existing
`STORE_FAILURE.paused` branch) — the AI-router path deliberately collapses `'paused'` into
`ProviderQuotaExhaustedError` already (`services/cloudProvider.ts`'s own comment: "the loop
renders these as the 'bring your own key / switch to local / retry tomorrow' state"), an
existing, intentional design decision this leaf does not reopen.

## Spec

### Right AI pane (`features/ai/`)

- **`ModeSwitches.tsx` (new):** flat `Off · Cloudflare · WebLLM · Your own key` buttons above the
  pane, per §5.1's Workbench amendment — a presentation re-partition of `AISettingsPanel`'s
  existing mode radio, not a fourth mode. `Off` → `aiMode = 'local-only'`. `WebLLM` →
  `aiMode = 'local-model'`. `Cloudflare` → `aiMode = 'cloud'`, `byokPreference =
  'free-tier-first'`. `Your own key` → `aiMode = 'cloud'`, `byokPreference = 'prefer-key'`. No
  separate confirm-modal mechanic is invented: the shipped `AIModeChooser`/`AISettingsPanel`
  precedent already treats "disclosure shown" as the inline payload-list copy rendered the moment
  a cloud-capable mode is selected, with the real egress gate being that nothing calls a provider
  until the user submits a question in the composer — this leaf mirrors that, not a new pattern.
  A one-line disclosure summary renders under the switches whenever `aiMode === 'cloud'`; the
  **"Configure workspace"** button (opens the modal below) is always visible, per-mode, never
  auto-opened — "no forced gate" holds for mode switching too.
- **`AISettingsPanel.tsx` (modified, additive):** new optional `hideModeSwitch?: boolean` prop
  (default `false` — the old shell's call site is unchanged) skips rendering the `Mode` fieldset
  only; every other section (WebLLM consent, cloud routing/key/vault, metadata-only repair) is
  reused verbatim. The Workbench passes `hideModeSwitch`, since mode selection now lives in
  `ModeSwitches`.
- **`AIPane.tsx` (new):** composes `ModeSwitches` (top) + the existing `AIChatModule` (the
  per-turn audit trail — §13.3 calls this "the pane's hero," and it is reused completely
  unchanged: `AITurnView`'s planned → SQL → ran → sampled → validated → rendered transcript
  already is the D55 seam made literal). Collapsible via a local toggle button; collapsed state
  renders a thin re-expand strip, contributing nothing else — matches "the pane is additive."
- **AI default wiring (`app/useApplyWorkbenchAIDefault.ts`, new):** a small hook, mounted once in
  `ShellGrid`, that calls `useSettingsStore.getState().setAIMode(recommendedWorkbenchAIMode(
  isCapableDevice()))` exactly once, and **only** when `aiMode` is still `null` — never
  overwriting an explicit prior choice (including one persisted from an earlier session).
  Ref-guarded the same way `useMapAutoOpen` (W4) is. This is the wiring `workbenchAIDefaults.ts`'s
  own header comment named as "W7's job" — `isCapableDevice`/`recommendedWorkbenchAIMode`
  themselves are unchanged.

### Bottom inspector (`features/inspector/Inspector.tsx`, new)

Fills from whichever selection kind was most recently made — table, column, or map edge — per
§13.3's "fills from the selection" paragraph.

- **Selection store (`stores/selection.ts`, extended additively):** `selectedColumn: { tableId:
  string; column: string } | null` + `selectColumn`, `selectedEdgeId: string | null` +
  `selectEdge`, and `lastSelectionKind: 'table' | 'column' | 'edge' | null` so the inspector knows
  which slot is current without the three slots clearing each other (a column selected from a
  Profile tab must not silently blank out a map's `selectedTableId`-driven side panel, and vice
  versa — the W2 log's own reason for leaving these slots to "their first reader" is respected by
  keeping them independent, not by inventing a single unified selection value that would ripple
  into `Erd`/`DatasetMap`'s existing, shipped consumers of `selectedTableId`). `selectTable`'s
  existing behavior (and its existing callers) is unchanged beyond also setting
  `lastSelectionKind`.
- **Table scent:** name, row count, memory (`formatBytes`), column count — from
  `useDatasetsStore.tables`, no new fetch.
- **Column scent:** semantic type + physical type from the already-classified `ClassifiedColumn`
  (no new DuckDB query — scent-level per §13.3's "never a pedagogical surface" line, not a second
  `ColumnCard` stats fetch) plus a click-through that calls `openDestination('profile', tableId)`
  to open the full Profile tab. Entry point: `ColumnCard.tsx` gains an optional `onSelect`/
  `selected` prop (additive, unused call sites unaffected — same shape as W2's `TableList
  .onSelectTable`); `ProfileDashboard.tsx` wires it to `useSelectionStore.selectColumn`. Reachable
  from both a Profile tab and the map's side panel, since both render `ProfileDashboard`.
- **Map edge scent — evidence + confidence + D24 override controls:** reuses
  `EdgeEvidencePanel`/`AddRelationshipForm` (`features/charts/relationships/EdgeEvidencePanel.tsx`)
  unchanged, wired to the already-shipped `useRelationshipsStore` (remove / re-point / restore /
  add) — the same store `JoinGraphModule` (old shell) already uses, so an override made from
  either surface is the same override (D24 "override everywhere," one store). **New
  `stores/inferredEdges.ts`:** holds the raw, pre-override `FkEdge[]` the async
  `loadRelationships` call already produces inside `useDatasetBaseline`'s existing effect, which
  now also mirrors its result into this store. The Inspector reads from it and applies
  `applyOverrides` itself (a cheap, pure merge, already called independently in two places in this
  codebase today — `useDatasetBaseline` and `JoinGraphModule` — so a third caller sharing the same
  *fetched* data, rather than re-fetching, is the one new thing, not the pattern). This avoids a
  second concurrent `loadRelationships` DuckDB query firing every time the map tab and the
  inspector are visible at once. `Erd.tsx` gains `selectedEdgeId`/`onSelectEdge` — each wire
  `<path>` becomes independently clickable (`pointer-events-auto` on the path despite the
  containing `<svg>` staying `pointer-events-none`, the standard SVG hit-target technique) and
  each field-row becomes clickable for column selection (calling both `onSelectTable` and the new
  `onSelectColumn` so the side panel and the inspector agree). Matches `Erd.tsx`'s own comment,
  written at W4: "edge evidence/override editing stays the bottom inspector's job (W7)."
- **Click-through:** selecting a table or an edge already opens/updates what's needed (the map's
  side panel, the override controls); the column case's click-through is the one that opens a full
  tab, per the "never a pedagogical surface … click-through opens the full tab" line.

### Status bar (`features/status/StatusBar.tsx`, new)

One glyph + one short label per item, per the explicit density budget:

- **Posture dot:** `aiMode === 'cloud'` → amber "may leave your browser"; otherwise green
  "nothing leaves." Derived directly from `useSettingsStore.aiMode`, no new state.
- **Engine state:** `useDatasetsStore.workerStatus`, same text mapping `StatusConsole` (old shell)
  already uses.
- **Ingestion / query stats:** table count × row count (from `useDatasetsStore.tables`) and the
  last query's timing (`useQueryStore`) — the same two ambient facts `StatusConsole` already
  surfaces; no new ingestion-progress plumbing is built (`IngestionPanel`'s own `TelemetryPanel`
  already owns in-flight progress during Acts 0/1, before the `'shell'` act ever mounts this bar).
- **Kill-switch "paused":** renders only when `usePauseSignalStore.lastPaused` is non-null (absent
  otherwise, per the density budget) — see Scope call 2.
- **Gear → Settings:** opens the same `AISettingsPanel` (`hideModeSwitch`) the AI pane's "Configure
  workspace" button opens — one modal, two openers, `settingsOpen` state lifted to `ShellGrid`
  (mirrors old shell `AppContent`'s own pattern). **Not built:** a dedicated Settings **tab** —
  §13.3 itself marks that "candidate scope, contents not decided," not a W7 commitment.
- **Theme quick-toggle — explicitly not built.** `useSettingsStore.theme` is a persisted field
  today with **no code anywhere applying it to the DOM** (checked: no `data-theme` writer, no
  light/dark class toggle exists in this codebase yet). §13.3's own "Anticipated feature homes"
  list names full theme control as v0.5-candidate scope; rendering a toggle that changes a
  persisted value nothing reads would be a fake control, not a quick-toggle. Deferred alongside
  the Settings tab, not silently dropped.

## Files

New: `src/features/ai/ModeSwitches.tsx` (+ test), `src/features/ai/AIPane.tsx` (+ test),
`src/app/useApplyWorkbenchAIDefault.ts` (+ test), `src/features/inspector/Inspector.tsx` (+ test),
`src/stores/inferredEdges.ts` (+ test), `src/stores/pauseSignal.ts` (+ test),
`src/features/status/StatusBar.tsx` (+ test).
Modified: `src/stores/selection.ts` (+ test additions), `src/features/ai/AISettingsPanel.tsx`
(`hideModeSwitch` prop; pause-signal report on the vault's `'paused'` code),
`src/features/profiling/dossier/useDatasetBaseline.ts` (mirrors `inferredEdges` into the new
store), `src/features/map/Erd.tsx` (+ test additions: edge/column click selection),
`src/features/map/DatasetMap.tsx` (passes the new selection slots to `Erd`),
`src/features/profiling/ColumnCard.tsx` (+ test additions: optional `onSelect`/`selected`),
`src/features/profiling/ProfileDashboard.tsx` (wires column selection),
`src/app/WorkbenchShell.tsx` (+ test additions: mounts `AIPane`/`Inspector`/`StatusBar` in their
regions; lifts `settingsOpen`).

## Dependencies

W2 (selection store, `ExplorerPanel`) — shipped 2026-07-24. W3 (tab model) — shipped 2026-07-24.
W4 (dataset map, `Erd`, `useDatasetBaseline`) — shipped 2026-07-25. W6
(`workbenchAIDefaults.ts`'s pure logic) — shipped 2026-07-25.

## Acceptance criteria

- [x] `ModeSwitches` sets the correct `(aiMode, byokPreference)` pair for each of the four
      buttons; a disclosure line renders iff `aiMode === 'cloud'`; "Configure workspace" is always
      present regardless of mode
- [x] `AISettingsPanel` with `hideModeSwitch` renders no `Mode` fieldset but all other sections
      unchanged; the old shell's existing call site (no prop passed) is pixel-for-pixel unchanged
      and its existing tests pass unmodified
- [x] A fresh session with `aiMode === null` and a capable-device probe returning `true` ends up
      with `aiMode === 'local-model'`; returning `false` ends with `aiMode === 'local-only'`; an
      already-set `aiMode` (including one restored from persisted settings) is never overwritten
- [x] Selecting a table, then a column, then an edge each updates only their own selection slot
      and `lastSelectionKind`; the Inspector renders the table/column/edge scent matching whichever
      is current
- [x] Removing/re-pointing/restoring/adding an edge from the Inspector updates `useRelationshipsStore`
      and is reflected in the map's own `Erd` (same store, one source of truth) without a second
      `loadRelationships` fetch firing (assert the mock is called once across both consumers
      mounted together)
- [x] Clicking an ERD wire selects that edge (`data-selected` true) without also requiring a table
      click; clicking a field row selects both the table and the column
- [x] `StatusBar` shows the posture dot, engine state, table/row/query stats, and — only when
      `usePauseSignalStore.lastPaused` is set — a paused notice; gear opens the shared settings
      modal with `hideModeSwitch`
- [x] A vault `'paused'` response (`storeVaultedKey`/`deleteVaultedKey`) sets
      `usePauseSignalStore.lastPaused`; an unrelated vault failure code does not
- [x] Full existing suite green; `tsc -b` clean; `oxlint` clean on every changed file; `graphify
      update .` run

## Test plan

Vitest + React Testing Library, following `WorkbenchShell.test.tsx`/`DatasetMap.test.tsx`'s
existing mocking conventions.

- `ModeSwitches.test.tsx`, `AIPane.test.tsx`: mode-to-store mapping; collapse toggle;
  `AIChatModule` renders inside (mocked the same way `WorkbenchShell.test.tsx` already mocks
  DuckDB-worker-reaching services).
- `useApplyWorkbenchAIDefault.test.ts`: capable/incapable branches; no-op when `aiMode` already set.
- `Inspector.test.tsx`: one case per selection kind; the override-controls case asserts a single
  `loadRelationships` call when both `DatasetMap` and `Inspector` are mounted together.
- `selection.test.ts`: extend for `selectColumn`/`selectEdge`/`lastSelectionKind`, keeping the
  existing table-only assertions passing unmodified.
- `inferredEdges.test.ts`, `pauseSignal.test.ts`: plain store unit tests.
- `Erd.test.ts` (new, alongside `layout.test.ts`) or additions to `DatasetMap.test.tsx`: wire click
  → `onSelectEdge`; field-row click → both callbacks.
- `AISettingsPanel.test.tsx` (extended — already existed): `hideModeSwitch` behavior; pause-signal
  report on a `'paused'` vault code, alongside its existing mode/BYOK/vault coverage.
- `StatusBar.test.tsx`: each ambient item's presence/absence condition.
- Run the full existing suite last.

## Definition of done

The Workbench's right AI pane, bottom inspector, and status bar render real, tested content in
place of W1's placeholder regions; the capable-device AI recommendation W6 shipped as pure logic
is now wired into a real switch a user can see and act on; map relationship overrides are
editable from the inspector through the same store the old shell's Join Graph already uses, with
no duplicate inference fetch. D72 grounding and proactive kill-switch polling are named, deferred
follow-ups, not silent gaps. Full suite green, `tsc -b`/`oxlint` clean, `graphify update .` run.
