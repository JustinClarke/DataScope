import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { useDatasetsStore } from '../stores/datasets';
import { useSettingsStore } from '../stores/settings';
import { useUIStore } from '../stores/ui';
import type { TableRegistryEntry } from '../types';

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent?.includes(text)) as
    | HTMLButtonElement
    | undefined;
}

describe('Sidebar', () => {
  beforeEach(() => {
    useDatasetsStore.setState({
      tables: [],
      datasets: [],
      workerStatus: 'idle',
      workerError: null,
    });
    useSettingsStore.setState({
      aiMode: null,
      byokPreference: 'free-tier-first',
      theme: 'system',
      skipToData: false,
    });
    useUIStore.setState({ activeModule: 'ingestion', activeTabId: null });
  });

  it('renders four intent groups with only DATA expanded pre-drop (§13.2, D68d)', () => {
    const { container } = render(<Sidebar />);
    const sidebar = container.querySelector('aside')!;

    expect(sidebar.textContent).toContain('DATA');
    expect(sidebar.textContent).toContain('EXPLORE');
    expect(sidebar.textContent).toContain('ANALYZE');
    expect(sidebar.textContent).toContain('OUTPUT');

    // DATA's own cards are visible without expanding anything.
    expect(sidebar.textContent).toContain('Ingest');
    expect(sidebar.textContent).toContain('Blueprint');
    expect(sidebar.textContent).toContain('Profile');

    // The other groups are collapsed — their cards aren't in the DOM yet.
    expect(sidebar.textContent).not.toContain('SQL');
    expect(sidebar.textContent).not.toContain('Pivot');
    expect(sidebar.textContent).not.toContain('Export');
  });

  it('a manually collapsed/expanded group toggles via its header', () => {
    const { container } = render(<Sidebar />);
    const sidebar = container.querySelector('aside')!;

    fireEvent.click(within(sidebar).getByText('EXPLORE'));
    expect(sidebar.textContent).toContain('SQL');
    expect(sidebar.textContent).toContain('Charts');

    fireEvent.click(within(sidebar).getByText('EXPLORE'));
    expect(sidebar.textContent).not.toContain('SQL');
  });

  it('auto-expands EXPLORE and OUTPUT once a dataset loads, without collapsing DATA', () => {
    const mockTable: TableRegistryEntry = {
      id: 'table-1',
      tableName: 'test_table',
      datasetId: 'dataset-1',
      origin: 'file',
      rowCount: 100,
      columnCount: 5,
      memoryBytes: 1024,
      createdAt: new Date().toISOString(),
    };
    useDatasetsStore.setState({ tables: [mockTable] });

    const { container } = render(<Sidebar />);
    const sidebar = container.querySelector('aside')!;

    expect(sidebar.textContent).toContain('Ingest'); // DATA still open
    expect(sidebar.textContent).toContain('SQL'); // EXPLORE auto-expanded
    expect(sidebar.textContent).toContain('Export / Share'); // OUTPUT auto-expanded
  });

  it('shows a "Tables (N)" badge on DATA once tables exist', () => {
    const mockTable: TableRegistryEntry = {
      id: 'table-1',
      tableName: 'test_table',
      datasetId: 'dataset-1',
      origin: 'file',
      rowCount: 100,
      columnCount: 5,
      memoryBytes: 1024,
      createdAt: new Date().toISOString(),
    };
    useDatasetsStore.setState({ tables: [mockTable] });

    const { container } = render(<Sidebar />);
    expect(container.querySelector('aside')?.textContent).toContain('Tables (1)');
  });

  it('disables data-dependent cards when no tables are present', () => {
    const { container } = render(<Sidebar />);
    const sidebar = container.querySelector('aside')!;
    fireEvent.click(within(sidebar).getByText('EXPLORE'));
    fireEvent.click(within(sidebar).getByText('OUTPUT'));

    expect(findButtonByText(container, 'Profile')?.disabled).toBe(true);
    expect(findButtonByText(container, 'SQL')?.disabled).toBe(true);
    expect(findButtonByText(container, 'Export')?.disabled).toBe(true);
    expect(findButtonByText(container, 'Ingest')?.disabled).toBe(false);
  });

  it('enables Export / Share with no tables loaded, when a previously created share link exists', () => {
    useSettingsStore.setState({
      shareLinks: [
        { token: 'tok-1', deleteToken: 'del-1', kind: 'structure', label: 'orders', createdAt: '2026-07-23T00:00:00.000Z', ttlSeconds: 2_592_000 },
      ],
    });

    // OUTPUT auto-expands on mount, same as the dataset-driven case above —
    // no click needed (and clicking here would just toggle it shut).
    const { container } = render(<Sidebar />);
    expect(findButtonByText(container, 'Export')?.disabled).toBe(false);
  });

  it('enables profile/sql/export/charts cards when tables with chart-eligible columns are present', () => {
    const mockTable: TableRegistryEntry = {
      id: 'table-1',
      tableName: 'test_table',
      datasetId: 'dataset-1',
      origin: 'file',
      rowCount: 100,
      columnCount: 1,
      memoryBytes: 1024,
      createdAt: new Date().toISOString(),
      columns: [
        {
          name: 'value',
          physicalType: 'DOUBLE',
          semanticType: 'Quantitative',
          cardinality: 90,
          nullPercentage: 0,
          min: 1,
          max: 100,
          mean: 50,
          stdDev: 25,
        },
      ],
    };
    useDatasetsStore.setState({ tables: [mockTable] });

    const { container } = render(<Sidebar />);

    expect(findButtonByText(container, 'Profile')?.disabled).toBe(false);
    expect(findButtonByText(container, 'SQL')?.disabled).toBe(false);
    expect(findButtonByText(container, 'Export')?.disabled).toBe(false);
    expect(findButtonByText(container, 'Charts')?.disabled).toBe(false);
  });

  it('disables AI card when aiMode is null, enables it once set', () => {
    const { container, rerender } = render(<Sidebar />);
    const sidebar = container.querySelector('aside')!;
    fireEvent.click(within(sidebar).getByText('ANALYZE'));
    expect(findButtonByText(container, 'AI Chat')?.disabled).toBe(true);

    useSettingsStore.setState({ aiMode: 'local-only' });
    rerender(<Sidebar />);
    expect(findButtonByText(container, 'AI Chat')?.disabled).toBe(false);
  });

  it('Studio, ML, and Learn are absent from v0 nav (D68d)', () => {
    const { container } = render(<Sidebar />);
    const sidebar = container.querySelector('aside')!;
    expect(sidebar.textContent).not.toContain('Studio');
    expect(sidebar.textContent).not.toContain('ML');
    expect(sidebar.textContent).not.toContain('Learn');
  });

  it('keeps charts disabled when a temporal column has no numeric partner', () => {
    const mockTable: TableRegistryEntry = {
      id: 'table-1',
      tableName: 'test_table',
      datasetId: 'dataset-1',
      origin: 'file',
      rowCount: 100,
      columnCount: 2,
      memoryBytes: 1024,
      createdAt: new Date().toISOString(),
      columns: [
        {
          name: 'date_col',
          physicalType: 'DATE',
          semanticType: 'Temporal',
          cardinality: 100,
          nullPercentage: 0,
          min: '2024-01-01',
          max: '2024-12-31',
          mean: null,
          stdDev: null,
        },
      ],
    };
    useDatasetsStore.setState({ tables: [mockTable] });

    const { container } = render(<Sidebar />);
    // A lone temporal column affords no chart capability (needs a numeric partner too).
    expect(findButtonByText(container, 'Charts')?.disabled).toBe(true);
  });

  it('enables correlation when 2+ numeric columns are present', () => {
    const mockTable: TableRegistryEntry = {
      id: 'table-1',
      tableName: 'test_table',
      datasetId: 'dataset-1',
      origin: 'file',
      rowCount: 100,
      columnCount: 2,
      memoryBytes: 1024,
      createdAt: new Date().toISOString(),
      columns: [
        {
          name: 'value1',
          physicalType: 'DOUBLE',
          semanticType: 'Quantitative',
          cardinality: 100,
          nullPercentage: 0,
          min: 1,
          max: 100,
          mean: 50,
          stdDev: 25,
        },
        {
          name: 'value2',
          physicalType: 'DOUBLE',
          semanticType: 'Quantitative',
          cardinality: 100,
          nullPercentage: 0,
          min: 1,
          max: 100,
          mean: 50,
          stdDev: 25,
        },
      ],
    };
    useDatasetsStore.setState({ tables: [mockTable] });

    const { container } = render(<Sidebar />);
    expect(findButtonByText(container, 'Correlation')?.disabled).toBe(false);
  });

  it('shows correct disabled tooltips for data-dependent cards', () => {
    useDatasetsStore.setState({ tables: [] });
    const { container } = render(<Sidebar />);

    const tooltips = container.querySelectorAll('[id^="tooltip-"]');
    let foundTooltip = false;

    tooltips.forEach((tooltip) => {
      if (tooltip.textContent === 'Drop a dataset to get started') {
        foundTooltip = true;
      }
    });

    expect(foundTooltip).toBe(true);
  });

  it('"skip to data" toggles and persists, and immediately navigates when data is present', () => {
    const mockTable: TableRegistryEntry = {
      id: 'table-1',
      tableName: 'test_table',
      datasetId: 'dataset-1',
      origin: 'file',
      rowCount: 100,
      columnCount: 5,
      memoryBytes: 1024,
      createdAt: new Date().toISOString(),
    };
    useDatasetsStore.setState({ tables: [mockTable] });
    useUIStore.setState({ activeModule: 'dossier', activeTabId: null });

    const { container } = render(<Sidebar />);
    const toggle = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);

    expect(useSettingsStore.getState().skipToData).toBe(true);
    expect(useUIStore.getState().activeModule).toBe('profile');
  });

  it('"skip to data" persists the preference without navigating when no data exists yet', () => {
    const { container } = render(<Sidebar />);
    const toggle = container.querySelector('input[type="checkbox"]') as HTMLInputElement;

    fireEvent.click(toggle);

    expect(useSettingsStore.getState().skipToData).toBe(true);
    expect(useUIStore.getState().activeModule).toBe('ingestion');
  });
});
