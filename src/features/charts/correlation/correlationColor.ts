import { divergingScale, type DivergingScale } from '../../../lib/chartPalette';

// Diverging color scale for the heatmap (§10 Module 4's fixed spec, on the
// palette design.md § Chart palette locks): the azure pole (strong positive) →
// a surface-neutral midpoint (no correlation) → the magenta pole (strong
// negative), linear per channel from the midpoint toward whichever pole the
// sign points to. The negative arm is deliberately not a red — the status red
// is reserved, and a cell is not an error. `null` (no value — e.g. a constant
// column DuckDB's `corr()` can't compute) gets no fill at all rather than a
// color, so "no data" never reads as "zero correlation".

export function correlationCellColor(value: number | null, scale: DivergingScale = divergingScale()): string {
  if (value === null) return 'transparent';
  const clamped = Math.max(-1, Math.min(1, value));
  const pole = clamped >= 0 ? scale.pos : scale.neg;
  const t = Math.abs(clamped);
  const [r, g, b] = scale.mid.map((mid, i) => Math.round(mid + (pole[i] - mid) * t));
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

/** The darkest or lightest ink, whichever contrasts more against the given cell fill (0.179 is the standard WCAG break-even point). */
export function correlationTextColor(cellColor: string): string {
  if (cellColor === 'transparent') return 'var(--color-fg-muted)';
  return relativeLuminance(cellColor) > 0.179 ? 'var(--color-void)' : 'var(--color-ink)';
}
