import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HistoryTab } from './HistoryTab';
import { useQueryStore, CONSOLE_SESSION, EMPTY_SESSION } from '../../stores/query';
import * as runPath from '../../services/runPath';

vi.mock('../../services/runPath', async () => {
  const actual = await vi.importActual<typeof runPath>('../../services/runPath');
  return { ...actual, runInConsole: vi.fn() };
});

describe('HistoryTab (S6.7)', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.mocked(runPath.runInConsole).mockReset();
    useQueryStore.setState({
      sessions: { [CONSOLE_SESSION]: { ...EMPTY_SESSION } },
      history: [
        {
          id: 'h-1',
          sql: 'SELECT * FROM orders',
          executedAt: '2026-07-29T00:00:00.000Z',
          result: {
            columnNames: ['id'],
            columnTypes: ['INTEGER'],
            rows: [[1]],
            rowCount: 1,
            executionTimeMs: 4,
          },
        },
        { id: 'h-2', sql: 'SELECT nope', executedAt: '2026-07-29T00:00:01.000Z', error: 'no such column' },
      ],
      lastRunSession: CONSOLE_SESSION,
    });
  });

  it('renders the session log the drawer used to hide behind a disclosure', () => {
    render(<HistoryTab />);
    expect(screen.getByText('SELECT * FROM orders')).toBeTruthy();
    expect(screen.getByText('SELECT nope')).toBeTruthy();
    expect(screen.getByText('error')).toBeTruthy();
  });

  // The whole point of the promotion: re-running goes down the one guarded run
  // path (S4) into the console, where the drawer's Info shows the result.
  it('re-runs a row through runInConsole, with no history-specific path', () => {
    render(<HistoryTab />);
    fireEvent.click(screen.getAllByRole('button', { name: /run/i })[0]);
    expect(runPath.runInConsole).toHaveBeenCalledWith('SELECT * FROM orders');
  });

  it('says so plainly when nothing has run yet', () => {
    useQueryStore.setState({ history: [] });
    render(<HistoryTab />);
    expect(screen.getByText('No statements run yet this session.')).toBeTruthy();
  });
});
