import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Erd } from "./Erd";
import type { FkEdge } from "../../lib/relationshipInference";
import type { ClassifiedColumn, TableRegistryEntry } from "../../types";

function col(
  name: string,
  semanticType: ClassifiedColumn["semanticType"],
): ClassifiedColumn {
  return {
    name,
    semanticType,
    physicalType: "BIGINT",
    cardinality: 100,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
  };
}

function table(
  id: string,
  tableName: string,
  columns: ClassifiedColumn[],
  rowCount = 100,
): TableRegistryEntry {
  return {
    id,
    tableName,
    datasetId: "ds",
    origin: "sample",
    rowCount,
    columnCount: columns.length,
    memoryBytes: 1000,
    createdAt: new Date().toISOString(),
    columns,
  };
}

const orders = table("o", "orders", [
  col("order_id", "Identifier"),
  col("customer_id", "Categorical"),
]);
const customers = table("c", "customers", [
  col("id", "Identifier"),
  col("name", "Textual"),
]);

function edge(overrides: Partial<FkEdge> = {}): FkEdge {
  return {
    id: "orders.customer_id->customers.id",
    childTable: "orders",
    childColumn: "customer_id",
    parentTable: "customers",
    parentColumn: "id",
    containment: 0.87,
    coverage: 0.9,
    parentKeyUniqueness: 1,
    nameAgreement: true,
    confidence: "confident",
    confidenceScore: 0.87,
    evidence: "87% of `orders.customer_id` values appear in `customers.id`",
    source: "inferred",
    ...overrides,
  };
}

