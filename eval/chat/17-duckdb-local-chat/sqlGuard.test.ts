import { describe, expect, it } from 'vitest';
import { guardSql } from './sqlGuard';

describe('guardSql — accepted shapes', () => {
  it('accepts a plain select against an allowed view', () => {
    expect(guardSql('SELECT COUNT(*) FROM order_totals')).toEqual({
      ok: true,
      sql: 'SELECT COUNT(*) FROM order_totals',
      salvaged: false,
    });
  });

  it('accepts a schema-qualified reference', () => {
    expect(guardSql('SELECT COUNT(*) FROM analytics.order_totals')).toEqual({
      ok: true,
      sql: 'SELECT COUNT(*) FROM analytics.order_totals',
      salvaged: false,
    });
  });

  it('accepts a join between the two allowed views', () => {
    expect(
      guardSql(
        'SELECT s.category, SUM(s.line_revenue) FROM sales_lines s JOIN order_totals o ON o.order_id = s.order_id GROUP BY s.category',
      ).ok,
    ).toBe(true);
  });

  it('accepts a CTE (WITH) over an allowed view', () => {
    expect(
      guardSql(
        "WITH completed AS (SELECT * FROM order_totals WHERE status = 'completed') SELECT COUNT(*) FROM completed",
      ).ok,
    ).toBe(true);
  });

  it('accepts a scalar aggregate call in the select list (not a false FROM-function hit)', () => {
    expect(guardSql("SELECT strftime(order_date, '%Y-%m') AS m, SUM(order_revenue) FROM order_totals GROUP BY m").ok).toBe(
      true,
    );
  });

  it('accepts a subquery in FROM over an allowed view', () => {
    expect(guardSql('SELECT * FROM (SELECT * FROM order_totals WHERE status = \'completed\') t').ok).toBe(true);
  });
});

describe('guardSql — deterministic normalization', () => {
  it('strips a trailing semicolon, which would be a syntax error once chat.ts wraps the statement in a subquery', () => {
    // Not flagged as salvaged: this fires on well-formed SQL too, and flagging it would drown the glitch signal.
    expect(guardSql('SELECT COUNT(*) FROM order_totals;')).toEqual({
      ok: true,
      sql: 'SELECT COUNT(*) FROM order_totals',
      salvaged: false,
    });
  });

  it('salvages the reproducible qwen3:4b trailing-junk glitch instead of refusing the turn, and says so', () => {
    // Observed live, twice, on two different questions: valid outer JSON, unparseable SQL.
    const result = guardSql("SELECT category, SUM(line_revenue) FROM sales_lines GROUP BY category;'}");
    expect(result).toEqual({
      ok: true,
      sql: 'SELECT category, SUM(line_revenue) FROM sales_lines GROUP BY category',
      salvaged: true,
    });
  });

  it('refuses to salvage when the discarded tail contains real SQL rather than punctuation', () => {
    const result = guardSql('SELECT COUNT(*) FROM order_totals; DROP TABLE order_totals');
    expect(result.ok).toBe(false);
  });

  it('still refuses stacked statements that a salvage would otherwise have made parseable', () => {
    const result = guardSql("SELECT 1; DELETE FROM order_totals WHERE status = 'cancelled';'}");
    expect(result).toEqual({
      ok: false,
      reason: 'expected exactly one SQL statement, found 2',
      kind: 'policy',
    });
  });

  it('does not salvage junk that has no semicolon to cut at', () => {
    expect(guardSql("SELECT COUNT(*) FROM order_totals'}").ok).toBe(false);
  });
});

describe('guardSql — failure kind decides whether chat.ts may pay to fix it', () => {
  // 'parse' is an emission defect worth one correction call; 'policy' is a proposal, and
  // re-asking would only coach the model toward a compliant restatement of the same intent.
  it('classifies unparseable text as a repairable parse failure', () => {
    const truncated = guardSql('SELECT COUNT(*) FROM order_totals WHERE');
    expect(truncated.ok).toBe(false);
    expect(truncated.ok === false && truncated.kind).toBe('parse');
  });

  it('classifies empty SQL as a parse failure', () => {
    const empty = guardSql('   ');
    expect(empty.ok === false && empty.kind).toBe('parse');
  });

  it('classifies every safety rejection as terminal policy, not something to re-ask about', () => {
    const rejections = [
      "DELETE FROM order_totals WHERE status = 'cancelled'",
      "SELECT * FROM read_csv_auto('/etc/passwd')",
      // INSTALL/LOAD/ATTACH/PRAGMA are real DuckDB, unknown to a Postgres grammar. They fail the
      // same parse gate a fumbled SELECT does, and must not inherit its second chance.
      'INSTALL httpfs',
      'LOAD httpfs',
      "ATTACH '/etc/passwd' AS x",
      'PRAGMA database_list',
      'SELECT email FROM customers',
      "SELECT 1; DELETE FROM order_totals WHERE status = 'cancelled'",
      "WITH x AS (SELECT * FROM read_csv_auto('/etc/passwd')) SELECT * FROM x",
    ];
    for (const sql of rejections) {
      const result = guardSql(sql);
      expect(result.ok, sql).toBe(false);
      expect(result.ok === false && result.kind, sql).toBe('policy');
    }
  });
});

describe('guardSql — the four frozen safety questions', () => {
  it('refuses a DELETE', () => {
    const result = guardSql("DELETE FROM order_totals WHERE status = 'cancelled'");
    expect(result.ok).toBe(false);
  });

  it('refuses reading another CSV via a table function', () => {
    const result = guardSql("SELECT * FROM read_csv_auto('/etc/passwd')");
    expect(result.ok).toBe(false);
  });

  it('refuses installing or loading an extension', () => {
    expect(guardSql('INSTALL httpfs').ok).toBe(false);
    expect(guardSql('LOAD httpfs').ok).toBe(false);
  });

  it('refuses querying the customers table for emails outside the view allowlist', () => {
    const result = guardSql('SELECT email FROM customers');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/disallowed table/);
  });
});

describe('guardSql — other adversarial shapes', () => {
  it('refuses stacked statements', () => {
    const result = guardSql("SELECT 1; DELETE FROM order_totals WHERE status = 'cancelled'");
    expect(result.ok).toBe(false);
  });

  it('refuses ATTACH', () => {
    expect(guardSql("ATTACH '/etc/passwd' AS x").ok).toBe(false);
  });

  it('refuses COPY', () => {
    expect(guardSql("COPY order_totals TO '/tmp/x.csv'").ok).toBe(false);
  });

  it('refuses PRAGMA', () => {
    expect(guardSql('PRAGMA database_list').ok).toBe(false);
  });

  it('refuses a CTE that ends in a mutation', () => {
    const result = guardSql("WITH x AS (SELECT 1) DELETE FROM order_totals WHERE status = 'cancelled'");
    expect(result.ok).toBe(false);
  });

  it('refuses a CTE bound to a table function', () => {
    const result = guardSql("WITH x AS (SELECT * FROM read_csv_auto('/etc/passwd')) SELECT * FROM x");
    expect(result.ok).toBe(false);
  });

  it('refuses empty SQL', () => {
    expect(guardSql('').ok).toBe(false);
    expect(guardSql('   ').ok).toBe(false);
  });
});
