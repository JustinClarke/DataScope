# S3 — The item-inspector drawer

**Tier:** v0.70 (the workspace streamline, D73 execution) · **Master spec:** §19 (the v0.70
subsection, S3 row), §13.3 (the bottom region — the item-inspector drawer; the detail-ladder
table's rung 2; pane mechanics; viewer mode), §10 Module 2 (the console's contents, unchanged),
§15 (Monaco's lazy boundary) · **Decision row:** D73 (which reverses D71's "scent, not dashboard"
charter at the region level) · **Depends on:** v0.69 · **Gated by S0:** no — S0 gates S7 entirely
and S5's ceiling number only.

This leaf lands before its own implementation, per §19's binding constraint — the acceptance
criteria below are checked as the code lands, not written up afterward.

## Objective

Turn the shell's bottom region from W7's single scent strip into the **item-inspector drawer**:
two user-controlled views (**Info** and the **SQL console**) over one docked, resizable,
expandable-to-viewport region, with the console mounting no editor until a user asks for one.
This is the phase that makes J3 ("let me just check something") possible at all — today the only
way to run SQL is to navigate to a tab and lose whatever was on screen.

S3 builds the **region and its mechanics**. It does not wire run-from-anywhere (S4), does not
move the transform guard (S4), does not delete the `'sql'` tab or add query tabs (S5).

## Scope calls

