/**
 * OKLCH → sRGB conversion and WCAG contrast, for the token-layer gates.
 *
 * Extracted at V6e so `chartPalette.test.ts` and `conformance.test.ts` measure with
 * one implementation rather than two — a contrast gate that disagrees with the palette
 * pin about what a token resolves to is worse than no gate at all.
 *
 * This is test/measurement infrastructure, not a render path: nothing in the app calls
 * it. The app reads `var(--token)` and lets the browser convert.
 */

export type Rgb = [number, number, number];

/** OKLCH (L as 0–1, C, H in degrees) → sRGB 0–255, gamut-clipped per channel. */
export function oklchToRgb(L: number, C: number, H: number): Rgb {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l3 = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
  return linear.map((c) => {
    const encoded =
      c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
  }) as Rgb;
}

function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio. Order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Composite a translucent colour over an opaque one. The rule tokens and the tinted
 * status washes have no contrast ratio of their own — only the result of this does.
 */
export function composite(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;
}
