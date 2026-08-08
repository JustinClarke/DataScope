import { describe, expect, it } from "vitest";
import type { QueryResult } from "../types";
import {
  buildMomentsSql,
  buildOutliersSql,
  buildQuartilesSql,
  buildWhiskersSql,
  computeIqrBounds,
  parseMoments,
  parseOutliers,
  parseQuartiles,
  parseWhiskers,
} from "./distributionSql";

function resultOf(columnNames: string[], rows: unknown[][]): QueryResult {
  return {
    columnNames,
    columnTypes: columnNames.map(() => "Float64"),
    rows,
    rowCount: rows.length,
    executionTimeMs: 1,
  };
}

describe("quartiles", () => {
  it("builds a single quantile_cont row", () => {
    const sql = buildQuartilesSql("titanic", "Age");
    expect(sql).toContain('quantile_cont("Age", 0.25) AS q1');
    expect(sql).toContain('quantile_cont("Age", 0.5) AS median');
    expect(sql).toContain('quantile_cont("Age", 0.75) AS q3');
    expect(sql).toContain('FROM "titanic"');
    expect(sql).toContain('WHERE "Age" IS NOT NULL');
  });

  it("parses a quartile row", () => {
    expect(
      parseQuartiles(resultOf(["q1", "median", "q3"], [[20, 28, 38]])),
    ).toEqual({ q1: 20, median: 28, q3: 38 });
  });

  it("returns null for a 100%-null column (no row to interpolate over)", () => {
    expect(
      parseQuartiles(resultOf(["q1", "median", "q3"], [[null, null, null]])),
    ).toBeNull();
  });
});

describe("computeIqrBounds", () => {
  it("applies the 1.5×IQR Tukey fence", () => {
    expect(computeIqrBounds({ q1: 20, median: 28, q3: 38 })).toEqual({
      lower: 20 - 27,
      upper: 38 + 27,
    });
  });

  it("collapses to a single point for a constant column (IQR = 0)", () => {
    expect(computeIqrBounds({ q1: 5, median: 5, q3: 5 })).toEqual({
      lower: 5,
      upper: 5,
    });
  });
});

describe("whiskers", () => {
  it("builds a bounded MIN/MAX query", () => {
    const sql = buildWhiskersSql("titanic", "Age", { lower: -7, upper: 65 });
    expect(sql).toContain('MIN("Age") AS whisker_low');
    expect(sql).toContain('MAX("Age") AS whisker_high');
    expect(sql).toContain('"Age" >= -7 AND "Age" <= 65');
  });

  it("parses whiskers", () => {
    expect(
      parseWhiskers(resultOf(["whisker_low", "whisker_high"], [[1, 60]])),
    ).toEqual({ low: 1, high: 60 });
  });

  it("returns null when nothing falls inside the fence", () => {
    expect(
      parseWhiskers(resultOf(["whisker_low", "whisker_high"], [[null, null]])),
    ).toBeNull();
  });
});

describe("outliers", () => {
  it("filters strictly outside the fence and caps with LIMIT", () => {
    const sql = buildOutliersSql(
      "titanic",
      "Age",
      { lower: -7, upper: 65 },
      500,
    );
    expect(sql).toContain('"Age" < -7 OR "Age" > 65');
    expect(sql).toContain("LIMIT 500");
  });

  it("parses an outlier list", () => {
    expect(parseOutliers(resultOf(["value"], [[70], [80], [2]]))).toEqual([
      70, 80, 2,
    ]);
  });

  it("parses an empty outlier list", () => {
    expect(parseOutliers(resultOf(["value"], []))).toEqual([]);
  });
});

describe("moments", () => {
  it("builds one row of every requested aggregate", () => {
    const sql = buildMomentsSql("titanic", "Fare");
    expect(sql).toContain('avg("Fare") AS mean');
    expect(sql).toContain('median("Fare") AS median');
    expect(sql).toContain('mode("Fare") AS mode');
    expect(sql).toContain('stddev("Fare") AS std_dev');
    expect(sql).toContain('skewness("Fare") AS skewness');
    expect(sql).toContain('kurtosis("Fare") AS kurtosis');
    expect(sql).toContain('WHERE "Fare" IS NOT NULL');
  });

  it("parses a full moments row", () => {
    const moments = parseMoments(
      resultOf(
        ["mean", "median", "mode", "std_dev", "skewness", "kurtosis"],
        [[32.2, 14.45, 8, 49.7, 4.7, 33.4]],
      ),
    );
    expect(moments).toEqual({
      mean: 32.2,
      median: 14.45,
      mode: 8,
      stdDev: 49.7,
      skewness: 4.7,
      kurtosis: 33.4,
    });
  });

  it("leaves undefined moments (e.g. skewness on too few rows) as null rather than fabricating a value", () => {
    const moments = parseMoments(
      resultOf(
        ["mean", "median", "mode", "std_dev", "skewness", "kurtosis"],
        [[5, 5, 5, null, null, null]],
      ),
    );
    expect(moments).toEqual({
      mean: 5,
      median: 5,
      mode: 5,
      stdDev: null,
      skewness: null,
      kurtosis: null,
    });
  });

  it("returns all-null for an empty result (e.g. a 100%-null column)", () => {
    expect(
      parseMoments(
        resultOf(
          ["mean", "median", "mode", "std_dev", "skewness", "kurtosis"],
          [],
        ),
      ),
    ).toEqual({
      mean: null,
      median: null,
      mode: null,
      stdDev: null,
      skewness: null,
      kurtosis: null,
    });
  });
});
