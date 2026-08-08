import { describe, expect, it } from "vitest";
import { describeAIStatus } from "./aiStatusUtils";

const base = {
  aiMode: "cloud" as const,
  servedLocally: false,
  byokValue: null,
  byokPreference: "free-tier-first" as const,
  byokRoutingTouched: false,
  endpointConfigured: true,
};

describe("describeAIStatus — a remembered key (D9 opt-in vault)", () => {
  it("names the remembered key rather than claiming the shared free tier", () => {
    expect(describeAIStatus({ ...base, vaulted: true })).toEqual({
      kind: "cloud",
      detail: "shared free tier, your remembered key on overflow",
    });
  });

  it("under prefer-key routing, the remembered key is what serves", () => {
    expect(
      describeAIStatus({
        ...base,
        vaulted: true,
        byokPreference: "prefer-key",
      }),
    ).toEqual({
      kind: "cloud",
      detail: "your remembered key",
    });
  });

  it("a key typed into the field takes the label back — it is what will actually serve", () => {
    expect(
      describeAIStatus({
        ...base,
        vaulted: true,
        byokValue: "sk-typed",
        byokPreference: "prefer-key",
      }),
    ).toEqual({
      kind: "cloud",
      detail: "your API key",
    });
  });

  it("with no key anywhere, the shared free tier is still the honest answer", () => {
    expect(describeAIStatus(base)).toEqual({
      kind: "cloud",
      detail: "shared free tier",
    });
  });

  it("never claims a cloud provider in a local mode", () => {
    expect(
      describeAIStatus({ ...base, aiMode: "local-only", vaulted: true }),
    ).toEqual({ kind: "off" });
    expect(
      describeAIStatus({ ...base, aiMode: "local-model", vaulted: true }),
    ).toEqual({ kind: "local-pending" });
  });
});
