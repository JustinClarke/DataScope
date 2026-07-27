# 13 — The hallmark visual replication (D71 execution)

**Tier:** v0.69 · **Phases:** V1–V6 (§19) · **Depends on:** W8 (the Workbench cutover, complete
2026-07-25). Spec of record: master **§19** (the v0.69 subsection) and **§13.3**; decision row
**D71** (which already names the mocks as the visual reference — this section charters no new
decision). Locked design system: **`.hallmark/design.md`**; portable copy `tokens.css`.

W0–W8 shipped the Workbench's structure and behaviour against the pre-existing generic tokens
and deliberately deferred the visual layer. `WorkbenchShell.tsx` recorded the reasoning in place:
the signed-off mock is *"content/copy reference only, same precedent W4 set for the map."* This
section closes that deferral — porting the five signed-off hallmark mocks (formerly
`_misc/ideation/hallmark/`, deleted once this tier's V6e closed on them; design-iteration record
in `.hallmark/log.json` at the repo root) into the shipped shell.

**What makes this tractable.** The codebase is already token-disciplined: 76 non-test components
reference only **seven** token names (`--color-fg-muted` ×254, `--color-border` ×183,
`--color-fg` ×156, `--color-accent` ×100, `--color-bg` ×24, `--color-accent-fg` ×9,
`--color-bg-subtle` ×1), with only **82** hardcoded palette colours across 22 files. So V1's
token swap propagates the new system to the whole app through an alias layer, and the per-phase
work below is chrome fidelity — not 76 rewrites.

**Re-measured at V6e (2026-07-25): that 82 is now zero unsanctioned literals**, against a closed
four-file allowlist, asserted as set equality by `src/app/conformance.test.ts`. The paragraph
below is kept as written because it is why V6 became five leaves; the count it opens with is the
starting state, not the current one.

**That 82 is not one problem, though — a finding from V6's own research, recorded here because it
is why V6 is five leaves and not one.** The occurrences split by *why* they resisted tokenizing:
roughly 60 are error/warning feedback blocks and modal scrims that **have no token to move to** —
the system shipped `--color-ok` but never an error or warn register, so V6a has to amend
`design.md` before it can sweep anything; a handful are `ColumnCard`'s semantic-type legend,
which collides with the locked two-register rule by spending purple on "Categorical" and amber on
"Textual"; and the rest are chart series palettes and canvas fills (V6b) plus `lib/dspsHtml.ts`'s
standalone export HTML (V6c), which cannot reference `var()` at all because the exported file
leaves the app. Only the first group is a sweep; the others each need a real decision first.

**The system, stated once.** Genre: atmospheric. Macrostructure: Workbench (app) / Map-Diagram
(content). Seven-surface depth ladder (`void` → `elev`) with translucent rules, so one rule value
reads correctly over every surface. Geist + JetBrains Mono, where **mono is the working face** —
every label, count, cell, button, tab and row name. Two accent registers, and they are
**semantic, not decorative**: amber = active / selected / primary key; purple = copilot /
foreign key. They are never interchangeable — amber on an AI surface or purple on a selection
state is a semantics bug, not a style choice.

**Diversification is deliberately inverted for this tier.** Hallmark's default rule (consecutive
outputs must differ) is wrong here: every surface must cohere with the dataset map, not differ
from it. A phase that picks its own theme, accent or type pairing is a defect even if it looks
fine alone. Departing from `design.md` means **amending `design.md` first** — never overriding
locally.

