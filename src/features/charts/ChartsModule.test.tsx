import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ChartsModule } from './ChartsModule';
import { useDatasetsStore } from '../../stores/datasets';
import { useUIStore } from '../../stores/ui';
import type { ClassifiedColumn, TableRegistryEntry } from '../../types';

function col(semanticType: ClassifiedColumn['semanticType'], name: string): ClassifiedColumn {
  return {
    name,
    physicalType: semanticType === 'Temporal' ? 'DATE' : 'DOUBLE',
    semanticType,
    cardinality: 10,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
  };
}

function table(columns: ClassifiedColumn[]): TableRegistryEntry {
  return {
    id: 'tbl-1',
    tableName: 'orders',
    datasetId: 'ds-1',
    origin: 'file',
    rowCount: 100,
    columnCount: columns.length,
    memoryBytes: 1024,
    createdAt: '2026-07-19T00:00:00.000Z',
    columns,
  };
}

describe('ChartsModule — D68d internal chart tabs', () => {
  beforeEach(() => {
    useDatasetsStore.setState({ tables: [], datasets: [], workerStatus: 'idle', workerError: null });
    useUIStore.setState({ activeModule: 'charts', activeTabId: null });
  });

  it('renders an empty state when no chart capability is legal', () => {
    useDatasetsStore.setState({ tables: [table([col('Identifier', 'id'), col('Textual', 'note')])] });
    const { container } = render(<ChartsModule />);
    expect(container.textContent).toContain('No chart type is available');
    expect(container.querySelector('[role="tab"]')).toBeNull();
  });

  it('shows only broker-eligible tabs and auto-selects the first eligible one', () => {
    // Categorical + Quantitative, no Temporal — time series is illegal, distribution/categorical are not.
    useDatasetsStore.setState({ tables: [table([col('Categorical', 'status'), col('Quantitative', 'amount')])] });
    const { container } = render(<ChartsModule />);

    const tabs = Array.from(container.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
    expect(tabs).toEqual(['Distribution', 'Categorical']);
    // First eligible tab (Distribution, TABS order) is auto-selected.
    expect(container.querySelector('[aria-label="Bin count"]')).not.toBeNull();
  });

  it('honors a requested tab (activeTabId) on arrival when it is eligible', () => {
    useDatasetsStore.setState({
      tables: [table([col('Temporal', 'date'), col('Quantitative', 'amount'), col('Categorical', 'status')])],
    });
    useUIStore.setState({ activeModule: 'charts', activeTabId: 'categorical' });

    const { container } = render(<ChartsModule />);
    expect(container.querySelector('[aria-label="Categorical column"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Value column"]')).toBeNull();
  });

  it('falls back to the first eligible tab when the requested one is not legal for this data', () => {
    useDatasetsStore.setState({ tables: [table([col('Categorical', 'status'), col('Quantitative', 'amount')])] });
    // A ranked action requested time-series, but this data can't do it.
    useUIStore.setState({ activeModule: 'charts', activeTabId: 'time-series' });

    const { container } = render(<ChartsModule />);
    expect(container.querySelector('[aria-label="Bin count"]')).not.toBeNull();
  });

  it('never reverts a manual tab switch when capabilities recompute unchanged', () => {
    const t = table([col('Temporal', 'date'), col('Quantitative', 'amount'), col('Categorical', 'status')]);
    useDatasetsStore.setState({ tables: [t] });
    useUIStore.setState({ activeModule: 'charts', activeTabId: 'time-series' });

    const { container, rerender } = render(<ChartsModule />);
    expect(container.querySelector('[aria-label="Value column"]')).not.toBeNull(); // time-series applied

    const distributionTab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) => el.textContent === 'Distribution')!;
    fireEvent.click(distributionTab);
    expect(container.querySelector('[aria-label="Bin count"]')).not.toBeNull();

    // Tables array gets a new reference (e.g. a table rename lands) but the
    // same eligible set — capabilities recomputes; the manual pick must survive.
    useDatasetsStore.setState({ tables: [{ ...t }] });
    rerender(<ChartsModule />);
    expect(container.querySelector('[aria-label="Bin count"]')).not.toBeNull();
  });
});
