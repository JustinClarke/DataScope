import { describe, expect, it } from "vitest";
import type { ClassifiedColumn, QueryResult } from "../types";
import {
  buildInsightProbes,
  idExclusionCandidates,
  nullPatternCandidates,
  rankInsights,
  scoreOf,
  zeroVarianceCandidates,
  RULE_LABEL,
} from "./insights";

function resultOf(columnNames: string[], rows: unknown[][]): QueryResult {
  return {
    columnNames,
    columnTypes: columnNames.map(() => "Utf8"),
    rows,
    rowCount: rows.length,
    executionTimeMs: 0,
  };
}

// DuckDB-Wasm surfaces date_trunc() output as a raw epoch-ms number, not a
// string (live-verified) — change-point fixtures use real epoch-ms values.
const MS = (iso: string): number => new Date(iso).getTime();

function column(
  overrides: Partial<ClassifiedColumn> &
    Pick<ClassifiedColumn, "name" | "semanticType">,
): ClassifiedColumn {
  return {
    physicalType: "VARCHAR",
    cardinality: 0,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
    ...overrides,
  };
}

describe("nullPatternCandidates", () => {
  it("flags a column above the null threshold", () => {
    const candidates = nullPatternCandidates(
      [
        column({
          name: "discount_code",
          semanticType: "Categorical",
          nullPercentage: 61,
        }),
      ],
      "t",
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].description).toContain("discount_code");
    expect(candidates[0].description).toContain("61.0%");
    expect(candidates[0].coverage).toBeCloseTo(0.61);
  });

  it("ignores a column at or below the threshold", () => {
    const candidates = nullPatternCandidates(
      [column({ name: "x", semanticType: "Categorical", nullPercentage: 5 })],
      "t",
    );
    expect(candidates).toHaveLength(0);
  });

  it("treats a null nullPercentage as 0 (no candidate)", () => {
    const candidates = nullPatternCandidates(
      [
        column({
          name: "x",
          semanticType: "Categorical",
          nullPercentage: null,
        }),
      ],
      "t",
    );
    expect(candidates).toHaveLength(0);
  });
});

describe("idExclusionCandidates", () => {
  it("emits one candidate per Identifier column, none for other types", () => {
    const candidates = idExclusionCandidates(
      [
        column({ name: "row_uuid", semanticType: "Identifier" }),
        column({ name: "amount", semanticType: "Quantitative" }),
      ],
      "t",
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].description).toContain("row_uuid");
    expect(candidates[0].sql).toContain('COUNT(DISTINCT "row_uuid")');
  });
});

describe("zeroVarianceCandidates", () => {
  it("fires on cardinality === 1 when rowCount > 1", () => {
    const candidates = zeroVarianceCandidates(
      [column({ name: "region", semanticType: "Categorical", cardinality: 1 })],
      "t",
      100,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].rule).toBe("zero-variance");
    expect(candidates[0].description).toContain("region");
    expect(candidates[0].sql).toContain('COUNT(DISTINCT "region")');
  });

  it("does not fire on cardinality === 0 (all-null — nullPatternCandidates territory)", () => {
    const candidates = zeroVarianceCandidates(
      [column({ name: "region", semanticType: "Categorical", cardinality: 0 })],
      "t",
      100,
    );
    expect(candidates).toHaveLength(0);
  });

  it("does not fire when rowCount <= 1, regardless of cardinality", () => {
    const candidates = zeroVarianceCandidates(
      [column({ name: "region", semanticType: "Categorical", cardinality: 1 })],
      "t",
      1,
    );
    expect(candidates).toHaveLength(0);
  });

  it("ignores columns with cardinality > 1", () => {
    const candidates = zeroVarianceCandidates(
      [column({ name: "region", semanticType: "Categorical", cardinality: 2 })],
      "t",
      100,
    );
    expect(candidates).toHaveLength(0);
  });

  it("RULE_LABEL covers the new member", () => {
    expect(RULE_LABEL["zero-variance"]).toBe("Zero variance");
  });
});

describe("buildInsightProbes — duplicates", () => {
  it("fires when total exceeds distinct row count", () => {
    const probes = buildInsightProbes(
      "t",
      [column({ name: "a", semanticType: "Categorical" })],
      100,
    );
    const dupProbe = probes.find((p) => p.sql.includes("distinct_count"));
    expect(dupProbe).toBeDefined();
    const candidates = dupProbe!.describe(
      resultOf(["total", "distinct_count"], [[100, 88]]),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].description).toContain("12 fully duplicated rows");
  });

  it("does not fire when every row is distinct", () => {
    const probes = buildInsightProbes(
      "t",
      [column({ name: "a", semanticType: "Categorical" })],
      100,
    );
    const dupProbe = probes.find((p) => p.sql.includes("distinct_count"));
    const candidates = dupProbe!.describe(
      resultOf(["total", "distinct_count"], [[100, 100]]),
    );
    expect(candidates).toHaveLength(0);
  });
});

