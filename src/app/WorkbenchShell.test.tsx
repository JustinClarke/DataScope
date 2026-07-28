import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { WorkbenchShell } from './WorkbenchShell';
import { useDatasetsStore } from '../stores/datasets';
import { useTabsStore } from '../stores/tabs';
import { useDspsReceiverStore } from '../stores/dspsReceiver';
import { useSettingsStore } from '../stores/settings';
import { useByokKeyStore } from '../stores/byokKey';
import { useRunGuardStore } from '../stores/runGuard';
import { useQueryStore, CONSOLE_SESSION } from '../stores/query';
import { openQueryTab } from '../services/queryTabs';
import { classifyStatement } from '../lib/statementClass';
import * as ingestionService from '../services/ingestion';
import type { TableRegistryEntry } from '../types';
import type { StructureReport } from '../lib/structureReport';

// Wraps the real module so `loadSharedDataset` can be mocked per-test for the
// share-link tests (ported from App.test.tsx, HANDOFF-W8-CUTOVER.md) while
// `IngestionError` stays the real class `useShareLinkOpener` checks against.
vi.mock('../services/ingestion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/ingestion')>();
  return {
    ...actual,
    loadSharedDataset: vi.fn(actual.loadSharedDataset),
  };
});

// ProfileDashboard (mounted as `'profile'` tab content, W3) pulls in
// InsightFeed/ColumnCard's own async effects, which reach the DuckDB worker
// through these two services — mocked the same way InsightFeed.test.tsx does
// so this stays a UI test, never an engine one.
const { loadTableCardStatsMock } = vi.hoisted(() => ({ loadTableCardStatsMock: vi.fn() }));
vi.mock('../services/profiling', () => ({ loadTableCardStats: loadTableCardStatsMock }));
const { loadInsightsMock } = vi.hoisted(() => ({ loadInsightsMock: vi.fn() }));
vi.mock('../services/insights', () => ({ loadInsights: loadInsightsMock }));
// DatasetMap (mounted as `'map'` tab content, W4) reaches the DuckDB worker
// through `useDatasetBaseline` — the same two services `DatasetMap.test.tsx`
// mocks.
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
// SqlModule (mounted as `'sql'` tab content, W7.5) statically lazy-imports the
// real Monaco editor, which needs a real browser to mount — stubbed the same
// way SqlModule.test.tsx stubs it, so this stays a UI/wiring test.
vi.mock('../features/sql/MonacoWrapper', () => ({
  default: () => <div data-testid="fake-monaco" />,
}));

const DATASET = {
  id: 'ds-1',
  name: 'demo',
  sourceType: 'file' as const,
  tableNames: ['t'],
  ingestedAt: new Date().toISOString(),
};

