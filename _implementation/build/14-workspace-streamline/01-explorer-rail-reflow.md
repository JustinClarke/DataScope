# S1 — Explorer rail reflow

**Tier:** v0.70 (the workspace streamline, D73 execution) · **Master spec:** §19 (the v0.70
subsection, S1 row), §13.3 (the detail-ladder table — rung 1) · **Decision row:** D73 ·
**Depends on:** v0.69 (chrome/tokens, shipped) · **Gated by S0:** no — S0 gates S7 entirely and
S5's ceiling number only; S1 is explicitly free to proceed.

This leaf lands immediately before its own implementation, in the same session, per §19's binding
constraint (no `src/` code for a phase before that phase's leaf doc) — the acceptance criteria
below are checked as the code lands, not written up separately afterward.

## Objective

Reflow the explorer rail's table rows from one truncating line into two (name unclamped,
`N rows × N cols · origin` demoted beneath it), add a chevron that discloses each table's columns
at **rung 1 of the detail ladder** (structure only — names, key markers, type chips; always links
out to the tab, never grows into rung 2/3 content), and give the rail an Add-data `+` that closes
W2's own recorded deferral by making `ingestion` a real Workbench tab instead of an Act-0/1-only
mount.

## Scope calls

**1. The reflow is additive to `TableList`, not a fork.** `TableList` is shared by `ExplorerPanel`
(the rail) and `IngestionPanel` (Act 0/1, explicitly out of scope for this tier). Two new optional
props — `reflow?: boolean` and `edges?: FkEdge[]` — default to `undefined`/`[]` so
`IngestionPanel`'s call site renders exactly as it does today, the same additive-prop precedent
this file already follows for `onSelectTable` and `hideHeading`. This is also where V6e's deferred
255px row-composition finding lands: rather than one row shape serving both a 256px rail and a
full-width Act 0/1 panel, the rail gets its own composition through this flag, and the truncation
V6e found stays fixed **only** where it was reported.

**2. Rung-1 discipline, deliberately short of what the reference mocks draw.** The
2026-07-26 human-resolved detail-ladder gate (this folder's `README.md`) is explicit: "the rail's
disclosure does not grow the ideation round's second in-rail disclosure level (per-column
unique/missing counts, distribution preview) — those are rung-2/rung-3 content." The reference
mocks (`reference-images/01-explorer-reflowed-table-rows-{a,b}.png`) draw exactly that fuller
disclosure — Unique Values / Missing (Nulls) / Distribution Preview / Range boxes per column. This
leaf does not reproduce them. The chevron discloses **name, key marker, type chip** per column and
nothing computed — no query, no stat — plus a "View full profile →" link that opens the table's
Profile tab, matching the ladder table's rung-1 row ("Always links out to the tab view") rather
than the mock's illustration of deeper content some other surface may eventually own.

**3. The type chip is `SemanticType`, not the mock's raw physical type.** The mocks show `VARCHAR`
/ `DOUBLE` / `TIMESTAMP` — DuckDB's physical type. This app already has a "type chip" concept:
`ColumnCard.tsx`'s `TypeBadge`, keyed on `SemanticType` (`Identifier` / `Categorical` /
`Quantitative` / `Temporal` / `Textual`) — the one vocabulary every classification-driven surface
in this codebase already uses (capabilities, insights, the Profile tab itself). Introducing
physical type as a second column-type language into the rail would fork that vocabulary for a
cosmetic match to the mock. `TypeBadge` is exported from `ColumnCard.tsx` (a one-word change, no
behavior change to its existing callers) and reused here instead of rebuilt.

