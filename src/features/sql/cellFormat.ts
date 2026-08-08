// Pure cell-formatting rules shared between the on-screen grid and CSV/Excel
// export, so a cell reads the same way wherever it's seen.

const TRUNCATE_AT = 120;

export function isDateColumn(columnType: string): boolean {
  return /date/i.test(columnType) && !/timestamp/i.test(columnType);
}

export function isTimestampColumn(columnType: string): boolean {
  return /timestamp/i.test(columnType);
}

/** `null`/`undefined` render as the literal string `NULL` — distinct from an empty string, never collapsed into one. */
export function formatCellText(value: unknown, columnType: string): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) {
    const iso = value.toISOString();
    if (isDateColumn(columnType)) return iso.slice(0, 10);
    if (isTimestampColumn(columnType))
      return iso.slice(0, 19).replace("T", " ");
    return iso;
  }
  return String(value);
}

export function truncateForDisplay(text: string): {
  display: string;
  isTruncated: boolean;
} {
  if (text.length <= TRUNCATE_AT) return { display: text, isTruncated: false };
  return { display: `${text.slice(0, TRUNCATE_AT)}…`, isTruncated: true };
}
