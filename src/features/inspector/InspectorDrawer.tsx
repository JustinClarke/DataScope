// The shell's bottom region — the item-inspector drawer (S3/S6.5, D73, master
// §13.3). W7 built this region as a single scent strip; D73 reverses that at
// the region level and makes it the app's only free-typing SQL surface as well.
//
// S6.5 resolves §13.3's "tab between them or split to see both" as a permanent
// split with one job per pane: **Info on the left** — the selection scent, then
// the result, its chart, the export actions and the history — and **the SQL
// editor on the right**, holding nothing but code. Expanding does not only make
// the drawer taller: it turns the split on its side, so the editor takes the
// top and Info becomes the results panel beneath it, which is the shape you
// want once a result is worth the whole screen. Below `SPLIT_MIN_DRAWER_WIDTH`
// the panes stack for the same reason any narrow window does — and neither pane
// is ever hidden, which is why there is no view switcher left to build.
//
// S6.7 narrows one thing about that split: Info is present when it has
// something to show — a selection or a run — and absent otherwise, rather than
// sitting there empty next to an empty editor. The guarantee S6.5 built the
// permanent split for survives, because a run is one of the two things that
// makes Info appear.
//
// Three behaviours here are decided in master and deliberately not softened:
// a selection opens the drawer and lands in Info even while the caret is in the
// editor; a result never expands the drawer on its own; and expanding pushes
// against the canvas above, never over the dock below.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import {
  useDrawerStore,
  DRAWER_MIN_HEIGHT,
  SPLIT_MIN_DRAWER_WIDTH,
} from "../../stores/drawer";
import { useSelectionStore } from "../../stores/selection";
import { useQuerySession, CONSOLE_SESSION } from "../../stores/query";
import { DrawerInfo } from "./DrawerInfo";
import { SqlModule } from "../sql/SqlModule";

/** Room left for the title bar, dock and status bar when the drawer is dragged to its tallest — and, since S6.5, when it is expanded. */
const CHROME_RESERVE = 140;

/** How long Info's header stays marked after a selection lands in it. */
const INFO_SIGNAL_MS = 400;

/** Drag-to-resize from the drawer's top edge — the horizontal twin of the explorer's `useExplorerWidth`, and unpersisted for the same reason. */
function useDrawerResize() {
  const height = useDrawerStore((state) => state.height);
  const setHeight = useDrawerStore((state) => state.setHeight);

  return useCallback(
    (downEvent: ReactMouseEvent) => {
      downEvent.preventDefault();
      const startY = downEvent.clientY;
      const startHeight = height;
      const max = Math.max(
        DRAWER_MIN_HEIGHT,
        window.innerHeight - CHROME_RESERVE,
      );
      const onMouseMove = (moveEvent: MouseEvent) => {
        const next = startHeight - (moveEvent.clientY - startY);
        setHeight(Math.min(max, Math.max(DRAWER_MIN_HEIGHT, next)));
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [height, setHeight],
  );
}

/**
 * Drag the split. One ratio serves both layouts because it means the same thing
 * in each — Info's share of the drawer — so the axis changes and the proportion
 * the user chose does not. Info leads the row and trails the column, hence the
 * two directions.
 */
function useSplitResize(
  containerRef: RefObject<HTMLDivElement | null>,
  stacked: boolean,
) {
  const setInfoRatio = useDrawerStore((state) => state.setInfoRatio);

  return useCallback(
    (downEvent: ReactMouseEvent) => {
      downEvent.preventDefault();
      const box = containerRef.current?.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0) return;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const ratio = stacked
          ? (box.bottom - moveEvent.clientY) / box.height
          : (moveEvent.clientX - box.left) / box.width;
        if (Number.isFinite(ratio)) setInfoRatio(ratio);
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [containerRef, setInfoRatio, stacked],
  );
}

/**
 * The drawer spans the shell's full width — it is a sibling of the body row,
 * not a child of it — so a window resize listener plus a measurement tracks it
 * exactly, without a `ResizeObserver`.
 *
 * A width of zero means "not laid out yet", never "narrow": only a *positive*
 * measurement below the threshold stacks the panes, so the first paint is the
 * primary layout rather than a flash of the other one.
 */
function useIsNarrow(ref: RefObject<HTMLDivElement | null>): boolean {
  const [narrow, setNarrow] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const width = ref.current?.getBoundingClientRect().width ?? 0;
      setNarrow(width > 0 && width < SPLIT_MIN_DRAWER_WIDTH);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref]);

  return narrow;
}

