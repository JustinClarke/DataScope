import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent, within, act } from '@testing-library/react';
import { ExplorerPanel } from './ExplorerPanel';
import { EducationalPanelProvider } from '../../app/EducationalPanelContext';
import { useDatasetsStore } from '../../stores/datasets';
import { useTabsStore } from '../../stores/tabs';
import { useSelectionStore } from '../../stores/selection';
import { useRelationshipsStore } from '../../stores/relationships';
import { useInferredEdgesStore } from '../../stores/inferredEdges';
import * as ingestion from '../../services/ingestion';
import type { Dataset, TableRegistryEntry } from '../../types';

vi.mock('../../services/ingestion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/ingestion')>();
  return {
    ...actual,
    removeTable: vi.fn().mockResolvedValue(undefined),
    refreshTableFromSource: vi.fn().mockResolvedValue({ bytesAccumulated: 0, sizeTier: 'ok', usedRelay: false }),
  };
});

// The rail's column disclosure (TableList.tsx) now loads per-column stats the
// way ProfileDashboard does — reaches a real DuckDB-Wasm worker, not available
// under jsdom — and reads the educational-panel context for "Show SQL". Mocked
// out the same way TableList.test.tsx does.
vi.mock('../../services/profiling', () => ({
  loadTableCardStats: vi.fn(async () => ({})),
}));

// The S2 Data Quality & Health panel (DataQualityPanel.tsx) loads its own
// dataset-wide report, also reaching the real DuckDB-Wasm engine — mocked out
// the same way, with its own dedicated test coverage in DataQualityPanel.test.tsx.
const { loadDatasetQualityReportMock } = vi.hoisted(() => ({ loadDatasetQualityReportMock: vi.fn() }));
vi.mock('../../services/dataQuality', () => ({
  loadDatasetQualityReport: loadDatasetQualityReportMock,
}));
loadDatasetQualityReportMock.mockResolvedValue({ warnings: [], passedRules: [] });

function renderExplorerPanel() {
  return render(
    <EducationalPanelProvider>
      <ExplorerPanel />
    </EducationalPanelProvider>,
  );
}

const dataset: Dataset = {
  id: 'ds-1',
  name: 'demo',
  sourceType: 'sample',
  tableNames: ['customers'],
  ingestedAt: new Date().toISOString(),
};

const customers: TableRegistryEntry = {
  id: 't-customers',
  tableName: 'customers',
  datasetId: 'ds-1',
  origin: 'sample',
  rowCount: 10,
  columnCount: 2,
  memoryBytes: 100,
  createdAt: dataset.ingestedAt,
};

const apiTable: TableRegistryEntry = {
  ...customers,
  id: 't-api',
  tableName: 'api_table',
  origin: 'api',
  sourceUrl: 'https://api.example.com/data',
};

function resetStores() {
  useDatasetsStore.setState({ tables: [], datasets: [], workerStatus: 'idle', workerError: null });
  useTabsStore.setState({ tabs: [], activeTabId: null });
  useSelectionStore.setState({ selectedTableId: null, selectedColumn: null });
  useRelationshipsStore.setState({ removed: [], repointed: {}, added: [] });
  useInferredEdgesStore.setState({ edges: [] });
}

