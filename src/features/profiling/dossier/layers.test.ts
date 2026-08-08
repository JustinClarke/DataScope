import { describe, expect, it } from "vitest";
import { VIEWSPEC_COMPONENT_REGISTRY } from "../../../lib/viewspec";
import {
  layerOf,
  LAYER_LABELS,
  LAYER_ORDER,
  type DossierLayer,
} from "./layers";

// The two tier-1 componentIds are the Verdict itself — above the layered
// disclosure, so they belong to no layer.
const TIER1_COMPONENTS = new Set(["identity-band", "verdict"]);

describe("dossier intelligence-layers (D69)", () => {
  it("places the tier-1 Verdict components in no layer", () => {
    expect(layerOf("identity-band")).toBeNull();
    expect(layerOf("verdict")).toBeNull();
  });

  it("maps relationship / quality / coverage signals to the heuristics layer", () => {
    for (const id of [
      "hero-join-graph",
      "hero-table-grid",
      "table-strip",
      "quality-headline",
      "time-coverage",
      "sensitive-columns",
    ] as const) {
      expect(layerOf(id)).toBe("heuristics");
    }
  });

  it("maps the per-table insight detail to the profiling layer", () => {
    expect(layerOf("top-insights")).toBe("profiling");
  });

  // The renderer only paints panels whose layer is one of LAYER_ORDER's, so a
  // registered non-tier-1 componentId with no layer would be silently dropped.
  it("assigns every registered non-tier-1 component to a known layer", () => {
    for (const id of VIEWSPEC_COMPONENT_REGISTRY) {
      if (TIER1_COMPONENTS.has(id)) continue;
      const layer = layerOf(id);
      expect(layer, `${id} must map to a layer`).not.toBeNull();
      expect(LAYER_ORDER).toContain(layer as DossierLayer);
    }
  });

  it("orders and labels each layer exactly once", () => {
    expect(new Set(LAYER_ORDER).size).toBe(LAYER_ORDER.length);
    for (const layer of LAYER_ORDER) {
      expect(LAYER_LABELS[layer]).toBeTruthy();
    }
  });
});
