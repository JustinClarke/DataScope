# V1 — Token layer + locked system

**Tier:** v0.69 (the hallmark visual replication, D71 execution) · **Master spec:** §19 (the v0.69
subsection, V1 row), §13.3 (the Workbench shell whose visual layer W0–W8 deferred) · **Decision
row:** D71 (names the five signed-off mocks as the visual reference — this leaf charters nothing
new) · **Locked system:** `.hallmark/design.md`, portable copy `tokens.css`

## Objective

Replace the app's generic violet light/dark theme with the mocks' dark HUD system, in one place,
without rewriting the 76 components that consume it. The section README's inventory is what makes
that possible: those components reference only **seven** token names, and there are only **82**
hardcoded palette colours across 20 files (V6's job, not this leaf's). So V1 is a token-layer
swap plus the written system it defers to — `design.md` (the locked system), `tokens.css` (the
framework-free export), `src/app/theme.css` (the live copy: new ladder + Tailwind v4 `@theme`
mapping + a legacy alias layer), and self-hosted faces.

Nothing in `src/` outside `theme.css` changes. Every later phase (V2–V6) is chrome fidelity
against the tokens this leaf lands.

## Binding-constraint deviation (recorded, not excused)

V1's **code landed 2026-07-25 ahead of this leaf doc**, breaching §19's constraint (no `src/` code
for a phase before that phase's leaf doc). The session began as an unscoped design request rather
than a build-order pickup; the v0.69 charter was written after the fact. This doc is therefore
written *against what shipped* — but its acceptance criteria are real checks re-run on the current
tree, not a transcription of the build session's own claims. The box is checked only on those
re-runs. Same recording convention as BUILD-ORDER.md's Handoff rule 3; the deviation is also
logged there and in this folder's `README.md`.

## Scope calls

**1. Alias layer instead of component rewrites.** The seven legacy token names
(`--color-bg`, `--color-bg-subtle`, `--color-fg`, `--color-fg-muted`, `--color-border`,
`--color-accent`, `--color-accent-fg`) are kept as `var()` aliases onto the new ladder rather than
find-replaced across 76 files. A rewrite would touch every component in the app for zero
behavioural gain and would collide with V2–V5, which edit those same files for chrome fidelity.

**2. Self-hosted fonts, not the mocks' CDN.** The mocks load Geist and JetBrains Mono from Google
Fonts. A third-party font request on every load contradicts this product's "nothing leaves your
machine" posture (D2/§2), so both faces ship via `@fontsource-variable/*`. Roman only — the
italic files are deliberately not imported, since `design.md` bans italic headers and nothing sets
body copy in italic.

**3. A light register at all.** No mock specifies one, and the app already had a light face users
could be on. Dropping it would have been a silent regression, so the register is **derived** —
recorded as an invention in `design.md` § Light register, with its two non-mechanical inversions
(raised end of the ladder flips direction; accents darken ~22 points of lightness) written down
rather than left to be re-derived wrongly later.

**4. Act 0's register stays open.** Act 0's signed-off mock is theme *Specimen* — light paper,
Fraunces serif, violet accent — handing off to a dark amber HUD. That seam is a genuine coherence
risk and wants a human call, so it is **flagged, not defaulted**: Act 0 renders on the HUD tokens
(what the shipped code already did) and the Specimen mock stays unported. The decision belongs to
V6; it is recorded in `design.md` § Variants and this folder's `README.md`.

## Spec

### `.hallmark/design.md` — the locked system

The written authority every later phase defers to, and the file to **amend** when a phase needs
something it disallows. Carries: genre (atmospheric), macrostructure families (Workbench / Map-
Diagram / Specimen), the seven-surface theme table, the two accent registers and their semantics,
the accent budget, typography (mono is the working face), spacing, motion, microinteraction
stance, CTA voice, iconography, per-page allowances, what pages must share vs. may differ on, the
Act 0 variant, the drift policy (diversification **inverted** for this tier), and the export list.

### `tokens.css` (repo root) — the portable export

Framework-free copy of the same values: `:root` dark register plus the
`@media (prefers-color-scheme: light)` block. No Tailwind directives, no alias layer — anything
outside this app's build (a mock, a doc, an export) reads this file.

### `src/app/theme.css` — the live copy

- **Surfaces**, recessed → raised: `--color-void`, `--color-canvas`, `--color-chrome`,
  `--color-panel`, `--color-card`, `--color-elev`, plus `--color-footer`.
- **Rules** are translucent (`--color-rule`, `-2`, `-hi`) — alpha-on-white in dark,
  alpha-on-black in light — so one value reads correctly over all seven surfaces. An opaque grey
  cannot.
- **Ink**: `--color-ink`, `-2`, `-3`.
- **Data semantics**: `--color-pk` (amber), `--color-fk` (purple), `--color-edge`, `--color-edge-hi`.
- **UI state**: `--color-active`, `--color-active-ink`, `--color-focus`, `--color-ok`.
- **Copilot register**: `--color-ai`, `-2`, `-ink`, `-soft`. Never interchangeable with the amber
  HUD register — amber on an AI surface or purple on a selection state is a semantics bug.
- **Legacy aliases**: the seven names above, each a `var()` onto a new token.
- Type scale (`--text-2xs` … `--text-display-s`), 4-point space scale, radii, motion
  (`--ease-out`, `--dur-fast`, `--dur-med`), shadows, z-layers.
- `@theme` re-exports every token to Tailwind v4, including the aliases.
- Base rules: `body` on `--color-void`/`--color-ink`, the `.micro` micro-caps class, a
  non-transitioned `:focus-visible` ring, and the global reduced-motion collapse.
- `color-scheme` is declared **per register** (`dark` in `:root`, `light` inside the media query),
  never as `dark light` — see the defect below.

### `package.json`

Adds `@fontsource-variable/geist` and `@fontsource-variable/jetbrains-mono`; `theme.css` imports
each package's `wght.css` (variable-weight, roman-only, `unicode-range`-subsetted so a browser
downloads only what it needs).

