import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, act, within } from '@testing-library/react';
import { TableList } from './TableList';
import { useDatasetsStore } from '../../stores/datasets';
import { useSelectionStore } from '../../stores/selection';
import { useRehydrationStore } from '../../stores/rehydration';
import { EducationalPanelProvider } from '../../app/EducationalPanelContext';
import type { FkEdge } from '../../lib/relationshipInference';
import type { ClassifiedColumn, Dataset, TableRegistryEntry } from '../../types';

// The rail's column disclosure now loads each table's supplemental stats the
// same way ProfileDashboard does (`services/profiling.ts`), which reaches a
// real DuckDB-Wasm worker — not available under jsdom. Mocked to an empty
// map: the `Identifier` card body renders its stats-free text regardless (no
// query needed to classify a column as near-unique), which is all these
// tests assert on.
vi.mock('../../services/profiling', () => ({
  loadTableCardStats: vi.fn(async () => ({})),
}));

function column(overrides: Partial<ClassifiedColumn> & Pick<ClassifiedColumn, 'name' | 'semanticType'>): ClassifiedColumn {
  return {
    physicalType: 'VARCHAR',
    cardinality: 10,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
    ...overrides,
  };
}

function edge(childTable: string, childColumn: string, parentTable: string, parentColumn: string): FkEdge {
  return {
    id: `${childTable}.${childColumn}->${parentTable}.${parentColumn}`,
    childTable,
    childColumn,
    parentTable,
    parentColumn,
    containment: 0.98,
    coverage: 0.9,
    parentKeyUniqueness: 1,
    nameAgreement: true,
    confidence: 'confident',
    confidenceScore: 98,
    evidence: '',
    source: 'inferred',
  };
}

const dataset: Dataset = {
  id: 'ds-1',
  name: 'ecommerce',
  sourceType: 'sample',
  tableNames: ['customers', 'orders'],
  ingestedAt: new Date().toISOString(),
};

const customers: TableRegistryEntry = {
  id: 't-customers',
  tableName: 'customers',
  datasetId: 'ds-1',
  origin: 'sample',
  rowCount: 1234,
  columnCount: 6,
  memoryBytes: 20480,
  createdAt: dataset.ingestedAt,
};

const orders: TableRegistryEntry = {
  id: 't-orders',
  tableName: 'orders',
  datasetId: 'ds-1',
  origin: 'derived',
  rowCount: 8400,
  columnCount: 4,
  memoryBytes: 1048576,
  createdAt: dataset.ingestedAt,
  generatingSql: 'CREATE TABLE orders AS SELECT * FROM raw_orders',
};

beforeEach(() => {
  useDatasetsStore.setState({ tables: [], datasets: [], workerStatus: 'idle', workerError: null });
  useSelectionStore.setState({ selectedTableId: null, selectedColumn: null, selectedEdgeId: null, lastSelectionKind: null });
  useRehydrationStore.setState({ outcomes: {} });
});

function renderTableList(overrides: Partial<Parameters<typeof TableList>[0]> = {}) {
  return render(
    <EducationalPanelProvider>
      <TableList
        onRemove={vi.fn()}
        onRefresh={vi.fn()}
        refreshingTableId={null}
        refreshDisabled={false}
        {...overrides}
      />
    </EducationalPanelProvider>,
  );
}

