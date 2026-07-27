import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { StatusBar } from './StatusBar';
import { useDatasetsStore } from '../../stores/datasets';
import { useQueryStore } from '../../stores/query';
import { useSettingsStore } from '../../stores/settings';
import { usePauseSignalStore } from '../../stores/pauseSignal';
import type { TableRegistryEntry } from '../../types';

function table(overrides: Partial<TableRegistryEntry> & Pick<TableRegistryEntry, 'id' | 'tableName'>): TableRegistryEntry {
  return {
    datasetId: 'ds-1',
    origin: 'sample',
    rowCount: 10,
    columnCount: 1,
    memoryBytes: 1024,
    createdAt: new Date().toISOString(),
    columns: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  useDatasetsStore.setState({ tables: [], datasets: [], workerStatus: 'idle', workerError: null });
  useQueryStore.setState({ sql: '', status: 'idle', result: null, error: null, history: [], charts: [] });
  useSettingsStore.setState({ aiMode: null });
  usePauseSignalStore.setState({ lastPaused: null });
});
afterEach(() => cleanup());

describe('StatusBar — ambient items (W7, §13.3 density budget)', () => {
  it('shows a green "nothing leaves" posture dot outside cloud mode', () => {
    useSettingsStore.setState({ aiMode: 'local-model' });
    const { getByText } = render(<StatusBar />);
    expect(getByText('nothing leaves')).toBeTruthy();
  });

  it('shows an amber "may leave your browser" posture dot in cloud mode', () => {
    useSettingsStore.setState({ aiMode: 'cloud' });
    const { getByText } = render(<StatusBar />);
    expect(getByText('may leave your browser')).toBeTruthy();
  });

  it('halos the posture dot with --color-ok locally and --color-active in cloud mode (V3)', () => {
    useSettingsStore.setState({ aiMode: 'local-model' });
    const { container, rerender } = render(<StatusBar />);
    const dot = () => container.querySelector('[aria-hidden="true"]') as HTMLElement;

    expect(dot().getAttribute('style')).toContain('--color-ok');

    useSettingsStore.setState({ aiMode: 'cloud' });
    rerender(<StatusBar />);
    expect(dot().getAttribute('style')).toContain('--color-active');
  });

  it('shows the engine state', () => {
    useDatasetsStore.setState({ workerStatus: 'compiling' });
    const { getByText } = render(<StatusBar />);
    expect(getByText('Engine: Compiling')).toBeTruthy();
  });

  it('shows table/row stats and total memory', () => {
    useDatasetsStore.setState({
      tables: [table({ id: 't-a', tableName: 'orders', rowCount: 100, memoryBytes: 2048 })],
    });
    const { getByText } = render(<StatusBar />);
    expect(getByText('1 table × 100 rows')).toBeTruthy();
    expect(getByText('2 KB')).toBeTruthy();
  });

  it('shows the last query timing on success, and a placeholder otherwise', () => {
    const { getByText, rerender } = render(<StatusBar />);
    expect(getByText('query — ms')).toBeTruthy();

    useQueryStore.setState({
      status: 'success',
      result: { columnNames: [], columnTypes: [], rows: [], rowCount: 0, executionTimeMs: 42 },
    });
    rerender(<StatusBar />);
    expect(getByText('query 42 ms')).toBeTruthy();
  });

  it('renders a paused notice only when usePauseSignalStore.lastPaused is set', () => {
    const { queryByRole, rerender } = render(<StatusBar />);
    expect(queryByRole('status')).toBeNull();

    usePauseSignalStore.setState({ lastPaused: { surface: 'vault', at: new Date().toISOString() } });
    rerender(<StatusBar />);
    expect(queryByRole('status')?.textContent).toContain('Paused (vault)');
  });
});
