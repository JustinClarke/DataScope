// The one-statement query gate and table allowlist (experiment doc, "SQL
// safety and execution"). Model output is untrusted input even when it is
// local: this is a real Postgres-grammar parse (`pgsql-ast-parser`, the same
// package `src/lib/sqlLint.ts` uses) and an AST walk, not a regex — a regex
// alone is not a security boundary. DuckDB's read-only sealed connection
// (`database.ts`) is the actual boundary; this gate exists to give a useful
// refusal message before spending an execution attempt, and as defense in
// depth against the handful of attack shapes an AST can catch cheaply
// (table functions reading arbitrary files, tables outside the two views).
import { parse } from 'pgsql-ast-parser';
import { ALLOWED_VIEWS, ANALYTICS_SCHEMA, type AllowedView } from './catalog';

/**
 * Why a statement was rejected, which decides whether `chat.ts` may spend a
 * model call trying to fix it.
 *
 * - `parse` — the text announced itself as a query (empty, or leading
 *   `SELECT`/`WITH`) and still would not parse even after salvage. That is an
 *   emission defect: the model meant to write a query and fumbled it, so asking
 *   again is reasonable. See `LOOKS_LIKE_A_QUERY` for why the check is on the
 *   leading keyword rather than on parse failure alone.
 * - `policy` — the text says something it is not allowed to say: more than one
 *   statement, not a SELECT/WITH, a view outside the allowlist, a table
 *   function, or a verb this Postgres grammar does not even recognize
 *   (`INSTALL`, `PRAGMA`, `ATTACH`). That is not a transient defect, it is the
 *   proposal the safety questions exist to catch, and feeding the reason back
 *   would only coach the model toward a compliant restatement of the same
 *   intent. Terminal.
 */
export type GuardFailureKind = 'parse' | 'policy';

/**
 * A union rather than one loose shape so a caller cannot reach for `sql` on a
 * rejection: the only statement that exists here is one that passed every gate.
 */
export type GuardResult =
  | {
      ok: true;
      /**
       * The normalized statement to execute. Callers must run this rather than
       * the raw model output: it has trailing semicolons stripped (`chat.ts`
       * wraps the statement in `SELECT * FROM (…) AS _q`, where a trailing `;`
       * is a syntax error) and, when the raw text failed to parse, trailing
       * non-SQL junk removed — see `salvageTrailingJunk`.
       */
      sql: string;
      /**
       * True when the raw text failed to parse and `salvageTrailingJunk`
       * rescued it — i.e. the live qwen3:4b trailing-junk glitch fired on this
       * statement. Deliberately not set by the trailing-semicolon strip, which
       * fires on well-formed SQL too and would drown the signal; the scored run
       * needs the glitch rate specifically, since a salvaged statement is
       * otherwise indistinguishable from a clean one in the output.
       */
      salvaged: boolean;
    }
  | { ok: false; reason: string; kind: GuardFailureKind };

const READ_ONLY_TYPES = new Set(['select', 'with']);

/** True when every statement reachable from `stmt` (through CTEs) is itself select/with — never insert/update/delete. */
function isReadOnlyStatement(stmt: unknown): boolean {
  if (stmt === null || typeof stmt !== 'object') return false;
  const type = (stmt as { type?: unknown }).type;
  if (type === 'select') return true;
  if (type !== 'with') return false;
  const withStmt = stmt as { bind?: Array<{ statement?: unknown }>; in?: unknown };
  if (!Array.isArray(withStmt.bind) || !isReadOnlyStatement(withStmt.in)) return false;
  return withStmt.bind.every((b) => isReadOnlyStatement(b.statement));
}

function tableRef(entry: Record<string, unknown>): { schema: string | null; name: string } | null {
  const name = entry.name;
  if (name === null || typeof name !== 'object') return null;
  const n = name as { name?: unknown; schema?: unknown };
  if (typeof n.name !== 'string') return null;
  return { name: n.name.toLowerCase(), schema: typeof n.schema === 'string' ? n.schema.toLowerCase() : null };
}

function isAllowedTable(ref: { schema: string | null; name: string }, cteAliases: ReadonlySet<string>): boolean {
  if (ref.schema === null && cteAliases.has(ref.name)) return true;
  return (
    (ALLOWED_VIEWS as readonly string[]).includes(ref.name as AllowedView) &&
    (ref.schema === null || ref.schema === ANALYTICS_SCHEMA)
  );
}

/** Every name bound by a `WITH name AS (...)` anywhere in the tree — these are legitimate FROM targets even though they are not in the view allowlist. */
function collectCteAliases(node: unknown, aliases: Set<string>): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectCteAliases(child, aliases);
    return;
  }
  const record = node as Record<string, unknown>;
  if (record.type === 'with' && Array.isArray(record.bind)) {
    for (const b of record.bind as Array<{ alias?: { name?: unknown } }>) {
      if (typeof b.alias?.name === 'string') aliases.add(b.alias.name.toLowerCase());
    }
  }
  for (const value of Object.values(record)) collectCteAliases(value, aliases);
}

/**
 * Walks every `FROM`/join position in the statement tree (top-level and every
 * nested subquery/CTE, since this recurses into the whole node graph) and
 * reports the first violation: a table/view outside the two-view allowlist
 * (CTE aliases bound in this same statement are not violations), or a table
 * function (`read_csv_auto`, `glob`, an extension's table function, …) in
 * FROM position — the shape `read another CSV` or `load an extension` would take.
 */
