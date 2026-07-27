# V6c — Export artifact

**Tier:** v0.69 (the hallmark visual replication, D71 execution) · **Master spec:** §19 (the
v0.69 subsection, V6c row) · **Decision rows:** D71 (names the five signed-off mocks as the visual
reference — this leaf charters nothing new), D63 (the standalone share artifact), D26 (the
attribution footer) · **Locked system:** `.hallmark/design.md` · **Depends on:** V6a
(shipped 2026-07-25 — this leaf inherits its rule that the export is a *sweep* target, not a
palette decision). Third of the five leaves V6 was split into.

This leaf lands **before** any `src/` code for this phase, per §19's binding constraint.

## Objective

`lib/dspsHtml.ts` is the one surface in this codebase the token layer cannot reach. Every other
component inherits `theme.css` through V1's alias layer; the DSPS HTML report is a **string** —
built in TypeScript, written to a Blob, downloaded, and opened somewhere that has never heard of
this app. `var(--color-canvas)` resolves to nothing there.

So it kept its own stylesheet, and that stylesheet is a different product: `#fff` paper, `#1a1a1a`
ink, `#e2e2e2` rules, `-apple-system` type. Eight hardcoded hexes, none of them a colour in this
system, in the one artifact a user actually *hands to someone else*. A person who profiles their
data in a dark amber instrument and clicks Export gets back a generic white document — the
strongest visual claim this product makes, discarded at exactly the moment it travels.

V6c closes that: the export **carries the token declarations in its own `<style>` block** so its
CSS can use `var()` normally, and a test pins those declarations to `theme.css` so the two cannot
drift. Same shape as V6b's `chartPalette.ts`, for the same reason and with the same anti-drift
gate.

## Scope calls

**1. "Resolved literals" means the export inlines the *declarations*, not that it flattens every
value at each use site.** A standalone file can declare its own custom properties — what it cannot
do is *reference the app's*. So the export emits a `:root { … }` block holding the token subset it
needs, copied verbatim from `theme.css`, and its own rules then read `var(--color-ink-2)` exactly
like every other surface in the app. Flattening the values into each rule would be both unreadable
and un-pinnable. `oklch()` needs no fallback here for the same reason it needs none in the app
itself — the app ships it unguarded, and the export inherits that posture rather than inventing a
more conservative one for itself.

**2. The values are copied as strings, not re-derived — which makes the anti-drift gate exact.**
V6b's `chartPalette.ts` had to convert oklch → sRGB, so its test reimplements the colour transform
and compares numbers. This leaf has no such need: the export's target language is CSS, so the
mirrored value is the *same string* theme.css declares. `exportTheme.test.ts` therefore parses both
files and asserts **string equality** per token per register — no conversion, no tolerance, no
rounding. It is the strictest form this tier's anti-drift mechanism can take, and V6c should take
it because it can.

