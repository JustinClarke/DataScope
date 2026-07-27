# V5 — Options strip + command palette

**Tier:** v0.69 (the hallmark visual replication, D71 execution) · **Master spec:** §19 (the
v0.69 subsection, V5 row), §13.3 (the options strip / command palette paragraphs) · **Decision
row:** D71 (names the five signed-off mocks as the visual reference — this leaf charters nothing
new) · **Locked system:** `.hallmark/design.md` · **Depends on:** V1 (token layer, shipped
2026-07-25). Not V2 — the strip and palette are not in V2's region-surface table (that table
covers the five pre-existing `data-region` containers plus the title bar only); `theme.css`
already comments `--color-panel` as covering "options strip" and `--color-card` as covering
"palette," same reasoning V3/V4 used to skip V2.

This leaf lands **before** any `src/` code for this phase, per §19's binding constraint. No code
changes in this session beyond what this doc specs; this doc is the spec the session builds
against (this tier has landed doc-and-code together per phase since V2, not across two sessions —
see BUILD-ORDER.md's log for V2–V4).

## Objective

Reskin the two regions W5 built as mechanism-only, functional chrome: the options strip
(`OptionsStrip.tsx`, above the multi-table map) and the command palette (`CommandPalette.tsx`,
⌘K). Both currently render on the legacy `--color-bg`/`--color-border`/`--color-fg-muted`
aliases with no surface distinction from the canvas around them. The master row names three
concrete things — **HUD button voice, ranked top action, palette overlay** — and the research
below found all three map onto real, already-present data (`visible`'s array order for rank,
`TAB_GLYPH` for palette-row icons, `disabledReason` for palette-row meta) — no fabricated content,
no new ranking logic (D58 stays satisfied), no new store.

## Scope calls

**1. The strip's subject-lead pill (`.strip__lead`/`.strip__subject`, "Acting on ● metrics") is
not ported — redundant with selection state that already renders elsewhere.** The mock shows a
badge naming the selected table next to the action buttons. But which table is selected is
already visible on two other surfaces the moment a table is clicked: the map card gets
`.is-selected` (`Erd.tsx`), and the explorer row gets V3's inset-accent `.trow` selection state.
A third readout on the strip itself would be new UI surface not named in the master row, repeating
information already on-screen — the same "no new mode-summary control" reasoning V4's scope call
5 used for the mock's `.aimode` chip. Skipped, not silently dropped: recorded here so a future
session doesn't assume it was missed.

**2. The strip's "· more in ⌘K" hint (`.strip__more`) is not ported — not always true, and not
named in the row.** `rankNextActions` already caps its list at 5 (W5's own doc); whether the
palette actually holds anything beyond what the strip shows varies per selection, so a static
claim of overflow would sometimes be false chrome. Also outside the row's three named elements.
Same disposition as scope call 1.

**3. Ranked-top styling requires both `index === 0` *and* `ready` — a disabled action never gets
the amber top treatment, even though today's real data never exercises that branch.**
`visible`'s order already **is** the rank (D58: `OptionsStrip` filters the dataset-wide
`rankNextActions` output, never re-ranks), so "the top action" is simply `visible[0]` — no new
sorting. `rankNextActions` (`lib/capabilities.ts`) only ever emits `profile`/`sql`/`charts`/
`correlation` (confirmed by inspection — every `module:` literal in the file), and all four are
in `TAB_TYPE_BY_MODULE` as of W7.5's module wiring — so `visible[0]` is *always* ready today; W5's
own doc's "mostly disabled" framing describes a state this tier has since closed. The `ready &&`
guard is kept anyway, not as a live case but because amber is the HUD's "active/selected/
primary-key" register (`design.md`) and painting it on a disabled, unclickable button would
assert "click this" about a control that does nothing — the same rule the guard would need to
enforce the day `rankNextActions` gains a fifth route or a module gets un-wired. Verified in the
test plan via mocking `isDestinationReady`, not a synthetic "unwired top action" data fixture,
since real data can't produce one right now.

**4. Palette-row icons reuse `TAB_GLYPH` (`types/tabs.ts`, V2) — not a second icon table.** Every
`PaletteEntry` whose `action.kind` is `open-map`/`open-profile`/`open-module` already names a real
`TabType` (`map`, `profile`, or the module id — `WiredModule`'s five members are a subset of
`TabType`'s seven by construction). `TAB_GLYPH[type]` is the single existing source for what a
type looks like — reusing it here is the same "one map, two consumers" discipline
`isDestinationReady`/`MODULE_LABELS` already established between the strip and palette at W5. The
mock's own `.pcmd__g` icons are uniformly `--color-ink-3` (not accent-colored — confirmed in
`workbench-shell.html`'s `.pcmd__g` rule), so no active/artifact color branching is needed the way
`TabHeaderGlyph`'s tab-strip context requires; the palette renders `TAB_GLYPH`'s dingbat-or-`Icon`
shape directly, always muted.

**5. The two `unavailable` entries (`ai`, `ingestion`) get the mock's own literal glyphs for those
exact commands, not an invented placeholder.** Neither has a `TabType` to look up (AI is the
always-on right pane, not a tab; ingestion has no tab type either). The mock's static command list
independently contains both as real entries — `✦ Ask AI` and `＋ Add data` — so `✦`/`＋` are a
direct port of the mock's own choices for these exact two commands, not fabrication.

**6. No group headers (`.palette__grp`) and no dynamic "Actions on `<table>`" context block.** The
mock's palette is organized into labeled sections, one of them (`RANK[ctxTable]`) populated from
the *currently selected table* — a concept `CommandPalette.tsx` doesn't read today (it takes no
selection dependency at all). Wiring that in is new data flow (a `useSelectionStore` read, a merge
with `buildPaletteEntries`'s output), not a restyle — out of scope for "palette overlay," the same
"chrome fidelity only, no new behavior" boundary V4 held for the AI pane. The remaining static
groups (`Data`/`AI`/`View`/`Share`) are illustrative in the mock and don't map cleanly onto our
five real destinations without inventing categories the registry doesn't have — grouping stays a
flat, ordered list (already the registry's real order: map, profiles, modules, not-yet-wired).
Logged as explicit follow-up scope, not silently dropped, same posture W5 used for the palette's
own five-module deferral.

**7. Disabled palette rows keep the existing `Tooltip`-on-hover idiom; `disabledReason` is not
also rendered as permanent inline text.** The mock's `.pcmd__meta` shows meta text (including
disabled reasons) inline, always visible. But W5 already established `Tooltip` as the shared
disabled-reason idiom between the strip and the palette; showing the same string both in a
tooltip and permanently inline is the same redundant-caption call V4's scope call 9 declined for
the audit-trail container. The reason stays reachable on hover/focus, matching every other
disabled control in the app.

**8. The scrim's color is the mock's own literal value, not left on the pre-existing
`bg-black/40`.** `workbench-shell.html`'s `.scrim` rule is `rgba(4,5,7,0.6)` — a hardcoded literal
in the mock itself (the seven-surface token ladder doesn't cover an overlay backdrop), so porting
it as a literal is mock-fidelity, not a new defect for V6's conformance pass to find. Touched
because this file is being rewritten anyway, same "fixed rather than left as one more V6 count"
reasoning V4 used for the ambiguity paragraph's color. `AISettingsPanel.tsx`'s own unrelated
`bg-black/40` modal is untouched — different component, not one of the five signed-off mocks.

## Spec

### `src/features/map/OptionsStrip.tsx`

- Container: `bg-(--color-panel)` (replacing no background), `border-(--color-rule-2)` in place
  of the legacy `border-(--color-border)` bottom border. No layout change.
- Empty-state line: `font-mono text-[length:var(--text-md)] text-(--color-ink-3)` (was `text-xs
  text-(--color-fg-muted)`); copy unchanged (`"No suggested actions for this selection."` — the
  mock's own empty-state copy answers a different case, "nothing selected at all," which this
  component doesn't have per W5's existing behavior of showing the full list when nothing is
  selected).
- Every action button (`.act` voice): `inline-flex items-center gap-1 whitespace-nowrap
  rounded-(--radius-md) border px-[0.7rem] py-[0.4rem] font-mono text-[length:var(--text-md)]
  tracking-[0.02em] transition-colors active:translate-y-px`, plus one of:
  - Not ready: `cursor-not-allowed border-(--color-rule) bg-(--color-card) text-(--color-ink-3)
    opacity-50` (replacing the current disabled branch).
  - Ready, `index === 0` (`.act--top`): `border-(--color-active) bg-(--color-active)/12
    text-(--color-active) hover:bg-(--color-active)/20`, plus a leading
    `<span aria-hidden="true" className="text-[length:var(--text-2xs)] text-(--color-active)">▲
    top</span>` before `{action.verb}` (scope call 3).
  - Ready, otherwise: `border-(--color-rule) bg-(--color-card) text-(--color-ink-2)
    hover:border-(--color-rule-hi) hover:text-(--color-ink)`.
- `data-testid`s, `disabled`, `onClick`, and the `Tooltip` wrapper for not-ready actions: all
  unchanged.

### `src/features/palette/CommandPalette.tsx`

- New small helpers (colocated in this file, not exported — palette-only concern):
  `UNAVAILABLE_GLYPH: Record<string, string>` (`{ ai: '✦', ingestion: '＋' }`, scope call 5),
  `entryTabType(entry): TabType | null` (maps `open-map`→`'map'`, `open-profile`→`'profile'`,
  `open-module`→`entry.action.module`, `unavailable`→`null`), and `EntryGlyph({ entry })`
  rendering `TAB_GLYPH[tabType]`'s dingbat-or-`Icon` shape when `entryTabType` resolves, else
  `UNAVAILABLE_GLYPH[entry.id] ?? '▸'` (scope calls 4–5). Import `TAB_GLYPH`/`TabType` from
  `../../types/tabs`.
- Scrim: `bg-[rgba(4,5,7,0.6)]` (scope call 8); layout (`fixed inset-0 z-50 flex items-start
  justify-center`) unchanged except `pt-24` → `pt-[4.5rem]` (the mock's literal top offset).
- Palette container: `overflow-hidden rounded-(--radius-xl) border border-(--color-rule)
  bg-(--color-card) shadow-(--shadow-overlay)` (replacing `rounded-lg border
  border-(--color-border) bg-(--color-bg) p-2 shadow-lg`; the `p-2` moves — input row and list get
  their own padding below, matching the mock's `.palette__input`/`.palette__list` split instead of
  one outer padding box).
- Input row (new wrapping `div`): `flex items-center gap-2.5 border-b border-(--color-rule-2)
  px-4 py-3`, containing a leading `<span aria-hidden="true" className="font-mono
  text-[length:var(--text-xs)] text-(--color-ink-3)">⌘K</span>` then the existing `<input>`,
  restyled to `flex-1 bg-transparent font-sans text-[length:var(--text-xl)] text-(--color-ink)
  outline-none placeholder:text-(--color-ink-3)` (border/background removed — the row's own
  bottom border is the only division now). `data-testid`, `value`, `onChange`, `autoFocus`, and
  placeholder copy (`"Jump to…"`) unchanged; no `aria-label` is added (there wasn't one before —
  the mock's own `aria-label="Search"` is a real gap, but adding accessibility attributes is
  outside a chrome-fidelity leaf's scope, same boundary V4 held for not touching behavior).
- List: `<ul>` gains `max-h-[22rem] overflow-y-auto p-1` (was `mt-2 max-h-80 overflow-auto`, and
  the `mt-2` drops now that the input row supplies its own bottom border/spacing).
- Each row button (`.pcmd` voice): `flex w-full items-center gap-2.5 rounded-(--radius-md)
  px-2.5 py-2 text-left font-sans text-[length:var(--text-lg)]`, plus:
  - Enabled: `text-(--color-ink-2) hover:bg-(--color-elev) hover:text-(--color-ink)`.
  - Disabled: `cursor-not-allowed text-(--color-ink-3) opacity-50` (unchanged truth, restyled).
  - A leading `<span aria-hidden="true" className="w-[1.1rem] text-center
    text-(--color-ink-3)"><EntryGlyph entry={entry} /></span>` before the existing `<span>
    {entry.label}</span>`.
- `Tooltip` wrapper for `disabledReason`, `handleSelect`, `activate`, the `⌘K`/`Escape` keydown
  listener, and `usePaletteOpenStore` wiring: all unchanged (scope call 7).

## Files

Modified: `src/features/map/OptionsStrip.tsx` + `OptionsStrip.test.tsx` (new rank-marker
assertion), `src/features/palette/CommandPalette.tsx` + `CommandPalette.test.tsx` (new icon-column
assertion).
Unchanged: `src/lib/paletteRegistry.ts` (+ test — no data-shape change, scope call 6),
`src/services/navigation.ts` (`isDestinationReady`/`MODULE_LABELS` already exist, reused as-is),
`src/types/tabs.ts` (`TAB_GLYPH` already exists, reused as-is), `src/features/map/DatasetMap.tsx`,
`src/components/Tooltip.tsx`, `src/features/ai/AISettingsPanel.tsx`, every explorer/inspector/
ai-pane/title-bar/status-bar file — V2/V3/V4's territory.

## Dependencies

V1 (token layer + locked system) — shipped 2026-07-25, leaf doc landed the same day.

## Acceptance criteria

- [ ] `OptionsStrip`'s container renders on `--color-panel` with a `--color-rule-2` bottom border;
      no `--color-border`/`--color-bg`/`--color-fg-muted` legacy alias remains in the file
- [ ] Every strip button carries the `.act` voice (mono, `--color-card` face, `--color-rule`
      border, `--color-ink-2` text, hover lifts border/text); a not-ready button is
      `--color-ink-3`-on-`--color-card` at 50% opacity, never amber
- [ ] `visible[0]` renders the `▲ top` marker and the amber `.act--top` treatment **only when**
      it is also ready (`isDestinationReady`); every other button, ready or not, carries no rank
      marker (scope call 3)
- [ ] No `.strip__lead`/subject-badge element and no "more in ⌘K"-equivalent text exists anywhere
      in `OptionsStrip.tsx` (scope calls 1–2)
- [ ] Every `CommandPalette` row (`open-map`/`open-profile`/`open-module` entries) renders
      `TAB_GLYPH`'s icon or dingbat for its resolved `TabType`; the `ai` and `ingestion` rows
      render `✦`/`＋` respectively; no second glyph-lookup table exists outside this file's two
      small helpers (scope calls 4–5)
- [ ] The palette scrim, container, input row, and list all render on the tokens/values named in
      the Spec section above; no `--color-border`/`--color-bg`/`bg-black` remains in
      `CommandPalette.tsx`
- [ ] No `disabledReason` string renders as permanent visible text anywhere in the palette — only
      via the existing `Tooltip` (scope call 7)
- [ ] No group-header element and no selection-store read exists in `CommandPalette.tsx` (scope
      call 6)
- [ ] Every existing `OptionsStrip.test.tsx` and `CommandPalette.test.tsx` assertion (all select
      by `data-testid`/text/role, never by class) still passes unmodified
- [ ] `tsc -b` clean; full suite green (re-measure against the tree at implementation time); `oxlint`
      clean apart from the pre-existing unrelated `_misc/spike-webllm/smoke.mjs` warning
- [ ] This folder's `README.md` per-phase-leaves list links this doc

**Not a criterion here, by design:** contrast measurement and live-browser verification remain
V6's, same as V1–V4. The subject-lead pill, the "more in ⌘K" hint, palette group headers, and the
dynamic "Actions on `<table>`" context block are explicit follow-up scope (scope calls 1, 2, 6),
not this leaf's job.

## Test plan

- `OptionsStrip.test.tsx`: existing cases (empty state, enabled/disabled rendering, subject
  filtering, click routing) select by `data-testid`/text, unaffected. Add one case with the
  existing multi-action fixture asserting exactly one strip button contains `▲ top` and it's the
  first one rendered (order = rank, scope call 3's `visible[0]`). Add one case that extends the
  existing `services/navigation` mock to force `isDestinationReady` to always return `false` for
  this render, asserting no element with `▲ top` text exists anywhere in the strip even though a
  top-ranked action still exists (proves the guard, since real `rankNextActions` output can't
  reach this branch today — scope call 3).
- `CommandPalette.test.tsx`: existing cases (open/close, filter, activation, disabled inertness)
  unaffected. Add one case asserting the `sql` entry's row contains an accessible icon (query by
  the button's child structure, not by class) and the `ai`/`ingestion` rows render their literal
  glyphs (`✦`/`＋`) rather than a shared fallback.

## Definition of done

The options strip and command palette render the mock's HUD button voice and palette-overlay
chrome — mono buttons on the `--color-card`/`--color-panel` surfaces, the amber top-rank
treatment reserved for a genuinely actionable top action, and palette rows carrying the same
per-type icon `TAB_GLYPH` already gives the tab strip. No new ranking logic, no new store, no
fabricated grouping or context data beyond what `visible`'s existing order and `TAB_GLYPH`'s
existing map already provide. Three mock elements (subject-lead pill, "more in ⌘K" hint, palette
group headers/context block) are explicitly deferred, not silently dropped. `tsc -b`/suite/
`oxlint` clean. Contrast and live-browser verification remain V6's, by design.
