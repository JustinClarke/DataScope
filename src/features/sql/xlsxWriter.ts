import { zipSync } from "fflate";
import type { QueryResult } from "../../types";
import { formatCellText } from "./cellFormat";

/**
 * Hand-rolled, minimal OOXML writer — one sheet, header row + data, numeric
 * cells kept numeric (so Excel can sum/format them), everything else an
 * inline string. `fflate` (already a dependency, used for ZIP ingestion)
 * supplies the zip container; no separate xlsx library needed for a single
 * flat grid.
 */

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 1-indexed column number to spreadsheet letters: 1 -> A, 26 -> Z, 27 -> AA. */
function columnLetters(oneIndexed: number): string {
  let n = oneIndexed;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function inlineStringCell(ref: string, text: string): string {
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function numericCell(ref: string, value: number): string {
  return `<c r="${ref}"><v>${value}</v></c>`;
}

function buildRow(
  rowNumber: number,
  values: unknown[],
  columnTypes: string[],
): string {
  const cells = values.map((value, i) => {
    const ref = `${columnLetters(i + 1)}${rowNumber}`;
    if (typeof value === "number" && Number.isFinite(value))
      return numericCell(ref, value);
    return inlineStringCell(ref, formatCellText(value, columnTypes[i] ?? ""));
  });
  return `<row r="${rowNumber}">${cells.join("")}</row>`;
}

function buildSheetXml(result: QueryResult): string {
  const headerRow = buildRow(
    1,
    result.columnNames,
    result.columnNames.map(() => "VARCHAR"),
  );
  const dataRows = result.rows.map((row, i) =>
    buildRow(i + 2, row, result.columnTypes),
  );
  return (
    `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${headerRow}${dataRows.join("")}</sheetData></worksheet>`
  );
}

const CONTENT_TYPES = `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const ROOT_RELS = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK = `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Results" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

export function buildXlsx(result: QueryResult): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  return zipSync({
    "[Content_Types].xml": encoder.encode(CONTENT_TYPES),
    "_rels/.rels": encoder.encode(ROOT_RELS),
    "xl/workbook.xml": encoder.encode(WORKBOOK),
    "xl/_rels/workbook.xml.rels": encoder.encode(WORKBOOK_RELS),
    "xl/worksheets/sheet1.xml": encoder.encode(buildSheetXml(result)),
  });
}
