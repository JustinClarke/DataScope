import { describe, expect, it } from 'vitest';
import { buildCorrelationMatrixSql, buildScatterSql, correlationPairs, parseCorrelationMatrix } from './correlationSql';
import type { QueryResult } from '../types';

function resultOf(columnNames: string[], rows: unknown[][]): QueryResult {
  return { columnNames, columnTypes: columnNames.map(() => 'Float64'), rows, rowCount: rows.length, executionTimeMs: 1 };
}

describe('correlationPairs', () => {
  it('produces n·(n-1)/2 pairs in a fixed i<j order', () => {
    const pairs = correlationPairs(['a', 'b', 'c', 'd']);
    expect(pairs).toHaveLength(6);
    expect(pairs).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['a', 'd'],
      ['b', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ]);
  });

  it('is empty for fewer than 2 columns', () => {
    expect(correlationPairs(['a'])).toEqual([]);
    expect(correlationPairs([])).toEqual([]);
  });
});

describe('buildCorrelationMatrixSql', () => {
  it('batches every pair into one query, aliased c0, c1, …', () => {
    const sql = buildCorrelationMatrixSql('weather', ['temp', 'humidity', 'wind']);
    expect(sql).toContain('corr("temp", "humidity") AS c0');
    expect(sql).toContain('corr("temp", "wind") AS c1');
    expect(sql).toContain('corr("humidity", "wind") AS c2');
    expect(sql).toContain('FROM "weather"');
    expect(sql.match(/corr\(/g)).toHaveLength(3);
  });

  it('quotes a table or column name containing a double quote', () => {
    const sql = buildCorrelationMatrixSql('t"1', ['a"b', 'c']);
    expect(sql).toContain('"t""1"');
    expect(sql).toContain('"a""b"');
  });
});

describe('parseCorrelationMatrix', () => {
  it('fills a symmetric matrix with a 1-diagonal from the batched row', () => {
    const columns = ['temp', 'humidity', 'wind'];
    const result = resultOf(['c0', 'c1', 'c2'], [[0.8, -0.2, 0.05]]);
    const matrix = parseCorrelationMatrix(result, columns);

    expect(matrix.values[0][0]).toBe(1);
    expect(matrix.values[1][1]).toBe(1);
    expect(matrix.values[2][2]).toBe(1);
    expect(matrix.values[0][1]).toBe(0.8);
    expect(matrix.values[1][0]).toBe(0.8);
    expect(matrix.values[0][2]).toBe(-0.2);
    expect(matrix.values[2][0]).toBe(-0.2);
    expect(matrix.values[1][2]).toBe(0.05);
    expect(matrix.values[2][1]).toBe(0.05);
  });

  it('coerces a bigint/decimal-shaped cell and nulls out a non-finite value', () => {
    const columns = ['a', 'b'];
    const result = resultOf(['c0'], [[NaN]]);
    const matrix = parseCorrelationMatrix(result, columns);
    expect(matrix.values[0][1]).toBeNull();
    expect(matrix.values[1][0]).toBeNull();
  });

  it('handles a single column with no pairs', () => {
    const matrix = parseCorrelationMatrix(resultOf([], [[]]), ['only']);
    expect(matrix.values).toEqual([[1]]);
  });
});

describe('buildScatterSql', () => {
  it('selects both columns filtered to non-null so every point has two coordinates', () => {
    const sql = buildScatterSql('weather', 'temp', 'humidity');
    expect(sql).toContain('SELECT "temp", "humidity"');
    expect(sql).toContain('FROM "weather"');
    expect(sql).toContain('WHERE "temp" IS NOT NULL AND "humidity" IS NOT NULL');
  });
});
