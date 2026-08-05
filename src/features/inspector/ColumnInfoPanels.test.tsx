import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { DistinctValuesPanel, TextFrequencyPanel, JoinCoveragePanel } from './ColumnInfoPanels';
import type { FkEdge } from '../../lib/relationshipInference';

const { analystCoreMock } = vi.hoisted(() => ({ analystCoreMock: vi.fn() }));
vi.mock('../../services/analyst', () => ({ analystCore: analystCoreMock }));

// `RunSqlButton` (shared by every panel here) calls the S4 run path — mocked
// so a click never tries to reach a real engine.
const { runInConsoleMock } = vi.hoisted(() => ({ runInConsoleMock: vi.fn() }));
vi.mock('../../services/runPath', () => ({ runInConsole: runInConsoleMock }));

function outcome(schema: { name: string; type: string }[], rows: unknown[][], sql = 'SELECT …') {
  return { op: 'op', sql, resultId: null, schema, rowCount: rows.length, rows, complete: true, nextOffset: null, elapsedMs: 1 };
}

afterEach(() => cleanup());

describe('DistinctValuesPanel (A2) — buildTopValuesSql, parameterized', () => {
  it('renders top values with count and share, and a Run action wired to the real sql', async () => {
    const callMock = vi.fn().mockResolvedValue(
      outcome(
        [
          { name: 'value', type: 'VARCHAR' },
          { name: 'count', type: 'BIGINT' },
          { name: 'share', type: 'DOUBLE' },
        ],
        [
          ['completed', 8, 0.8],
          ['pending', 2, 0.2],
        ],
        'SELECT value, count, share FROM …',
      ),
    );
    analystCoreMock.mockReturnValue({ call: callMock });

    const { findByText, getByText } = render(<DistinctValuesPanel table="orders" column="status" />);
    await waitFor(() => expect(callMock).toHaveBeenCalledWith('distinct_values', { table: 'orders', column: 'status' }));
    expect(await findByText('completed')).toBeTruthy();
    expect(getByText(/8.*80%/)).toBeTruthy();

    fireEvent.click(getByText('Run'));
    expect(runInConsoleMock).toHaveBeenCalledWith('SELECT value, count, share FROM …');
  });

  it('shows an honest empty state for an entirely-null column rather than an empty table', async () => {
    const callMock = vi.fn().mockResolvedValue(
      outcome([{ name: 'value', type: 'VARCHAR' }, { name: 'count', type: 'BIGINT' }, { name: 'share', type: 'DOUBLE' }], []),
    );
    analystCoreMock.mockReturnValue({ call: callMock });
    const { findByText } = render(<DistinctValuesPanel table="orders" column="notes" />);
    expect(await findByText(/every row is null/)).toBeTruthy();
  });

  it('shows the operation error rather than hanging', async () => {
    analystCoreMock.mockReturnValue({
      call: vi.fn().mockResolvedValue({ ok: false, code: 'unknown_object', message: 'No column named x.' }),
    });
    const { findByText } = render(<DistinctValuesPanel table="orders" column="x" />);
    expect(await findByText('No column named x.')).toBeTruthy();
  });
});

describe('TextFrequencyPanel (A2) — textual columns only', () => {
  it('renders term counts and re-queries when the unit toggle changes', async () => {
    const callMock = vi.fn().mockResolvedValue(
      outcome(
        [
          { name: 'term', type: 'VARCHAR' },
          { name: 'count', type: 'BIGINT' },
          { name: 'doc_count', type: 'BIGINT' },
          { name: 'share', type: 'DOUBLE' },
        ],
        [['great', 12, 10, 0.4]],
      ),
    );
    analystCoreMock.mockReturnValue({ call: callMock });

    const { findByText, getByText } = render(<TextFrequencyPanel table="reviews" column="body" />);
    await waitFor(() =>
      expect(callMock).toHaveBeenCalledWith('text_frequency', { table: 'reviews', column: 'body', unit: 'word', top: 15 }),
    );
    expect(await findByText('great')).toBeTruthy();

    fireEvent.click(getByText('Bigrams'));
    await waitFor(() =>
      expect(callMock).toHaveBeenCalledWith('text_frequency', { table: 'reviews', column: 'body', unit: 'bigram', top: 15 }),
    );
  });

  it('shows an honest empty state when every value is null or empty', async () => {
    const callMock = vi.fn().mockResolvedValue(
      outcome(
        [
          { name: 'term', type: 'VARCHAR' },
          { name: 'count', type: 'BIGINT' },
          { name: 'doc_count', type: 'BIGINT' },
          { name: 'share', type: 'DOUBLE' },
        ],
        [],
      ),
    );
    analystCoreMock.mockReturnValue({ call: callMock });
    const { findByText } = render(<TextFrequencyPanel table="reviews" column="body" />);
    expect(await findByText(/every value is null or empty/)).toBeTruthy();
  });
});

const EDGE: FkEdge = {
  id: 'orders.customer_id->customers.id',
  childTable: 'orders',
  childColumn: 'customer_id',
  parentTable: 'customers',
  parentColumn: 'id',
  containment: 1,
  coverage: 1,
  parentKeyUniqueness: 1,
  nameAgreement: true,
  confidence: 'confident',
  confidenceScore: 1,
  evidence: '100% of `orders.customer_id` values appear in `customers.id`',
  source: 'inferred',
};

describe('JoinCoveragePanel (A2) — matched/unmatched/multiplicity on the selected edge', () => {
  it('measures the edge in hand directly, never re-inferring a candidate', async () => {
    const callMock = vi.fn().mockResolvedValue(
      outcome(
        [
          { name: 'left_table', type: 'VARCHAR' },
          { name: 'right_table', type: 'VARCHAR' },
          { name: 'left_column', type: 'VARCHAR' },
          { name: 'right_column', type: 'VARCHAR' },
          { name: 'left_matched', type: 'BIGINT' },
          { name: 'left_unmatched', type: 'BIGINT' },
          { name: 'right_matched', type: 'BIGINT' },
          { name: 'right_unmatched', type: 'BIGINT' },
          { name: 'multiplicity', type: 'VARCHAR' },
          { name: 'left_orphan_examples', type: 'VARCHAR[]' },
          { name: 'right_orphan_examples', type: 'VARCHAR[]' },
          { name: 'join_sql', type: 'VARCHAR' },
        ],
        [['orders', 'customers', 'customer_id', 'id', 100, 5, 40, 0, 'n:1', [], ['7'], 'SELECT … JOIN …']],
      ),
    );
    analystCoreMock.mockReturnValue({ call: callMock });

    const { findByText, getByText } = render(<JoinCoveragePanel edge={EDGE} />);
    expect(await findByText('n:1')).toBeTruthy();
    expect(callMock).toHaveBeenCalledWith('join_coverage', {
      left: 'orders',
      right: 'customers',
      on: { leftColumn: 'customer_id', rightColumn: 'id' },
    });
    expect(getByText(/100.*matched/)).toBeTruthy();
    expect(getByText(/5.*unmatched/)).toBeTruthy();

    fireEvent.click(getByText('Run'));
    expect(runInConsoleMock).toHaveBeenCalledWith('SELECT … JOIN …');
  });

  it('shows the operation error rather than hanging', async () => {
    analystCoreMock.mockReturnValue({
      call: vi.fn().mockResolvedValue({ ok: false, code: 'sql_error', message: 'boom' }),
    });
    const { findByText } = render(<JoinCoveragePanel edge={EDGE} />);
    expect(await findByText('boom')).toBeTruthy();
  });
});
