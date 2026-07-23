import { describe, expect, it } from 'vitest';
import { classifyStatement, redirectMutationTarget } from './statementClass';

describe('classifyStatement', () => {
  it('classifies SELECT and WITH (CTE) statements as query, case-insensitively', () => {
    expect(classifyStatement('select 1').class).toBe('query');
    expect(classifyStatement('  SELECT * FROM orders').class).toBe('query');
    expect(classifyStatement('with x as (select 1) select * from x').class).toBe('query');
    expect(classifyStatement('WITH x AS (SELECT 1) SELECT * FROM x').class).toBe('query');
  });

  it('classifies CREATE TABLE ... AS as ctas and extracts the target table name', () => {
    const info = classifyStatement('CREATE TABLE customer_features AS SELECT customer_id FROM orders');
    expect(info.class).toBe('ctas');
    expect(info.ctasTable).toBe('customer_features');
  });

  it('extracts the ctas table name through IF NOT EXISTS and a quoted identifier', () => {
    expect(classifyStatement('create table if not exists feats as select 1').ctasTable).toBe('feats');
    expect(classifyStatement('CREATE TABLE "my table" AS SELECT 1').ctasTable).toBe('my table');
  });

  it('classifies a CTAS whose body itself is a CTE pipeline as ctas, not query', () => {
    const info = classifyStatement(
      'CREATE TABLE totals AS WITH ranked AS (SELECT 1 AS n) SELECT n FROM ranked',
    );
    expect(info.class).toBe('ctas');
    expect(info.ctasTable).toBe('totals');
  });

  it('classifies UPDATE as a mutation and extracts the target', () => {
    const info = classifyStatement("UPDATE orders SET status = 'shipped' WHERE id = 1");
    expect(info.class).toBe('mutation');
    expect(info.mutationKind).toBe('update');
    expect(info.mutationTarget).toBe('orders');
  });

  it('classifies DELETE FROM as a mutation and extracts the target', () => {
    const info = classifyStatement('DELETE FROM orders WHERE id = 1');
    expect(info.class).toBe('mutation');
    expect(info.mutationKind).toBe('delete');
    expect(info.mutationTarget).toBe('orders');
  });

  it('classifies ALTER TABLE as a mutation, through IF EXISTS', () => {
    const info = classifyStatement('ALTER TABLE IF EXISTS orders ADD COLUMN note TEXT');
    expect(info.class).toBe('mutation');
    expect(info.mutationKind).toBe('alter');
    expect(info.mutationTarget).toBe('orders');
  });

  it('classifies DROP TABLE as a mutation, through IF EXISTS and a quoted identifier', () => {
    const info = classifyStatement('DROP TABLE IF EXISTS orders');
    expect(info.class).toBe('mutation');
    expect(info.mutationKind).toBe('drop');
    expect(info.mutationTarget).toBe('orders');

    const quoted = classifyStatement('DROP TABLE "my table"');
    expect(quoted.mutationTarget).toBe('my table');
  });

  it('classifies anything else (plain CREATE TABLE, INSERT) as other', () => {
    expect(classifyStatement('CREATE TABLE t (id INTEGER)').class).toBe('other');
    expect(classifyStatement('INSERT INTO orders VALUES (1)').class).toBe('other');
  });

  it('strips a trailing semicolon and surrounding whitespace before classifying', () => {
    const info = classifyStatement('  DROP TABLE orders;  ');
    expect(info.sql).toBe('DROP TABLE orders');
    expect(info.mutationTarget).toBe('orders');
  });
});

describe('redirectMutationTarget', () => {
  it('rewrites the matched target identifier, quoting the replacement', () => {
    const info = classifyStatement("UPDATE orders SET status = 'shipped'");
    expect(redirectMutationTarget(info, 'orders_edit')).toBe('UPDATE "orders_edit" SET status = \'shipped\'');
  });

  it('rewrites only the target occurrence, leaving the rest of the statement untouched', () => {
    const info = classifyStatement('DELETE FROM orders WHERE customer_id IN (SELECT id FROM orders_archive)');
    expect(redirectMutationTarget(info, 'orders_edit')).toBe(
      'DELETE FROM "orders_edit" WHERE customer_id IN (SELECT id FROM orders_archive)',
    );
  });

  it('is a no-op when the statement has no mutation target (e.g. a query)', () => {
    const info = classifyStatement('SELECT * FROM orders');
    expect(redirectMutationTarget(info, 'orders_edit')).toBe(info.sql);
  });
});
