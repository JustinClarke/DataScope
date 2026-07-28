import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { RunSqlButton } from './RunSqlButton';
import * as runPath from '../../services/runPath';

vi.mock('../../services/runPath', () => ({ runInConsole: vi.fn() }));

describe('RunSqlButton', () => {
  beforeEach(() => {
    vi.mocked(runPath.runInConsole).mockReset();
  });

  it('sends its exact SQL to the console on click', () => {
    const { container } = render(<RunSqlButton sql="SELECT * FROM orders" />);
    fireEvent.click(within(container).getByRole('button', { name: /run/i }));

    expect(runPath.runInConsole).toHaveBeenCalledWith('SELECT * FROM orders');
  });

  it('is disabled with nothing to run', () => {
    const { container } = render(<RunSqlButton sql="   " />);
    expect((within(container).getByRole('button', { name: /run/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