describe('TableList', () => {
  it('renders nothing when the registry is empty', () => {
    const { container } = renderTableList();
    expect(container.textContent).toBe('');
  });

  it('shows name, rows × cols, source, and memory for every registered table', () => {
    useDatasetsStore.getState().registerDataset(dataset, [customers, orders]);

    const { container } = renderTableList();

    expect(container.textContent).toContain('customers');
    expect(container.textContent).toContain('1,234 rows × 6 cols');
    expect(container.textContent).toContain('sample');
    expect(container.textContent).toContain('20 KB');

    expect(container.textContent).toContain('orders');
    expect(container.textContent).toContain('8,400 rows × 4 cols');
    expect(container.textContent).toContain('derived');
    expect(container.textContent).toContain('1 MB');
  });

  it('updates live when a table is added to the store after mount', () => {
    const { container } = renderTableList();
    expect(container.textContent).not.toContain('customers');

    act(() => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
    });

    expect(container.textContent).toContain('customers');
  });

  it('calls onRemove with the table id, not the dataset id', () => {
    useDatasetsStore.getState().registerDataset(dataset, [customers]);
    const onRemove = vi.fn();

    const { container } = renderTableList({ onRemove });
    fireEvent.click(container.querySelector('button[aria-label="Remove customers"]')!);

    expect(onRemove).toHaveBeenCalledWith('t-customers');
  });

  it('labels a derived table\'s remove control "Undo" instead of "Remove" — undo (§12.1) is dropping it', () => {
    useDatasetsStore.getState().registerDataset(dataset, [orders]);
    const onRemove = vi.fn();

    const { container } = renderTableList({ onRemove });
    expect(container.querySelector('button[aria-label="Remove orders"]')).toBeNull();
    fireEvent.click(container.querySelector('button[aria-label="Undo orders"]')!);

    expect(onRemove).toHaveBeenCalledWith('t-orders');
  });

  it('labels a shared-origin table "shared link"', () => {
    const shared: TableRegistryEntry = {
      id: 't-shared',
      tableName: 'shared_dataset',
      datasetId: 'ds-2',
      origin: 'shared',
      rowCount: 10,
      columnCount: 2,
      memoryBytes: 100,
      createdAt: dataset.ingestedAt,
    };
    useDatasetsStore.getState().registerDataset({ ...dataset, id: 'ds-2' }, [shared]);

    const { container } = renderTableList();
    expect(container.textContent).toContain('shared link');
  });

  it('shows a refresh button only for API-origin tables, not file/sample/derived', () => {
    const apiTable: TableRegistryEntry = {
      ...customers,
      id: 't-api',
      tableName: 'api_table',
      origin: 'api',
      sourceUrl: 'https://api.example.com/data',
    };
    useDatasetsStore.getState().registerDataset(dataset, [customers, orders, apiTable]);

    const { container } = renderTableList();

    expect(container.querySelector('button[aria-label="Refresh api_table from source"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Refresh customers from source"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Refresh orders from source"]')).toBeNull();
  });

  it('calls onRefresh with the table id when its refresh button is clicked', () => {
    const apiTable: TableRegistryEntry = {
      ...customers,
      id: 't-api',
      tableName: 'api_table',
      origin: 'api',
      sourceUrl: 'https://api.example.com/data',
    };
    useDatasetsStore.getState().registerDataset(dataset, [apiTable]);
    const onRefresh = vi.fn();

    const { container } = renderTableList({ onRefresh });
    fireEvent.click(container.querySelector('button[aria-label="Refresh api_table from source"]')!);

    expect(onRefresh).toHaveBeenCalledWith('t-api');
  });

  it('disables every refresh button while refreshDisabled is true', () => {
    const apiTable: TableRegistryEntry = {
      ...customers,
      id: 't-api',
      tableName: 'api_table',
      origin: 'api',
      sourceUrl: 'https://api.example.com/data',
    };
    useDatasetsStore.getState().registerDataset(dataset, [apiTable]);

    const { container } = renderTableList({ refreshDisabled: true });
    const button = container.querySelector('button[aria-label="Refresh api_table from source"]') as HTMLButtonElement;

    expect(button.disabled).toBe(true);
  });

  it('shows the last-fetched timestamp for an API-origin table', () => {
    const apiTable: TableRegistryEntry = {
      ...customers,
      id: 't-api',
      tableName: 'api_table',
      origin: 'api',
      sourceUrl: 'https://api.example.com/data',
      lastFetchedAt: '2026-07-23T00:00:00.000Z',
    };
    useDatasetsStore.getState().registerDataset(dataset, [apiTable]);

    const { container } = renderTableList();

    expect(container.textContent).toContain('fetched');
    expect(container.textContent).toContain(new Date('2026-07-23T00:00:00.000Z').toLocaleString());
  });

  it('shows a possibly-stale badge on a derived table flagged stale, not on others', () => {
    const staleTable: TableRegistryEntry = { ...orders, id: 't-stale', tableName: 'stale_orders', stale: true };
    useDatasetsStore.getState().registerDataset(dataset, [orders, staleTable]);

    const { container } = renderTableList();

    expect(container.textContent).toContain('possibly stale');
    const ordersRow = container.querySelector('button[aria-label="Undo orders"]')!.closest('li');
    const staleRow = container.querySelector('button[aria-label="Undo stale_orders"]')!.closest('li');
    expect(ordersRow?.textContent).not.toContain('possibly stale');
    expect(staleRow?.textContent).toContain('possibly stale');
  });

  describe('onSelectTable (Workbench W2, D68d)', () => {
    it('renders the table name as plain text (not a button) when onSelectTable is omitted', () => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
      const { container } = renderTableList();

      const buttons = Array.from(container.querySelectorAll('button'));
      expect(buttons.some((button) => button.textContent?.includes('customers'))).toBe(false);
      expect(container.querySelector('.trow__name')?.textContent).toBe('customers');
    });

    it('calls onSelectTable with the table id when its name is clicked', () => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
      const onSelectTable = vi.fn();

      const { container } = renderTableList({ onSelectTable });
      fireEvent.click(within(container).getByText('customers'));

      expect(onSelectTable).toHaveBeenCalledWith('t-customers');
    });
  });

  describe('hideHeading (V3, 13-hallmark-replication/03-explorer-status-bar.md)', () => {
    it('renders the "Registered tables" heading by default', () => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
      const { container } = renderTableList();

      expect(container.querySelector('h2')?.textContent).toBe('Registered tables');
    });

    it('omits the heading when hideHeading is true', () => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
      const { container } = renderTableList({ hideHeading: true });

      expect(container.querySelector('h2')).toBeNull();
    });
  });

  describe('row selection (V3, 13-hallmark-replication/03-explorer-status-bar.md)', () => {
    it('highlights only the row matching useSelectionStore().selectedTableId', () => {
      useDatasetsStore.getState().registerDataset(dataset, [customers, orders]);
      useSelectionStore.setState({ selectedTableId: 't-customers' });

      const { container } = renderTableList();
      const customersRow = container.querySelector('.trow__name')!.closest('li')!;
      const ordersRow = Array.from(container.querySelectorAll('li')).find((li) => li !== customersRow)!;

      expect(customersRow.className).toContain('shadow-[inset_2px_0_0_var(--color-active)]');
      expect(ordersRow.className).not.toContain('shadow-[inset_2px_0_0_var(--color-active)]');
    });

    it('moves the highlight when the selection changes', () => {
      useDatasetsStore.getState().registerDataset(dataset, [customers, orders]);
      useSelectionStore.setState({ selectedTableId: 't-customers' });

      const { container } = renderTableList();
      act(() => {
        useSelectionStore.setState({ selectedTableId: 't-orders' });
      });

      const rows = Array.from(container.querySelectorAll('li'));
      const customersRow = rows.find((li) => li.textContent?.includes('customers'))!;
      const ordersRow = rows.find((li) => li.textContent?.includes('orders'))!;

      expect(customersRow.className).not.toContain('shadow-[inset_2px_0_0_var(--color-active)]');
      expect(ordersRow.className).toContain('shadow-[inset_2px_0_0_var(--color-active)]');
    });
  });

  describe('reflow (S1, 14-workspace-streamline/01-explorer-rail-reflow.md)', () => {
    const classifiedCustomers: TableRegistryEntry = {
      ...customers,
      columns: [
        column({ name: 'id', semanticType: 'Identifier' }),
        column({ name: 'region', semanticType: 'Categorical' }),
      ],
    };
    const classifiedOrders: TableRegistryEntry = {
      ...orders,
      columns: [
        column({ name: 'order_id', semanticType: 'Identifier' }),
        column({ name: 'customer_id', semanticType: 'Categorical' }),
      ],
    };

    it('renders the original single-line row when reflow is omitted, unchanged', () => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
      const { container } = renderTableList();

      expect(container.querySelector('[data-testid^="trow-chevron-"]')).toBeNull();
      expect(container.textContent).toContain('1,234 rows × 6 cols');
    });

    it('renders a chevron and demotes the metadata to its own line when reflow is true', () => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
      const { container } = renderTableList({ reflow: true });

      expect(within(container).getByTestId('trow-chevron-t-customers')).toBeTruthy();
    });

    it('toggling the chevron discloses columns with a key marker and physical-type badge, collapsed by default', () => {
      useDatasetsStore.getState().registerDataset(dataset, [classifiedCustomers]);
      const { container } = renderTableList({ reflow: true });

      expect(container.querySelector('[data-testid="trow-column-t-customers-id"]')).toBeNull();
      fireEvent.click(within(container).getByTestId('trow-chevron-t-customers'));

      const idRow = within(container).getByTestId('trow-column-t-customers-id');
      expect(idRow.dataset.key).toBe('pk');
      expect(idRow.textContent).toContain('id');
      expect(idRow.textContent).toContain('VARCHAR');
      // Each column starts collapsed — its own chevron (not the table's) reveals the
      // semantic-type badge and the computed cardinality/null/distribution content.
      expect(idRow.textContent).not.toMatch(/unique values|missing|distribution preview/i);
    });

    it("expanding a disclosed column's own chevron reveals its computed stats", () => {
      useDatasetsStore.getState().registerDataset(dataset, [classifiedCustomers]);
      const { container } = renderTableList({ reflow: true });

      fireEvent.click(within(container).getByTestId('trow-chevron-t-customers'));
      const idRow = within(container).getByTestId('trow-column-t-customers-id');
      fireEvent.click(within(idRow).getByLabelText('Expand id'));

      expect(idRow.textContent).toContain('Identifier');
      expect(idRow.textContent).toContain('Unique Values');
      expect(idRow.textContent).toContain('Distribution Preview');
    });

    it('marks a column FK when it appears as a child column in the override-applied edges prop', () => {
      useDatasetsStore.getState().registerDataset(dataset, [classifiedOrders]);
      const fkEdges = [edge('orders', 'customer_id', 'customers', 'id')];
      const { container } = renderTableList({ reflow: true, edges: fkEdges });

      fireEvent.click(within(container).getByTestId('trow-chevron-t-orders'));
      expect(within(container).getByTestId('trow-column-t-orders-customer_id').dataset.key).toBe('fk');
    });

    it('shows "Profiling…" when expanded before classification has produced any columns', () => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
      const { container } = renderTableList({ reflow: true });

      fireEvent.click(within(container).getByTestId('trow-chevron-t-customers'));
      expect(within(container).getByTestId('trow-columns-t-customers').textContent).toContain('Profiling…');
    });

    it('allows more than one table\'s disclosure open at once — multi-open, not accordion', () => {
      useDatasetsStore.getState().registerDataset(dataset, [classifiedCustomers, classifiedOrders]);
      const { container } = renderTableList({ reflow: true });

      fireEvent.click(within(container).getByTestId('trow-chevron-t-customers'));
      fireEvent.click(within(container).getByTestId('trow-chevron-t-orders'));

      expect(within(container).getByTestId('trow-columns-t-customers')).toBeTruthy();
      expect(within(container).getByTestId('trow-columns-t-orders')).toBeTruthy();
    });

    it("clicking a disclosed column's row expands it inline first, then calls onSelectColumn on a second click", () => {
      useDatasetsStore.getState().registerDataset(dataset, [classifiedCustomers]);
      const onSelectColumn = vi.fn();
      const { container } = renderTableList({ reflow: true, onSelectColumn, onSelectTable: vi.fn() });

      fireEvent.click(within(container).getByTestId('trow-chevron-t-customers'));
      const idRow = within(container).getByTestId('trow-column-t-customers-id');

      fireEvent.click(within(idRow).getByText('id'));
      expect(onSelectColumn).not.toHaveBeenCalled();
      expect(idRow.textContent).toContain('Unique Values');

      fireEvent.click(within(idRow).getByText('id'));
      expect(onSelectColumn).toHaveBeenCalledWith('t-customers', 'id');
    });

    it("clicking anywhere on a collapsed table row expands it first, then opens the Profile tab on a second click", () => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
      const onSelectTable = vi.fn();
      const { container } = renderTableList({ reflow: true, onSelectTable });

      const nameSpan = within(container).getByText('customers');
      fireEvent.click(nameSpan);
      expect(onSelectTable).not.toHaveBeenCalled();
      expect(within(container).getByTestId('trow-columns-t-customers')).toBeTruthy();

      fireEvent.click(nameSpan);
      expect(onSelectTable).toHaveBeenCalledWith('t-customers');
    });

    it('the row click target excludes remove/refresh — clicking Remove does not also toggle the row', () => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
      const onRemove = vi.fn();
      const { container } = renderTableList({ reflow: true, onRemove });

      fireEvent.click(container.querySelector('button[aria-label="Remove customers"]')!);

      expect(onRemove).toHaveBeenCalledWith('t-customers');
      expect(container.querySelector('[data-testid="trow-columns-t-customers"]')).toBeNull();
    });
  });

  // S6.9 / 07d: the rail has to render all three reconciliation outcomes
  // distinguishably, and a lost entry must never be presented as a normal row —
  // a clickable registry entry whose table doesn't exist is the specific
  // failure the sub-step exists to make impossible.
  describe('rehydration outcomes (07d)', () => {
    const rates: TableRegistryEntry = {
      id: 't-rates',
      tableName: 'rates',
      datasetId: 'ds-1',
      origin: 'api',
      rowCount: 12,
      columnCount: 3,
      memoryBytes: 2048,
      createdAt: dataset.ingestedAt,
      sourceUrl: 'https://example.test/rates',
    };

    it('renders a lost table with its reason, and with nothing to click into', () => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
      useRehydrationStore.getState().setOutcomes([
        {
          tableId: 't-customers',
          tableName: 'customers',
          status: 'lost',
          reason: 'This was a sampled preview, so its rows were never stored — re-drop the file.',
        },
      ]);
      const onSelectTable = vi.fn();

      const { container } = renderTableList({ reflow: true, onSelectTable });
      const row = within(container).getByTestId('trow-unavailable-t-customers');

      expect(row.dataset.rehydration).toBe('lost');
      expect(row.textContent).toContain('its rows were never stored');
      expect(container.querySelector('[data-testid="trow-chevron-t-customers"]')).toBeNull();
      fireEvent.click(row);
      expect(onSelectTable).not.toHaveBeenCalled();
    });

    it('offers a recoverable api table its recovery action, and fires nothing until clicked', () => {
      useDatasetsStore.getState().registerDataset({ ...dataset, tableNames: ['rates'] }, [rates]);
      useRehydrationStore.getState().setOutcomes([
        {
          tableId: 't-rates',
          tableName: 'rates',
          status: 'recoverable',
          recovery: 'refetch',
          reason: 'Not fetched yet — refresh it from its source.',
        },
      ]);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const { container } = renderTableList({ reflow: true });
      const row = within(container).getByTestId('trow-unavailable-t-rates');

      expect(row.dataset.rehydration).toBe('recoverable');
      expect(row.textContent).toContain('Refresh from source');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('leaves a restored table as an ordinary row', () => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
      useRehydrationStore
        .getState()
        .setOutcomes([{ tableId: 't-customers', tableName: 'customers', status: 'restored', reason: null }]);

      const { container } = renderTableList({ reflow: true, onSelectTable: vi.fn() });

      expect(container.querySelector('[data-testid="trow-unavailable-t-customers"]')).toBeNull();
      expect(within(container).getByTestId('trow-chevron-t-customers')).toBeTruthy();
    });
  });
});
