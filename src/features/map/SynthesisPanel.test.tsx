import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { SynthesisPanel } from './SynthesisPanel';
import type { InsightCandidate, TableInsights } from '../../lib/insights';
import type { ClassifiedColumn, FactRef, SemanticType, TableRegistryEntry } from '../../types';
import type { SidebarModule } from '../../stores/ui';

const { openDestinationMock, isDestinationReadyMock, openQueryTabMock, analystCoreMock, actualRef } = vi.hoisted(() => ({
  openDestinationMock: vi.fn(),
  isDestinationReadyMock: vi.fn<(module: SidebarModule) => boolean>(),
  openQueryTabMock: vi.fn(),
  analystCoreMock: vi.fn(),
  actualRef: {} as { isDestinationReady: (module: SidebarModule) => boolean },
}));
vi.mock('../../services/navigation', async () => {
  const actual = await vi.importActual<typeof import('../../services/navigation')>('../../services/navigation');
  actualRef.isDestinationReady = actual.isDestinationReady;
  return { ...actual, openDestination: openDestinationMock, isDestinationReady: isDestinationReadyMock };
});
vi.mock('../../services/queryTabs', () => ({ openQueryTab: openQueryTabMock }));
// A2's period-over-period suggestion calls `time_series` directly — mocked
// the same way DistributionModule.test.tsx mocks the analyst core, so a
// richly-columned fixture never reaches the real DuckDB-Wasm engine.
vi.mock('../../services/analyst', () => ({ analystCore: analystCoreMock }));

function col(semanticType: SemanticType, name: string): ClassifiedColumn {
  return {
    name,
    semanticType,
    physicalType: 'DOUBLE',
    cardinality: 10,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
  };
}

function table(id: string, tableName: string, columns: ClassifiedColumn[], rowCount: number): TableRegistryEntry {
  return {
    id,
    tableName,
    datasetId: 'd1',
    origin: 'file',
    rowCount,
    columnCount: columns.length,
    memoryBytes: 1000,
    createdAt: '2026-07-25T00:00:00.000Z',
    columns,
  };
}

const orders = table('a', 'orders', [col('Identifier', 'id')], 10);
const regions = table('b', 'regions', [col('Categorical', 'region')], 5);
const metrics = table('c', 'metrics', [col('Quantitative', 'amount')], 500);
const tables = [orders, regions, metrics];

function fact(statement: string): FactRef {
  return { statement, sql: '', snapshot: '2026-07-25T00:00:00.000Z', confidence: 'high', provenance: 'schema' };
}

function candidate(overrides: Partial<InsightCandidate>): InsightCandidate {
  return {
    id: 'candidate-1',
    rule: 'null-pattern',
    description: 'default description',
    sql: '',
    effectSize: 1,
    coverage: 1,
    ...overrides,
  };
}

const baseline = { headlineFact: fact('4 tables, 5,437 rows, 0% null values.'), actions: [] };

