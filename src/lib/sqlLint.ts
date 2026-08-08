// Stage 4 of the NL→SQL pipeline (§11.1): scoped dialect lint. Generated SQL is
// parsed to a real Postgres AST (pgsql-ast-parser — ADR-008) and checked for the
// short list of things models actually get wrong writing DuckDB SQL. This is NOT
// a hand-rolled parser or a dialect converter: token-level patterns catch the two
// constructs a Postgres parser cannot even represent (backticks, `TOP n`), and an
// AST walk catches foreign function names once the statement parses.
//
// Lint is advisory. `blocking` findings name constructs DuckDB will reject, so the
// loop can feed a targeted correction back before wasting an execution attempt;
// non-blocking findings are portability nudges for constructs DuckDB tolerates.
// A parse failure degrades to "checks skipped", never a rejection — the stage-5
// execute-fail-retry loop remains the real correctness gate, so a parser gap can
// never silently block a valid DuckDB query the Postgres grammar doesn't model.
import { parse } from "pgsql-ast-parser";

export interface LintFinding {
  /** Stable machine tag for the mistake class, e.g. 'backtick-identifier'. */
  rule: string;
  /** Human-readable explanation + fix, surfaced in the transcript and fed to the model. */
  message: string;
  /** True when DuckDB will reject the construct outright (worth pre-empting execution). */
  blocking: boolean;
}

export interface LintResult {
  /** No blocking findings — safe to execute (advisory findings may still be present). */
  ok: boolean;
  findings: LintFinding[];
  /** False when the Postgres parser could not represent the SQL; AST checks were skipped. */
  parsed: boolean;
}

// Function spellings that exist in other SQL dialects but not DuckDB, which uses
// strftime/strptime/date_part/current_date instead. A model trained on mixed SQL
// reaches for these; each throws in DuckDB, so they are blocking.
const FOREIGN_DATE_FUNCTIONS: Record<string, string> = {
  getdate: "current_timestamp (or now())",
  sysdate: "current_timestamp",
  curdate: "current_date",
  date_format: "strftime(...)",
  str_to_date: "strptime(...)",
  datepart: "date_part(...)",
};

/** Collect every function name called anywhere in a parsed statement, lowercased. */
function collectCalledFunctions(statements: unknown): string[] {
  const names: string[] = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    const record = node as Record<string, unknown>;
    if (
      record.type === "call" &&
      record.function &&
      typeof record.function === "object"
    ) {
      const fn = record.function as { name?: unknown };
      if (typeof fn.name === "string") names.push(fn.name.toLowerCase());
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(statements);
  return names;
}

/**
 * Lint one generated SQL statement for DuckDB-dialect mistakes. Pure and
 * synchronous; never executes the SQL.
 */
export function lintSql(sql: string): LintResult {
  const findings: LintFinding[] = [];

  // Token-level checks run first: these constructs come from other dialects and
  // the Postgres parser would throw on them, so the AST walk below would miss them.
  if (/`/.test(sql)) {
    findings.push({
      rule: "backtick-identifier",
      message:
        'Backtick-quoted identifiers are MySQL syntax; DuckDB quotes identifiers with "double quotes".',
      blocking: false,
    });
  }
  if (/\bTOP\s+\d+/i.test(sql)) {
    findings.push({
      rule: "top-clause",
      message:
        "`TOP n` is not valid in DuckDB; use `LIMIT n` at the end of the query.",
      blocking: true,
    });
  }

  let parsed = false;
  try {
    const statements = parse(sql);
    parsed = true;
    const called = new Set(collectCalledFunctions(statements));
    for (const [fn, replacement] of Object.entries(FOREIGN_DATE_FUNCTIONS)) {
      if (called.has(fn)) {
        findings.push({
          rule: "foreign-date-function",
          message: `\`${fn}(...)\` is not a DuckDB function; use ${replacement}.`,
          blocking: true,
        });
      }
    }
    if (called.has("concat")) {
      findings.push({
        rule: "concat-operator",
        message:
          "DuckDB supports `CONCAT`, but the `||` operator is the idiomatic string concatenation.",
        blocking: false,
      });
    }
  } catch {
    // Unparseable by the Postgres grammar (e.g. it contained the backtick/TOP
    // constructs flagged above, or a DuckDB extension the grammar lacks). Skip
    // the AST checks; execution is still allowed to run and surface real errors.
    parsed = false;
  }

  return { ok: !findings.some((f) => f.blocking), findings, parsed };
}
