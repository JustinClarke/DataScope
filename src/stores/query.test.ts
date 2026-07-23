import { beforeEach, describe, expect, it } from 'vitest';
import { useQueryStore } from './query';
import type { ChartSpec, QueryResult } from '../types';

const result: QueryResult = {
  columnNames: ['id'],
  columnTypes: ['BIGINT'],
  rows: [[1]],
  rowCount: 1,
  executionTimeMs: 5,
};

const chart: ChartSpec = {
  type: 'distribution',
  title: 'id spread',
  xField: 'id',
  yFields: [],
};

beforeEach(() => {
  useQueryStore.setState({ sql: '', status: 'idle', result: null, error: null, history: [], charts: [] });
});

describe('query store', () => {
  it('queryStarted marks the query running and clears prior error', () => {
    useQueryStore.getState().queryFailed('boom');
    useQueryStore.getState().queryStarted('SELECT 1');

    const state = useQueryStore.getState();
    expect(state.sql).toBe('SELECT 1');
    expect(state.status).toBe('running');
    expect(state.error).toBeNull();
  });

  it('querySucceeded stores the result and prepends history', () => {
    useQueryStore.getState().queryStarted('SELECT 1');
    useQueryStore.getState().querySucceeded(result);

    const state = useQueryStore.getState();
    expect(state.status).toBe('success');
    expect(state.result).toEqual(result);
    expect(state.history).toHaveLength(1);
    expect(state.history[0].sql).toBe('SELECT 1');
    expect(state.history[0].result).toEqual(result);
  });

  it('queryFailed records the error and prepends history without a result', () => {
    useQueryStore.getState().queryStarted('SELECT bad');
    useQueryStore.getState().queryFailed('syntax error');

    const state = useQueryStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toBe('syntax error');
    expect(state.history[0].error).toBe('syntax error');
    expect(state.result).toBeNull();
  });

  it('newest history entry is always first', () => {
    useQueryStore.getState().queryStarted('SELECT 1');
    useQueryStore.getState().querySucceeded(result);
    useQueryStore.getState().queryStarted('SELECT 2');
    useQueryStore.getState().querySucceeded({ ...result, rowCount: 2 });

    const history = useQueryStore.getState().history;
    expect(history).toHaveLength(2);
    expect(history[0].sql).toBe('SELECT 2');
    expect(history[1].sql).toBe('SELECT 1');
  });

  it('addChart/removeChart manage the chart list by index', () => {
    useQueryStore.getState().addChart(chart);
    expect(useQueryStore.getState().charts).toEqual([chart]);

    useQueryStore.getState().removeChart(0);
    expect(useQueryStore.getState().charts).toEqual([]);
  });

  it('clearResult resets to idle without touching history', () => {
    useQueryStore.getState().queryStarted('SELECT 1');
    useQueryStore.getState().querySucceeded(result);
    useQueryStore.getState().clearResult();

    const state = useQueryStore.getState();
    expect(state.result).toBeNull();
    expect(state.status).toBe('idle');
    expect(state.history).toHaveLength(1);
  });
});
