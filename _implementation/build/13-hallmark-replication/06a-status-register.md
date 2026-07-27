# V6a — Status register + chrome sweep

**Tier:** v0.69 (the hallmark visual replication, D71 execution) · **Master spec:** §19 (the
v0.69 subsection, V6a row) · **Decision row:** D71 (names the five signed-off mocks as the visual
reference — this leaf charters nothing new) · **Locked system:** `.hallmark/design.md` ·
**Depends on:** V2–V5 (all shipped 2026-07-25). First of the five leaves V6 was split into.

This leaf lands **before** any `src/` code for this phase, per §19's binding constraint.

## Objective

The tier's own README called the remaining conformance debt "82 hardcoded palette colours" as if
it were one sweep. It isn't, and V6a exists because of the specific reason it isn't: **roughly 60
of those occurrences are error and warning feedback blocks that have no token to move to.** V1
shipped `--color-ok` and nothing else in the status family — no error, no warn. A sweep can't
start until the tokens exist, and inventing them inline at the call site is precisely what
`design.md`'s drift policy ("amend this file first — never override locally") and the hallmark
skill's locked-token gate (48: "if a value is needed that doesn't exist as a token, lift it into
the token block as a new named variable, then reference it") both forbid.

So V6a is: **amend the system, then sweep the app chrome onto it.** Chart series palettes (V6b),
the standalone export HTML (V6c) and Act 0's composition (V6d) are explicitly not here.

## Scope calls

**1. `--color-warn` is a port, not an invention: it resolves to the same amber as
`--color-active`.** Checked all five signed-off mocks — `workbench-shell.html` and
`workbench-ai.html` both style their warning glyph `.ev__i--warn { color: var(--c-active) }`, and
`workbench-ai.html`'s `.astep__v .warn` does the same. The mocks deliberately spend the HUD amber
on "pay attention here," treating active/selected and warning as one attentional register. V4
already shipped that reading (its evidence row's `⚠` renders `--color-active`). `design.md` says
"where the two disagree, the mocks win and this file gets amended" — so `--color-warn` is defined
as an alias of `--color-active`, and `design.md`'s amber register line is **widened** from
"active / selected / primary key" to include warning. This is recorded as a real semantic
widening, not slipped in: a reader of `design.md` must be able to see that amber legitimately
carries warnings here. The accent budget survives because warning blocks are conditional and
transient, not ambient chrome.

**2. `--color-error` has no mock provenance at all and is therefore DERIVED — a third recorded
departure, alongside `--c-fg-3` and the light register.** No error state exists anywhere in the
five mocks (grepped: zero red declarations). So its value is solved for this codebase the same
way the light register was, and `design.md`/master §19's "Two recorded departures from the mocks"
becomes **three**. Solved, not eyeballed — `oklch`→sRGB conversion plus WCAG contrast computed
against the real shipped surface ladder using the dataviz skill's own exported `contrast()`:

| Token | Value | Worst surface | Contrast |
| :--- | :--- | :--- | :--- |
| `--color-error` dark | `oklch(68% 0.2 25)` → `#fc5855` | `--color-elev` | **5.49:1** |
| `--color-error` light | `oklch(52% 0.21 25)` → `#c50220` | `--color-elev` | **5.26:1** |

Both clear 4.5:1 on every one of the four surfaces error text can land on (canvas, panel, card,
elev), in both registers. Hue 25 sits 45° from the dark amber and 37° from the light amber, so an
error block never reads as a selection.

**3. A pre-existing contrast defect was found while solving this, and is recorded for V6e rather
than fixed here.** The same computation, run against V1's already-shipped tokens as a
method sanity-check, measured **`--color-ok` light at 4.46:1** and **`--color-active` light at
4.40:1** against `--color-elev` — both under AA for normal text. `design.md` claims the light
register was "re-solved for ≥4.5:1," which holds against canvas (5.05 / 4.99) but was never
checked against the hover/selected surface those colours also land on. This is **not V6a's to
fix** — it is a V1 token defect, V6e is the contrast gate, and quietly re-solving two shipped
accent tokens inside a sweep leaf would be exactly the scope creep this tier keeps refusing. It
is written down here and in BUILD-ORDER.md's log so V6e inherits it as a known input rather than
rediscovering it. Note that `--color-warn` inherits the same shortfall by aliasing
`--color-active` (scope call 1); V6e's fix to one is a fix to both.

**4. `dark:` utility pairs collapse to a single token utility — a real simplification, not just a
rename.** Today's blocks carry manual light/dark pairs (`text-red-600 dark:text-red-400`,
`text-amber-700 dark:text-amber-400`) because there was no token to flip. `theme.css` already
flips every token by `prefers-color-scheme`, so each pair becomes one utility
(`text-(--color-error)`) and the `dark:` variant disappears. This is why the occurrence count
drops by more than the number of blocks touched.

