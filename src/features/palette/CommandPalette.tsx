// The command palette (⌘K / Ctrl+K) — the universal cross-tab launcher (W5,
// D71, master §13.3). Mounted once in `WorkbenchShell`'s `ShellGrid`; its
// registry (`lib/paletteRegistry.ts`) names every feature home, real or not
// yet wired — see build/12-workbench/06-options-strip-palette.md.
import { useEffect, useMemo, useState } from 'react';
import { useDatasetsStore } from '../../stores/datasets';
import { useTabsStore } from '../../stores/tabs';
import { usePaletteOpenStore } from '../../stores/paletteOpen';
import { useDrawerStore } from '../../stores/drawer';
import { openDestination } from '../../services/navigation';
import { openQueryTab } from '../../services/queryTabs';
import { buildPaletteEntries, type PaletteEntry } from '../../lib/paletteRegistry';
import { Tooltip } from '../../components/Tooltip';
import { MAP_TAB_SUBJECT } from '../../app/WorkbenchShell';
import { TAB_GLYPH, type TabType } from '../../types/tabs';

function activate(entry: PaletteEntry): void {
  if (entry.action.kind === 'open-map') {
    useTabsStore.getState().openTab('map', MAP_TAB_SUBJECT);
  } else if (entry.action.kind === 'open-profile') {
    openDestination('profile', entry.action.tableId);
  } else if (entry.action.kind === 'open-module') {
    openDestination(entry.action.module);
  } else if (entry.action.kind === 'open-console') {
    useDrawerStore.getState().activateConsole();
  } else if (entry.action.kind === 'new-query-tab') {
    openQueryTab();
  }
}

// The one remaining not-yet-wired entry has no `TabType` to look up in
// `TAB_GLYPH` — this is the mock's own literal glyph for this exact command
// (✦ Ask AI), not an invented placeholder (V5 scope call 5). `ingestion`
// (＋ Add data) used to share this fallback; S1 wired it for real, so it now
// resolves through `TAB_GLYPH['ingestion']` like every other module below.
const UNAVAILABLE_GLYPH: Record<string, string> = { ai: '✦' };

function entryTabType(entry: PaletteEntry): TabType | null {
  if (entry.action.kind === 'open-map') return 'map';
  if (entry.action.kind === 'open-profile') return 'profile';
  if (entry.action.kind === 'open-module') return entry.action.module;
  // Both SQL entries reuse the query tab's glyph (S5): the console and a query
  // tab are the same kind of surface, one shared and one kept.
  if (entry.action.kind === 'open-console' || entry.action.kind === 'new-query-tab') return 'query';
  return null;
}

// Reuses `TAB_GLYPH` (V2, `types/tabs.ts`) — the palette's own icon column,
// not a second glyph table (V5 scope call 4). The mock's `.pcmd__g` icons are
// uniformly muted, never accent-colored, so this never branches on active
// state the way the tab strip's own glyph renderer does.
function EntryGlyph({ entry }: { entry: PaletteEntry }) {
  const tabType = entryTabType(entry);
  if (tabType) {
    const glyph = TAB_GLYPH[tabType];
    if (glyph.kind === 'dingbat') return <span aria-hidden="true">{glyph.char}</span>;
    const Icon = glyph.Icon;
    return <Icon aria-hidden="true" size={13} />;
  }
  return <span aria-hidden="true">{UNAVAILABLE_GLYPH[entry.id] ?? '▸'}</span>;
}

export function CommandPalette() {
  const open = usePaletteOpenStore((state) => state.open);
  const [query, setQuery] = useState('');
  const tables = useDatasetsStore((state) => state.tables);

  const entries = useMemo(() => buildPaletteEntries(tables), [tables]);
  const filtered = useMemo(
    () => entries.filter((entry) => entry.label.toLowerCase().includes(query.toLowerCase())),
    [entries, query],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        usePaletteOpenStore.getState().toggle();
      } else if (event.key === 'Escape') {
        usePaletteOpenStore.getState().setOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const close = () => {
    usePaletteOpenStore.getState().setOpen(false);
    setQuery('');
  };

  const handleSelect = (entry: PaletteEntry) => {
    if (!entry.enabled) return;
    activate(entry);
    close();
  };

  if (!open) return null;

  return (
    <div
      data-testid="command-palette"
      role="dialog"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-(--color-scrim) pt-[4.5rem]"
      onClick={close}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-(--radius-xl) border border-(--color-rule) bg-(--color-card) shadow-(--shadow-overlay)"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-(--color-rule-2) px-4 py-3">
          <span aria-hidden="true" className="font-mono text-[length:var(--text-xs)] text-(--color-ink-3)">
            ⌘K
          </span>
          <input
            autoFocus
            data-testid="command-palette-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to…"
            className="flex-1 bg-transparent font-sans text-[length:var(--text-xl)] text-(--color-ink) outline-none placeholder:text-(--color-ink-3)"
          />
        </div>
        <ul className="max-h-[22rem] overflow-y-auto p-1">
          {filtered.map((entry) => {
            const button = (
              <button
                type="button"
                data-testid={`command-palette-entry-${entry.id}`}
                disabled={!entry.enabled}
                onClick={() => handleSelect(entry)}
                className={`flex w-full items-center gap-2.5 rounded-(--radius-md) px-2.5 py-2 text-left font-sans text-[length:var(--text-lg)] ${
                  entry.enabled
                    ? 'text-(--color-ink-2) hover:bg-(--color-elev) hover:text-(--color-ink)'
                    : 'cursor-not-allowed text-(--color-ink-3) opacity-50'
                }`}
              >
                <span aria-hidden="true" className="w-[1.1rem] text-center text-(--color-ink-3)">
                  <EntryGlyph entry={entry} />
                </span>
                <span>{entry.label}</span>
              </button>
            );
            return (
              <li key={entry.id}>{entry.disabledReason ? <Tooltip content={entry.disabledReason}>{button}</Tooltip> : button}</li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
