# V6e — Conformance gate

**Tier:** v0.69 (the hallmark visual replication, D71 execution) · **Master spec:** §19 (the
v0.69 subsection, V6e row) · **Decision rows:** D71 (names the five signed-off mocks as the
visual reference — this leaf charters nothing new) · **Locked system:** `.hallmark/design.md`
· **Depends on:** V6a–V6d (all shipped 2026-07-25). Fifth and last of the leaves V6 was
split into, and the tier's closing gate.

This leaf lands **before** any `src/` code for this phase, per §19's binding constraint.

## Objective

V1–V6d each asserted conformance to `design.md` and each deferred the *measurement* of it —
V6d's own criteria say so in as many words: *"measured contrast of Act 0's surfaces, the
slop-test gate and live-browser verification are V6e's, exactly as they were for V6a–V6c."*
Eight leaves have now written that cheque. This one cashes it.

Four measurements, from the master row:

1. **Contrast measurement** — every ink-on-surface pair the app actually renders, both
   registers, against WCAG thresholds.
2. **Slop-test gate** — the Hallmark skill's 58 gates plus its six-axis pre-emit critique, run
   against the shipped app rather than against a mock.
3. **Live-browser verification** — the app open in a real browser at real viewports, both
   registers. Every prior leaf verified through jsdom, which renders no pixels and computes no
   layout.
4. **Residual-zero re-measurement** — re-running this folder's README census (82 hardcoded
   palette colours across 22 files, 7 token names across 76 components) and accounting for
   every survivor.

**What makes this a build leaf and not a report.** A measurement taken once is a number in a
document that the next leaf silently invalidates. Two of the four — contrast and residual-zero —
are mechanical, so they ship as tests in the suite and become standing gates. The other two are
irreducibly perceptual: a slop gate asks whether a page *looks* templated, and a browser check
asks what a browser actually paints. Those two are run here, dated, and recorded.

## Scope calls

**1. The gate measures and closes; it does not redesign.** V6e's licence is to fix what it
measures *when the fix is a token or a call site*. A finding that needs a surface rebuilt gets
written down — in this doc and as a BUILD-ORDER row — not fixed silently under a gate leaf's
name. A conformance gate that is allowed to rewrite whatever it dislikes is not a gate; it is an
unbounded ninth leaf, and it would land untested visual change at the exact point in the tier
where the tier claims to be done.

**2. Residual-zero means zero *unsanctioned* literals, and the sanctioned set is closed and
named.** Three files carry resolved colour literals by design, each for a reason `design.md`
already records, and each already pinned by a test that fails on drift:

| File | Why it may not use `var()` | Its pin |
| :--- | :--- | :--- |
| `src/lib/chartPalette.ts` | canvas 2D cannot resolve custom properties; the correlation scale needs numeric colour maths (§ Chart palette) | `chartPalette.test.ts` |
| `src/lib/exportTheme.ts` | the D63 share artifact leaves the repo and can reach neither stylesheet (§ Exports) | `exportTheme.test.ts` |
| `src/features/charts/correlation/CanvasScatter.tsx` | two `getComputedStyle` fallbacks for the same canvas-2D reason, used only when the computed style is unavailable | *(none — see below)* |

The census therefore checks an **allowlist**, not a bare count. `CanvasScatter`'s two fallback
literals are the one entry with no pin, and this leaf gives them one rather than exempting them:
they are the same anti-drift hazard `chartPalette.test.ts` exists to catch, one file over.

**3. The modal scrim is the one residual that gets a token.** Five call sites carry
`bg-[rgba(4,5,7,0.6)]` — `CommandPalette`, `AISettingsPanel`, `FormatRejectionModal`,
`ShareDialog`, `TransformGuardModal`. V5 scope call 8 chose the literal as a faithful port of
`workbench-shell.html`'s `.scrim`, and V6a scope call 5 extended it to the other four for
consistency; both explicitly declined to mint a token, V6a's reasoning being that *"a token
nobody asked for"* was worse than a consistent literal. That reasoning was right at four call
sites in one leaf and is wrong at five across the app, because slop gate 48 fails on any colour
value living outside the token block, and because § Drift policy's rule is unambiguous: *amend
this file first — never override locally*. `--color-scrim` is added to `design.md`, `tokens.css`
and `theme.css` at **exactly** the ported value, and the five sites point at it. **The rendered
colour does not change by one bit** — this moves a value's home, not its value.

