import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHART_SERIES_DARK, CHART_SERIES_LIGHT, DIVERGING_DARK, DIVERGING_LIGHT } from './chartPalette';
import { oklchToRgb } from './oklch';

// The anti-drift gate. `chartPalette.ts` exists only because canvas 2D and the
// correlation maths cannot read a custom property; the moment its literals stop
// matching the tokens they mirror, the app renders two different palettes. This
// converts theme.css's own oklch declarations and compares.

const theme = readFileSync(join(__dirname, '../app/theme.css'), 'utf8');

/** The `--chart-n` declarations, in source order: the dark register first, then the light one. */
function declaredSlots(slot: number): [number, number, number][] {
  const pattern = new RegExp(`--chart-${slot}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`, 'g');
  return [...theme.matchAll(pattern)].map(([, l, c, h]) => oklchToRgb(Number(l) / 100, Number(c), Number(h)));
}

const toRgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

describe('chart palette literals', () => {
  it.each([1, 2, 3, 4])('slot %i matches its token in both registers', (slot) => {
    const [dark, light] = declaredSlots(slot);
    expect(dark).toBeDefined();
    expect(light).toBeDefined();
    expect(toRgb(CHART_SERIES_DARK[slot - 1])).toEqual(dark);
    expect(toRgb(CHART_SERIES_LIGHT[slot - 1])).toEqual(light);
  });

  it('carries the diverging poles from slots 1 and 2', () => {
    expect(DIVERGING_DARK.pos).toEqual(toRgb(CHART_SERIES_DARK[0]));
    expect(DIVERGING_DARK.neg).toEqual(toRgb(CHART_SERIES_DARK[1]));
    expect(DIVERGING_LIGHT.pos).toEqual(toRgb(CHART_SERIES_LIGHT[0]));
    expect(DIVERGING_LIGHT.neg).toEqual(toRgb(CHART_SERIES_LIGHT[1]));
  });

  it('keeps the four slots pairwise distinct in both registers', () => {
    expect(new Set(CHART_SERIES_DARK).size).toBe(4);
    expect(new Set(CHART_SERIES_LIGHT).size).toBe(4);
  });
});
