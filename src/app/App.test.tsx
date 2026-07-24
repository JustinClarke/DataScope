import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/react';
import App from './App';
import { useUIStore } from '../stores/ui';
import { useDatasetsStore } from '../stores/datasets';
import { useSettingsStore } from '../stores/settings';
import { useDspsReceiverStore } from '../stores/dspsReceiver';
import * as ingestionService from '../services/ingestion';

vi.mock('../services/ingestion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/ingestion')>();
  return { ...actual, loadSharedDataset: vi.fn(actual.loadSharedDataset) };
});

describe('App - module switching', () => {
  beforeEach(() => {
    useUIStore.setState({ activeModule: 'ingestion', activeTabId: null });
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
    });
  });

  it('renders the header and footer', () => {
    const { container } = render(<App />);

    const header = container.querySelector('header');
    const footer = container.querySelector('footer');

    expect(header?.textContent).toContain('DataScope');
    expect(footer?.textContent).toContain('Web Worker: Idle');
  });

  it('shows current active module in the workspace', () => {
    const { container } = render(<App />);

    // Default module is 'ingestion' - the real IngestionPanel renders here,
    // not the generic "<Module> panel" placeholder other modules still use.
    const mainArea = container.querySelector('main');
    expect(mainArea?.textContent).toContain('Drop files, a folder, or a ZIP archive here');
  });

  it('rapid module switching shows only the last module', () => {
    const { rerender } = render(<App />);

    // Rapidly switch modules
    useUIStore.getState().setActiveModule('sql');
    useUIStore.getState().setActiveModule('profile');
    useUIStore.getState().setActiveModule('ai');

    // Re-render to see the latest state
    rerender(<App />);

    // The 'ai' route renders the real AI Chat module (its empty state), not the
    // generic "<Module> panel" fallback other unbuilt modules still use.
    const mainArea = document.querySelector('main');
    expect(mainArea?.textContent).toContain('Ask a question in plain English');
  });

  it('renders educational panel in the workspace', () => {
    const { container } = render(<App />);
    const mainArea = container.querySelector('main');

    expect(mainArea?.textContent).toContain('Nothing to explain yet');
  });

  it('renders sidebar with all navigation cards, grouped', () => {
    const { container } = render(<App />);
    const sidebar = container.querySelector('aside')!;

    expect(sidebar.textContent).toContain('DATA');
    expect(sidebar.textContent).toContain('Ingest');
    expect(sidebar.textContent).toContain('Blueprint');
    expect(sidebar.textContent).toContain('Profile');
    expect(sidebar.textContent).toContain('EXPLORE');

    // EXPLORE starts collapsed pre-drop (§13.2, D68d) — expand it to reach its cards.
    fireEvent.click(within(sidebar).getByText('EXPLORE'));
    expect(sidebar.textContent).toContain('SQL');
    expect(sidebar.textContent).toContain('Charts');
  });

  it('renders a header help icon rather than a Learn nav destination', () => {
    const { container } = render(<App />);
    const sidebar = container.querySelector('aside');
    const header = container.querySelector('header');

    expect(sidebar?.textContent).not.toContain('Learn');
    expect(header?.querySelector('[aria-label="Help"]')).not.toBeNull();
  });
});

describe('App - opening a share link (§12.3)', () => {
  beforeEach(() => {
    useUIStore.setState({ activeModule: 'ingestion', activeTabId: null });
    useDatasetsStore.setState({ tables: [], datasets: [], workerStatus: 'idle', workerError: null });
    useSettingsStore.setState({ aiMode: null, byokPreference: 'free-tier-first', theme: 'system', skipToData: false });
    vi.mocked(ingestionService.loadSharedDataset).mockReset();
    window.history.pushState({}, '', '/?share=tok-1');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders the read-only structure report viewer for a structure-only share', async () => {
    const report = { dspsVersion: '1.0.0', generatedAt: '2026-07-23T00:00:00.000Z', tables: [], insights: [] };
    vi.mocked(ingestionService.loadSharedDataset).mockResolvedValue({ kind: 'structure-report', structureReport: report });

    const { container } = render(<App />);

    await waitFor(() => expect(within(container).getByRole('dialog', { name: /shared structure report/i })).toBeTruthy());
    expect(window.location.search).toBe('');
  });

  it('lands on the Blueprint after opening a full-dataset share', async () => {
    vi.mocked(ingestionService.loadSharedDataset).mockResolvedValue({
      kind: 'dataset',
      dataset: { id: 'ds-1', name: 'Shared dataset', sourceType: 'shared', tableNames: ['shared_dataset'], ingestedAt: new Date().toISOString() },
    });

    render(<App />);

    await waitFor(() => expect(useUIStore.getState().activeModule).toBe('dossier'));
    expect(window.location.search).toBe('');
  });

  it('shows a dismissible error banner when the share link cannot be opened, without breaking the rest of the app', async () => {
    vi.mocked(ingestionService.loadSharedDataset).mockRejectedValue(
      new ingestionService.IngestionError("This share link doesn't exist or has expired."),
    );

    const { container } = render(<App />);

    await waitFor(() => expect(container.textContent).toContain("This share link doesn't exist or has expired."));
    // The rest of the app stays fully functional (§4) — ingestion is still reachable.
    expect(container.querySelector('main')?.textContent).toContain('Drop files, a folder, or a ZIP archive here');
    expect(window.location.search).toBe('');
  });
});

describe('App - .dsps receiver (D62)', () => {
  beforeEach(() => {
    useUIStore.setState({ activeModule: 'ingestion', activeTabId: null });
    useDatasetsStore.setState({ tables: [], datasets: [], workerStatus: 'idle', workerError: null });
    useSettingsStore.setState({ aiMode: null, byokPreference: 'free-tier-first', theme: 'system' });
    useDspsReceiverStore.setState({ document: null, error: null });
  });

  it('renders the read-only viewer when the receiver store holds a parsed document — no network call involved', () => {
    useDspsReceiverStore.getState().open({
      dspsVersion: '1.0.0',
      generatedAt: '2026-07-23T00:00:00.000Z',
      tables: [{ tableName: 'orders', rowCount: 5, columnCount: 1, columns: [] }],
      insights: [],
    });

    const { container } = render(<App />);
    expect(within(container).getByRole('dialog', { name: /shared structure report/i })).toBeTruthy();
    expect(container.textContent).toContain('orders');
  });

  it('closing the viewer clears the receiver store', () => {
    useDspsReceiverStore.getState().open({
      dspsVersion: '1.0.0',
      generatedAt: '2026-07-23T00:00:00.000Z',
      tables: [],
      insights: [],
    });
    const { container } = render(<App />);
    fireEvent.click(within(container).getByLabelText('Close'));
    expect(useDspsReceiverStore.getState().document).toBeNull();
  });

  it('renders a dismissible error banner when the store holds an error', () => {
    useDspsReceiverStore.getState().fail("\"broken.dsps\" isn't valid JSON.");
    const { container } = render(<App />);
    expect(container.textContent).toContain("isn't valid JSON");
    fireEvent.click(within(container).getByText('Dismiss'));
    expect(useDspsReceiverStore.getState().error).toBeNull();
  });
});