**4. The scrim is register-independent, and that is a decision rather than an oversight.** It is
declared once, outside the `prefers-color-scheme` block: a scrim's job is to recede whatever is
behind it, and behind it in the light register is light paper, which a light scrim would not
recede. Both registers therefore darken. This is recorded in `design.md` alongside the token so
a later reader does not "fix" the missing light value.

**5. Contrast is measured on the pairs the app renders, not on the cartesian product.** Seven
surfaces × eleven ink and accent tokens × two registers is 154 cells, most of which name a
combination no component produces — and a gate that reports failures for pairs nothing renders
trains its reader to ignore it. The matrix is derived from the pairs that actually occur in
`src/`, which is also what makes the test meaningful when a later leaf introduces a new one.

**6. Contrast thresholds follow slop gate 40, including its large-text and non-text carve-outs.**
Body text (under 24px regular) needs 4.5:1; large text, icons and focus rings need 3:1. This
system's type scale runs 0.5–0.6875rem for most of the UI, so **almost nothing in this app is
large text** — the 3:1 tier applies to the focus ring, the accent rules and hairlines, and Act
0's display headline, and to nothing else. Where a token clears 3:1 but not 4.5:1, the test
records *which* tier it is being held to and why, rather than quietly picking the tier that
passes.

**7. Live-browser verification is Chrome, and the viewport set comes from the gates that name
viewports.** Chrome runs this app's WebGPU path; Safari 18.6 needs a flag and can still crash
the tab, which makes it a poor instrument for a *visual* gate and is a browser-support question
this leaf does not open. Viewports: **320, 375, 414, 768** (gate 50–57's mobile set), **1280×800**
(gate 44b names it specifically, and V6d's own no-scroll claim was verified at 1440×900,
1280×800 and 1440×720), **1440×900**, **1920**. Both registers at 1280×800 and at 375 —
the light register has never been looked at in a browser, only derived on paper.

**8. Act 0's numbered eyebrows are checked against gate 54 explicitly, because they are this
app's single closest brush with it.** Gate 54 auto-fails an eyebrow rendered *beside* a heading
in a multi-column wrapper, and V6d built three numbered eyebrows (`01 — Local-first.` and
siblings). They are believed to stack vertically above their headings, which passes; the gate
run confirms it against the shipped markup rather than against the intent, and the same check
covers the `.micro` labels V3 and V5 put on the explorer and options strip.

**9. What the gate does not touch.** No component's voice, spacing, copy or behaviour changes
except the five scrim class names. *(Written before the run. Three further one-class component
changes did land, each forced by a measured failure — see Results and Files. No voice, spacing or
copy changed, and no behaviour changed, so the clause holds in substance but not as written.)* No mock is re-read for fidelity — that was each leaf's own
job and re-litigating it here would be a ninth leaf wearing a gate's clothes. The four recorded
departures stay at four; a fifth would mean this leaf changed the system, which scope call 1
forbids. `graphify update .` is out of scope — no structural code change lands here.

## Spec

### `src/app/conformance.test.ts` *(new)*

The two mechanical gates, as one file with two `describe` blocks. It reads `theme.css` and the
`src/` tree from disk — it renders nothing, so it is fast and has no jsdom dependency.

**Contrast.** Parses both register blocks' `oklch()` declarations, converts to sRGB, computes
WCAG 2.1 ratios, and asserts each rendered pair against its tier (scope call 6). The oklch→sRGB
conversion already exists in `chartPalette.test.ts`; it moves to `src/lib/oklch.ts` as a two-
function module (`oklchToRgb`, `contrastRatio`) that both tests import, rather than being copied
a second time. `chartPalette.test.ts` loses its local copy and gains the import — the one edit
this leaf makes to an existing test, and a mechanical one.

Translucent tokens (`--color-rule`, `--color-rule-2`, `--color-rule-hi`, and the scrim) are
composited over each surface before measurement, since `oklch(100% 0 0 / 0.1)` has no contrast
ratio on its own. Rules are held to the 3:1 non-text tier.

**Residual census.** Walks `src/**/*.{ts,tsx}` excluding `*.test.*`, matches hex literals, `rgb`/
`rgba`/`hsl`/`hsla` functions, bare `oklch()` values and Tailwind named-palette classes, and
asserts the result set equals the allowlist of scope call 2. The assertion is on the **set**, so
it fails both ways: a new literal anywhere fails, and so does an allowlist entry that no longer
exists. Each allowlist entry carries its justification inline, so the next person to hit the
failure reads the reason rather than adding themselves to the list.

### `src/lib/oklch.ts` *(new)*

`oklchToRgb(L, C, H)` and `contrastRatio(rgbA, rgbB)`. Extracted, not written: the first is
`chartPalette.test.ts`'s existing function unchanged, the second is `correlationColor.ts`'s
existing `srgbToLinear` / `relativeLuminance` pair generalised to return a ratio.
`correlationColor.ts` keeps its own copies — they operate on `rgb()` strings for a different
purpose and rewiring them is refactoring adjacent working code, not this leaf's business.

### `src/features/charts/correlation/CanvasScatter.test.tsx` *(new, or additive if it exists)*

The missing pin from scope call 2: the two `getComputedStyle` fallback literals must equal
`theme.css`'s `--color-border` and `--color-fg-muted` declarations. Same shape and same reason as
`chartPalette.test.ts`'s slot assertions.

### `--color-scrim`

- `design.md` § Theme — one row in the token table, and a sentence under § Status register's
  neighbourhood recording scope call 4 (register-independent, deliberately).
- `tokens.css` and `src/app/theme.css` — declared once in `:root`, absent from the
  `prefers-color-scheme: light` block, with a comment carrying the reason.
- The five components — `bg-[rgba(4,5,7,0.6)]` → `bg-(--color-scrim)`. Nothing else in those
  files is touched.

### The two perceptual gates

Recorded in this document, in a **Results** section appended when they run — not in code. Each
gate that fails gets its finding, its disposition (fixed here / deferred with a reason), and, if
deferred, its BUILD-ORDER row. Each gate that passes is named as run, because "we ran 58 gates"
without the list is indistinguishable from having run none.

### Documents

- `design.md` — the `--color-scrim` row and its note (scope calls 3–4), and the measured contrast
  table replacing whatever this leaf's measurement contradicts. **If a measurement contradicts a
  number already in `design.md`, `design.md` is corrected** — the file's own § Provenance rule
  is that measurement wins over transcription.
- `_implementation/DATASCOPE.md` — master-first per §13.3, but only if a measurement changes a
  number §19 quotes (it quotes 3.16:1, 4.5:1, 5.49:1/5.26:1, and the chart-palette gate table).
  If every quoted number re-measures true, master is unchanged and this leaf says so rather than
  editing for the sake of it.
- This folder's `README.md` — the per-phase-leaves list, and the census numbers in its
  tractability note, which are now stale by construction (82 → the measured residual).
- `_implementation/status/BUILD-ORDER.md` — V6e's row, the log entry, and the tier's close-out.
- `.hallmark/log.json` — one entry for the tier's completion carrying the slop-test result,
  since the log is where Hallmark records what a run produced and no entry exists for a gate.

## Files

*Written before the run; reconciled against what the findings actually forced.*

**New:** `src/lib/oklch.ts`, `src/app/conformance.test.ts`.

**Modified:** `src/lib/chartPalette.test.ts` (import replaces its local converter),
`src/features/charts/correlation/CanvasScatter.test.tsx` (the missing pin, appended — the file
already existed, unlike this doc's pre-run guess), `src/app/theme.css`, `tokens.css`,
`src/lib/chartPalette.ts` and `src/lib/exportTheme.ts` (the two mirrors, which their own pin
tests force to move in lockstep with the corrected tokens), `design.md`,
`_implementation/DATASCOPE.md`, the five scrim call sites
(`src/features/palette/CommandPalette.tsx`, `src/features/ai/AISettingsPanel.tsx`,
`src/features/ingestion/FormatRejectionModal.tsx`, `src/features/export/ShareDialog.tsx`,
`src/features/sql/TransformGuardModal.tsx`), this doc, this folder's `README.md`,
`_implementation/status/BUILD-ORDER.md`, `.hallmark/log.json`.

**Three component changes this doc did not predict**, each traced to a finding in Results and
each a single class or expression — listed explicitly because "no component changes beyond the
scrim" was the plan and is no longer true:

- `src/features/map/OptionsStrip.tsx` — the ranked action's hover wash `/20` → `/15`. The
  corrected light amber clears 4.5:1 through `/15`; `/20` is an unspec'd embellishment (§ CTA
  voice specifies a 12% wash) and capping it was cheaper than darkening the accent further.
- `src/features/sql/ResultsGrid.tsx` — the `NULL` marker's `text-(--color-fg-muted)/60` (2.9:1)
  → `text-(--color-ink-3)`.
- `src/features/ingestion/TableList.tsx` — the table name's `flex-1` → `flex-auto`. The
  live-browser finding; a strict improvement at both mount points, with the remainder deferred.

**Unchanged:** every other file under `src/`. `master §19`'s V6d/Act 0 text, the Decision Record,
and `graphify-out/` (no structural code change landed).

## Dependencies

V6a–V6d, all shipped 2026-07-25. This leaf measures their output; it has no dependency the tier
has not already satisfied, and nothing downstream depends on it except v1's own start.

## Acceptance criteria

*Run 2026-07-25. Every box below was checked against the tree, not against intent.*

- [x] `src/app/conformance.test.ts` exists and passes, covering both mechanical gates
- [x] Every ink-on-surface pair rendered in `src/` clears its tier in **both** registers, or is
      listed as a measured exception with the tier it is held to and why — seven did not, and
      were corrected rather than excepted; `--color-fk` is the one documented narrowing, to the
      two surfaces it actually renders on
- [x] The residual census asserts set equality against the allowlist — with **four** entries,
      not the three this doc predicted: `correlationColor.ts` builds `rgb()` strings at runtime
      and the regex sees them, so it is listed with its reason rather than the regex loosened
- [x] `CanvasScatter`'s two fallback literals are pinned to `theme.css`
- [x] `--color-scrim` is declared in `design.md`, `tokens.css` and `theme.css`; zero occurrences
      of `rgba(4,5,7,0.6)` remain in `src/`; the resolved colour is bit-identical (verified in
      the browser: `rgba(4, 5, 7, 0.6)` in both registers)
- [x] `oklchToRgb` exists in exactly one place — `chartPalette.test.ts` imports it
- [x] All 58 slop gates run and recorded, every failure carrying a disposition
- [x] The six-axis pre-emit critique scored and recorded (P5 H4 E4 S5 R4 V n/a)
- [x] Live-browser verification at all seven viewports, both registers at 1280×800 and 375,
      including no horizontal scroll 320–1920 (gate 34) and no two-line clickable text (gate 49)
- [x] `design.md`'s quoted contrast numbers each re-measure true, or the file is corrected — six
      values and the whole chart-palette gate table were corrected
- [x] Master is edited, and this doc says why: §19 quoted the light `--color-error` value and its
      5.26:1, both of which re-measured false. Revised (16) records the tier close
- [ ] ~~No component's voice, spacing, copy or behaviour changed beyond the five scrim class
      names~~ — **not met, deliberately.** Three further one-class changes landed, each traced
      to a finding; see Files. No voice, spacing or copy changed, and no behaviour changed
- [x] The four recorded departures still number four
- [x] `tsc -b` clean; full suite green (**136 files / 1385 tests**, from a 135/1334 baseline);
      `oxlint` clean apart from the pre-existing `_misc/spike-webllm/smoke.mjs` warning

## Test plan

- **`conformance.test.ts`** — is itself the test plan for two of the four gates. Its own
  correctness is checked by inverting it once during development: a deliberately broken token
  and a deliberately added literal must each fail it, and neither may be committed.
- **`chartPalette.test.ts`** — must pass **unmodified in behaviour** after the import swap; its
  assertions are untouched, and their continuing to pass is the proof the extraction was
  mechanical.
- **`CanvasScatter.test.tsx`** — the new pin, plus nothing else. This leaf does not add
  behavioural coverage to a component it is not changing.
- The five scrim components' existing tests pass unmodified — the guard that a token swap is a
  token swap.
- **The perceptual gates have no automated plan and should not pretend to.** They are run by
  hand in a browser, and their record is this doc.

## Definition of done

Every claim the tier made about itself is now measured rather than asserted. Contrast is computed
for every pair the app renders in both registers and holds at its tier; the residual count is at
its true floor with each survivor named, justified and pinned; the 58 slop gates are run against
the shipped app with every finding dispositioned; and the app has been looked at, in a browser,
at seven viewports in both registers — the first time in the tier that anything checked what a
browser actually paints. The one value that was living outside the token block is inside it, at
the same colour. Two of the four gates are now standing tests, so the next leaf to break them
finds out from the suite rather than from a person. `design.md`'s numbers are true of the code,
master's numbers are true of `design.md`, and v0.69 is closed.

---

## Results — run 2026-07-25

**Headline: the tier's numbers did not all survive, and the failures share one cause.** Every
gate V1–V6d applied had been evaluated against a *representative* case rather than the *worst*
one — a representative surface, plain text rather than text on its own tint, adjacent pairs
rather than all pairs. Four separate findings, one mistake.

### 1. Contrast measurement

Measured: every ink/accent token against all seven surfaces, every same-coloured wash the app
builds (`/5`, `/10`, `/12`, `/15`), every ink-on-fill pair, the focus ring, and all four chart
slots on the three surfaces a chart lands on — both registers. **Seven failures, all fixed.**

| Token | Register | Was | Measured | Now | Now measures |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `--color-ink-3` | dark | `oklch(58% 0.006 262)` | **4.03:1** on `elev` | `oklch(61% 0.006 262)` | 4.55:1 |
| `--color-ink-3` | light | `oklch(54.5% 0.01 262)` | **3.91:1** on `footer` | `oklch(51% 0.01 262)` | 4.56:1 |
| `--color-active` / `--color-pk` / `--color-warn` | light | `oklch(54.5% 0.125 62)` | **3.17:1** on its own /20 wash; 4.06:1 plain | `oklch(46% 0.106 62)` | 4.67:1 worst wash, 5.80:1 plain |
| `--color-ok` | light | `oklch(52% 0.112 163)` | **4.10:1** on `footer` | `oklch(49.5% 0.107 163)` | 4.60:1 |
| `--color-error` | light | `oklch(52% 0.21 25)` | **4.08:1** on its own /10 wash | `oklch(49% 0.2 25)` | 4.58:1 |
| `--chart-4` | light | `oklch(63% 0.195 270)` | ΔE **8.6** from `--chart-1`, **5.7** under protanopia | `oklch(45% 0.22 270)` | 19.9 / 15.6 |
| `--color-card` | light | `oklch(100% 0 262)` | zero chroma (slop gate 22) | `oklch(99.5% 0.003 262)` | carries the anchor hue |

Three of these deserve naming rather than tabulating:

- **The light amber was the widest failure.** V1 solved it as plain text on `canvas`; the app's
  real pattern is amber text on an amber wash — `bg-(--color-active)/10 text-(--color-active)`,
  the badge V4 built and the ranked action V5 built — which failed **on every surface in the
  register**, worst 3.17:1. It is a genuine darkening (54.5% → 46%), and it is the one change a
  reader will notice. Two things make it safe: the light register is **derived, never ported**
  (no mock specifies one, so no fidelity is lost), and `design.md` already claimed it was solved
  for ≥4.5:1 — this makes that claim true rather than changing the intent.
- **The chart-palette gate was measuring the wrong thing.** V6b's table reports "worst *adjacent*
  pair" — slots 1-2, 2-3, 3-4. But slots are assigned in fixed order and never cycled, so a
  four-series chart shows all four at once and 1-vs-4 is a pair the reader must separate. Under
  that reading light `--chart-1` and `--chart-4` sat ΔE 8.6 apart and **5.7 under simulated
  protanopia** — two blues a colourblind reader cannot distinguish. The dark register passed all
  pairs unchanged (17.0 / 13.6), which is why this survived: it was a light-register-only defect
  in a register nobody had looked at. `design.md`'s gate table is corrected to all-pairs.
- **`--color-fk` at 4.37:1 on `elev` was investigated and is *not* a failure.** The sweep flagged
  it; the call sites do not support it. `--color-fk` has exactly two uses — one word of Act 0
  prose on `canvas` (4.95:1) and an `aria-hidden` tab glyph on `chrome` (4.85:1, non-text tier).
  It never sets body text on `elev`, so nudging the ported copilot purple to satisfy a pairing
  the app does not render would have been a fifth departure bought for nothing. The test asserts
  the two real pairings and says why.

**The dark register — the ported one — moves only on `--color-ink-3`.** Mock fidelity is intact
and the four recorded departures still number four.

### 2. Slop-test gate (58 gates + six-axis pre-emit critique)

**Pre-emit critique**, scored against the shipped app: **P5 H4 E4 S5 R4 V—**. Execution (C) and
Restraint (E) at 4 rather than 5 are the honest scores and both are evidenced below — the
contrast failures above are an execution gap, and the explorer row's over-stuffing is a restraint
gap. Variety (F) is **not applicable and deliberately so**: this tier inverts diversification, so
sharing a fingerprint with prior output is the requirement, not a defect.

Gates run, with the ones that are not a trivial pass named:

| Gate | Result |
| :--- | :--- |
| 10–18 microinteractions (`transition-all`, hover-scale, overshoot easing, animating layout props, focus-ring fade, celebratory toasts) | **pass** — zero occurrences of each |
| 19 placeholder names / startup clichés | **pass, adjudicated** — one `acme` exists, as a dataset-label fixture in a test file. Not shipped copy |
| 20 CSS stamp present | **pass** |
| 21 Specimen fall-through | **pass** — Act 0 takes the Specimen *composition* by explicit human call and the HUD register; recorded in `design.md` § Variants |
| 22 zero-chroma neutrals | **FAIL → fixed** — light `--color-card` was `oklch(100% 0 262)`. At 100% lightness no chroma is representable, so the fix steps it to 99.5%. Still the most-raised light surface |
| 23 accent budget ~5% | **pass** — verified in the browser: amber is the wordmark's second half, PK dots, the ranked action, hairlines |
| 26 eight interactive states | **pass** — focus-visible / active / disabled present; disabled uses three channels |
| 27 reduced-motion coverage | **pass** — global block in `theme.css` |
| 30 icon tells (two libraries / emoji as icons) | **pass** — `lucide-react` only, plus HUD dingbats; zero pictographic emoji in `src/` |
| 33 decorative SVG needs a name or `aria-hidden` | **pass** — Act 0's specimen plate is `aria-hidden` with a real caption |
| 34 horizontal scroll 320–1920 | **pass** — measured at all seven viewports, both registers, plus the loaded workbench |
| 37/38 font-family ceiling | **pass** — exactly two families computed anywhere on the page: Geist, JetBrains Mono |
| 38a italic headings | **pass, adjudicated** — two italics exist, both body-copy emphasis inside running text (a provenance clause; the `NULL` cell marker). No heading, wordmark or display type is italic |
| 40–41 contrast | **FAIL → fixed** — see §1, plus the NULL marker below |
| 42–45 nav / footer / hero fingerprints | **n/a** — `design.md` § Macrostructure family rules N#/Ft# archetypes out; these are app surfaces, not site chrome |
| 46 invented metrics | **pass** — every figure on screen is computed from the loaded dataset; the specimen plate uses the real `ecommerce` schema with no fabricated counts, per its standing limits |
| 47 re-drawn UI chrome | **pass** — the title/tab/status bars are the product's own chrome, not an imitation browser or IDE |
| 48 mid-render token improvisation | **FAIL → fixed** — the modal scrim, five copies of `rgba(4,5,7,0.6)`. Now `--color-scrim`. **Bit-identical colour**; only its home changed |
| 49 two-line clickable text | **pass, adjudicated** — no short label wraps at any viewport (checked by line-box count, not element height). Act 0's sample rows do run multi-line, but what wraps is each row's *description*, which is prose inside a large target, not a CTA label |
| 50–57 mobile set | **pass** — no horizontal scroll and no cap-collision at 320/375/414/768; no sticky-at-top-0 pair; no CSS-radio tabs; no image-bearing `1fr` track |
| 54 eyebrow beside heading | **pass** — this app's closest brush, and it clears: Act 0's three numbered eyebrows stack *above* their headings in a single column, confirmed against the rendered page |

**One failure outside the token layer, found by gate 41 and fixed:** `ResultsGrid`'s `NULL` cell
marker was `text-(--color-fg-muted)/60` — a token that passes its own gate, dimmed by an inline
opacity modifier to **2.9:1** in both registers. No token-level measurement can see this, which is
why the conformance test now also rejects `text-(--color-x)/NN` outright. Muted text has a token.

### 3. Live-browser verification

Chrome, seven viewports (320 / 375 / 414 / 768 / 1280×800 / 1440×900 / 1920), both registers at
1280×800 and 375, Act 0 and the loaded `ecommerce` workbench. Zero console errors or page errors
at any viewport in either register. V6d's "no page scroll at `lg` and up" claim **verifies**:
no vertical scroll at 1280×800, 1440×900 or 1920, and normal flow below `lg`, exactly as spec'd.
The light register was confirmed by reading computed values rather than by eye — every corrected
token resolves live, including the wordmark painting `oklch(0.46 0.106 62)`.

**The gate's most valuable finding is one no automated check would have produced.** In the left
explorer, **every table name was rendering at 1px wide** — invisible. `TableList`'s row gives the
name `flex-1` (basis `0`) while four metadata spans (`400 rows × 5 cols`, `SAMPLE`, `400 B`, …)
take basis `auto`; in the explorer's 255px panel there is no free space left to grow into, so the
name collapses and the *secondary* metadata takes the row. It is in the DOM the whole time, so
every jsdom assertion — `getByText('customers')` and friends — passes. Nine leaves of this tier
never saw it, because nothing in the tier had opened a browser.

**Disposition: partially fixed, remainder deferred, per scope call 1.** Changing the name to
`flex-auto` is a one-class fix that restores the names (42px, 40px, 29px, 44px) and is a strict
improvement at both mount points — it landed. But the row still truncates (`cust…`, `ord…`) and
wraps its metadata onto two lines at 255px, because the real defect is that **one row layout
serves two very different mounts**: the 255px explorer (W2/V3) and the full-width Act 0 panel.
Giving the explorer its own row composition is a V3 rebuild, not a gate's business, and it is
recorded as a follow-up rather than done here under V6e's name.

### 4. Residual-zero re-measurement

The README's census — **82 hardcoded palette colours across 22 files** — re-measures at **zero
unsanctioned literals**, with four files on a closed, justified allowlist:

| File | Why | Pin |
| :--- | :--- | :--- |
| `lib/chartPalette.ts` | canvas 2D cannot resolve custom properties | `chartPalette.test.ts` |
| `lib/exportTheme.ts` | the D63 artifact leaves the repo | `exportTheme.test.ts` |
| `features/charts/correlation/CanvasScatter.tsx` | `getComputedStyle` fallbacks, same canvas-2D reason | **`CanvasScatter.test.tsx` — added here; it had none** |
| `features/charts/correlation/correlationColor.ts` | builds `rgb()` strings from `chartPalette.ts` at runtime; declares no colour | covered by `chartPalette.test.ts` |

The allowlist is asserted as **set equality**, so it fails in both directions. It earned that
immediately: the first run rejected `lib/oklch.ts`, which this leaf had added to the list on the
assumption it carried literals. It does not — only coefficients. The entry was removed because
the test said so, which is the behaviour the set-equality choice was for.

### Follow-ups this gate opened rather than closed

1. **The explorer row needs its own composition** (V3 scope). At 255px the shared `TableList`
   row truncates the table name and wraps its metadata. Half-fixed here; a proper fix drops or
   re-stacks the metadata in the narrow mount. **Not a blocker for closing v0.69** — the names
   are legible again — but it is real and it is written down rather than absorbed.
2. **`design.md` § What pages MUST share still describes an "accent-coloured dot"** in the
   wordmark, which V2 did not build (it ships `Data` in ink + `Scope` in amber). V6c flagged it
   and declined to fix it in passing; V6d declined and called it V6e's business. V6e is declining
   too, and that needs saying plainly: it is a copy fix to the design system's own prose, not a
   conformance measurement, and the honest place for it is whoever next amends that section.