## Three defects found and fixed, not carried forward

1. **`color-scheme: dark light` is silently normalised to `light dark` by Lightning CSS** (Vite's
   CSS pipeline), which would hand light scrollbars and form controls to any user with no OS
   preference — against these dark surfaces. A single value can't be reordered, so the property is
   declared per register. Verified in the **built bundle**, not just the source.
2. **The mocks' `--c-fg-3` measures 3.16:1** against canvas while carrying real text (counts, role
   badges, table column headers). Re-solved as `--color-ink-3` `oklch(58% 0.006 262)`: 4.57:1
   dark, 4.79:1 light.
3. **`--color-bg-subtle` was referenced by a component but never defined** — a dead `var()` in the
   old theme (`features/viewer/TrustChromeBand.tsx`). Now real, mapped to the panel surface it was
   reaching for.

Every colour was converted by round-tripped OKLCH math rather than eyeballed; every ink/accent
pair clears 4.5:1 against its own surface and every value sits inside sRGB gamut.

## Files

Added: `.hallmark/design.md`, `tokens.css` (repo root),
`_implementation/build/13-hallmark-replication/README.md` (the charter).
Modified: `src/app/theme.css` (44 → ~250 lines), `package.json` / `package-lock.json` (the two
font packages).
Unchanged: every `src/` component — the point of the alias layer.

## Dependencies

W8 (the Workbench cutover) — shipped 2026-07-25. There is one shell to theme, so no flag-parallel
double-styling problem exists.

## Acceptance criteria

- [x] `.hallmark/design.md` exists and states the whole system — genre, macrostructure,
      theme table, both accent registers *with their semantics*, type, space, motion, CTA voice,
      allowances, variants, drift policy, exports
- [x] `tokens.css` at the repo root carries the same values framework-free (no Tailwind
      directives, no alias layer)
- [x] `src/app/theme.css` defines the seven-surface ladder, translucent rules, three inks, both
      accent registers, and a derived light register under `prefers-color-scheme: light`
- [x] The seven legacy token names resolve through the alias layer, so no component was rewritten
      — `git status` shows no `src/` file changed by this phase other than `theme.css`
- [x] `--color-bg-subtle` is defined (it was a dead `var()`); its one consumer
      (`TrustChromeBand.tsx`) resolves
- [x] Geist and JetBrains Mono are self-hosted via `@fontsource-variable/*`, roman only — no
      Google Fonts request in the built output
- [x] `color-scheme` is single-valued per register, verified in the **built** CSS, not the source
- [x] Every ink/accent pair clears 4.5:1 against its own surface in both registers; every value is
      in sRGB gamut; the two mock departures and the Act 0 open question are recorded in
      `design.md`, not left as drift
- [x] `tsc -b` clean; `vite build` clean; full suite green at exactly the W8 baseline (**131 files
      / 1289 tests**), proving the swap regressed no behaviour; `oxlint` clean apart from the one
      pre-existing unrelated warning in `_misc/spike-webllm/smoke.mjs`

**Not a criterion here, by design:** live-browser verification of the rendered surfaces belongs to
**V6**, which owns the contrast + slop-test gate and the live check for the whole tier. The tokens
alone render no new chrome — there is nothing visual to verify until V2–V5 land.

## Test plan

There are no unit tests for a stylesheet, and inventing snapshot tests over CSS custom properties
would assert the file against itself. The checks that carry this leaf are the ones above, and one
of them is deliberately not "the suite still passes":

- **The suite must land on the exact W8 baseline count** (131/1289), not merely stay green — a
  changed count would mean the swap touched behaviour, which is the one thing an alias-layer swap
  must not do.
- **The emitted CSS is inspected, not trusted.** Tailwind's `@theme` output lands in
  `@layer theme` while the real `:root` block is unlayered, and unlayered always wins the cascade
  — so the self-referential `--color-x: var(--color-x)` pattern is sound by cascade rules, not by
  declaration order. Confirmed by reading the built bundle, along with `color-scheme` and the
  absence of any external font request.

## Definition of done

The app renders on the mocks' dark HUD system in both registers, propagated through the alias
layer to all 76 existing components without one of them being rewritten; `design.md` is the
written authority V2–V6 defer to (and amend, never override); `tokens.css` is its portable export;
both faces are self-hosted. The three defects above are fixed rather than ported. Suite at the W8
baseline, `tsc -b`/`vite build`/`oxlint` clean. Live-browser verification is V6's, by design.
