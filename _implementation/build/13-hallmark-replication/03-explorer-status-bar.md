# V3 — Explorer + status bar voice

**Tier:** v0.69 (the hallmark visual replication, D71 execution) · **Master spec:** §19 (the
v0.69 subsection, V3 row), §13.3 ("The explorer (left)" / status-bar paragraphs) · **Decision
row:** D71 (names the five signed-off mocks as the visual reference — this leaf charters
nothing new) · **Locked system:** `.hallmark/design.md` · **Depends on:** V1 (token
layer, shipped 2026-07-25). Not V2 — V2's region-surface table already put `--color-panel` /
`--color-chrome` on the explorer and status-bar containers; V3 only needs V1's token set.

This leaf lands **before** any `src/` code for this phase, per §19's binding constraint. No code
changes in this session; this doc is the spec the next session builds against.

## Objective

Reskin the two regions V2 explicitly left untouched: the explorer's row list (`ExplorerPanel` /
the shared `TableList`) and the status bar's ambient items (`StatusBar`). Both already render
real data on the V1 token ladder's container surfaces — this phase is row/item *voice*: the
mock's `.trow` treatment (key square, mono name, role-slot micro-badge, inset-accent selection,
hover/focus-revealed actions) and `.statusbar` treatment (mono density, haloed posture dot). No
new features, no behavior change — same posture V2 took toward its own chrome.

## Scope calls

**1. The mock's `.trow` role key-square (fact = amber / junction = purple / default = neutral)
has no data source in this codebase and doesn't get one here.** Checked `types/dataset.ts`,
`DatasetMap.tsx`, and `services/` — no fact/dimension/junction classification exists anywhere;
the relationship-inference spike (D17) and `10-studio/02-relationship-graph` are the only work
that could ever produce it, and neither is scheduled. Unlike V2's `TAB_KIND` (a real enum already
sitting at one placeholder value), there is no placeholder enum to wire here — inventing a
`TableRole` type with a single always-`'unclassified'` value would be speculative plumbing for a
classifier that doesn't exist, which Part I's Simplicity First rule rules out. `.trow__key`
renders unconditionally in its neutral tone (`--color-ink-3`); no `role-fact`/`role-junction`
modifier ships. Explicitly open scope for whichever future phase adds real table-role inference,
not cut scope.

**2. The mock's `.trow__role` slot (DIM/FACT/JCT) hits the same gap — repurposed for the origin
label the codebase actually has.** `TableList` already computes `ORIGIN_LABEL` (file / sample /
API / derived / shared link) and renders it as a plain lowercase inline string today. V3 ports
the mock's mono micro-caps badge *treatment* onto that existing, real value instead of fabricating
a relational role with no data behind it — same "degrade honestly, don't invent" reasoning V2's
scope call 5 used for the title bar's dataset label.

**3. Selected-row highlighting (`.trow.is-sel`) reads `useSelectionStore` directly inside
`TableList`, not via a new prop.** The phase description explicitly names "inset-accent
selection" as in scope. `stores/selection.ts` (W2) is already a shell-wide store, not
explorer-exclusive — `ExplorerPanel` already reads it. `TableList`'s other call site
(`IngestionPanel`, mounted by `WorkbenchShell` as the zero-datasets act) can only ever see
`selectedTableId: null` there, since nothing is selectable before a table exists — so reading the
store directly is safe in both contexts and avoids threading a prop through a call site that
would always pass the same trivial value. Highlight rule: `table.id === selectedTableId` →
`.trow.is-sel` (`--color-elev` background, `box-shadow: inset 2px 0 0 var(--color-active)`, per
design.md's Microinteractions stance — inset bar, not a border swap).

**4. Row actions stay two discrete buttons (conditional refresh + remove/undo), not the mock's
single `.trow__more` overflow trigger.** The mock's "⋯" opens a per-table command-palette scope
(`openPalette(id)`) — a real interaction this codebase doesn't have (no per-table palette scoping
exists). Collapsing two working, tested buttons into a fabricated overflow menu would be new
scope, not a reskin. V3 ports `.trow__more`'s **hover/focus-reveal treatment**
(`opacity: 0` at rest, `1` on `:hover`/`:focus-within`) to the existing two-button group instead —
design.md's Microinteractions stance names "the explorer row's overflow button" as the canonical
case requiring `:focus-within` parity; this generalizes it to the buttons that actually exist.
Existing `aria-label`s, click handlers, and `services/ingestion.ts` call sites are unchanged.

