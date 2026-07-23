import { describe, expect, it } from 'vitest';
import type { QueryResult } from '../types';
import { parseSummarizeResult } from './profile';

const SUMMARIZE_COLUMNS = [
  'column_name',
  'column_type',
  'min',
  'max',
  'approx_unique',
  'avg',
  'std',
  'null_percentage',
];

function summarizeResult(rows: unknown[][]): QueryResult {
  return {
    columnNames: SUMMARIZE_COLUMNS,
    columnTypes: SUMMARIZE_COLUMNS.map(() => 'Utf8'),
    rows,
    rowCount: rows.length,
    executionTimeMs: 0,
  };
}

describe('parseSummarizeResult', () => {
  // Real values observed live against DuckDB-Wasm's SUMMARIZE (spike-verified,
  // 03-profiling/01-summary-statistics): min/max/avg/std come back as VARCHAR
  // strings for every column type, not just non-numeric ones.
  it('parses a numeric column, coercing avg/std/null_percentage to numbers', () => {
    const result = summarizeResult([
      ['score', 'DOUBLE', '72.25', '95.5', 3, '85.25', '11.866444286305818', 25],
    ]);

    expect(parseSummarizeResult(result)).toEqual([
      {
        name: 'score',
        physicalType: 'DOUBLE',
        cardinality: 3,
        nullPercentage: 25,
        min: '72.25',
        max: '95.5',
        mean: 85.25,
        stdDev: 11.866444286305818,
      },
    ]);
  });

  it('keeps min/max as strings and leaves avg/std null for a non-numeric column', () => {
    const result = summarizeResult([['name', 'VARCHAR', 'Alice', 'Dave', 4, null, null, 0]]);

    expect(parseSummarizeResult(result)[0]).toMatchObject({
      min: 'Alice',
      max: 'Dave',
      mean: null,
      stdDev: null,
    });
  });

  // A DATE column's avg comes back as a formatted mean-timestamp string
  // ("2024-02-11 08:00:00") — not a finite number — so it collapses to null
  // rather than NaN, since ColumnProfile.mean is `number | null`.
  it('collapses a non-numeric DATE avg string to null instead of NaN', () => {
    const result = summarizeResult([
      ['joined', 'DATE', '2024-01-15', '2024-03-01', 3, '2024-02-11 08:00:00', null, 25],
    ]);

    expect(parseSummarizeResult(result)[0].mean).toBeNull();
  });

  it('handles an all-null column: zero cardinality, null stats, 100% nulls', () => {
    const result = summarizeResult([['allnull', 'VARCHAR', null, null, 0, null, null, 100]]);

    expect(parseSummarizeResult(result)[0]).toEqual({
      name: 'allnull',
      physicalType: 'VARCHAR',
      cardinality: 0,
      nullPercentage: 100,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    });
  });

  // A 0-row table: DuckDB has no 0/0 percentage to report and returns SQL
  // NULL, not 0 — ColumnProfile.nullPercentage is `number | null` for exactly
  // this case (01-summary-statistics live finding).
  it('leaves null_percentage null for a column with zero rows', () => {
    const result = summarizeResult([['id', 'BIGINT', null, null, 0, null, null, null]]);

    expect(parseSummarizeResult(result)[0].nullPercentage).toBeNull();
  });

  it('throws a clear error if an expected SUMMARIZE column is missing', () => {
    const result: QueryResult = {
      columnNames: ['column_name'],
      columnTypes: ['Utf8'],
      rows: [['id']],
      rowCount: 1,
      executionTimeMs: 0,
    };

    expect(() => parseSummarizeResult(result)).toThrow(/missing expected column/);
  });
});
