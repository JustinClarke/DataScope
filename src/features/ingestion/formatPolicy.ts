// §7.1 format support policy — DuckDB native readers only, no third-party parsers.

export type IngestFormat = "csv" | "tsv" | "parquet" | "json" | "jsonl";

export interface FormatRejection {
  reason: "xlsx" | "unsupported";
  message: string;
}

// D8's exact modal copy.
export const XLSX_REJECTION_MESSAGE =
  "Excel files are not supported directly. Please export your spreadsheet as CSV (File → Save As → CSV) and re-upload.";

export function detectFormat(fileName: string): IngestFormat | FormatRejection {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "csv":
      return "csv";
    case "tsv":
      return "tsv";
    case "parquet":
      return "parquet";
    case "json":
      return "json";
    case "jsonl":
    case "ndjson":
      return "jsonl";
    case "xlsx":
    case "xls":
      return { reason: "xlsx", message: XLSX_REJECTION_MESSAGE };
    default:
      return {
        reason: "unsupported",
        message: `".${ext || fileName}" files aren't supported. Try CSV, TSV, Parquet, or JSON/JSONL.`,
      };
  }
}

export function isFormatRejection(
  value: IngestFormat | FormatRejection,
): value is FormatRejection {
  return typeof value === "object";
}

/** The DuckDB reader-function call for a detected format, over an already-quoted path literal. */
export function readerCall(format: IngestFormat, quotedPath: string): string {
  switch (format) {
    case "parquet":
      return `read_parquet(${quotedPath})`;
    case "json":
    case "jsonl":
      return `read_json_auto(${quotedPath})`;
    case "csv":
    case "tsv":
      return `read_csv_auto(${quotedPath})`;
  }
}

const DELIMITER: Partial<Record<IngestFormat, string>> = {
  csv: ",",
  tsv: "\t",
};

/**
 * A sanity check DuckDB itself won't give us: `read_csv_auto` never throws on
 * a row/header column-count mismatch — it silently falls back to a
 * single generic column, or to `columnN` names, discarding the real header
 * (verified live against real malformed fixtures, 01-file-drop). Comparing
 * the header's own field count against the ingested table's column count
 * catches both fallback shapes without re-parsing the file ourselves.
 */
export function looksMalformed(
  format: IngestFormat,
  rawText: string,
  actualColumnCount: number,
): boolean {
  const delimiter = DELIMITER[format];
  if (!delimiter) return false;
  const firstLine = rawText.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.length === 0) return false;
  const headerFieldCount = firstLine.split(delimiter).length;
  return headerFieldCount !== actualColumnCount;
}

export function sanitizeTableName(base: string): string {
  const cleaned = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "_$1");
  return cleaned || "dataset";
}

export function dedupeTableName(
  base: string,
  existing: ReadonlySet<string>,
): string {
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}
