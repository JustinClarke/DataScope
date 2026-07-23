import { describe, expect, it, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import { ColumnCard } from './ColumnCard';
import type { ColumnCardStats } from '../../services/profiling';
import type { ClassifiedColumn } from '../../types';

function column(overrides: Partial<ClassifiedColumn> & Pick<ClassifiedColumn, 'name' | 'semanticType'>): ClassifiedColumn {
  return {
    physicalType: 'VARCHAR',
    cardinality: 0,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
    ...overrides,
  };
}

// Queries are scoped to each test's own `container` rather than the global
// `screen` — no RTL auto-cleanup is configured in vitest.config.ts, matching
// the rest of this test suite's convention (see IngestionPanel.test.tsx).

describe('ColumnCard', () => {
  it('shows a loading line while stats are in flight', () => {
    const { container } = render(
      <ColumnCard
        column={column({ name: 'fare', semanticType: 'Quantitative' })}
        stats={undefined}
        onShowSql={vi.fn()}
      />,
    );
    expect(within(container).getByText('Loading…')).toBeTruthy();
  });

  it('renders quantitative min/max/mean/median/std dev and the histogram', () => {
    const stats: ColumnCardStats = {
      kind: 'Quantitative',
      median: 30,
      medianSql: 'SELECT median(...)',
      histogram: [{ rangeStart: 0, rangeEnd: 10, count: 5 }],
      histogramSql: 'SELECT ...',
    };
    const { container } = render(
      <ColumnCard
        column={column({ name: 'fare', semanticType: 'Quantitative', min: '0', max: '512', mean: 32, stdDev: 49 })}
        stats={stats}
        onShowSql={vi.fn()}
      />,
    );
    expect(within(container).getByText('median')).toBeTruthy();
    expect(within(container).getByText('30')).toBeTruthy();
    expect(within(container).getByLabelText('Value distribution histogram')).toBeTruthy();
  });

  it('renders top values as a frequency bar list for categorical', () => {
    const stats: ColumnCardStats = {
      kind: 'Categorical',
      topValues: [
        { value: 'S', count: 644 },
        { value: 'C', count: 168 },
      ],
      sql: 'SELECT ...',
    };
    const { container } = render(
      <ColumnCard column={column({ name: 'Embarked', semanticType: 'Categorical' })} stats={stats} onShowSql={vi.fn()} />,
    );
    expect(within(container).getByText('S')).toBeTruthy();
    expect(within(container).getByText('644')).toBeTruthy();
  });

  it('renders a "No values" fallback for an empty categorical result (100%-null)', () => {
    const stats: ColumnCardStats = { kind: 'Categorical', topValues: [], sql: 'SELECT ...' };
    const { container } = render(
      <ColumnCard
        column={column({ name: 'discount_code', semanticType: 'Categorical', nullPercentage: 100 })}
        stats={stats}
        onShowSql={vi.fn()}
      />,
    );
    expect(within(container).getByText('No values.')).toBeTruthy();
    expect(within(container).getByText('100.0% null')).toBeTruthy();
  });

  it('renders earliest/latest and gap description for temporal', () => {
    const stats: ColumnCardStats = {
      kind: 'Temporal',
      range: { earliest: '2023-01-01', latest: '2023-12-31', gapDescription: 'No gaps detected' },
      sql: 'SELECT ...',
    };
    const { container } = render(
      <ColumnCard column={column({ name: 'order_date', semanticType: 'Temporal' })} stats={stats} onShowSql={vi.fn()} />,
    );
    expect(within(container).getByText('2023-01-01')).toBeTruthy();
    expect(within(container).getByText('No gaps detected')).toBeTruthy();
  });

  it('renders a "No dates" fallback when a temporal column has no non-null values', () => {
    const stats: ColumnCardStats = { kind: 'Temporal', range: null, sql: 'SELECT ...' };
    const { container } = render(
      <ColumnCard
        column={column({ name: 'order_date', semanticType: 'Temporal', nullPercentage: 100 })}
        stats={stats}
        onShowSql={vi.fn()}
      />,
    );
    expect(within(container).getByText('No dates.')).toBeTruthy();
  });

  it('renders avg word count and sample preview for textual', () => {
    const stats: ColumnCardStats = {
      kind: 'Textual',
      avgWordCount: 12.4,
      wordCountSql: 'SELECT ...',
      samplePreview: ['a great product'],
      sampleSql: 'SELECT ...',
    };
    const { container } = render(
      <ColumnCard column={column({ name: 'ReviewText', semanticType: 'Textual' })} stats={stats} onShowSql={vi.fn()} />,
    );
    expect(within(container).getByText('12.4')).toBeTruthy();
    expect(within(container).getByText('“a great product”')).toBeTruthy();
  });

  it('renders the exclusion note for an identifier column, no stats needed', () => {
    const { container } = render(
      <ColumnCard column={column({ name: 'row_uuid', semanticType: 'Identifier' })} stats={{ kind: 'Identifier' }} onShowSql={vi.fn()} />,
    );
    expect(within(container).getByText(/excluded from most analysis/)).toBeTruthy();
  });
});
