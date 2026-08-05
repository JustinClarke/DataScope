import { createEvalEngine, type EvalEngine } from '../../duckdb/duckdb';
import { loadEvalDatasets } from '../../dataset/tables';
import { buildPassport } from '../11-evidence-loop/passport';
import type { DatasetPassport } from './contracts';

/**
 * Every §14 manifest table (`loadEvalDatasets` loads all of them, not just ecommerce). Dropped
 * defensively before each load: this repo's test suites normally run one experiment's directory
 * per `vitest run` invocation, but this directory has several files that each build their own
 * fixture engine, and the underlying DuckDB-wasm Node binding does not isolate catalog state
 * across separate `createEvalEngine()` calls in the same process.
 */
const MANIFEST_TABLES = ['titanic', 'stock_prices', 'weather', 'product_reviews', 'customers', 'products', 'orders', 'order_items'] as const;

export async function createEcommerceFixture(): Promise<{ engine: EvalEngine; passport: DatasetPassport }> {
  const engine = await createEvalEngine();
  for (const table of MANIFEST_TABLES) {
    await engine.execute(`DROP TABLE IF EXISTS "${table}"`);
  }
  const dataset = (await loadEvalDatasets(engine)).find((candidate) => candidate.id === 'ecommerce');
  if (!dataset) throw new Error('ecommerce fixture missing');
  const passport = await buildPassport(engine, dataset.id, dataset.tables);
  return { engine, passport };
}
