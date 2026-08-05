// R-A — contamination screen (11-gemini-comparison-arm.md, Phase 5 riders).
// "This measures how much of each fixture's truth is recallable without any
// data at all, per fixture and per claim class." Reuses the harness's own
// a1=0/a2=CLEAR/a3=TRUE cell definition unchanged — in this project's own A1
// vocabulary, rows=0 means "no ROW evidence," not "no computed facts" (the
// COMPUTED FACTS section, which carries the real answer, is still sent at
// every rung; only ROW EVIDENCE is emptied at a1=0). That is exactly the
// row-ladder-0 / ceiling-control-0 cell already run for titanic,
// product_reviews and stock_prices — reused here rather than re-spending —
// plus one fresh N=10 run on `weather`, never exercised by the main cross.
//
// `ecommerce` is out of scope: it's a 4-table dataset and run.ts's own single-
// table assumption ("the row ladder assumes a single table") rules it out;
// extending the harness to a join is a real design change, not this rider's job.
//
// Never writes into RESULTS-*.json — its own output file, per the doc's Phase
// 5 rule ("Each rider writes to its own output file, never into RESULTS-*.json").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine } from '../../duckdb/duckdb';
import { loadEvalDatasets } from '../../dataset/tables';
import { computeStats } from '../08-computed-facts/computeStats';
import { verifyStats } from '../08-computed-facts/verifyStats';
import { rankNextActions } from '../../../src/lib/capabilities';
import {
  computeTableInsights,
  buildOfferCandidates,
  loadAllRows,
  loadPanelKey,
  runCell,
  type DatasetContext,
  type RunRecord,
} from './run';
import type { VariantCell } from './variants';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.EVAL_PROVIDER !== 'gemini') {
  throw new Error(
    'R-A is CEILING-tagged and requires the frontier instrument (doc: "the frontier model is the right ' +
      'instrument — it establishes the maximum available recall"). Run with EVAL_PROVIDER=gemini.',
  );
}

const WEATHER_CELL: VariantCell = {
  id: 'contamination-screen-0',
  block: 'row-ladder',
  a1: 0,
  a2: 'CLEAR',
  a3: 'TRUE',
  repeats: 10,
};

interface ScreenRecord {
  fixture: string;
  source: 'reused' | 'fresh';
  repeat: number;
  compliant: boolean;
  c1DisagreementCount: number;
  c2Total: number;
  c2Ok: number;
  c3OccurrenceCount: number;
  sampleLeakCount: number;
  headerText?: string;
}

function toScreenRecords(fixture: string, source: 'reused' | 'fresh', records: RunRecord[]): ScreenRecord[] {
  return records.map((r) => ({
    fixture,
    source,
    repeat: r.repeat,
    compliant: r.compliant,
    c1DisagreementCount: r.c1DisagreementCount,
    c2Total: r.c2Total,
    c2Ok: r.c2Ok,
    c3OccurrenceCount: r.c3OccurrenceCount,
    sampleLeakCount: r.sampleLeakCount,
    headerText: r.headerText,
  }));
}

function summarize(records: ScreenRecord[]): Record<string, unknown> {
  const compliant = records.filter((r) => r.compliant);
  const n = compliant.length;
  const sum = (f: (r: ScreenRecord) => number) => compliant.reduce((s, r) => s + f(r), 0);
  return {
    n,
    c1DisagreementRate: n ? sum((r) => r.c1DisagreementCount) / n : null,
    c2GroundingRate: sum((r) => r.c2Total) > 0 ? sum((r) => r.c2Ok) / sum((r) => r.c2Total) : null,
    c3OccurrenceTotal: sum((r) => r.c3OccurrenceCount),
    sampleLeakTotal: sum((r) => r.sampleLeakCount),
    headerSamples: compliant.slice(0, 3).map((r) => r.headerText),
  };
}

async function main(): Promise<void> {
  const existingPath = path.resolve(__dirname, 'RESULTS-gemini.json');
  const existing = JSON.parse(fs.readFileSync(existingPath, 'utf-8')) as { records: RunRecord[] };

  const reused: Record<string, ScreenRecord[]> = {
    titanic: toScreenRecords(
      'titanic',
      'reused',
      existing.records.filter((r) => r.dataset === 'titanic' && r.cellId === 'row-ladder-0'),
    ),
    product_reviews: toScreenRecords(
      'product_reviews',
      'reused',
      existing.records.filter((r) => r.dataset === 'product_reviews' && r.cellId === 'row-ladder-0'),
    ),
    stock_prices: toScreenRecords(
      'stock_prices',
      'reused',
      existing.records.filter((r) => r.dataset === 'stock_prices' && r.cellId === 'ceiling-control-0'),
    ),
  };

  console.log('reused rows=0/CLEAR/TRUE calls: titanic', reused.titanic.length, 'product_reviews', reused.product_reviews.length, 'stock_prices', reused.stock_prices.length);
  console.log('running weather fresh (N=10, gemini)...');

  const engine = await createEvalEngine();
  const allDatasets = await loadEvalDatasets(engine);
  const panelKey = loadPanelKey();

  const dataset = allDatasets.find((d) => d.id === 'weather');
  if (!dataset) throw new Error('weather fixture not found');
  if (dataset.tables.length !== 1) throw new Error('weather: expected a single table');
  const [table] = dataset.tables;

  const computedStats = await computeStats(engine, dataset.tables);
  await verifyStats(engine, dataset.tables, computedStats); // kill criterion (a)

  const tableInsights = await computeTableInsights(engine, dataset.tables);
  const offerCandidates = buildOfferCandidates(rankNextActions(dataset.tables, tableInsights));
  const allRows = await loadAllRows(engine, table);
  const vocabulary = [table.tableName, ...(table.columns ?? []).map((c) => c.name)];
  const panelKeyEntry = panelKey.weather;
  if (!panelKeyEntry) throw new Error('PANEL-KEY.json has no entry for weather');

  const ctx: DatasetContext = { datasetId: 'weather', table, tables: dataset.tables, computedStats, panelKeyEntry, offerCandidates, allRows, vocabulary };
  const weatherRecords = await runCell(ctx, WEATHER_CELL);
  await engine.close();

  const byFixture: Record<string, ScreenRecord[]> = { ...reused, weather: toScreenRecords('weather', 'fresh', weatherRecords) };
  const summary = Object.fromEntries(Object.entries(byFixture).map(([k, v]) => [k, summarize(v)]));

  const out = {
    ranAt: new Date().toISOString(),
    rider: 'R-A — contamination screen (11-gemini-comparison-arm.md, Phase 5)',
    note:
      'Cell is a1=0/a2=CLEAR/a3=TRUE — this harness\'s "no row evidence" condition (COMPUTED FACTS still ' +
      'carries the real answer at every rung; only ROW EVIDENCE is emptied at a1=0). titanic/product_reviews/' +
      'stock_prices reuse the main cross\'s existing calls at this exact cell (row-ladder-0 / ceiling-control-0) ' +
      'rather than re-spending. weather is a fresh N=10 run, never exercised by the main cross. ecommerce is ' +
      'excluded: the harness\'s single-table assumption does not hold for its 4-table schema.',
    byFixture,
    summary,
  };
  fs.writeFileSync(path.resolve(__dirname, 'CONTAMINATION-SCREEN-gemini.json'), JSON.stringify(out, null, 2));

  console.log('\n=== R-A summary (compliant calls only) ===');
  for (const [fixture, s] of Object.entries(summary)) console.log(`${fixture}:`, JSON.stringify(s));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
