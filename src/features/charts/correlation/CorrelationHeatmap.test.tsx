import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CorrelationHeatmap } from "./CorrelationHeatmap";
import type { CorrelationMatrix } from "../../../lib/correlationSql";

const matrix: CorrelationMatrix = {
  columns: ["temp", "humidity"],
  values: [
    [1, 0.8],
    [0.8, 1],
  ],
};

describe("CorrelationHeatmap", () => {
  afterEach(() => cleanup());

  it("disables the diagonal cell (a column against itself)", () => {
    const { getByLabelText } = render(
      <CorrelationHeatmap
        matrix={matrix}
        selectedPair={null}
        onCellClick={vi.fn()}
      />,
    );
    expect(
      (getByLabelText("temp vs temp: 1.000") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("fires onCellClick with the row/column pair for an off-diagonal cell", () => {
    const onCellClick = vi.fn();
    const { getByLabelText } = render(
      <CorrelationHeatmap
        matrix={matrix}
        selectedPair={null}
        onCellClick={onCellClick}
      />,
    );
    getByLabelText("temp vs humidity: 0.800").click();
    expect(onCellClick).toHaveBeenCalledWith("temp", "humidity");
  });

  it('shows a dash and "no data" for a null cell', () => {
    const withNull: CorrelationMatrix = {
      columns: ["a", "b"],
      values: [
        [1, null],
        [null, 1],
      ],
    };
    const { getByLabelText } = render(
      <CorrelationHeatmap
        matrix={withNull}
        selectedPair={null}
        onCellClick={vi.fn()}
      />,
    );
    const cell = getByLabelText("a vs b: no data");
    expect(cell.textContent).toBe("—");
  });
});