**5. The explorer's chrome-level header (`.explorer__head` — "Explorer" micro-label + "N tables ·
M rows" count) is new markup in `ExplorerPanel.tsx`, not a change to `TableList`'s own
`<h2>Registered tables</h2>`.** `TableList` is shared with `IngestionPanel`, where "Registered
tables" sits beside that page's other `<h2>` section labels ("Or pull from an API," "Or start
from a sample") in the same voice — removing or renaming it there would regress a flow this leaf
doesn't touch. `ExplorerPanel` gains a `hideHeading` boolean prop on `TableList` (default `false`,
additive — same pattern as W2's `onSelectTable`), passed `true` only from `ExplorerPanel`, so the
Workbench explorer shows one header (`.explorer__head`) instead of stacking it above `TableList`'s
own. The count reuses the same `tables.length` / row-sum reduction `StatusBar.tsx` already
computes — no new derivation.

**6. Status bar keeps every existing ambient item — the mock's shorter illustrative list (posture,
engine, rows, theme) is not a target row count.** Shipped `StatusBar` already surfaces real facts
the mock's static screenshot had no data for (total memory, last query timing, the paused notice)
— trimming them to match the mock would delete real information, not port a voice. The theme
quick-toggle stays **out**, unchanged from V2's scope call 2 and `StatusBar.tsx`'s own comment: no
DOM-applying theme-switching code exists anywhere in this codebase yet, and drawing a
non-functional toggle is explicitly what V2 already declined to do. No `.status__spacer` either —
nothing occupies the row's right side without the toggle, so a right-justifying spacer would be
dead markup.

## Spec

### `src/features/ingestion/TableList.tsx`

- New optional prop `hideHeading?: boolean` (default `false`, additive) — when `true`, the
  `<h2>Registered tables</h2>` is omitted. `IngestionPanel`'s call site doesn't pass it, so its
  rendered output is unchanged.
- Reads `useSelectionStore((state) => state.selectedTableId)`; each `<li>` gets `.trow`-equivalent
  classes: `--color-elev` on hover, `is-sel` styling (background + inset accent bar) when
  `table.id === selectedTableId`, `border-radius: var(--radius-sm)`-equivalent, `2px` transparent
  focus outline offset -2px per the mock's `.trow` base rule.
