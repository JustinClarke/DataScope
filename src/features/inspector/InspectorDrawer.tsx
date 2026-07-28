// The shell's bottom region — the item-inspector drawer (S3, D73, master
// §13.3). W7 built this region as a single scent strip; D73 reverses that at
// the region level (not for Info, which keeps the charter) and makes it two
// user-controlled views over one docked, resizable, expandable pane: Info,
// and the app's only free-typing SQL surface.
//
// Three behaviours here are decided in master and deliberately not softened:
// a selection opens the drawer on Info even from the console; a result never
// expands the drawer on its own; and the console's editor is never mounted
// until someone asks for it.
import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react';
import { useDrawerStore, DRAWER_MIN_HEIGHT, type DrawerView } from '../../stores/drawer';
import { useSelectionStore } from '../../stores/selection';
import { Inspector } from './Inspector';
import { ConsoleColdState, DrawerConsole } from './DrawerConsole';

/** Room left for the title bar, tab strip, dock and status bar when the drawer is dragged to its tallest. */
const CHROME_RESERVE = 140;

/** Drag-to-resize from the drawer's top edge — the horizontal twin of the explorer's `useExplorerWidth`, and unpersisted for the same reason. */
function useDrawerResize() {
  const height = useDrawerStore((state) => state.height);
  const setHeight = useDrawerStore((state) => state.setHeight);

  return useCallback(
    (downEvent: ReactMouseEvent) => {
      downEvent.preventDefault();
      const startY = downEvent.clientY;
      const startHeight = height;
      const max = Math.max(DRAWER_MIN_HEIGHT, window.innerHeight - CHROME_RESERVE);
      const onMouseMove = (moveEvent: MouseEvent) => {
        const next = startHeight - (moveEvent.clientY - startY);
        setHeight(Math.min(max, Math.max(DRAWER_MIN_HEIGHT, next)));
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [height, setHeight],
  );
}

/**
 * §13.3: "Clicking any inspectable item — an ERD node, an explorer row —
 * opens the drawer if collapsed and selects Info." Followed as written,
 * including from the console: the console keeps its buffer, results and
 * history while hidden, so the trip back costs one click and loses nothing.
 * Skips the initial mount, so a shell that starts with a selection already in
 * the store doesn't count as a click.
 */
function useSelectionOpensInfo() {
  const lastSelectionKind = useSelectionStore((state) => state.lastSelectionKind);
  const selectedTableId = useSelectionStore((state) => state.selectedTableId);
  const selectedColumn = useSelectionStore((state) => state.selectedColumn);
  const selectedEdgeId = useSelectionStore((state) => state.selectedEdgeId);
  const openInfo = useDrawerStore((state) => state.openInfo);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    openInfo();
  }, [lastSelectionKind, selectedTableId, selectedColumn, selectedEdgeId, openInfo]);
}

function ViewButton({ view, label }: { view: DrawerView; label: string }) {
  const activeView = useDrawerStore((state) => state.view);
  const open = useDrawerStore((state) => state.open);
  const showView = useDrawerStore((state) => state.showView);
  const isActive = open && activeView === view;

  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={() => showView(view)}
      className={`border-b-2 px-3 py-1.5 font-mono text-[length:var(--text-xs)] ${
        isActive
          ? 'border-(--color-active) text-(--color-ink)'
          : 'border-transparent text-(--color-ink-3) hover:text-(--color-ink-2)'
      }`}
    >
      {label}
    </button>
  );
}

export function InspectorDrawer() {
  const open = useDrawerStore((state) => state.open);
  const view = useDrawerStore((state) => state.view);
  const consoleActivated = useDrawerStore((state) => state.consoleActivated);
  const expanded = useDrawerStore((state) => state.expanded);
  const height = useDrawerStore((state) => state.height);
  const setOpen = useDrawerStore((state) => state.setOpen);
  const setExpanded = useDrawerStore((state) => state.setExpanded);
  const onHandleMouseDown = useDrawerResize();
  useSelectionOpensInfo();

  return (
    <div
      data-testid="inspector-drawer"
      data-open={open}
      data-expanded={expanded}
      className="flex shrink-0 flex-col overflow-hidden"
      style={open ? { height: expanded ? '100svh' : height } : undefined}
    >
      {open && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize drawer"
          onMouseDown={onHandleMouseDown}
          className="h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-(--color-active)/40 active:bg-(--color-active)/60"
        />
      )}
      <div className="flex shrink-0 items-center justify-between border-b border-(--color-rule-2) bg-(--color-chrome)">
        <div className="flex items-center">
          <ViewButton view="info" label="Info" />
          <ViewButton view="console" label="SQL Console" />
        </div>
        <div className="flex items-center gap-1 px-2">
          <button
            type="button"
            aria-label={expanded ? 'Restore drawer height' : 'Expand drawer to full height'}
            onClick={() => setExpanded(!expanded)}
            className="rounded-(--radius-xs) p-1 text-(--color-ink-3) hover:bg-(--color-elev) hover:text-(--color-ink)"
          >
            {expanded ? <Minimize2 size={12} aria-hidden="true" /> : <Maximize2 size={12} aria-hidden="true" />}
          </button>
          <button
            type="button"
            aria-label={open ? 'Collapse drawer' : 'Open drawer'}
            onClick={() => setOpen(!open)}
            className="rounded-(--radius-xs) p-1 text-(--color-ink-3) hover:bg-(--color-elev) hover:text-(--color-ink)"
          >
            {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronUp size={12} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div hidden={!open} className="min-h-0 flex-1 overflow-hidden">
        <div hidden={!open || view !== 'info'} className="h-full overflow-y-auto">
          {open && <Inspector />}
        </div>
        <div hidden={!open || view !== 'console'} className="h-full">
          {/* Kept mounted once activated (never a conditional unmount below this
              point) so the console's buffer, results and history survive a view
              switch *and a collapse* — the same contract `TabHost` holds for tabs.
              Collapse hides this subtree, it never unmounts it. */}
          {consoleActivated ? <DrawerConsole /> : open && view === 'console' && <ConsoleColdState />}
        </div>
      </div>
    </div>
  );
}
