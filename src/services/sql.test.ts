import { beforeEach, describe, expect, it } from 'vitest';
import { cancelQuery, getHistory, isSelectLike } from './sql';
import { useQueryStore, CONSOLE_SESSION } from '../stores/query';
import type { QueryResult } from '../types';

// These cover the pure, engine-free surface of the service. runQuery needs a
// live DuckDB worker (a real browser), so it is verified separately, not here.

const result: QueryResult = {
  columnNames: ['n'],
  columnTypes: ['BIGINT'],
  rows: [[1]],
  rowCount: 1,
  executionTimeMs: 3,
};

beforeEach(() => {
  useQueryStore.setState({ sessions: {}, history: [], lastRunSession: CONSOLE_SESSION });
});

describe('sql service', () => {
  it('getHistory returns results from successful history entries only', () => {
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, 'SELECT 1');
    useQueryStore.getState().querySucceeded(CONSOLE_SESSION, result);
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, 'SELECT bad');
    useQueryStore.getState().queryFailed(CONSOLE_SESSION, 'boom');

    expect(getHistory()).toEqual([result]);
  });

  it('cancelQuery is a no-op when nothing is in flight', () => {
    expect(() => cancelQuery()).not.toThrow();
    expect(() => cancelQuery(CONSOLE_SESSION, 'nonexistent-id')).not.toThrow();
    expect(() => cancelQuery('tab-1')).not.toThrow();
  });
});

describe('isSelectLike', () => {
  it('recognizes SELECT and WITH statements, case-insensitively and with leading whitespace', () => {
    expect(isSelectLike('select 1')).toBe(true);
    expect(isSelectLike('  SELECT * FROM t')).toBe(true);
    expect(isSelectLike('with x as (select 1) select * from x')).toBe(true);
    expect(isSelectLike('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true);
  });

  it('rejects DDL/DML that must not be wrapped in a subquery', () => {
    expect(isSelectLike('CREATE TABLE t AS SELECT 1')).toBe(false);
    expect(isSelectLike('insert into t values (1)')).toBe(false);
    expect(isSelectLike('DROP TABLE t')).toBe(false);
    expect(isSelectLike('')).toBe(false);
  });
});
