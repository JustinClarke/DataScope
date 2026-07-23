import { describe, it, expect } from 'vitest';
import type { QueryResult } from '../types';
import { availableChartTypes, buildChart, classifyColumnType, recommendChart, specForType } from './chartMapper';

function makeResult(columnNames: string[], columnTypes: string[], rows: unknown[][]): QueryResult {
  return { columnNames, columnTypes, rows, rowCount: rows.length, executionTimeMs: 1 };
}

function rowsOf(n: number, make: (i: number) => unknown[]): unknown[][] {
  return Array.from({ length: n }, (_, i) => make(i));
}

describe('classifyColumnType', () => {
  // The engine reports Arrow type spellings, which is what these must handle.
  it('recognises Arrow numeric, temporal, and other types', () => {
    expect(classifyColumnType('Int64')).toBe('numeric');
    expect(classifyColumnType('Int32')).toBe('numeric');
    expect(classifyColumnType('Uint32')).toBe('numeric');
    expect(classifyColumnType('Float64')).toBe('numeric');
    expect(classifyColumnType('Decimal<18,3>')).toBe('numeric');
    expect(classifyColumnType('Date32<DAY>')).toBe('temporal');
    expect(classifyColumnType('Timestamp<MICROSECOND>')).toBe('temporal');
    expect(classifyColumnType('Utf8')).toBe('other');
    expect(classifyColumnType('Bool')).toBe('other');
  });

  it('also recognises DuckDB SQL type spellings', () => {
    expect(classifyColumnType('BIGINT')).toBe('numeric');
    expect(classifyColumnType('DOUBLE')).toBe('numeric');
    expect(classifyColumnType('DECIMAL(9,2)')).toBe('numeric');
    expect(classifyColumnType('HUGEINT')).toBe('numeric');
    expect(classifyColumnType('DATE')).toBe('temporal');
    expect(classifyColumnType('INTERVAL')).toBe('temporal');
    expect(classifyColumnType('VARCHAR')).toBe('other');
    expect(classifyColumnType('BOOLEAN')).toBe('other');
  });
});

describe('recommendChart — mapping table', () => {
  // Column types are the Arrow spellings the engine actually emits.
  it('GROUP BY + aggregate over a text key → bar (categorical)', () => {
    const result = makeResult(
      ['Pclass', 'passengers'],
      ['Utf8', 'Int64'],
      [['First', 216], ['Second', 184], ['Third', 491]],
    );
    const rec = recommendChart(result, 'SELECT Pclass, COUNT(*) AS passengers FROM titanic GROUP BY 1');
    expect(rec.kind).toBe('chart');
    if (rec.kind !== 'chart') return;
    expect(rec.spec.type).toBe('categorical');
    expect(rec.spec.xField).toBe('Pclass');
    expect(rec.spec.yFields).toEqual(['passengers']);
  });

  it('GROUP BY over a numeric key still charts as a bar when the query aggregates', () => {
    const result = makeResult(['Pclass', 'cnt'], ['Int32', 'Int64'], [[1, 216], [2, 184], [3, 491]]);
    const rec = recommendChart(result, 'SELECT Pclass, COUNT(*) AS cnt FROM titanic GROUP BY Pclass');
    expect(rec.kind).toBe('chart');
    if (rec.kind !== 'chart') return;
    expect(rec.spec.type).toBe('categorical');
    expect(rec.spec.xField).toBe('Pclass');
    expect(rec.spec.yFields).toEqual(['cnt']);
  });

  it('ORDER BY a date column → line (time series)', () => {
    const result = makeResult(
      ['period', 'total'],
      ['Date32<DAY>', 'Float64'],
      rowsOf(12, (i) => [Date.UTC(2023, i, 1), 100 + i]),
    );
    const rec = recommendChart(result, "SELECT DATE_TRUNC('month', order_date) AS period, SUM(amount) AS total FROM orders GROUP BY 1 ORDER BY 1");
    expect(rec.kind).toBe('chart');
    if (rec.kind !== 'chart') return;
    expect(rec.spec.type).toBe('time-series');
    expect(rec.spec.xField).toBe('period');
    expect(rec.spec.yFields).toEqual(['total']);
  });

  it('two raw numeric columns → scatter (correlation)', () => {
    const result = makeResult(
      ['age', 'fare'],
      ['Int64', 'Float64'],
      rowsOf(40, (i) => [20 + i, i * 1.5]),
    );
    const rec = recommendChart(result, 'SELECT age, fare FROM titanic');
    expect(rec.kind).toBe('chart');
    if (rec.kind !== 'chart') return;
    expect(rec.spec.type).toBe('correlation');
    expect(rec.spec.xField).toBe('age');
    expect(rec.spec.yFields).toEqual(['fare']);
  });

  it('single aggregate value → KPI stat, not a chart', () => {
    const result = makeResult(['correlation'], ['Float64'], [[0.42]]);
    const rec = recommendChart(result, 'SELECT CORR(age, fare) AS correlation FROM titanic');
    expect(rec.kind).toBe('kpi');
    if (rec.kind !== 'kpi') return;
    expect(rec.label).toBe('correlation');
    expect(rec.value).toBe('0.42');
  });

  it('LIMIT on wide raw rows → the data grid', () => {
    const result = makeResult(
      ['id', 'name', 'age', 'fare', 'city'],
      ['Int64', 'Utf8', 'Int64', 'Float64', 'Utf8'],
      rowsOf(100, (i) => [i, `n${i}`, i, i * 2, 'x']),
    );
    const rec = recommendChart(result, 'SELECT * FROM passengers LIMIT 100');
    expect(rec.kind).toBe('grid');
  });
});