describe('ExplorerPanel (W2, D71)', () => {
  it('shows the Explorer header with a live table/row count (V3)', () => {
    resetStores();
    useDatasetsStore.getState().registerDataset(dataset, [customers]);

    const { getByText, rerender } = renderExplorerPanel();
    expect(getByText('Explorer')).toBeTruthy();
    expect(getByText('1 table · 10 rows')).toBeTruthy();

    const orders: TableRegistryEntry = { ...customers, id: 't-orders', tableName: 'orders', rowCount: 5 };
    useDatasetsStore.getState().registerDataset({ ...dataset, id: 'ds-2' }, [orders]);
    rerender(
      <EducationalPanelProvider>
        <ExplorerPanel />
      </EducationalPanelProvider>,
    );

    expect(getByText('2 tables · 15 rows')).toBeTruthy();
  });

  it('clicking a table row expands it first (VS Code-style disclosure), then selects it and opens a profile tab on a second click (D68d)', () => {
    resetStores();
    useDatasetsStore.getState().registerDataset(dataset, [customers]);

    const { container } = renderExplorerPanel();
    const nameEl = within(container).getByText('customers');

    fireEvent.click(nameEl);
    expect(useSelectionStore.getState().selectedTableId).toBeNull();
    expect(useTabsStore.getState().tabs).toHaveLength(0);

    fireEvent.click(nameEl);
    expect(useSelectionStore.getState().selectedTableId).toBe('t-customers');
    const tabs = useTabsStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].type).toBe('profile');
    expect(tabs[0].subject).toBe('t-customers');
  });

  it('clicking remove calls removeTable with the table id', () => {
    resetStores();
    useDatasetsStore.getState().registerDataset(dataset, [customers]);

    const { container } = renderExplorerPanel();
    fireEvent.click(container.querySelector('button[aria-label="Remove customers"]')!);

    expect(ingestion.removeTable).toHaveBeenCalledWith('t-customers');
  });

  it('clicking refresh calls refreshTableFromSource with the table id', () => {
    resetStores();
    useDatasetsStore.getState().registerDataset(dataset, [apiTable]);

    const { container } = renderExplorerPanel();
    fireEvent.click(container.querySelector('button[aria-label="Refresh api_table from source"]')!);

    expect(ingestion.refreshTableFromSource).toHaveBeenCalledWith('t-api');
  });

  it('the "+" header button opens a real ingestion tab (S1, closes W2\'s Add-data deferral)', () => {
    resetStores();
    useDatasetsStore.getState().registerDataset(dataset, [customers]);

    const { container } = renderExplorerPanel();
    fireEvent.click(within(container).getByTestId('explorer-add-data'));

    const tabs = useTabsStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].type).toBe('ingestion');
  });

  it('mounts the Data Quality & Health panel beneath the table list, each owning its own scroll region (S2)', () => {
    resetStores();
    useDatasetsStore.getState().registerDataset(dataset, [customers]);

    const { container } = renderExplorerPanel();
    const qualityPanel = within(container).getByTestId('data-quality-panel');
    const tableListWrapper = qualityPanel.previousElementSibling;

    expect(tableListWrapper).not.toBeNull();
    expect(tableListWrapper?.contains(within(container).getByText('customers'))).toBe(true);
    expect(tableListWrapper?.className).toContain('overflow-y-auto');
    expect(qualityPanel.className).toContain('overflow-y-auto');
    expect(tableListWrapper).not.toBe(qualityPanel);
  });

  describe('rail edges (S1) — reads the mirrored inferred-edges store, override-applied', () => {
    const customersWithColumns: TableRegistryEntry = {
      ...customers,
      columns: [{ name: 'id', semanticType: 'Identifier', physicalType: 'VARCHAR', cardinality: 10, nullPercentage: 0, min: null, max: null, mean: null, stdDev: null }],
    };
    const ordersWithColumns: TableRegistryEntry = {
      ...customers,
      id: 't-orders',
      tableName: 'orders',
      columns: [{ name: 'customer_id', semanticType: 'Categorical', physicalType: 'VARCHAR', cardinality: 10, nullPercentage: 0, min: null, max: null, mean: null, stdDev: null }],
    };

    it('marks a column FK once an edge is added via useRelationshipsStore — no second loadRelationships call needed', () => {
      resetStores();
      useDatasetsStore.getState().registerDataset(dataset, [customersWithColumns, ordersWithColumns]);

      const { container } = renderExplorerPanel();
      fireEvent.click(within(container).getByTestId('trow-chevron-t-orders'));
      expect(within(container).getByTestId('trow-column-t-orders-customer_id').dataset.key).toBeUndefined();

      act(() => {
        useRelationshipsStore.getState().addEdge('orders', 'customer_id', 'customers', 'id');
      });

      expect(within(container).getByTestId('trow-column-t-orders-customer_id').dataset.key).toBe('fk');
      // Proves the marker came from the override, not a second fetch: the raw
      // inferred-edges store this component reads was never populated.
      expect(useInferredEdgesStore.getState().edges).toEqual([]);
    });
  });
});
