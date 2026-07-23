import { describe, expect, it } from 'vitest';
import { correlationCellColor, correlationTextColor } from './correlationColor';

describe('correlationCellColor', () => {
  it('is dark blue at strong positive (r = 1)', () => {
    expect(correlationCellColor(1)).toBe('rgb(30, 58, 138)');
  });

  it('is white at no correlation (r = 0)', () => {
    expect(correlationCellColor(0)).toBe('rgb(255, 255, 255)');
  });

  it('is dark red at strong negative (r = -1)', () => {
    expect(correlationCellColor(-1)).toBe('rgb(127, 29, 29)');
  });

  it('interpolates linearly between white and a pole', () => {
    expect(correlationCellColor(0.5)).toBe('rgb(143, 157, 197)');
    expect(correlationCellColor(-0.5)).toBe('rgb(191, 142, 142)');
  });

  it('renders no fill for a missing value', () => {
    expect(correlationCellColor(null)).toBe('transparent');
  });

  it('clamps out-of-range input to the poles', () => {
    expect(correlationCellColor(1.5)).toBe(correlationCellColor(1));
    expect(correlationCellColor(-2)).toBe(correlationCellColor(-1));
  });
});

describe('correlationTextColor', () => {
  it('picks white text on the dark poles and black on white', () => {
    expect(correlationTextColor('rgb(30, 58, 138)')).toBe('#ffffff');
    expect(correlationTextColor('rgb(127, 29, 29)')).toBe('#ffffff');
    expect(correlationTextColor('rgb(255, 255, 255)')).toBe('#0b0b0b');
  });

  it('falls back to muted text for a transparent (no-data) cell', () => {
    expect(correlationTextColor('transparent')).toBe('var(--color-fg-muted)');
  });
});
