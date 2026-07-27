# V2 — Shell chrome

**Tier:** v0.69 (the hallmark visual replication, D71 execution) · **Master spec:** §19 (the
v0.69 subsection, V2 row), §13.3 (the Workbench shell macrostructure) · **Decision row:** D71
(names the five signed-off mocks as the visual reference — this leaf charters nothing new) ·
**Locked system:** `.hallmark/design.md` · **Depends on:** V1 (token layer, shipped
2026-07-25)

This leaf lands **before** any `src/` code for this phase, per §19's binding constraint — the
constraint V1 itself breached. No code changes in this session; this doc is the spec the next
session builds against.

## Objective

Add the **title bar** — the sixth shell region `WorkbenchShell.tsx`'s own W1 comment admits was
never scaffolded — and bring it, the tab strip, and the five already-scaffolded region containers
(explorer, canvas, ai-pane, inspector, status bar) onto the surface ladder V1 landed. V1 shipped
the tokens; nothing in `src/` outside `theme.css` consumed the new chrome/panel/canvas distinction
yet — every region still renders on inherited/default background with the legacy
`border-(--color-border)` alias as its only visual treatment. V2 is chrome fidelity only: no
region's *internal* content changes. Explorer-row voice is V3's job, inspector/AI-pane internals
are V4's, the options strip and palette body are V5's.

## A master-doc gap found while writing this leaf, not assumed from the charter

§13.3's own macrostructure sentence lists six things — "left explorer · middle tabbed canvas ·
optional right AI pane · bottom inspector · command palette (⌘K) · status bar" — and never
mentions a title bar. That confirms the README/BUILD-ORDER "sixth region W1 never scaffolded"
line is a literal reading of the master doc, not shorthand. §13.3's status-bar paragraph also
currently assigns it "gear → Settings tab"; Scope call 2 below moves that control to the title
bar, which means that clause is now wrong too. **Both need a master-first edit landed together
with V2's code** (§13.3's macrostructure line gains the title bar; the status-bar paragraph's
gear clause moves) — not this session's job, since no code lands here, but recorded now so the
next session doesn't miss it. See Acceptance criteria.

## Scope calls

**1. New `TitleBar` component, not folded into `ShellGrid` inline.** Mounted in
`WorkbenchShell.tsx`'s `ShellGrid()` above the current `flex flex-1 overflow-hidden` body row,
same level as the body/inspector/status-bar siblings. Lives in `src/app/` (shell-level chrome,
alongside `WorkbenchShell.tsx` itself and `EducationalPanelContext.tsx`), not under `features/` —
it has no module identity of its own, the same reasoning that keeps `WorkbenchShell.tsx` out of
`features/`.

