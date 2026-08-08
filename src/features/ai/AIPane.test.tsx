import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { AIPane } from "./AIPane";
import { useSettingsStore } from "../../stores/settings";
import { useLayoutStore } from "../../stores/layout";

beforeEach(() => {
  useSettingsStore.setState({
    aiMode: null,
    byokPreference: "free-tier-first",
    byokRoutingTouched: false,
  });
  useLayoutStore.setState({ aiPaneCollapsed: false });
});
afterEach(() => cleanup());

describe('AIPane — composition (W7, §13.3 "the pane\'s hero")', () => {
  it("renders ModeSwitches above the AIChatModule transcript", () => {
    const { getByText } = render(<AIPane onConfigure={vi.fn()} />);
    expect(getByText("Off")).toBeTruthy();
    expect(getByText(/Ask a question in plain English/)).toBeTruthy();
  });

  it('forwards onConfigure to ModeSwitches\' "Configure workspace" button', () => {
    const onConfigure = vi.fn();
    const { getByText } = render(<AIPane onConfigure={onConfigure} />);
    fireEvent.click(getByText("Configure workspace"));
    expect(onConfigure).toHaveBeenCalled();
  });

  it("collapsing hides ModeSwitches/chat and renders only a re-expand strip", () => {
    const { getByLabelText, queryByText } = render(
      <AIPane onConfigure={vi.fn()} />,
    );
    fireEvent.click(getByLabelText("Collapse AI pane"));
    expect(queryByText("Off")).toBeNull();
    expect(queryByText(/Ask a question/)).toBeNull();
    expect(getByLabelText("Expand AI pane")).toBeTruthy();
  });

  it("expanding restores ModeSwitches/chat", () => {
    const { getByLabelText, queryByText } = render(
      <AIPane onConfigure={vi.fn()} />,
    );
    fireEvent.click(getByLabelText("Collapse AI pane"));
    fireEvent.click(getByLabelText("Expand AI pane"));
    expect(queryByText("Off")).toBeTruthy();
  });
});
