import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { VerdictBand } from './VerdictBand';
import type { Dataset, FactRef, TableRegistryEntry } from '../../types';

function table(id: string, tableName: string, rowCount: number): TableRegistryEntry {
  return {
    id,
    tableName,
    datasetId: 'd1',
    origin: 'sample',
    rowCount,
    columnCount: 2,
    memoryBytes: 1000,
    createdAt: new Date().toISOString(),
  };
}

const orders = table('o', 'orders', 120);
const customers = table('c', 'customers', 80);
const dataset: Dataset = {
  id: 'd1',
  name: 'orders.csv',
  sourceType: 'file',
  tableNames: ['orders', 'customers'],
  ingestedAt: new Date().toISOString(),
};
const headline: FactRef = {
  statement: '2 tables, 200 rows total — no single dominant finding.',
  sql: '',
  snapshot: dataset.ingestedAt,
  confidence: 'high',
  provenance: 'schema',
};

describe('VerdictBand', () => {
  afterEach(() => cleanup());

  it('shows a profiling placeholder when no baseline is available yet', () => {
    const { getByText, queryByTestId } = render(
      <VerdictBand
        tables={[orders, customers]}
        datasets={[dataset]}
        baseline={null}
        tailored={false}
        paused={false}
        headlineFact={null}
      />,
    );
    expect(getByText(/Profiling/)).toBeTruthy();
    expect(queryByTestId('verdict-band-headline')).toBeNull();
  });

  it('renders dataset identity (table/row counts) and the headline once a baseline exists', () => {
    const { getByTestId } = render(
      <VerdictBand
        tables={[orders, customers]}
        datasets={[dataset]}
        baseline={{ headlineFact: headline, actions: [] }}
        tailored={false}
        paused={false}
        headlineFact={null}
      />,
    );
    expect(getByTestId('verdict-band').textContent).toContain('2 tables');
    expect(getByTestId('verdict-band').textContent).toContain('200');
    expect(getByTestId('verdict-band-headline').textContent).toBe(headline.statement);
  });

  it('prefers the AI-upgraded headline over the deterministic baseline, and shows the tailored badge', () => {
    const aiHeadline: FactRef = { ...headline, statement: 'Re-phrased by the edge.' };
    const { getByTestId, getByText } = render(
      <VerdictBand
        tables={[orders, customers]}
        datasets={[dataset]}
        baseline={{ headlineFact: headline, actions: [] }}
        tailored={true}
        paused={false}
        headlineFact={aiHeadline}
      />,
    );
    expect(getByTestId('verdict-band-headline').textContent).toBe(aiHeadline.statement);
    expect(getByText('Tailored to your data')).toBeTruthy();
  });

  it('shows the paused badge when the edge is down, without hiding the deterministic headline', () => {
    const { getByTestId, getByText } = render(
      <VerdictBand
        tables={[orders, customers]}
        datasets={[dataset]}
        baseline={{ headlineFact: headline, actions: [] }}
        tailored={false}
        paused={true}
        headlineFact={null}
      />,
    );
    expect(getByTestId('verdict-band-headline').textContent).toBe(headline.statement);
    expect(getByText('Cloud features paused')).toBeTruthy();
  });
});
