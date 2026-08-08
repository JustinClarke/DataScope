import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { InspectorDrawer } from "./InspectorDrawer";
import {
  useDrawerStore,
  DRAWER_DEFAULT_HEIGHT,
  INFO_DEFAULT_RATIO,
  INFO_MAX_RATIO,
  SPLIT_MIN_DRAWER_WIDTH,
} from "../../stores/drawer";
import { useSelectionStore } from "../../stores/selection";
import {
  useQueryStore,
  CONSOLE_SESSION,
  EMPTY_SESSION,
} from "../../stores/query";

// The central assertion is about *mounting*, not rendering: Monaco's ~2 MB
// chunk (§15) lives behind `SqlModule`'s own `lazy()`, so the drawer's contract
// is that `SqlModule` never mounts until a drawer opens, and never re-mounts
// once it has. The stub carries a focusable control so the no-focus-steal
// assertion has something real to hold focus.
const { sqlModuleMounts } = vi.hoisted(() => ({
  sqlModuleMounts: { count: 0 },
}));
vi.mock("../sql/SqlModule", () => ({
  SqlModule: () => {
    useEffect(() => {
      sqlModuleMounts.count += 1;
    }, []);
    return (
      <div data-testid="sql-module">
        <button type="button" data-testid="fake-editor">
          editor
        </button>
      </div>
    );
  },
}));

vi.mock("./DrawerInfo", () => ({
  DrawerInfo: () => <div data-testid="drawer-info" />,
}));

/**
 * `useIsNarrow` measures the drawer's own box. jsdom lays nothing out, so width
 * is 0 there — which the component reads as "not measured", keeping the panes
 * abreast. Only a *positive* width below the threshold stacks them, and this is
 * how a test states one.
 */
function measureAt({ width = 0, height = 0, left = 0, top = 0 } = {}) {
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(
    this: HTMLElement,
  ) {
    if (this.dataset.testid === "inspector-drawer") return { width } as DOMRect;
    return {
      width,
      height,
      left,
      top,
      right: left + width,
      bottom: top + height,
    } as DOMRect;
  };
  return () => {
    HTMLElement.prototype.getBoundingClientRect = original;
  };
}

