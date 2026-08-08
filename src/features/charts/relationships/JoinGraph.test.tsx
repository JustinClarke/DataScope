import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { JoinGraph } from "./JoinGraph";
import type { FkEdge } from "../../../lib/relationshipInference";

const nodes = [
  { tableName: "orders", rowCount: 100 },
  { tableName: "customers", rowCount: 50 },
];

function edge(overrides: Partial<FkEdge>): FkEdge {
  return {
    id: "orders.customer_id->customers.id",
    childTable: "orders",
    childColumn: "customer_id",
    parentTable: "customers",
    parentColumn: "id",
    containment: 1,
    coverage: 1,
    parentKeyUniqueness: 1,
    nameAgreement: true,
    confidence: "confident",
    confidenceScore: 1,
    evidence: "x",
    source: "inferred",
    ...overrides,
  };
}

describe("JoinGraph", () => {
  afterEach(() => cleanup());

  it("draws a confident edge solid (no dash array)", () => {
    const { container } = render(
      <JoinGraph nodes={nodes} edges={[edge({ confidence: "confident" })]} />,
    );
    const line = container.querySelector(
      'g[data-confidence="confident"] line:last-of-type',
    );
    expect(line?.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("draws a candidate edge dashed", () => {
    const { container } = render(
      <JoinGraph nodes={nodes} edges={[edge({ confidence: "candidate" })]} />,
    );
    const line = container.querySelector(
      'g[data-confidence="candidate"] line:last-of-type',
    );
    expect(line?.getAttribute("stroke-dasharray")).toBe("5 4");
  });

  it("fires onSelectEdge when an edge is clicked", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <JoinGraph nodes={nodes} edges={[edge({})]} onSelectEdge={onSelect} />,
    );
    fireEvent.click(
      container.querySelector(
        '[data-testid="edge-orders.customer_id->customers.id"]',
      )!,
    );
    expect(onSelect).toHaveBeenCalledWith("orders.customer_id->customers.id");
  });
});
