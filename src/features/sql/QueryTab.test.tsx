import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryTab } from './QueryTab';
import { useQueryStore, CONSOLE_SESSION } from '../../stores/query';
import { useDatasetsStore } from '../../stores/datasets';
import * as sqlService from '../../services/sql';

// Same stub as SqlModule.test.tsx: the real MonacoWrapper needs a browser.
vi.mock('./MonacoWrapper', () => ({
  default: ({ onRunQuery }: { onRunQuery: () => void }) => (
    <button type="button" data-testid="fake-monaco" onClick={onRunQuery}>
      fake editor
    </button>
  ),
}));

vi.mock('../../services/sql', async () => {
  const actual = await vi.importActual<typeof sqlService>('../../services/sql');
  return { ...actual, runQuery: vi.fn() };
});

describe('QueryTab', () => {
  beforeEach(() => {
    useQueryStore.setState({ sessions: {}, history: [], lastRunSession: CONSOLE_SESSION });
    useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
    vi.mocked(sqlService.runQuery).mockReset().mockResolvedValue({
      columnNames: [],
      columnTypes: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
    });
  });

  it('runs its own session, never the console’s', async () => {
    useQueryStore.getState().setSql('tab-1', 'select 1');
    const { container } = render(<QueryTab tabId="tab-1" name="Query 1" />);

    await waitFor(() => expect(within(container).getByTestId('fake-monaco')).toBeTruthy());
    fireEvent.click(within(container).getByRole('button', { name: /run/i }));

    expect(sqlService.runQuery).toHaveBeenCalledWith('select 1', 'tab-1');
  });

  it('disables Run on an empty buffer', () => {
    const { container } = render(<QueryTab tabId="tab-1" name="Query 1" />);
    expect((within(container).getByRole('button', { name: /run/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows its own results, not another session’s', async () => {
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, 'select 99');
    useQueryStore.getState().queryFailed(CONSOLE_SESSION, 'console blew up');

    const { container } = render(<QueryTab tabId="tab-1" name="Query 1" />);
    await waitFor(() => expect(within(container).getByTestId('fake-monaco')).toBeTruthy());

    expect(container.textContent).not.toContain('console blew up');
  });

  it('carries no History list, no suggestions and no export recipe — those are the console’s', async () => {
    useQueryStore.getState().queryStarted('tab-1', 'select 1');
    useQueryStore.getState().querySucceeded('tab-1', {
      columnNames: ['n'],
      columnTypes: ['BIGINT'],
      rows: [[1]],
      rowCount: 1,
      executionTimeMs: 7,
    });

    const { container } = render(<QueryTab tabId="tab-1" name="Query 1" />);
    await waitFor(() => expect(within(container).getByTestId('fake-monaco')).toBeTruthy());

    expect(container.textContent).not.toContain('History');
    expect(within(container).queryByRole('button', { name: /export recipe/i })).toBeNull();
    expect(within(container).queryByRole('button', { name: /pin to tab/i })).toBeNull();
  });

  it('shows the tab’s own name as its heading', () => {
    const { container } = render(<QueryTab tabId="tab-1" name="Orders by month" />);
    expect(within(container).getByRole('heading', { name: 'Orders by month' })).toBeTruthy();
  });
});
