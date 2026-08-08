import { describe, expect, it } from "vitest";
import {
  buildCategorySummarySql,
  buildFrequencySql,
  lumpTail,
  parseCategorySummary,
  parseFrequency,
  type FrequencyRow,
} from "./categoricalSql";
import type { QueryResult } from "../types";

function resultOf(columnNames: string[], rows: unknown[][]): QueryResult {
  return {
    columnNames,
    columnTypes: columnNames.map(() => "Utf8"),
    rows,
    rowCount: rows.length,
    executionTimeMs: 1,
  };
}

describe("buildFrequencySql", () => {
  it("groups, counts, and sorts descending, excluding nulls", () => {
    const sql = buildFrequencySql("titanic", "Pclass");
    expect(sql).toContain('SELECT "Pclass" AS category, COUNT(*) AS count');
    expect(sql).toContain('FROM "titanic"');
    expect(sql).toContain('WHERE "Pclass" IS NOT NULL');
    expect(sql).toContain("GROUP BY 1");
    expect(sql).toContain("ORDER BY 2 DESC");
    expect(sql).toContain("LIMIT 50");
  });

  it("accepts a custom limit", () => {
    expect(buildFrequencySql("t", "c", 5)).toContain("LIMIT 5");
  });
});

describe("parseFrequency", () => {
  it("maps rows to category/count pairs", () => {
    const result = resultOf(
      ["category", "count"],
      [
        ["1", 3],
        ["3", 5],
      ],
    );
    expect(parseFrequency(result)).toEqual([
      { category: "1", count: 3 },
      { category: "3", count: 5 },
    ]);
  });

  it("is empty for an empty result", () => {
    expect(parseFrequency(resultOf(["category", "count"], []))).toEqual([]);
  });
});

describe("lumpTail", () => {
  const rows: FrequencyRow[] = [
    { category: "A", count: 50 },
    { category: "B", count: 30 },
    { category: "C", count: 10 },
    { category: "D", count: 6 },
    { category: "E", count: 4 },
  ];

  it("is a no-op when at or under the slice cap", () => {
    expect(lumpTail(rows, 5)).toEqual(rows);
    expect(lumpTail(rows.slice(0, 3), 5)).toEqual(rows.slice(0, 3));
  });

  it('keeps the top (maxSlices - 1) and lumps the rest into "Other"', () => {
    const lumped = lumpTail(rows, 3);
    expect(lumped).toEqual([
      { category: "A", count: 50 },
      { category: "B", count: 30 },
      { category: "Other", count: 10 + 6 + 4 },
    ]);
  });

  it('lumps everything but the top 1 into "Other" at maxSlices = 1', () => {
    const lumped = lumpTail(rows, 1);
    expect(lumped).toEqual([
      { category: "Other", count: 50 + 30 + 10 + 6 + 4 },
    ]);
  });
});

describe("buildCategorySummarySql", () => {
  it("aggregates sum/mean/count per group, sorted by total descending", () => {
    const sql = buildCategorySummarySql("titanic", "Pclass", "Fare");
    expect(sql).toContain(
      'SELECT "Pclass" AS grp, SUM("Fare") AS total, AVG("Fare") AS mean, COUNT(*) AS rows',
    );
    expect(sql).toContain('FROM "titanic"');
    expect(sql).toContain('WHERE "Pclass" IS NOT NULL');
    expect(sql).toContain("GROUP BY 1");
    expect(sql).toContain("ORDER BY 2 DESC");
  });
});

describe("parseCategorySummary", () => {
  it("maps rows to grp/total/mean/rows", () => {
    const result = resultOf(
      ["grp", "total", "mean", "rows"],
      [["3", 1000, 20, 50]],
    );
    expect(parseCategorySummary(result)).toEqual([
      { grp: "3", total: 1000, mean: 20, rows: 50 },
    ]);
  });

  it("defaults null aggregates to 0 rather than NaN", () => {
    const result = resultOf(
      ["grp", "total", "mean", "rows"],
      [["1", null, null, 0]],
    );
    expect(parseCategorySummary(result)).toEqual([
      { grp: "1", total: 0, mean: 0, rows: 0 },
    ]);
  });
});
