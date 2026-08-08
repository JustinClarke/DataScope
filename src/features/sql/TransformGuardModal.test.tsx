import { describe, expect, it, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { TransformGuardModal } from "./TransformGuardModal";

// No RTL auto-cleanup is configured in vitest.config.ts (matching the rest of
// this test suite's convention), so queries are scoped to each test's own
// `container` rather than the global `screen`.

describe("TransformGuardModal", () => {
  it("names the target table and calls the right handler for each action", () => {
    const onMaterialize = vi.fn();
    const onModifyAnyway = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <TransformGuardModal
        targetTable="orders"
        onMaterialize={onMaterialize}
        onModifyAnyway={onModifyAnyway}
        onCancel={onCancel}
      />,
    );

    expect(within(container).getAllByText("orders").length).toBeGreaterThan(0);

    fireEvent.click(
      within(container).getByRole("button", {
        name: "Materialize as a new table",
      }),
    );
    expect(onMaterialize).toHaveBeenCalledOnce();
    expect(onModifyAnyway).not.toHaveBeenCalled();

    fireEvent.click(
      within(container).getByRole("button", { name: "Modify original anyway" }),
    );
    expect(onModifyAnyway).toHaveBeenCalledOnce();

    fireEvent.click(within(container).getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("clicking the backdrop cancels; clicking the dialog itself does not", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <TransformGuardModal
        targetTable="orders"
        onMaterialize={vi.fn()}
        onModifyAnyway={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(within(container).getByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(within(container).getByRole("presentation"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
