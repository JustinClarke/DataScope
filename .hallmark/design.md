# Design — DataScope

A locked design system for this app. Every page redesign reads this file before emitting code.
Do not regenerate per page — extend or amend this file when the system needs to grow.

**Provenance.** This system is not invented. It is the port of record for the five signed-off
Hallmark ideation mocks (formerly `_implementation/_misc/ideation/hallmark/`, deleted once
v0.69/§19 V6e closed on them — see `.hallmark/log.json`), whose own DNA source is
`justinclarke.github.io`'s `SqlErd.tsx`. The mocks were the visual authority; this file is what
the shipped code defers to now that they're gone.

**Scope note.** The Workbench build (W0–W8, `_implementation/build/12-workbench/`) shipped the
app's structure and behaviour against generic tokens and deliberately deferred this visual layer
— `WorkbenchShell.tsx` recorded the mocks as "content/copy reference only." This file closes
that deferral.

## Genre

**atmospheric** — a dark technical instrument. Not a marketing site; the chrome *is* the product.

## Macrostructure family

- **App pages** — **Workbench**. One shell: title bar over `explorer | canvas | ai-pane`, over
  inspector, over status bar. Variation knobs: which regions are mounted (viewer mode drops the
  strip, the gate and the right pane), and the canvas's active tab face.
- **Content pages** — **Map / Diagram**. The dataset map's ERD and Blueprint faces. Lives inside
  the Workbench canvas, so it inherits the shell rather than replacing it.
- **Entry page** — **Specimen** (see § Variants). Act 0 only.

Nav and footer archetypes (N#/Ft#) **do not apply** to this app. The title bar, tab strip and
status bar are app surfaces, not site chrome — and per Hallmark's re-drawn-chrome rule they must
never be dressed up as a fake browser or window frame.

## Theme

Dark is the primary register. Values live in [`tokens.css`](tokens.css) and
[`src/app/theme.css`](src/app/theme.css); the table below is the summary, not the source.

| Role | Token | Dark |
| :--- | :--- | :--- |
| Board behind the shell | `--color-void` | `oklch(12.8% 0.0056 262)` |
| Stage (map, tab content) | `--color-canvas` | `oklch(15.4% 0.0092 264)` |
| Title / tab / status bar | `--color-chrome` | `oklch(16.8% 0.0116 261)` |
| Explorer / inspector / ai pane | `--color-panel` | `oklch(17.7% 0.0114 261)` |
| Entity cards, active tab | `--color-card` | `oklch(19.5% 0.0112 261)` |
| Hover / selected / button face | `--color-elev` | `oklch(22.1% 0.0132 258)` |
| Ink | `--color-ink` | `oklch(96.6% 0.0045 258)` |
| Ink, secondary | `--color-ink-2` | `oklch(65.9% 0.002 248)` |
| Ink, tertiary | `--color-ink-3` | `oklch(61% 0.006 262)` |
| Rule | `--color-rule` | `oklch(100% 0 0 / 0.1)` |
| Accent (HUD active) | `--color-active` | `oklch(76.9% 0.1647 70)` |
| Accent ink | `--color-active-ink` | `oklch(18.6% 0.0173 79)` |
| Focus ring | `--color-focus` | `oklch(84.4% 0.1154 71)` |
| Status · good | `--color-ok` | `oklch(77.3% 0.1535 163)` |
| Status · warning | `--color-warn` | = `--color-active` (see § Status register) |
| Status · error | `--color-error` | `oklch(68% 0.2 25)` |
| Modal scrim | `--color-scrim` | `rgba(4, 5, 7, 0.6)` (both registers) |

**Rules are translucent, not solid.** One `--color-rule` value has to read correctly over all
seven surfaces; an opaque grey cannot. This is why the rule tokens are alpha-on-white (dark) and
alpha-on-black (light).

**Two accent registers, and they mean different things.** Amber (`--color-active`) is the HUD's
"active / selected / primary-key / **warning**" register — one attentional colour meaning "look
here," which is the reading the mocks themselves take (see § Status register). Purple
(`--color-ai`, `--color-fk`) is the copilot and foreign-key register. They are never
interchangeable: amber on an AI surface or purple on a selection state is a semantics bug, not a
style choice. **Neither register is available for data encoding** — a chart series or a
data-type badge that reaches for amber or purple is spending a reserved channel, and must use
the chart palette (§ Chart palette) or a non-colour encoding instead.

**Accent budget.** Amber stays under ~5% of any viewport. In an instrument this dense, the accent
is a pointer — the moment it is everywhere it points at nothing.

**`--color-scrim` is register-independent, deliberately.** It is the mocks' own `.scrim` value,
declared once and outside the light block: a scrim's job is to recede whatever sits behind it,
and in the light register that is light paper, which a light scrim would not recede. V5 and V6a
both ported the value but left it as a literal at five call sites, each declining to mint a token
for it; V6e gave it one, because § Drift policy admits no third option between "in the system"
and "not in the app," and because five copies of a colour are five chances to drift.

### Light register

**Derived, not ported.** No mock specifies a light face; these values were solved for this
codebase. Two inversions are deliberate and non-mechanical:

1. **The raised end of the ladder flips direction.** `--color-card` is white (most raised), but
   `--color-elev` (hover/selected) goes *darker* than canvas — because "more contrast from the
   page" means darker in a light UI and lighter in a dark one. A mechanical inversion of the
   ladder would make hover states disappear.
2. **The accents darken substantially.** The mocks' amber reads ~2.1:1 on light paper. The light
   register re-solves the same hues at lower lightness for ≥4.5:1 and clamps chroma into sRGB
   gamut: `--color-active` `oklch(46% 0.106 62)`, `--color-focus` `oklch(52% 0.119 62)`,
   `--color-ok` `oklch(49.5% 0.107 163)`.

One value was also corrected against the mocks in *both* registers: `--color-ink-3` replaces the
mocks' `white/0.35`, which measured 3.16:1 on canvas and carried real text (counts, role badges,
column headers).