**Binding constraint (§19, same as §13.3's):** no `src/` code for a phase starts until that
phase's own leaf doc lands, carrying its own definition of done. **V1 deviated** — see the note
under its row below.

**Tier status: V1–V6e complete (2026-07-25).** The conformance gate ran at V6e and found that the
tier's own gates had each been evaluated against a representative case rather than a worst case —
four findings, one mistake. All fixed; two follow-ups deferred with reasons. `design.md`'s
numbers are now true of the code, and two of them are enforced by tests rather than trusted.

| Phase | Deliverable | Depends on |
| :--- | :--- | :--- |
| V1 | Token layer + locked system: `design.md`, `tokens.css`, `theme.css` rewritten to the HUD surface ladder with legacy aliases so the existing 76 components inherit it unrewritten; self-hosted Geist + JetBrains Mono | W8 |
| V2 | Shell chrome: the **title bar** (a sixth region W1 never scaffolded — wordmark, active dataset, ⌘K affordance, settings) + tab-strip voice + region surfaces | V1 |
| V3 | Left explorer + status-bar voice: `.trow` key-square/role/inset-accent selection, posture dot, mono density budget | V1 |
| V4 | Bottom inspector + right AI pane: confidence pill, evidence row, and the purple copilot register distinct from the amber HUD | V1 |
| V5 | Options strip + command palette: HUD button voice, ranked top action, palette overlay | V1 |
| V6a | **Status register:** `--color-error` / `--color-warn` added to `design.md` / `tokens.css` / `theme.css` — the system ships only `--color-ok` today — then the error/warning blocks and modal scrims moved onto them; semantic-type badges re-voiced to the HUD's mono register | V2–V5 |
| V6b | **Chart + canvas palette:** a validated categorical series palette on steps deliberately distinct from the reserved amber/purple registers, the diverging correlation scale, and the canvas paths that cannot read `var()` directly | V6a |
| V6c | **Export artifact:** `lib/dspsHtml.ts`'s standalone share HTML (D63) carries resolved token values as literals, so an exported report matches the app it came from | V6a |
| V6d | **Act 0:** the welcome page's editorial composition ported from `welcome-act0.html` onto the HUD register (resolved — see below) | V6a |
| V6e | **Conformance gate:** contrast measurement, slop-test gate, live-browser verification, residual-zero re-measurement | V6a–V6d |

**V1's code landed ahead of its leaf doc (2026-07-25)** — a logged deviation from the binding
constraint above, on a session that began as an unscoped request rather than as a build-order
pickup. The code is in and verified (suite green, `tsc -b`/`vite build`/`oxlint` clean), but V1's
box stays **unchecked** until its leaf doc exists to be checked against, per BUILD-ORDER.md's
Update rule 1. Writing that leaf doc — documenting what shipped, against a real definition of
done — is V1's remaining work, not new code.

## Four recorded departures from the mocks

All deliberate, all in `design.md`, none a silent drift:

1. **`--c-fg-3` fails contrast in the mocks.** It measured **3.16:1** against canvas while
   carrying real text — counts, role badges, table column headers. Re-solved to
   `oklch(58% 0.006 262)`: 4.57:1 dark, 4.79:1 light.
2. **The light register is derived, not ported.** No mock specifies one. The mocks' amber reads
   ~2.1:1 on light paper, so the same hues are re-solved darker and clamped into sRGB gamut; and
   the hover/selected step deliberately flips direction (darker than canvas, not lighter),
   because a mechanical ladder inversion makes hover states vanish in a light UI.
3. **`--color-error` is derived, not ported** (V6a). No mock has an error state at all — grepped
   all five, zero red declarations — so the value was solved for this codebase rather than
   transcribed: `oklch(68% 0.2 25)` dark, `oklch(52% 0.21 25)` light, measured at 5.49:1 / 5.26:1
   against `--color-elev`, their worst surface. Its sibling `--color-warn` is the opposite case
   and worth naming next to it: a **port**, aliasing `--color-active`, because the mocks' own
   `.ev__i--warn { color: var(--c-active) }` spends the HUD amber on warnings.
4. **The chart palette is derived, not ported** (V6b). No mock contains a chart of any kind, so
   the four categorical slots, the sequential ramp and the diverging correlation scale were all
   solved for this codebase and validated rather than eyeballed — colourblind separation under
   simulated protanopia/deuteranopia, and >=3:1 contrast on every surface a chart lands on, in
   both registers. Four slots is a **measured ceiling**, not a preference: `--color-error`,
   `--color-active`, `--color-ok` and `--color-ai` reserve four hue families outright, and a
   fifth (teal) was solved for and rejected because its only light-register steps with adequate
   contrast sit ΔE 7-10 from `--color-ok`.

A further correction was incidental: `--color-bg-subtle` was referenced by a component but never
defined — a dead `var()` in the old theme, now real and mapped to the panel surface it was
reaching for.

## Act 0's register — resolved 2026-07-25

Act 0's signed-off mock (`welcome-act0.html`) is theme **Specimen** — light paper, Fraunces
high-contrast serif, cool-violet accent — not the dark HUD. A light editorial serif page handing
off to a dark amber instrument is a genuine coherence risk, so it was flagged rather than ported.

**Resolved by human call: the composition ports, the register does not.** Act 0 keeps the HUD
register (dark surfaces, Geist, amber) and takes the mock's editorial *structure* — display-scale
headline, generous vertical rhythm, the hairline grid mark, the dropzone / URL / samples
arrangement. No light→dark seam at ingest, no second font family. The Specimen palette, Fraunces
and the cool-violet accent stay unported; `welcome-act0.html` is a **composition reference only**
from here. Built at V6d; recorded in `design.md` § Variants and master §19.

## Per-phase leaves

Each phase becomes one leaf doc in this folder **as it is picked up**, carrying its own definition
of done — same convention as `../12-workbench/`.

- V1 — [`01-token-layer.md`](01-token-layer.md) (written 2026-07-25 against the already-landed
  code, per the deviation note above; its criteria were re-run on the tree, not transcribed)
- V2 — [`02-shell-chrome.md`](02-shell-chrome.md) (written 2026-07-25 **ahead of** its code, per
  the binding constraint; the code has since landed against it, following the doc as written —
  no deviation, unlike V1)
- V3 — [`03-explorer-status-bar.md`](03-explorer-status-bar.md) (written 2026-07-25 **ahead of**
  its code, per the binding constraint; the code has since landed against it, following the doc
  as written — no deviation, unlike V1)
- V4 — [`04-inspector-ai-pane.md`](04-inspector-ai-pane.md) (written 2026-07-25 **ahead of** its
  code, per the binding constraint — no deviation, matches V2/V3's convention)
- V5 — [`05-options-strip-palette.md`](05-options-strip-palette.md) (written 2026-07-25, landing
  in the same session as its code — this tier's established doc-then-code-same-session pattern)
- V6a — [`06a-status-register.md`](06a-status-register.md) (written 2026-07-25 before its code,
  per the binding constraint; landed the same session)
- V6b — [`06b-chart-canvas-palette.md`](06b-chart-canvas-palette.md) (written 2026-07-25 before
  its code, per the binding constraint; landed the same session)
- V6c — [`06c-export-artifact.md`](06c-export-artifact.md) (written 2026-07-25 before its code,
  per the binding constraint; landed the same session)
- V6d — [`06d-act0.md`](06d-act0.md) (written 2026-07-25 before its code, per the binding
  constraint; landed the same session)
- V6e — [`06e-conformance-gate.md`](06e-conformance-gate.md) (written 2026-07-25 before its code,
  per the binding constraint; ran and landed the same session). **The tier's closing gate, and it
  did not come back clean** — see its Results section. Seven token values and three call sites
  were corrected, the contrast matrix and residual census became tests in the suite, and two
  follow-ups are recorded rather than absorbed.
