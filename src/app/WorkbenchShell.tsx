// The Workbench's grid shell (W1, D71, master §13.3) — the app's only
// composition root as of the W8 cutover. The explorer (W2), map/profile tabs
// (W3/W4), Acts 0/1 (W6), and the ai-pane/inspector/status-bar regions (W7)
// all have real content now.
import { useEffect, useRef, useState } from 'react';
import { useDatasetsStore } from '../stores/datasets';
import { useTabsStore } from '../stores/tabs';
import { useDspsReceiverStore } from '../stores/dspsReceiver';
import { TAB_GLYPH, TAB_KIND, type TabSpec, type TabType } from '../types/tabs';
import { selectWorkbenchAct } from './workbenchActs';
import { TitleBar } from './TitleBar';
import { SpecimenPlate } from './SpecimenPlate';
import { ViewerMode } from '../features/viewer/ViewerMode';
import { ExplorerPanel } from '../features/explorer/ExplorerPanel';
import { ProfileDashboard } from '../features/profiling/ProfileDashboard';
import { DatasetMap } from '../features/map/DatasetMap';
import { SqlModule } from '../features/sql/SqlModule';
import { PivotModule } from '../features/sql/PivotModule';
import { ChartsModule } from '../features/charts/ChartsModule';
import { CorrelationModule } from '../features/charts/correlation/CorrelationModule';
import { ExportModule } from '../features/export/ExportModule';
import { CommandPalette } from '../features/palette/CommandPalette';
import { IngestionPanel } from '../features/ingestion/IngestionPanel';
import { AIPane } from '../features/ai/AIPane';
import { AISettingsPanel } from '../features/ai/AISettingsPanel';
import { WebLLMDock } from '../features/ai/WebLLMDock';
import { Inspector } from '../features/inspector/Inspector';
import { StatusBar } from '../features/status/StatusBar';
import { useApplyWorkbenchAIDefault } from './useApplyWorkbenchAIDefault';
import { EducationalPanelProvider } from './EducationalPanelContext';
import { loadSharedDataset, IngestionError } from '../services/ingestion';

/** The map is dataset-wide, not per-table — there is no natural per-table subject the way `'profile'` has one (W4, §13.3). Exported for the command palette's map entry (W5). */
export const MAP_TAB_SUBJECT = 'workspace';

// The hairline grid mark (V6d, the mock's `.gridmark`) — a 3×3 CSS grid, not
// an image or an icon font: a quiet nod to tabular data that costs no request
// and inherits the register. Cells 1 and 5 carry the amber.
//
// Sized at 1em rather than V6d's 0.62em: this mark appears exactly once, on the
// masthead, where the wordmark is the subject rather than chrome. At 0.62em of
// `--text-2xl` the nine cells resolve to ~3.8px each behind 0.5px hairlines and
// the whole thing reads as a smudge — the 3×3 has to actually be legible for
// the nod to land.
const GRID_MARK_CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

function GridMark() {
  return (
    <span
      aria-hidden="true"
      className="mr-2 inline-grid h-[1em] w-[1em] grid-cols-3 grid-rows-3 border border-(--color-ink) align-[-0.1em]"
    >
      {GRID_MARK_CELLS.map((cell) => (
        <span
          key={cell}
          className={`border-[0.5px] border-(--color-rule) ${cell === 0 || cell === 4 ? 'bg-(--color-active)' : ''}`}
        />
      ))}
    </span>
  );
}

