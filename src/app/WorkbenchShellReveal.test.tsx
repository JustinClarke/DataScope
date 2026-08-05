import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { WorkbenchShellReveal, MAP_TAB_SUBJECT } from './WorkbenchShellReveal';
import { useDatasetsStore } from '../stores/datasets';
import { useTabsStore } from '../stores/tabs';
import { useSelectionStore } from '../stores/selection';
import { useDrawerStore } from '../stores/drawer';
import { useRehydrationStore } from '../stores/rehydration';
import { usePersistenceStore } from '../stores/persistence';
import { useDspsReceiverStore } from '../stores/dspsReceiver';
import { useQueryStore, CONSOLE_SESSION } from '../stores/query';
import type { TableRegistryEntry } from '../types';
import type { RestoreReport } from '../services/workspace';

// The reveal's sections mount the same components the shell does, so this file
// carries the same service mocks `WorkbenchShell.test.tsx` uses — the point
// here is the reveal's own wiring, never the DuckDB engine.
const { restoreStagedTablesMock, rehydrateWorkspaceMock } = vi.hoisted(() => ({
  restoreStagedTablesMock: vi.fn(),
  rehydrateWorkspaceMock: vi.fn(),
}));
vi.mock('../services/workspace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/workspace')>();
  return { ...actual, restoreStagedTables: restoreStagedTablesMock };
});
vi.mock('../services/rehydration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/rehydration')>();
  return { ...actual, rehydrateWorkspace: rehydrateWorkspaceMock };
});

const { loadTableCardStatsMock } = vi.hoisted(() => ({ loadTableCardStatsMock: vi.fn() }));
vi.mock('../services/profiling', () => ({ loadTableCardStats: loadTableCardStatsMock }));
const { loadInsightsMock } = vi.hoisted(() => ({ loadInsightsMock: vi.fn() }));
vi.mock('../services/insights', () => ({ loadInsights: loadInsightsMock }));
const { loadDossierInsightsMock, loadTimeCoverageMock } = vi.hoisted(() => ({
  loadDossierInsightsMock: vi.fn(),
  loadTimeCoverageMock: vi.fn(),
}));
vi.mock('../services/dossier', () => ({
  loadDossierInsights: loadDossierInsightsMock,
  loadTimeCoverage: loadTimeCoverageMock,
}));
const { loadRelationshipsMock } = vi.hoisted(() => ({ loadRelationshipsMock: vi.fn() }));
vi.mock('../services/relationships', () => ({ loadRelationships: loadRelationshipsMock }));
const { loadDatasetQualityReportMock } = vi.hoisted(() => ({ loadDatasetQualityReportMock: vi.fn() }));
vi.mock('../services/dataQuality', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/dataQuality')>();
  return { ...actual, loadDatasetQualityReport: loadDatasetQualityReportMock };
});
vi.mock('../features/sql/MonacoWrapper', () => ({
  default: () => <div data-testid="fake-monaco" />,
}));

const DATASET = {
  id: 'ds-1',
  name: 'demo',
  sourceType: 'file' as const,
  tableNames: ['orders', 'customers'],
  ingestedAt: new Date().toISOString(),
};

function table(
  overrides: Partial<TableRegistryEntry> & Pick<TableRegistryEntry, 'id' | 'tableName'>,
): TableRegistryEntry {
  return {
    datasetId: 'ds-1',
    origin: 'sample',
    rowCount: 10,
    columnCount: 1,
    memoryBytes: 100,
    createdAt: new Date().toISOString(),
    columns: [
      {
        name: 'id',
        semanticType: 'Categorical',
        physicalType: 'VARCHAR',
        cardinality: 3,
        nullPercentage: 0,
        min: null,
        max: null,
        mean: null,
        stdDev: null,
      },
    ],
    ...overrides,
  };
}

const TABLE_A = table({ id: 't-a', tableName: 'orders' });
const TABLE_B = table({ id: 't-b', tableName: 'customers' });
const EMPTY_RESTORE: RestoreReport = { tables: [], durationMs: 0 };

/** Renders the reveal with data already landed, which is the only phase this file cares about. */
function renderReveal(tables: TableRegistryEntry[] = [TABLE_A, TABLE_B]) {
  useDatasetsStore.setState({ tables, datasets: [DATASET], workerStatus: 'ready', workerError: null });
  return render(<WorkbenchShellReveal />);
}

const SECTIONS = ['Inspect schema', 'Data quality', 'Relationships', 'Query & chart'] as const;

