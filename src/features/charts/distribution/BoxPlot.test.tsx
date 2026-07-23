import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BoxPlot } from './BoxPlot';
import type { BoxPlotStats } from '../../../lib/distributionSql';

describe('BoxPlot', () => {
  afterEach(() => cleanup());

  it('describes quartiles, whiskers, and outlier count in its accessible label', () => {
    const stats: BoxPlotStats = { q1: 20, median: 28, q3: 38, whiskerLow: 1, whiskerHigh: 64, outliers: [66, 70] };
    const { getByLabelText, container } = render(<BoxPlot stats={stats} />);
    const svg = getByLabelText(/^Box plot:/);
    expect(svg.getAttribute('aria-label')).toContain('first quartile 20.00');
    expect(svg.getAttribute('aria-label')).toContain('median 28.00');
    expect(svg.getAttribute('aria-label')).toContain('2 outliers');
    expect(container.querySelectorAll('circle')).toHaveLength(2);
    expect(container.textContent).toContain('2 outliers (IQR rule, 1.5× fence)');
  });

  it('renders no outlier note and no circles when the fence has no outliers', () => {
    const stats: BoxPlotStats = { q1: 20, median: 28, q3: 38, whiskerLow: 1, whiskerHigh: 64, outliers: [] };
    const { container } = render(<BoxPlot stats={stats} />);
    expect(container.querySelectorAll('circle')).toHaveLength(0);
    expect(container.textContent).not.toContain('IQR rule');
  });

  it('does not throw on a degenerate zero-span domain (constant column)', () => {
    const stats: BoxPlotStats = { q1: 5, median: 5, q3: 5, whiskerLow: 5, whiskerHigh: 5, outliers: [] };
    const { getByLabelText } = render(<BoxPlot stats={stats} />);
    expect(getByLabelText(/^Box plot:/)).toBeTruthy();
  });
});