**4. Key markers reuse `Erd.tsx`'s existing derivation, not a new one.** PK: `keyColumnsFor`
(`lib/dossier.ts`, pure — `semanticType === 'Identifier'`), same function `ErdCard` already calls.
FK: the dataset-wide inferred edges. `useDatasetBaseline` (the map tab) is already the sole fetch
owner for `loadRelationships`, mirroring its raw result into `useInferredEdgesStore` for exactly
this reason (the store's own header comment: "a second consumer can apply overrides itself without
a second concurrent `loadRelationships` query"). `ExplorerPanel` reads that mirrored store and
calls `applyOverrides` itself — the identical pattern `Inspector.tsx`'s `EdgeScent` already uses —
so the rail's FK markers agree with the user's own add/remove/repoint edits exactly as the ERD and
inspector do, and no second DuckDB relationship-inference query fires. (In a from-empty session
where no map tab has opened yet, `useInferredEdgesStore` is simply `[]` and every column
shows PK-or-neither; `useMapAutoOpen` opens the map tab automatically on first dataset load in the
ordinary case, so this is a cold-start edge rather than the common path.)

**5. Multi-open, both collapsed by default — the recorded lean, taken as the answer.** The
folder's open-questions list named "accordion vs. several tables open at once (leaning
multi-open... all collapsed by default)" as unresolved. This leaf takes that lean rather than
re-opening the question a second time: expansion state is a local `Set<string>` of table ids inside
`TableList` (ephemeral view state, not shell-wide selection — no store), every table starts
collapsed, and opening one never closes another.

**6. The "warning affordance" is the existing table-level badges, not a new per-column one.** The
detail-ladder table names "warning affordance" among rung 1's contents. No per-column warning
producer exists yet — that is S2's Data Quality & Health panel. This leaf carries the already-shipped
table-level `sampled`/`stale` badges forward unchanged (they already render in the row's demoted
metadata line) rather than inventing a per-column warning icon with nothing behind it.

