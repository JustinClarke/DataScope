// Recovers the table/column list from the schema-pruned system prompt
// (src/lib/schemaPrune.ts's `renderTable`/`renderColumn` format) so a
// harness-only provider can generate SQL without a second, hidden channel
// into the schema — it sees exactly what a real provider would see.
export interface ParsedTable {
  tableName: string;
  rowCount: number;
  columns: { name: string; semanticType: string; physicalType: string }[];
}

const TABLE_LINE = /^Table (\S+) \(([\d,]+) rows\):$/;
const COLUMN_LINE = /^ {2}- (\S+): (\S+) \((\S+)\)$/;

export function parseSchemaPrompt(systemPrompt: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  let current: ParsedTable | null = null;
  for (const line of systemPrompt.split('\n')) {
    const tableMatch = TABLE_LINE.exec(line);
    if (tableMatch) {
      current = { tableName: tableMatch[1], rowCount: Number(tableMatch[2].replace(/,/g, '')), columns: [] };
      tables.push(current);
      continue;
    }
    const columnMatch = COLUMN_LINE.exec(line);
    if (columnMatch && current) {
      current.columns.push({ name: columnMatch[1], semanticType: columnMatch[2], physicalType: columnMatch[3] });
    }
  }
  return tables;
}
