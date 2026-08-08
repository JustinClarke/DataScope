import { describe, expect, it } from "vitest";
import { toCsv } from "./resultsExport";
import type { QueryResult } from "../../types";

function makeResult(
  rows: unknown[][],
  columnTypes = ["BIGINT", "VARCHAR"],
): QueryResult {
  return {
    columnNames: ["id", "name"],
    columnTypes,
    rows,
    rowCount: rows.length,
    executionTimeMs: 1,
  };
}

describe("toCsv", () => {
  it("writes a header row followed by data rows, CRLF-joined", () => {
    const csv = toCsv(makeResult([[1, "Ada"]]));
    expect(csv).toBe("id,name\r\n1,Ada");
  });

  it("quotes fields containing a comma, quote, or newline, and doubles embedded quotes", () => {
    const csv = toCsv(
      makeResult([
        [1, 'Smith, "Ada"'],
        [2, "line1\nline2"],
      ]),
    );
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe('1,"Smith, ""Ada"""');
    expect(lines[2]).toBe('2,"line1\nline2"');
  });

  it("renders NULL as the literal text NULL, distinct from an empty string", () => {
    const csv = toCsv(
      makeResult([
        [null, ""],
        [2, "x"],
      ]),
    );
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe("NULL,");
    expect(lines[2]).toBe("2,x");
  });
});
