// Diverging color scale for the heatmap (§10 Module 4's fixed spec): dark
// blue (strong positive) → white (no correlation) → dark red (strong
// negative), linear per channel from the white midpoint toward whichever
// pole the sign points to. `null` (no value — e.g. a constant column DuckDB's
// `corr()` can't compute) gets no fill at all rather than a color, so "no
// data" never reads as "zero correlation".
const POSITIVE_POLE = { r: 30, g: 58, b: 138 }; // dark blue
const NEGATIVE_POLE = { r: 127, g: 29, b: 29 }; // dark red

export function correlationCellColor(value: number | null): string {
  if (value === null) return 'transparent';
  const clamped = Math.max(-1, Math.min(1, value));
  const pole = clamped >= 0 ? POSITIVE_POLE : NEGATIVE_POLE;
  const t = Math.abs(clamped);
  const r = Math.round(255 + (pole.r - 255) * t);
  const g = Math.round(255 + (pole.g - 255) * t);
  const b = Math.round(255 + (pole.b - 255) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance (WCAG) of an `rgb(r, g, b)` string, for picking readable cell text. */
function relativeLuminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? ['255', '255', '255']).map(Number);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Black or white, whichever contrasts more against the given cell fill (0.179 is the standard WCAG break-even point). */
export function correlationTextColor(cellColor: string): string {
  if (cellColor === 'transparent') return 'var(--color-fg-muted)';
  return relativeLuminance(cellColor) > 0.179 ? '#0b0b0b' : '#ffffff';
}
