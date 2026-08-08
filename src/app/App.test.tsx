import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import App from "./App";
import { useDatasetsStore } from "../stores/datasets";

// Post-cutover, App is a thin wrapper around WorkbenchShell (the app's only
// shell, HANDOFF-W8-CUTOVER.md) — WorkbenchShell.test.tsx already covers the
// shell's behavior exhaustively, so this stays a smoke test.
describe("App", () => {
  beforeEach(() => {
    useDatasetsStore.setState({
      tables: [],
      datasets: [],
      workerStatus: "idle",
      workerError: null,
    });
  });

  it("renders WorkbenchShell content", () => {
    const { container } = render(<App />);
    expect(container.querySelector('[data-act="act0"]')).not.toBeNull();
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });
});
