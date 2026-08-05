// Builds PANEL-KEY.json — the answer key kill criterion (m) requires to
// predate the first model call (10-grounding-ladder.md: "a key written after
// seeing model output is a rationalisation, not a standard"). No model call
// in this file.
//
// Populates only what's mechanically true and independently verified: C1
// (rowCount, temporal-span per table) and C3 (the two exhaustive checks the
// mock-up states — no duplicate rows, no zero-variance columns), gated by
// `verifyStats`'s independent second computation exactly as kill criterion
// (a) requires. C2's specific curated assertions and every C4 assertion are
// product judgment calls this script has no basis to invent — no
// per-fixture mock-up exists in this repo beyond the ecommerce illustration
// in the doc itself, so those stay listed in `pendingHumanAuthoring` rather
// than being fabricated as if they were a finished spec.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine, type EvalEngine } from '../../duckdb/duckdb';
import { loadEvalDatasets } from '../../dataset/tables';
import { buildDuplicatesProbe } from '../../../src/lib/insights';
import { computeStats } from '../08-computed-facts/computeStats';
import { verifyStats } from '../08-computed-facts/verifyStats';
import type { TableRegistryEntry } from '../../../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type ClaimClass = 'C1' | 'C2' | 'C3' | 'C4' | 'C5';

export interface KeyAssertion {
  class: ClaimClass;
  assertion: string;
  truth: string | number | boolean | (string | number)[];
  author: 'app' | 'model' | 'offer' | 'none — unrepresentable';
}

export interface PanelKeyEntry {
  header: KeyAssertion[];
  structural: KeyAssertion[];
  quality: KeyAssertion[];
  behavioral: KeyAssertion[];
  offers: KeyAssertion[];
  pendingHumanAuthoring: string[];
}

export type PanelKey = Record<string, PanelKeyEntry>;

const PENDING_NOTE = [
  'C4 header assertions (domain guess, "well-suited for X/Y/Z") — no per-fixture mock-up exists to author these from; 05 territory (offer, or dropped).',
  'C2 curated assertions for structural/behavioral slots — which computed facts are notable enough to surface is a product choice, not derivable from computeStats.ts alone.',
];

async function tableHasDuplicates(engine: EvalEngine, table: TableRegistryEntry): Promise<boolean> {
  const probe = buildDuplicatesProbe(table.tableName, table.rowCount);
  const result = await engine.execute(probe.sql);
  return probe.describe(result).length > 0;
}

async function main(): Promise<void> {
  const engine = await createEvalEngine();
  const datasets = await loadEvalDatasets(engine);
  const key: PanelKey = {};

  for (const dataset of datasets) {
    const computedStats = await computeStats(engine, dataset.tables);
    // Kill criterion (a)/(m) — hard gate before the truth values are trusted.
    await verifyStats(engine, dataset.tables, computedStats);

    const header: KeyAssertion[] = [];
    const quality: KeyAssertion[] = [];

    for (const table of dataset.tables) {
      header.push({
        class: 'C1',
        assertion: `${table.tableName}.rowCount`,
        truth: table.rowCount,
        author: 'app',
      });

      const hasDuplicates = await tableHasDuplicates(engine, table);
      quality.push({
        class: 'C3',
        assertion: `${table.tableName}: no duplicate rows`,
        truth: !hasDuplicates,
        author: 'app',
      });

      const deadColumns = computedStats.filter(
        (f) => f.kind === 'dead-column' && f.entities[0] === table.tableName,
      );
      quality.push({
        class: 'C3',
        assertion: `${table.tableName}: no zero-variance columns`,
        truth: deadColumns.length === 0,
        author: 'app',
      });
    }

    for (const span of computedStats.filter((f) => f.kind === 'temporal-span')) {
      header.push({
        class: 'C1',
        assertion: span.id.replace(/^stat:/, ''),
        truth: span.values as (string | number)[],
        author: 'app',
      });
    }

    key[dataset.id] = {
      header,
      structural: [],
      quality,
      behavioral: [],
      offers: [],
      pendingHumanAuthoring: PENDING_NOTE,
    };

    console.log(`${dataset.id}: ${header.length} header assertions, ${quality.length} quality assertions`);
  }

  fs.writeFileSync(path.resolve(__dirname, 'PANEL-KEY.json'), JSON.stringify(key, null, 2));
  console.log(`\nPANEL-KEY.json written for ${Object.keys(key).length} fixtures.`);

  await engine.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
