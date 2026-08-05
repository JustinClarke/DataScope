// Lightweight statement-class detection for the transformation layer (§10
// Module 2, §12.1) — a regex-anchored check, not a real SQL parser; it can
// graduate to one once sqlLint lands (06-ai/01-pipeline.md). Distinguishes
// five classes the transform layer treats differently: a plain query (stays
// on the row-capped path in services/sql.ts and never reaches this layer), a
// `CREATE TABLE AS` (derives and registers a new table), a `CREATE VIEW AS`
// (registers a session view the same way — A3), a mutation
// (UPDATE/DELETE/ALTER/DROP — gated on whether its target is a source
// table), and anything else (runs unwrapped, untouched by this layer).

export type StatementClass = 'query' | 'ctas' | 'cview' | 'mutation' | 'other';
export type MutationKind = 'update' | 'delete' | 'alter' | 'drop';

export interface StatementInfo {
  class: StatementClass;
  /** The statement with a trailing `;` and surrounding whitespace stripped — every offset below is relative to this string, not the original input. */
  sql: string;
  /** The table name for a `CREATE TABLE ... AS` statement. */
  ctasTable?: string;
  /** The view name for a `CREATE VIEW ... AS` statement (A3) — registered the same way a CTAS's table is, so a view the user types in the console and one `create_view` makes are the same object. */
  viewName?: string;
  /** True when a `mutationKind: 'drop'` targets a view rather than a table, so the drop statement can be reissued with the right keyword. */
  mutationTargetIsView?: boolean;
  mutationKind?: MutationKind;
  mutationTarget?: string;
  /** `[start, end)` offset of the matched target identifier within `sql` — used to redirect a guarded mutation onto a materialized clone. */
  mutationTargetRange?: [number, number];
}

const IDENT_SRC = '"(?:[^"]|"")+"|[a-zA-Z_][a-zA-Z0-9_]*';

function unquoteIdentifier(raw: string): string {
  return raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw;
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

interface TargetMatch {
  target: string;
  range: [number, number];
}

function matchTarget(sql: string, pattern: RegExp): TargetMatch | null {
  const match = sql.match(pattern);
  if (!match || match.index === undefined || match[1] === undefined) return null;
  const start = match.index + match[0].lastIndexOf(match[1]);
  return { target: unquoteIdentifier(match[1]), range: [start, start + match[1].length] };
}

export function classifyStatement(rawSql: string): StatementInfo {
  const sql = rawSql.trim().replace(/;\s*$/, '');

  if (/^(select|with)\b/i.test(sql)) return { class: 'query', sql };

  const ctas = sql.match(new RegExp(`^create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(${IDENT_SRC})\\s+as\\b`, 'i'));
  if (ctas) return { class: 'ctas', sql, ctasTable: unquoteIdentifier(ctas[1]) };

  const cview = sql.match(
    new RegExp(`^create\\s+(?:or\\s+replace\\s+)?view\\s+(?:if\\s+not\\s+exists\\s+)?(${IDENT_SRC})\\s+as\\b`, 'i'),
  );
  if (cview) return { class: 'cview', sql, viewName: unquoteIdentifier(cview[1]) };

  const update = matchTarget(sql, new RegExp(`^update\\s+(${IDENT_SRC})`, 'i'));
  if (update) {
    return { class: 'mutation', sql, mutationKind: 'update', mutationTarget: update.target, mutationTargetRange: update.range };
  }

  const del = matchTarget(sql, new RegExp(`^delete\\s+from\\s+(${IDENT_SRC})`, 'i'));
  if (del) {
    return { class: 'mutation', sql, mutationKind: 'delete', mutationTarget: del.target, mutationTargetRange: del.range };
  }

  const alter = matchTarget(sql, new RegExp(`^alter\\s+table\\s+(?:if\\s+exists\\s+)?(${IDENT_SRC})`, 'i'));
  if (alter) {
    return { class: 'mutation', sql, mutationKind: 'alter', mutationTarget: alter.target, mutationTargetRange: alter.range };
  }

  const drop = matchTarget(sql, new RegExp(`^drop\\s+table\\s+(?:if\\s+exists\\s+)?(${IDENT_SRC})`, 'i'));
  if (drop) {
    return { class: 'mutation', sql, mutationKind: 'drop', mutationTarget: drop.target, mutationTargetRange: drop.range };
  }

  const dropView = matchTarget(sql, new RegExp(`^drop\\s+view\\s+(?:if\\s+exists\\s+)?(${IDENT_SRC})`, 'i'));
  if (dropView) {
    return {
      class: 'mutation',
      sql,
      mutationKind: 'drop',
      mutationTarget: dropView.target,
      mutationTargetRange: dropView.range,
      mutationTargetIsView: true,
    };
  }

  return { class: 'other', sql };
}

/** Rewrites a mutation's target identifier in place — used to redirect a guarded mutation from a source table onto its materialized clone. */
export function redirectMutationTarget(info: StatementInfo, newTarget: string): string {
  if (!info.mutationTargetRange) return info.sql;
  const [start, end] = info.mutationTargetRange;
  return info.sql.slice(0, start) + quoteIdentifier(newTarget) + info.sql.slice(end);
}
