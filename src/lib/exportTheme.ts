/**
 * The design system's token declarations, mirrored for the one surface the token
 * layer cannot reach: `dspsHtml.ts`'s standalone share artifact (D63). That file
 * leaves the app, so it cannot reference `theme.css` — but it can declare the
 * same custom properties itself and then use `var()` normally, which is what
 * this module supplies.
 *
 * `design.md` is the authority; these are its declarations copied verbatim, and
 * `exportTheme.test.ts` fails on any per-token, per-register string mismatch.
 * Same anti-drift contract as `chartPalette.ts`, made exact by the fact that the
 * mirrored value here is a CSS string rather than a converted colour.
 *
 * Only the subset the report actually uses is carried — mirroring all ~60 tokens
 * would pin values nothing reads.
 */

/** Per-register: surfaces, ink, rules, and the single accent. Dark is primary. */
export const EXPORT_TOKENS_DARK = `--color-canvas: oklch(15.4% 0.0092 264);
  --color-elev: oklch(22.1% 0.0132 258);
  --color-ink: oklch(96.6% 0.0045 258);
  --color-ink-2: oklch(65.9% 0.002 248);
  --color-ink-3: oklch(61% 0.006 262);
  --color-rule: oklch(100% 0 0 / 0.1);
  --color-rule-2: oklch(100% 0 0 / 0.05);
  --color-active: oklch(76.9% 0.1647 70);`;

export const EXPORT_TOKENS_LIGHT = `--color-canvas: oklch(98.8% 0.003 262);
    --color-elev: oklch(94.5% 0.006 262);
    --color-ink: oklch(19% 0.014 262);
    --color-ink-2: oklch(43% 0.012 262);
    --color-ink-3: oklch(51% 0.01 262);
    --color-rule: oklch(0% 0 0 / 0.12);
    --color-rule-2: oklch(0% 0 0 / 0.06);
    --color-active: oklch(46% 0.106 62);`;

/**
 * Register-invariant: type, scale, space, radius.
 *
 * `--font-sans` and `--font-mono` are the artifact's one deliberate departure —
 * they are `theme.css`'s stacks minus their leading self-hosted family. The app
 * serves Geist and JetBrains Mono from its own origin; a file that has left the
 * app cannot reach them, and embedding them base64 would cost ~93 KB against a
 * report of a few KB, against D63's whole premise. The test asserts the tail
 * relationship, so the two stacks stay in step.
 */
export const EXPORT_TOKENS_STATIC = `--font-sans: ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, Consolas, monospace;
  --text-sm: 0.625rem;
  --text-base: 0.75rem;
  --text-lg: 0.82rem;
  --text-2xl: 1.15rem;
  --space-2xs: 0.25rem;
  --space-xs: 0.5rem;
  --space-md: 1rem;
  --space-xl: 2.5rem;
  --radius-xs: 4px;`;

/**
 * The assembled block, mirroring `theme.css`'s own structure: dark unconditional,
 * light in a `prefers-color-scheme` query — so the artifact follows its reader's
 * register exactly as the app follows its user's, with no script.
 *
 * The print block is the one rule with no counterpart in the app, and it is a
 * legibility fix rather than a preference: honoured, the dark register prints a
 * full-bleed black slab; stripped by the browser's default economy mode, it
 * leaves 96.6%-lightness ink on white paper. It sits last so it wins over the
 * `:root` dark block on a dark-preference machine.
 *
 * `color-scheme` is declared per register rather than as a two-value list, for
 * the same reason `theme.css` does it — a no-preference reader would otherwise
 * get light form controls and scrollbars against these dark surfaces.
 */
export const EXPORT_THEME_CSS = `:root {
  color-scheme: dark;
  ${EXPORT_TOKENS_DARK}
  ${EXPORT_TOKENS_STATIC}
}
@media (prefers-color-scheme: light) {
  :root {
    color-scheme: light;
    ${EXPORT_TOKENS_LIGHT}
  }
}
@media print {
  :root {
    color-scheme: light;
    ${EXPORT_TOKENS_LIGHT}
  }
}`;
