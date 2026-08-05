// WorkbenchShellReveal — mockup of the first-run analyst reveal (backlog/first-run-analyst-reveal.md).
// This is a parallel copy of WorkbenchShell.tsx used for prototyping the transition
// from Welcome → Data Greeting → Full Workspace. It does not replace the production shell.
//
// The flow:
//   act0/act1 (Welcome) → data ingested → AnalystReveal (data greeting + invite) → ShellGrid
//
// The reveal introduces an intermediate "act-reveal" state that:
//   1. Shows a data-aware greeting (table count, column count, detected types)
//   2. Presents a floating "Enter Analyst Mode" trigger
//   3. On activation, animates all four workspace regions into view with spring physics
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { ArrowLeft, ArrowRight, Compass, LayoutGrid, X } from 'lucide-react';
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
import { HistoryTab } from '../features/sql/HistoryTab';
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
import { restoreStagedTables, type RestoreReport } from '../services/workspace';
import { usePersistenceStore } from '../stores/persistence';
import { rehydrateWorkspace } from '../services/rehydration';
import { useRehydrationStore, isTableUsable } from '../stores/rehydration';
import { DataQualityPanel } from '../features/explorer/DataQualityPanel';
import { SqlModule } from '../features/sql/SqlModule';
import { DatasetDossier } from '../features/profiling/dossier/DatasetDossier';
import { useEducationalPanel } from './useEducationalPanel';
import { useSelectionStore } from '../stores/selection';
import { openDestination } from '../services/navigation';
import type { SidebarModule } from '../stores/ui';
import type { TableRegistryEntry } from '../types';

export const MAP_TAB_SUBJECT = 'workspace';

// ---------------------------------------------------------------------------
// Brand lockup (unchanged from WorkbenchShell)
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
// Preloader (unchanged)
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
        <div
          className="pre-glow absolute -inset-8 rounded-full"
          style={{ background: 'radial-gradient(circle, color-mix(in oklch, var(--color-active) 15%, transparent) 0%, transparent 70%)' }}
        />
        <Logo animated className="relative text-[4rem] sm:text-[5rem]" />
      </div>
      <p className="pre-sub mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-(--color-ink-3)">
        Local-first data workbench
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ParticleField (unchanged)
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
        hue: Math.random() < 0.3 ? 38 : Math.random() < 0.5 ? 262 : 0,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        const dmx = p.x - mx;
        const dmy = p.y - my;
        const dm = Math.sqrt(dmx * dmx + dmy * dmy);
        if (dm < MOUSE_DIST && dm > 0) {
          const force = (1 - dm / MOUSE_DIST) * 0.8;
          p.vx += (dmx / dm) * force;
          p.vy += (dmy / dm) * force;
        }
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
// Welcome page CSS (unchanged)
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

let _preloaderPlayed = false;

