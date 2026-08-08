import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CanvasScatter } from "./CanvasScatter";

describe("CanvasScatter", () => {
  afterEach(() => cleanup());

  it("renders a canvas labeled with the point count and axis names", () => {
    const points = Array.from({ length: 12_000 }, (_, i) => ({
      x: i,
      y: i * 2,
    }));
    const { getByRole } = render(
      <CanvasScatter points={points} xLabel="Age" yLabel="Fare" />,
    );
    const canvas = getByRole("img", { name: /Age/ });
    expect(canvas.getAttribute("aria-label")).toBe(
      "Scatter plot of Fare vs Age, 12,000 points",
    );
  });

  it("renders with no points without throwing (jsdom has no 2D canvas context)", () => {
    expect(() =>
      render(<CanvasScatter points={[]} xLabel="x" yLabel="y" />),
    ).not.toThrow();
  });
});

/**
 * The anti-drift pin V6b never gave this component (added at V6e).
 *
 * Canvas 2D cannot resolve custom properties, so the component reads its axis and label
 * colours through `getComputedStyle` and falls back to resolved literals where the computed
 * style is unavailable. Those literals are a second copy of two `theme.css` declarations —
 * the same hazard `chartPalette.test.ts` exists to catch, one file over — and until V6e
 * nothing failed when they drifted. The fallbacks mirror the *dark* register, which is this
 * system's primary one and also `chartPalette.ts#activeRegister`'s answer without `matchMedia`.
 */
describe("CanvasScatter fallback literals", () => {
  const theme = readFileSync(join(__dirname, "../../../app/theme.css"), "utf8");
  const source = readFileSync(join(__dirname, "CanvasScatter.tsx"), "utf8");

  /** The first declaration of a token — the dark register, which theme.css declares first. */
  const darkDeclaration = (token: string) => {
    const match = theme.match(new RegExp(`${token}:\\s*([^;]+);`));
    if (!match) throw new Error(`${token} is not declared in theme.css`);
    return match[1].trim();
  };

  it.each([
    ["--color-border", "--color-rule"],
    ["--color-fg-muted", "--color-ink-2"],
  ])("the %s fallback still equals its token", (alias, backing) => {
    expect(darkDeclaration(alias)).toBe(`var(${backing})`);
    const fallback = source.match(
      new RegExp(`read\\('${alias}', '([^']+)'\\)`),
    );
    expect(
      fallback,
      `no getComputedStyle fallback found for ${alias}`,
    ).not.toBeNull();
    expect(fallback?.[1]).toBe(darkDeclaration(backing));
  });

  it("declares no colour beyond those two fallbacks", () => {
    expect(
      source.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|\boklch\(/g) ?? [],
    ).toHaveLength(2);
  });
});