**3. Both registers ship, because that is what "matches the app it came from" means.** The app
follows `prefers-color-scheme` (theme.css declares dark on `:root` and overrides in a light media
query; `chartPalette.ts`'s `activeRegister()` does the same in JS). A standalone HTML file can
reproduce that behaviour exactly with zero script. Baking in whichever register the exporter
happened to be using would make the artifact match *one session*, not the app — and would hand a
light-preference recipient a dark document with no recourse. The export mirrors theme.css's own
structure: dark unconditional, light in `@media (prefers-color-scheme: light)`.

**4. Print forces the light register, and this is a legibility fix rather than a preference.** A
dark report has two print failure modes and both are bad: honoured, it lays down a full-bleed black
slab; stripped by the browser's default economy mode, it leaves `--color-ink` (96.6% lightness) on
white paper — an effectively blank page. A DSPS report is a document people attach, print and PDF,
so `@media print` re-declares the light register. It sits last in source order, so it wins over the
`:root` dark block on a dark-preference machine and agrees with the light block on a light one.
This is the one rule in the export with no counterpart in the app, and it exists because the app
has no print surface.

**5. The type stack is the one deliberate departure — and it is a departure from `design.md`, not
from the mocks, so the tier's recorded count stays at four.** The app self-hosts Geist and JetBrains
Mono; the export cannot reach those files and must not embed them. The latin subsets alone are
29.4 KB + 40.4 KB, ≈93 KB base64 — against a report that is a few KB today, a 20–40× inflation of
an artifact whose whole premise (D63) is that it is small enough to attach. So the export takes
**theme.css's own fallback tails**: `--font-sans` drops the leading `'Geist'`, `--font-mono` drops
the leading `'JetBrains Mono'`, and both are otherwise identical. The test asserts exactly that
relationship, so the departure is mechanically enforced rather than described — if theme.css's
stacks change, the export's change with them. `design.md` § Exports records it; the "four recorded
departures from the mocks" list is untouched, because no mock was departed from.

**6. Mono is honoured as the working face, and the density call is `design.md`'s own allowance.**
Every count, cell, column header, table name, badge and the meta line are mono; prose (insight
descriptions) stays sans. The type scale is the app's — `--text-sm` through `--text-2xl` — which is
deliberately small. `design.md` § What pages MAY differ on lists "density within the type scale" as
a legitimate difference, and § Typography forbids inflating the scale to "improve readability," so
the export sits at the *loose* end of the shipped scale rather than inventing larger values: prose
at `--text-lg`, tabular data at `--text-base`, micro-caps headers at `--text-sm`.

**7. Amber appears exactly twice, and both uses are the shared system rather than decoration.** The
wordmark's second half (§ What pages MUST share) and the D26 attribution link — the document's only
interactive element, which is precisely the "look here" reading the register exists for. Two uses
keep the accent budget (§ Accent budget, ~5% of viewport) trivially satisfied. Nothing in the report
is a data mark, so no `--chart-*` token is needed and none is carried.

Two other genericisms go with the hexes, because they are the same defect: the browser's default
`disc` list marker becomes `◆` from § Iconography's dingbat set, and the `-apple-system` stack
becomes the token stack per scope call 5. A default marker in an instrument is exactly what V6e's
slop gate is for; it costs three lines to not ship it.

**8. The wordmark is ported from what V2 shipped, not from `design.md`'s description of it.**
`design.md` § What pages MUST share says the wordmark is "'DataScope' in Geist 600, `-0.01em`, with
the accent-coloured dot." The shipped `TitleBar.tsx` has no dot — it splits the word, `Data` in
`--color-ink` and `Scope` in `--color-active`. The export matches **the shipped treatment**, since
coherence with the running app is this tier's entire point. *Noted, not fixed here:* that sentence
in `design.md` describes something V2 did not build. Correcting it is V2's or V6e's business, not a
change this leaf should make on its way past.

**9. Out of scope, drawn explicitly:** the DSPS **JSON** export (`structureReport.ts`'s
`downloadStructureReport`) and "Copy for AI" (`aiContext.ts`) — DSPS's other two renderers (§12.2)
have no visual layer to port. `WorkbenchShell.tsx`'s `Welcome` is V6d; every conformance
measurement — contrast gate, slop test, live-browser verification, residual-zero re-measurement —
is V6e. No component under `src/features/**` is touched by this leaf at all: `DatasetDossier.tsx`
is the sole caller and its call site does not change.

**10. Content is unchanged. This is a re-voicing, not a redesign.** Same sections, same order, same
data, same conditional degrades (no relationships → no section; no insights → no section), same
escaping, same D26 footer, same "structure only — no data rows included" line. Every existing test
in `dspsHtml.test.ts` must stay green **untouched** — that is the guard that V6c changed only the
voice. New assertions are added alongside them, not in place of them.

## The token subset

Copied verbatim from `theme.css`, both registers. Nothing else is carried — an export that
mirrored all ~60 tokens would pin values it never uses.

| Group | Tokens | Per-register |
| :--- | :--- | :--- |
| Surface | `--color-canvas`, `--color-elev` | yes |
| Ink | `--color-ink`, `--color-ink-2`, `--color-ink-3` | yes |
| Rule | `--color-rule`, `--color-rule-2` | yes |
| Accent | `--color-active` | yes |
| Type | `--font-sans`, `--font-mono` | no — **the departure**, scope call 5 |
| Scale | `--text-sm`, `--text-base`, `--text-lg`, `--text-2xl` | no |
| Space | `--space-2xs`, `--space-xs`, `--space-md`, `--space-xl` | no |
| Radius | `--radius-xs` | no |

The rules stay translucent (`oklch(100% 0 0 / 0.1)` dark, `oklch(0% 0 0 / 0.12)` light) rather than
being resolved against the export's background — § Theme's "rules are translucent, not solid" holds
in a standalone document for the same reason it holds in the app.

## Spec

### `src/lib/exportTheme.ts` (new)

The mirrored declarations and nothing else — no document styling, which stays in `dspsHtml.ts`.

- `EXPORT_TOKENS_DARK` / `EXPORT_TOKENS_LIGHT` — the declaration blocks as CSS text.
- `EXPORT_THEME_CSS` — the assembled `:root` + `@media (prefers-color-scheme: light)` +
  `@media print` structure, in that source order (scope call 4).
- A header comment citing `design.md` as authority and naming `exportTheme.test.ts` as the gate,
  matching `chartPalette.ts`'s convention.

### `src/lib/dspsHtml.ts`

- The `<style>` block interpolates `EXPORT_THEME_CSS`, then declares the report's own rules against
  `var()`.
- `h1` becomes the shipped wordmark (`Data` ink / `Scope` amber) followed by the report title.
- `.micro` is carried across as the labelling device for `th` and the section eyebrow — mono,
  `--text-sm`, `0.14em`, uppercase, 700, `--color-ink-3`.
- `code` chips move to `--color-elev` / `--color-ink` / `--radius-xs`; `.beta` and `.snapshot` to
  `--color-ink-3` with a `--color-rule` border; `footer a` to `--color-active`.
- Lists drop `list-style: disc` for a `◆` marker in `--color-ink-3` (scope call 7).
- `color-scheme` is declared per register, mirroring theme.css's reasoning (a two-value
  `color-scheme` would hand light form controls to a no-preference user).