**1. Tabbed views for v1, not a split.** §13.3 allows either ("tab between them or split to see
both"). Tabs ship; the split does not. VS Code's own terminal panel — the idiom D73 names — is
tabbed, and a split adds a second layout axis (a within-drawer ratio) on top of the drawer height
this phase already introduces. The single-console invariant is unaffected either way: there is
exactly one console instance regardless of how many ways there are to look at it.

> **Superseded by S6.5** ([`06.9-drawer-split-view.md`](06.9-drawer-split-view.md), 2026-07-28) —
> and superseded *on this call's own reasoning*, not overridden. The "second layout axis" objection
> is answered by **removing the axis**: Info becomes a clamped fixed-width right sidebar
> (`INFO_PANE_WIDTH`), not a draggable ratio, so the split adds one scalar rather than a ratio. The
> single-console invariant is unaffected, as this call already said it would be. Master §13.3 now
> records the console-left ordering.

**2. The drawer's geometry is session state in a store, not component state.** `useExplorerWidth`
(`WorkbenchShell.tsx`, built ad hoc 2026-07-28) keeps the rail's width in local state and resets
it on reload; the drawer's *height* follows that no-persist precedent, but its `open`/`view`/
`activated` flags cannot live in a component — S4's whole deliverable is other surfaces calling
"send this SQL to the console and open the drawer" from across the app. So a new
`stores/drawer.ts` owns all of it, including height, so the region has one state home rather than
two. Nothing here is persisted; per-user layout persistence is explicitly deferred by D73's pane
mechanics ("v1 is resize + collapse").

**3. Collapse leaves the header strip, never the whole region.** Collapsed = the view-switcher
row and the drawer's chrome remain; only the body is hidden. A drawer that can vanish entirely
needs a discovery path back, which would be a palette entry this phase wasn't asked to add.

**4. The console is `SqlModule`, mounted unchanged.** §10 Module 2's contents are unchanged by
D73 — only its home moves. S3 re-homes it and touches nothing inside it: the run path, the
transform guard mounted per-surface, `QuerySuggestions`, and the export-recipe/auto-chart/
Download-Parquet affordances all stay exactly as they are. S4 restructures the run path; S5
deletes the standalone tab and re-homes the affordances; S6 moves `QuerySuggestions` to the map.

> **Amended by S6.5** ([`06.9-drawer-split-view.md`](06.9-drawer-split-view.md), 2026-07-28) —
> `SqlModule`'s *behaviour* stays unchanged (run path, guard, affordances), but its **internal
> composition does not**: its body becomes a fixed three-region column (editor / toolbar /
> results-with-its-own-scroll) instead of a single vertical scroll, and `QuerySuggestions` is not
> rendered in the console. S6.5 owns that removal if S6 has not closed first.

**5. The `'sql'` tab still exists through S3, and the overlap is accepted deliberately.** For one
phase the app can have both a `sql` tab and a drawer console mounted. They share the singleton
`useQueryStore`, so they show the same buffer and the same results — annoying to look at, not
incorrect, and no second query-buffer model is introduced. S5 deletes the tab. The alternative
(deleting the tab here) would pull S5's registry amendment, palette rewiring and Pivot re-home
into this phase, which is exactly the sequencing §19 already rejected.

**6. Monaco's boundary is the console's *editor activation*, which is stricter than "the console's
first open" and satisfies it.** §13.3 requires the ~2 MB chunk never load at shell mount; §13.3
separately requires the console's **cold state** to be "a composed info pane carrying an explicit
'open SQL editor' control." Both land as one mechanism: switching to the console view renders the
cold pane, and `SqlModule` (which owns the `lazy()` Monaco import) does not mount until the
control is clicked or a caller activates the console programmatically. Once activated it stays
mounted — `hidden`, never unmounted — across view switches and collapse, so the buffer, results
and history survive, matching `TabHost`'s keep-mounted contract.

> **Superseded by a closed human decision (2026-07-28), carried by S6.5**
> ([`06.9-drawer-split-view.md`](06.9-drawer-split-view.md)) — **Monaco loads whenever the drawer
> opens.** Under a permanent split the console is visible whenever the drawer is, so a cold pane
> occupying the left half of every open drawer is worse than the chunk; `consoleActivated` and the
> cold pane are retired, and the `view === 'console'` half of the activation semantics has no
> referent. §13.3's hard requirement is unaffected — Monaco is still never in the module graph at
> shell mount. Recorded as a closed decision with its date, not an oversight.
> `activateConsole()` is redefined in S6.5 (open + restore `infoWidth` to its clamp + scroll the
> results region into view).

**7. Results never auto-expand, and the prompt's rule is a row count, not a measurement.** When a
successful result has more rows than the unexpanded drawer can show, the console renders a
"**N rows — click to expand**" control that sets the expanded state; nothing about a result ever
changes height or expansion on its own. The threshold is a constant (`PROMPT_ABOVE_ROWS = 12`)
rather than a measured overflow: a `ResizeObserver` on the grid would be a more accurate answer to
a question whose accepted trade — "a big result is two gestures away, not zero" — does not depend
on the accuracy.

> **Stands.** S6.5 ([`06.9-drawer-split-view.md`](06.9-drawer-split-view.md), 2026-07-28) does not
> reopen the row-count constant. It does fix `expanded`'s **implementation**, which shipped setting
> `100svh` on a `shrink-0` element and therefore pushes the WebLLM dock and status bar off-screen,
> and scopes the expansion to the console pane so the extra height reaches the results region.

**8. Selection opens the drawer and selects Info, exactly as §13.3 states.** Any selection change
(table, column, edge) opens the drawer if collapsed and switches the view to Info — including when
the user was looking at the console. This is master's decided behaviour and is followed rather
than softened; the cost (a rail click pulls you off a console you were reading) is real, and the
console's state survives it intact per scope call 6, so the return trip is one click with nothing
lost. Flagged here rather than quietly hedged.

> **Half stands, amended by S6.5** ([`06.9-drawer-split-view.md`](06.9-drawer-split-view.md),
> 2026-07-28). The **open** clause stands — it is §13.3's decided behaviour and S6.5 does not
> reverse it. The **switch to Info** clause has no referent once both panes are permanent, and is
> replaced by **Info's scroll reset plus a brief non-animated attention treatment on its header**
> (~400ms, `--color-active`, no focus steal). The re-open cost above is **re-recorded at its new
> weight** in S6.5: the drawer that a selection forces open now carries a mounted Monaco, and on the
> session's first selection a ~925 KB chunk fetch — so re-open after a user collapse restores the
> last geometry rather than defaults, and the collapse control names what will re-open it.

**9. Info gains its rung-2 → rung-3 links, and nothing else.** §13.3 makes Info "never a dead end":
click-through from any Info content opens the full tab. Table → **Open table** (opens the profile
tab *and* switches the drawer to the console, per §13.3's decided behaviour); column → its
existing "Open profile"; edge → **Open map**. No new content, no charts — the "scent, not
dashboard / never a pedagogical surface" charter still holds for this view in full, which is
precisely what D73 scoped it to.

**10. Open-table console seeding — the folder's open question 5, resolved "only into an empty
console."** "Open table" seeds `SELECT * FROM "<table>" LIMIT 100` **only when the console has
never been activated and its buffer is empty**, and never runs it. A shared single console holds
user-typed text; silently replacing it on what is a *navigation* click is the one behaviour that
would make the scratchpad untrustworthy. Into a console that has never been opened there is
nothing to lose, and the seed is the difference between landing on an empty editor and landing on
a runnable query.

> **Both stand unchanged** under S6.5 ([`06.9-drawer-split-view.md`](06.9-drawer-split-view.md),
> 2026-07-28), with one clarification so the call does not read as dangling: "Open table" still
> calls `activateConsole()`, but with both panes always shown that call **becomes a no-op on
> visibility** — it retains its seeding and results-into-view semantics, not a view switch.

**11. Viewer mode needs no code, only a test.** `ViewerMode.tsx` renders its own
`data-region="inspector"` (a `RelationshipsList`) and never mounts `Inspector`, so the D62
consumption-only absence §13.3 requires is already structural. This leaf adds the assertion that
keeps it that way rather than a `viewerMode` branch inside the drawer — a conditional would be a
second place for the console to leak into a session that must not have one.

> **Stands.** S6.5 ([`06.9-drawer-split-view.md`](06.9-drawer-split-view.md), 2026-07-28) restates
> this call verbatim as inherited-unchanged and adds the explicit negative it now needs: a permanent
> split makes §13.3's "Info only, no console" a *layout* claim as well as a mount claim, which
> invites exactly the branch this call refused — so **S6.5 introduces no `viewerMode` conditional
> inside the drawer**, and asserts viewer mode renders no split, no splitter and no console pane.

**12. No keyboard shortcut for the drawer.** VS Code's ⌘J is not in D73 or §13.3, and the palette
(W5) already reaches feature homes. Not built; a fair follow-up.

## Spec

### `src/stores/drawer.ts` (new)

```ts
export type DrawerView = 'info' | 'console';

interface DrawerState {
  open: boolean;            // false = collapsed to the header strip (scope call 3)
  view: DrawerView;
  consoleActivated: boolean; // has the editor ever been asked for (scope call 6)
  expanded: boolean;         // full-viewport (scope call 7 — never set by a result)
  height: number;            // px, session-only, no persist (scope call 2)
  openInfo(): void;              // open + view:'info'   — the selection hand-off
  showView(view: DrawerView): void;
  activateConsole(): void;       // open + view:'console' + consoleActivated:true
  setExpanded(expanded: boolean): void;
  setHeight(height: number): void;
}
```

- `DRAWER_MIN_HEIGHT = 120`, `DRAWER_DEFAULT_HEIGHT = 200`, `DRAWER_MAX_HEIGHT` is computed at
  drag time from the viewport, not stored.
- `activateConsole()` is the seam S4 builds on (its senders will set the query store's `sql` and
  call it); S3 ships it with only in-drawer callers.

### `src/features/inspector/InspectorDrawer.tsx` (new)

- Header strip: the two view buttons (`Info` / `SQL Console`, `aria-pressed` on the active one),
  and on the right a collapse chevron and an expand/restore control. Mono micro-cap treatment,
  matching `ExplorerHeader` and the tab strip; HUD glyph set or `lucide-react`, no emoji.
- A `role="separator"` drag handle along the drawer's **top** edge, same shape as the explorer's
  vertical one (`useDrawerHeight`, mouse-move/up on `document`), clamped to
  `[DRAWER_MIN_HEIGHT, viewport - chrome]`.
- Body, only when `open`: `<Inspector />` when `view === 'info'`; when `view === 'console'`, the
  cold pane until `consoleActivated`, then `<DrawerConsole />`. Once activated, `DrawerConsole`
  stays mounted under `hidden` while Info is showing (scope call 6).
- Subscribes to `stores/selection.ts` and calls `openInfo()` on any change to
  `(lastSelectionKind, selectedTableId, selectedColumn, selectedEdgeId)`, skipping the initial
  mount (scope call 8).
- Height: `expanded ? '100%' of the shell's flex space : height px`; the region sits above
  `WebLLMDock` and the status bar, which the existing JSX order in `ShellGrid` already gives
  (§13.3's status bar → dock → drawer → canvas stacking is satisfied unchanged).

### `src/features/inspector/DrawerConsole.tsx` (new)

- Cold pane (rendered by `InspectorDrawer` before activation): a short composed block — what the
  console is (the one place SQL is typed; the next query replaces this one's results) and an
  **Open SQL editor** button calling `activateConsole()`. Not a query list.
- Once activated: `<SqlModule />` unchanged (scope call 4), plus the expand prompt — when
  `status === 'success'`, `!expanded`, and `result.rows.length > PROMPT_ABOVE_ROWS`, a control
  reading `{rows.toLocaleString()} rows — click to expand` calling `setExpanded(true)`.

### `src/features/inspector/Inspector.tsx`

- `TableScent`: "Open profile →" becomes **Open table →**, which calls
  `openDestination('profile', tableId)`, then `activateConsole()`, and — only if
  `useQueryStore.getState().sql.trim() === ''` and the console was not already activated — sets
  the store's SQL to `SELECT * FROM "<tableName>" LIMIT 100` without running it (scope call 10).
- `EdgeScent`: gains an **Open map →** click-through (`openDestination('map', MAP_TAB_SUBJECT)`).
- `ColumnScent`: unchanged.
- The component keeps its own `data-testid="inspector"` and stops owning `h-full` centring — the
  drawer owns layout now; Info scrolls inside the drawer body.

### `src/app/WorkbenchShell.tsx`

- `data-region="inspector"` renders `<InspectorDrawer />` instead of `<Inspector />`, and moves its
  fixed content-height styling onto the drawer's own state. The `WebLLMDock`/status-bar order below
  it is untouched.

## Files

New: `src/stores/drawer.ts` + `drawer.test.ts`, `src/features/inspector/InspectorDrawer.tsx` +
`InspectorDrawer.test.tsx`, `src/features/inspector/DrawerConsole.tsx` + `DrawerConsole.test.tsx`.
Modified: `src/features/inspector/Inspector.tsx` + `Inspector.test.tsx`,
`src/app/WorkbenchShell.tsx` + `WorkbenchShell.test.tsx`,
`src/features/viewer/ViewerMode.test.tsx` (one added assertion).
Unchanged: every file under `src/features/sql/` (scope calls 4/5), `stores/query.ts`,
`ViewerMode.tsx` (scope call 11), `types/tabs.ts` / `services/navigation.ts` /
`lib/paletteRegistry.ts` (S5's).

## Dependencies

v0.69 (complete 2026-07-25). S1/S2 are not prerequisites — the drawer is a different region — but
both are shipped. Not gated by S0.

## Acceptance criteria

- [x] The bottom region renders a two-view drawer: `Info` and `SQL Console` switch under user
      control, with exactly one console instance in the tree
- [x] The drawer collapses to its header strip and re-opens from it; collapse never removes the
      view switcher
- [x] The drawer drag-resizes from its top edge between the minimum and the viewport, and expands
      to full height and restores via its own control
- [x] **Monaco is not in the module graph on shell mount**: `SqlModule` is not mounted until the
      cold state's "Open SQL editor" (or `activateConsole()`) fires — asserted on the mount, not
      only on the bundle
- [x] The console's cold state is a composed pane with an explicit open control, not an empty
      editor and not a query list
- [x] Once activated, switching to Info and back preserves the console's buffer, results and
      history (kept mounted, not remounted)
- [x] A successful result with more rows than the unexpanded drawer shows renders an
      "N rows — click to expand" control, and **nothing about a result changes the drawer's height
      or expansion by itself**
- [x] Selecting a table, column or map edge opens the drawer if collapsed and switches to Info
- [x] Info's table view offers **Open table**, which opens the profile tab and switches the drawer
      to the console; it seeds `SELECT * … LIMIT 100` only into a never-activated, empty console
      and never runs it, and never overwrites an existing buffer
- [x] Info click-through reaches a tab from all three selection kinds (table → profile, column →
      profile, edge → map) — rung 2 never dead-ends
- [x] Viewer mode renders no console, no editor and no view switcher
- [x] Bottom-edge stacking holds: status bar → WebLLM dock → drawer → canvas; an expanded drawer
      pushes against the canvas and never over the dock
- [x] `tsc -b` clean; full suite green, growing by this leaf's new/changed tests; `oxlint` clean
      apart from the pre-existing unrelated warnings noted in S1/S2's criteria

**Not a criterion here, by design:** run-from-anywhere and the shared guarded run path (S4);
`'sql'`'s removal from the tab union, query tabs, Pin, Pivot's results home (S5);
`QuerySuggestions`' move to the map (S6); an Info/console split view (scope call 1); persisted
drawer geometry (scope call 2); a keyboard toggle (scope call 12).

## Test plan

- `drawer.test.ts`: defaults (`open`, `view: 'info'`, `consoleActivated: false`);
  `activateConsole()` sets all three; `openInfo()` opens and switches; `setHeight` clamps at the
  minimum; `setExpanded` is independent of `height`.
- `InspectorDrawer.test.tsx`: renders both view buttons with `aria-pressed`; `SqlModule` is absent
  from the tree until the cold pane's control is clicked (the leaf's central assertion — mock
  `../sql/SqlModule` and assert on the mock's render count); after activation, switching to Info
  and back does not remount it; collapse hides the body and keeps the switcher; a
  `useSelectionStore.getState().selectTable(...)` call from a collapsed, console-showing drawer
  opens it on Info; the initial mount does not fire `openInfo`.
- `DrawerConsole.test.tsx`: the cold pane's copy and control; the expand prompt appears only for
  `status === 'success'` with `rows.length > PROMPT_ABOVE_ROWS` and `!expanded`, and clicking it
  sets `expanded` — with the query store seeded directly, the same way `SqlModule.test.tsx`
  already drives it.
- `Inspector.test.tsx`: **Open table** opens the profile tab, activates the console, and seeds SQL
  only when the buffer is empty and the console was never activated (three cases: empty+cold →
  seeded; non-empty → untouched; already-activated → untouched); edge selection offers **Open
  map**.
- `WorkbenchShell.test.tsx`: `data-region="inspector"` hosts the drawer; region order in the DOM
  is drawer → WebLLM dock → status bar.
- `ViewerMode.test.tsx`: no console, editor or view switcher in the viewer tree.

## Definition of done

The bottom region is a drawer a user drives: two views they choose between, a height they set, an
expansion they ask for, and a console that exists only once and costs nothing until it is opened.
A query can be run without leaving the chart or answer on screen — the journey (J3) the app could
not do at all — while Info keeps the W7 charter D73 scoped to it, now linking onward instead of
dead-ending. Monaco stays off the startup path, results never move the floor under the user, and
viewer mode still has no console at all. `tsc -b`/suite/`oxlint` clean.