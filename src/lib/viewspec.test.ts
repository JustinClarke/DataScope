import { describe, expect, it } from "vitest";
import type { ViewSpec } from "../types";
import {
  VIEWSPEC_VERSION,
  isRegisteredComponent,
  validateViewSpec,
} from "./viewspec";

describe("isRegisteredComponent", () => {
  it("accepts every fixed-registry id", () => {
    expect(isRegisteredComponent("identity-band")).toBe(true);
    expect(isRegisteredComponent("hero-table-grid")).toBe(true);
    expect(isRegisteredComponent("sensitive-columns")).toBe(true);
  });

  it("rejects an arbitrary string", () => {
    expect(isRegisteredComponent("made-up-panel")).toBe(false);
  });
});

describe("validateViewSpec", () => {
  it("accepts a well-formed spec", () => {
    const spec: ViewSpec = {
      viewspecVersion: VIEWSPEC_VERSION,
      panels: [
        {
          componentId: "identity-band",
          tier: 1,
          props: { datasetLabel: "acme" },
        },
      ],
    };
    const result = validateViewSpec(spec);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a non-semver version", () => {
    const spec = {
      viewspecVersion: "latest",
      panels: [],
    } as unknown as ViewSpec;
    const result = validateViewSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/semver/);
  });

  it("rejects a componentId outside the fixed registry", () => {
    const spec: ViewSpec = {
      viewspecVersion: VIEWSPEC_VERSION,
      panels: [{ componentId: "ai-invented-panel", tier: 1, props: {} }],
    };
    const result = validateViewSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/fixed component registry/);
  });

  it("rejects props that are not a plain object", () => {
    const spec = {
      viewspecVersion: VIEWSPEC_VERSION,
      panels: [{ componentId: "identity-band", tier: 1, props: null }],
    } as unknown as ViewSpec;
    const result = validateViewSpec(spec);
    expect(result.valid).toBe(false);
  });

  it("rejects a panel with no valid tier", () => {
    const spec = {
      viewspecVersion: VIEWSPEC_VERSION,
      panels: [{ componentId: "identity-band", tier: 4, props: {} }],
    } as unknown as ViewSpec;
    const result = validateViewSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/tier must be 1, 2, or 3/);
  });

  it("rejects a non-array panels field without throwing", () => {
    const spec = {
      viewspecVersion: VIEWSPEC_VERSION,
      panels: "nope",
    } as unknown as ViewSpec;
    const result = validateViewSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/panels must be an array/);
  });
});