describe('recommendChart — ambiguous & edge shapes degrade to the grid', () => {
  it('empty result → grid', () => {
    expect(recommendChart(makeResult(['x'], ['BIGINT'], [])).kind).toBe('grid');
  });

  it('one row, one text column → grid (a text scalar is not a KPI)', () => {
    expect(recommendChart(makeResult(['name'], ['VARCHAR'], [['Alice']])).kind).toBe('grid');
  });

  it('all-text result → grid', () => {
    const result = makeResult(['first', 'last'], ['VARCHAR', 'VARCHAR'], [['a', 'b'], ['c', 'd']]);
    expect(recommendChart(result, 'SELECT first, last FROM people').kind).toBe('grid');
  });

  it('too many bar categories → grid, never an illegible chart', () => {
    const result = makeResult(
      ['name', 'cnt'],
      ['VARCHAR', 'BIGINT'],
      rowsOf(200, (i) => [`c${i}`, i]),
    );
    expect(recommendChart(result, 'SELECT name, COUNT(*) AS cnt FROM t GROUP BY 1').kind).toBe('grid');
  });

  it('too many points for a scatter → grid', () => {
    const result = makeResult(
      ['a', 'b'],
      ['DOUBLE', 'DOUBLE'],
      rowsOf(6000, (i) => [i, i]),
    );
    expect(recommendChart(result, 'SELECT a, b FROM big').kind).toBe('grid');
  });

  it('two numeric columns without an aggregate hint → scatter, not bar', () => {
    const result = makeResult(['a', 'b'], ['INTEGER', 'INTEGER'], [[1, 2], [3, 4]]);
    const rec = recommendChart(result);
    expect(rec.kind).toBe('chart');
    if (rec.kind !== 'chart') return;
    expect(rec.spec.type).toBe('correlation');
  });
});

describe('availableChartTypes', () => {
  it('offers line/bar/scatter for a temporal + numeric result', () => {
    const result = makeResult(['d', 'v', 'w'], ['DATE', 'DOUBLE', 'DOUBLE'], [[0, 1, 2]]);
    expect(availableChartTypes(result)).toEqual(['time-series', 'categorical', 'correlation']);
  });

  it('offers only bar for a single category + measure', () => {
    const result = makeResult(['cat', 'v'], ['VARCHAR', 'DOUBLE'], [['a', 1]]);
    expect(availableChartTypes(result)).toEqual(['categorical']);
  });

  it('offers nothing for an all-text result', () => {
    expect(availableChartTypes(makeResult(['a', 'b'], ['VARCHAR', 'VARCHAR'], [['x', 'y']]))).toEqual([]);
  });
});

describe('specForType', () => {
  const result = makeResult(['period', 'total', 'count'], ['DATE', 'DOUBLE', 'BIGINT'], [[0, 1, 2]]);

  it('builds a spec for a picker-chosen type', () => {
    expect(specForType(result, 'time-series')?.type).toBe('time-series');
    expect(specForType(result, 'categorical')?.xField).toBe('total');
    expect(specForType(result, 'correlation')?.type).toBe('correlation');
  });

  it('returns null when the result cannot support the chosen type', () => {
    const textOnly = makeResult(['a', 'b'], ['VARCHAR', 'VARCHAR'], [['x', 'y']]);
    expect(specForType(textOnly, 'correlation')).toBeNull();
    expect(specForType(textOnly, 'time-series')).toBeNull();
  });
});

describe('buildChart', () => {
  it('shapes rows into keyed objects, coercing numbers and formatting dates', () => {
    const result = makeResult(
      ['period', 'total', 'label'],
      ['DATE', 'BIGINT', 'VARCHAR'],
      [[Date.UTC(2023, 0, 15), 100n, 'x'], [Date.UTC(2023, 1, 15), 200n, 'y']],
    );
    const data = buildChart(result);
    expect(data[0]).toEqual({ period: '2023-01-15', total: 100, label: 'x' });
    expect(data[1].total).toBe(200);
    expect(typeof data[1].total).toBe('number');
  });

  it('preserves nulls so the renderer can gap them', () => {
    const result = makeResult(['period', 'total'], ['DATE', 'DOUBLE'], [[Date.UTC(2023, 0, 1), null]]);
    expect(buildChart(result)[0].total).toBeNull();
  });
});
