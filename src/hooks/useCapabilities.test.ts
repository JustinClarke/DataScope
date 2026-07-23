import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCapabilities } from './useCapabilities';
import { useDatasetsStore } from '../stores/datasets';
import type { ClassifiedColumn, Dataset, TableRegistryEntry } from '../types';

function col(semanticType: ClassifiedColumn['semanticType'], name: string): ClassifiedColumn {
  return {
    name,
    physicalType: 'DOUBLE',
    semanticType,
    cardinality: 10,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
  };
}

const dataset: Dataset = {
  id: 'ds-1',
  name: 'titanic.csv',
  sourceType: 'file',
  tableNames: ['titanic'],
  ingestedAt: '2026-07-19T00:00:00.000Z',
};

function table(columns: ClassifiedColumn[] | undefined, tableName = 'titanic', id = 'tbl-1'): TableRegistryEntry {
  return {
    id,
    tableName,
    datasetId: 'ds-1',
    origin: 'file',
    rowCount: 891,
    columnCount: columns?.length ?? 0,
    memoryBytes: 4096,
    createdAt: '2026-07-19T00:00:00.000Z',
    columns,
  };
}

beforeEach(() => {
  useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
});

describe('useCapabilities', () => {
  it('returns every flag off with no registered tables', () => {
    const { result } = renderHook(() => useCapabilities());
    expect(result.current.canDoDescriptiveStats).toBe(false);
    expect(result.current.numericColumns).toEqual([]);
  });

  it('reflects the current table on first render', () => {
    useDatasetsStore.getState().registerDataset(dataset, [table([col('Quantitative', 'Fare'), col('Temporal', 'Date')])]);

    const { result } = renderHook(() => useCapabilities());
    expect(result.current.canDoTimeSeries).toBe(true);
    expect(result.current.canDoCorrelation).toBe(false);
  });

  it('re-evaluates when a new table is ingested', () => {
    useDatasetsStore.getState().registerDataset(dataset, [table([col('Quantitative', 'Fare')])]);

    const { result } = renderHook(() => useCapabilities());
    expect(result.current.canDoCorrelation).toBe(false);

    act(() => {
      useDatasetsStore.getState().registerDataset(
        { ...dataset, id: 'ds-2', name: 'weather.csv' },
        [table([col('Quantitative', 'temp')], 'weather', 'tbl-2')],
      );
    });

    expect(result.current.canDoCorrelation).toBe(true);
    expect(result.current.numericColumns).toEqual(['titanic.Fare', 'weather.temp']);
  });

  it('re-evaluates when a manual reclassification changes a column', () => {
    useDatasetsStore.getState().registerDataset(dataset, [table([col('Categorical', 'Pclass')])]);

    const { result } = renderHook(() => useCapabilities());
    expect(result.current.canDoDescriptiveStats).toBe(false);

    act(() => {
      useDatasetsStore.getState().reclassifyColumn('tbl-1', 'Pclass', 'Quantitative');
    });

    expect(result.current.canDoDescriptiveStats).toBe(true);
  });

  it('re-evaluates when a table is dropped', () => {
    useDatasetsStore.getState().registerDataset(dataset, [table([col('Quantitative', 'Fare')])]);

    const { result } = renderHook(() => useCapabilities());
    expect(result.current.canDoDescriptiveStats).toBe(true);

    act(() => {
      useDatasetsStore.getState().removeTable('tbl-1');
    });

    expect(result.current.canDoDescriptiveStats).toBe(false);
  });

  it('keeps the same object reference across an unrelated re-render', () => {
    useDatasetsStore.getState().registerDataset(dataset, [table([col('Quantitative', 'Fare')])]);

    const { result, rerender } = renderHook(() => useCapabilities());
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });
});