**2. The settings gear moves from `StatusBar` to `TitleBar`.** The mock's status bar carries
posture, engine, row count, and a theme quick-toggle — **zero gear**; its only gear
(`#gearBtn`, "⚙ Settings") lives in the title bar's right side next to the ⌘K button. The
currently-shipped `StatusBar.tsx` has the only existing gear (`onOpenSettings`, wired at W7). V2
removes it from `StatusBar` and wires the same callback into `TitleBar` instead, rather than
running two settings entry points because the mock happens to draw one and the master text
happens to name another. `StatusBar`'s theme quick-toggle stays **out of scope** here exactly as
V1 left it (`StatusBar.tsx`'s own W7 comment: no DOM-applying theme code exists anywhere yet) —
that's V3's "status-bar voice" row, and only if the underlying theme-switching machinery ships
with it; V2 must not draw a non-functional toggle.

**3. Palette-open state is lifted out of `CommandPalette`, not duplicated.** Today
`CommandPalette.tsx` owns `open` as local `useState`, toggled only by its own `⌘K`/`Ctrl+K`
`keydown` listener. `TitleBar`'s "Search & actions ⌘K" button needs to open the same palette.
Dispatching a synthetic keyboard event from the button is the smaller diff but is exactly the
kind of hack this codebase avoids elsewhere; a tiny store matching the existing
`pauseSignal.ts`/`selection.ts` pattern (`stores/paletteOpen.ts` — `open`, `setOpen`/`toggle`) is
the idiomatic size for this and keeps both call sites (the keyboard listener, the new button)
symmetric. `CommandPalette.tsx`'s own state and listener move onto it; nothing about the palette's
rendered content changes.

**4. Per-`TabType` glyphs use `lucide-react`, not invented dingbats.** The mock's tab strip shows
one open tab (`◈ Dataset map`) and gives no glyph for the other six `TabType` members
(`profile`/`sql`/`pivot`/`charts`/`correlation`/`export`). `design.md`'s iconography line closes
the dingbat set at six characters (`◈ ✦ ◆ ⚙ ✓ ⚠`), each already carrying a semantic role (⚙
settings, ✓/⚠ status) — it is not a bottomless glyph well, and the same line names
`lucide-react` line icons as the sanctioned alternative. V2 keeps `◈` for `map` exactly as the
mock specifies and assigns a `lucide-react` icon to the other six (indicative pairing to firm up
at implementation: `Table` profile, `Terminal` sql, `LayoutGrid` pivot, `BarChart3` charts,
`GitCompareArrows` correlation, `Download` export) — every glyph inherits `currentColor` per
`design.md`, so the existing `.tab.is-active .tab__glyph { color: var(--color-active) }` /
inactive-muted rule needs no per-glyph special-casing.

The mock's second glyph rule — `.tab--artifact` renders its glyph in `--color-fk` (purple) — has
no live consumer today: `types/tabs.ts`'s `TAB_KIND` maps every current `TabType` to `'singleton'`
and documents that no `'artifact'` member exists yet. V2 implements the CSS/branch (a
`kind === 'artifact'` check reading `TAB_KIND`) so it activates the day an artifact tab type
ships, but it is inert now — not fabricated scope, just wiring a distinction the type system
already names, the same posture V1 took toward `--color-bg-subtle`'s dead `var()`.

**5. The title bar's "active dataset" label degrades honestly for the real, multi-dataset session
model.** The mock's illustrative data shows one dataset, `movielens · 6 tables`, implying a single
"active" dataset. `useDatasetsStore`'s `datasets` field is an array with no cap and no "active"
concept — a folder drop registers one `Dataset` with several `tableNames`, but nothing stops a
second, unrelated file drop from registering alongside it, and the explorer already lists every
table from every dataset together. Naming one dataset "active" when two unrelated ones are loaded
would be a fabricated label, not a port. V2 shows the loaded dataset's `name` when exactly one
`Dataset` exists (the common case, and the honest reading of "active" before a second ingestion
happens) and falls back to a plain `"{tables.length} tables"` count — reusing the same
`tables.length` reduction `StatusBar.tsx` already computes, not new state — once a second dataset
is loaded. No store changes; both branches read `useDatasetsStore` as it exists today.

## Spec

### `src/app/TitleBar.tsx` (new)

Props: `{ onOpenSettings: () => void }` (same shape `StatusBar` used to take). Reads
`useDatasetsStore` for the dataset-label branch (scope call 5) and the shared palette-open store
(scope call 3) for the ⌘K button's `onClick`.

- Container: `--color-chrome` background, `--color-rule-2` bottom border, flex row,
  `justify-content: space-between`, matching `.titlebar`'s padding rhythm
  (`var(--space-sm) clamp(...)`, ported to the app's existing spacing tokens).
- Left: wordmark — "Data" in `--color-ink`, "Scope" in `--color-active`, `--text-xl` (already
  reserved for this by V1's `theme.css` comment: `/* wordmark, palette input */`), `-0.01em`
  tracking per `design.md` Typography — then a 1px `--color-rule` separator, then the
  dataset/table-count `.micro`-styled label in `--color-ink-3`.
- Right: the ⌘K button (`.kbtn` voice — `--color-panel` face, 1px `--color-rule` border, mono
  `--text-md`, hover lifts to `--color-ink`/`--color-rule-hi`) showing "Search & actions" plus a
  `.kbd`-styled "⌘K" hint, then the settings gear as a `.kbtn--icon` (lucide `Settings`, matching
  the icon `StatusBar` used before this move).

### `src/stores/paletteOpen.ts` (new)

Minimal Zustand store: `{ open: boolean; setOpen: (open: boolean) => void; toggle: () => void }`.
`CommandPalette.tsx`'s `keydown` listener and its `close()` helper call `setOpen`/`toggle` instead
of local `useState`; `TitleBar`'s button calls `toggle()`.

### `WorkbenchShell.tsx`

`TitleBar` mounts in `ShellGrid()` immediately above the existing
`<div className="flex flex-1 overflow-hidden">` body row, receiving the same `openSettings`
closure already passed to `StatusBar`/`AIPane`. `StatusBar`'s call site drops its
`onOpenSettings` prop.

### `src/features/status/StatusBar.tsx`

Gear button and `onOpenSettings` prop removed (scope call 2). Everything else — posture dot,
engine state, row/memory counts, query timing, paused state — unchanged.

### `src/features/palette/CommandPalette.tsx`

`open`/`setOpen`/the `keydown` listener move onto `stores/paletteOpen.ts` (scope call 3); the
rendered dropdown markup and `buildPaletteEntries` usage are unchanged.

### Tab strip (inside `WorkbenchShell.tsx`'s `TabHost`)

- `.tabs` container: `--color-chrome` background, `--color-rule-2` bottom border,
  `overflow-x: auto`, replacing the current `border-b border-(--color-border)` div.
- `.tab`: mono `--text-2xs`/`--text-xs`-scale label (`{glyph} {tab.type} · {tab.subject}`),
  `--color-ink-3` at rest, `--color-ink-2` on hover.
- `.tab.is-active`: `--color-canvas` background, `--color-ink` text, glyph in `--color-active`
  (or `--color-fk` for a future artifact-kind tab per scope call 4), inset styling replacing the
  current plain `data-active` attribute selector with no visual rule attached to it today.
- Close button (`×`): restyled to the `.tab__close` treatment — transparent, `--color-ink-3`,
  hover `--color-elev` face + `--color-ink`, `:focus-visible` ring — same button, same
  `aria-label`, no behavior change.
- Per-`TabType` glyph: a `TAB_GLYPH: Record<TabType, ...>` map colocated with `TAB_KIND` in
  `types/tabs.ts` per scope call 4.

### Region surfaces (`data-region` containers in `ShellGrid`)

Each existing container gets the `design.md`-assigned surface token instead of its current
unstyled default, and `--color-rule`/`--color-rule-2` in place of the legacy
`border-(--color-border)` alias:

| Region | Token |
| :--- | :--- |
| `data-region="explorer"` | `--color-panel` |
| `data-region="canvas"` | `--color-canvas` |
| `data-region="ai-pane"` | `--color-panel` |
| `data-region="inspector"` | `--color-panel` |
| `data-region="status-bar"` | `--color-chrome` |
| Title bar (new) | `--color-chrome` |

No token is new — all six were added by V1. This is the first phase to actually consume them
outside `theme.css`'s own alias layer.

## Files

Added: `src/app/TitleBar.tsx` + `TitleBar.test.tsx`, `src/stores/paletteOpen.ts` +
`paletteOpen.test.ts`.
Modified: `src/app/WorkbenchShell.tsx` (mounts `TitleBar`; tab-strip markup/classes),
`src/app/WorkbenchShell.test.tsx`, `src/features/status/StatusBar.tsx` (gear removed) +
`StatusBar.test.tsx`, `src/features/palette/CommandPalette.tsx` (state lifted) +
`CommandPalette.test.tsx`, `src/types/tabs.ts` (`TAB_GLYPH` added), `_implementation/DATASCOPE.md`
(§13.3 macrostructure line + status-bar paragraph, master-first — see the gap noted above),
`_implementation/build/12-workbench/README.md` or this tier's `README.md` mirror as applicable.
Unchanged: every `features/explorer`, `features/inspector`, `features/ai`, options-strip and
palette-body file — V3/V4/V5 territory.

## Dependencies

V1 (token layer + locked system) — shipped 2026-07-25, leaf doc landed the same day. V2 needs
nothing from V1 beyond the tokens already in `theme.css`.

## Acceptance criteria

- [x] `TitleBar` renders above the body row in `ShellGrid`: `--color-chrome` background,
      `--color-rule-2` border, wordmark with the amber "Scope", dataset-or-count label (scope
      call 5), ⌘K button, settings gear
- [x] The settings gear exists in exactly one place (`TitleBar`); `StatusBar` renders no gear and
      takes no `onOpenSettings` prop
- [x] Palette-open state has one source of truth (`stores/paletteOpen.ts`); both the `⌘K`/`Ctrl+K`
      keyboard shortcut and `TitleBar`'s button drive it — no synthetic keyboard-event dispatch
- [x] `.tabs`/`.tab` carry the mono, chrome/canvas, active-glyph-amber treatment above; the close
      button matches `.tab__close`; every `TabType` resolves a glyph via `TAB_GLYPH`
- [x] The `TAB_KIND`-gated artifact/purple glyph branch exists in the CSS/component logic but is
      unreachable today, verified against `types/tabs.ts`'s current all-`'singleton'` map — not
      asserted with a fabricated artifact tab
- [x] The five pre-existing `data-region` containers plus the new title bar each carry their
      design.md-assigned surface token (table above); `border-(--color-border)` no longer appears
      on any of these six containers
- [x] No file under `features/explorer`, `features/inspector`, `features/ai`, or the options
      strip / palette-body changed — `git status` shows only the Files list above
- [x] `tsc -b` clean; full suite green (re-measure against the tree at implementation time — V1's
      baseline was 131 files / 1289 tests; V2 adds `TitleBar.test.tsx` and
      `paletteOpen.test.ts`, so the count should grow, not just stay green); `oxlint` clean apart
      from the pre-existing unrelated `_misc/spike-webllm/smoke.mjs` warning
- [x] `DATASCOPE.md` §13.3 amended master-first (title bar named in the macrostructure line; the
      status-bar paragraph's "gear → Settings tab" clause moved) and mirrored into this tier's
      `README.md`, landed together with the code — not deferred to a later phase
- [x] This folder's `README.md` per-phase-leaves list links this doc

**Not a criterion here, by design:** contrast measurement and live-browser verification belong to
**V6**, same as V1. This phase changes chrome fidelity and adds real interactive surface (unlike
V1's pure stylesheet swap), so **unit tests are in scope here** — `TitleBar.test.tsx` covering the
dataset/count label branch and the settings-gear callback, `paletteOpen.test.ts` covering the
store, and updated assertions in `StatusBar.test.tsx`/`CommandPalette.test.tsx`/
`WorkbenchShell.test.tsx` for the moved state and the new mount.

## Test plan

- `TitleBar.test.tsx`: renders the wordmark; shows the single dataset's name + table count when
  `datasets.length === 1`; falls back to `"{tables.length} tables"` when `datasets.length !== 1`
  (both zero and multi-dataset cases); clicking the gear calls `onOpenSettings`; clicking the ⌘K
  button flips `paletteOpen`'s `open` state.
- `paletteOpen.test.ts`: `setOpen`/`toggle` behave as a plain boolean store.
- `StatusBar.test.tsx`: existing gear/`onOpenSettings` assertions removed; the rest (posture,
  engine, counts, paused state) unchanged.
- `CommandPalette.test.tsx`: existing `⌘K` keyboard-open assertions re-target
  `stores/paletteOpen.ts` instead of internal state; add one case opened via `toggle()` directly
  (the `TitleBar` path) to prove the two entry points are symmetric.
- `WorkbenchShell.test.tsx`: one new assertion that `TitleBar` mounts inside `ShellGrid`.

## Definition of done

A title bar exists — the sixth region the master doc never named — carrying the wordmark, an
honest dataset-or-count label, the ⌘K launcher, and the sole settings entry point. The tab strip
and the five pre-existing shell regions render on the V1 token ladder's chrome/panel/canvas
surfaces instead of their current unstyled defaults. No region's internal content (explorer rows,
inspector/AI-pane body, options strip, palette body) changed — those are V3–V5. The master-doc gap
this leaf found (no title bar in §13.3's macrostructure line; the status-bar gear clause) is
closed master-first alongside the code, not left as drift. `tsc -b`/suite/`oxlint` clean. Contrast
and live-browser verification remain V6's, by design.
