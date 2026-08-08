import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { TransformGuardHost } from "./TransformGuardHost";
import { useRunGuardStore } from "../stores/runGuard";
import { CONSOLE_SESSION } from "../stores/query";
import { classifyStatement } from "../lib/statementClass";
import * as runPath from "../services/runPath";

vi.mock("../services/runPath", async () => {
  const actual = await vi.importActual<typeof runPath>("../services/runPath");
  return {
    ...actual,
    materializeGuarded: vi.fn(),
    modifyAnywayGuarded: vi.fn(),
    cancelGuarded: vi.fn(),
  };
});

describe("TransformGuardHost", () => {
  beforeEach(() => {
    useRunGuardStore.setState({ pending: null });
    vi.mocked(runPath.materializeGuarded).mockReset();
    vi.mocked(runPath.modifyAnywayGuarded).mockReset();
    vi.mocked(runPath.cancelGuarded).mockReset();
  });

  it("renders nothing while no statement is held", () => {
    const { container } = render(<TransformGuardHost />);
    expect(within(container).queryByRole("dialog")).toBeNull();
  });

  it("renders the guard for a held mutation, naming its target", () => {
    useRunGuardStore
      .getState()
      .hold(classifyStatement("DROP TABLE orders"), CONSOLE_SESSION);
    const { container } = render(<TransformGuardHost />);

    expect(within(container).getByRole("dialog").textContent).toContain(
      "orders",
    );
  });

  it.each([
    ["Materialize as a new table", () => runPath.materializeGuarded],
    ["Modify original anyway", () => runPath.modifyAnywayGuarded],
    ["Cancel", () => runPath.cancelGuarded],
  ])("%s calls its resolution on the run path", (label, resolution) => {
    useRunGuardStore
      .getState()
      .hold(classifyStatement("DROP TABLE orders"), CONSOLE_SESSION);
    const { container } = render(<TransformGuardHost />);

    fireEvent.click(within(container).getByRole("button", { name: label }));
    expect(resolution()).toHaveBeenCalledOnce();
  });
});
