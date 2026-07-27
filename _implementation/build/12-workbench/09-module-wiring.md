# W7.5 — Module Wiring

**Tier:** v0.60 (the Workbench, D71) · flag-gated `WORKBENCH_ENABLED`, flag-on only ·
**Master spec:** §13.3 ("the palette is Workbench-launch-blocking, not polish"), §19 (W7.5 row,
inserted 2026-07-25), D68e (thread pre-config), D58 (one ranker, no parallel pipelines)

> **Partly undone by D73 (2026-07-26) — v0.70 / S5.** Of the five tab types this leaf wired,
> **`'sql'` is deleted** — the drawer console replaces the standalone page, so `TabType`'s
> member, `TAB_TYPE_BY_MODULE.sql` and the palette's SQL entry all go or re-point, and every
> SQL-bearing `RankedAction` (D68e's `duplicates` insight) routes to the console instead.
> **Pivot needs its own results home**: it shares `QueryResultsPanel` with the SQL page today,
> and that sharing is deliberate (D49 — one execution path, not two), so it cannot simply
> inherit the deleted page's leftovers. Charts, Correlation and Export are unaffected as tab
> types; Export's *entry point* moves to the title-bar cluster while the tab itself stays. See
> [`../14-workspace-streamline/`](../14-workspace-streamline/README.md).

## Objective

W5 built the strip/palette *mechanism* against only the two real destinations that existed at the
time (`map`, `profile`), leaving SQL, Pivot, Charts, Correlation, and Export disabled-with-reason
— a deliberate, human-confirmed scope call, logged as "explicit open scope for a follow-up leaf,"
not cut. Every phase since (W6, W7) named it as still unowned. Picking up W8 surfaced that it can't
be deferred further: §19's W8 gate is "every capability reachable in the Workbench, no orphaned
exports" — the exact five destinations this leaf closes are the only orphans left. This leaf makes
them real `TabType`s, mounting the same components the old shell already uses, unmodified in
substance.

## Scope call (made this session, confirmed with the human before building)

Two questions, both resolved by reading the existing code rather than guessing:

**1. Insert as its own phase, or fold into W8?** Asked directly (AskUserQuestion): fold into W8's
leaf, split into its own phase first, or build W8 minus cutover and leave the gate failing. Answer:
**split into its own phase**, sequenced strictly before W8 — recorded in `DATASCOPE.md` §19 and
mirrored into this folder's `README.md`. Keeps W8's own leaf about cutover mechanics only, and
keeps this leaf's DoD independently checkable.

**2. Thread pre-config (D68e) for the five new destinations.** Reading the five modules
(`SqlModule`, `PivotModule`/`PivotBuilder`, `ChartsModule`, `CorrelationModule`, `ExportModule`)
found a real gap, not a hypothetical one: `hooks/useThreadPrefill.ts` unconditionally reads the old
shell's global `useUIStore.getState().pendingPrefill`, and `ChartsModule` separately reads
`useUIStore.activeTabId` to pick its initial chart sub-type. The Workbench's `openTab` path never
writes to `stores/ui.ts` at all — `services/navigation.ts`'s `openDestination` already wraps a
caller's `prefill` into the tab's own `initializer` (a `ThreadConfig`, set once at tab creation,
D68e), but nothing reads it back out for these five. This is already exercised today:
`lib/capabilities.ts` has live `RankedAction`s with `module: 'charts', tab: 'time-series'` and
`tab: 'categorical'`, and W5's `OptionsStrip` already calls `openDestination(action.module,
action.tab, action.prefill.prefilledConfig)` for them — currently disabled, about to become live
buttons this leaf. Mounting the five modules unchanged would make those buttons open the right tab
but silently drop the answer they were supposed to open *on* — a regression from what the old shell
already does with the same ranked action.

**Resolution:** give `useThreadPrefill` an optional override parameter — an explicit value
(including `null`) always wins; `undefined` (i.e. every existing call site, unchanged) preserves
today's global-store read-and-clear behavior byte-for-byte. `TabContent` (in `WorkbenchShell.tsx`)
passes `tab.initializer?.prefilledConfig ?? null` down as that override — the same per-tab-instance
prop-threading pattern W3 already established for `ProfileDashboard initialTableId={tab.subject}`,
not a second global. `ChartsModule` gets the same treatment for its `requestedTab` (chart sub-type)
concern, sourced from `tab.subject` — which already carries exactly this value, since
`openDestination`'s existing generic mapping (`tab ?? module`) uses `action.tab` (e.g.
`'time-series'`) as the subject whenever a caller supplies one, falling back to the module's own
name (`'charts'`) otherwise; passing that straight through as `requestedTab` needs no special-casing
because `'charts'` never matches a real `ChartTabId`, so it already falls through to
`ChartsModule`'s own first-eligible default. No change to `openDestination`, `ThreadConfig`, or the
tab dedup key is needed — this was already built generically at W0/W5, just not yet populated.

**Consequence for tab identity:** since `openDestination` uses `tab ?? module` as the singleton
dedup subject, two `RankedAction`s naming different Charts sub-types (e.g. `time-series` vs.
`categorical`) open two *separate* Charts tabs, not one shared tab with an internal switch — each
`(type, subject)` pair is its own singleton, same rule every other tab type already follows. Not a
bug: consistent with the existing dedup contract, and avoids inventing a second "which sub-view"
channel alongside `subject` for this leaf alone.

## Spec

### `types/tabs.ts`

- `TabType` gains five members: `'sql' | 'pivot' | 'charts' | 'correlation' | 'export'`.
- `TAB_KIND` classifies all five `'singleton'` — none of these are per-table; they mirror the old
  shell's own single-instance-per-module behavior (one SQL playground, one Pivot builder, etc., not
  one per table). `TAB_KIND` being a `Record` over the closed union forces this at compile time.

### `services/navigation.ts`

- `TAB_TYPE_BY_MODULE` gains five identity mappings: `sql: 'sql'`, `pivot: 'pivot'`, `charts:
  'charts'`, `correlation: 'correlation'`, `export: 'export'`. `isDestinationReady` and the strip's
  disabled/enabled split update automatically — no changes needed there.

### `hooks/useThreadPrefill.ts`

- Signature becomes `useThreadPrefill(override?: ModulePrefill): ModulePrefill`. When `override !==
  undefined`, return it directly (via the same lazy `useState` initializer, so it's available on
  first render) and skip the global-store read/clear entirely. When `override === undefined`,
  behavior is unchanged: read `useUIStore.getState().pendingPrefill` once, clear it in a mount
  effect. Every existing call site (`SqlModule`, `PivotBuilder`, `ChartsModule`,
  `CorrelationModule`, all called with no prop in `AppContent`) is unaffected.

### The five modules

- `SqlModule`, `CorrelationModule` each gain an optional `prefill?: ModulePrefill` prop, passed
  straight to `useThreadPrefill(prefill)` in place of the no-arg call.
- `PivotModule` gains an optional `prefill?: ModulePrefill` prop, forwarded to `<PivotBuilder
  prefill={prefill} />`; `PivotBuilder` itself gains the same optional prop, threaded the same way
  as `SqlModule`.
- `ChartsModule` gains two optional props: `prefill?: ModulePrefill` (as above) and `requestedTab?:
  string | null`. Internally, `requestedTab ?? useUIStore((state) => state.activeTabId)` — a
  Workbench mount always supplies the prop (even `null`), so it never falls through to the old
  shell's global; an old-shell mount never supplies it, so behavior is unchanged.
- `ExportModule` is mounted unchanged — it calls neither `useThreadPrefill` nor reads `useUIStore`,
  already fully dataset-wide.

### `app/WorkbenchShell.tsx`

- `TabContent` grows five branches, one per new `TabType`, each computing `const prefill =
  tab.initializer?.prefilledConfig ?? null;` once and passing it down:
  ```
  if (tab.type === 'sql') return <SqlModule prefill={prefill} />;
  if (tab.type === 'pivot') return <PivotModule prefill={prefill} />;
  if (tab.type === 'charts') return <ChartsModule prefill={prefill} requestedTab={tab.subject} />;
  if (tab.type === 'correlation') return <CorrelationModule prefill={prefill} />;
  if (tab.type === 'export') return <ExportModule />;
  ```

### `lib/paletteRegistry.ts` + `features/palette/CommandPalette.tsx`

- `PaletteAction` gains `{ kind: 'open-module'; module: 'sql' | 'pivot' | 'charts' | 'correlation'
  | 'export' }`.
- `buildPaletteEntries` moves these five out of `NOT_YET_WIRED` into real entries (`enabled: true`,
  `action: { kind: 'open-module', module: ... }`), in the same relative order they held in
  `NOT_YET_WIRED`. `NOT_YET_WIRED` keeps only `ai` and `ingestion` — both still genuinely unwired
  (AI has no tab, it's an always-on pane; Add-data remains W2's own open deferral).
- `CommandPalette`'s `activate()` gains an `else if (entry.action.kind === 'open-module')` branch
  calling `openDestination(entry.action.module)` — no `tab` argument, so the subject falls back to
  the module name, matching the `open-profile` branch's existing shape.

### `features/map/OptionsStrip.tsx`

No changes — it already calls `openDestination(action.module, action.tab,
action.prefill.prefilledConfig)` unconditionally and checks `isDestinationReady`/`MODULE_LABELS`
generically. Once `TAB_TYPE_BY_MODULE` gains the five entries, previously-disabled strip actions
for `sql`/`charts`/`correlation` (whichever ones `rankNextActions` actually emits) light up with no
code change here.

## Files

Modified: `src/types/tabs.ts`, `src/services/navigation.ts`, `src/hooks/useThreadPrefill.ts`,
`src/features/sql/SqlModule.tsx`, `src/features/sql/PivotModule.tsx`,
`src/features/sql/PivotBuilder.tsx`, `src/features/charts/ChartsModule.tsx`,
`src/features/charts/correlation/CorrelationModule.tsx`, `src/app/WorkbenchShell.tsx`,
`src/lib/paletteRegistry.ts`, `src/features/palette/CommandPalette.tsx`, plus each file's test
counterpart. No changes to `src/features/export/ExportModule.tsx` (mounted unchanged), `stores/
tabs.ts` (dedup logic already generic), or `lib/capabilities.ts` (this leaf consumes
`rankNextActions`, doesn't change it).

## Dependencies

W5 (options strip + command palette mechanism) — shipped 2026-07-25.

## Acceptance criteria

- [x] `TabType` includes all five new members; `TAB_KIND` classifies each `'singleton'`
- [x] `isDestinationReady` returns `true` for `sql`, `pivot`, `charts`, `correlation`, `export`
      (and still `profile`); `false` only for `ai`/`ingestion`
- [x] Opening each of the five via the palette mounts the corresponding module inside a tab; a
      second activation of the same palette entry reuses the existing tab (singleton dedup), not a
      duplicate
- [x] A `RankedAction` naming `module: 'charts', tab: 'time-series'` (or `'categorical'`), opened
      via the strip, mounts `ChartsModule` with that sub-type already selected — not the default
      first-eligible tab
- [x] A `RankedAction` carrying a `prefilledConfig` (e.g. the `duplicates` insight's SQL, or a
      correlation pair) opens the destination already showing that answer, matching the old shell's
      existing "opens on the answer" behavior for the same action
- [x] Every existing old-shell test for `SqlModule`, `PivotModule`, `PivotBuilder`, `ChartsModule`,
      `CorrelationModule`, and `useThreadPrefill` passes unmodified (no prop passed → `undefined` →
      old global-store behavior, byte-for-byte)
- [x] `NOT_YET_WIRED` in `paletteRegistry.ts` contains only `ai` and `ingestion`
- [x] Full existing suite green; `tsc -b` clean; `oxlint` clean on every changed file; `graphify
      update .` run

## Test plan

Vitest + React Testing Library, following `06-options-strip-palette.md`'s own conventions
(`vi.hoisted` + `vi.mock` on `services/navigation`/store modules where a test needs to isolate a
component from the real stores).

- `useThreadPrefill.test.ts`: existing no-arg cases unchanged; new cases for `override` — an
  explicit value (including `null`) is returned as-is and the global store is never read or
  cleared.
- Per-module test files: one new case each proving the `prefill`/`requestedTab` prop, when passed,
  wins over whatever the global store holds (set the global store to a *different* value than the
  prop in the test, assert the prop's value renders — proves the override path, not just "no prop
  passed").
- `paletteRegistry.test.ts`: assert the five moved entries are `enabled: true` with the right
  `action`; assert `NOT_YET_WIRED`'s remaining two.
- `CommandPalette.test.tsx`: one case per new entry, activating it and asserting
  `openDestination` was called with the right module and no `tab` argument.
- `WorkbenchShell.test.tsx`: open each of the five via the store directly (`openTab('sql', 'sql',
  ...)` etc.) and assert the right module's own test-id/content renders in the tab's content slot.
- Run the full existing suite last.

## Definition of done

All five previously-orphaned feature homes are real, reachable, singleton Workbench tabs, D68e
thread pre-config intact for each (not silently dropped), zero behavior change to any old-shell
call site of the same components. `NOT_YET_WIRED` is down to `ai`/`ingestion` only — both still
correctly named as separate, already-tracked open scope, not this leaf's job. Full suite green,
`tsc -b`/`oxlint` clean, `graphify update .` run.
