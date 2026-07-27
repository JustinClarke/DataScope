// The Workbench's title bar (V2, §13.3) — the sixth shell region W1 never
// scaffolded. Wordmark, the loaded dataset's identity, the ⌘K palette
// launcher, and the sole settings entry point (moved off StatusBar, scope
// call 2 of build/13-hallmark-replication/02-shell-chrome.md).
import { Settings } from 'lucide-react';
import { useDatasetsStore } from '../stores/datasets';
import { usePaletteOpenStore } from '../stores/paletteOpen';

interface TitleBarProps {
  onOpenSettings: () => void;
}

// Honest degrade for the real multi-dataset session model (scope call 5):
// `useDatasetsStore.datasets` has no "active" concept and no cap, unlike the
// mock's single illustrative dataset — naming one dataset "active" once a
// second, unrelated one is loaded would be a fabricated label. Names the
// dataset only when exactly one exists; falls back to a plain table count
// otherwise (zero datasets or more than one).
function datasetLabel(datasetName: string | undefined, tableCount: number): string {
  if (datasetName !== undefined) return `${datasetName} · ${tableCount} tables`;
  return `${tableCount} tables`;
}

export function TitleBar({ onOpenSettings }: TitleBarProps) {
  const datasets = useDatasetsStore((state) => state.datasets);
  const tables = useDatasetsStore((state) => state.tables);
  const label = datasetLabel(datasets.length === 1 ? datasets[0].name : undefined, tables.length);

  return (
    <div
      data-testid="title-bar"
      className="flex items-center justify-between border-b border-(--color-rule-2) bg-(--color-chrome) px-4 py-1.5"
    >
      <div className="flex items-center gap-3">
        <span className="text-[length:var(--text-xl)] font-semibold tracking-[-0.01em]">
          <span className="text-(--color-ink)">Data</span>
          <span className="text-(--color-active)">Scope</span>
        </span>
        <span aria-hidden="true" className="h-4 w-px bg-(--color-rule)" />
        <span className="micro text-(--color-ink-3)">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="title-bar-palette-button"
          onClick={() => usePaletteOpenStore.getState().toggle()}
          className="flex items-center gap-2 rounded-(--radius-sm) border border-(--color-rule) bg-(--color-panel) px-2 py-1 font-mono text-[length:var(--text-md)] text-(--color-ink-2) hover:border-(--color-rule-hi) hover:text-(--color-ink)"
        >
          Search &amp; actions
          <span className="rounded-(--radius-xs) border border-(--color-rule) px-1 text-(--color-ink-3)">⌘K</span>
        </button>
        <button
          type="button"
          aria-label="Settings"
          onClick={onOpenSettings}
          className="rounded-(--radius-sm) border border-(--color-rule) bg-(--color-panel) p-1.5 text-(--color-ink-2) hover:border-(--color-rule-hi) hover:text-(--color-ink)"
        >
          <Settings size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
