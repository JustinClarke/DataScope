/**
 * Resolved chart-palette values for the two paths that cannot read a CSS custom
 * property: canvas 2D contexts, and the correlation scale's own colour maths.
 * Everything else uses `var(--chart-*)` directly.
 *
 * `design.md` § Chart palette is the authority — these are its oklch values
 * converted to sRGB, and `chartPalette.test.ts` fails if the two ever disagree.
 */

export type Register = "dark" | "light";

/** Slots 1–4 in fixed assignment order. Never cycled: a fifth series folds into `Other`. */
export const CHART_SERIES_DARK = [
  "#119cf3",
  "#ba1e91",
  "#669c00",
  "#4057e5",
] as const;
export const CHART_SERIES_LIGHT = [
  "#048cdc",
  "#91006f",
  "#62950e",
  "#2d3acc",
] as const;

export interface DivergingScale {
  /** Positive pole — slot 1 (azure). */
  pos: [number, number, number];
  /** Negative pole — slot 2 (magenta). Deliberately not a red: the status red is reserved. */
  neg: [number, number, number];
  /** Midpoint — the surface-neutral `--color-elev`, never white on a dark instrument. */
  mid: [number, number, number];
}

export const DIVERGING_DARK: DivergingScale = {
  pos: [17, 156, 243],
  neg: [186, 30, 145],
  mid: [23, 27, 33],
};

export const DIVERGING_LIGHT: DivergingScale = {
  pos: [4, 140, 220],
  neg: [145, 0, 111],
  mid: [235, 237, 241],
};

/**
 * Which register is live. Dark is this system's primary register, so it is also
 * the answer wherever `matchMedia` is unavailable — including jsdom, which keeps
 * the tests on one deterministic scale.
 */
export function activeRegister(): Register {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function chartSeries(
  register: Register = activeRegister(),
): readonly string[] {
  return register === "light" ? CHART_SERIES_LIGHT : CHART_SERIES_DARK;
}

export function divergingScale(
  register: Register = activeRegister(),
): DivergingScale {
  return register === "light" ? DIVERGING_LIGHT : DIVERGING_DARK;
}
