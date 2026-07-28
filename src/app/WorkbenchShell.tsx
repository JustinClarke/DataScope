// The Workbench's grid shell (W1, D71, master §13.3) — the app's only
// composition root as of the W8 cutover. The explorer (W2), map/profile tabs
// (W3/W4), Acts 0/1 (W6), and the ai-pane/inspector/status-bar regions (W7)
// all have real content now.
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useDatasetsStore } from '../stores/datasets';
import { useTabsStore } from '../stores/tabs';
import { useDspsReceiverStore } from '../stores/dspsReceiver';
import { TAB_GLYPH, TAB_KIND, tabLabel, type TabSpec, type TabType } from '../types/tabs';
import { selectWorkbenchAct } from './workbenchActs';
import { TitleBar } from './TitleBar';
import { ViewerMode } from '../features/viewer/ViewerMode';
import { ExplorerPanel } from '../features/explorer/ExplorerPanel';
import { ProfileDashboard } from '../features/profiling/ProfileDashboard';
import { DatasetMap } from '../features/map/DatasetMap';
import { QueryTab } from '../features/sql/QueryTab';
import { PivotModule } from '../features/sql/PivotModule';
import { ChartsModule } from '../features/charts/ChartsModule';
import { CorrelationModule } from '../features/charts/correlation/CorrelationModule';
import { ExportModule } from '../features/export/ExportModule';
import { CommandPalette } from '../features/palette/CommandPalette';
import { IngestionPanel } from '../features/ingestion/IngestionPanel';
import { AIPane } from '../features/ai/AIPane';
import { AISettingsPanel } from '../features/ai/AISettingsPanel';
import { WebLLMDock } from '../features/ai/WebLLMDock';
import { InspectorDrawer } from '../features/inspector/InspectorDrawer';
import { TransformGuardHost } from './TransformGuardHost';
import { StatusBar } from '../features/status/StatusBar';
import { useApplyWorkbenchAIDefault } from './useApplyWorkbenchAIDefault';
import { EducationalPanelProvider } from './EducationalPanelContext';
import { loadSharedDataset, IngestionError } from '../services/ingestion';
import { closeQueryTab } from '../services/queryTabs';

/** The map is dataset-wide, not per-table — there is no natural per-table subject the way `'profile'` has one (W4, §13.3). Exported for the command palette's map entry (W5). */
export const MAP_TAB_SUBJECT = 'workspace';