- Row layout: a `trow__key` span (6×6, `var(--radius-xs)`-rounded, `--color-ink-3` fill, no role
  modifier per scope call 1) — name in mono (`--text-base`, `--color-ink`, `text-overflow:
  ellipsis`, `white-space: nowrap`, per `--text-base`'s own theme.css comment "mono table cells,
  explorer names") — the existing rows/cols/memory/stale/sampled metadata unchanged in content,
  restyled onto `--text-xs`/`--color-ink-3` — the origin label restyled into the mock's
  `.trow__role` treatment (mono, `--text-2xs`, `letter-spacing: 0.1em`, uppercase, `--color-ink-3`)
  per scope call 2, replacing its current plain inline string.
- Action-button group: wrapped so it's `opacity: 0` at rest, `opacity: 1` on `.trow:hover` /
  `.trow:focus-within` (scope call 4). Icons/handlers/`aria-label`s unchanged.

### `src/features/explorer/ExplorerPanel.tsx`

- New header block above `<TableList hideHeading>`: `.micro`-styled "Explorer" label +
  `{tables.length} table{s} · {totalRows.toLocaleString()} rows` count, reading
  `useDatasetsStore((state) => state.tables)` (same reduction `StatusBar.tsx` already does — no
  new derivation, scope call 5). Container: flex row, `justify-content: space-between`,
  `border-bottom: 1px solid var(--color-rule-2)`, `padding: var(--space-sm) var(--space-md)`,
  matching the mock's `.explorer__head`.
- No other change — Add-data and the shared-links list stay absent, still W2's open scope, not
  this leaf's to add.

### `src/features/status/StatusBar.tsx`

- Container: `display: flex; align-items: center; gap: var(--space-md); flex-wrap: wrap; padding:
  var(--space-xs) clamp(...)` (port the mock's clamp literally), `font-family: var(--font-mono)`
  (JetBrains Mono per V1), `font-size: var(--text-sm)` (`0.625rem` — theme.css's own comment
  already names this token for "status bar"), `color: var(--color-ink-3)`.
- Posture item: dot becomes a 7px circle with a `box-shadow: 0 0 0 3px color-mix(in oklab,
  var(--color-X) 20%, transparent)` halo — `--color-ok` (green) outside cloud mode, `--color-active`
  (amber) in cloud mode, replacing the current `bg-emerald-500`/`bg-amber-500` Tailwind classes.
  Label text unchanged ("nothing leaves" / "may leave your browser").
  `color: var(--color-ink-2)` on the item per `.status__posture`.
- Every other item (engine, table/row count, memory, query timing, paused notice) keeps its
  current text and conditional logic — only the container/typography treatment changes (scope
  call 6). The paused notice keeps its `--color-active`-toned emphasis (was
  `text-amber-600 dark:text-amber-400`).

## Files

Modified: `src/features/ingestion/TableList.tsx` + `TableList.test.tsx` (`hideHeading` prop,
`.trow` markup/classes, selection read), `src/features/explorer/ExplorerPanel.tsx` +
`ExplorerPanel.test.tsx` (new header block, `hideHeading` passed), `src/features/status/
StatusBar.tsx` + `StatusBar.test.tsx` (container/posture-dot restyle).
Unchanged: `src/features/ingestion/IngestionPanel.tsx` (its `TableList` call site passes no new
prop — output unaffected beyond the shared row restyle), `stores/selection.ts`, `stores/
datasets.ts`, every `features/inspector`, `features/ai`, options-strip, and palette-body file —
V4/V5 territory.

## Dependencies

V1 (token layer + locked system) — shipped 2026-07-25, leaf doc landed the same day.

## Acceptance criteria

- [x] `TableList` rows carry the `.trow` treatment (key square, mono name, mono origin badge,
      hover background) on both call sites (`ExplorerPanel` and `IngestionPanel`'s zero-datasets
      act) — no `role-fact`/`role-junction` modifier exists anywhere in the diff (scope call 1)
- [x] A row matching `useSelectionStore().selectedTableId` renders the inset-accent `is-sel`
      treatment; no other row does; selecting a different table moves the highlight
- [x] Refresh/remove buttons are visually hidden at rest and appear on hover **and**
      `:focus-within` (keyboard-reachable without a mouse hover) — existing `aria-label`s and
      `onRemove`/`onRefresh` call contracts unchanged
- [x] `TableList` called with `hideHeading` omitted (i.e. `IngestionPanel`'s call site) still
      renders `<h2>Registered tables</h2>`; called with `hideHeading` renders no `<h2>`
- [x] `ExplorerPanel` renders an `.explorer__head`-equivalent header showing "Explorer" and an
      accurate `{n} tables · {m} rows` count, live-updating as tables register
- [x] `StatusBar` renders on the mono/`--text-sm` density with the haloed posture dot
      (`--color-ok`/`--color-active` per mode); every existing item (engine, table/row count,
      memory, query timing, paused notice) is still present and asserted — none dropped to match
      the mock's shorter illustrative list (scope call 6)
- [x] No theme quick-toggle, no `.status__spacer`, no `.trow__more`-style single overflow button,
      no fabricated table-role data anywhere in the diff
- [x] No file under `features/inspector`, `features/ai`, the options strip, or the palette body
      changed
- [x] `tsc -b` clean; full suite green (re-measure against the tree at implementation time — V2's
      baseline was 133 files / 1298 tests); `oxlint` clean apart from the pre-existing unrelated
      `_misc/spike-webllm/smoke.mjs` warning
- [x] This folder's `README.md` per-phase-leaves list links this doc

**Not a criterion here, by design:** contrast measurement and live-browser verification belong to
**V6**, same as V1/V2.

## Test plan

- `TableList.test.tsx`: extend existing cases to assert the row-selection highlight
  (`useSelectionStore.setState({ selectedTableId: 't-customers' })` → that row's element carries
  the selected class/style, others don't); add a `hideHeading` case (heading present by default,
  absent when `hideHeading`); existing text-content/aria-label assertions are unaffected since
  they select by text/role, not class names — verify the one exception directly: the "renders the
  table name as plain text (not a button) when `onSelectTable` is omitted" case currently asserts
  `container.querySelector('span')?.textContent === 'customers'`, which will now match the new
  `.trow__key` span first — update that assertion to target the name span specifically (e.g. by
  its own class or `within(li)`), not the first `<span>` in the container.
- `ExplorerPanel.test.tsx`: add a case asserting the header count text for a couple of registered
  tables, and that it updates when a table is added.
- `StatusBar.test.tsx`: existing text/role assertions are unaffected (they select by text content
  and `role="status"`, not classes) — add one case asserting the posture dot's computed color
  token differs between local and cloud mode if feasible under jsdom, otherwise assert the
  color-mix/token is present in the rendered style attribute.

## Definition of done

Explorer rows and status-bar items render the mock's mono/HUD voice — key square (neutral, no
fabricated role data), origin badge in the role slot's visual treatment, inset-accent row
selection reading the existing shell-wide selection store, hover/focus-revealed row actions, and
an `.explorer__head`-style "Explorer · N tables · M rows" header — on top of the V1 token ladder
and the V2 region surfaces, with no behavior change to any existing callback or service call.
`TableList`'s shared use by `IngestionPanel` stays structurally intact (`hideHeading` additive,
its own heading unaffected). Status bar keeps every real ambient item it has today; no theme
toggle, no fabricated table-role data, no collapsed overflow menu. `tsc -b`/suite/`oxlint` clean.
Contrast and live-browser verification remain V6's, by design.