describe("buildInsightProbes — concentration + outlier group", () => {
  const columns = [
    column({ name: "region", semanticType: "Categorical" }),
    column({
      name: "revenue",
      semanticType: "Quantitative",
      mean: 100,
      stdDev: 10,
    }),
  ];

  it("flags concentration when a small top slice dominates the sum", () => {
    const probes = buildInsightProbes("t", columns, 1000);
    const probe = probes.find((p) => p.sql.includes("region"))!;
    // 10 groups, top 1 (10%) holds 900 of 1000 total — well past the 30% floor.
    const rows = [
      ["A", 900, 90, 100],
      ...Array.from({ length: 9 }, (_, i) => [`G${i}`, 100 / 9, 5, 900 / 9]),
    ];
    const candidates = probe.describe(
      resultOf(["grp", "total", "mean", "rows"], rows),
    );
    const concentration = candidates.find((c) => c.rule === "concentration");
    expect(concentration).toBeDefined();
    expect(concentration!.description).toContain('"A"');
    expect(concentration!.description).toContain("90%");
  });

  it("flags an outlier group whose mean is far from the column mean", () => {
    const probes = buildInsightProbes("t", columns, 1000);
    const probe = probes.find((p) => p.sql.includes("region"))!;
    const rows = [
      ["A", 500, 127, 100], // (127-100)/10 = 2.7σ
      ["B", 500, 100, 900],
    ];
    const candidates = probe.describe(
      resultOf(["grp", "total", "mean", "rows"], rows),
    );
    const outlier = candidates.find((c) => c.rule === "outlier-group");
    expect(outlier).toBeDefined();
    expect(outlier!.description).toContain('"A"');
    expect(outlier!.description).toContain("2.7σ above");
  });

  it("emits neither candidate for unremarkable groups", () => {
    const probes = buildInsightProbes("t", columns, 1000);
    const probe = probes.find((p) => p.sql.includes("region"))!;
    const rows = [
      ["A", 510, 102, 510],
      ["B", 490, 98, 490],
    ];
    const candidates = probe.describe(
      resultOf(["grp", "total", "mean", "rows"], rows),
    );
    expect(candidates).toHaveLength(0);
  });

  it("skips a single-group result (nothing to compare against)", () => {
    const probes = buildInsightProbes("t", columns, 1000);
    const probe = probes.find((p) => p.sql.includes("region"))!;
    const candidates = probe.describe(
      resultOf(["grp", "total", "mean", "rows"], [["A", 1000, 100, 1000]]),
    );
    expect(candidates).toHaveLength(0);
  });
});

describe("buildInsightProbes — change point", () => {
  const columns = [
    column({ name: "month", semanticType: "Temporal" }),
    column({ name: "revenue", semanticType: "Quantitative" }),
  ];

  it("flags the largest period-over-period move past the threshold", () => {
    // DuckDB-Wasm surfaces date_trunc('month', ...) as a raw epoch-ms number
    // (live-verified), not a string — these fixtures match that real shape.
    const probes = buildInsightProbes("t", columns, 100);
    const probe = probes.find((p) => p.sql.includes("date_trunc"))!;
    const rows = [
      [MS("2024-01-01"), 100, 10],
      [MS("2024-02-01"), 105, 10],
      [MS("2024-03-01"), 65, 10], // -38%
    ];
    const candidates = probe.describe(
      resultOf(["period", "total", "rows"], rows),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].description).toContain("dropped 38%");
    expect(candidates[0].description).toContain("2024-03");
  });

  it("does not fire below the threshold", () => {
    const probes = buildInsightProbes("t", columns, 100);
    const probe = probes.find((p) => p.sql.includes("date_trunc"))!;
    const rows = [
      [MS("2024-01-01"), 100, 10],
      [MS("2024-02-01"), 105, 10],
    ];
    expect(
      probe.describe(resultOf(["period", "total", "rows"], rows)),
    ).toHaveLength(0);
  });
});

describe("buildInsightProbes — leakage", () => {
  it("flags a near-perfect correlation between two quantitative columns", () => {
    const columns = [
      column({ name: "total_paid", semanticType: "Quantitative" }),
      column({ name: "target", semanticType: "Quantitative" }),
      column({ name: "age", semanticType: "Quantitative" }),
    ];
    const probes = buildInsightProbes("t", columns, 100);
    const probe = probes.find((p) => p.sql.includes("corr"))!;
    const candidates = probe.describe(
      resultOf(["c0", "c1", "c2"], [[0.998, 0.1, 0.05]]),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].description).toContain("total_paid");
    expect(candidates[0].description).toContain("target");
    expect(candidates[0].description).toContain("0.998");
  });

  it("builds no leakage probe with fewer than 2 quantitative columns", () => {
    const columns = [column({ name: "amount", semanticType: "Quantitative" })];
    const probes = buildInsightProbes("t", columns, 100);
    expect(probes.some((p) => p.sql.includes("corr"))).toBe(false);
  });
});

describe("rankInsights", () => {
  it("sorts by effect size × coverage, descending, and caps at 10", () => {
    const candidates = Array.from({ length: 15 }, (_, i) => ({
      id: `c${i}`,
      rule: "null-pattern" as const,
      description: `candidate ${i}`,
      sql: "",
      effectSize: 1,
      coverage: i / 15,
    }));
    const ranked = rankInsights(candidates);
    expect(ranked).toHaveLength(10);
    for (let i = 1; i < ranked.length; i++) {
      expect(scoreOf(ranked[i - 1])).toBeGreaterThanOrEqual(scoreOf(ranked[i]));
    }
    expect(ranked[0].id).toBe("c14");
  });
});
