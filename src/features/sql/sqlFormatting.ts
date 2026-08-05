// Formatting the console's buffer (S6.5). Deliberately monaco-free so the
// toolbar's Format button can reach it without pulling the editor package into
// its own module graph — `MonacoWrapper` registers the same function as a
// document-formatting provider, which is what gives the editor its ⇧⌥F and
// format-on-paste.
import { format } from 'sql-formatter';

/**
 * The engine is DuckDB (ADR-004), so the dialect is too — a Postgres-shaped
 * formatter mangles DuckDB's own syntax (`QUALIFY`, `EXCLUDE`, list literals).
 * Keyword case is preserved rather than upcased: the buffer holds text a person
 * typed, and rewriting their casing on a formatting pass is a change they did
 * not ask for.
 */
export function formatSql(sql: string): string {
  try {
    return format(sql, { language: 'duckdb', keywordCase: 'preserve' });
  } catch {
    // Invalid or half-typed SQL is the normal state of an editor buffer. The
    // formatter throwing on it is not an error worth surfacing — it just means
    // there is nothing to reformat yet.
    return sql;
  }
}
