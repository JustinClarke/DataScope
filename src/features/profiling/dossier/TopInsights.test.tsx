import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { TopInsights } from './TopInsights';

const { runInConsoleMock } = vi.hoisted(() => ({ runInConsoleMock: vi.fn() }));
vi.mock('../../../services/runPath', () => ({ runInConsole: runInConsoleMock }));

const insight = {
  tableName: 'orders',
  description: '412 fully duplicated rows detected.',
  rule: 'duplicates' as const,
  sql: 'SELECT * FROM orders',
};

describe('TopInsights', () => {
  it('renders nothing with no insights', () => {
    const { container } = render(<TopInsights insights={[]} onShowSql={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('runs an insight\'s query in the console (S4), beside its Show SQL', () => {
    runInConsoleMock.mockReset();
    const { container } = render(<TopInsights insights={[insight]} onShowSql={vi.fn()} />);

    fireEvent.click(within(container).getByRole('button', { name: /^run$/i }));
    expect(runInConsoleMock).toHaveBeenCalledWith('SELECT * FROM orders');
    expect(within(container).getByText('Show SQL')).toBeTruthy();
  });
});