function Welcome() {
  const [preloaderDone, setPreloaderDone] = useState(_preloaderPlayed);

  return (
    <div
      data-theme="dark"
      className="relative flex min-h-svh flex-col bg-(--color-canvas) text-(--color-ink) selection:bg-(--color-active)/20 lg:h-svh lg:overflow-hidden"
    >
      <style>{WELCOME_CSS}</style>
      {!preloaderDone && <Preloader onDone={() => { _preloaderPlayed = true; setPreloaderDone(true); }} />}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <ParticleField />
      </div>
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute left-1/2 top-[15%] h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(ellipse, color-mix(in oklch, var(--color-active) 3.5%, transparent) 0%, transparent 60%)' }} />
        <div className="absolute left-[30%] top-[60%] h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, color-mix(in oklch, var(--color-fk) 2.5%, transparent) 0%, transparent 60%)' }} />
      </div>
      <main className="relative z-10 mx-auto grid w-full max-w-[80rem] flex-1 grid-cols-1 items-center gap-12 px-6 py-8 lg:min-h-0 lg:grid-cols-[1.1fr_auto_0.9fr] lg:gap-16 lg:py-0">
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
        <div className="ws-3 w-full lg:w-[440px] lg:shrink-0 lg:min-h-0 lg:overflow-y-auto lg:py-8">
          <div className="ingest-card rounded-2xl border border-(--color-rule) p-6 md:p-8">
            <IngestionPanel />
          </div>
        </div>
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

// ---------------------------------------------------------------------------
// AnalystReveal — the new intermediate state between Welcome and ShellGrid.
// After data ingestion, this screen greets the user with what DataScope
// discovered, then invites them to "enter analyst mode" which triggers the
// full workspace to sweep in with Apple-style spring animations.
// ---------------------------------------------------------------------------

const REVEAL_CSS = `
  /* ---- Spring easing: Apple-style "floaty" with slight overshoot ---- */
  @keyframes reveal-fade-up {
    0%   { opacity: 0; transform: translateY(40px) scale(0.97); }
    60%  { opacity: 1; transform: translateY(-4px) scale(1.005); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes reveal-card-in {
    0%   { opacity: 0; transform: translateY(30px) scale(0.95); }
    70%  { opacity: 1; transform: translateY(-2px) scale(1.01); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes reveal-stat-in {
    0%   { opacity: 0; transform: scale(0.8); }
    60%  { opacity: 1; transform: scale(1.06); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes reveal-glow-breathe {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50%      { opacity: 0.8; transform: scale(1.04); }
  }
  @keyframes reveal-dot-orbit {
    0%   { transform: rotate(0deg) translateX(6px) rotate(0deg); }
    100% { transform: rotate(360deg) translateX(6px) rotate(-360deg); }
  }
  @keyframes reveal-pulse-ring {
    0%   { transform: scale(0.95); opacity: 0.6; }
    50%  { transform: scale(1.05); opacity: 1; }
    100% { transform: scale(0.95); opacity: 0.6; }
  }
  @keyframes reveal-shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  .rv-title    { animation: reveal-fade-up 900ms cubic-bezier(0.34, 1.56, 0.64, 1) 200ms both; }
  .rv-subtitle { animation: reveal-fade-up 900ms cubic-bezier(0.34, 1.56, 0.64, 1) 400ms both; }
  .rv-stats    { animation: reveal-fade-up 900ms cubic-bezier(0.34, 1.56, 0.64, 1) 550ms both; }
  .rv-card-1   { animation: reveal-card-in 800ms cubic-bezier(0.34, 1.56, 0.64, 1) 700ms both; }
  .rv-card-2   { animation: reveal-card-in 800ms cubic-bezier(0.34, 1.56, 0.64, 1) 850ms both; }
  .rv-card-3   { animation: reveal-card-in 800ms cubic-bezier(0.34, 1.56, 0.64, 1) 1000ms both; }
  .rv-card-4   { animation: reveal-card-in 800ms cubic-bezier(0.34, 1.56, 0.64, 1) 1150ms both; }
  .rv-trigger  { animation: reveal-fade-up 900ms cubic-bezier(0.34, 1.56, 0.64, 1) 1400ms both; }
  .rv-footer   { animation: reveal-fade-up 800ms cubic-bezier(0.16, 1, 0.3, 1) 1600ms both; }

  .rv-stat-number {
    animation: reveal-stat-in 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  .rv-glow {
    animation: reveal-glow-breathe 3s ease-in-out infinite;
  }

  .rv-orbit-dot {
    animation: reveal-dot-orbit 4s linear infinite;
  }

  .rv-trigger-btn {
    position: relative;
    overflow: hidden;
    transition: all 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .rv-trigger-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in oklch, var(--color-active) 12%, transparent) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: reveal-shimmer 3s ease-in-out infinite;
    pointer-events: none;
  }
  .rv-trigger-btn:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow:
      0 0 0 1px var(--color-active),
      0 20px 60px -15px color-mix(in oklch, var(--color-active) 30%, transparent),
      0 0 80px -20px color-mix(in oklch, var(--color-active) 15%, transparent);
  }
  .rv-trigger-btn:active {
    transform: translateY(0px) scale(0.98);
  }

  .rv-pulse-ring {
    animation: reveal-pulse-ring 2s ease-in-out infinite;
  }

  /* ---- Workspace sweep-in (the big moment) ---- */
  @keyframes sweep-from-left {
    0%   { opacity: 0; transform: translateX(-100%); }
    60%  { opacity: 1; transform: translateX(8px); }
    80%  { transform: translateX(-2px); }
    100% { opacity: 1; transform: translateX(0); }
  }
  @keyframes sweep-from-right {
    0%   { opacity: 0; transform: translateX(100%); }
    60%  { opacity: 1; transform: translateX(-8px); }
    80%  { transform: translateX(2px); }
    100% { opacity: 1; transform: translateX(0); }
  }
  @keyframes sweep-from-top {
    0%   { opacity: 0; transform: translateY(-100%); }
    60%  { opacity: 1; transform: translateY(6px); }
    80%  { transform: translateY(-2px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes sweep-from-bottom {
    0%   { opacity: 0; transform: translateY(100%); }
    60%  { opacity: 1; transform: translateY(-6px); }
    80%  { transform: translateY(2px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes sweep-canvas-fade {
    0%   { opacity: 0; transform: scale(0.96); }
    60%  { opacity: 1; transform: scale(1.005); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes sweep-scrim-out {
    0%   { opacity: 1; }
    100% { opacity: 0; pointer-events: none; }
  }

  .sweep-active [data-region="explorer"] {
    animation: sweep-from-left 800ms cubic-bezier(0.34, 1.56, 0.64, 1) 100ms both;
  }
  .sweep-active [data-region="ai-pane"] {
    animation: sweep-from-right 800ms cubic-bezier(0.34, 1.56, 0.64, 1) 200ms both;
  }
  .sweep-active [data-region="canvas"] {
    animation: sweep-canvas-fade 700ms cubic-bezier(0.16, 1, 0.3, 1) 50ms both;
  }
  .sweep-active [data-testid="tab-host"] {
    animation: sweep-from-top 700ms cubic-bezier(0.34, 1.56, 0.64, 1) 0ms both;
  }
  .sweep-active [data-region="inspector"] {
    animation: sweep-from-bottom 800ms cubic-bezier(0.34, 1.56, 0.64, 1) 300ms both;
  }
  .sweep-active [data-region="status-bar"] {
    animation: sweep-from-bottom 700ms cubic-bezier(0.34, 1.56, 0.64, 1) 400ms both;
  }
  .sweep-active [data-testid="title-bar"] {
    animation: sweep-from-top 700ms cubic-bezier(0.34, 1.56, 0.64, 1) 0ms both;
  }

  .sweep-scrim {
    animation: sweep-scrim-out 600ms cubic-bezier(0.16, 1, 0.3, 1) 500ms forwards;
  }

  @keyframes reveal-section-in {
    0%   { opacity: 0; transform: translateY(20px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .rv-section-in {
    animation: reveal-section-in 400ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
`;

/** Format bytes into a human-readable string */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Semantic-type summary from classified columns. */
function typeBreakdown(tables: { columns?: { semanticType: string }[] }[]): { type: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tables) {
    for (const col of t.columns ?? []) {
      counts.set(col.semanticType, (counts.get(col.semanticType) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

type RevealSection = 'overview' | 'schema' | 'quality' | 'relationships' | 'query';
type RevealSectionId = Exclude<RevealSection, 'overview'>;

/**
 * What the workspace adds to the section you are already in. The reveal shows
 * one surface at a time on purpose, so each section ends by naming its own
 * ceiling rather than leaving "Back to overview" as the only way out — the
 * moment a user outgrows the inline surface is the moment the offer means
 * something.
 */
const SECTION_HANDOFF: Record<RevealSectionId, string> = {
  schema: 'Open the profile alongside the explorer rail, the inspector and AI — all at once.',
  quality: 'Keep quality in view in the explorer rail while you query, chart and export.',
  relationships: 'Open the join graph full-size, with selection wired to the inspector.',
  query: 'Get query tabs, run history and the results inspector — this query comes with you.',
};

/**
 * Points the workspace at whatever the user was looking at, so the hand-off is
 * never a cold start. Routing goes through `openDestination` (the W0/D71
 * migration seam) and the tabs store, which are plain app state — they take
 * effect whether or not the shell is mounted yet, so the sweep lands on the
 * right surface instead of the default map tab.
 *
 * `quality` routes nowhere by design: the Data Quality panel lives in the
 * explorer rail (`ExplorerPanel.tsx`), which is always visible in the
 * workspace, so entering it *is* the destination.
 */
function routeSectionToWorkspace(section: RevealSectionId, tables: TableRegistryEntry[]): void {
  switch (section) {
    case 'schema': {
      // `ProfileDashboard`'s table picker is component state and does not
      // survive the unmount, so the tab opens on the shared selection instead,
      // falling back to the first table.
      const tableId = useSelectionStore.getState().selectedTableId ?? tables[0]?.id;
      if (tableId) openDestination('profile', tableId);
      break;
    }
    case 'relationships':
      // Not `openDestination('relationships')` — that module has no entry in
      // `TAB_TYPE_BY_MODULE` and would fall back to a `map` tab keyed on the
      // module name, which is a second map tab next to `handleEnterWorkspace`'s.
      useTabsStore.getState().openTab('map', MAP_TAB_SUBJECT);
      break;
    case 'query':
      // The console is the one place SQL is written (S5, D73), and the editor's
      // text already lives in the query store's shared `CONSOLE_SESSION` — so
      // opening the drawer is the whole hand-off; the query carries itself.
      openDestination('sql');
      break;
    case 'quality':
      break;
  }
}

/**
 * States that Explore and Workspace are two peer modes by showing both at all
 * times. The affordance this replaces was a ghost pill with a `Maximize2`
 * icon, which reads as "make this page fullscreen" — chrome, rather than a
 * second place to be — leaving a first-time user no way to learn the workspace
 * existed beyond one clause in the subtitle.
 */
function ModeSwitch({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="group relative">
      <div
        role="group"
        aria-label="View mode"
        className="flex items-center gap-1 rounded-full border border-(--color-rule) bg-(--color-chrome)/40 p-1 backdrop-blur-sm"
      >
        <span
          aria-current="page"
          className="flex items-center gap-1.5 rounded-full bg-(--color-elev) px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-(--color-ink)"
        >
          <Compass size={12} className="text-(--color-active)" />
          Explore
        </span>
        <button
          type="button"
          onClick={onEnter}
          data-testid="mode-switch-workspace"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-(--color-ink-3) transition-colors hover:bg-(--color-elev)/60 hover:text-(--color-ink)"
        >
          <LayoutGrid size={12} />
          Workspace
        </button>
      </div>
      <div
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-[18rem] rounded-lg border border-(--color-rule) bg-(--color-panel) p-3 opacity-0 shadow-xl transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--color-ink-3)">Workspace</p>
        <p className="mt-1.5 text-[12px] leading-[1.6] text-(--color-ink-2)">
          The full multi-panel layout — query tabs, the AI assistant, the explorer rail and the
          inspector, open together. Your data stays loaded; nothing re-ingests.
        </p>
      </div>
    </div>
  );
}

/**
 * Hosts the "Show SQL" explanations that `ProfileDashboard`, `DataQualityPanel`
 * and the Dossier push through `EducationalPanelContext`. In the workspace that
 * content has a home in the shell; on the reveal it had none, so this is it —
 * without it the provider would swallow every explanation the sections offer.
 */
function RevealEducationalDock() {
  const { content, setContent } = useEducationalPanel();
  if (!content) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[min(40rem,calc(100vw-3rem))] -translate-x-1/2 rounded-xl border border-(--color-rule) bg-(--color-panel) p-4 shadow-2xl">
      <button
        type="button"
        onClick={() => setContent(null)}
        aria-label="Dismiss explanation"
        className="absolute right-3 top-3 rounded-md p-1 text-(--color-ink-3) transition-colors hover:bg-(--color-elev) hover:text-(--color-ink)"
      >
        <X size={14} />
      </button>
      {content}
    </div>
  );
}

/**
 * The Blueprint as the overview's body. It is the richest post-ingest summary
 * the app already has — the Verdict, the top insights, the identity band — and
 * before this the overview was four buttons and a row of stat pills. Its
 * ranked actions double as a second, motivated route into the workspace:
 * following one opens the workspace already on that destination.
 *
 * Separate from `AnalystReveal` because `useEducationalPanel()` has to be
 * called *inside* the provider that `AnalystReveal` renders.
 */
function RevealOverviewDossier({
  onEnter,
  onSkipToData,
}: {
  onEnter: () => void;
  onSkipToData: () => void;
}) {
  const { setContent } = useEducationalPanel();

  const handoff = useCallback(
    (module: SidebarModule, tabId?: string | null, prefill?: Record<string, unknown> | null) => {
      openDestination(module, tabId, prefill);
      onEnter();
    },
    [onEnter],
  );

  return (
    <DatasetDossier
      onOpenTable={(id) => handoff('profile', id)}
      onNavigate={handoff}
      onShowSql={(label, sql) =>
        setContent(
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-(--color-fg)">{label}</p>
            <pre className="overflow-x-auto rounded bg-(--color-border)/40 p-3 font-mono text-xs text-(--color-fg)">
              {sql}
            </pre>
          </div>,
        )
      }
      // Stays in Explore rather than routing to the workspace profile tab the
      // way `DatasetMap` does: the reveal has a schema surface of its own, and
      // the whole point of this page is that the workspace is opt-in.
      onSkipToData={onSkipToData}
    />
  );
}

function AnalystReveal({ onEnter }: { onEnter: () => void }) {
  const datasets = useDatasetsStore((s) => s.datasets);
  const tables = useDatasetsStore((s) => s.tables);
  const [activeSection, setActiveSection] = useState<RevealSection>('overview');
  const tablistRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Enter opens the workspace, but only from the overview and only when the
  // caret is not in a field: phase 1 made the reveal interactive, so a global
  // Enter handler would yank a user out of the SQL editor mid-statement.
  useEffect(() => {
    if (activeSection !== 'overview') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      // `e.target` is the window itself for a keydown with nothing focused, so
      // this is a type guard before a DOM call, not defensive noise.
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select, button, [role="tab"]'))
      ) {
        return;
      }
      e.preventDefault();
      onEnter();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeSection, onEnter]);

  // Escape leaves a section the same way the header button does.
  useEffect(() => {
    if (activeSection === 'overview') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveSection('overview');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeSection]);

  // Move focus into the panel when a section opens, so keyboard and screen
  // reader users land on the content they just asked for rather than staying
  // parked on the tab strip.
  useEffect(() => {
    if (activeSection !== 'overview') panelRef.current?.focus();
  }, [activeSection]);

  const handleTablistKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const tabs = Array.from(tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    if (tabs.length === 0) return;
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'Home' ? 0
      : e.key === 'End' ? tabs.length - 1
      : e.key === 'ArrowRight' ? (current + 1) % tabs.length
      : (current - 1 + tabs.length) % tabs.length;
    e.preventDefault();
    tabs[next].focus();
  }, []);

  const handleSectionHandoff = useCallback(
    (section: RevealSectionId) => {
      routeSectionToWorkspace(section, tables);
      onEnter();
    },
    [tables, onEnter],
  );

  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);
  const totalCols = tables.reduce((sum, t) => sum + t.columnCount, 0);
  const totalMem = tables.reduce((sum, t) => sum + t.memoryBytes, 0);
  const types = typeBreakdown(tables);

  const datasetName = datasets.length === 1 ? datasets[0].name : `${datasets.length} datasets`;

  // Analyst-reveal action cards — the next-best-actions the reveal surfaces.
  const actions: { id: RevealSection; icon: string; label: string; desc: string; accent: string }[] = [
    {
      id: 'schema',
      icon: '◎',
      label: 'Inspect schema',
      desc: `${tables.length} table${tables.length !== 1 ? 's' : ''} · PK/FK inference`,
      accent: 'var(--color-active)',
    },
    {
      id: 'quality',
      icon: '⬡',
      label: 'Data quality',
      desc: 'Nulls, outliers & distributions',
      accent: 'var(--color-ok)',
    },
    {
      id: 'relationships',
      icon: '◈',
      label: 'Relationships',
      desc: 'Join paths & foreign keys',
      accent: 'var(--color-fk)',
    },
    {
      id: 'query',
      icon: '▤',
      label: 'Query & chart',
      desc: 'SQL + instant visualisation',
      accent: 'var(--color-active)',
    },
  ];

  return (
    // The sections mount `ProfileDashboard`, `DataQualityPanel` and the
    // single-table `DatasetMap`, each of which calls `useEducationalPanel()`
    // unconditionally — and that hook throws without a provider. Phase 1
    // mounted them here with the provider still scoped to `ShellGridAnimated`,
    // so three of the four cards crashed on click.
    <EducationalPanelProvider>
    <div
      data-theme="dark"
      className="relative flex min-h-svh flex-col items-center bg-(--color-canvas) text-(--color-ink) selection:bg-(--color-active)/20 overflow-hidden"
      style={{ fontFamily: "'Space Grotesk Variable', 'Space Grotesk', sans-serif" }}
    >
      <style>{REVEAL_CSS}</style>

      {/* Ambient glows - toned down when section is active */}
      <div className="pointer-events-none absolute inset-0 transition-opacity duration-700" style={{ opacity: activeSection !== 'overview' ? 0.3 : 1 }} aria-hidden="true">
        <div
          className="rv-glow absolute left-1/2 top-[30%] h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(ellipse, color-mix(in oklch, var(--color-active) 5%, transparent) 0%, transparent 60%)' }}
        />
        <div
          className="rv-glow absolute left-[25%] top-[65%] h-[400px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, color-mix(in oklch, var(--color-fk) 4%, transparent) 0%, transparent 55%)', animationDelay: '1.5s' }}
        />
        <div
          className="absolute right-[20%] top-[20%] h-[300px] w-[300px] rounded-full"
          style={{ background: 'radial-gradient(circle, color-mix(in oklch, var(--color-ok) 2.5%, transparent) 0%, transparent 60%)' }}
        />
      </div>

      {/* Particle field behind everything */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-700" style={{ opacity: activeSection !== 'overview' ? 0.1 : 0.3 }} aria-hidden="true">
        <ParticleField />
      </div>

      {/* Top Header - persistent across sections */}
      <header className="relative z-20 flex w-full items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Logo className="text-[1.5rem]" />
          <span className="font-mono text-sm font-semibold tracking-wide">{datasetName}</span>
        </div>
        <ModeSwitch onEnter={onEnter} />
      </header>

      {/* Main Content Area */}
      <div className="relative z-10 flex w-full flex-1 flex-col items-center px-6 pt-4 pb-12">
        <div className="w-full max-w-[56rem] flex flex-col h-[calc(100vh-80px)]">
          {/* Overview Header - only shown in overview */}
          {activeSection === 'overview' && (
            <div className="flex flex-col items-center shrink-0">
              <h1 className="rv-title text-center text-[clamp(1.6rem,2.5vw+0.8rem,2.6rem)] font-bold tracking-[-0.03em] leading-[1.15]">
                <span className="text-(--color-ink-2)">DataScope analysed</span>{' '}
                <span className="text-(--color-active)">{datasetName}</span>
              </h1>
              
              <p className="rv-subtitle mt-4 text-center text-[length:var(--text-lg)] leading-[1.7] text-(--color-ink-3) max-w-[40ch]">
                Here's what we found. Explore it right here — or switch to the workspace for the
                full multi-panel layout. Both work on the same loaded data.
              </p>

              {/* Stat pills */}
              <div className="rv-stats mt-8 flex flex-wrap items-center justify-center gap-3">
                {[
                  { value: tables.length.toLocaleString(), label: tables.length === 1 ? 'Table' : 'Tables', accent: 'var(--color-active)', delay: 600 },
                  { value: totalRows.toLocaleString(), label: 'Rows', accent: 'var(--color-ink)', delay: 700 },
                  { value: totalCols.toLocaleString(), label: 'Columns', accent: 'var(--color-fk)', delay: 800 },
                  { value: formatBytes(totalMem), label: 'In memory', accent: 'var(--color-ink-2)', delay: 900 },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rv-stat-number flex items-center gap-2.5 rounded-full border border-(--color-rule) bg-(--color-chrome)/60 px-4 py-2 backdrop-blur-sm"
                    style={{ animationDelay: `${stat.delay}ms` }}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: stat.accent, boxShadow: `0 0 8px color-mix(in oklch, ${stat.accent} 50%, transparent)` }}
                    />
                    <span className="font-mono text-[13px] font-semibold text-(--color-ink)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {stat.value}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--color-ink-3)">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>

              {types.length > 0 && (
                <div className="rv-stats mt-4 flex flex-wrap items-center justify-center gap-2" style={{ animationDelay: '1000ms' }}>
                  {types.map((t) => (
                    <span
                      key={t.type}
                      className="rounded-md border border-(--color-rule-2) bg-(--color-panel)/50 px-2.5 py-1 font-mono text-[10px] text-(--color-ink-2)"
                    >
                      {t.type} <span className="text-(--color-ink-3)">×{t.count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action cards - persist but change appearance when a section is active */}
          <div
            ref={tablistRef}
            role="tablist"
            aria-label="Explore sections"
            onKeyDown={handleTablistKeyDown}
            className={`mx-auto grid w-full max-w-[48rem] shrink-0 grid-cols-2 gap-3 sm:grid-cols-4 transition-all duration-500 ${activeSection === 'overview' ? 'mt-12' : 'mt-0 mb-6'}`}
          >
            {actions.map((action, i) => {
              const isActive = activeSection === action.id;
              const isDimmed = activeSection !== 'overview' && !isActive;
              return (
                <button
                  key={action.id}
                  type="button"
                  role="tab"
                  id={`rv-tab-${action.id}`}
                  aria-selected={isActive}
                  aria-controls={isActive ? 'rv-tabpanel' : undefined}
                  onClick={() => setActiveSection(isActive ? 'overview' : action.id)}
                  className={`rv-card-${i + 1} group flex flex-col items-center gap-3 rounded-xl border p-4 backdrop-blur-sm transition-all duration-300 text-left ${
                    isActive
                      ? 'border-(--color-active)/50 bg-(--color-active)/5 shadow-[0_0_20px_color-mix(in_oklch,var(--color-active)_10%,transparent)]'
                      : isDimmed
                        ? 'border-(--color-rule) bg-(--color-chrome)/20 opacity-60 hover:opacity-100'
                        : 'border-(--color-rule) bg-(--color-chrome)/40 hover:border-(--color-rule-hi) hover:bg-(--color-elev)/60 hover:scale-[1.03]'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
                      isActive ? 'border-current bg-(--color-active)/10' : 'border-(--color-rule) bg-(--color-canvas) group-hover:border-current'
                    }`}
                    style={{ color: action.accent }}
                  >
                    {action.icon}
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <div className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-(--color-ink)">
                      {action.label}
                    </div>
                    {activeSection === 'overview' && (
                      <div className="mt-1 text-[11px] leading-[1.5] text-(--color-ink-3)">
                        {action.desc}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Overview body — the Blueprint, scrolling under the cards. */}
          {activeSection === 'overview' && (
            <div className="mt-8 flex-1 min-h-0 overflow-y-auto rounded-2xl border border-(--color-rule) bg-(--color-canvas)/60 pb-14 backdrop-blur-sm">
              <RevealOverviewDossier onEnter={onEnter} onSkipToData={() => setActiveSection('schema')} />
            </div>
          )}

          {/* Active Section Content */}
          {activeSection !== 'overview' && (
            <div
              ref={panelRef}
              id="rv-tabpanel"
              role="tabpanel"
              tabIndex={-1}
              aria-labelledby={`rv-tab-${activeSection}`}
              className="rv-section-in flex flex-col flex-1 min-h-0 rounded-2xl border border-(--color-rule) bg-(--color-canvas)/80 shadow-2xl backdrop-blur-xl outline-none"
            >
              <div className="flex items-center justify-between border-b border-(--color-rule) px-4 py-3 shrink-0">
                <span className="font-mono text-xs uppercase tracking-widest text-(--color-ink-2)">
                  {actions.find(a => a.id === activeSection)?.label}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSection('overview')}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-(--color-ink-3) transition-colors hover:bg-(--color-elev) hover:text-(--color-ink)"
                >
                  <ArrowLeft size={14} />
                  Back to overview
                </button>
              </div>
              <div className="flex-1 min-h-0 p-4">
                <RevealSectionContent section={activeSection} tables={tables} />
              </div>
              {/* The offer at the point of need — the section states its own
                  ceiling, and the button carries this surface across. */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--color-rule) px-4 py-3 shrink-0">
                <span className="text-[12px] leading-[1.5] text-(--color-ink-3)">
                  {SECTION_HANDOFF[activeSection]}
                </span>
                <button
                  type="button"
                  onClick={() => handleSectionHandoff(activeSection)}
                  data-testid="section-handoff"
                  className="group flex shrink-0 items-center gap-2 rounded-full border border-(--color-active)/40 bg-(--color-active)/10 px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-wider text-(--color-ink) transition-colors hover:border-(--color-active)/70 hover:bg-(--color-active)/20"
                >
                  Continue in Workspace
                  <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer echo - only in overview */}
      {activeSection === 'overview' && (
        <footer className="rv-footer absolute bottom-0 left-0 right-0 z-10 px-6 py-5">
          <div className="mx-auto flex max-w-[56rem] items-center justify-between">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-(--color-ink-3)">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--color-ok) shadow-[0_0_8px_var(--color-ok)]" />
              In-browser
            </span>
            <span className="font-mono text-[10px] text-(--color-rule-hi)">
              Nothing leaves your machine
            </span>
          </div>
        </footer>
      )}

      <RevealEducationalDock />
    </div>
    </EducationalPanelProvider>
  );
}

function RevealSectionContent({ section, tables }: { section: RevealSection; tables: TableRegistryEntry[] }) {
  switch (section) {
    case 'schema':
      return (
        <div className="h-full overflow-y-auto pr-2">
          <ProfileDashboard />
        </div>
      );
    case 'quality':
      return (
        <div className="flex h-full flex-col overflow-y-auto rounded-xl border border-(--color-rule) bg-(--color-panel)">
          <DataQualityPanel tables={tables} />
        </div>
      );
    case 'relationships':
      return (
        <div className="h-full rounded-xl border border-(--color-rule) bg-(--color-panel) overflow-hidden relative">
          <DatasetMap />
        </div>
      );
    case 'query':
      return (
        <div className="flex h-full flex-col overflow-hidden rounded-xl border border-(--color-rule) bg-(--color-panel)">
          <SqlModule />
        </div>
      );
    default:
      return null;
  }
}



// ---------------------------------------------------------------------------
// TabContent, TabHeaderGlyph, TabHost, useExplorerWidth, ShellGrid — all
// unchanged from WorkbenchShell.tsx; reproduced here so the mockup is
// self-contained and the production shell stays untouched.
// ---------------------------------------------------------------------------

function TabContent({ tab }: { tab: TabSpec }) {
  const prefill = tab.initializer?.prefilledConfig ?? null;
  const outcomes = useRehydrationStore((state) => state.outcomes);
  if (tab.type === 'profile' && !isTableUsable(outcomes, tab.subject)) {
    return (
      <p data-testid="tab-subject-unavailable" className="p-6 text-sm text-(--color-fg-muted)">
        {outcomes[tab.subject]?.reason ?? 'This table is no longer available.'}
      </p>
    );
  }
  if (tab.type === 'profile') return <ProfileDashboard initialTableId={tab.subject} />;
  if (tab.type === 'query') return <QueryTab tabId={tab.id} name={tab.subject} />;
  if (tab.type === 'pivot') return <PivotModule prefill={prefill} />;
  if (tab.type === 'charts') return <ChartsModule prefill={prefill} requestedTab={tab.subject} />;
  if (tab.type === 'correlation') return <CorrelationModule prefill={prefill} />;
  if (tab.type === 'export') return <ExportModule />;
  if (tab.type === 'ingestion') return <IngestionPanel />;
  if (tab.type === 'history') return <HistoryTab />;
  return <DatasetMap />;
}

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

/** The workspace grid — identical to production ShellGrid but wrapped in an
 *  optional `sweep-active` class that triggers the panel sweep-in animations. */
function ShellGridAnimated({ sweep }: { sweep: boolean }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  useApplyWorkbenchAIDefault();
  const openSettings = () => setSettingsOpen(true);
  const { width: explorerWidth, onHandleMouseDown } = useExplorerWidth();

  return (
    <EducationalPanelProvider>
      <div data-act="shell" className={`flex h-svh flex-col ${sweep ? 'sweep-active' : ''}`}>
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
        <div data-region="inspector" className="flex shrink-0 flex-col border-t border-(--color-rule) bg-(--color-panel)">
          <InspectorDrawer />
        </div>
        <WebLLMDock />
        <div data-region="status-bar" className="border-t border-(--color-rule-2) bg-(--color-chrome)">
          <StatusBar />
        </div>
      </div>
      <CommandPalette />
      <TransformGuardHost />
      {settingsOpen && <AISettingsPanel hideModeSwitch onClose={() => setSettingsOpen(false)} />}
    </EducationalPanelProvider>
  );
}

// ---------------------------------------------------------------------------
// Hooks (unchanged from WorkbenchShell)
// ---------------------------------------------------------------------------

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

let workspaceRestoreInFlight: Promise<RestoreReport> | null = null;

function restoreWorkspaceSingleFlight(): Promise<RestoreReport> {
  if (workspaceRestoreInFlight) return workspaceRestoreInFlight;
  const restore = restoreStagedTables();
  workspaceRestoreInFlight = restore;
  const clear = () => {
    if (workspaceRestoreInFlight === restore) workspaceRestoreInFlight = null;
  };
  void restore.then(clear, clear);
  return restore;
}

function useWorkspaceRestore(): void {
  useEffect(() => {
    if (usePersistenceStore.getState().restore !== null) return;
    let cancelled = false;
    void restoreWorkspaceSingleFlight().then((report) => {
      if (cancelled) return;
      usePersistenceStore.getState().setRestore(report);
      return rehydrateWorkspace(report);
    });
    return () => {
      cancelled = true;
    };
  }, []);
}

// ---------------------------------------------------------------------------
// WorkbenchShellReveal — the modified shell with the reveal intermediate state.
//
// State machine:
//   'welcome'  → user has no data yet (act0/act1)
//   'reveal'   → data just landed; show the analyst greeting
//   'sweeping' → user activated "Enter workspace"; panels are animating in
//   'shell'    → full workspace, animations done
// ---------------------------------------------------------------------------
type RevealPhase = 'welcome' | 'reveal' | 'sweeping' | 'shell';

export function WorkbenchShellReveal() {
  const hasDatasets = useDatasetsStore((state) => state.datasets.length > 0);
  const workerStatus = useDatasetsStore((state) => state.workerStatus);
  const workspaceRestore = usePersistenceStore((state) => state.restore);
  const dspsDocument = useDspsReceiverStore((state) => state.document);
  const dspsError = useDspsReceiverStore((state) => state.error);
  const act = selectWorkbenchAct({ hasDatasets, workerStatus });

  const [phase, setPhase] = useState<RevealPhase>('welcome');
  const revealTriggered = useRef(false);

  useMapAutoOpen(hasDatasets && phase === 'shell');
  useShareLinkOpener();
  useWorkspaceRestore();

  // Transition: when data arrives AND we haven't shown the reveal yet, go to 'reveal'.
  useEffect(() => {
    if (hasDatasets && phase === 'welcome' && !revealTriggered.current) {
      revealTriggered.current = true;
      setPhase('reveal');
    }
  }, [hasDatasets, phase]);

  // The Enter-to-enter shortcut lives in `AnalystReveal` now: it is the only
  // scope that knows whether a section is open, and a shortcut that fires while
  // the user is typing in the reveal's SQL editor is a trap, not an accelerator.

  const handleEnterWorkspace = useCallback(() => {
    setPhase('sweeping');
    // Open the map tab before the sweep starts so it animates in with content.
    if (useTabsStore.getState().tabs.length === 0) {
      useTabsStore.getState().openTab('map', MAP_TAB_SUBJECT);
    }
    // After sweep animations complete, settle into the normal shell.
    setTimeout(() => setPhase('shell'), 1200);
  }, []);

  // Viewer mode wins regardless
  if (dspsDocument || dspsError) return <ViewerMode document={dspsDocument} error={dspsError} />;

  // Workspace restore gate (unchanged)
  if (hasDatasets && workspaceRestore === null) {
    return (
      <div data-act="restore" className="flex h-svh items-center justify-center bg-(--color-canvas)">
        <p className="font-mono text-[length:var(--text-sm)] text-(--color-ink-3)">Restoring workspace…</p>
      </div>
    );
  }

  // Phase routing
  if (phase === 'welcome') {
    if (act === 'act0' || act === 'act1') {
      return (
        <div data-act={act}>
          <Welcome />
        </div>
      );
    }
    // Edge case: data appeared (e.g. from persistence) without going through reveal.
    // Fall through to shell.
    return <ShellGridAnimated sweep={false} />;
  }

  if (phase === 'reveal') {
    return <AnalystReveal onEnter={handleEnterWorkspace} />;
  }

  if (phase === 'sweeping') {
    return (
      <>
        <style>{REVEAL_CSS}</style>
        {/* The scrim fades out as the workspace sweeps in */}
        <div className="sweep-scrim fixed inset-0 z-50 bg-(--color-canvas)" />
        <ShellGridAnimated sweep />
      </>
    );
  }

  // phase === 'shell'
  return <ShellGridAnimated sweep={false} />;
}
