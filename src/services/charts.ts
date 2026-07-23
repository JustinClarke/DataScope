// Chart service: the thin wrapper over the pure chartMapper, plus a one-off
// query runner for the "open as chart" actions that need to execute a query
// and chart its result outside the SQL playground's single-query panel.
import type { ChartRecommendation, ChartSpec, QueryResult } from '../types';
import { buildChart as buildChartData, recommendChart as recommend } from '../lib/chartMapper';

export function recommendChart(result: QueryResult, sql?: string): ChartRecommendation {
  return recommend(result, sql);
}

export function buildChart(result: QueryResult, spec: ChartSpec): Array<Record<string, unknown>> {
  return buildChartData(result, spec);
}

type EngineModule = typeof import('../workers/duckdb.worker');
let engineModule: Promise<EngineModule> | null = null;
function loadEngine(): Promise<EngineModule> {
  if (!engineModule) engineModule = import('../workers/duckdb.worker');
  return engineModule;
}

/**
 * Execute a query straight against the engine for a chart preview. Bypasses
 * the query store the SQL playground drives (a feed or suggestion chart must
 * not clobber the playground's current result), same direct-engine pattern as
 * services/insights.ts and services/profiling.ts.
 */
export async function runChartQuery(sql: string): Promise<QueryResult> {
  const engine = await loadEngine();
  return engine.duckDBEngine.execute(sql);
}
