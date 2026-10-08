// The section that tells the truth about what the local daemon is holding.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

const listRunningOllamaModels = vi.fn();
const unloadOllamaModel = vi.fn(() => Promise.resolve(true));

vi.mock("../../services/ollamaProvider", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listRunningOllamaModels,
  unloadOllamaModel,
}));

const { LocalRuntimeSection } = await import("./LocalRuntimeSection");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  listRunningOllamaModels.mockReset();
  unloadOllamaModel.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LocalRuntimeSection", () => {
  it("names each resident model, its memory, and when it frees itself", async () => {
    listRunningOllamaModels.mockResolvedValue([
      {
        name: "qwen3:4b",
        sizeBytes: 3_169_761_361,
        expiresAt: new Date(Date.now() + 18 * 60_000),
      },
    ]);
    render(<LocalRuntimeSection baseUrl="http://localhost:11434" />);
    expect(await screen.findByText("qwen3:4b")).toBeTruthy();
    expect(screen.getByText(/frees in 18m/)).toBeTruthy();
  });

  // The honest claim, asserted so it cannot be quietly upgraded into a promise
  // the app can't keep: a browser cannot stop `ollama serve`.
  it("says the daemon keeps running and that this page cannot stop it", async () => {
    listRunningOllamaModels.mockResolvedValue([]);
    render(<LocalRuntimeSection baseUrl="http://localhost:11434" />);
    expect(
      screen.getByText(/Closing this tab does not stop it/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/it cannot stop the daemon itself/i),
    ).toBeTruthy();
  });

  it("unloads the model the button names", async () => {
    listRunningOllamaModels.mockResolvedValue([
      { name: "qwen3:4b", sizeBytes: 3_169_761_361, expiresAt: null },
    ]);
    render(<LocalRuntimeSection baseUrl="http://localhost:11434" />);
    fireEvent.click(await screen.findByLabelText("Unload qwen3:4b"));
    await waitFor(() =>
      expect(unloadOllamaModel).toHaveBeenCalledWith("qwen3:4b", {
        baseUrl: "http://localhost:11434",
      }),
    );
  });

  it("reports an empty daemon as no memory held", async () => {
    listRunningOllamaModels.mockResolvedValue([]);
    render(<LocalRuntimeSection baseUrl="http://localhost:11434" />);
    expect(await screen.findByText(/no memory held/i)).toBeTruthy();
  });
});
