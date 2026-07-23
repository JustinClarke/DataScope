import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { StatusConsole } from './StatusConsole';
import { useDatasetsStore } from '../stores/datasets';
import { useQueryStore } from '../stores/query';
import type { TableRegistryEntry } from '../types';

describe('StatusConsole', () => {
  beforeEach(() => {
    useDatasetsStore.setState({
      tables: [],
      datasets: [],
      workerStatus: 'idle',
      workerError: null,
    });
    useQueryStore.setState({ sql: '', status: 'idle', result: null, error: null, history: [], charts: [] });
  });

  it('shows zero tables and zero rows when no data is present', () => {
    const { container } = render(<StatusConsole />);

    expect(container.textContent).toContain('0 tables × 0 rows');
  });

  it('reflects correct table count and row count', () => {
    const mockTables: TableRegistryEntry[] = [
      {
        id: 'table-1',
        tableName: 'table1',
        datasetId: 'dataset-1',
        origin: 'file',
        rowCount: 100,
        columnCount: 5,
        memoryBytes: 2048,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'table-2',
        tableName: 'table2',
        datasetId: 'dataset-1',
        origin: 'file',
        rowCount: 200,
        columnCount: 3,
        memoryBytes: 4096,
        createdAt: new Date().toISOString(),
      },
    ];

    useDatasetsStore.setState({ tables: mockTables });
    const { container } = render(<StatusConsole />);

    expect(container.textContent).toContain('2 tables × 300 rows');
  });

  it('displays total memory correctly', () => {
    const mockTable: TableRegistryEntry = {
      id: 'table-1',
      tableName: 'test_table',
      datasetId: 'dataset-1',
      origin: 'file',
      rowCount: 100,
      columnCount: 5,
      memoryBytes: 1024 * 1024, // 1 MB
      createdAt: new Date().toISOString(),
    };

    useDatasetsStore.setState({ tables: [mockTable] });
    const { container } = render(<StatusConsole />);

    expect(container.textContent).toContain('1 MB total');
  });

  it('reflects idle worker status', () => {
    useDatasetsStore.setState({ workerStatus: 'idle' });
    const { container } = render(<StatusConsole />);

    expect(container.textContent).toContain('Web Worker: Idle');
  });

  it('reflects ready worker status', () => {
    useDatasetsStore.setState({ workerStatus: 'ready' });
    const { container } = render(<StatusConsole />);

    expect(container.textContent).toContain('Web Worker: Ready');
  });

  it('reflects loading worker status', () => {
    useDatasetsStore.setState({ workerStatus: 'loading' });
    const { container } = render(<StatusConsole />);

    expect(container.textContent).toContain('Web Worker: Loading');
  });

  it('reflects compiling worker status', () => {
    useDatasetsStore.setState({ workerStatus: 'compiling' });
    const { container } = render(<StatusConsole />);

    expect(container.textContent).toContain('Web Worker: Compiling');
  });

  it('reflects error worker status', () => {
    useDatasetsStore.setState({ workerStatus: 'error' });
    const { container } = render(<StatusConsole />);

    expect(container.textContent).toContain('Web Worker: Error');
  });

  it('shows placeholder values for duckdb version and query time', () => {
    const { container } = render(<StatusConsole />);

    expect(container.textContent).toContain('DuckDB v—');
    expect(container.textContent).toContain('query — ms');
  });

  it('shows the executed query timing once a query succeeds', () => {
    useQueryStore.getState().queryStarted('SELECT 1');
    useQueryStore.getState().querySucceeded({
      columnNames: ['n'],
      columnTypes: ['BIGINT'],
      rows: [[1]],
      rowCount: 1,
      executionTimeMs: 12.4,
    });

    const { container } = render(<StatusConsole />);
    expect(container.textContent).toContain('query 12 ms');
  });

  it('shows a running indicator while a query is in flight', () => {
    useQueryStore.getState().queryStarted('SELECT 1');

    const { container } = render(<StatusConsole />);
    expect(container.textContent).toContain('query running…');
  });
});
