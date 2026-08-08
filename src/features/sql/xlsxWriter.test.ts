import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildXlsx } from "./xlsxWriter";
import type { QueryResult } from "../../types";

const result: QueryResult = {
  columnNames: ["id", "name"],
  columnTypes: ["BIGINT", "VARCHAR"],
  rows: [
    [1, "Ada"],
    [null, 'Special <chars> & "quotes"'],
  ],
  rowCount: 2,
  executionTimeMs: 1,
};

describe("buildXlsx", () => {
  it("produces a valid zip with the OOXML parts Excel/Sheets expect", () => {
    const entries = unzipSync(buildXlsx(result));
    expect(Object.keys(entries).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
  });

  it("keeps numeric cells numeric and everything else an escaped inline string", () => {
    const entries = unzipSync(buildXlsx(result));
    const sheet = strFromU8(entries["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain('<c r="A2"><v>1</v></c>');
    expect(sheet).toContain("NULL");
    expect(sheet).toContain("Special &lt;chars&gt; &amp; &quot;quotes&quot;");
  });
});