beforeEach(() => {
  loadTableCardStatsMock.mockReset().mockResolvedValue({});
  loadInsightsMock.mockReset().mockResolvedValue([]);
  loadDossierInsightsMock.mockReset().mockResolvedValue([]);
  loadTimeCoverageMock.mockReset().mockResolvedValue([]);
  loadRelationshipsMock.mockReset().mockResolvedValue([]);
  loadDatasetQualityReportMock.mockReset().mockResolvedValue({ warnings: [], passedRules: [] });
  restoreStagedTablesMock.mockReset().mockResolvedValue(EMPTY_RESTORE);
  rehydrateWorkspaceMock.mockReset().mockResolvedValue([]);
  useDatasetsStore.setState({ tables: [], datasets: [], workerStatus: 'idle', workerError: null });
  useTabsStore.setState({ tabs: [], activeTabId: null });
  useQueryStore.setState({ sessions: {}, history: [], lastRunSession: CONSOLE_SESSION });
  useDspsReceiverStore.setState({ document: null, error: null });
  useSelectionStore.getState().clearSelection();
  useDrawerStore.setState({ open: false, expanded: false });
  useRehydrationStore.setState({ outcomes: {} });
  usePersistenceStore.setState({ status: 'unknown', note: null, restore: EMPTY_RESTORE });
});

// The regression this suite exists for. `ProfileDashboard`, `DataQualityPanel`
// and the single-table `DatasetMap` all call `useEducationalPanel()`
// unconditionally, and that hook throws outside a provider. Phase 1 mounted
// them on the reveal while the provider was still scoped to the shell, so three
// of the four cards threw the moment they were clicked.
describe('AnalystReveal — sections mount (EducationalPanelProvider coverage)', () => {
  it.each(SECTIONS)('opens the %s section without throwing', async (label) => {
    const { container } = renderReveal();
    fireEvent.click(within(container).getByRole('tab', { name: new RegExp(label, 'i') }));
    await waitFor(() => {
      expect(container.querySelector('[role="tabpanel"]')).not.toBeNull();
    });
  });

  it('opens the single-table Relationships section, which renders the Blueprint face', async () => {
    const { container } = renderReveal([TABLE_A]);
    fireEvent.click(within(container).getByRole('tab', { name: /Relationships/i }));
    await waitFor(() => {
      expect(container.querySelector('[role="tabpanel"]')).not.toBeNull();
    });
  });
});

describe('AnalystReveal — the workspace is a stated, available mode', () => {
  it('names both modes in the header, with Explore marked as the current one', () => {
    const { container } = renderReveal();
    const group = within(container).getByRole('group', { name: 'View mode' });
    expect(within(group).getByText('Explore').getAttribute('aria-current')).toBe('page');
    expect(within(group).getByTestId('mode-switch-workspace')).toBeTruthy();
  });

  it('explains what the workspace adds rather than only naming it', () => {
    const { container } = renderReveal();
    expect(within(container).getByRole('tooltip').textContent).toMatch(/query tabs/i);
  });

  it('enters the workspace from the mode switch', () => {
    const { container } = renderReveal();
    fireEvent.click(within(container).getByTestId('mode-switch-workspace'));
    expect(container.querySelector('[data-act="shell"]')).not.toBeNull();
  });

  it('offers the hand-off from inside every section, not just the overview', async () => {
    for (const label of SECTIONS) {
      const { container, unmount } = renderReveal();
      fireEvent.click(within(container).getByRole('tab', { name: new RegExp(label, 'i') }));
      await waitFor(() => expect(within(container).getByTestId('section-handoff')).toBeTruthy());
      unmount();
    }
  });
});

