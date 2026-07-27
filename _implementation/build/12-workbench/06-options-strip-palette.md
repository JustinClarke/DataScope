# W5 — Options Strip + Command Palette

**Tier:** v0.60 (the Workbench, D71) · flag-gated `WORKBENCH_ENABLED`, flag-on only ·
**Master spec:** §13.3 ("The options strip" / "The command palette" paragraphs), §19 (W5 row), D68a
(broker ranking), D58 (one ranker, no parallel pipelines)

> **The options strip is retired by D73 (2026-07-26) — v0.70 / S6.** `OptionsStrip.tsx` goes;
> its prompts relocate into the dataset map's **Suggested Explorations** (top 3 + view-more).
> **This leaf's contract outlives its component**, and whatever renders the ranked list next
> inherits it whole: membership and order stay a client-side, subject-scoped filter of the
> dataset-wide `RankedAction[]` (**one ranker, never a parallel path** — D58), gated actions keep
> their disabled-with-reason teaching copy somewhere reachable, and **SQL-bearing actions route
> to the drawer console**, not to the deleted SQL tab. Strip removal and that re-route are one
> design change, not two. **The command palette half of this leaf is untouched** and still
> launch-blocking — its registry must reach every feature home, and the entry list changes with
> `'sql'`'s deletion and `ingestion`'s wiring (S1/S5). See
> [`../14-workspace-streamline/`](../14-workspace-streamline/README.md).

## Objective

W4 gave the map real content but no way to act on it beyond the Blueprint's own embedded action
band and the explorer's click-to-Profile. W5 adds the two remaining pieces of Workbench chrome
the charter names: **the options strip** (above the multi-table map, acting on the current
selection) and **the command palette** (⌘K, the universal cross-tab launcher). Per §13.3, the
palette's registry must "reach every §13.0/§6-inventory feature home — a hard W5 gate": every
destination the old flat sidebar could reach must be *nameable* in the Workbench, even where it
isn't wired yet.

## Scope call (made this session, confirmed with the human before building)

§13.3 describes the strip filtering "the dataset-wide `RankedAction[]`" and the palette reaching
"every feature home," but today only `'map'` and `'profile'` are real `TabType`s — `sql`, `pivot`,
`charts`, `correlation`, and `export` still only exist as the old shell's flat modules, with no
Workbench tab type, no `TAB_KIND` classification, and no `TAB_TYPE_BY_MODULE` entry. Reaching those
five destinations *for real* — new `TabType` members, mounting `SqlModule`/`PivotModule`/
`ChartsModule`/`CorrelationModule`/`ExportModule` as tab content the same way W3 mounted
`ProfileDashboard` — is a materially bigger, separate change. **Asked the human directly: wire all
five for real now, or build the strip/palette mechanism against today's two real destinations and
render everything else disabled-with-reason.** Answer: **mechanism-only** — this leaf does not
add any new `TabType`, does not touch `TAB_KIND`, and does not mount any of the five modules.
Wiring them is explicit open scope for a follow-up leaf (same "explicitly deferred, not cut"
posture as W2's Add-data and W3's pinning), noted below and in BUILD-ORDER.md's log so a future
session doesn't assume the palette is feature-complete.

**Consequence, stated plainly:** with nothing else wired, the strip and palette will mostly render
disabled entries at this leaf. That's the honest state of "mechanism built, content not yet
wired," not a bug — verified explicitly in the test plan (at least one disabled entry per
not-yet-wired destination, with its reason visible).

**Inventory accounting (the "every feature home" gate), one-line-per-destination:**

| Old `SidebarModule` | Workbench home at W5 | Reachable today? |
| :--- | :--- | :--- |
| `profile` | `'profile'` tab (W2/W3) | Yes — strip + palette both reach it for real |
| *(the map itself)* | `'map'` tab (W4) | Yes — palette reaches it for real |
| `dossier` | superseded — the map's single-table Blueprint face *is* the re-homed Dossier (D71, already true since W4) | N/A — no separate entry needed |
| `relationships` | superseded — the map's ERD *is* the D24-fed re-skin of the Join Graph (D71); FK-edge override editing specifically stays on the old shell's `JoinGraphModule` until W7's inspector (per 05-dataset-map.md's own scope call 5) | N/A for browsing; override editing genuinely absent from the Workbench until W7 |
| `sql` / `pivot` / `charts` / `correlation` / `export` | no `TabType` yet | No — palette lists each, disabled-with-reason; strip only ever shows a ranked action for these if `rankNextActions` names them, and it renders disabled the same way |
| `ai` | the right AI pane (W7), never a tab | No — palette lists it, disabled-with-reason pointing at W7 |
| `ingestion` (Add data) | the explorer's Add-data surface (W2's own deferral, still open) | No — palette lists it, disabled-with-reason pointing at that still-open leaf |

## Spec

### The options strip (`features/map/OptionsStrip.tsx`)