**5. The four modal scrims port the mock's literal backdrop, matching what V5 already landed.**
`bg-black/40` in `FormatRejectionModal`, `AISettingsPanel`, `TransformGuardModal` and
`ShareDialog` all become `bg-[rgba(4,5,7,0.6)]` — `workbench-shell.html`'s own `.scrim` value,
which V5 already ported into `CommandPalette`. Kept as a literal rather than tokenized because
the seven-surface ladder deliberately has no overlay-backdrop entry and inventing one for four
call sites would be a token nobody asked for; consistency with V5's already-shipped scrim is the
point. (V5's leaf recorded this same reasoning for the same value.)

**6. `Tooltip.tsx` moves onto the surface ladder rather than staying pure black-on-white.** It is
the only remaining `bg-black text-white` in the app and reads as a foreign element against every
HUD surface. It becomes `--color-elev` face + `--color-ink` text + a `--color-rule` border —
the same treatment every other floating surface in the system already uses. Behaviour,
positioning, `aria-describedby` wiring and the hover/focus reveal are untouched.

**7. `ColumnCard`'s semantic-type legend drops colour entirely and takes the HUD's mono voice —
the human call, "keep it on theme with the workbench."** Today it maps
`Temporal→blue · Quantitative→emerald · Categorical→purple · Textual→amber`, which collides
head-on with the locked rule that purple = copilot/FK and amber = active/PK, *never
interchangeable*: a purple badge on a profiling surface is indistinguishable from an
AI-authored marker. Re-hueing was considered and rejected — the HUD's palette has exactly two
accents and both are reserved, so any four-hue encoding either reuses a reserved register or
invents a decorative one, and `design.md` bans app-page enrichment. The badges become mono
micro-caps on `--color-elev` with `--color-ink-2` text, matching the origin badge V3 already
landed on `.trow`'s role slot. Type identity survives as the **label text**, which was always the
real carrier — the colour was decoration on top of a word that already said "Temporal."

**8. Out of scope, drawn explicitly:** every `#rrggbb` series colour in `Donut.tsx`,
`ChartRenderer.tsx`, `FrequencyBar.tsx`, `CanvasScatter.tsx` and `correlationColor.ts` (V6b —
they need a *validated* categorical palette, which is a different discipline with its own
runnable gate); `lib/dspsHtml.ts`'s generated stylesheet (V6c); `WorkbenchShell.tsx`'s `Welcome`
composition (V6d); and all contrast/slop-test/live-browser verification (V6e). No file in those
sets is touched here.

## Spec

### `design.md` (amended first, per the drift policy)

- Theme table gains three rows: `--color-ok` (already shipped but undocumented in the table),
  `--color-warn`, `--color-error`, with their dark values.
- The "Two accent registers" paragraph's amber clause widens to name warning (scope call 1).
- The "Two recorded departures" section becomes **three**, adding `--color-error` as derived with
  no mock provenance and its measured contrast (scope call 2).
- A short **Status register** subsection states the rule the dataviz skill also enforces: status
  colours are reserved, never reused as a chart series, and always ship with an icon or label
  rather than colour alone.

### `tokens.css` + `src/app/theme.css`

- `--color-error: oklch(68% 0.2 25)` dark / `oklch(52% 0.21 25)` light.
- `--color-warn: var(--color-active)` in both registers, with the mock provenance in a comment.
- Both added to `theme.css`'s `@theme` block so Tailwind emits the utilities.
- `--color-ok` is already defined; unchanged.

### The sweep — one pattern per row, applied across the files below

| Today | Becomes |
| :--- | :--- |
| `text-red-500` | `text-(--color-error)` |
| `text-red-600 dark:text-red-400` | `text-(--color-error)` |
| `border-red-400/50 bg-red-500/5` | `border-(--color-error)/40 bg-(--color-error)/5` |
| `border-red-500/40 bg-red-500/10` | `border-(--color-error)/40 bg-(--color-error)/10` |
| `border-amber-400/50 bg-amber-500/5` | `border-(--color-warn)/40 bg-(--color-warn)/5` |
| `bg-amber-500/10 text-amber-700 dark:text-amber-400` | `bg-(--color-warn)/10 text-(--color-warn)` |
| `text-emerald-500` | `text-(--color-ok)` |
| `bg-black/40` (scrim) | `bg-[rgba(4,5,7,0.6)]` |
| `bg-black text-white` (tooltip) | `bg-(--color-elev) text-(--color-ink)` + `--color-rule` border |

Applied in: `IngestionPanel.tsx`, `ShareDialog.tsx`, `ColumnCard.tsx` (scope call 7),
`TableList.tsx`, `AITurnView.tsx`, `ViewerMode.tsx`, `ResultsGrid.tsx`, `ViewSpecRenderer.tsx`,
`PeriodComparisonView.tsx`, `ShareLinksList.tsx`, `Tooltip.tsx`, `TransformGuardModal.tsx`,
`QueryResultsPanel.tsx`, `InsightFeed.tsx`, `FormatRejectionModal.tsx`, `TrendView.tsx`,
`SeasonalityHeatmap.tsx`, `DistributionModule.tsx`, `ScatterDrillThrough.tsx`,
`CorrelationModule.tsx`, `CategoricalModule.tsx`, `AISettingsPanel.tsx`.

**`ViewSpecRenderer.tsx` carries a D55 constraint** — it is the deterministic renderer for
model-authored output. The `viewspec-guard` skill is loaded before it is edited. The change there
is a colour swap on an existing error branch only: no producer/validator seam, no `componentId`
routing, no spec-shape change.

## Files

Modified: `design.md`, `tokens.css`, `src/app/theme.css`, plus the 22 component files listed
above and any of their test files whose assertions name a swept class.
Unchanged: `src/features/charts/categorical/Donut.tsx`, `src/components/charts/ChartRenderer.tsx`,
`src/features/charts/categorical/FrequencyBar.tsx`,
`src/features/charts/correlation/CanvasScatter.tsx`,
`src/features/charts/correlation/correlationColor.ts` (all V6b), `src/lib/dspsHtml.ts` (V6c),
`src/app/WorkbenchShell.tsx` (V6d).

## Dependencies

V2–V5, all shipped 2026-07-25. V6a blocks V6b/V6c/V6d, which consume its tokens.

## Acceptance criteria

- [ ] `design.md` documents `--color-ok`/`--color-warn`/`--color-error`, widens the amber register
      to name warning, records `--color-error` as a **third** derived departure with its measured
      contrast, and states the status-reserved rule
- [ ] Master §19's "Two recorded departures" wording is corrected to three, master-first, and
      mirrored into this tier's `README.md`
- [ ] `--color-error` and `--color-warn` exist in both `tokens.css` and `theme.css` (both
      registers) and are emitted as Tailwind utilities via `@theme`
- [ ] Every measured contrast in scope call 2 is reproducible: `--color-error` clears 4.5:1
      against canvas, panel, card and elev in both registers
- [ ] Zero `text-red-*`, `bg-red-*`, `border-red-*`, `text-amber-*`, `bg-amber-*`,
      `border-amber-*`, `text-emerald-*`, `bg-black`, `text-white` utilities remain in any
      non-test file outside the V6b/V6c/V6d exclusion set — verified by the same grep that
      produced the 82 count
- [ ] No `dark:` variant remains on any swept colour utility (scope call 4)
- [ ] `ColumnCard`'s type badges render as mono micro-caps on `--color-elev`/`--color-ink-2` with
      no hue encoding; the type name is still visible as text (scope call 7)
- [ ] `Tooltip` renders on `--color-elev`/`--color-ink` with a `--color-rule` border; its
      `aria-describedby` wiring and hover/focus reveal are unchanged
- [ ] No file in the V6b/V6c/V6d exclusion set changed — `git status` confirms
- [ ] `tsc -b` clean; full suite green (baseline: 133 files / 1309 tests); `oxlint` clean apart
      from the pre-existing unrelated `_misc/spike-webllm/smoke.mjs` warning
- [ ] This folder's `README.md` per-phase-leaves list links this doc

**Not a criterion here, by design:** the contrast gate, slop test and live-browser verification
are V6e's. V6a asserts only that its *own* new tokens were computed rather than eyeballed; it does
not re-audit V1's shipped values beyond recording the defect scope call 3 found.

## Test plan

Most swept files' tests select by text/role/`data-testid`, so the sweep should be assertion-neutral.
The exceptions to check and update:

- Any test asserting on a swept class string directly — grep the test tree for `red-`, `amber-`,
  `emerald-`, `bg-black` before starting, and update those assertions to the token utility.
- `ColumnCard.test.tsx`: type-badge assertions that select by hue class move to selecting the
  badge by its text (the type name), which is the encoding scope call 7 keeps.
- `Tooltip` has no dedicated test; its consumers assert on `content` text, unaffected.
- Add one focused case in `ColumnCard.test.tsx` asserting no badge carries a hue class, so the
  two-register collision can't silently return.

## Definition of done

The design system has a real status register — `--color-ok`, `--color-warn`, `--color-error` —
with `warn` ported from the mocks' own `.ev__i--warn` rule and `error` derived and measured
against every surface it can land on, both recorded in `design.md` rather than improvised at a
call site. Every error/warning/success feedback surface and every modal scrim in the app chrome
renders on those tokens, with the manual `dark:` pairs collapsed away. `ColumnCard`'s type badges
no longer spend the reserved purple and amber registers on data-type encoding. Chart palettes,
the export artifact, Act 0's composition and all verification remain their own leaves.
`tsc -b`/suite/`oxlint` clean.