describe("Erd", () => {
  afterEach(() => cleanup());

  it("renders one card per table", () => {
    const { getByTestId } = render(
      <Erd
        tables={[orders, customers]}
        edges={[edge()]}
        selectedTableId={null}
        onSelectTable={vi.fn()}
      />,
    );
    expect(getByTestId("erd-card-o")).toBeTruthy();
    expect(getByTestId("erd-card-c")).toBeTruthy();
  });

  it("marks the FK child column and the PK parent column, never an uninvolved column", () => {
    const { getByTestId } = render(
      <Erd
        tables={[orders, customers]}
        edges={[edge()]}
        selectedTableId={null}
        onSelectTable={vi.fn()}
      />,
    );
    expect(getByTestId("erd-field-o-customer_id").dataset.key).toBe("fk");
    expect(getByTestId("erd-field-o-order_id").dataset.key).toBe("pk");
    expect(getByTestId("erd-field-c-id").dataset.key).toBe("pk");
    expect(getByTestId("erd-field-c-name").dataset.key).toBeUndefined();
  });

  it("draws one wire per edge, confidence carried through as a data attribute — never a cardinality label", () => {
    const confident = edge();
    const candidate = edge({
      id: "candidate-edge",
      childTable: "orders",
      childColumn: "order_id",
      confidence: "candidate",
    });
    const { getByTestId } = render(
      <Erd
        tables={[orders, customers]}
        edges={[confident, candidate]}
        selectedTableId={null}
        onSelectTable={vi.fn()}
      />,
    );
    expect(getByTestId(`erd-wire-${confident.id}`).dataset.confidence).toBe(
      "confident",
    );
    expect(getByTestId(`erd-wire-${candidate.id}`).dataset.confidence).toBe(
      "candidate",
    );
  });

  it("calls onSelectTable with the table id on click", () => {
    const onSelectTable = vi.fn();
    const { getByTestId } = render(
      <Erd
        tables={[orders, customers]}
        edges={[edge()]}
        selectedTableId={null}
        onSelectTable={onSelectTable}
      />,
    );
    fireEvent.click(getByTestId("erd-card-c"));
    expect(onSelectTable).toHaveBeenCalledWith("c");
  });

  it("calls onSelectTable on Enter key, keyboard-reachable like the existing JoinGraph edges", () => {
    const onSelectTable = vi.fn();
    const { getByTestId } = render(
      <Erd
        tables={[orders, customers]}
        edges={[edge()]}
        selectedTableId={null}
        onSelectTable={onSelectTable}
      />,
    );
    fireEvent.keyDown(getByTestId("erd-card-o"), { key: "Enter" });
    expect(onSelectTable).toHaveBeenCalledWith("o");
  });

  it("marks the selected table via data-selected", () => {
    const { getByTestId } = render(
      <Erd
        tables={[orders, customers]}
        edges={[edge()]}
        selectedTableId="c"
        onSelectTable={vi.fn()}
      />,
    );
    expect(getByTestId("erd-card-c").dataset.selected).toBe("true");
    expect(getByTestId("erd-card-o").dataset.selected).toBe("false");
  });

  it("renders tables with no classified columns yet without throwing", () => {
    const unclassified: TableRegistryEntry = {
      ...orders,
      id: "u",
      tableName: "staging",
      columns: undefined,
    };
    const { getByTestId } = render(
      <Erd
        tables={[orders, unclassified]}
        edges={[]}
        selectedTableId={null}
        onSelectTable={vi.fn()}
      />,
    );
    expect(getByTestId("erd-card-u")).toBeTruthy();
  });

  it("clicking an ERD wire selects that edge without requiring a table click (W7)", () => {
    const onSelectEdge = vi.fn();
    const onSelectTable = vi.fn();
    const { getByTestId } = render(
      <Erd
        tables={[orders, customers]}
        edges={[edge()]}
        selectedTableId={null}
        onSelectTable={onSelectTable}
        onSelectEdge={onSelectEdge}
      />,
    );
    fireEvent.click(getByTestId(`erd-wire-${edge().id}`));
    expect(onSelectEdge).toHaveBeenCalledWith(edge().id);
    expect(onSelectTable).not.toHaveBeenCalled();
  });

  it("marks the selected edge via data-selected on its wire", () => {
    const { getByTestId } = render(
      <Erd
        tables={[orders, customers]}
        edges={[edge()]}
        selectedTableId={null}
        onSelectTable={vi.fn()}
        selectedEdgeId={edge().id}
        onSelectEdge={vi.fn()}
      />,
    );
    expect(getByTestId(`erd-wire-${edge().id}`).dataset.selected).toBe("true");
  });

  it("an ERD wire is keyboard-reachable (Enter selects the edge)", () => {
    const onSelectEdge = vi.fn();
    const { getByTestId } = render(
      <Erd
        tables={[orders, customers]}
        edges={[edge()]}
        selectedTableId={null}
        onSelectTable={vi.fn()}
        onSelectEdge={onSelectEdge}
      />,
    );
    fireEvent.keyDown(getByTestId(`erd-wire-${edge().id}`), { key: "Enter" });
    expect(onSelectEdge).toHaveBeenCalledWith(edge().id);
  });

  it("clicking a field row selects both the table and the column (W7) — the click bubbles to the card", () => {
    const onSelectTable = vi.fn();
    const onSelectColumn = vi.fn();
    const { getByTestId } = render(
      <Erd
        tables={[orders, customers]}
        edges={[edge()]}
        selectedTableId={null}
        onSelectTable={onSelectTable}
        onSelectColumn={onSelectColumn}
      />,
    );
    fireEvent.click(getByTestId("erd-field-o-customer_id"));
    expect(onSelectColumn).toHaveBeenCalledWith("o", "customer_id");
    expect(onSelectTable).toHaveBeenCalledWith("o");
  });

  it("omitting onSelectColumn/onSelectEdge leaves field rows and wires non-interactive (additive, no regression)", () => {
    const { getByTestId } = render(
      <Erd
        tables={[orders, customers]}
        edges={[edge()]}
        selectedTableId={null}
        onSelectTable={vi.fn()}
      />,
    );
    expect(
      getByTestId("erd-field-o-customer_id").getAttribute("role"),
    ).toBeNull();
    expect(
      getByTestId(`erd-wire-${edge().id}`).getAttribute("role"),
    ).toBeNull();
  });
});