- **Multi-table face only.** The single-table Blueprint (`DatasetDossier`) already renders and
  handles its own tier-1 ranked-action band (`handleSelectAction`, D68c) — mounting a second strip
  above it would duplicate that UI over the same data. `SingleTableBlueprint` is unchanged; only
  `MultiTableMap` gains the strip. (§13.3 says "map-tab-only," not "both faces" — this reads that
  as "the tab's chrome," compatible with the Blueprint face carrying its own equivalent already.)
- **Data source: `MultiTableMap`'s existing `useDatasetBaseline` call, not a second fetch.**
  `MultiTableMap` already calls the hook for `edges`/`baseline`/`tailored`/`paused`/`headlineFact`;
  this leaf adds `tableInsights` to that destructure and passes `{ tables, tableInsights,
  selectedTableId }` into `OptionsStrip` as props. No new service call, no duplicate
  `loadDossierInsights`/`loadTimeCoverage` round trip (the exact duplication W4's own
  `useDatasetBaseline` extraction already exists to avoid).
- **Membership + order = filter, not a second ranker (D58).** `OptionsStrip` computes
  `rankNextActions(tables, tableInsights ?? [])` once (`useMemo`) — the same dataset-wide list
  the Verdict/palette-adjacent surfaces already use, capped at the broker's own 5, not the
  Verdict's tier-1 3. It is then **filtered** by the selected subject: resolve `selectedTableId` to
  its `tableName`; if one is selected, keep actions whose `prefill.prefilledConfig.tableName`
  either matches it or is absent (dataset-wide/unresolvable actions, e.g. an ambiguous correlation
  action with no single owning table); if nothing is selected, show the full list unfiltered. This
  is exactly "a client-side, subject-scoped filter of the dataset-wide `RankedAction[]`" — no
  second call to `evaluateCapabilities`/`rankNextActions` with a different table subset, which
  would be a second ranking path.
- **Disabled-with-reason, module-readiness edition.** Every action's `module` is checked against
  the new `isDestinationReady()` (below). Ready (`'profile'` only, today) → a real button, `onClick`
  calls `openDestination(action.module, action.tab, action.prefill.prefilledConfig)`. Not ready →
  rendered disabled, wrapped in the existing `Tooltip` component (same idiom `SidebarCard` already
  uses for capability-gated cards), reason `` `Arrives when ${MODULE_LABELS[module]} lands in the
  Workbench` ``. This is the same "gated actions render disabled-with-reason" contract §13.3 names,
  with "not yet wired in this shell" as an additional disable reason alongside capability gating —
  capability gating itself already happened one level down, inside `rankNextActions`/
  `evaluateCapabilities`, which never emits an illegal action in the first place.
- **Empty state.** If the filtered list is empty (a real, reachable case — e.g. selecting a
  non-largest table when the only dataset-wide floor action targets the largest one), render a
  muted "No suggested actions for this selection" line rather than an empty strip, matching the
  Verdict's own honest-degrade tone (no manufactured content).
- **Not built this leaf (explicitly deferred, not cut):** the "legal-but-unranked collapses under a
  'more' affordance" nuance and per-subject (rather than pooled) capability re-evaluation for
  membership. Both require real module content to matter — a "more" affordance with nothing real
  underneath five of its six candidate destinations, and a per-subject capability recompute for
  destinations that don't exist yet, are exactly the speculative code Part I/II forbid. Revisit
  once the module-wiring follow-up lands.

### The command palette (`features/palette/CommandPalette.tsx` + `lib/paletteRegistry.ts`)

- **`lib/paletteRegistry.ts` (pure).** `buildPaletteEntries(tables: TableRegistryEntry[]):
  PaletteEntry[]` returns, in order: one `open-map` entry (always enabled); one `open-profile`
  entry per registered table (always enabled — matches the explorer's own click-to-Profile,
  no capability gate beyond the table existing); then the fixed not-yet-wired list from the
  inventory table above (`sql`, `pivot`, `charts`, `correlation`, `export`, `ai`, `ingestion`),
  each `enabled: false` with its own `disabledReason`. `dossier`/`relationships` are not separate
  entries — the `open-map` entry already covers both supersessions (documented in the inventory
  table, not re-derived at runtime).