function findFromViolation(node: unknown, cteAliases: ReadonlySet<string>): string | null {
  if (node === null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const violation = findFromViolation(child, cteAliases);
      if (violation) return violation;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  if ('from' in record && record.from !== null && record.from !== undefined) {
    const entries = Array.isArray(record.from) ? record.from : [record.from];
    for (const raw of entries) {
      if (raw === null || typeof raw !== 'object') continue;
      const entry = raw as Record<string, unknown>;
      if (entry.type === 'table') {
        const ref = tableRef(entry);
        if (!ref || !isAllowedTable(ref, cteAliases)) {
          return `references disallowed table/view "${ref ? (ref.schema ? `${ref.schema}.` : '') + ref.name : '(unrecognized)'}"`;
        }
      } else if (entry.type === 'call') {
        return 'calls a table function in FROM position, which is not allowed (no file, URL, or extension access)';
      }
    }
  }
  for (const value of Object.values(record)) {
    const violation = findFromViolation(value, cteAliases);
    if (violation) return violation;
  }
  return null;
}

/** Only punctuation may be discarded by `salvageTrailingJunk` — one word character means real SQL is in the tail. */
const PUNCTUATION_ONLY = /^\W*$/;

/**
 * Leading `SELECT`/`WITH`, the only shape a parse failure is allowed to be
 * called a repairable emission defect.
 *
 * The parser is a Postgres grammar, so it rejects two very different things
 * identically: a truncated `SELECT … WHERE` (the model meant SQL and fumbled
 * it) and `INSTALL httpfs` (a perfectly deliberate DuckDB statement the
 * grammar has never heard of). Classifying purely on "did it parse" called the
 * second one repairable and offered to re-ask about it — which is precisely
 * what safety question 20 is.
 *
 * So the test is positive and fails closed: an unrecognized verb is terminal
 * at zero cost, and only text that announces itself as a query earns a
 * correction call. A denylist of forbidden verbs would have to be exhaustive
 * against a dialect that keeps growing; this does not.
 */
const LOOKS_LIKE_A_QUERY = /^[\s(]*(select|with)\b/i;

function tryParse(sql: string): { ok: true; statements: unknown[] } | { ok: false; error: string } {
  try {
    return { ok: true, statements: parse(sql) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * One deterministic salvage attempt for the reproducible small-model glitch
 * where a complete statement is followed by stray characters
 * (`...GROUP BY category;'}` — valid outer JSON, so the malformed-JSON retry
 * never sees it, but not parseable SQL). Returns the text through the last `;`,
 * and only when everything discarded is punctuation; anything else is refused
 * rather than guessed at. The caller re-parses the result and runs every gate
 * on it, so this can only ever recover a statement that would have passed
 * anyway — a salvaged `SELECT 1; DROP TABLE t;'}` still fails the
 * one-statement check below.
 */
function salvageTrailingJunk(trimmed: string): string | null {
  const lastSemicolon = trimmed.lastIndexOf(';');
  if (lastSemicolon === -1) return null;
  if (!PUNCTUATION_ONLY.test(trimmed.slice(lastSemicolon + 1))) return null;
  return trimmed.slice(0, lastSemicolon + 1);
}

/**
 * Every gate the doc's "SQL safety and execution" section requires except the
 * two that need a live connection (execution timeout, row/byte ceilings —
 * applied by the caller around `SealedRuntime.execute`).
 */
export function guardSql(sql: string): GuardResult {
  const trimmed = sql.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty SQL', kind: 'parse' };

  const firstAttempt = tryParse(trimmed);
  let candidate = trimmed;
  let salvaged = false;
  let statements: unknown[];
  if (firstAttempt.ok) {
    statements = firstAttempt.statements;
  } else {
    const rescued = salvageTrailingJunk(trimmed);
    const retry = rescued === null ? null : tryParse(rescued);
    if (rescued === null || retry === null || !retry.ok) {
      // Report the failure on what the model actually sent, not on the salvage attempt it never made.
      return {
        ok: false,
        reason: `SQL did not parse: ${firstAttempt.error}`,
        kind: LOOKS_LIKE_A_QUERY.test(trimmed) ? 'parse' : 'policy',
      };
    }
    candidate = rescued;
    salvaged = true;
    statements = retry.statements;
  }

  if (statements.length !== 1) {
    return { ok: false, reason: `expected exactly one SQL statement, found ${statements.length}`, kind: 'policy' };
  }
  const [statement] = statements;

  const type = (statement as { type?: unknown }).type;
  if (typeof type !== 'string' || !READ_ONLY_TYPES.has(type)) {
    return { ok: false, reason: `statement must start with SELECT or WITH, was "${String(type)}"`, kind: 'policy' };
  }
  if (!isReadOnlyStatement(statement)) {
    return { ok: false, reason: 'a bound CTE or the final statement is not itself read-only', kind: 'policy' };
  }

  const cteAliases = new Set<string>();
  collectCteAliases(statement, cteAliases);
  const fromViolation = findFromViolation(statement, cteAliases);
  if (fromViolation) return { ok: false, reason: fromViolation, kind: 'policy' };

  return { ok: true, sql: candidate.replace(/[\s;]+$/, ''), salvaged };
}
