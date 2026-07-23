import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import App from './App';
import { useUIStore } from '../stores/ui';
import { useDatasetsStore } from '../stores/datasets';
import { useSettingsStore } from '../stores/settings';

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