// Act 0 welcome (W6, §13.3) — carrying `welcome-act0.html`'s editorial
// composition since V6d (`build/13-hallmark-replication/06d-act0.md`): the
// masthead, the three numbered sections and the footer band. Its Specimen
// register (light paper, Fraunces, violet) is deliberately *not* ported —
// human call, 2026-07-25, recorded in `design.md` § Variants and master §19 —
// so this page is the HUD register in an editorial arrangement, with no
// light→dark seam at ingest. The mock's staggered entrance reveal is likewise
// unported (design.md § Motion: "Reveal pattern: none").
//
// Two later amendments, same date, also in `design.md` § Variants:
//
// 1. **One viewport, no page scroll at `lg` and up.** The mock's stacked
//    column is a scrolling document; Act 0 is a decision surface, so the three
//    sections re-flow into a `100svh` frame — masthead over
//    `editorial | ingest` over the footer band. The two columns are the only
//    things that scroll, and only when a short viewport forces it
//    (`min-h-0` + `lg:overflow-y-auto` on each). Numbering and order survive:
//    01 → 03 reads down the left column, 02 is the right one. **Below `lg` the
//    page flows and scrolls normally** — a phone cannot hold a drop target, a
//    URL field and five samples at once, and a cramped layout would cost more
//    than the scroll does.
// 2. **The `SpecimenPlate`** (§ Per-page allowances' Entry-page clause) sits in
//    the left column's slack, between 01 and 03.
//
// `IngestionPanel` is mounted unchanged: its own `TelemetryPanel` already
// renders honest phase labels (fetching/loading-engine/parsing/done/error), so
// Act 1 needs no second progress UI — it is this same content staying mounted
// while the DuckDB worker finishes booting in the background, not a different
// screen. Its internal `navigateToPostIngestLanding()` call reaches the old
// shell's `useUIStore`, which nothing here reads — harmlessly inert here.
function Welcome() {
  return (
    <div className="flex min-h-svh flex-col bg-(--color-canvas) text-(--color-ink) lg:h-svh lg:overflow-hidden">
      <header className="shrink-0 px-6 pt-6 pb-3 text-center">
        <p className="micro text-(--color-ink-3)">
          Runs entirely in your browser — nothing leaves your machine
        </p>
        <p className="mt-2 text-[length:var(--text-2xl)] font-semibold tracking-[-0.01em]">
          <GridMark />
          <span className="text-(--color-ink)">Data</span>
          <span className="text-(--color-active)">Scope</span>
        </p>
        <div aria-hidden="true" className="mt-3 border-t border-(--color-rule)" />
        <div aria-hidden="true" className="mt-1 border-t border-(--color-rule-2)" />
      </header>

      <main className="mx-auto grid w-full max-w-[86rem] flex-1 grid-cols-1 gap-x-12 px-6 lg:min-h-0 lg:grid-cols-2">
        {/* 01 and 03 read down one column, with the specimen taking whatever
            vertical slack the viewport leaves between them. */}
        <div className="flex flex-col py-6 lg:min-h-0 lg:overflow-y-auto">
          <section>
            <p className="micro text-(--color-ink-3)">01 — Local-first.</p>
            <h1 className="mt-3 max-w-[16ch] text-[length:var(--text-display-s)] leading-tight font-semibold tracking-[-0.02em]">
              Nothing leaves your machine.
            </h1>
            <p className="mt-3 max-w-[52ch] text-[length:var(--text-lg)] leading-relaxed text-(--color-ink-2)">
              DataScope runs entirely in your browser. No upload, no server round-trip, no account —
              everything you drop in stays on this device, for as long as this tab is open.
            </p>
          </section>

          {/* The plate is the column's shock absorber: `flex-1 min-h-0` on the
              svg lets it give height back on a short viewport instead of
              pushing 03 out of the frame, and its `meet` aspect ratio simply
              letterboxes rather than distorting. */}
          <figure className="flex min-h-0 flex-1 flex-col justify-center gap-3 py-4">
            <SpecimenPlate />
            <figcaption className="max-w-[46ch] text-[length:var(--text-base)] leading-relaxed text-(--color-ink-3)">
              Point it at the e-commerce sample and this is what it works out on its own — which
              column is a{' '}
              <span className="text-(--color-pk)">primary key</span>, where one table{' '}
              <span className="text-(--color-fk)">joins</span> another, and the shape of everything
              inside them.
            </figcaption>
          </figure>

          <section className="border-t border-(--color-rule) pt-6">
            <p className="micro text-(--color-ink-3)">03 — Then it's yours.</p>
            <h2 className="mt-3 max-w-[20ch] text-[length:var(--text-2xl)] font-semibold tracking-[-0.02em]">
              No model runs until you turn one on.
            </h2>
            <p className="mt-3 max-w-[52ch] text-[length:var(--text-lg)] leading-relaxed text-(--color-ink-2)">
              AI is off by default. The map, the profile and every tool here run on your own machine
              first — turn a model on when you want one, and choose where it runs.
            </p>
          </section>
        </div>

        {/* The vertical rule replaces the mock's horizontal divider between
            sections — same hairline, turned ninety degrees by the two-column
            frame. It only exists once the columns do. */}
        <div className="flex flex-col py-6 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-(--color-rule) lg:pl-12">
          <p className="micro text-(--color-ink-3)">02 — Bring data.</p>
          <h2 className="mt-3 max-w-[20ch] text-[length:var(--text-2xl)] font-semibold tracking-[-0.02em]">
            Drop a file, paste a link, or start from a sample.
          </h2>
          <div className="mt-4 flex-1">
            <IngestionPanel />
          </div>
        </div>
      </main>

      <footer className="shrink-0 border-t border-(--color-rule) bg-(--color-footer) px-6 py-3">
        <p className="mx-auto max-w-[86rem] font-mono text-[length:var(--text-sm)] text-(--color-ink-3)">
          <span className="text-(--color-ink)">DataScope</span> · a local-first data workbench
        </p>
      </footer>
    </div>
  );
}

