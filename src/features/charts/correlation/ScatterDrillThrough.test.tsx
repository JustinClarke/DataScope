import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor, within } from '@testing-library/react';
import { ScatterDrillThrough, CANVAS_POINT_THRESHOLD } from './ScatterDrillThrough';
import * as chartsService from '../../../services/charts';
import type { QueryResult } from '../../../types';

vi.mock('../../../services/charts', async () => {
  const actual = await vi.importActual<typeof chartsService>('../../../services/charts');
  return { ...actual, runChartQuery: vi.fn() };
});

function resultOf(n: number): QueryResult {
  const rows = Array.from({ length: n }, (_, i) => [i, i * 2]);
  return { columnNames: ['temp', 'humidity'], columnTypes: ['Float64', 'Float64'], rows, rowCount: n, executionTimeMs: 1 };
}

// No shared `beforeEach` mock reset here — each test chains `.mockReset()`
// inline before its own `.mockResolvedValue`/`.mockRejectedValue` instead.
// A `beforeEach`-level reset was found (this session) to race jsdom's
// window-level unhandledrejection tracking against React's effect scheduling
// when a rejected-promise test follows a resolved-promise one in the same
// file — the assertion passes but Vitest still fails the test. Chaining the
// reset inline (matching TimeSeriesModule.test.tsx's own convention for its
// error case) sidesteps it; not yet root-caused beyond that.
describe('ScatterDrillThrough', () => {
  afterEach(() => cleanup());

  it('runs a non-null-filtered two-column SELECT for the clicked pair', async () => {
    vi.mocked(chartsService.runChartQuery).mockReset().mockResolvedValue(resultOf(10));
    render(<ScatterDrillThrough table="weather" columnA="temp" columnB="humidity" />);
    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalled());
    const sql = vi.mocked(chartsService.runChartQuery).mock.calls[0][0];
    expect(sql).toContain('SELECT "temp", "humidity"');
    expect(sql).toContain('WHERE "temp" IS NOT NULL AND "humidity" IS NOT NULL');
  });

  it('shows a friendly message for no matching rows', async () => {
    vi.mocked(chartsService.runChartQuery).mockReset().mockResolvedValue(resultOf(0));
    const { container } = render(<ScatterDrillThrough table="weather" columnA="temp" columnB="humidity" />);
    await waitFor(() => expect(container.textContent).toContain('No rows with both values present'));
  });

  it('shows a friendly error when the query fails', async () => {
    vi.mocked(chartsService.runChartQuery).mockReset().mockRejectedValue(new Error('boom'));
    const { container } = render(<ScatterDrillThrough table="weather" columnA="temp" columnB="humidity" />);
    await waitFor(() => expect(container.textContent).toContain('boom'));
  });

  it(`switches to canvas rendering beyond ${CANVAS_POINT_THRESHOLD} points`, async () => {
    vi.mocked(chartsService.runChartQuery).mockReset().mockResolvedValue(resultOf(CANVAS_POINT_THRESHOLD + 1));
    const { getByTestId } = render(<ScatterDrillThrough table="weather" columnA="temp" columnB="humidity" />);
    await waitFor(() => expect(getByTestId('canvas-scatter')).toBeTruthy());
  });

  it(`stays off canvas at or below ${CANVAS_POINT_THRESHOLD} points`, async () => {
    vi.mocked(chartsService.runChartQuery).mockReset().mockResolvedValue(resultOf(CANVAS_POINT_THRESHOLD));
    const { container, queryByTestId } = render(<ScatterDrillThrough table="weather" columnA="temp" columnB="humidity" />);
    await waitFor(() => expect(within(container).getByText(/^SELECT/, { selector: 'pre' })).toBeTruthy());
    expect(queryByTestId('canvas-scatter')).toBeNull();
  });
});
