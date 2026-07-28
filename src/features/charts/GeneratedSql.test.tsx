// One parameterised test for the four per-module `GeneratedSql` copies (S4).
// The panels stay four deliberate copies — a choice about each module's layout
// — but the run action inside them is one shared component, so the assertion
// that every chart can run its own query belongs in one place too.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { GeneratedSql as TimeSeriesGeneratedSql } from './time-series/GeneratedSql';
import { GeneratedSql as CorrelationGeneratedSql } from './correlation/GeneratedSql';
import { GeneratedSql as DistributionGeneratedSql } from './distribution/GeneratedSql';
import { GeneratedSql as CategoricalGeneratedSql } from './categorical/GeneratedSql';
import * as runPath from '../../services/runPath';

vi.mock('../../services/runPath', () => ({ runInConsole: vi.fn() }));

const SQL = 'SELECT day, revenue FROM orders';

const panels = [
  ['time-series', () => <TimeSeriesGeneratedSql sql={SQL} />],
  ['correlation', () => <CorrelationGeneratedSql sql={SQL} />],
  ['distribution', () => <DistributionGeneratedSql label="Histogram" sql={SQL} />],
  ['categorical', () => <CategoricalGeneratedSql label="Value frequencies" sql={SQL} />],
] as const;

describe('the chart modules\' Generated SQL panels', () => {
  beforeEach(() => {
    vi.mocked(runPath.runInConsole).mockReset();
  });

  it.each(panels)('%s runs its query in the console', (_name, panel) => {
    const { container } = render(panel());

    fireEvent.click(within(container).getByRole('button', { name: /run/i }));
    expect(runPath.runInConsole).toHaveBeenCalledWith(SQL);
  });

  it.each(panels)('%s keeps its Copy SQL affordance', (_name, panel) => {
    const { container } = render(panel());
    expect(within(container).getByRole('button', { name: /copy sql/i })).toBeTruthy();
  });
});
