import { describe, expect, it } from 'vitest';
import {
  buildPeriodComparisonSql,
  buildSeasonalitySql,
  buildTrendSql,
  movingAverageAlias,
  parsePeriodComparison,
  parseSeasonality,
  valueAlias,
  type TrendSpec,
} from './timeSeriesSql';
import type { QueryResult } from '../types';

const base: TrendSpec = {
  table: 'stock_prices',
  dateColumn: 'Date',
  valueColumn: 'Close',
  aggregate: 'avg',
  granularity: 'month',
};

function result(rows: unknown[][]): QueryResult {
  return { columnNames: ['period', 'avg_Close'], columnTypes: ['Date32<DAY>', 'Float64'], rows, rowCount: rows.length, executionTimeMs: 1 };
}

describe('valueAlias / movingAverageAlias', () => {
  it('combines aggregate and a sanitized column name', () => {
    expect(valueAlias(base)).toBe('avg_Close');
    expect(valueAlias({ ...base, aggregate: 'count', valueColumn: 'order total ($)' })).toBe('count_order_total');
  });

  it('names the moving-average series by its window', () => {
    expect(movingAverageAlias(7)).toBe('ma_7');
    expect(movingAverageAlias(90)).toBe('ma_90');
  });
});

describe('buildTrendSql', () => {
  it('buckets by the chosen granularity with no overlay', () => {
    const sql = buildTrendSql(base);
    expect(sql).toContain(`DATE_TRUNC('month', "Date")`);
    expect(sql).toContain('AVG("Close") AS "avg_Close"');
    expect(sql).toContain('GROUP BY 1');
    expect(sql).not.toContain('OVER');
  });

  it('wraps the bucketed series in a moving-average window when requested', () => {
    const sql = buildTrendSql({ ...base, movingAverageWindow: 7 });
    expect(sql).toContain('WITH periods AS');
    expect(sql).toContain('ROWS BETWEEN 6 PRECEDING AND CURRENT ROW');
    expect(sql).toContain('AS "ma_7"');
  });

  it('uses COUNT(*) for the count aggregate, ignoring the value column', () => {
    const sql = buildTrendSql({ ...base, aggregate: 'count' });
    expect(sql).toContain('COUNT(*) AS "count_Close"');
  });

  it('quotes table and column identifiers', () => {
    const sql = buildTrendSql({ ...base, table: 'my table', dateColumn: 'order date' });
    expect(sql).toContain('"my table"');
    expect(sql).toContain('"order date"');
  });
});

describe('buildPeriodComparisonSql', () => {
  it('orders by period descending and caps at the two most recent', () => {
    const sql = buildPeriodComparisonSql(base);
    expect(sql).toContain('ORDER BY period DESC');
    expect(sql).toContain('LIMIT 2');
  });
});

describe('buildSeasonalitySql', () => {
  it('groups by day-of-week and hour', () => {
    const sql = buildSeasonalitySql(base);
    expect(sql).toContain('EXTRACT(dow FROM "Date") AS dow');
    expect(sql).toContain('EXTRACT(hour FROM "Date") AS hour');
    expect(sql).toContain('GROUP BY 1, 2');
  });
});

describe('parsePeriodComparison', () => {
  it('returns null for an empty result', () => {
    expect(parsePeriodComparison(result([]))).toBeNull();
  });

  it('reports the current period alone with no prior', () => {
    const parsed = parsePeriodComparison(result([[1700000000000, 42]]));
    expect(parsed).toMatchObject({ currentValue: 42, priorPeriod: null, priorValue: null, deltaPct: null });
  });

  it('computes a positive percent change', () => {
    const parsed = parsePeriodComparison(result([[1700000000000, 110], [1697000000000, 100]]));
    expect(parsed?.deltaPct).toBeCloseTo(10, 5);
  });

  it('computes a negative percent change off a negative prior value using its magnitude', () => {
    const parsed = parsePeriodComparison(result([[1700000000000, -8], [1697000000000, -10]]));
    // -10 -> -8 is a 20% improvement (smaller magnitude loss), not a -120% swing.
    expect(parsed?.deltaPct).toBeCloseTo(20, 5);
  });

  it('leaves deltaPct null when the prior value is zero', () => {
    const parsed = parsePeriodComparison(result([[1700000000000, 5], [1697000000000, 0]]));
    expect(parsed?.deltaPct).toBeNull();
  });
});

describe('parseSeasonality', () => {
  it('coerces each cell to numbers, including a bigint value', () => {
    const cells = parseSeasonality({
      columnNames: ['dow', 'hour', 'avg_Close'],
      columnTypes: ['Int32', 'Int32', 'Int64'],
      rows: [[1, 9, 100n], [2, 14, 105]],
      rowCount: 2,
      executionTimeMs: 1,
    });
    expect(cells).toEqual([
      { dow: 1, hour: 9, value: 100 },
      { dow: 2, hour: 14, value: 105 },
    ]);
  });
});
