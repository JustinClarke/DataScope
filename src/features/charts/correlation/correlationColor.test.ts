import { describe, expect, it } from "vitest";
import { DIVERGING_DARK } from "../../../lib/chartPalette";
import { correlationCellColor, correlationTextColor } from "./correlationColor";

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`;

describe("correlationCellColor", () => {
  it("is the azure pole at strong positive (r = 1)", () => {
    expect(correlationCellColor(1)).toBe(rgb(DIVERGING_DARK.pos));
  });

  it("is the neutral midpoint at no correlation (r = 0) — not white, not a status colour", () => {
    expect(correlationCellColor(0)).toBe(rgb(DIVERGING_DARK.mid));
    expect(correlationCellColor(0)).not.toBe("rgb(255, 255, 255)");
  });

  it("is the magenta pole at strong negative (r = -1)", () => {
    expect(correlationCellColor(-1)).toBe(rgb(DIVERGING_DARK.neg));
  });

  it("interpolates linearly between the midpoint and a pole", () => {
    expect(correlationCellColor(0.5)).toBe("rgb(20, 92, 138)");
    expect(correlationCellColor(-0.5)).toBe("rgb(105, 29, 89)");
  });

  it("renders no fill for a missing value", () => {
    expect(correlationCellColor(null)).toBe("transparent");
  });

  it("clamps out-of-range input to the poles", () => {
    expect(correlationCellColor(1.5)).toBe(correlationCellColor(1));
    expect(correlationCellColor(-2)).toBe(correlationCellColor(-1));
  });
});

describe("correlationTextColor", () => {
  it("flips between the darkest and lightest ink by cell luminance", () => {
    expect(correlationTextColor(rgb(DIVERGING_DARK.pos))).toBe(
      "var(--color-void)",
    );
    expect(correlationTextColor(rgb(DIVERGING_DARK.neg))).toBe(
      "var(--color-ink)",
    );
    expect(correlationTextColor(rgb(DIVERGING_DARK.mid))).toBe(
      "var(--color-ink)",
    );
  });

  it("falls back to muted text for a transparent (no-data) cell", () => {
    expect(correlationTextColor("transparent")).toBe("var(--color-fg-muted)");
  });
});
