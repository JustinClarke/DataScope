import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { TitleBar } from './TitleBar';
import { useDatasetsStore } from '../stores/datasets';
import { usePaletteOpenStore } from '../stores/paletteOpen';
import type { Dataset, TableRegistryEntry } from '../types';

function dataset(overrides: Partial<Dataset> & Pick<Dataset, 'id' | 'name'>): Dataset {
  return {
    sourceType: 'file',
    tableNames: [],
    ingestedAt: new Date().toISOString(),
    ...overrides,
  };
}

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
  useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
  usePaletteOpenStore.setState({ open: false });
});
afterEach(() => cleanup());

describe('TitleBar (V2, §13.3)', () => {
  it('renders the wordmark', () => {
    const { getByText } = render(<TitleBar onOpenSettings={vi.fn()} />);
    expect(getByText('Data')).toBeTruthy();
    expect(getByText('Scope')).toBeTruthy();
  });

  it("shows the single dataset's name and table count when exactly one dataset is loaded", () => {
    useDatasetsStore.setState({
      datasets: [dataset({ id: 'ds-1', name: 'movielens' })],
      tables: [table({ id: 't-a', tableName: 'ratings' }), table({ id: 't-b', tableName: 'movies' })],
    });
    const { getByText } = render(<TitleBar onOpenSettings={vi.fn()} />);
    expect(getByText('movielens · 2 tables')).toBeTruthy();
  });

  it('falls back to a plain table count with no datasets loaded', () => {
    const { getByText } = render(<TitleBar onOpenSettings={vi.fn()} />);
    expect(getByText('0 tables')).toBeTruthy();
  });

  it('falls back to a plain table count once a second dataset is loaded', () => {
    useDatasetsStore.setState({
      datasets: [dataset({ id: 'ds-1', name: 'movielens' }), dataset({ id: 'ds-2', name: 'orders' })],
      tables: [table({ id: 't-a', tableName: 'ratings' })],
    });
    const { getByText, queryByText } = render(<TitleBar onOpenSettings={vi.fn()} />);
    expect(getByText('1 tables')).toBeTruthy();
    expect(queryByText(/movielens/)).toBeNull();
  });

  it('clicking the gear calls onOpenSettings', () => {
    const onOpenSettings = vi.fn();
    const { getByLabelText } = render(<TitleBar onOpenSettings={onOpenSettings} />);
    fireEvent.click(getByLabelText('Settings'));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('clicking the ⌘K button flips the shared palette-open state', () => {
    const { getByTestId } = render(<TitleBar onOpenSettings={vi.fn()} />);
    expect(usePaletteOpenStore.getState().open).toBe(false);
    fireEvent.click(getByTestId('title-bar-palette-button'));
    expect(usePaletteOpenStore.getState().open).toBe(true);
  });
});