- The stylesheet stamps `design-system: design.md · designed-as-app`, per § Drift policy — the
  export is the one file that leaves the repo carrying the system, so it should say so.

### `design.md`

One amendment to § Exports: the standalone DSPS share artifact is a third export target alongside
`tokens.css` and `theme.css`; it carries the subset above in both registers plus a print override;
its type stack is theme.css's fallback tail because the artifact cannot ship font files; and
`exportTheme.test.ts` pins it. Explicitly *not* added to the four-departures list (scope call 5).

**Master `DATASCOPE.md` is not edited by this leaf.** §19's V6c row already describes this work
correctly, the departure count does not move, and no decision changes — so there is nothing to land
master-first.

## Files

Added: `src/lib/exportTheme.ts`, `src/lib/exportTheme.test.ts`.
Modified: `src/lib/dspsHtml.ts`, `src/lib/dspsHtml.test.ts` (additive only), `design.md`, this
folder's `README.md`, `_implementation/status/BUILD-ORDER.md`.
Unchanged: `_implementation/DATASCOPE.md`, `tokens.css`, `src/app/theme.css`,
`src/lib/structureReport.ts`, `src/lib/aiContext.ts`, `src/features/profiling/dossier/DatasetDossier.tsx`,
`src/app/WorkbenchShell.tsx` (V6d), everything under `src/features/**`.

## Dependencies

V6a (shipped 2026-07-25). V6c carries no status or chart colour, so it consumes V6a only as the
phase that established the sweep's rules; it does not depend on V6b's palette.

## Acceptance criteria

- [ ] Zero `#rrggbb` literals and zero named CSS colours remain in `src/lib/dspsHtml.ts`
- [ ] The exported HTML declares every token in the subset table above, in both registers, with
      values byte-identical to `theme.css`'s
- [ ] `exportTheme.test.ts` parses `src/app/theme.css` and `exportTheme.ts` and fails on any
      per-token, per-register string mismatch
- [ ] The two font tokens are asserted to equal theme.css's stacks minus their leading self-hosted
      family — so the departure is enforced, not just documented
- [ ] The export references no font file, no stylesheet, no script and no image: it stays
      self-contained (the existing test already asserts this and must stay green)
- [ ] `@media print` re-declares the light register and sits last in source order
- [ ] Amber appears exactly twice — the wordmark's second half and the D26 attribution link
- [ ] Every pre-existing test in `dspsHtml.test.ts` passes **unmodified** (scope call 10)
- [ ] `design.md` § Exports describes the artifact; the four-departures list is unchanged
- [ ] No file outside the Files list changed — `git status` confirms
- [ ] `tsc -b` clean; full suite green (baseline: 134 files / 1317 tests); `oxlint` clean apart from
      the pre-existing unrelated `_misc/spike-webllm/smoke.mjs` warning

**Not a criterion here, by design:** measured contrast of the export's surfaces and live-browser
verification are V6e's. V6c asserts the export carries the *same* values the app carries; whether
those values clear their gates is a question about the token layer, already answered once and
re-audited at V6e.

## Test plan

- **`exportTheme.test.ts` (new)** — the anti-drift gate. Extract theme.css's first `:root` block
  (dark) and its `@media (prefers-color-scheme: light)` block into token→value maps; do the same for
  `EXPORT_TOKENS_DARK`/`EXPORT_TOKENS_LIGHT`; assert string equality for every carried token in both
  registers, with `--font-sans`/`--font-mono` asserted against the tail relationship instead. Plus
  one case asserting `EXPORT_THEME_CSS` emits the three blocks in the required order.
- **`dspsHtml.test.ts`** — additive. The seven existing cases stay verbatim. New: the document
  carries no hex literal and no named colour; it declares `--color-canvas` in both registers; the
  print block is present and last; the wordmark renders `Data`/`Scope` with amber on the second
  half; `--color-active` appears exactly once outside the token declarations.
- Nothing else in the suite touches this module — `DatasetDossier.tsx` calls `downloadDspsHtml` and
  its tests assert the download, not the markup. Verify rather than assume before starting.

## Definition of done

The one artifact this product hands to someone else looks like the product. The DSPS share HTML
carries the design system's own token declarations in both registers, follows the reader's
`prefers-color-scheme` exactly as the app does, prints legibly, honours mono-as-working-face and
the `.micro` labelling device, and spends amber on nothing but the attribution link. Its values
cannot drift from `theme.css`, because a test compares the two strings. Its one departure — system
font stacks in place of the self-hosted faces — is recorded in `design.md` and enforced by that
same test. Content, structure and every pre-existing test are unchanged. `tsc -b`/suite/`oxlint`
clean.