**V6e re-solved several of these a second time, and the reason generalises.** V1 measured each
token against `--color-canvas` — a representative surface, not the worst one — and measured
accents as plain text, never as text on their own tint. Against the surfaces they actually land
on, `--color-ink-3` was 4.03:1 on `elev` (dark) and 3.91:1 on `footer` (light), and the light
amber was 4.06:1 plain and **3.17:1** as amber-on-amber-wash — the badge and ranked-action
pattern § CTA voice specifies. Corrected: `--color-ink-3` to `oklch(61% 0.006 262)` dark /
`oklch(51% 0.01 262)` light (4.55:1 / 4.56:1 against their worst surfaces), the light amber as
above (5.80:1 plain, 4.67:1 on its deepest wash), light `--color-ok` (4.60:1) and light
`--color-error` to `oklch(49% 0.2 25)` (5.49:1). Light `--color-card` also stepped off pure
white to `oklch(99.5% 0.003 262)`: at 100% lightness a colour cannot carry the anchor hue at all.
**The dark register is otherwise untouched** — it is the ported one, and none of its other
values failed. `src/app/conformance.test.ts` now measures every one of these on every surface,
including composited washes, so the "representative surface" mistake cannot recur silently.

### Status register

Three reserved colours for state: `--color-ok`, `--color-warn`, `--color-error`. Two rules hold
for all three. **Status is never reused as data encoding** — a chart series that happens to be
fourth does not wear the error red; a series only wears a status colour when the series genuinely
*means* that state (a failure rate, a pass/fail split). And **status never carries meaning by
colour alone** — every status surface ships an icon, a label, or both, so the state survives
colourblindness, greyscale print and forced-colors mode.

**`--color-warn` is the amber, deliberately.** It is not a separate hue: it resolves to
`--color-active`. This is ported, not improvised — `workbench-shell.html` and `workbench-ai.html`
both style their warning glyph `.ev__i--warn { color: var(--c-active) }`. In this system amber is
the single attentional register, and "selected" and "warning" are both instances of *look here*.
The accent budget survives because warnings are conditional and transient rather than ambient.

**`--color-error` is derived, not ported — the third recorded departure** (alongside
`--color-ink-3`, the light register, and the chart palette below). No error state exists anywhere in the five signed-off
mocks, so there was nothing to port and the value was solved for this codebase: `oklch(68% 0.2 25)`
dark, `oklch(49% 0.2 25)` light (V6e re-solved the light step from `oklch(52% 0.21 25)`, which
measured 4.08:1 as error text on its own 10% wash). Computed, not eyeballed — it clears
**5.49:1** in both registers against its worst surface, and clears 4.5:1 on every surface error
text lands on, wash included. Its hue sits 45° (dark) / 37° (light) from the
amber, so an error block never reads as a selection.

### Chart palette

**Derived, not ported — the fourth recorded departure.** No mock contains a chart of any kind, so
there was nothing to port; these values were solved for this codebase and validated rather than
eyeballed. They exist because of the rule above: data marks may not spend a reserved register.

