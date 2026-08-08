import { describe, expect, it } from "vitest";
import {
  dedupeTableName,
  detectFormat,
  isFormatRejection,
  looksMalformed,
  readerCall,
  sanitizeTableName,
  XLSX_REJECTION_MESSAGE,
} from "./formatPolicy";

describe("detectFormat", () => {
  it.each([
    ["data.csv", "csv"],
    ["data.tsv", "tsv"],
    ["data.parquet", "parquet"],
    ["data.json", "json"],
    ["data.jsonl", "jsonl"],
    ["data.ndjson", "jsonl"],
    ["DATA.CSV", "csv"],
  ])("detects %s as %s", (fileName, expected) => {
    expect(detectFormat(fileName)).toBe(expected);
  });

  it("rejects xlsx with the exact D8 copy", () => {
    const result = detectFormat("report.xlsx");
    expect(isFormatRejection(result)).toBe(true);
    if (isFormatRejection(result)) {
      expect(result.reason).toBe("xlsx");
      expect(result.message).toBe(XLSX_REJECTION_MESSAGE);
    }
  });

  it("rejects xls the same way as xlsx", () => {
    const result = detectFormat("report.xls");
    expect(isFormatRejection(result) && result.reason).toBe("xlsx");
  });

  it("rejects an unrecognized extension with a friendly message", () => {
    const result = detectFormat("archive.zip");
    expect(isFormatRejection(result)).toBe(true);
    if (isFormatRejection(result)) {
      expect(result.reason).toBe("unsupported");
      expect(result.message).toContain("zip");
    }
  });

  it("rejects a file with no extension", () => {
    const result = detectFormat("README");
    expect(isFormatRejection(result)).toBe(true);
  });
});

describe("readerCall", () => {
  it("maps each format to its DuckDB reader function", () => {
    expect(readerCall("csv", "'t.csv'")).toBe("read_csv_auto('t.csv')");
    expect(readerCall("tsv", "'t.tsv'")).toBe("read_csv_auto('t.tsv')");
    expect(readerCall("parquet", "'t.parquet'")).toBe(
      "read_parquet('t.parquet')",
    );
    expect(readerCall("json", "'t.json'")).toBe("read_json_auto('t.json')");
    expect(readerCall("jsonl", "'t.jsonl'")).toBe("read_json_auto('t.jsonl')");
  });
});

describe("looksMalformed", () => {
  it("is false when the header field count matches the ingested column count", () => {
    expect(looksMalformed("csv", "a,b,c", 3)).toBe(false);
  });

  it("flags a sniffer collapse to a single column (under-count mismatch)", () => {
    // read_csv_auto's real fallback for inconsistent row shapes, verified live.
    expect(looksMalformed("csv", "a,b,c", 1)).toBe(true);
  });

  it("flags a sniffer fallback to generic column0..N names (over-count mismatch)", () => {
    expect(looksMalformed("csv", "a,b,c", 4)).toBe(true);
  });

  it("is never flagged for formats without a fixed delimiter", () => {
    expect(looksMalformed("parquet", "irrelevant", 1)).toBe(false);
    expect(looksMalformed("json", "irrelevant", 1)).toBe(false);
  });

  it("is false for an empty header line", () => {
    expect(looksMalformed("csv", "", 0)).toBe(false);
  });
});

describe("sanitizeTableName", () => {
  it("lowercases and replaces non-identifier characters with underscores", () => {
    expect(sanitizeTableName("My Data File (2026)")).toBe("my_data_file_2026");
  });

  it("prefixes a leading digit", () => {
    expect(sanitizeTableName("2026-data")).toBe("_2026_data");
  });

  it("falls back to a generic name when nothing survives sanitization", () => {
    expect(sanitizeTableName("***")).toBe("dataset");
  });
});

describe("dedupeTableName", () => {
  it("returns the base name unchanged when not taken", () => {
    expect(dedupeTableName("orders", new Set())).toBe("orders");
  });

  it("appends the first free numeric suffix", () => {
    expect(dedupeTableName("orders", new Set(["orders"]))).toBe("orders_2");
    expect(dedupeTableName("orders", new Set(["orders", "orders_2"]))).toBe(
      "orders_3",
    );
  });
});
