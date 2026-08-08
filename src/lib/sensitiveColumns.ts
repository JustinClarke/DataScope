// Likely-sensitive-column nudge (D46, §12.3) — deterministic, column-name-only
// detection surfaced inside the share flow. A suppression assist, never a
// clearance verdict (D21 extended to detector output): callers must render
// findings positives-only — an empty result means silence, never an
// all-clear line (a false-clean on a free-text SSN column is a trust-
// landmine for the exact D23 user who trusts it most).
export interface SensitiveColumnFinding {
  tableName: string;
  columnName: string;
  /** Which likely-personal-data category the column name matched. */
  reason: string;
}

interface Pattern {
  reason: string;
  test: RegExp;
}

// Case-insensitive, matched against the column name only — never cell
// values, which this deterministic pass never reads. Each pattern targets a
// whole word or common compound (snake_case/camelCase boundary) so "email"
// matches "email"/"user_email"/"contactEmail" without also matching an
// unrelated column that merely contains the substring elsewhere.
const PATTERNS: Pattern[] = [
  { reason: "email address", test: /e[-_]?mail/i },
  { reason: "phone number", test: /phone|mobile|telephone/i },
  {
    reason: "postal address",
    test: /address|\bstreet\b|\bzip\b|postal[-_]?code/i,
  },
  // A bare "name" column (e.g. Titanic's own `Name`) is exact-matched, not
  // substring-matched — matching `name` anywhere would also flag ordinary
  // structural columns like `table_name`/`column_name`/`file_name`.
  {
    reason: "personal name",
    test: /^name$|\b(first|last|full|maiden)[-_]?name\b|\bsurname\b/i,
  },
  {
    reason: "date of birth",
    test: /\bdob\b|date[-_]?of[-_]?birth|birth[-_]?date/i,
  },
  {
    reason: "government id (SSN/national id/passport)",
    test: /\bssn\b|social[-_]?security|passport|national[-_]?id/i,
  },
  { reason: "driver’s license", test: /driver.?s?[-_]?licen[cs]e/i },
  {
    reason: "payment card number",
    test: /card[-_]?number|\bcvv\b|credit[-_]?card|debit[-_]?card/i,
  },
  { reason: "IP address", test: /ip[-_]?address|\bip[-_]?addr\b/i },
  {
    reason: "health/medical information",
    test: /medical|diagnosis|health[-_]?record/i,
  },
  { reason: "gender or race", test: /\bgender\b|\brace\b|ethnicity/i },
  { reason: "salary or income", test: /salary|\bincome\b|compensation/i },
  {
    reason: "password or credential",
    test: /password|\bpasswd\b|secret[-_]?key/i,
  },
];

/** True when `columnName` matches one of the likely-personal-data patterns. */
export function isLikelySensitiveColumnName(columnName: string): string | null {
  const match = PATTERNS.find((p) => p.test.test(columnName));
  return match ? match.reason : null;
}

/**
 * Scans every table's column names for likely-personal-data matches.
 * Deterministic and column-name-only (never reads cell values). Returns an
 * empty array when nothing matches — callers must render that as silence,
 * never a "PII scan: none found" all-clear (D46).
 */
export function findLikelySensitiveColumns(
  tables: { tableName: string; columns: { name: string }[] }[],
): SensitiveColumnFinding[] {
  const findings: SensitiveColumnFinding[] = [];
  for (const table of tables) {
    for (const column of table.columns) {
      const reason = isLikelySensitiveColumnName(column.name);
      if (reason)
        findings.push({
          tableName: table.tableName,
          columnName: column.name,
          reason,
        });
    }
  }
  return findings;
}