| Slot | Family | Dark | Light |
| :--- | :--- | :--- | :--- |
| `--chart-1` | azure | `oklch(67% 0.165 245)` | `oklch(62% 0.155 245)` |
| `--chart-2` | magenta | `oklch(54% 0.215 342)` | `oklch(44% 0.19 342)` |
| `--chart-3` | lime | `oklch(63% 0.17 130)` | `oklch(61% 0.16 130)` |
| `--chart-4` | indigo | `oklch(53% 0.215 270)` | `oklch(45% 0.22 270)` |
| `--chart-other` | lumped tail | `var(--color-ink-3)` | `var(--color-ink-3)` |
| `--chart-seq` | magnitude (one hue) | `var(--chart-1)` | `var(--chart-1)` |
| `--chart-pos` / `--chart-neg` / `--chart-mid` | polarity | `--chart-1` / `--chart-2` / `--color-elev` | same |

**Four slots, and four is a measured ceiling rather than a preference.** `--color-error` (hue 25),
`--color-active` (70), `--color-ok` (163) and `--color-ai` (304) reserve four hue families
outright. The unreserved arcs leave azure, magenta, lime and indigo as the only families that
clear every gate in *both* registers — a fifth (teal) was solved for and rejected on measurement,
because its only light-register steps with adequate contrast sit ΔE 7–10 from `--color-ok` and
would let a series impersonate the "good" status colour.

**Slots are assigned in fixed order and never cycled.** A fifth series is not a generated hue: it
folds into an `Other` bucket on `--chart-other`, or the chart is faceted. Colour follows the
entity, never its rank.

Validated with the `dataviz` method's six checks (Machado–Oliveira–Fernandes CVD simulation at
severity 1.0, ΔE in OKLab ×100), against all three surfaces a chart can land on — `canvas`,
`card`, `elev`:

| Measure | Gate | Dark | Light |
| :--- | :--- | :--- | :--- |
| CVD separation, worst **pair** | ≥ 8 | 13.6 | 15.6 |
| Normal-vision floor, worst **pair** | ≥ 15 | 17.0 | 19.9 |
| Contrast, worst slot × worst surface | ≥ 3:1 | 3.02:1 | 3.07:1 |
| Distance from nearest reserved accent | ≥ 12 | 16.4 | 14.7 |

**"Worst pair" means every pair, and V6e had to correct that.** V6b's table measured only slots
*adjacent in assignment order* — 1-2, 2-3, 3-4 — and reported 31.4 / 19.2. But slots are assigned
in fixed order and never cycled, so a four-series chart puts **all four on screen at once**, and
1-vs-4 is a pair a reader has to separate even though it is never "adjacent". Measured that way,
the light register's `--chart-4` sat ΔE **8.6** from `--chart-1` and **5.7** under simulated
protanopia — two blues a colourblind reader could not tell apart. It is re-solved from
`oklch(63% 0.195 270)` to `oklch(45% 0.22 270)`: the light step now sits *below* its dark
counterpart in lightness rather than above it, which is what the other three light slots already
do. The dark register passed all pairs unchanged. The gate above is now all-pairs in both
registers, and `conformance.test.ts` holds the contrast row of it.

**Sequential is one hue, diverging is two poles plus a neutral.** The sequential ramp is
`color-mix(in oklab, var(--chart-seq) N%, var(--color-canvas))` — mixing toward the *surface* is
what makes one expression ramp up in lightness on dark and down on light. The diverging scale
takes the two poles the reader has already learned from slots 1 and 2, with a surface-neutral
midpoint; never white on a dark instrument, and never a status red for the negative arm.

Canvas 2D cannot resolve custom properties and some scales need numeric colour maths, so
`src/lib/chartPalette.ts` carries the resolved literals for both registers. That file defers to
this one, and a test pins its literals to `theme.css`'s declarations so the two cannot drift.

## Typography

- **Display / body:** Geist, 400 / 500 / 600 / 700. Roman only — never italic headers.
- **Mono:** JetBrains Mono, 400 / 500 / 700. This is the instrument's *working* face, not a code
  accent: every label, count, table cell, button, tab and row name is mono.
- **Display tracking:** `-0.01em` on the wordmark, `-0.02em` on gate headings.
- **Micro-caps:** the `.micro` class — mono, `0.625rem`, `letter-spacing: 0.14em`, uppercase, 700.
  This is the system's single labelling device.

The type scale is small and dense on purpose — `--text-2xs` through `--text-md` (0.5–0.6875rem)
carry most of the UI. An instrument earns its density; do not inflate these to "improve
readability" without also revisiting information density.

## Spacing

4-point named scale, `--space-3xs` … `--space-xl`. Pages must use named tokens
(`var(--space-md)`), never raw values.

## Motion