describe("InspectorDrawer (S6.5)", () => {
  let restoreMeasure: (() => void) | null = null;

  afterEach(() => {
    cleanup();
    restoreMeasure?.();
    restoreMeasure = null;
  });

  beforeEach(() => {
    sqlModuleMounts.count = 0;
    useDrawerStore.setState({
      open: true,
      expanded: false,
      height: DRAWER_DEFAULT_HEIGHT,
      infoRatio: INFO_DEFAULT_RATIO,
      infoSignal: 0,
      consoleSignal: 0,
    });
    useQueryStore.setState({
      sessions: { [CONSOLE_SESSION]: { ...EMPTY_SESSION } },
      history: [],
      lastRunSession: CONSOLE_SESSION,
    });
    // Since S6.7 the split only exists once Info has something to show, so the
    // tests about the split itself state that precondition. The tests about
    // Info's *presence* clear it again.
    useSelectionStore.getState().selectTable("seed");
  });

  describe("the split", () => {
    it("shows Info and the editor at once, Info first and the editor to its right", () => {
      render(<InspectorDrawer />);
      expect(
        screen.getByTestId("inspector-drawer").getAttribute("data-stacked"),
      ).toBe("false");

      const info = screen.getByTestId("drawer-info-pane");
      const editor = screen.getByTestId("drawer-console-pane");
      expect(info.parentElement!.className).toContain("flex-row");
      expect(
        info.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("gives each pane its share of the drawer from the one ratio", () => {
      render(<InspectorDrawer />);
      expect(screen.getByTestId("drawer-info-pane").style.flexGrow).toBe(
        String(INFO_DEFAULT_RATIO),
      );
      expect(screen.getByTestId("drawer-console-pane").style.flexGrow).toBe(
        String(1 - INFO_DEFAULT_RATIO),
      );
    });

    it("drags the split and refuses to hand either pane the whole drawer", () => {
      restoreMeasure = measureAt({ width: 1000, height: 400, left: 0, top: 0 });
      render(<InspectorDrawer />);
      const splitter = screen.getByRole("separator", {
        name: "Resize info panel",
      });
      expect(splitter.getAttribute("aria-orientation")).toBe("vertical");

      fireEvent.mouseDown(splitter, { clientX: 500 });
      fireEvent.mouseMove(document, { clientX: 600 });
      expect(useDrawerStore.getState().infoRatio).toBeCloseTo(0.6);

      fireEvent.mouseMove(document, { clientX: 5000 });
      expect(useDrawerStore.getState().infoRatio).toBe(INFO_MAX_RATIO);
      fireEvent.mouseUp(document);
    });

    // Nothing is hidden, so there is no view to switch to and no switcher.
    it("offers no view switcher", () => {
      render(<InspectorDrawer />);
      expect(screen.queryByRole("button", { name: "SQL Console" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Info" })).toBeNull();
      expect(screen.getByTestId("drawer-info-header").textContent).toBe("Info");
    });
  });

  describe("expanding", () => {
    // The defect S3 shipped against its own criterion: `100svh` on a `shrink-0`
    // element whose in-flow siblings are the dock and the status bar pushes both
    // below the fold, taking the privacy posture dot with them.
    it("sizes itself against the canvas rather than the whole viewport", () => {
      render(<InspectorDrawer />);
      fireEvent.click(
        screen.getByRole("button", { name: "Expand drawer to full height" }),
      );
      const drawer = screen.getByTestId("inspector-drawer");
      expect(drawer.getAttribute("data-expanded")).toBe("true");
      expect(drawer.style.height).not.toBe("100svh");
      expect(drawer.style.height).toContain("calc(100svh -");
    });

    // The gesture is "show me this result properly", so the result gets the
    // drawer's full width, not half of it.
    it("turns the split on its side — editor above, Info the panel beneath it", () => {
      render(<InspectorDrawer />);
      fireEvent.click(
        screen.getByRole("button", { name: "Expand drawer to full height" }),
      );

      expect(
        screen.getByTestId("inspector-drawer").getAttribute("data-stacked"),
      ).toBe("true");
      expect(
        screen.getByTestId("drawer-info-pane").parentElement!.className,
      ).toContain("flex-col-reverse");
      expect(
        screen
          .getByRole("separator", { name: "Resize info panel" })
          .getAttribute("aria-orientation"),
      ).toBe("horizontal");
    });

    it("restores the side-by-side split and the dragged height", () => {
      useDrawerStore.getState().setHeight(300);
      render(<InspectorDrawer />);
      fireEvent.click(
        screen.getByRole("button", { name: "Expand drawer to full height" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Restore drawer height" }),
      );
      expect(
        screen.getByTestId("inspector-drawer").getAttribute("data-stacked"),
      ).toBe("false");
      expect(useDrawerStore.getState().height).toBe(300);
    });
  });

  describe("Monaco's boundary", () => {
    it("does not mount SqlModule until the drawer opens, and never remounts it", () => {
      useDrawerStore.setState({ open: false });
      render(<InspectorDrawer />);
      expect(screen.queryByTestId("sql-module")).toBeNull();
      expect(sqlModuleMounts.count).toBe(0);

      fireEvent.click(screen.getByRole("button", { name: "Open drawer" }));
      expect(screen.getByTestId("sql-module")).toBeTruthy();
      expect(sqlModuleMounts.count).toBe(1);
    });

    it("keeps the editor mounted across a collapse, so its buffer survives", () => {
      render(<InspectorDrawer />);
      expect(sqlModuleMounts.count).toBe(1);
      fireEvent.click(screen.getByRole("button", { name: /Collapse drawer/ }));
      fireEvent.click(screen.getByRole("button", { name: "Open drawer" }));
      expect(sqlModuleMounts.count).toBe(1);
    });

    it("collapses to its header strip — Info unmounted, a way back in still offered", () => {
      render(<InspectorDrawer />);
      fireEvent.click(screen.getByRole("button", { name: /Collapse drawer/ }));
      expect(screen.queryByTestId("drawer-info")).toBeNull();
      expect(screen.getByRole("button", { name: "Open drawer" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Open drawer" }));
      expect(screen.getByTestId("drawer-info")).toBeTruthy();
    });

    // Every selection re-opens the drawer, so the control that closes it has to
    // say what will bring it back.
    it("names what re-opens the drawer on the collapse control", () => {
      render(<InspectorDrawer />);
      expect(
        screen
          .getByRole("button", { name: /Collapse drawer/ })
          .getAttribute("aria-label"),
      ).toContain("selection reopens it");
    });
  });

  describe("the selection hand-off", () => {
    it("opens a collapsed drawer on a selection (§13.3), editor still mounted underneath", () => {
      render(<InspectorDrawer />);
      fireEvent.click(screen.getByRole("button", { name: /Collapse drawer/ }));

      act(() => {
        useSelectionStore.getState().selectTable("t1");
      });

      expect(useDrawerStore.getState().open).toBe(true);
      expect(sqlModuleMounts.count).toBe(1);
    });

    // Under a permanent split a selection moves no chrome, so the signal is a
    // marked header — and never the caret, which is usually in the editor.
    it("marks Info without taking focus from the editor", () => {
      render(<InspectorDrawer />);
      const editor = screen.getByTestId("fake-editor");
      editor.focus();

      act(() => {
        useSelectionStore.getState().selectTable("t1");
      });

      expect(document.activeElement).toBe(editor);
      expect(
        screen.getByTestId("drawer-info-header").getAttribute("data-marked"),
      ).toBe("true");
    });

    it("does not treat a selection already in the store at mount time as a click", () => {
      useSelectionStore.getState().selectTable("t1");
      useDrawerStore.setState({ open: false, infoSignal: 0 });
      render(<InspectorDrawer />);
      expect(useDrawerStore.getState().open).toBe(false);
      expect(useDrawerStore.getState().infoSignal).toBe(0);
    });
  });

  describe("Info's presence (S6.7)", () => {
    it("renders no Info pane and no divider with nothing selected and nothing run", () => {
      useSelectionStore.getState().clearSelection();
      render(<InspectorDrawer />);

      expect(screen.queryByTestId("drawer-info-pane")).toBeNull();
      expect(screen.queryByTestId("drawer-info")).toBeNull();
      expect(
        screen.queryByRole("separator", { name: "Resize info panel" }),
      ).toBeNull();
    });

    it("hands the whole drawer to the editor when Info is absent", () => {
      useSelectionStore.getState().clearSelection();
      render(<InspectorDrawer />);
      expect(screen.getByTestId("drawer-console-pane").style.flexGrow).toBe(
        "1",
      );
    });

    it("opens Info on a selection, with no run", () => {
      useSelectionStore.getState().clearSelection();
      render(<InspectorDrawer />);

      act(() => {
        useSelectionStore.getState().selectTable("t1");
      });

      expect(screen.getByTestId("drawer-info-pane")).toBeTruthy();
      expect(screen.getByTestId("drawer-console-pane").style.flexGrow).toBe(
        String(1 - INFO_DEFAULT_RATIO),
      );
    });

    // S6.5's guarantee, kept: a run can never land in a pane the user cannot
    // see — it is one of exactly two things that make the pane exist.
    it("opens Info on a run, with nothing selected", () => {
      useSelectionStore.getState().clearSelection();
      render(<InspectorDrawer />);

      act(() => {
        useQueryStore.getState().queryStarted(CONSOLE_SESSION, "select 1");
      });

      expect(screen.getByTestId("drawer-info-pane")).toBeTruthy();
    });
  });

  describe("the narrow drawer", () => {
    it("stacks rather than hiding a pane, so a run is never invisible", () => {
      restoreMeasure = measureAt({
        width: SPLIT_MIN_DRAWER_WIDTH - 1,
        height: 300,
      });
      render(<InspectorDrawer />);

      expect(
        screen.getByTestId("inspector-drawer").getAttribute("data-stacked"),
      ).toBe("true");
      expect(
        screen.getByTestId("drawer-info-pane").hasAttribute("hidden"),
      ).toBe(false);
      expect(
        screen.getByTestId("drawer-console-pane").hasAttribute("hidden"),
      ).toBe(false);
    });

    it("keeps the panes abreast at the threshold itself", () => {
      restoreMeasure = measureAt({
        width: SPLIT_MIN_DRAWER_WIDTH,
        height: 300,
      });
      render(<InspectorDrawer />);
      expect(
        screen.getByTestId("inspector-drawer").getAttribute("data-stacked"),
      ).toBe("false");
    });
  });
});
