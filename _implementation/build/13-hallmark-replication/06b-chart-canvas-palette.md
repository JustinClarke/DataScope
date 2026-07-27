# V6b — Chart + canvas palette

**Tier:** v0.69 (the hallmark visual replication, D71 execution) · **Master spec:** §19 (the
v0.69 subsection, V6b row) · **Decision row:** D71 (names the five signed-off mocks as the visual
reference — this leaf charters nothing new) · **Locked system:** `.hallmark/design.md` ·
**Depends on:** V6a (shipped 2026-07-25 — this leaf consumes its status register and its
reserved-colour rule). Second of the five leaves V6 was split into.

This leaf lands **before** any `src/` code for this phase, per §19's binding constraint.

## Objective

`design.md` says it plainly: "**Neither register is available for data encoding** — a chart series
or a data-type badge that reaches for amber or purple is spending a reserved channel." V6a fixed
the badge half of that sentence. The chart half is still broken, and in two different ways:

1. **Every single-series data mark in the app is drawn in the reserved amber.** The histogram
   (both the full-size module one and the profile card's sparkline), the top-values bars, the box
   plot's box/median, and the seasonality heatmap's whole intensity ramp all render
   `--color-accent`, which resolves to `--color-active`. A bar chart whose bars are the same
   colour as "this row is selected" has spent the HUD's one pointer on ambient data.
2. **The multi-series palettes are an eyeballed array with a colour collision in it.**
   `['#6366f1','#f59e0b','#10b981','#ef4444','#a855f7']` puts a byte-identical copy of
   `--color-active`'s amber at slot 2, `--color-ok`'s green at slot 3, a status red at slot 4 and
   the copilot purple at slot 5 — four of five slots impersonate a reserved register. It was never
   validated for colourblind separation, and it is cycled with `% length` when the series count
   exceeds it.

So V6b is: **solve a chart palette that stays out of the reserved registers, validate it rather
than eyeball it, put it in `design.md`, and move every data mark onto it** — including the two
paths that cannot read `var()` at all (canvas 2D, and the correlation heatmap's own
luminance maths). The export artifact (V6c), Act 0 (V6d) and all conformance verification (V6e)
are explicitly not here.

## Scope calls

**1. The palette is DERIVED, not ported — the tier's fourth recorded departure.** None of the five
signed-off mocks contains a chart of any kind (grepped: no series colours, no heatmap, no plot).
There was nothing to port, exactly as with `--color-error` in V6a, so the values were solved for
this codebase and the departure is recorded in `design.md` and master §19 rather than slipped in.
"Three recorded departures" becomes **four**.

**2. Four categorical slots, not eight — the reserved wheel is why, and it is a measured limit,
not a preference.** The dataviz method's reference instance carries eight hues. This system cannot:
`--color-error` (hue 25), `--color-active`/`--color-warn`/`--color-pk` (70), `--color-ok` (163)
and `--color-ai`/`--color-fk` (304) reserve four hue families outright, and a series has to stay
clear of all of them *and* of its own neighbours *and* clear contrast on three surfaces in two
registers. The search was run, not guessed — the unreserved arcs leave azure, magenta, lime and
indigo as the only families that pass every gate in **both** registers. A fifth slot was attempted
(teal, hue 195) and **rejected on measurement**: in the light register teal's only steps that
clear 3:1 contrast on white sit ΔE 7–10 from `--color-ok` — a teal series would have been
confusable with the "good" status green. Recorded here so V6e doesn't re-attempt it.

**3. Slot order is fixed and assignment never cycles.** Azure → magenta → lime → indigo, always
assigned in that order, never `% length`. Today's cycling is unreachable in practice —
`chartMapper.ts`'s `MAX_Y_SERIES` is 3, so no `ChartSpec` this app builds carries more than three
series — but the modulo is deleted anyway rather than left as a latent slop generator the day that
constant moves. The one place a real overflow exists is the donut, and it already has the right
mechanism: `lumpTail` folds the tail into "Other". Its cap moves from 8 slices to 5 (four real
categories + `Other`), which is the palette's honest capacity, not an arbitrary number.

**4. Slot 4 is the tightest against the copilot purple, and that is why it is last.** Indigo (hue
270) sits ΔE 16.4 (dark) / 18.0 (light) from `--color-ai` — above the method's 15 normal-vision
floor, so it is legitimately distinguishable, but it is the smallest reserved margin in the
palette. Being fourth in a fixed order means it only ever appears in a chart that genuinely has
four series, which no path in this codebase currently produces.

**5. Single-series marks take slot 1, not a colour of their own.** The histogram, the frequency
bar, the box plot, the profile sparkline, the top-values bars and the scatter's points are all
*one* series. Per the dataviz form rule, a nominal single series wears the slot-1 hue and needs no
legend — the title names it. This is why the fix is one token, not six.

**6. The seasonality heatmap becomes a real sequential ramp, expressed as `color-mix` against the
surface.** It renders magnitude, so it takes one hue with monotone lightness — slot 1's azure —
and the ramp is `color-mix(in oklab, var(--chart-seq) N%, var(--color-canvas))` rather than the
current opacity fade over amber. Mixing toward the *surface* token is what makes one expression
correct in both registers: on dark it ramps up in lightness, on light it ramps down, which is the
direction each register actually needs. Empty cells stay fully transparent — "no data" must not
read as "low value," the same rule `correlationCellColor` already follows for `null`.

**7. The correlation scale keeps its diverging structure but loses its white midpoint and its
status-red pole.** Blue→white→red was two problems: a white midpoint is a bright hole punched in a
dark instrument, and the negative pole was a red indistinguishable in meaning from
`--color-error`. It becomes **azure → neutral → magenta**: the same two poles the categorical
palette already owns, with the midpoint on a surface-neutral grey per register. Direction is
unchanged (positive = azure, the old blue's role), so no user-facing reading flips.

**8. Cell text colour moves onto ink tokens.** `correlationTextColor` currently returns literal
`#0b0b0b`/`#ffffff`. The luminance-based flip is genuinely needed — a diverging ramp gets both
dark and light — but its two outputs become `var(--color-void)` and `var(--color-ink)`. Two more
hardcoded hexes gone, and the flip still works because it is computed from the *cell* colour,
which the module resolves numerically.

**9. The two paths that cannot read `var()` get an explicit, tested literal source —
`src/lib/chartPalette.ts`.** Canvas 2D cannot resolve custom properties, and the correlation
scale's interpolation and luminance maths need numbers, not strings. Rather than let literals
drift from the tokens, the module carries the resolved values for both registers with `design.md`
cited as authority, and **a test parses `src/app/theme.css` and asserts every literal matches its
declared token**. That test is the anti-drift mechanism; without it this file is exactly the kind
of second source of truth the drift policy forbids.

**10. `CanvasScatter`'s point colour uses `globalAlpha`, not a baked `rgba()`.** Today's
`rgba(99, 102, 241, 0.35)` hardcodes both a colour and its transparency. The colour comes from the
token (read via `getComputedStyle`, the pattern that file already uses for its axis and label
colours, with the `chartPalette.ts` literal as the fallback), and the 0.35 density alpha becomes
`ctx.globalAlpha` — a rendering property, which is what it always was. Its two stale fallback
greys (`#c3c2b7`, `#898781`, neither of which is a colour in this system) go with it.

**11. Explicitly NOT data encoding, and therefore staying amber:** the correlation heatmap's
hover/selected cell outline, the chart-type tab underlines, the time-series sub-view toggle, the
`GeneratedSql` copy link, the profile card's selected-card ring, and `JoinGraph`'s confident-edge
colour. The last is the same call V4 made for the confidence pill — a structural-inference
property is a *state*, not a data series. Nothing in `features/map`, the options strip or the AI
pane is touched.

**12. Out of scope, drawn explicitly:** `lib/dspsHtml.ts`'s standalone export stylesheet (V6c —
it needs resolved literals for a different reason and leaves the app), `WorkbenchShell.tsx`'s
`Welcome` (V6d), and every conformance measurement — contrast gate, slop test, live-browser
verification (V6e). The V1 light-register contrast defect V6a recorded stays V6e's.

## The palette — solved and validated, not eyeballed

Method: the `dataviz` skill's six checks, run with its own `scripts/validate_palette.js`
(Machado–Oliveira–Fernandes 2009 CVD simulation at severity 1.0, ΔE Euclidean in OKLab ×100).
Search space was every OKLCH step in each register's lightness band at maximum in-gamut chroma,
gated on three hard constraints — ≥12 ΔE from all four reserved accents, ≥3:1 contrast against
**all three** surfaces a chart can land on (`canvas`, `card`, `elev`), and the validator's own
band/chroma/CVD/normal-vision checks — then scored on CVD separation.

### Categorical — fixed order, never cycled

| Slot | Family | Dark | Light |
| :--- | :--- | :--- | :--- |
| `--chart-1` | azure | `oklch(67% 0.165 245)` · `#119cf3` | `oklch(62% 0.155 245)` · `#048cdc` |
| `--chart-2` | magenta | `oklch(54% 0.215 342)` · `#ba1e91` | `oklch(44% 0.19 342)` · `#91006f` |
| `--chart-3` | lime | `oklch(63% 0.17 130)` · `#669c00` | `oklch(61% 0.16 130)` · `#62950e` |
| `--chart-4` | indigo | `oklch(53% 0.215 270)` · `#4057e5` | `oklch(63% 0.195 270)` · `#5d7cfd` |

| Measure | Gate | Dark | Light |
| :--- | :--- | :--- | :--- |
| CVD separation (worst adjacent pair) | ≥ 8 target | **15.6** | **19.2** |
| Normal-vision floor (worst adjacent) | ≥ 15 hard | **31.4** | **31.4** |
| Contrast, worst slot × worst surface | ≥ 3:1 | **3.03:1** | **3.08:1** |
| Distance from nearest reserved accent | ≥ 12 (this leaf's own gate) | **16.4** | **12.9** |
| Lightness band · chroma floor | validator | pass | pass |

### The other three roles

| Role | Token | Dark | Light |
| :--- | :--- | :--- | :--- |
| Sequential (magnitude) | `--chart-seq` | `var(--chart-1)` | `var(--chart-1)` |
| Diverging · positive | `--chart-pos` | `var(--chart-1)` | `var(--chart-1)` |
| Diverging · negative | `--chart-neg` | `var(--chart-2)` | `var(--chart-2)` |
| Diverging · midpoint | `--chart-mid` | `var(--color-elev)` | `var(--color-elev)` |
| "Other" / lumped tail | `--chart-other` | `var(--color-ink-3)` | `var(--color-ink-3)` |

Sequential and diverging **alias the categorical slots deliberately** — one hue family doing
magnitude is the sequential rule, and a diverging scale wants exactly two poles the reader has
already learned. Defining them as their own names means a later change to either job doesn't have
to be a change to series identity.

## Spec

### `design.md` (amended first, per the drift policy)

- A new **§ Chart palette** section: the four categorical slots with both registers, the fixed-order
  and never-cycle rule, the four-slot cap and *why* it is four (scope call 2), the sequential and
  diverging roles, and the measured table above.
- The § Light register's departure list and the `--color-error` paragraph's "third recorded
  departure" become **four**, adding the chart palette as derived with no mock provenance.
- One line in § Per-page allowances or § What pages MUST share stating the reciprocal of the
  existing rule: data marks wear `--chart-*`, never `--color-active`/`--color-ai`, and status
  colours are never a series (already stated in § Status register — cross-referenced, not repeated).

### `tokens.css` + `src/app/theme.css`

- `--chart-1` … `--chart-4`, `--chart-other`, `--chart-seq`, `--chart-pos`, `--chart-neg`,
  `--chart-mid` in both registers.
- All eight added to `theme.css`'s `@theme` block so Tailwind emits the utilities.

### `src/lib/chartPalette.ts` (new)

Resolved literals for the two `var()`-blind paths, plus the helpers built on them:

- `CHART_SERIES_DARK` / `CHART_SERIES_LIGHT` — the four slots as hex.
- `DIVERGING_DARK` / `DIVERGING_LIGHT` — `{ pos, neg, mid }` as RGB triples.
- `activeRegister()` — `matchMedia('(prefers-color-scheme: dark)')`, defaulting to dark (the
  primary register) when `matchMedia` is unavailable, which is also what jsdom gives the tests.
- Every export carries a `design.md § Chart palette` citation in its comment.

### The sweep

| File | Today | Becomes |
| :--- | :--- | :--- |
| `ChartRenderer.tsx` | `SERIES_COLORS` array, `% length` | `var(--chart-N)` by slot, no modulo |
| `Donut.tsx` | 7-hex `SLICE_COLORS`, `Other` on `--color-border` | four slots + `var(--chart-other)` |
| `CategoricalModule.tsx` | `DONUT_MAX_SLICES = 8` | `= 5` (four categories + `Other`) |
| `FrequencyBar.tsx` | `BAR_COLOR = '#6366f1'` | `var(--chart-1)` |
| `Histogram.tsx` (charts) | `bg-(--color-accent)/60` | `bg-(--chart-1)/70` |
| `ColumnCard.tsx` | sparkline + top-values bars on `--color-accent` | `--chart-1` (selected-card ring untouched) |
| `BoxPlot.tsx` | box fill/stroke + median on `--color-accent` | `var(--chart-1)` |
| `SeasonalityHeatmap.tsx` | amber + opacity fade | `color-mix` sequential ramp on `--chart-seq` |
| `correlationColor.ts` | blue/white/red literals | `DIVERGING_*` poles, neutral midpoint, ink-token text |
| `CanvasScatter.tsx` | `rgba(99,102,241,0.35)`, stale grey fallbacks | token read + `globalAlpha`, system fallbacks |

## Files

Modified: `design.md`, `tokens.css`, `src/app/theme.css`, `_implementation/DATASCOPE.md` (§19's
departure count, master-first), this folder's `README.md`, and the ten source files above plus
their tests.
Added: `src/lib/chartPalette.ts`, `src/lib/chartPalette.test.ts`.
Unchanged: `src/lib/dspsHtml.ts` (V6c), `src/app/WorkbenchShell.tsx` (V6d), everything under
`features/map`, `features/ai`, `features/explorer`.

## Dependencies

V6a (shipped 2026-07-25) — this leaf's reserved-distance gate is measured against the status
register V6a added, and its "status is never a series" rule is the one being honoured here.

## Acceptance criteria

- [ ] `design.md` carries a § Chart palette section with both registers, the fixed-order/never-cycle
      rule, the four-slot cap and its measured reason, and the validation table
- [ ] Master §19's "Three recorded departures" is corrected to **four**, master-first, and mirrored
      into `design.md` and this tier's `README.md`
- [ ] All eight `--chart-*` tokens exist in `tokens.css` and `theme.css` in both registers and are
      emitted as Tailwind utilities via `@theme`
- [ ] Every measured number in the palette table is reproducible from `validate_palette.js` plus its
      exported `contrast()` — CVD ≥ 8, normal-vision ≥ 15, ≥ 3:1 on canvas/card/elev, ≥ 12 ΔE from
      every reserved accent, in **both** registers
- [ ] No data mark in the app renders `--color-accent`, `--color-active`, `--color-ai` or a status
      colour — verified by grepping the chart and profiling trees
- [ ] Zero `#rrggbb` literals remain in `src/features/charts/**` and `src/components/charts/**`;
      the only chart-colour literals in `src/` live in `chartPalette.ts`
- [ ] `chartPalette.test.ts` parses `src/app/theme.css` and fails if any literal drifts from its token
- [ ] No slot assignment uses `%` — the modulo is gone from `ChartRenderer` and `Donut`
- [ ] The donut folds past four categories into `Other` on `--chart-other`
- [ ] The seasonality ramp is monotone in lightness in both registers and renders empty cells fully
      transparent
- [ ] The correlation scale has no white midpoint and no status red; positive is still the
      cool pole
- [ ] No file in the V6c/V6d exclusion set changed — `git status` confirms
- [ ] `tsc -b` clean; full suite green (baseline: 133 files / 1310 tests); `oxlint` clean apart from
      the pre-existing unrelated `_misc/spike-webllm/smoke.mjs` warning
- [ ] This folder's `README.md` per-phase-leaves list links this doc

**Not a criterion here, by design:** live-browser verification and the slop-test gate are V6e's.
V6b asserts its palette was computed against the stated gates; it does not re-audit V1's shipped
accent tokens.

## Test plan

- **`chartPalette.test.ts` (new)** — the anti-drift test: read `src/app/theme.css`, extract each
  `--chart-*` declaration for both registers, and assert it equals the module's literal. Plus one
  case asserting the four slots are pairwise distinct.
- **`correlationColor.test.ts`** — every existing assertion names an old literal and must be
  rewritten against the new scale. Keep the *behavioural* cases exactly as they are: `null` →
  `transparent`, out-of-range clamping, symmetry around zero, and the text-colour flip. Add one
  case asserting the midpoint is neither white nor a status colour.
- **`Donut` / `CategoricalModule`** — add a case asserting a >4-category column renders exactly
  five wedges with the fifth labelled `Other`.
- **`CanvasScatter.test.tsx`** — jsdom has no 2D context, so its existing tests assert the element
  and the no-throw path only; they should stay green untouched. Verify rather than assume.
- Everything else in the sweep is a class-string or attribute change on components whose tests
  select by text/role/`data-testid` — grep the test tree for the old literals before starting.

## Definition of done

Charts in this app no longer spend the HUD's reserved registers on data. A four-slot categorical
palette — solved against the reserved wheel, validated for colourblind separation and contrast on
every surface in both registers, and recorded in `design.md` as the tier's fourth derived
departure — carries series identity; slot 1 carries every single-series mark; a real sequential
ramp carries the seasonality heatmap; and a two-pole diverging scale with a neutral midpoint
carries correlation, with no white hole and no status red. The two paths that cannot read `var()`
resolve their colours from one cited module whose literals a test pins to the tokens themselves.
`tsc -b`/suite/`oxlint` clean.
