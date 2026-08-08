import { describe, expect, it } from 'vitest';
import { bucketOutcome, matchesGold, numericMatch, tagViewUsage } from './score';

describe('numericMatch', () => {
  it('matches within 0.01 absolute for small values', () => {
    expect(numericMatch(0.0, 0.005)).toBe(true);
    expect(numericMatch(0.0, 0.02)).toBe(false);
  });
  it('matches within 0.1% relative for large values', () => {
    expect(numericMatch(133735, 133735 * 1.0005)).toBe(true);
    expect(numericMatch(133735, 133735 * 1.002)).toBe(false);
  });
  it('rejects non-finite input', () => {
    expect(numericMatch(NaN, 5)).toBe(false);
  });
});

describe('matchesGold', () => {
  it('matches a scalar numeric result within tolerance', () => {
    expect(matchesGold({ columnNames: ['n'], rows: [[1337.35]] }, { kind: 'scalar', scalar: 1337.36 })).toBe(true);
    expect(matchesGold({ columnNames: ['n'], rows: [[1300]] }, { kind: 'scalar', scalar: 1337.35 })).toBe(false);
  });
  it('matches an unordered row set (top-N question, column order/row order don\'t matter)', () => {
    const actual = { columnNames: ['product', 'units'], rows: [['B', 5], ['A', 10]] };
    const gold = { kind: 'rows' as const, rows: [['A', 10], ['B', 5]] };
    expect(matchesGold(actual, gold)).toBe(true);
  });
  it('rejects an empty result against a scalar gold', () => {
    expect(matchesGold({ columnNames: [], rows: [] }, { kind: 'scalar', scalar: 5 })).toBe(false);
  });
});

describe('bucketOutcome', () => {
  const gold = { kind: 'scalar' as const, scalar: 1337.35 };
  it('buckets a matching successful run as correct', () => {
    expect(
      bucketOutcome({ proposalStatus: 'query', ranSuccessfully: true, result: { columnNames: ['n'], rows: [[1337.35]] }, errorMessage: null }, gold),
    ).toBe('correct');
  });
  it('buckets a non-matching successful run as wrong-but-ran (the dangerous case)', () => {
    expect(
      bucketOutcome({ proposalStatus: 'query', ranSuccessfully: true, result: { columnNames: ['n'], rows: [[42]] }, errorMessage: null }, gold),
    ).toBe('wrong-but-ran');
  });
  it('buckets a DuckDB execution failure as execution-error', () => {
    expect(bucketOutcome({ proposalStatus: 'query', ranSuccessfully: false, result: null, errorMessage: 'syntax error' }, gold)).toBe(
      'execution-error',
    );
  });
  it('buckets a model refusal as abstained, separately from an execution error', () => {
    expect(bucketOutcome({ proposalStatus: 'unsupported', ranSuccessfully: false, result: null, errorMessage: null }, gold)).toBe('abstained');
  });
  it('buckets schema/Zod-invalid structured output as malformed, before any SQL runs', () => {
    expect(bucketOutcome({ proposalStatus: 'malformed', ranSuccessfully: false, result: null, errorMessage: null }, gold)).toBe('malformed');
  });
});

describe('tagViewUsage', () => {
  const allViews = ['order_items_rollup_by_orders', 'order_items_rollup_by_products'];

  it('tags none when the SQL references no known view', () => {
    expect(tagViewUsage('SELECT AVG(unit_price * quantity) FROM order_items', allViews, 'order_items_rollup_by_orders')).toBe('none');
  });
  it('tags correct-view when only the question\'s correct view is referenced', () => {
    expect(tagViewUsage('SELECT AVG(order_total) FROM order_items_rollup_by_orders', allViews, 'order_items_rollup_by_orders')).toBe(
      'correct-view',
    );
  });
  it('tags wrong-view when a known view is referenced but it is not the correct one (the view-selection trap)', () => {
    expect(tagViewUsage('SELECT AVG(order_total) FROM order_items_rollup_by_products', allViews, 'order_items_rollup_by_orders')).toBe(
      'wrong-view',
    );
  });
  it('tags mixed when both the correct view and a wrong view are referenced (e.g. a join between them)', () => {
    const sql = 'SELECT * FROM order_items_rollup_by_orders JOIN order_items_rollup_by_products USING (order_item_id)';
    expect(tagViewUsage(sql, allViews, 'order_items_rollup_by_orders')).toBe('mixed');
  });
  it('never false-positives on one view name being a prefix of another', () => {
    const views = ['order_items_rollup_by_orders', 'order_items_rollup_by_orders_v2'];
    expect(tagViewUsage('SELECT * FROM order_items_rollup_by_orders_v2', views, 'order_items_rollup_by_orders')).toBe('wrong-view');
  });
  it('matches case-insensitively (DuckDB unquoted identifiers are case-insensitive)', () => {
    expect(tagViewUsage('SELECT AVG(x) FROM ORDER_ITEMS_ROLLUP_BY_ORDERS', allViews, 'order_items_rollup_by_orders')).toBe('correct-view');
  });
  it('tags wrong-view (not correct-view) when correctViewName is null but a view is still referenced', () => {
    expect(tagViewUsage('SELECT AVG(order_total) FROM order_items_rollup_by_orders', allViews, null)).toBe('wrong-view');
  });
});