- Easing: `--ease-out` `cubic-bezier(0.16, 1, 0.3, 1)`. No other easing. Never the browser default.
- Durations: `--dur-fast` 140ms (state changes), `--dur-med` 260ms (reveals).
- Animate `transform`, `opacity`, and colour only.
- Reduced-motion: handled globally in `theme.css` — transitions collapse to ~0.
- **Reveal pattern: none.** This is an instrument. Content does not fade in on scroll.

## Microinteractions stance

- Silent success. No celebratory toasts, ever.
- Buttons: `:active { transform: translateY(1px) }`. That is the whole press feedback.
- Focus rings show **instantly** — never transitioned, never animated.
- Hover-revealed affordances (the explorer row's overflow button) must also appear on
  `:focus-within`, or they are keyboard-invisible.
- Selection is carried by an **inset 2px accent bar** (`box-shadow: inset 2px 0 0`), not a border
  swap — borders shift layout, insets do not.

## CTA voice

- **Primary** (`.btn-primary` in the mocks): amber fill, `--color-active-ink` text, 600 weight,
  `--radius-md`, `0.55rem 1.1rem`. Hover is `filter: brightness(1.06)` — not a colour change.
- **Secondary / HUD button** (`.kbtn`, `.act`): `--color-panel`/`--color-card` face, 1px
  `--color-rule` border, mono `--text-md`, `--color-ink-2` text. Hover lifts text to
  `--color-ink` and border to `--color-rule-hi`. The face does not change.
- **Ranked top action** (`.act--top`): amber border and text over a 12% amber wash. Reserved for
  the single highest-ranked action in the options strip.
- Copy is verb-first and unpunctuated. No sentence-case marketing phrasing on controls.

## Iconography

Monochrome HUD dingbats only (`◈ ✦ ◆ ⚙ ✓ ⚠`) and `lucide-react` line icons, always inheriting
`currentColor`. **No pictographic emoji anywhere in UI or copy.**

## Per-page allowances

- **App pages MUST NOT use enrichment.** Function carries the page. No hero illustration, no
  abstract background, no decorative gradient.
- The dataset map's hand-built SVG (Tier B) is not enrichment — it is the product.
- **The Entry page (Act 0 only) MAY carry one Tier-B specimen** — a hand-built SVG of the
  instrument's *own output vocabulary*, drawn in this system's tokens. Resolved July 25, 2026;
  see § Variants for the reasoning and the standing limits. This clause was previously silent,
  and V6d read the App-pages ban as covering Act 0 too (`06d-act0.md` scope call 6, which
  dropped the dropzone's cloud icon). That call stands — a generic glyph is decoration. A
  drawing of what the app makes of your data is not.
- Still forbidden everywhere, Act 0 included: abstract backgrounds, decorative gradients,
  stock imagery, and re-drawn browser/window/IDE chrome around the specimen.
- No page in this app has a hero, a testimonial, a logo wall, or a pricing table.

## What pages MUST share

- The wordmark: "DataScope" in Geist 600, `-0.01em`, with the accent-coloured dot.
- Both accent registers and their meanings (amber = active, purple = AI/FK).
- The Geist + JetBrains Mono pairing, and mono-for-all-labels.
- The `.micro` labelling device.
- The CTA voice above.
- Surface semantics — a panel is always `--color-panel`, chrome is always `--color-chrome`. A
  region that picks its own surface breaks the depth ladder for every other region.

## What pages MAY differ on

- Which Workbench regions mount (viewer mode legitimately drops several).
- The canvas's tab face (map / profile / sql / charts / export all look different inside).
- Density within the type scale.

## Variants

**Act 0 (welcome) — composition ported, register not. Resolved July 25, 2026.** Its signed-off
mock (`welcome-act0.html`) is theme **Specimen** — light paper, Fraunces high-contrast serif,
cool-violet accent — not the dark HUD. A light editorial serif page handing off to a dark amber
instrument is a jarring seam, so the mock was flagged rather than adopted, and the call was made
deliberately rather than defaulted.

**The resolution: Act 0 keeps the HUD register and takes the mock's editorial composition.**
Dark surfaces, Geist, amber accent — the same system every other surface uses — arranged in the
mock's structure: display-scale headline, generous vertical rhythm, the hairline grid mark, and
the dropzone / URL / samples arrangement. Act 0 is still the one screen a user meets before the
instrument exists, and it should feel like that instrument's front door rather than a different
product. No light→dark seam is introduced at ingest, and no second font family ships.

**Unported, deliberately:** the Specimen palette (light paper), Fraunces, and the cool-violet
accent. `welcome-act0.html` is a **composition reference only** from here — the same standing
`dataset-map.html` already has for the map's faces.

**Act 0 fits one viewport, and carries a specimen. Resolved July 25, 2026.** Two amendments to
the above, both human calls, neither re-opening the register question:

1. **No page scroll at `lg` and up.** The mock's stacked editorial column is a scrolling
   document; Act 0 is a *decision surface* — everything needed to say yes must be reachable
   without moving. The three numbered sections therefore re-flow into a `100svh` two-column
   frame: masthead over `editorial | ingest` over the footer band, the columns being the only
   things that scroll and only when a short viewport forces it. The sections keep their
   numbering, their eyebrows and their order (01 → 02 → 03 reads down the left column, then
   the right). **Below `lg` the page flows and scrolls normally** — a 375px viewport cannot
   hold a drop target, a URL field and five samples, and faking it with a cramped layout would
   cost more than the scroll does.
2. **One Tier-B specimen plate, in the left column** (§ Per-page allowances). It draws two
   entity cards joined on a foreign key over a distribution strip — the amber PK / purple FK
   legend and the chart palette doing exactly what they do on the real map and the real
   profile. It is the product's own output vocabulary at small scale, which is why it clears
   the enrichment ban that a cloud icon does not: it tells a first-time visitor what this app
   *makes*, using the same marks they will meet ten seconds later.

**Standing limits on the specimen.** It is drawn from the shipped `ecommerce` sample's real
table and column names — never invented schemas, never fabricated row counts, percentages or
metrics of any kind. It is static: § Motion's "Reveal pattern: none" is unchanged, and the
plate does not animate, on load or otherwise. It is `aria-hidden` with a real caption beside
it, since it is an illustration of the product rather than data the user can act on. And it
carries no frame that imitates a browser, a window or an IDE.

## Drift policy

Every stylesheet stamps `design-system: design.md · designed-as-app`. Hallmark's diversification
rule is **inverted** here: pages must share this system, not differ from each other. A page that
picks its own theme, accent or type pairing is slop even if it looks fine alone. If a page
genuinely needs something this file disallows, **amend this file first** — never override locally.

**Two clauses of this file are enforced rather than trusted** (`src/app/conformance.test.ts`,
added at V6e). Every ink-on-surface pair — including text on its own tinted wash, which is where
this system's worst cases live — is measured against its WCAG tier in both registers; and every
colour literal in `src/` is checked against a closed allowlist of the three files that genuinely
cannot use `var()` (`chartPalette.ts`, `exportTheme.ts`, `CanvasScatter.tsx`), each pinned by its
own drift test. The suite also rejects a zero-chroma surface and any `text-(--color-x)/NN`, an
opacity modifier that defeats every token-level measurement by dimming the rendered result.
Numbers in this file that a test does not hold are numbers that will drift; prefer adding the
assertion to restating the value.

## Exports

`tokens.css` at the project root is the framework-free export.
`src/app/theme.css` is the app's live copy plus the Tailwind v4 `@theme` mapping and the legacy
alias layer (`--color-bg`, `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-accent`,
`--color-accent-fg`, `--color-bg-subtle`) that lets the existing 76 components inherit this
system without being rewritten.

**The standalone share artifact** (`lib/dspsHtml.ts`, D63) is the third target and the only one that
leaves the repo. It cannot reference either file above, so `src/lib/exportTheme.ts` mirrors the
subset it uses — surfaces, ink, rules, the accent, and the type/space/radius scales — declared in
its own `<style>` block so the report's rules read `var()` like every other surface. Both registers
ship, in theme.css's own structure (dark unconditional, light in a `prefers-color-scheme` query), so
a shared report follows its *reader's* register exactly as the app follows its user's. A third
`@media print` block re-declares the light register: a dark report either prints a full-bleed black
slab or, once the browser's economy mode strips the background, leaves 96.6%-lightness ink on white
paper.

Its **type stack is the one departure, and it is from this file rather than from the mocks** — so
the four recorded departures above still number four. The app self-hosts Geist and JetBrains Mono;
an artifact that has left the app cannot reach them, and embedding the latin subsets would cost
~93 KB base64 against a report of a few KB, defeating the point of something small enough to attach.
The export therefore takes **this system's own fallback tails** — `--font-sans` and `--font-mono`
minus their leading self-hosted family — and honours mono-as-working-face with whatever mono the
reader has. `exportTheme.test.ts` pins every mirrored declaration to `theme.css` by string equality
and asserts that tail relationship, so neither the values nor the departure can drift.

Additional formats (DTCG `tokens.json`, shadcn/ui variables) are not exported — nothing in this
project consumes them.
