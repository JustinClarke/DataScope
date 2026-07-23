import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CanvasScatter } from './CanvasScatter';

describe('CanvasScatter', () => {
  afterEach(() => cleanup());

  it('renders a canvas labeled with the point count and axis names', () => {
    const points = Array.from({ length: 12_000 }, (_, i) => ({ x: i, y: i * 2 }));
    const { getByRole } = render(<CanvasScatter points={points} xLabel="Age" yLabel="Fare" />);
    const canvas = getByRole('img', { name: /Age/ });
    expect(canvas.getAttribute('aria-label')).toBe('Scatter plot of Fare vs Age, 12,000 points');
  });

  it('renders with no points without throwing (jsdom has no 2D canvas context)', () => {
    expect(() => render(<CanvasScatter points={[]} xLabel="x" yLabel="y" />)).not.toThrow();
  });
});
