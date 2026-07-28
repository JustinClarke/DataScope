// The drawer's console view (S3, D73, master §13.3 / §10 Module 2) — the SQL
// playground re-homed, its contents untouched. Two pieces: the cold state the
// drawer shows before anyone asks for an editor, and the console itself.
//
// The cold state is what keeps Monaco's ~2 MB chunk (§15) off the startup
// path: `SqlModule` owns the `lazy()` import, so as long as it stays unmounted
// the shell's mount never reaches it. A drawer is present in every session;
// an editor is not.
import { Terminal } from 'lucide-react';
import { useDrawerStore } from '../../stores/drawer';
import { useQuerySession, CONSOLE_SESSION } from '../../stores/query';
import { SqlModule } from '../sql/SqlModule';

/**
 * Above this many result rows the console offers to expand the drawer rather
 * than doing it (§13.3: "results never auto-expand"). A row count, not a
 * measured overflow — the accepted trade is "two gestures away, not zero",
 * which a `ResizeObserver`'s extra accuracy would not change.
 */
export const PROMPT_ABOVE_ROWS = 12;

export function ConsoleColdState() {
  const activateConsole = useDrawerStore((state) => state.activateConsole);

  return (
    <div data-testid="console-cold-state" className="flex flex-col items-start gap-3 px-4 py-5">
      <div className="flex items-center gap-2">
        <Terminal size={14} aria-hidden="true" className="text-(--color-ink-3)" />
        <span className="micro text-(--color-ink-3)">SQL Console</span>
      </div>
      <p className="max-w-prose text-[length:var(--text-sm)] text-(--color-ink-2)">
        The one place SQL is written. Queries run against the tables in this session, and the next
        run replaces this one's results.
      </p>
      <button
        type="button"
        onClick={activateConsole}
        className="rounded-(--radius-xs) bg-(--color-active) px-3 py-1.5 font-mono text-[length:var(--text-xs)] text-(--color-active-ink)"
      >
        Open SQL editor
      </button>
    </div>
  );
}

/** The expand offer — never an automatic resize. */
function ResultOverflowPrompt() {
  const { status, result } = useQuerySession(CONSOLE_SESSION);
  const expanded = useDrawerStore((state) => state.expanded);
  const setExpanded = useDrawerStore((state) => state.setExpanded);

  if (expanded || status !== 'success' || !result || result.rows.length <= PROMPT_ABOVE_ROWS) {
    return null;
  }

  return (
    <button
      type="button"
      data-testid="drawer-expand-prompt"
      onClick={() => setExpanded(true)}
      className="w-full border-b border-(--color-rule-2) bg-(--color-elev) px-4 py-1.5 text-left font-mono text-[length:var(--text-xs)] text-(--color-ink-2) hover:text-(--color-ink)"
    >
      {result.rows.length.toLocaleString()} rows — click to expand
    </button>
  );
}

export function DrawerConsole() {
  return (
    <div data-testid="drawer-console" className="flex h-full flex-col">
      <ResultOverflowPrompt />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <SqlModule />
      </div>
    </div>
  );
}