function Act0() {
  return (
    <div data-act="act0">
      <Welcome />
    </div>
  );
}

function Act1() {
  return (
    <div data-act="act1">
      <Welcome />
    </div>
  );
}

// Per-tab-type content (W3/W4/W7.5). `prefill` is the tab's own D68e
// initializer, threaded down the same way `initialTableId` already is —
// never a second global (see `hooks/useThreadPrefill.ts`'s `override` doc).
function TabContent({ tab }: { tab: TabSpec }) {
  const prefill = tab.initializer?.prefilledConfig ?? null;
  if (tab.type === 'profile') return <ProfileDashboard initialTableId={tab.subject} />;
  if (tab.type === 'sql') return <SqlModule prefill={prefill} />;
  if (tab.type === 'pivot') return <PivotModule prefill={prefill} />;
  if (tab.type === 'charts') return <ChartsModule prefill={prefill} requestedTab={tab.subject} />;
  if (tab.type === 'correlation') return <CorrelationModule prefill={prefill} />;
  if (tab.type === 'export') return <ExportModule />;
  return <DatasetMap />;
}

// Per-`TabType` glyph (V2, `TAB_GLYPH`) — every glyph inherits `currentColor`,
// so the active/inactive/artifact colour lives on this wrapper's own class,
// never per-glyph special-casing (design.md Iconography). The artifact/purple
// branch reads `TAB_KIND` directly rather than a fabricated tab type — it is
// unreachable today since every `TabType` maps to `'singleton'`.
function TabHeaderGlyph({ type, isActive }: { type: TabType; isActive: boolean }) {
  const glyph = TAB_GLYPH[type];
  const isArtifact = TAB_KIND[type] === 'artifact';
  const colorClass = isActive
    ? isArtifact
      ? 'text-(--color-fk)'
      : 'text-(--color-active)'
    : 'text-(--color-ink-3)';
  if (glyph.kind === 'dingbat') {
    return (
      <span aria-hidden="true" className={colorClass}>
        {glyph.char}
      </span>
    );
  }
  const Icon = glyph.Icon;
  return <Icon aria-hidden="true" size={12} className={colorClass} />;
}