// The hand-off's whole claim is that the workspace opens on what you were
// looking at. These assert the routing, not the animation.
describe('AnalystReveal — the hand-off carries the section across', () => {
  it('opens the profile tab on the selected table from the schema section', async () => {
    useSelectionStore.getState().selectTable(TABLE_B.id);
    const { container } = renderReveal();
    fireEvent.click(within(container).getByRole('tab', { name: /Inspect schema/i }));
    fireEvent.click(await within(container).findByTestId('section-handoff'));

    const profile = useTabsStore.getState().tabs.find((t) => t.type === 'profile');
    expect(profile?.subject).toBe(TABLE_B.id);
  });

  it('falls back to the first table when nothing is selected', async () => {
    const { container } = renderReveal();
    fireEvent.click(within(container).getByRole('tab', { name: /Inspect schema/i }));
    fireEvent.click(await within(container).findByTestId('section-handoff'));

    expect(useTabsStore.getState().tabs.find((t) => t.type === 'profile')?.subject).toBe(TABLE_A.id);
  });

  it('opens exactly one map tab from the relationships section, on the shared subject', async () => {
    const { container } = renderReveal();
    fireEvent.click(within(container).getByRole('tab', { name: /Relationships/i }));
    fireEvent.click(await within(container).findByTestId('section-handoff'));

    const maps = useTabsStore.getState().tabs.filter((t) => t.type === 'map');
    expect(maps).toHaveLength(1);
    expect(maps[0].subject).toBe(MAP_TAB_SUBJECT);
  });

  it('opens the drawer console from the query section, where the typed SQL already lives', async () => {
    const { container } = renderReveal();
    fireEvent.click(within(container).getByRole('tab', { name: /Query & chart/i }));
    fireEvent.click(await within(container).findByTestId('section-handoff'));

    expect(useDrawerStore.getState().open).toBe(true);
  });

  it('enters the workspace from the quality section, whose panel lives in the explorer rail', async () => {
    const { container } = renderReveal();
    fireEvent.click(within(container).getByRole('tab', { name: /Data quality/i }));
    fireEvent.click(await within(container).findByTestId('section-handoff'));

    expect(container.querySelector('[data-act="shell"]')).not.toBeNull();
  });
});

describe('AnalystReveal — the cards are a real tablist', () => {
  it('exposes the four sections as tabs with none selected on the overview', () => {
    const { container } = renderReveal();
    const tabs = within(container).getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs.every((t) => t.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('marks the open section selected and points the panel back at its tab', async () => {
    const { container } = renderReveal();
    fireEvent.click(within(container).getByRole('tab', { name: /Data quality/i }));

    const panel = await waitFor(() => {
      const found = container.querySelector('[role="tabpanel"]');
      expect(found).not.toBeNull();
      return found!;
    });
    expect(panel.getAttribute('aria-labelledby')).toBe('rv-tab-quality');
    expect(within(container).getByRole('tab', { name: /Data quality/i }).getAttribute('aria-selected')).toBe('true');
  });

  it('moves focus across tabs with the arrow keys', () => {
    const { container } = renderReveal();
    const tabs = within(container).getAllByRole('tab');
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(tabs[1], { key: 'End' });
    expect(document.activeElement).toBe(tabs[3]);
    fireEvent.keyDown(tabs[3], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('closes the open section with Escape', async () => {
    const { container } = renderReveal();
    fireEvent.click(within(container).getByRole('tab', { name: /Relationships/i }));
    await waitFor(() => expect(container.querySelector('[role="tabpanel"]')).not.toBeNull());

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(container.querySelector('[role="tabpanel"]')).toBeNull());
  });
});

// Phase 1 made the reveal interactive but left a window-level Enter handler
// that entered the workspace on any keypress — including one typed into the
// section's own SQL editor.
describe('AnalystReveal — Enter does not ambush an interactive page', () => {
  it('enters the workspace on Enter from the overview', () => {
    const { container } = renderReveal();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(container.querySelector('[data-act="shell"]')).not.toBeNull();
  });

  it('ignores Enter while a section is open', async () => {
    const { container } = renderReveal();
    fireEvent.click(within(container).getByRole('tab', { name: /Query & chart/i }));
    await waitFor(() => expect(container.querySelector('[role="tabpanel"]')).not.toBeNull());

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(container.querySelector('[data-act="shell"]')).toBeNull();
  });

  it('ignores Enter typed into a field', () => {
    const { container } = renderReveal();
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(container.querySelector('[data-act="shell"]')).toBeNull();
    input.remove();
  });
});

describe('AnalystReveal — the overview carries the Blueprint', () => {
  // `Skip to data` is the Dossier's own affordance — `DatasetMap.test.tsx`
  // uses it as the Blueprint's marker for the same reason.
  it('renders the Dossier under the cards instead of leaving the overview at stat pills', async () => {
    const { container } = renderReveal();
    await waitFor(() => expect(within(container).getByText(/Skip to data/)).toBeTruthy());
  });

  // `DatasetMap` sends this to the workspace profile tab. On the reveal it must
  // not: the page's whole premise is that the workspace is opt-in.
  it('keeps Skip to data inside Explore, opening the schema section', async () => {
    const { container } = renderReveal();
    fireEvent.click(await within(container).findByText(/Skip to data/));

    expect(container.querySelector('[data-act="shell"]')).toBeNull();
    expect(within(container).getByRole('tab', { name: /Inspect schema/i }).getAttribute('aria-selected')).toBe('true');
  });

  it('states that both modes work on the same loaded data', () => {
    const { container } = renderReveal();
    expect(within(container).getByText(/Both work on the same loaded data/i)).toBeTruthy();
  });
});