- **`CommandPalette.tsx` (React, mounted once in `WorkbenchShell`'s `ShellGrid`).** A global
  `keydown` listener toggles an open/closed boolean on ⌘K / Ctrl+K (`preventDefault`, so the
  browser's own bookmark/search shortcut doesn't fire underneath); Escape closes. While open:
  a text input filters `buildPaletteEntries(tables)` by substring match on `label`; each entry
  renders as a button, disabled entries via the same `Tooltip` idiom the strip uses. Activating
  an enabled entry calls `useTabsStore.getState().openTab('map', MAP_TAB_SUBJECT)` (now exported
  from `WorkbenchShell.tsx`) or `openDestination('profile', tableId)`, then closes and clears the
  query.
- **Scope: mounted inside `ShellGrid` only**, not Act 0/1. Both acts are W6's stopgap chrome-free
  placeholders pending the real welcome page; giving the palette a pre-data home is that phase's
  concern, not this one's.

### Shared addition: `services/navigation.ts` gains `isDestinationReady()` and `MODULE_LABELS`

- `export function isDestinationReady(module: SidebarModule): boolean { return module in
  TAB_TYPE_BY_MODULE; }` — the single source of truth both the strip and the palette-adjacent
  reasoning point at, rather than two components independently re-deriving "is this wired yet"
  from `TAB_TYPE_BY_MODULE`'s shape.
- `export const MODULE_LABELS: Record<SidebarModule, string>` — the human-readable names used in
  both components' disabled-reason strings (`'sql' → 'SQL'`, `'pivot' → 'Pivot'`, etc.), so the
  two surfaces never drift on what to call a given destination.

## Files

New: `src/features/map/OptionsStrip.tsx` (+ `.test.tsx`), `src/features/palette/CommandPalette.tsx`
(+ `.test.tsx`), `src/lib/paletteRegistry.ts` (+ `.test.ts`).
Modified: `src/features/map/DatasetMap.tsx` (`MultiTableMap` destructures `tableInsights` too,
mounts `OptionsStrip`), `src/services/navigation.ts` (`isDestinationReady`, `MODULE_LABELS`),
`src/app/WorkbenchShell.tsx` (`MAP_TAB_SUBJECT` exported, `CommandPalette` mounted in `ShellGrid`).
No changes to `stores/tabs.ts`, `types/tabs.ts`, or `lib/capabilities.ts` — this leaf consumes
`rankNextActions`, it doesn't change it.

## Dependencies

W3 (tab model maturation) and W4 (dataset map) — both shipped 2026-07-24/25.

## Acceptance criteria

- [ ] `buildPaletteEntries` returns the map entry, one profile entry per table (in table order), then
      the seven fixed not-yet-wired entries, each with a non-empty `disabledReason`
- [ ] The palette opens on ⌘K/Ctrl+K, closes on Escape and on selecting an enabled entry; typing
      filters the visible list by label substring (case-insensitive)
- [ ] Activating the map entry opens/activates the singleton `('map', 'workspace')` tab; activating
      a profile entry calls `openDestination('profile', tableId)`; disabled entries are inert (no
      click handler fires) and show their reason
- [ ] `OptionsStrip` renders only inside the multi-table face (`MultiTableMap`), never alongside
      `SingleTableBlueprint`
- [ ] With two tables and no selection, the strip shows the full dataset-wide ranked list (up to 5);
      selecting a table filters to that table's actions plus any dataset-wide (no-`tableName`) ones
- [ ] A ranked action whose `module` is `'profile'` renders as a real, clickable button; any other
      module renders disabled with an `Arrives when … lands in the Workbench` reason
- [ ] An empty filtered result renders the muted empty-state line, not an empty strip
- [ ] `isDestinationReady('profile')` is `true`; every other `SidebarModule` is `false`
- [ ] Full existing suite green; `tsc -b` clean; `oxlint` clean on every changed file; `graphify
      update .` run

## Test plan

Vitest + React Testing Library, following the mocking conventions `DatasetMap.test.tsx` and
`WorkbenchShell.test.tsx` already established (`vi.hoisted` + `vi.mock` on `services/dossier`,
`services/relationships`, `services/navigation`).

- `paletteRegistry.test.ts`: pure, no mocking — table list in, entry list out; assert order,
  `enabled`, and `disabledReason` per entry.
- `OptionsStrip.test.tsx`: pass `tables`/`tableInsights`/`selectedTableId` directly as props (no
  store wiring needed beyond mocking `services/navigation`'s `openDestination`) — feed a synthetic
  `TableInsights[]` fixture through `rankNextActions` directly in the test (reusing
  `capabilities.test.ts`'s existing fixtures/patterns rather than inventing new ones) to get a
  deterministic ranked list, then assert the enabled/disabled split and the subject filter.
- `CommandPalette.test.tsx`: mock `services/navigation` and `stores/tabs`; assert the keyboard
  toggle, the filter input, and that activating an entry calls the right facade function.
- `DatasetMap.test.tsx` gains one assertion: the multi-table face renders `data-testid=
  "options-strip"`; the single-table face does not.
- Run the full existing suite last.

## Definition of done

Strip and palette both ship as real, tested mechanism against today's two live destinations
(`map`, `profile`); every other feature home is discoverable and honestly marked not-yet-wired,
satisfying §13.3's "reach every feature home" as an inventory/discoverability gate rather than a
functional one for this leaf — the functional completion of that gate is explicit follow-up scope,
logged in BUILD-ORDER.md so it isn't mistaken for finished. Full suite green, `tsc -b`/`oxlint`
clean, `graphify update .` run.