/// ---------------------------------------------------------------------------
// Brand lockup: Reticle-for-O (Turn 4, logo-concepts-for-datascope).
// The SVG is vertically centred between "Sc" and "pe" via self-center.
// ---------------------------------------------------------------------------
function Logo({ className = '', animated = false }: { className?: string; animated?: boolean }) {
  return (
    <div className={`flex items-center font-bold leading-none tracking-[-0.035em] ${className}`}>
      <span className={`inline-block text-(--color-ink) ${animated ? 'pre-text' : ''}`}>Data</span>
      <span className={`inline-block text-(--color-active) ${animated ? 'pre-text' : ''}`}>Sc</span>
      <svg viewBox="0 0 100 100" aria-hidden="true" className={`h-[0.75em] w-[0.75em] shrink-0 self-center mt-[0.18em] -mr-[0.04em] ${animated ? 'pre-reticle-group' : ''}`}>
        <circle cx="50" cy="50" r="30" fill="none" stroke="var(--color-ink)" strokeWidth="9" />
        <path d="M50 4 V15 M50 85 V96 M4 50 H15 M85 50 H96" stroke="var(--color-ink)" strokeWidth="7" strokeLinecap="round" />
        <path d="M50 50 L50 20 A30 30 0 0 1 76 65 Z" fill="var(--color-active)" className={animated ? 'pre-slice' : ''} />
        <circle cx="50" cy="50" r="10" fill="var(--color-fk)" className={animated ? 'pre-dot' : ''} />
      </svg>
      <span className={`inline-block text-(--color-active) ${animated ? 'pre-text' : ''}`}>pe</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preloader — the exact brand reticle (ring + ticks + amber slice + violet
// dot) scales up and rotates, the pie-slice sweeps in, then the wordmark
// fades up and the whole screen lifts out.
// ---------------------------------------------------------------------------
const PRELOADER_CSS = `
  @keyframes pre-reticle-in {
    0%   { opacity: 0; transform: scale(0.6) rotate(-90deg); }
    100% { opacity: 1; transform: scale(1) rotate(0deg); }
  }
  @keyframes pre-slice-sweep {
    0%   { opacity: 0; }
    30%  { opacity: 1; }
    100% { opacity: 1; }
  }
  @keyframes pre-dot-pop {
    0%   { transform: scale(0); }
    60%  { transform: scale(1.3); }
    100% { transform: scale(1); }
  }
  @keyframes pre-text-in {
    0%   { opacity: 0; transform: translateY(12px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes pre-exit {
    0%   { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes pre-glow-pulse {
    0%, 100% { opacity: 0.3; }
    50%      { opacity: 0.7; }
  }
  .pre-root {
    animation: pre-exit 400ms ease-out 1800ms forwards;
  }
  .pre-reticle-group {
    animation: pre-reticle-in 800ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .pre-slice {
    animation: pre-slice-sweep 600ms ease-out 400ms both;
  }
  .pre-dot {
    animation: pre-dot-pop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) 700ms both;
  }
  .pre-text {
    animation: pre-text-in 500ms cubic-bezier(0.16, 1, 0.3, 1) 900ms both;
  }
  .pre-sub {
    animation: pre-text-in 500ms cubic-bezier(0.16, 1, 0.3, 1) 1100ms both;
  }
  .pre-glow {
    animation: pre-glow-pulse 1.4s ease-in-out infinite;
  }
`;

function Preloader({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2200);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      data-theme="dark"
      className="pre-root fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-(--color-canvas)"
      style={{ fontFamily: "'Space Grotesk Variable', 'Space Grotesk', sans-serif" }}
    >
      <style>{PRELOADER_CSS}</style>

      <div className="relative flex items-center justify-center mb-6">
        {/* Ambient glow behind the mark */}
        <div
          className="pre-glow absolute -inset-8 rounded-full"
          style={{ background: 'radial-gradient(circle, color-mix(in oklch, var(--color-active) 15%, transparent) 0%, transparent 70%)' }}
        />
        <Logo animated className="relative text-[4rem] sm:text-[5rem]" />
      </div>

      {/* Tagline */}
      <p className="pre-sub mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-(--color-ink-3)">
        Local-first data workbench
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive particle field — floating data-point nodes that drift and
// connect when near each other, responding to the user's mouse. Gives the
// page life while DuckDB boots in the background. Pure canvas, no deps.
// ---------------------------------------------------------------------------
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    // Canvas 2D cannot resolve custom properties, so the register is read off
    // the element once — the same approach `CanvasScatter` takes.
    const computed = getComputedStyle(canvas);
    const token = (name: string) => computed.getPropertyValue(name).trim();
    const AMBER = token('--color-active');
    const VIOLET = token('--color-fk');
    const BONE = token('--color-ink');

    const PARTICLE_COUNT = 60;
    const CONNECT_DIST = 120;
    const MOUSE_DIST = 180;

    interface Particle { x: number; y: number; vx: number; vy: number; r: number; hue: number }
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * 2000,
        y: Math.random() * 1200,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 1,
        hue: Math.random() < 0.3 ? 38 : Math.random() < 0.5 ? 262 : 0, // amber / violet / bone
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Update + draw particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        // Mouse repulsion
        const dmx = p.x - mx;
        const dmy = p.y - my;
        const dm = Math.sqrt(dmx * dmx + dmy * dmy);
        if (dm < MOUSE_DIST && dm > 0) {
          const force = (1 - dm / MOUSE_DIST) * 0.8;
          p.vx += (dmx / dm) * force;
          p.vy += (dmy / dm) * force;
        }
        // Damping
        p.vx *= 0.99;
        p.vy *= 0.99;

        const alpha = p.hue === 38 ? 0.7 : p.hue === 262 ? 0.5 : 0.25;
        const color = p.hue === 38 ? AMBER : p.hue === 262 ? VIOLET : BONE;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.fill();
      }

      // Draw connections
      ctx.globalAlpha = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            const fade = 0.06 * (1 - dist / CONNECT_DIST);
            ctx.strokeStyle = `color-mix(in oklch, ${BONE} ${(fade * 100).toFixed(2)}%, transparent)`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    canvas.addEventListener('mousemove', handleMouse);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouse);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-auto absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Welcome page CSS
// ---------------------------------------------------------------------------
const WELCOME_CSS = `
  @keyframes w-fade-up {
    0%   { opacity: 0; transform: translateY(20px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes w-scale-in {
    0%   { opacity: 0; transform: scale(0.96); }
    100% { opacity: 1; transform: scale(1); }
  }
  .ws-1 { animation: w-fade-up 600ms cubic-bezier(0.16,1,0.3,1) 100ms both; }
  .ws-2 { animation: w-fade-up 600ms cubic-bezier(0.16,1,0.3,1) 200ms both; }
  .ws-3 { animation: w-scale-in 600ms cubic-bezier(0.16,1,0.3,1) 350ms both; }
  .ws-4 { animation: w-fade-up 600ms cubic-bezier(0.16,1,0.3,1) 500ms both; }
  .ws-5 { animation: w-fade-up 600ms cubic-bezier(0.16,1,0.3,1) 650ms both; }
  .ingest-card {
    background: linear-gradient(
      170deg,
      color-mix(in oklch, var(--color-chrome) 95%, transparent) 0%,
      color-mix(in oklch, var(--color-canvas) 98%, transparent) 100%
    );
    backdrop-filter: blur(20px);
    box-shadow:
      0 0 0 1px color-mix(in oklch, var(--color-active) 6%, transparent),
      0 40px 80px -20px color-mix(in oklch, var(--color-void) 80%, transparent),
      inset 0 1px 0 0 color-mix(in oklch, var(--color-ink) 4%, transparent);
    transition: box-shadow 400ms cubic-bezier(0.16,1,0.3,1), border-color 400ms;
  }
  .ingest-card:hover {
    box-shadow:
      0 0 0 1px color-mix(in oklch, var(--color-active) 14%, transparent),
      0 40px 80px -20px color-mix(in oklch, var(--color-void) 80%, transparent),
      0 0 120px -30px color-mix(in oklch, var(--color-active) 8%, transparent),
      inset 0 1px 0 0 color-mix(in oklch, var(--color-ink) 6%, transparent);
  }
`;

// Module-level flag — the preloader plays exactly once per session.
// When act0 transitions to act1 (during ingestion), Welcome remounts but
// the preloader must NOT replay.
let _preloaderPlayed = false;

// ---------------------------------------------------------------------------
// Welcome — the app's front door. Centred hero layout. The IngestionPanel
// is the star; everything else frames it.
// Ground functioning (IngestionPanel) is untouched; SpecimenPlate is dropped
// per user direction in favour of a cleaner, more inviting entry.
// ---------------------------------------------------------------------------
function Welcome() {
  const [preloaderDone, setPreloaderDone] = useState(_preloaderPlayed);

  return (
    // Act 0 is always the dark composition, whatever the OS preference — `data-theme="dark"`
    // pins the register from `theme.css` rather than re-declaring the palette here.
    <div
      data-theme="dark"
      className="relative flex min-h-svh flex-col bg-(--color-canvas) text-(--color-ink) selection:bg-(--color-active)/20 lg:h-svh lg:overflow-hidden"
    >
      <style>{WELCOME_CSS}</style>

      {/* Preloader overlay — plays exactly once */}
      {!preloaderDone && <Preloader onDone={() => { _preloaderPlayed = true; setPreloaderDone(true); }} />}

      {/* Interactive particle constellation — responds to mouse */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <ParticleField />
      </div>

      {/* Radial glows */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute left-1/2 top-[15%] h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(ellipse, color-mix(in oklch, var(--color-active) 3.5%, transparent) 0%, transparent 60%)' }} />
        <div className="absolute left-[30%] top-[60%] h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, color-mix(in oklch, var(--color-fk) 2.5%, transparent) 0%, transparent 60%)' }} />
      </div>

      {/* ---- Main content ---- */}
      <main className="relative z-10 mx-auto grid w-full max-w-[80rem] flex-1 grid-cols-1 items-center gap-12 px-6 py-8 lg:min-h-0 lg:grid-cols-[1.1fr_auto_0.9fr] lg:gap-16 lg:py-0">

        {/* Left Column — Logo, Headline & Copy */}
        <div className="ws-2 flex flex-col items-start justify-center lg:items-end lg:text-right" style={{ fontFamily: "'Space Grotesk Variable', 'Space Grotesk', sans-serif" }}>
          <div className="mb-10 lg:mb-12">
            <Logo className="text-[2rem] lg:text-[2.2rem]" />
          </div>
          <h1 className="text-[clamp(1.5rem,2.2vw+0.6rem,2.4rem)] leading-[1.15] font-bold tracking-[-0.03em] text-(--color-ink)">
            Drop data in.<br />
            Get answers <span className="text-(--color-active)">out</span>.
          </h1>
          <p className="mt-5 max-w-[32ch] text-[length:var(--text-lg)] leading-[1.6] text-(--color-ink-2)">
            Drop a file, paste a URL, or pick a sample.
            DataScope profiles, charts, and maps it — entirely in your browser.
          </p>
        </div>

        {/* Center Column — Ingestion card */}
        <div className="ws-3 w-full lg:w-[440px] lg:shrink-0 lg:min-h-0 lg:overflow-y-auto lg:py-8">
          <div className="ingest-card rounded-2xl border border-(--color-rule) p-6 md:p-8">
            <IngestionPanel />
          </div>
        </div>

        {/* Right Column — Features */}
        <div className="ws-4 flex w-full max-w-[280px] flex-col justify-center gap-3 self-center lg:w-[320px]">
          {[
            { label: 'Schema detection', desc: 'Automatic typing & PK/FK inference', color: 'var(--color-active)' },
            { label: 'Auto profiling', desc: 'Histograms, stats, & distributions', color: 'var(--color-fk)' },
            { label: 'SQL queries', desc: 'Powered by DuckDB in WASM', color: 'var(--color-ink)' },
            { label: 'Charts & correlation', desc: 'Visual insights instantly', color: 'var(--color-active)' },
            { label: 'AI optional', desc: 'On-demand intelligence', color: 'var(--color-fk)' },
          ].map((chip, i) => (
            <div
              key={chip.label}
              className="group flex items-center gap-4 rounded-xl border border-(--color-rule) bg-(--color-chrome)/40 p-3 pr-5 backdrop-blur-sm transition-all hover:border-(--color-rule-hi) hover:bg-(--color-elev)/80"
              style={{ animationDelay: `${500 + i * 50}ms` }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-(--color-rule) bg-(--color-canvas)">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: chip.color,
                    boxShadow: `0 0 10px color-mix(in oklch, ${chip.color} 56%, transparent)`,
                  }}
                />
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-(--color-ink)">
                  {chip.label}
                </span>
                <span className="text-[12px] text-(--color-ink-3)">
                  {chip.desc}
                </span>
              </div>
            </div>
          ))}
        </div>

      </main>

      {/* ---- Footer ---- */}
      <footer className="ws-5 relative z-10 shrink-0 px-6 py-6">
        <div className="mx-auto flex max-w-[80rem] items-center justify-between">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-(--color-ink-2)">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--color-ok) shadow-[0_0_8px_var(--color-ok)]" />
              In-browser
            </span>
            <span className="hidden h-3 w-px bg-(--color-rule) sm:block" aria-hidden="true" />
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--color-rule-hi)">
              No uploads · No accounts · No tracking
            </p>
          </div>
          <p className="hidden font-mono text-[10px] text-(--color-rule-hi) md:block">
            Nothing leaves your machine
          </p>
        </div>
      </footer>
    </div>
  );
}

// Removed Act0 and Act1 standalone components to prevent React unmounting Welcome on act transitions

// Per-tab-type content (W3/W4/W7.5). `prefill` is the tab's own D68e
// initializer, threaded down the same way `initialTableId` already is —
// never a second global (see `hooks/useThreadPrefill.ts`'s `override` doc).
function TabContent({ tab }: { tab: TabSpec }) {
  const prefill = tab.initializer?.prefilledConfig ?? null;
  if (tab.type === 'profile') return <ProfileDashboard initialTableId={tab.subject} />;
  // S5: the standalone SQL playground is gone. `SqlModule` is the drawer
  // console's body now, and a query tab is its own runner on its own session —
  // the tab id *is* that session id.
  if (tab.type === 'query') return <QueryTab tabId={tab.id} name={tab.subject} />;
  if (tab.type === 'pivot') return <PivotModule prefill={prefill} />;
  if (tab.type === 'charts') return <ChartsModule prefill={prefill} requestedTab={tab.subject} />;
  if (tab.type === 'correlation') return <CorrelationModule prefill={prefill} />;
  if (tab.type === 'export') return <ExportModule />;
  if (tab.type === 'ingestion') return <IngestionPanel />;
  return <DatasetMap />;
}

// Per-`TabType` glyph (V2, `TAB_GLYPH`) — every glyph inherits `currentColor`,
// so the active/inactive/artifact colour lives on this wrapper's own class,
// never per-glyph special-casing (design.md Iconography). The artifact/purple
// branch reads `TAB_KIND` directly rather than a fabricated tab type; S5's
// query tab is the first thing to reach it.
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
              // `shrink-0` is what makes the strip's `overflow-x-auto` actually
              // scroll (§13.3, decided): without it many tabs compress instead,
              // which is the failure the horizontal-scrolling call rules out.
              className={`flex shrink-0 items-center gap-1.5 border-r border-(--color-rule) px-2 py-1 font-mono text-[length:var(--text-xs)] ${
                isActive ? 'bg-(--color-canvas) text-(--color-ink)' : 'text-(--color-ink-3) hover:text-(--color-ink-2)'
              }`}
            >
              <button type="button" onClick={() => setActiveTab(tab.id)} className="flex items-center gap-1.5 whitespace-nowrap">
                <TabHeaderGlyph type={tab.type} isActive={isActive} />
                {tabLabel(tab)}
              </button>
              <button
                type="button"
                aria-label={`Close ${tabLabel(tab)}`}
                // Not `closeTab` directly: an artifact tab's query session has
                // to go with it, or the store keeps a result per closed tab.
                onClick={() => closeQueryTab(tab)}
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

const EXPLORER_MIN_WIDTH = 200;
const EXPLORER_MAX_WIDTH = 480;
const EXPLORER_DEFAULT_WIDTH = 256;

/** Drag-to-resize for the explorer rail (VS Code-style) — width lives only in this component's state, reset to the default on reload rather than persisted, since nothing asked for that. */
function useExplorerWidth() {
  const [width, setWidth] = useState(EXPLORER_DEFAULT_WIDTH);

  const onHandleMouseDown = useCallback(
    (downEvent: ReactMouseEvent) => {
      downEvent.preventDefault();
      const startX = downEvent.clientX;
      const startWidth = width;
      const onMouseMove = (moveEvent: MouseEvent) => {
        const next = startWidth + (moveEvent.clientX - startX);
        setWidth(Math.min(EXPLORER_MAX_WIDTH, Math.max(EXPLORER_MIN_WIDTH, next)));
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [width],
  );

  return { width, onHandleMouseDown };
}

function ShellGrid() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  useApplyWorkbenchAIDefault();
  const openSettings = () => setSettingsOpen(true);
  const { width: explorerWidth, onHandleMouseDown } = useExplorerWidth();

  return (
    <EducationalPanelProvider>
      <div data-act="shell" className="flex h-svh flex-col">
        <TitleBar onOpenSettings={openSettings} />
        <div className="flex flex-1 overflow-hidden">
          <div
            data-region="explorer"
            style={{ width: explorerWidth }}
            className="flex shrink-0 flex-col overflow-hidden border-r border-(--color-rule) bg-(--color-panel)"
          >
            <ExplorerPanel />
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize explorer panel"
            onMouseDown={onHandleMouseDown}
            className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-(--color-accent)/40 active:bg-(--color-accent)/60"
          />
          <div data-region="canvas" className="flex-1 overflow-auto bg-(--color-canvas)">
            <TabHost />
          </div>
          <div data-region="ai-pane" className="bg-(--color-panel)">
            <AIPane onConfigure={openSettings} />
          </div>
        </div>
        {/* S3 (D73): the region is the two-view drawer now — Info + the console
            — and owns its own height. Its place in this stack is load-bearing:
            status bar → WebLLM dock → drawer → canvas, so an expanded drawer
            pushes against the canvas above it and never over the dock. */}
        <div data-region="inspector" className="flex shrink-0 flex-col border-t border-(--color-rule) bg-(--color-panel)">
          <InspectorDrawer />
        </div>
        <WebLLMDock />
        <div data-region="status-bar" className="border-t border-(--color-rule-2) bg-(--color-chrome)">
          <StatusBar />
        </div>
      </div>
      <CommandPalette />
      {/* S4: the transform guard's only mount in the app — it belongs to the
          shared run path, not to whichever surface raised it. */}
      <TransformGuardHost />
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
  if (act === 'act0' || act === 'act1') {
    return (
      <div data-act={act}>
        <Welcome />
      </div>
    );
  }
  return <ShellGrid />;
}
