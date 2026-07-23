import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { TimeSeriesModule } from './TimeSeriesModule';
import { useDatasetsStore } from '../../../stores/datasets';
import * as chartsService from '../../../services/charts';
import type { QueryResult, TableRegistryEntry } from '../../../types';

vi.mock('../../../services/charts', async () => {
  const actual = await vi.importActual<typeof chartsService>('../../../services/charts');
  return { ...actual, runChartQuery: vi.fn() };
});

const emptyResult: QueryResult = { columnNames: [], columnTypes: [], rows: [], rowCount: 0, executionTimeMs: 1 };

const stockPrices: TableRegistryEntry = {
  id: 't-1',
  tableName: 'stock_prices',
  datasetId: 'ds-1',
  origin: 'sample',
  rowCount: 2500,
  columnCount: 2,
  memoryBytes: 4096,
  createdAt: new Date().toISOString(),
  columns: [
    {
      name: 'Date',
      semanticType: 'Temporal',
      physicalType: 'DATE',
      cardinality: 2500,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
    {
      name: 'Close',
      semanticType: 'Quantitative',
      physicalType: 'DOUBLE',
      cardinality: 2400,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
  ],
};

// Titanic-shaped: no Temporal column, so it never qualifies.
const titanic: TableRegistryEntry = {
  id: 't-2',
  tableName: 'titanic',
  datasetId: 'ds-2',
  origin: 'sample',
  rowCount: 891,
  columnCount: 1,
  memoryBytes: 2048,
  createdAt: new Date().toISOString(),
  columns: [
    {
      name: 'Fare',
      semanticType: 'Quantitative',
      physicalType: 'DOUBLE',
      cardinality: 200,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
  ],
};

function getSqlPreview(container: HTMLElement): string {
  const pre = within(container).getByText(/^SELECT/, { selector: 'pre' });
  return pre.textContent ?? '';
}

describe('TimeSeriesModule', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
    vi.mocked(chartsService.runChartQuery).mockReset().mockResolvedValue(emptyResult);
  });

  it('shows a clear message with no table that has both a date and a numeric column', () => {
    useDatasetsStore.setState({ tables: [titanic] });
    const { container } = render(<TimeSeriesModule />);
    expect(container.textContent).toContain('date column and a numeric column');
  });

  it('shows the same message with no registered tables at all', () => {
    const { container } = render(<TimeSeriesModule />);
    expect(container.textContent).toContain('date column and a numeric column');
  });

  it('defaults to the Trend view and runs a granularity-bucketed query for the eligible table', async () => {
    useDatasetsStore.setState({ tables: [titanic, stockPrices] });
    const { container } = render(<TimeSeriesModule />);

    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalled());
    const sql = vi.mocked(chartsService.runChartQuery).mock.calls[0][0];
    expect(sql).toContain('"stock_prices"');
    expect(sql).toContain('"Date"');
    expect(sql).toContain('AVG("Close")');

    await waitFor(() => expect(getSqlPreview(container)).toBe(sql));
  });

  it('re-queries when the granularity control changes', async () => {
    useDatasetsStore.setState({ tables: [stockPrices] });
    const { container } = render(<TimeSeriesModule />);
    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalledTimes(1));

    fireEvent.change(within(container).getByLabelText('Granularity'), { target: { value: 'month' } });

    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalledTimes(2));
    const sql = vi.mocked(chartsService.runChartQuery).mock.calls[1][0];
    expect(sql).toContain(`DATE_TRUNC('month'`);
  });

  it('adds the moving-average window function once the overlay is enabled', async () => {
    useDatasetsStore.setState({ tables: [stockPrices] });
    const { container } = render(<TimeSeriesModule />);
    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalledTimes(1));

    fireEvent.click(within(container).getByLabelText('Moving average'));

    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalledTimes(2));
    const sql = vi.mocked(chartsService.runChartQuery).mock.calls[1][0];
    expect(sql).toContain('ROWS BETWEEN 6 PRECEDING AND CURRENT ROW');
  });

  it('switches to the Compare view and runs a latest-two-periods query', async () => {
    useDatasetsStore.setState({ tables: [stockPrices] });
    const { container } = render(<TimeSeriesModule />);
    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalledTimes(1));

    fireEvent.click(within(container).getByText('Compare periods'));

    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalledTimes(2));
    const sql = vi.mocked(chartsService.runChartQuery).mock.calls[1][0];
    expect(sql).toContain('ORDER BY period DESC');
    expect(sql).toContain('LIMIT 2');
  });

  it('switches to the Seasonality view and runs a day-of-week / hour-of-day query', async () => {
    useDatasetsStore.setState({ tables: [stockPrices] });
    const { container } = render(<TimeSeriesModule />);
    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalledTimes(1));

    fireEvent.click(within(container).getByText('Seasonality'));

    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalledTimes(2));
    const sql = vi.mocked(chartsService.runChartQuery).mock.calls[1][0];
    expect(sql).toContain('EXTRACT(dow FROM "Date")');
    expect(sql).toContain('EXTRACT(hour FROM "Date")');
  });

  it('shows a friendly error when the query fails', async () => {
    vi.mocked(chartsService.runChartQuery).mockReset().mockRejectedValue(new Error('boom'));
    useDatasetsStore.setState({ tables: [stockPrices] });
    const { container } = render(<TimeSeriesModule />);
    await waitFor(() => expect(container.textContent).toContain('boom'));
  });

  it('opens on the answer (D68e) — a prefill seeds the table and columns instead of the first-eligible default', async () => {
    const secondStock: TableRegistryEntry = {
      ...stockPrices,
      id: 't-3',
      tableName: 'weather',
      columns: [
        { ...stockPrices.columns![0], name: 'Recorded' },
        { ...stockPrices.columns![1], name: 'Temp' },
      ],
    };
    useDatasetsStore.setState({ tables: [stockPrices, secondStock] });
    const { container } = render(<TimeSeriesModule prefill={{ tableName: 'weather', columns: ['Recorded', 'Temp'] }} />);

    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalled());
    expect((within(container).getByLabelText('Time-series table') as HTMLSelectElement).value).toBe('t-3');
    const sql = vi.mocked(chartsService.runChartQuery).mock.calls[0][0];
    expect(sql).toContain('"weather"');
    expect(sql).toContain('"Recorded"');
    expect(sql).toContain('"Temp"');
  });

  it('falls back to the first-eligible default when the prefill names a table that is not registered', async () => {
    useDatasetsStore.setState({ tables: [stockPrices] });
    const { container } = render(<TimeSeriesModule prefill={{ tableName: 'does_not_exist', columns: ['a', 'b'] }} />);
    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalled());
    const sql = vi.mocked(chartsService.runChartQuery).mock.calls[0][0];
    expect(sql).toContain('"stock_prices"');
    expect(container.textContent).not.toContain('boom');
  });

  it('offers a table picker only once more than one table qualifies', () => {
    useDatasetsStore.setState({ tables: [stockPrices] });
    const { container: single } = render(<TimeSeriesModule />);
    expect(within(single).queryByLabelText('Time-series table')).toBeNull();
    cleanup();

    const secondTable: TableRegistryEntry = { ...stockPrices, id: 't-3', tableName: 'weather' };
    useDatasetsStore.setState({ tables: [stockPrices, secondTable] });
    const { container: multi } = render(<TimeSeriesModule />);
    expect(within(multi).queryByLabelText('Time-series table')).not.toBeNull();
  });
});