/**
 * §13.3: "Clicking any inspectable item — an ERD node, an explorer row —
 * opens the drawer if collapsed and selects Info." Followed as written.
 * Skips the initial mount, so a shell that starts with a selection already in
 * the store doesn't count as a click.
 */
function useSelectionOpensInfo() {
  const lastSelectionKind = useSelectionStore(
    (state) => state.lastSelectionKind,
  );
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
  }, [
    lastSelectionKind,
    selectedTableId,
    selectedColumn,
    selectedEdgeId,
    openInfo,
  ]);
}

/** Marks Info's header briefly when a selection lands in it — no motion, no toast, no focus steal. */
function useInfoMark(): boolean {
  const infoSignal = useDrawerStore((state) => state.infoSignal);
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    if (infoSignal === 0) return;
    setMarked(true);
    const timer = setTimeout(() => setMarked(false), INFO_SIGNAL_MS);
    return () => clearTimeout(timer);
  }, [infoSignal]);

  return marked;
}

/**
 * Whether Info has anything to be. S6.7 makes the pane's presence answer to its
 * contents rather than to the drawer merely being open — an empty Info beside
 * an empty editor is two dead panels, which is what the human reported.
 *
 * S6.5's guarantee is kept, not dropped: a run is one of exactly two things
 * that can make this true, so a result still can never land somewhere the user
 * cannot see it. And it does not flicker mid-session — `status` only returns to
 * `'idle'` via `clearResult`, which fires only on a run superseded by the run
 * replacing it, setting `'running'` again in the same tick.
 */
function useHasInfoContent(): boolean {
  const lastSelectionKind = useSelectionStore(
    (state) => state.lastSelectionKind,
  );
  const { status } = useQuerySession(CONSOLE_SESSION);
  return lastSelectionKind !== null || status !== "idle";
}

/** Each pane names itself; the strip above them carries only the drawer's own controls. */
function PaneHeader({
  label,
  marked = false,
  testId,
}: {
  label: string;
  marked?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      data-marked={marked}
      className={`shrink-0 border-b px-3 py-1 font-mono text-[length:var(--text-xs)] ${
        marked
          ? "border-(--color-active) text-(--color-active)"
          : "border-(--color-rule-2) text-(--color-ink-3)"
      }`}
    >
      {label}
    </div>
  );
}