// The real tab host (W3): clickable headers switch/close; every open tab's
// content stays mounted (`hidden`, never a conditional unmount) so state
// survives a switch-away/switch-back — the keep-mounted-first contract §13.3
// names as the v0 preservation norm.
function TabHost() {
  const tabs = useTabsStore((state) => state.tabs);
  const activeTabId = useTabsStore((state) => state.activeTabId);
  const setActiveTab = useTabsStore((state) => state.setActiveTab);
  const closeTab = useTabsStore((state) => state.closeTab);

  if (tabs.length === 0) {
    return <div data-testid="tab-host-empty">No tabs open</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div
        data-testid="tab-host"
        className="flex overflow-x-auto border-b border-(--color-rule-2) bg-(--color-chrome)"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              data-testid={`tab-header-${tab.id}`}
              data-active={isActive}
              className={`flex items-center gap-1.5 border-r border-(--color-rule) px-2 py-1 font-mono text-[length:var(--text-xs)] ${
                isActive ? 'bg-(--color-canvas) text-(--color-ink)' : 'text-(--color-ink-3) hover:text-(--color-ink-2)'
              }`}
            >
              <button type="button" onClick={() => setActiveTab(tab.id)} className="flex items-center gap-1.5">
                <TabHeaderGlyph type={tab.type} isActive={isActive} />
                {tab.type} · {tab.subject}
              </button>
              <button
                type="button"
                aria-label={`Close ${tab.type} · ${tab.subject}`}
                onClick={() => closeTab(tab.id)}
                className="rounded-(--radius-xs) p-0.5 text-(--color-ink-3) hover:bg-(--color-elev) hover:text-(--color-ink)"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {tabs.map((tab) => (
          <div key={tab.id} data-testid={`tab-content-${tab.id}`} hidden={tab.id !== activeTabId}>
            <TabContent tab={tab} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ShellGrid() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  useApplyWorkbenchAIDefault();
  const openSettings = () => setSettingsOpen(true);

  return (
    <EducationalPanelProvider>
      <div data-act="shell" className="flex h-svh flex-col">
        <TitleBar onOpenSettings={openSettings} />
        <div className="flex flex-1 overflow-hidden">
          <div data-region="explorer" className="w-64 border-r border-(--color-rule) bg-(--color-panel)">
            <ExplorerPanel />
          </div>
          <div data-region="canvas" className="flex-1 overflow-auto bg-(--color-canvas)">
            <TabHost />
          </div>
          <div data-region="ai-pane" className="bg-(--color-panel)">
            <AIPane onConfigure={openSettings} />
          </div>
        </div>
        <div data-region="inspector" className="border-t border-(--color-rule) bg-(--color-panel)">
          <Inspector />
        </div>
        <WebLLMDock />
        <div data-region="status-bar" className="border-t border-(--color-rule-2) bg-(--color-chrome)">
          <StatusBar />
        </div>
      </div>
      <CommandPalette />
      {settingsOpen && <AISettingsPanel hideModeSwitch onClose={() => setSettingsOpen(false)} />}
    </EducationalPanelProvider>
  );
}

// The map is "the opening tab" (§13.3) for a genuinely fresh landing, but
// nothing before W4 ever called `openTab('map', …)` — a fresh shell only
// ever showed one if some other caller happened to route there.
// Ref-guarded so this decides at most once per session and never reopens the
// tab after the user closes it.
// Gated on zero tabs already being open (checked imperatively at fire time,
// not a reactive dependency — same pattern the `openTab` call below already
// uses) so it never forces itself into a session that already has tabs open
// by the time datasets first appear. A manual way to reopen the map after
// closing it is W5's job (the palette must reach every feature home).
function useMapAutoOpen(hasDatasets: boolean): void {
  const triggered = useRef(false);
  useEffect(() => {
    if (!hasDatasets || triggered.current) return;
    triggered.current = true;
    if (useTabsStore.getState().tabs.length === 0) {
      useTabsStore.getState().openTab('map', MAP_TAB_SUBJECT);
    }
  }, [hasDatasets]);
}

// Opening a share link (§12.3): `?share=<token>` on the app's own URL, the
// same query param ShareDialog builds. Handled once per load — the param is
// stripped from the URL immediately after, whether the open succeeds or
// fails, so a refresh never re-triggers it. Ported from the old shell's
// AppContent (HANDOFF-W8-CUTOVER.md): both outcomes now route through
// useDspsReceiverStore, reusing ViewerMode as the shared render target
// instead of a second bespoke banner/modal. The full-dataset case needs no
// handling here — `loadSharedDataset` already calls `registerDataset`
// directly, and `useMapAutoOpen` picks up the newly-registered dataset on its
// own; adding a second navigation path here would fight that one.
function useShareLinkOpener(): void {
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    const token = new URLSearchParams(window.location.search).get('share');
    if (!token) return;
    handled.current = true;

    void loadSharedDataset(token)
      .then((result) => {
        if (result.kind === 'structure-report' && result.structureReport) {
          useDspsReceiverStore.getState().open(result.structureReport);
        }
      })
      .catch((error: unknown) => {
        useDspsReceiverStore
          .getState()
          .fail(error instanceof IngestionError ? error.message : "Couldn't open this share link.");
      })
      .finally(() => {
        window.history.replaceState(null, '', window.location.pathname);
      });
  }, []);
}

export function WorkbenchShell() {
  const hasDatasets = useDatasetsStore((state) => state.datasets.length > 0);
  const workerStatus = useDatasetsStore((state) => state.workerStatus);
  const dspsDocument = useDspsReceiverStore((state) => state.document);
  const dspsError = useDspsReceiverStore((state) => state.error);
  const act = selectWorkbenchAct({ hasDatasets, workerStatus });
  useMapAutoOpen(hasDatasets);
  useShareLinkOpener();

  // Viewer mode (W8, D62 Workbench amendment) wins regardless of act — a
  // dropped `.dsps` presents immediately whether or not any dataset is
  // already loaded, mirroring the old shell's own App.tsx handling.
  if (dspsDocument || dspsError) return <ViewerMode document={dspsDocument} error={dspsError} />;
  if (act === 'act0') return <Act0 />;
  if (act === 'act1') return <Act1 />;
  return <ShellGrid />;
}
