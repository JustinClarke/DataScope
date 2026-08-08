import { beforeEach, describe, expect, it } from "vitest";
import { useInferredEdgesStore } from "./inferredEdges";
import type { FkEdge } from "../lib/relationshipInference";

const EDGE: FkEdge = {
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
  evidence: "100% of `orders.customer_id` values appear in `customers.id`",
  source: "inferred",
};

beforeEach(() => {
  useInferredEdgesStore.setState({ edges: [] });
});

describe("inferred edges store", () => {
  it("defaults to an empty edge list", () => {
    expect(useInferredEdgesStore.getState().edges).toEqual([]);
  });

  it("setEdges replaces the edge list", () => {
    useInferredEdgesStore.getState().setEdges([EDGE]);
    expect(useInferredEdgesStore.getState().edges).toEqual([EDGE]);
  });
});