export function InspectorDrawer() {
  const open = useDrawerStore((state) => state.open);
  const expanded = useDrawerStore((state) => state.expanded);
  const height = useDrawerStore((state) => state.height);
  const infoRatio = useDrawerStore((state) => state.infoRatio);
  const setOpen = useDrawerStore((state) => state.setOpen);
  const setExpanded = useDrawerStore((state) => state.setExpanded);
  const onHandleMouseDown = useDrawerResize();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const narrow = useIsNarrow(rootRef);
  const infoMarked = useInfoMark();
  const hasInfoContent = useHasInfoContent();
  useSelectionOpensInfo();

  // Expanding is what turns the split on its side: a result worth the full
  // height is worth the full width too, so the editor takes the top and Info
  // becomes the panel underneath it.
  const stacked = expanded || narrow;
  const onSplitMouseDown = useSplitResize(splitRef, stacked);

  // Mounted with the drawer's first open and never unmounted after (S6.5
  // retires S3's editor-activation gate). Collapse hides the body, so the
  // editor's buffer survives it — the same contract `TabHost` holds for tabs.
  // Monaco is still absent from the shell's own mount: this subtree does not
  // exist until a drawer opens.
  const [editorMounted, setEditorMounted] = useState(false);
  useEffect(() => {
    if (open) setEditorMounted(true);
  }, [open]);

  return (
    <div
      ref={rootRef}
      data-testid="inspector-drawer"
      data-open={open}
      data-expanded={expanded}
      data-stacked={stacked}
      className="flex shrink-0 flex-col overflow-hidden"
      style={
        open
          ? // Never `100svh`: this element's in-flow siblings are the dock and
            // the status bar, so a viewport-height drawer pushes the privacy
            // posture off the screen — §13.3's "against the canvas, never over
            // the dock". The reserve is the one drag-to-max already uses, so
            // expanding and dragging to the top agree.
            { height: expanded ? `calc(100svh - ${CHROME_RESERVE}px)` : height }
          : undefined
      }
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
        <span className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[length:var(--text-xs)] text-(--color-ink-3)">
          Inspector
          {!open && hasInfoContent && (
            <span
              aria-label="Inspector has content"
              className="inline-block h-[6px] w-[6px] rounded-full bg-(--color-active)"
              style={{
                boxShadow:
                  "0 0 6px color-mix(in oklch, var(--color-active) 50%, transparent)",
              }}
            />
          )}
        </span>
        <div className="flex items-center gap-1 px-2">
          <button
            type="button"
            aria-label={
              expanded
                ? "Restore drawer height"
                : "Expand drawer to full height"
            }
            title={
              expanded
                ? "Restore the drawer and sit the panes side by side"
                : "Expand the drawer and stack Info beneath the editor"
            }
            onClick={() => setExpanded(!expanded)}
            className="rounded-(--radius-xs) p-1 text-(--color-ink-3) hover:bg-(--color-elev) hover:text-(--color-ink)"
          >
            {expanded ? (
              <Minimize2 size={12} aria-hidden="true" />
            ) : (
              <Maximize2 size={12} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label={
              open
                ? "Collapse drawer — any selection reopens it"
                : "Open drawer"
            }
            title={
              open
                ? "Collapse the drawer. Selecting a table, column or relationship reopens it."
                : "Open drawer"
            }
            onClick={() => setOpen(!open)}
            className="rounded-(--radius-xs) p-1 text-(--color-ink-3) hover:bg-(--color-elev) hover:text-(--color-ink)"
          >
            {open ? (
              <ChevronDown size={12} aria-hidden="true" />
            ) : (
              <ChevronUp size={12} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Source order is Info → editor in both layouts; `flex-col-reverse` is
          what lifts the editor to the top when stacked, so the pane a screen
          reader meets first is the one holding the answer either way.

          With nothing selected and nothing run there is no Info pane and no
          divider at all (S6.7) — the editor takes the drawer whole, which is
          the only thing there is to do at that point. */}
      <div
        ref={splitRef}
        hidden={!open}
        data-split={hasInfoContent}
        className={`flex min-h-0 flex-1 overflow-hidden ${stacked ? "flex-col-reverse" : "flex-row"}`}
      >
        {hasInfoContent && (
          <>
            <div
              data-testid="drawer-info-pane"
              className="flex min-h-0 min-w-0 flex-col"
              style={{ flexGrow: infoRatio, flexBasis: 0 }}
            >
              <PaneHeader
                label="Info"
                marked={infoMarked}
                testId="drawer-info-header"
              />
              {/* Unmounted by a collapse, unlike the editor: that is what makes
                  the collapse-to-header-strip contract mean anything. */}
              {open && <DrawerInfo />}
            </div>

            <div
              role="separator"
              aria-orientation={stacked ? "horizontal" : "vertical"}
              aria-label="Resize info panel"
              aria-valuenow={Math.round(infoRatio * 100)}
              aria-valuemin={30}
              aria-valuemax={70}
              onMouseDown={onSplitMouseDown}
              className={`shrink-0 bg-(--color-rule-2) hover:bg-(--color-active)/40 active:bg-(--color-active)/60 ${
                stacked ? "h-1 cursor-row-resize" : "w-1 cursor-col-resize"
              }`}
            />
          </>
        )}

        <div
          data-testid="drawer-console-pane"
          className="flex min-h-0 min-w-0 flex-col"
          style={{ flexGrow: hasInfoContent ? 1 - infoRatio : 1, flexBasis: 0 }}
        >
          <PaneHeader label="SQL" />
          {editorMounted && <SqlModule />}
        </div>
      </div>
    </div>
  );
}
