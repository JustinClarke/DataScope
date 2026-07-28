import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { InsightFeed } from './InsightFeed';
import type { TableRegistryEntry } from '../../types';
import type { InsightCandidate } from '../../lib/insights';

const { loadInsightsMock } = vi.hoisted(() => ({ loadInsightsMock: vi.fn() }));
vi.mock('../../services/insights', () => ({ loadInsights: loadInsightsMock }));

const { runChartQueryMock } = vi.hoisted(() => ({ runChartQueryMock: vi.fn() }));
vi.mock('../../services/charts', () => ({ runChartQuery: runChartQueryMock }));

const { runInConsoleMock } = vi.hoisted(() => ({ runInConsoleMock: vi.fn() }));
vi.mock('../../services/runPath', () => ({ runInConsole: runInConsoleMock }));

const baseTable: TableRegistryEntry = {
  id: 't-1',
  tableName: 'orders',
  datasetId: 'ds-1',
  origin: 'sample',
  rowCount: 1000,
  columnCount: 3,
  memoryBytes: 1024,
  createdAt: new Date().toISOString(),
  columns: [
    {
      name: 'region',
      semanticType: 'Categorical',
      physicalType: 'VARCHAR',
      cardinality: 4,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
  ],
};

// Queries are scoped to each test's own `container` rather than the global
// `screen` — no RTL auto-cleanup is configured in vitest.config.ts, matching
// the rest of this test suite's convention (see IngestionPanel.test.tsx).

describe('InsightFeed', () => {
  it('renders nothing until the table is classified', () => {
    const { container } = render(<InsightFeed table={{ ...baseTable, columns: undefined }} onShowSql={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('shows a loading state, then the ranked cards once insights resolve', async () => {
    let resolve!: (value: InsightCandidate[]) => void;
    loadInsightsMock.mockReturnValue(new Promise((r) => (resolve = r)));

    const { container } = render(<InsightFeed table={baseTable} onShowSql={vi.fn()} />);
    expect(within(container).getByText('Looking for patterns…')).toBeTruthy();

    resolve([
      {
        id: 'duplicates',
        rule: 'duplicates',
        description: '412 fully duplicated rows detected.',
        sql: 'SELECT ...',
        effectSize: 1,
        coverage: 0.8,
      },
    ]);

    await waitFor(() => expect(within(container).getByText('412 fully duplicated rows detected.')).toBeTruthy());
    expect(within(container).getByText('Duplicates')).toBeTruthy();
  });

  it('shows an empty state when no rule fires', async () => {
    loadInsightsMock.mockResolvedValue([]);
    const { container } = render(<InsightFeed table={baseTable} onShowSql={vi.fn()} />);
    await waitFor(() => expect(within(container).getByText('No notable patterns found in this table.')).toBeTruthy());
  });

  it('runs the insight query and charts its result when "Open as chart" is clicked', async () => {
    loadInsightsMock.mockResolvedValue([
      {
        id: 'concentration:region',
        rule: 'concentration',
        description: 'Top region holds 62% of rows.',
        sql: 'SELECT region, COUNT(*) FROM orders GROUP BY 1',
        effectSize: 1,
        coverage: 0.6,
      },
    ]);
    // A single-value result renders as a KPI stat, exercising the wire-up
    // without pulling the charting library into jsdom.
    runChartQueryMock.mockResolvedValue({
      columnNames: ['total'],
      columnTypes: ['BIGINT'],
      rows: [[620]],
      rowCount: 1,
      executionTimeMs: 1,
    });

    const { container } = render(<InsightFeed table={baseTable} onShowSql={vi.fn()} />);
    const button = await waitFor(() => within(container).getByText('Open as chart'));
    expect(within(container).getByText('Show SQL')).toBeTruthy();

    fireEvent.click(button);

    await waitFor(() => expect(within(container).getByText('620')).toBeTruthy());
    expect(runChartQueryMock).toHaveBeenCalledWith('SELECT region, COUNT(*) FROM orders GROUP BY 1');
    expect(within(container).getByText('Hide chart')).toBeTruthy();
  });

  it('runs an insight\'s query in the console (S4), alongside Show SQL rather than instead of it', async () => {
    loadInsightsMock.mockResolvedValue([
      {
        id: 'concentration:region',
        rule: 'concentration',
        description: 'Top region holds 62% of rows.',
        sql: 'SELECT region, COUNT(*) FROM orders GROUP BY 1',
        effectSize: 1,
        coverage: 0.6,
      },
    ]);

    const { container } = render(<InsightFeed table={baseTable} onShowSql={vi.fn()} />);
    const run = await waitFor(() => within(container).getByRole('button', { name: /^run$/i }));
    fireEvent.click(run);

    expect(runInConsoleMock).toHaveBeenCalledWith('SELECT region, COUNT(*) FROM orders GROUP BY 1');
    expect(within(container).getByText('Show SQL')).toBeTruthy();
  });
});
