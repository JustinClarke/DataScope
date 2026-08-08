import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  warmWebLLM,
  webllmChat,
  isWebLLMReady,
  isWebLLMServing,
  resetWebLLMForTests,
  type WebLLMEngine,
} from "./webllm";
import { useWebLLMStore } from "../stores/webllm";
import { useSettingsStore } from "../stores/settings";

const noDelay = () => Promise.resolve();

function fakeEngine(reply = "ok"): WebLLMEngine {
  return {
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: reply } }],
        })),
      },
    },
  };
}

beforeEach(() => {
  resetWebLLMForTests();
  useWebLLMStore.setState({
    status: "idle",
    progress: 0,
    progressText: "",
    error: null,
  });
  useSettingsStore.setState({ webllmConsent: null });
});

describe("warmWebLLM — the download/warm state machine", () => {
  it("marks unavailable and resolves false when WebGPU is absent", async () => {
    const created = vi.fn();
    const ok = await warmWebLLM({
      hasWebGPU: () => false,
      createEngine: created,
    });
    expect(ok).toBe(false);
    expect(created).not.toHaveBeenCalled();
    expect(useWebLLMStore.getState().status).toBe("unavailable");
  });

  it("walks idle → downloading → warming → ready with progress", async () => {
    const seen: string[] = [];
    useWebLLMStore.subscribe((s) => {
      if (seen[seen.length - 1] !== s.status) seen.push(s.status);
    });
    const ok = await warmWebLLM({
      hasWebGPU: () => true,
      createEngine: async (onProgress) => {
        onProgress(0.4, "Fetching param shard 12/30");
        onProgress(1, "Loading model onto GPU");
        return fakeEngine();
      },
    });
    expect(ok).toBe(true);
    expect(seen).toEqual(["downloading", "warming", "ready"]);
    expect(useWebLLMStore.getState().progressText).toBe(
      "Loading model onto GPU",
    );
    expect(isWebLLMReady()).toBe(true);
  });

  it("retries a dropped shard download and resumes to ready", async () => {
    let attempts = 0;
    const ok = await warmWebLLM({
      hasWebGPU: () => true,
      delay: noDelay,
      createEngine: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("Failed to fetch");
        return fakeEngine();
      },
    });
    expect(ok).toBe(true);
    expect(attempts).toBe(3);
    expect(useWebLLMStore.getState().status).toBe("ready");
  });

  it("lands on error (not a hang) when every attempt fails", async () => {
    const ok = await warmWebLLM({
      hasWebGPU: () => true,
      delay: noDelay,
      maxAttempts: 2,
      createEngine: async () => {
        throw new Error("Failed to fetch");
      },
    });
    expect(ok).toBe(false);
    expect(useWebLLMStore.getState().status).toBe("error");
    expect(useWebLLMStore.getState().error).toBe("Failed to fetch");
    expect(isWebLLMReady()).toBe(false);
  });

  it("shares one in-flight warm-up across concurrent calls", async () => {
    const created = vi.fn(async () => fakeEngine());
    const deps = { hasWebGPU: () => true, createEngine: created };
    const [a, b] = await Promise.all([warmWebLLM(deps), warmWebLLM(deps)]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(created).toHaveBeenCalledOnce();
    // A warm engine resolves immediately without re-creating.
    await warmWebLLM(deps);
    expect(created).toHaveBeenCalledOnce();
  });
});

describe("webllmChat + serving gate", () => {
  it("rejects when the engine is not warm", async () => {
    await expect(webllmChat([{ role: "user", content: "hi" }])).rejects.toThrow(
      "not warm",
    );
  });

  it("returns the model text once warm", async () => {
    await warmWebLLM({
      hasWebGPU: () => true,
      createEngine: async () => fakeEngine("SELECT 1"),
    });
    await expect(webllmChat([{ role: "user", content: "q" }])).resolves.toBe(
      "SELECT 1",
    );
  });

  it("drops to error on an engine failure so the ladder routes the next turn to the edge", async () => {
    const broken: WebLLMEngine = {
      chat: {
        completions: {
          create: async () => Promise.reject(new Error("device lost")),
        },
      },
    };
    await warmWebLLM({
      hasWebGPU: () => true,
      createEngine: async () => broken,
    });
    await expect(webllmChat([{ role: "user", content: "q" }])).rejects.toThrow(
      "device lost",
    );
    expect(useWebLLMStore.getState().status).toBe("error");
    expect(isWebLLMReady()).toBe(false);
  });

  it("isWebLLMServing requires consent, not just a warm engine", async () => {
    await warmWebLLM({
      hasWebGPU: () => true,
      createEngine: async () => fakeEngine(),
    });
    expect(isWebLLMReady()).toBe(true);
    expect(isWebLLMServing()).toBe(false);
    useSettingsStore.setState({ webllmConsent: "accepted" });
    expect(isWebLLMServing()).toBe(true);
    // Turning it off in settings stops it serving even though it stays warm.
    useSettingsStore.setState({ webllmConsent: "declined" });
    expect(isWebLLMServing()).toBe(false);
  });
});
