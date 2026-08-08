import { describe, expect, it } from "vitest";
import { normalizeQuestion } from "./inputNormalizer";

const VOCAB = [
  "customers",
  "orders",
  "revenue",
  "fare",
  "age",
  "survived",
  "passenger_class",
];

describe("normalizeQuestion", () => {
  it("corrects a single-character typo to the canonical column name", () => {
    const result = normalizeQuestion("total reveune by month", VOCAB);
    expect(result.text).toBe("total revenue by month");
    expect(result.corrections).toEqual([{ from: "reveune", to: "revenue" }]);
  });

  it('corrects the pipeline acceptance example ("fair" → "fare")', () => {
    const result = normalizeQuestion("corellation of fair and age", VOCAB);
    // "fair" is a two-edit slip from the "fare" column and gets fixed; "corellation"
    // is not a schema token (no near vocabulary term) so it is left for the model;
    // "age" is already an exact column name and is untouched.
    expect(result.text).toBe("corellation of fare and age");
    expect(result.corrections).toEqual([{ from: "fair", to: "fare" }]);
  });

  it("leaves exact schema names and ordinary English words untouched", () => {
    const result = normalizeQuestion("how many orders per customers", VOCAB);
    expect(result.text).toBe("how many orders per customers");
    expect(result.corrections).toEqual([]);
  });

  it("never rewrites a SQL keyword that sits near a column name", () => {
    // "count" is one edit from a hypothetical "county"; the keyword guard wins.
    const result = normalizeQuestion("count of survived", [
      "county",
      "survived",
    ]);
    expect(result.text).toBe("count of survived");
    expect(result.corrections).toEqual([]);
  });

  it("leaves very short tokens alone (too ambiguous to correct)", () => {
    const result = normalizeQuestion("ag by class", ["age", "class"]);
    expect(result.corrections).toEqual([]);
    expect(result.text).toBe("ag by class");
  });

  it("does not correct when two terms are equally near (ambiguous)", () => {
    // "c?re" is edit-distance 1 from both "care" and "core": a tie, so no rewrite.
    const result = normalizeQuestion("show csre totals", ["care", "core"]);
    expect(result.corrections).toEqual([]);
    expect(result.text).toBe("show csre totals");
  });

  it("preserves punctuation and spacing around corrected tokens", () => {
    const result = normalizeQuestion("revenue, custmers; age", [
      "revenue",
      "customers",
      "age",
    ]);
    expect(result.text).toBe("revenue, customers; age");
    expect(result.corrections).toEqual([{ from: "custmers", to: "customers" }]);
  });

  it("is a no-op when the vocabulary is empty", () => {
    const result = normalizeQuestion("anything at all", []);
    expect(result.text).toBe("anything at all");
    expect(result.corrections).toEqual([]);
  });
});
