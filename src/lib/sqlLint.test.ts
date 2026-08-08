import { describe, expect, it } from "vitest";
import { lintSql } from "./sqlLint";

describe("lintSql — dialect mistake classes (§11.1 stage 4)", () => {
  it("flags backtick-quoted identifiers (non-blocking portability nudge)", () => {
    const result = lintSql("SELECT `name` FROM users");
    const finding = result.findings.find(
      (f) => f.rule === "backtick-identifier",
    );
    expect(finding).toBeDefined();
    expect(finding?.blocking).toBe(false);
  });

  it("flags TOP n and treats it as blocking", () => {
    const result = lintSql("SELECT TOP 5 name FROM users ORDER BY score DESC");
    const finding = result.findings.find((f) => f.rule === "top-clause");
    expect(finding).toBeDefined();
    expect(finding?.blocking).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("flags foreign date/time functions as blocking", () => {
    for (const [sql, needle] of [
      ["SELECT getdate()", "getdate"],
      ["SELECT date_format(ts, '%Y') FROM t", "date_format"],
      ["SELECT str_to_date(s, '%Y-%m-%d') FROM t", "str_to_date"],
    ] as const) {
      const result = lintSql(sql);
      const finding = result.findings.find(
        (f) => f.rule === "foreign-date-function",
      );
      expect(
        finding,
        `expected a foreign-date-function finding for ${sql}`,
      ).toBeDefined();
      expect(finding?.blocking).toBe(true);
      expect(finding?.message).toContain(needle);
    }
  });

  it("flags CONCAT as a non-blocking style nudge (DuckDB supports it)", () => {
    const result = lintSql("SELECT concat(first, last) FROM people");
    const finding = result.findings.find((f) => f.rule === "concat-operator");
    expect(finding).toBeDefined();
    expect(finding?.blocking).toBe(false);
    expect(result.ok).toBe(true);
  });

  it("passes clean idiomatic DuckDB SQL with no findings", () => {
    const result = lintSql(
      "SELECT product, sum(amount) AS total FROM sales GROUP BY product ORDER BY total DESC LIMIT 10",
    );
    expect(result.parsed).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("parses CTEs and window functions without spurious findings (parse-fidelity evidence, ADR-008)", () => {
    const cte = lintSql(
      "WITH ranked AS (SELECT product, amount, row_number() OVER (PARTITION BY product ORDER BY amount DESC) AS rn FROM sales) SELECT * FROM ranked WHERE rn = 1",
    );
    expect(cte.parsed).toBe(true);
    expect(cte.findings).toEqual([]);
  });

  it("degrades to skipped checks (not a rejection) when the SQL is unparseable, keeping token-level findings", () => {
    // Backticks make the Postgres grammar throw; the token-level backtick finding
    // still lands, and the result stays advisory (ok) rather than blocking.
    const result = lintSql("SELECT `weird mysql` FROM `t`");
    expect(result.parsed).toBe(false);
    expect(result.findings.some((f) => f.rule === "backtick-identifier")).toBe(
      true,
    );
    expect(result.ok).toBe(true);
  });
});