function table(overrides: Partial<TableRegistryEntry> & Pick<TableRegistryEntry, 'id' | 'tableName'>): TableRegistryEntry {
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

beforeEach(() => {
  loadTableCardStatsMock.mockReset().mockResolvedValue({});
  loadInsightsMock.mockReset().mockResolvedValue([]);
  loadDossierInsightsMock.mockReset().mockResolvedValue([]);
  loadTimeCoverageMock.mockReset().mockResolvedValue([]);
  loadRelationshipsMock.mockReset().mockResolvedValue([]);
  useDatasetsStore.setState({ tables: [], datasets: [], workerStatus: 'idle', workerError: null });
  useTabsStore.setState({ tabs: [], activeTabId: null });
  useQueryStore.setState({ sessions: {}, history: [], lastRunSession: CONSOLE_SESSION });
  useDspsReceiverStore.setState({ document: null, error: null });
});

describe('WorkbenchShell — act assembly (§13.3, W1/W6)', () => {
  it('renders Act 0 chrome-free when there are no datasets and no ingest in progress, with real ingestion entry points', () => {
    const { container } = render(<WorkbenchShell />);
    expect(container.querySelector('[data-act="act0"]')).not.toBeNull();
    expect(container.querySelector('[data-region]')).toBeNull();
    expect(within(container).getByText(/Nothing leaves your machine/)).toBeTruthy();
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('does not auto-load any sample dataset on a fresh Act 0 mount', () => {
    render(<WorkbenchShell />);
    expect(useDatasetsStore.getState().datasets).toHaveLength(0);
  });

  it('renders Act 1 chrome-free while the worker is loading or compiling, with the same welcome content as Act 0', () => {
    useDatasetsStore.setState({ workerStatus: 'loading' });
    const { container } = render(<WorkbenchShell />);
    expect(container.querySelector('[data-act="act1"]')).not.toBeNull();
    expect(container.querySelector('[data-region]')).toBeNull();
    expect(within(container).getByText(/Nothing leaves your machine/)).toBeTruthy();
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });

  // V6d — the editorial composition ported from `welcome-act0.html` onto the
  // HUD register (the Specimen palette is deliberately unported; see
  // build/13-hallmark-replication/06d-act0.md).
  // The lockup sets the "o" as the brand reticle, so the word is three runs —
  // bone "Data", amber "Sc", the mark, amber "pe" — not a two-span split.
  it('renders the masthead wordmark with the shipped Data/Sc-reticle-pe amber split', () => {
    const { container } = render(<WorkbenchShell />);
    expect(within(container).getAllByText('Data')[0].className).toContain('text-(--color-ink)');
    expect(within(container).getAllByText('Sc')[0].className).toContain('text-(--color-active)');
    expect(within(container).getAllByText('pe')[0].className).toContain('text-(--color-active)');
  });

  // The rebuilt page states the local-first promise in the footer band rather
  // than in numbered section eyebrows (design.md § Variants, resolved 07-28).
  it('carries the local-first promises in the footer band', () => {
    const { container } = render(<WorkbenchShell />);
    expect(within(container).getByText(/No uploads · No accounts · No tracking/)).toBeTruthy();
    expect(within(container).getByText(/Nothing leaves your machine/)).toBeTruthy();
    expect(within(container).getByText('In-browser')).toBeTruthy();
  });

  // §5.1 ships no forced gate; the rebuilt page carries that posture in the
  // feature rail rather than as a prose section (design.md § Variants, 07-28).
  // The mock's "we'll ask exactly one thing" promise stays absent either way.
  it('presents AI as optional and never promises a forced question', () => {
    const { container } = render(<WorkbenchShell />);
    expect(within(container).getByText('AI optional')).toBeTruthy();
    expect(within(container).queryByText(/ask exactly one thing/)).toBeNull();
  });

  it('gives Act 1 the identical composition, not a second progress screen', () => {
    useDatasetsStore.setState({ workerStatus: 'compiling' });
    const { container } = render(<WorkbenchShell />);
    expect(container.querySelector('[data-act="act1"]')).not.toBeNull();
    expect(within(container).getByText('AI optional')).toBeTruthy();
    expect(within(container).getAllByText('Sc').length).toBeGreaterThan(0);
  });

  // `design.md` § Variants: no page scroll at `lg` and up — Act 0 is a decision
  // surface, so everything needed to say yes is reachable without moving. Below
  // `lg` the page deliberately still flows and scrolls: a phone can't hold a
  // drop target, a URL field and five samples at once. The rebuilt composition
  // gives the ingest column the one overflow (resolved 07-28).
  it('frames Act 0 as one viewport with a column, not the page, taking any overflow', () => {
    const { container } = render(<WorkbenchShell />);
    const frame = container.querySelector('[data-act="act0"] > div');
    expect(frame?.className).toContain('min-h-svh');
    expect(frame?.className).toContain('lg:h-svh');
    expect(frame?.className).toContain('lg:overflow-hidden');
    expect(container.querySelectorAll('main .lg\\:overflow-y-auto')).toHaveLength(1);
  });

  // Act 0 is always the dark composition, whatever the OS preference — pinned
  // through the register `theme.css` carries, never a local palette override
  // (design.md § Variants / § Drift policy).
  it('pins the dark register rather than redeclaring the palette', () => {
    const { container } = render(<WorkbenchShell />);
    const frame = container.querySelector('[data-act="act0"] > div');
    expect(frame?.getAttribute('data-theme')).toBe('dark');
    expect(frame?.getAttribute('style') ?? '').not.toMatch(/--color-/);
  });

  it('mounts the shell grid once a dataset is registered', () => {
    useDatasetsStore.setState({ datasets: [DATASET] });
    const { container } = render(<WorkbenchShell />);
    expect(container.querySelector('[data-act="shell"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="title-bar"]')).not.toBeNull();
    for (const region of ['explorer', 'canvas', 'ai-pane', 'inspector', 'status-bar']) {
      expect(container.querySelector(`[data-region="${region}"]`)).not.toBeNull();
    }
  });

  it('mounts the transform guard exactly once, at the shell level (S4)', () => {
    useDatasetsStore.setState({ datasets: [DATASET] });
    useRunGuardStore.getState().hold(classifyStatement('DROP TABLE orders'), CONSOLE_SESSION);

    const { container } = render(<WorkbenchShell />);

    // One dialog for a held statement — not one per surface that could have
    // raised it. The guard belongs to the run path, not to any component.
    expect(within(container).getAllByRole('dialog')).toHaveLength(1);
    useRunGuardStore.getState().release();
  });

  it('stays on the shell even if the worker later errors, once data exists', () => {
    useDatasetsStore.setState({ datasets: [DATASET], workerStatus: 'error' });
    const { container } = render(<WorkbenchShell />);
    expect(container.querySelector('[data-act="shell"]')).not.toBeNull();
  });
});

describe('WorkbenchShell — tab host (canvas region, W3)', () => {
  beforeEach(() => {
    useDatasetsStore.setState({ datasets: [DATASET] });
  });

  // "Shows an empty-state placeholder when no tabs are open" (the original
  // W3 test here) is retired, not just moved: with datasets present, W4's
  // map auto-open (below) immediately fills that state on mount, so "datasets
  // exist, zero tabs open" is no longer a reachable fresh-mount scenario —
  // only a transient one right after closing the last tab, which "closing a
  // tab removes it from the host" below already asserts the same
  // `tab-host-empty` markup for.

  it('lists open tabs as headers and marks the active one', () => {
    const id = useTabsStore.getState().openTab('map', 'ds-1');
    const { container } = render(<WorkbenchShell />);
    const header = container.querySelector(`[data-testid="tab-header-${id}"]`);
    expect(header?.textContent).toContain('map');
    expect(header?.textContent).toContain('ds-1');
    expect(header?.getAttribute('data-active')).toBe('true');
  });

  it('clicking a tab header switches the active tab', () => {
    const first = useTabsStore.getState().openTab('map', 'orders');
    const second = useTabsStore.getState().openTab('map', 'customers');
    const { container } = render(<WorkbenchShell />);
    expect(useTabsStore.getState().activeTabId).toBe(second);

    fireEvent.click(container.querySelector<HTMLButtonElement>(`[data-testid="tab-header-${first}"] button`)!);

    expect(useTabsStore.getState().activeTabId).toBe(first);
    expect(container.querySelector(`[data-testid="tab-header-${first}"]`)?.getAttribute('data-active')).toBe('true');
    expect(container.querySelector(`[data-testid="tab-header-${second}"]`)?.getAttribute('data-active')).toBe('false');
  });

  it('closing a tab removes it from the host', () => {
    useTabsStore.getState().openTab('map', 'orders');
    const { container } = render(<WorkbenchShell />);

    fireEvent.click(container.querySelector<HTMLButtonElement>('[aria-label="Close map · orders"]')!);

    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(container.querySelector('[data-testid="tab-host-empty"]')).not.toBeNull();
  });

  // S5 — the strip after the registry amendment.
  it('labels a query tab by its own name, and a singleton by type · subject', () => {
    const singleton = useTabsStore.getState().openTab('map', 'orders');
    const queryTab = openQueryTab({ sql: 'SELECT 1', name: 'Orders by month' });
    const { container } = render(<WorkbenchShell />);

    expect(container.querySelector(`[data-testid="tab-header-${queryTab}"]`)?.textContent).toContain('Orders by month');
    expect(container.querySelector(`[data-testid="tab-header-${queryTab}"]`)?.textContent).not.toContain('query ·');
    expect(container.querySelector(`[data-testid="tab-header-${singleton}"]`)?.textContent).toContain('map · orders');
  });

  it('scrolls the strip rather than compressing headers (§13.3, decided)', () => {
    const id = useTabsStore.getState().openTab('map', 'orders');
    const { container } = render(<WorkbenchShell />);

    expect(container.querySelector('[data-testid="tab-host"]')?.className).toContain('overflow-x-auto');
    expect(container.querySelector(`[data-testid="tab-header-${id}"]`)?.className).toContain('shrink-0');
  });

  it('closing a query tab drops its query session with it', () => {
    const tabId = openQueryTab({ sql: 'SELECT 1', name: 'Query 9' });
    const { container } = render(<WorkbenchShell />);

    fireEvent.click(container.querySelector<HTMLButtonElement>('[aria-label="Close Query 9"]')!);

    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(useQueryStore.getState().sessions[tabId]).toBeUndefined();
  });
});

describe('WorkbenchShell — keep-mounted preservation (W3, §13.3)', () => {
  beforeEach(() => {
    useDatasetsStore.setState({ datasets: [DATASET], tables: [TABLE_A, TABLE_B] });
  });

  it('switching away from a profile tab and back preserves its local state', () => {
    const tabA = useTabsStore.getState().openTab('profile', TABLE_A.id);
    const tabB = useTabsStore.getState().openTab('profile', TABLE_B.id);
    const { container } = render(<WorkbenchShell />);

    const contentA = () => container.querySelector(`[data-testid="tab-content-${tabA}"]`)!;
    const headerButton = (id: string) =>
      container.querySelector<HTMLButtonElement>(`[data-testid="tab-header-${id}"] button`)!;

    // tabB opened last (active); switch to tabA — it opens on its own subject.
    fireEvent.click(headerButton(tabA));
    expect(contentA().querySelector('h2')?.textContent).toBe(TABLE_A.tableName);

    // Change tabA's own table-picker selection away from its initial subject —
    // local component state (`ProfileDashboard`'s `activeTableId`), not store state.
    const pickToTableB = Array.from(contentA().querySelectorAll('button')).find(
      (button) => button.textContent === TABLE_B.tableName,
    )!;
    fireEvent.click(pickToTableB);
    expect(contentA().querySelector('h2')?.textContent).toBe(TABLE_B.tableName);

    // Switch away, then back. A remount would reset to `initialTableId` (TABLE_A).
    fireEvent.click(headerButton(tabB));
    fireEvent.click(headerButton(tabA));

    expect(contentA().querySelector('h2')?.textContent).toBe(TABLE_B.tableName);
  });
});

describe('WorkbenchShell — dataset map tab content (W4)', () => {
  it('a map tab renders real DatasetMap content, not the pre-W4 placeholder', async () => {
    useDatasetsStore.setState({ datasets: [DATASET], tables: [TABLE_A] });
    useTabsStore.getState().openTab('map', 'workspace');
    const { getByText, queryByText } = render(<WorkbenchShell />);
    await waitFor(() => expect(getByText(/Skip to data/)).toBeTruthy());
    expect(queryByText('Dataset map (W4)')).toBeNull();
  });
});

describe('WorkbenchShell — module-wiring tab content (W7.5)', () => {
  // This file has no RTL auto-cleanup (see PivotBuilder.test.tsx's own note on
  // the same repo-wide config) — every `render()` in this describe block
  // accumulates in `document.body` rather than replacing the previous test's
  // tree, so assertions here scope to each render's own `container` (matching
  // the "tab host"/"keep-mounted" blocks above in this file) rather than the
  // document-bound `getByText`/`screen`.
  it('a query tab renders its own editor and Run, on its own session (S5)', () => {
    useDatasetsStore.setState({ datasets: [DATASET], tables: [TABLE_A] });
    const tabId = openQueryTab({ sql: 'SELECT 1', name: 'Query 1' });
    const { container } = render(<WorkbenchShell />);
    expect(within(container).getByRole('heading', { name: 'Query 1' })).toBeTruthy();
    expect(container.querySelector(`[data-testid="query-tab-${tabId}"]`)).not.toBeNull();
  });

  it('a pivot tab renders real PivotModule content', () => {
    useDatasetsStore.setState({ datasets: [DATASET], tables: [TABLE_A] });
    useTabsStore.getState().openTab('pivot', 'pivot');
    const { container } = render(<WorkbenchShell />);
    expect(container.querySelector('[data-testid="well-rows"]')).not.toBeNull();
  });

  it('a charts tab renders real ChartsModule content', () => {
    // TABLE_A's one Categorical column clears canDoCategoricalBreakdown —
    // enough for a real chart tab to render, distinguishing this from the
    // pre-W7.5 placeholder.
    useDatasetsStore.setState({ datasets: [DATASET], tables: [TABLE_A] });
    useTabsStore.getState().openTab('charts', 'charts');
    const { container } = render(<WorkbenchShell />);
    expect(within(container).getByRole('tablist', { name: 'Chart type' })).toBeTruthy();
  });

  it('a correlation tab renders real CorrelationModule content', () => {
    useDatasetsStore.setState({ datasets: [DATASET], tables: [TABLE_A] });
    useTabsStore.getState().openTab('correlation', 'correlation');
    const { container } = render(<WorkbenchShell />);
    expect(within(container).getByText(/2 or more numeric columns/)).toBeTruthy();
  });

  it('an export tab renders real ExportModule content', () => {
    useDatasetsStore.setState({ datasets: [DATASET], tables: [] });
    useTabsStore.getState().openTab('export', 'export');
    const { container } = render(<WorkbenchShell />);
    expect(within(container).getByText('Drop a dataset to export tables.')).toBeTruthy();
  });

  it('an ingestion tab renders real IngestionPanel content (S1, closes W2\'s Add-data deferral)', () => {
    useDatasetsStore.setState({ datasets: [DATASET], tables: [TABLE_A] });
    useTabsStore.getState().openTab('ingestion', 'ingestion');
    const { container } = render(<WorkbenchShell />);
    expect(within(container).getByText('Drop files, a folder, or a ZIP')).toBeTruthy();
  });
});

describe('WorkbenchShell — right AI pane, inspector, status bar (W7)', () => {
  beforeEach(() => {
    useDatasetsStore.setState({ datasets: [DATASET] });
  });

  it('mounts AIPane, Inspector, and StatusBar with real content in their regions', () => {
    const { container } = render(<WorkbenchShell />);
    expect(within(container.querySelector('[data-region="ai-pane"]')!).getByText('Off')).toBeTruthy();
    expect(
      within(container.querySelector('[data-region="inspector"]')!).getByText(/Select a table, column, or relationship/),
    ).toBeTruthy();
    expect(within(container.querySelector('[data-region="status-bar"]')!).getByText(/Engine:/)).toBeTruthy();
  });

  // S3: the bottom region is the drawer, not a bare Inspector — and §13.3's
  // stacking is load-bearing, because an expanded drawer must push against the
  // canvas and never over the dock or the status bar.
  it('hosts the inspector drawer in the inspector region, stacked canvas → drawer → dock → status bar (S3)', () => {
    const { container } = render(<WorkbenchShell />);
    const region = container.querySelector('[data-region="inspector"]')!;
    expect(within(region as HTMLElement).getByTestId('inspector-drawer')).toBeTruthy();
    expect(within(region as HTMLElement).getByRole('button', { name: 'SQL Console' })).toBeTruthy();

    // The dock sits between the drawer and the status bar in the JSX, but it
    // renders nothing unless WebLLM is eligible, so it carries no marker to
    // assert against here — these three are the stacking that always holds.
    const order = ['canvas', 'inspector', 'status-bar'].map((name) => {
      const node = container.querySelector(`[data-region="${name}"]`);
      expect(node, `no [data-region="${name}"]`).toBeTruthy();
      return node!;
    });
    for (let i = 0; i < order.length - 1; i += 1) {
      expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('"Configure workspace" (AI pane) opens the shared settings modal with the Mode fieldset hidden', () => {
    const { container } = render(<WorkbenchShell />);
    fireEvent.click(within(container).getByText('Configure workspace'));
    expect(within(container).getByText('AI settings')).toBeTruthy();
    expect(within(container).queryByText('Mode')).toBeNull();
    fireEvent.click(container.querySelector('[aria-label="Close"]')!);
    expect(within(container).queryByText('AI settings')).toBeNull();
  });

  it('the title bar gear opens the same settings modal', () => {
    const { container } = render(<WorkbenchShell />);
    fireEvent.click(within(container).getByLabelText('Settings'));
    expect(within(container).getByText('AI settings')).toBeTruthy();
    expect(within(container).queryByText('Mode')).toBeNull();
  });
});

describe('WorkbenchShell — map auto-open (W4)', () => {
  it('opens the map tab once datasets exist, at a fixed subject so it dedupes as a singleton', () => {
    useDatasetsStore.setState({ datasets: [DATASET] });
    render(<WorkbenchShell />);
    const tabs = useTabsStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ type: 'map', subject: 'workspace' });
  });

  it('does not auto-open until datasets actually appear, and does not reopen after the user closes it', () => {
    const { container, rerender } = render(<WorkbenchShell />);
    expect(useTabsStore.getState().tabs).toHaveLength(0);

    useDatasetsStore.setState({ datasets: [DATASET] });
    rerender(<WorkbenchShell />);
    expect(useTabsStore.getState().tabs).toHaveLength(1);

    fireEvent.click(container.querySelector<HTMLButtonElement>('[aria-label="Close map · workspace"]')!);
    expect(useTabsStore.getState().tabs).toHaveLength(0);

    rerender(<WorkbenchShell />);
    expect(useTabsStore.getState().tabs).toHaveLength(0);
  });
});

describe('WorkbenchShell — viewer mode (W8, D62 Workbench amendment)', () => {
  const DOC: StructureReport = {
    dspsVersion: '1.0.0',
    generatedAt: '2026-07-25T12:00:00.000Z',
    tables: [{ tableName: 'orders', rowCount: 5, columnCount: 1, columns: [] }],
    insights: [],
  };

  it('renders viewer mode instead of Act 0 when a .dsps document is present, with no datasets loaded', () => {
    useDspsReceiverStore.setState({ document: DOC });
    const { container } = render(<WorkbenchShell />);
    expect(container.querySelector('[data-act="viewer"]')).not.toBeNull();
    expect(container.querySelector('[data-act="act0"]')).toBeNull();
  });

  it('renders viewer mode instead of the shell grid even when datasets already exist', () => {
    useDatasetsStore.setState({ datasets: [DATASET] });
    useDspsReceiverStore.setState({ document: DOC });
    const { container } = render(<WorkbenchShell />);
    expect(container.querySelector('[data-act="viewer"]')).not.toBeNull();
    expect(container.querySelector('[data-act="shell"]')).toBeNull();
  });

  it('renders viewer mode on a receiver error too, even with no document', () => {
    useDspsReceiverStore.setState({ error: "isn't a DSPS document this version can read" });
    const { container } = render(<WorkbenchShell />);
    expect(container.querySelector('[data-act="viewer"]')).not.toBeNull();
    expect(container.textContent).toContain("isn't a DSPS document");
  });

  it('"Start my own session" returns to the ordinary shell', () => {
    useDspsReceiverStore.setState({ document: DOC });
    const { container } = render(<WorkbenchShell />);
    fireEvent.click(within(container).getByText('Start my own session'));
    expect(useDspsReceiverStore.getState().document).toBeNull();
  });
});

// Ported from App.test.tsx's "opening a share link" describe block
// (HANDOFF-W8-CUTOVER.md) — both outcomes now route through
// useDspsReceiverStore/ViewerMode instead of SharedStructureReportView.
describe('WorkbenchShell — opening a share link (§12.3)', () => {
  beforeEach(() => {
    vi.mocked(ingestionService.loadSharedDataset).mockReset();
    window.history.pushState({}, '', '/?share=tok-1');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders the read-only viewer for a structure-only share', async () => {
    const report: StructureReport = {
      dspsVersion: '1.0.0',
      generatedAt: '2026-07-23T00:00:00.000Z',
      tables: [{ tableName: 'orders', rowCount: 5, columnCount: 1, columns: [] }],
      insights: [],
    };
    vi.mocked(ingestionService.loadSharedDataset).mockResolvedValue({
      kind: 'structure-report',
      structureReport: report,
    });

    const { container } = render(<WorkbenchShell />);

    await waitFor(() => expect(container.querySelector('[data-act="viewer"]')).not.toBeNull());
    expect(container.textContent).toContain('orders');
    expect(window.location.search).toBe('');
  });

  it('registers the dataset and auto-opens the map for a full-dataset share', async () => {
    // Mirrors loadSharedDataset's real dataset branch, which calls
    // registerDataset directly (ingestion.ts) before returning — the map
    // auto-open picks up the newly-registered dataset on its own.
    vi.mocked(ingestionService.loadSharedDataset).mockImplementation(async () => {
      useDatasetsStore.getState().registerDataset(DATASET, []);
      return { kind: 'dataset', dataset: DATASET };
    });

    render(<WorkbenchShell />);

    await waitFor(() => expect(useTabsStore.getState().tabs).toHaveLength(1));
    expect(useTabsStore.getState().tabs[0]).toMatchObject({ type: 'map', subject: 'workspace' });
    expect(window.location.search).toBe('');
  });

  it('renders the viewer error state when the share link cannot be opened, without breaking the rest of the app', async () => {
    vi.mocked(ingestionService.loadSharedDataset).mockRejectedValue(
      new ingestionService.IngestionError("This share link doesn't exist or has expired."),
    );

    const { container } = render(<WorkbenchShell />);

    await waitFor(() => expect(container.textContent).toContain("This share link doesn't exist or has expired."));
    expect(container.querySelector('[data-act="viewer"]')).not.toBeNull();
    expect(window.location.search).toBe('');
  });
});

// Ported from WebLLMDock.test.tsx's own eligibility fixture (HANDOFF-W8-CUTOVER.md)
// — only proves WorkbenchShell mounts the dock, not the dock's own internals.
describe('WorkbenchShell — WebLLM consent dock (D70)', () => {
  beforeEach(() => {
    useDatasetsStore.setState({ datasets: [DATASET] });
    useSettingsStore.setState({ aiMode: 'cloud', webllmConsent: null });
    useByokKeyStore.setState({ key: null });
    // jsdom has no WebGPU; the dock's eligibility gate reads `'gpu' in navigator`.
    Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
  });

  it('mounts the consent banner above the status bar when eligible', () => {
    const { container } = render(<WorkbenchShell />);
    expect(container.textContent).toContain('Run AI fully on your device?');
  });
});
