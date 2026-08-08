import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { StatsPanel } from "./StatsPanel";

describe("StatsPanel", () => {
  afterEach(() => cleanup());

  it("renders every moment, formatted", () => {
    const { container } = render(
      <StatsPanel
        moments={{
          mean: 29.699,
          median: 28,
          mode: 24,
          stdDev: 14.526,
          skewness: 0.389,
          kurtosis: -0.478,
        }}
      />,
    );
    expect(container.textContent).toContain("29.699");
    expect(container.textContent).toContain("Skewness");
    expect(container.textContent).toContain("Kurtosis");
  });

  it("renders a dash for a null moment rather than fabricating 0", () => {
    const { container } = render(
      <StatsPanel
        moments={{
          mean: 5,
          median: 5,
          mode: 5,
          stdDev: null,
          skewness: null,
          kurtosis: null,
        }}
      />,
    );
    expect(container.textContent).toContain("—");
    expect(container.textContent).not.toContain("NaN");
  });
});
