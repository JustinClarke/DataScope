import { describe, it, expect, beforeEach } from 'vitest';
import { render, within } from '@testing-library/react';
import { PivotModule } from './PivotModule';
import { useQueryStore, CONSOLE_SESSION, PIVOT_SESSION } from '../../stores/query';
import { useDatasetsStore } from '../../stores/datasets';

// S5: Pivot's own results home. `PivotBuilder`'s own behaviour is covered in
// PivotBuilder.test.tsx; what is asserted here is only the session boundary.
describe('PivotModule', () => {
  beforeEach(() => {
    useQueryStore.setState({ sessions: {}, history: [], lastRunSession: CONSOLE_SESSION });
    useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
  });

  it('renders its own session’s results, never the console’s', () => {
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, 'select 1');
    useQueryStore.getState().queryFailed(CONSOLE_SESSION, 'console blew up');
    useQueryStore.getState().queryStarted(PIVOT_SESSION, 'select 2');
    useQueryStore.getState().queryFailed(PIVOT_SESSION, 'pivot blew up');

    const { container } = render(<PivotModule />);

    expect(within(container).getByRole('alert').textContent).toContain('pivot blew up');
    expect(container.textContent).not.toContain('console blew up');
  });

  it('carries no History list — that log is the console’s', () => {
    const { container } = render(<PivotModule />);
    expect(container.textContent).not.toContain('History');
  });
});