describe('SynthesisPanel', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    openDestinationMock.mockReset();
    isDestinationReadyMock.mockReset();
    isDestinationReadyMock.mockImplementation(actualRef.isDestinationReady);
    openQueryTabMock.mockReset();
    analystCoreMock.mockReset().mockReturnValue({
      call: vi.fn().mockResolvedValue({ ok: false, code: 'sql_error', message: 'unavailable in test' }),
    });
  });

  it('shows the deterministic baseline headline when no AI upgrade has landed', () => {
    const { getByTestId } = render(
      <SynthesisPanel tables={tables} tableInsights={[]} baseline={baseline} headlineFact={null} paused={false} />,
    );
    expect(getByTestId('ai-synthesis-headline').textContent).toBe('4 tables, 5,437 rows, 0% null values.');
  });

  it('prefers the AI-upgraded headline over the baseline once accepted', () => {
    const { getByTestId } = render(
      <SynthesisPanel
        tables={tables}
        tableInsights={[]}
        baseline={baseline}
        headlineFact={fact('Tailored: an e-commerce dataset well-suited for churn analysis.')}
        paused={false}
      />,
    );
    expect(getByTestId('ai-synthesis-headline').textContent).toBe(
      'Tailored: an e-commerce dataset well-suited for churn analysis.',
    );
  });

  it('shows "Profiling…" while no baseline exists yet', () => {
    const { getByTestId } = render(
      <SynthesisPanel tables={tables} tableInsights={[]} baseline={null} headlineFact={null} paused={false} />,
    );
    expect(getByTestId('ai-synthesis-headline').textContent).toBe('Profiling…');
  });

  it('surfaces a paused indicator rather than hiding the degraded state (invariant 5)', () => {
    const { getByTestId, queryByText } = render(
      <SynthesisPanel tables={tables} tableInsights={[]} baseline={baseline} headlineFact={null} paused />,
    );
    expect(getByTestId('ai-synthesis-card').textContent).toContain('paused');
    expect(queryByText('paused')).toBeTruthy();
  });

  it('renders the dataset-wide top-3 Suggested Explorations, wired to the nav facade', () => {
    const { getByTestId } = render(
      <SynthesisPanel tables={tables} tableInsights={[]} baseline={baseline} headlineFact={null} paused={false} />,
    );
    const button = getByTestId('exploration-profile') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    expect(openDestinationMock).toHaveBeenCalledWith('profile', undefined, { tableName: 'metrics' });
  });

  it('disables a not-yet-wired exploration and never opens it on click', () => {
    isDestinationReadyMock.mockReturnValue(false);
    const { container } = render(
      <SynthesisPanel tables={tables} tableInsights={[]} baseline={baseline} headlineFact={null} paused={false} />,
    );
    const buttons = container.querySelectorAll('[data-testid^="exploration-"]');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => expect((button as HTMLButtonElement).disabled).toBe(true));
  });

  it('sorts real InsightCandidates into Structural vs. Behavioral columns by rule, never fabricating a finding', () => {
    const tableInsights: TableInsights[] = [
      {
        table: metrics,
        insights: [
          candidate({ id: 'null-1', rule: 'null-pattern', description: 'Missing values concentrated in "amount".' }),
          candidate({ id: 'change-1', rule: 'change-point', description: 'amount rose 40% in 2026-03.' }),
        ],
      },
      {
        table: regions,
        insights: [
          candidate({ id: 'dup-1', rule: 'duplicates', description: '3 fully duplicated rows detected.' }),
        ],
      },
    ];
    const { getByTestId } = render(
      <SynthesisPanel tables={tables} tableInsights={tableInsights} baseline={baseline} headlineFact={null} paused={false} />,
    );
    const structural = getByTestId('structural-patterns');
    const behavioral = getByTestId('behavioral-trends');
    expect(structural.textContent).toContain('Missing values concentrated in "amount"');
    expect(structural.textContent).not.toContain('rose 40%');
    expect(behavioral.textContent).toContain('amount rose 40% in 2026-03');
    expect(behavioral.textContent).toContain('3 fully duplicated rows detected');
    expect(behavioral.textContent).not.toContain('Missing values');
  });

  it('hides the view-more affordance when there are 3 or fewer suggestions', () => {
    const { queryByTestId } = render(
      <SynthesisPanel tables={tables} tableInsights={[]} baseline={baseline} headlineFact={null} paused={false} />,
    );
    expect(queryByTestId('explorations-view-more')).toBeNull();
  });

  it('opens a pre-run query tab for a beyond-top-3 exploration (S6, D73)', () => {
    // `metrics` gains a date + a second numeric column so correlation and
    // time-series both clear their capability gate, giving 4 distinct
    // insight-driven destinations — enough to push `duplicates` (last,
    // deliberately) past the top-3 cutoff into "view more".
    const richMetrics = table('c', 'metrics', [col('Quantitative', 'amount'), col('Quantitative', 'cost'), col('Temporal', 'order_date')], 500);
    const richTables = [orders, regions, richMetrics];
    const tableInsights: TableInsights[] = [
      {
        table: orders,
        // Distinct column suffixes keep each of the first three on a separate
        // dedup key (`lib/capabilities.ts`'s ranker keys insight actions by
        // module + operand columns) so all four survive as insight-driven
        // actions, `duplicates` ordered last among equally-scored candidates.
        insights: [
          candidate({ id: 'outlier-group:region:amount', rule: 'outlier-group', description: 'Outliers by group.' }),
          candidate({ id: 'concentration:region', rule: 'concentration', description: 'Concentrated in one region.' }),
          candidate({ id: 'leakage:amount:cost', rule: 'leakage', description: 'Correlated columns.' }),
          candidate({
            id: 'duplicates',
            rule: 'duplicates',
            description: '3 fully duplicated rows detected.',
            sql: 'SELECT * FROM orders GROUP BY id HAVING COUNT(*) > 1',
          }),
        ],
      },
    ];
    const { getByTestId, queryByTestId } = render(
      <SynthesisPanel tables={richTables} tableInsights={tableInsights} baseline={baseline} headlineFact={null} paused={false} />,
    );
    expect(queryByTestId('exploration-more-0')).toBeNull();
    fireEvent.click(getByTestId('explorations-view-more'));
    const more = getByTestId('exploration-more-0') as HTMLButtonElement;
    expect(more.disabled).toBe(false);
    more.click();
    expect(openQueryTabMock).toHaveBeenCalledWith({
      sql: 'SELECT * FROM orders GROUP BY id HAVING COUNT(*) > 1',
      name: 'Find the duplicate rows in orders',
      autoRun: true,
    });
  });

  it('disables a beyond-top-3 exploration with no query behind it', () => {
    const tableInsights: TableInsights[] = [
      {
        table: orders,
        // `duplicates` routes to a genuinely new destination (not one of the
        // 3 generic actions), so it lands as a 4th action — but with no `sql`
        // on the candidate, there is nothing for the query tab to run.
        insights: [candidate({ id: 'duplicates', rule: 'duplicates', description: 'Possible duplicates in orders.' })],
      },
    ];
    const { getByTestId } = render(
      <SynthesisPanel tables={tables} tableInsights={tableInsights} baseline={baseline} headlineFact={null} paused={false} />,
    );
    fireEvent.click(getByTestId('explorations-view-more'));
    const more = getByTestId('exploration-more-0') as HTMLButtonElement;
    expect(more.disabled).toBe(true);
    more.click();
    expect(openQueryTabMock).not.toHaveBeenCalled();
  });

  it('shows an honest empty state per column rather than inventing a finding', () => {
    const { getByTestId } = render(
      <SynthesisPanel tables={tables} tableInsights={[]} baseline={baseline} headlineFact={null} paused={false} />,
    );
    expect(getByTestId('structural-patterns').textContent).toContain('No findings yet.');
    expect(getByTestId('behavioral-trends').textContent).toContain('No findings yet.');
  });

  describe('period-over-period suggestion (A2, D53 surface 4)', () => {
    const richMetrics = table('c', 'metrics', [col('Quantitative', 'amount'), col('Temporal', 'order_date')], 500);
    const richTables = [orders, regions, richMetrics];

    const TIME_SERIES_OUTCOME = {
      op: 'time_series',
      sql: 'SELECT period, sum_amount, is_gap, sum_amount_delta_pct FROM (…) ORDER BY period',
      resultId: null,
      schema: [
        { name: 'period', type: 'TIMESTAMP' },
        { name: 'sum_amount', type: 'DOUBLE' },
        { name: 'is_gap', type: 'BOOLEAN' },
        { name: 'sum_amount_delta_pct', type: 'DOUBLE' },
      ],
      rowCount: 2,
      rows: [
        [new Date('2026-06-01'), 100, false, null],
        [new Date('2026-07-01'), 120, false, 20],
      ],
      complete: true,
      nextOffset: null,
      elapsedMs: 1,
    };

    it('calls time_series for a table offering a Temporal + Quantitative pair, and adopts its result on click', async () => {
      const callMock = vi.fn().mockResolvedValue(TIME_SERIES_OUTCOME);
      analystCoreMock.mockReturnValue({ call: callMock });

      const { findByTestId } = render(
        <SynthesisPanel tables={richTables} tableInsights={[]} baseline={baseline} headlineFact={null} paused={false} />,
      );

      const row = await findByTestId('exploration-period-over-period');
      expect(callMock).toHaveBeenCalledWith('time_series', {
        from: 'metrics',
        dateColumn: 'order_date',
        grain: 'month',
        metrics: [{ fn: 'sum', column: 'amount' }],
      });
      expect(row.textContent).toContain('+20.0%');

      fireEvent.click(row);
      expect(openQueryTabMock).toHaveBeenCalledWith({
        sql: TIME_SERIES_OUTCOME.sql,
        name: 'Period over period',
        result: {
          columnNames: ['period', 'sum_amount', 'is_gap', 'sum_amount_delta_pct'],
          columnTypes: ['TIMESTAMP', 'DOUBLE', 'BOOLEAN', 'DOUBLE'],
          rows: TIME_SERIES_OUTCOME.rows,
          rowCount: 2,
          executionTimeMs: 1,
        },
        resultSql: TIME_SERIES_OUTCOME.sql,
      });
    });

    it('never calls time_series when no table offers a Temporal + Quantitative pair', () => {
      const callMock = vi.fn().mockResolvedValue({ ok: false, code: 'sql_error', message: 'n/a' });
      analystCoreMock.mockReturnValue({ call: callMock });

      render(<SynthesisPanel tables={tables} tableInsights={[]} baseline={baseline} headlineFact={null} paused={false} />);
      expect(callMock).not.toHaveBeenCalledWith('time_series', expect.anything());
    });
  });
});
