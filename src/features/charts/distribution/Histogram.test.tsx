import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Histogram } from "./Histogram";

describe("Histogram", () => {
  afterEach(() => cleanup());

  it("renders one bar per bucket with a range/count tooltip", () => {
    const { getByLabelText, container } = render(
      <Histogram
        buckets={[
          { rangeStart: 0, rangeEnd: 10, count: 5 },
          { rangeStart: 10, rangeEnd: 20, count: 15 },
        ]}
      />,
    );
    expect(
      getByLabelText("Value distribution histogram").children,
    ).toHaveLength(2);
    expect(container.querySelector('[title="0.00–10.00: 5"]')).toBeTruthy();
    expect(container.querySelector('[title="10.00–20.00: 15"]')).toBeTruthy();
  });

  it("shows the full min/max range in the footer", () => {
    const { container } = render(
      <Histogram
        buckets={[
          { rangeStart: 0.42, rangeEnd: 8.04, count: 1 },
          { rangeStart: 71.96, rangeEnd: 80, count: 2 },
        ]}
      />,
    );
    expect(container.textContent).toContain("0.42");
    expect(container.textContent).toContain("80.00");
  });
});
