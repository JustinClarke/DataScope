import { describe, it, expect } from "vitest";
import { resolveProvider } from "./aiProvider";
import type { CloudProviderConfig } from "./cloudProvider";

const cloudConfig: CloudProviderConfig = {
  endpoint: "https://edge.example/ai-router",
  sessionId: "s-1",
  routing: "free-tier-first",
};

describe("resolveProvider — the conversational ladder", () => {
  it("local-only stays null even with a warm local engine (the kill-switch)", () => {
    expect(
      resolveProvider("local-only", cloudConfig, {
        webllmReady: true,
        byokValue: null,
      }).provider,
    ).toBeNull();
  });

  it("a warm local engine serves API (cloud) mode with zero egress", () => {
    const { provider } = resolveProvider("cloud", cloudConfig, {
      webllmReady: true,
      byokValue: null,
    });
    expect(provider?.id).toBe("webllm");
  });

  it("a warm local engine serves local-model mode", () => {
    const { provider } = resolveProvider("local-model", undefined, {
      webllmReady: true,
      byokValue: null,
    });
    expect(provider?.id).toBe("webllm");
  });

  it("a user-supplied bearer key opts out of the handoff — the cloud provider keeps serving", () => {
    const { provider } = resolveProvider("cloud", cloudConfig, {
      webllmReady: true,
      byokValue: "sk-test",
    });
    expect(provider?.id).toBe("cloud-edge");
  });

  it("API mode falls to the edge router while the local engine is cold and no key/endpoint is set", () => {
    const { provider } = resolveProvider("cloud", cloudConfig, {
      webllmReady: false,
      byokValue: null,
    });
    expect(provider?.id).toBe("cloud-edge");
  });

  it("local-model no longer falls back to Ollama while cold (2026-07-22 mode-taxonomy narrowing) — null, not a hang", () => {
    const { provider } = resolveProvider("local-model", undefined, {
      webllmReady: false,
      byokValue: null,
    });
    expect(provider).toBeNull();
  });

  it("cloud (API) with no endpoint configured stays the honest null", () => {
    expect(
      resolveProvider("cloud", undefined, {
        webllmReady: false,
        byokValue: null,
      }).provider,
    ).toBeNull();
  });

  describe("a remembered key (D9 opt-in vault)", () => {
    it("opts out of the local handoff just as a typed key does — the router resolves it", () => {
      const { provider } = resolveProvider("cloud", cloudConfig, {
        webllmReady: true,
        byokValue: null,
        vaultRef: "ref-xyz",
      });
      expect(provider?.id).toBe("cloud-edge");
    });

    it("does not change local-model mode, which never leaves the browser", () => {
      const { provider } = resolveProvider("local-model", cloudConfig, {
        webllmReady: false,
        byokValue: null,
        vaultRef: "ref-xyz",
      });
      expect(provider).toBeNull();
    });

    it("is irrelevant in local-only mode (the AI kill-switch)", () => {
      const { provider } = resolveProvider("local-only", cloudConfig, {
        webllmReady: true,
        byokValue: null,
        vaultRef: "ref-xyz",
      });
      expect(provider).toBeNull();
    });
  });

  describe("a URL-shaped field value (Ollama) — the D3 routing split (2026-07-23)", () => {
    it("untouched routing (the stored default) routes straight to Ollama, no overflow", () => {
      const { provider, overflowProvider } = resolveProvider(
        "cloud",
        cloudConfig,
        {
          webllmReady: false,
          byokValue: "http://localhost:11434",
          byokPreference: "free-tier-first",
          byokRoutingTouched: false,
        },
      );
      expect(provider?.id).toBe("ollama");
      expect(overflowProvider).toBeUndefined();
    });

    it("prefer-key routing (even if explicitly touched) routes straight to Ollama, no overflow", () => {
      const { provider, overflowProvider } = resolveProvider(
        "cloud",
        cloudConfig,
        {
          webllmReady: false,
          byokValue: "http://localhost:11434",
          byokPreference: "prefer-key",
          byokRoutingTouched: true,
        },
      );
      expect(provider?.id).toBe("ollama");
      expect(overflowProvider).toBeUndefined();
    });

    it("explicit free-tier-first routes to the cloud provider primary, with Ollama as overflow", () => {
      const { provider, overflowProvider } = resolveProvider(
        "cloud",
        cloudConfig,
        {
          webllmReady: false,
          byokValue: "http://localhost:11434",
          byokPreference: "free-tier-first",
          byokRoutingTouched: true,
        },
      );
      expect(provider?.id).toBe("cloud-edge");
      expect(overflowProvider?.id).toBe("ollama");
    });

    it("explicit free-tier-first with no cloud endpoint configured falls back to Ollama directly", () => {
      const { provider, overflowProvider } = resolveProvider(
        "cloud",
        undefined,
        {
          webllmReady: false,
          byokValue: "http://localhost:11434",
          byokPreference: "free-tier-first",
          byokRoutingTouched: true,
        },
      );
      expect(provider?.id).toBe("ollama");
      expect(overflowProvider).toBeUndefined();
    });

    it("prefers a URL-shaped field value over a warm local engine, mirroring bearer-key opt-out", () => {
      const { provider, overflowProvider } = resolveProvider(
        "cloud",
        cloudConfig,
        {
          webllmReady: true,
          byokValue: "http://localhost:11434",
          byokPreference: "free-tier-first",
          byokRoutingTouched: false,
        },
      );
      expect(provider?.id).toBe("ollama");
      expect(overflowProvider).toBeUndefined();
    });
  });
});