**7. `ingestion` becomes a real `TabType`, superseding its temporary palette glyph.**
`services/navigation.ts`'s own comment already named `ingestion` as "W2's own still-open
deferral," and `lib/paletteRegistry.ts`'s `NOT_YET_WIRED` entry for it is the only one of the two
not permanently unavailable (`ai` never becomes a tab; it's the always-on right pane). Wiring it
means: a `'ingestion'` `TabType` member, `TAB_TYPE_BY_MODULE.ingestion = 'ingestion'`,
`isDestinationReady('ingestion') === true`, and the palette entry moving from `NOT_YET_WIRED` to
`WIRED_MODULES`. Design.md's dingbat set is closed at six characters, all already assigned
(`◈` for `map`, lucide icons for the rest per V2) — the `＋` literal `CommandPalette.tsx` currently
shows for the *unavailable* state is explicitly that mock's placeholder for a not-yet-real
destination (V5 scope call 5), not a claim on the real glyph. Once wired, `EntryGlyph` resolves
`'ingestion'` through the normal `TAB_GLYPH` path like every other module, so this leaf assigns it
`lucide-react`'s `Plus` — same shape the mock's `＋` gestured at, now a proper SVG rather than a
text glyph reserved for "not built yet," and the same icon backs the rail's own Add-data button.

**8. `IngestionPanel` mounts as a tab unchanged — no new ingest UI.** The `'ingestion'` tab's
content is `<IngestionPanel />` verbatim, the same component Act 0/1 already mounts. Its internal
`navigateToPostIngestLanding()` call (reaching the old `useUIStore`) stays exactly as inert here as
`WorkbenchShell.tsx`'s own comment already documents it being at the Act-1 mount site — not a new
gap, the same already-accepted one now applying to a second call site.

## Spec

### `src/features/ingestion/TableList.tsx`

- New props: `reflow?: boolean` (default `false`), `edges?: FkEdge[]` (default `[]`).
- When `reflow` is false: unchanged, byte-for-byte.
- When `reflow` is true, each `<li>` renders two lines instead of one:
  - **Line 1:** a chevron button (`ChevronRight`/`ChevronDown`, `lucide-react`; always toggles this
    table's entry in the local expanded-set, whether or not classification has finished — see the
    disclosure's own empty state below) + the table name, no longer `truncate`/width-constrained,
    plus the existing refresh/remove actions unchanged on the trailing edge.
  - **Line 2 (demoted):** `{rows} rows × {cols} cols`, the origin badge, memory size, and the
    existing `fetched`/`stale`/`sampled` badges — the same content as today's single line, moved
    down and set in the muted `--color-ink-3` ink at `--text-xs`.
  - **Disclosure (only while expanded and `table.columns` is non-empty):** one row per column —
    a PK (`Key`, `--color-pk`) or FK (`Link`, `--color-fk`) icon or a blank spacer, the column
    name, `TypeBadge` (imported from `ColumnCard.tsx`), each row clickable
    (`onSelectColumn?.(table.id, column.name)` then `onSelectTable?.(table.id)`-equivalent open) —
    "links out," never expands further in place. A trailing "View full profile →" row does the
    same for the table as a whole. While `table.columns` is empty (still classifying), the
    expanded region shows "Profiling…" instead of an empty list.
- New export: `onSelectColumn?: (tableId: string, column: string) => void` prop, mirroring
  `onSelectTable`'s existing additive-optional shape.

### `src/features/profiling/ColumnCard.tsx`

`TypeBadge` gains an `export` keyword — no other change. Its existing callers are unaffected.

### `src/features/explorer/ExplorerPanel.tsx`

- Reads `useInferredEdgesStore`, `useRelationshipsStore`'s `removed`/`repointed`/`added`, and
  computes `edges` via `applyOverrides` — the same three-hook, one-`useMemo` pattern
  `Inspector.tsx`'s `EdgeScent` already uses (scope call 4).
- Passes `reflow` and `edges` to `TableList`; adds `onSelectColumn` wired to
  `useSelectionStore().selectColumn` followed by `openDestination('profile', tableId)` — the same
  two-call shape `handleSelectTable` already uses for the table-name click, so a column click and
  a table-name click both land on the Profile tab, the column click additionally seeding the
  shell-wide column selection `ProfileDashboard` already highlights on.
- `ExplorerHeader` gains a `+` icon button (`lucide-react`'s `Plus`, `aria-label="Add data"`,
  `data-testid="explorer-add-data"`) beside the existing table/row count, calling
  `openDestination('ingestion')`.

### `src/types/tabs.ts`

- `TabType` gains `'ingestion'`.
- `TAB_KIND.ingestion = 'singleton'` (one Add-data destination, same reasoning every other member
  already uses).
- `TAB_GLYPH.ingestion = { kind: 'icon', Icon: Plus }` (scope call 7).

### `src/services/navigation.ts`

- `TAB_TYPE_BY_MODULE.ingestion = 'ingestion'` — the comment naming `ingestion` as unlisted is
  updated to say it is now wired.
- No change to `MODULE_LABELS` (already carries `ingestion: 'Add data'`) or to `isDestinationReady`
  /`openDestination`'s own logic — both are generic over `TAB_TYPE_BY_MODULE` already.

### `src/lib/paletteRegistry.ts`

- `WiredModule` gains `'ingestion'`.
- `{ id: 'ingestion', label: 'Add data' }` moves from `NOT_YET_WIRED` to `WIRED_MODULES`.
- `NOT_YET_WIRED` keeps exactly one entry: `ai`.

### `src/app/WorkbenchShell.tsx`

`TabContent` gains one branch: `if (tab.type === 'ingestion') return <IngestionPanel />;` —
`IngestionPanel` is already imported (Act 0/1's `Welcome`).

## Files

Modified: `src/features/ingestion/TableList.tsx` + `TableList.test.tsx`,
`src/features/profiling/ColumnCard.tsx`, `src/features/explorer/ExplorerPanel.tsx` +
`ExplorerPanel.test.tsx`, `src/types/tabs.ts`, `src/services/navigation.ts` +
`navigation.test.ts`, `src/lib/paletteRegistry.ts` + `paletteRegistry.test.ts`,
`src/app/WorkbenchShell.tsx` + `WorkbenchShell.test.tsx`.
Unchanged: `src/features/ingestion/IngestionPanel.tsx` (mounted, not edited — scope call 8), every
S2–S7 surface.

## Dependencies

v0.69 (tokens/chrome) — met, this phase styles entirely on existing tokens (`--color-pk`,
`--color-fk`, `--color-ink-3`, etc.), no new ones. Not gated by S0.

## Acceptance criteria

- [x] `IngestionPanel`'s rendering via `TableList` (its own call site, no `reflow`/`edges` passed)
      is byte-for-byte unchanged
- [x] The rail's rows render two lines: name unclamped on line 1, `rows × cols · origin` + existing
      badges demoted to line 2
- [x] A chevron discloses every table's columns — name, PK/FK marker, `SemanticType` chip — and
      nothing else (no unique-value count, no missing %, no distribution preview, no range);
      confirmed by grepping the new disclosure markup for the absence of any stat-shaped content
- [x] FK markers agree with `useRelationshipsStore`'s overrides (add/remove/repoint), verified by a
      test that adds/removes an override and checks the rail's marker follows it — the same
      overrides the ERD and inspector already honor
- [x] Multiple tables' disclosures can be open at once; all start collapsed
- [x] Clicking a disclosed column opens the table's Profile tab with that column selected in
      `useSelectionStore`
- [x] The rail header's `+` opens a real `ingestion` tab mounting `IngestionPanel` unchanged;
      `isDestinationReady('ingestion')` is `true`; the palette's "Add data" entry is enabled and
      opens the same tab
- [x] `NOT_YET_WIRED` contains exactly one entry (`ai`)
- [x] `tsc -b` clean; full suite green, growing from the S6-doc-session baseline (142 files / 1444
      tests) by this leaf's new/changed tests; `oxlint` clean apart from the pre-existing unrelated
      `_misc/spike-webllm/smoke.mjs` warning

**Not a criterion here, by design:** the rail's own bottom-region scroll independence and the
Data Quality & Health panel are S2's. Live-browser/contrast verification is not owed by every S-leaf
the way it was V6's job in v0.69 — this tier has no equivalent conformance-gate phase; a manual
spot-check in a running browser is good practice but not a gate this doc writes.

## Test plan

- `TableList.test.tsx`: new `describe('reflow (S1)')` block — two-line layout renders when
  `reflow` is true and the old single-line markup when it's false/omitted; chevron toggles
  disclosure; disclosure shows PK/FK markers from `edges` and `SemanticType` chips, never a
  unique/missing/distribution stat; multiple tables can be expanded simultaneously; a table with no
  `columns` yet shows "Profiling…" when expanded rather than an empty list.
- `ExplorerPanel.test.tsx`: `edges` reaches `TableList` computed through `applyOverrides` (an added
  override changes the rendered marker); clicking a disclosed column calls `selectColumn` and opens
  a profile tab; the `+` button calls `openDestination('ingestion')`.
- `navigation.test.ts`: `ingestion` moves into the "routes each wired module" case;
  `isDestinationReady('ingestion')` is `true`; only `ai` stays `false`.
- `paletteRegistry.test.ts`: `WIRED_MODULES`' six-entry case includes `ingestion`;
  `NOT_YET_WIRED`'s case shrinks to one (`ai`).
- `WorkbenchShell.test.tsx`: one new case, "an ingestion tab renders real IngestionPanel content,"
  matching the existing per-`TabType` test block's pattern.

## Definition of done

The rail's rows are legible at the narrow explorer width without truncating a table's name, every
table's column structure is one chevron away without leaving the rail's own surface, and the app
has a real Add-data destination reachable both from the rail and the palette once a dataset is
already loaded — closing the gap where adding a second table required navigating away from a
loaded workspace. Rung-1 discipline is honored: nothing computed is rendered in the rail. `tsc -b`
/suite/`oxlint` clean.
