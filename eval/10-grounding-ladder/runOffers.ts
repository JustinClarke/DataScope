// Phase 1's offers arm (10-grounding-ladder.md, "Three measurement surfaces,
// one substrate"). 05's kill criterion (b) promoted to a standing instrument:
// an offer whose SQL errors or returns zero rows is that path's version of a
// fabrication, and it costs nothing to detect. **No model is involved** —
// `rankNextActions` is deterministic today, which is exactly why this arm can
// produce a real result while the rig is off, and why it doubles as the control
// for whether letting a model near the panel buys anything (kill criterion l).
//
// It also carries the false-reject half of the trend-generalisation guard's
// number (doc, "Extend the phrasing guard to trend generalisation, and measure
// the cost"): the app's own deterministic statements — computed facts, insight
// descriptions, offer verbs and their evidence — are honest by construction, so
// every rejection over that corpus is a false reject. `run.ts` measures the
// other half (how often model output trips it). The guard does not ship on the
// strength of one of those numbers alone.
//
// `npm run eval:grounding-ladder:offers`. Writes OFFERS-RESULTS.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine, type EvalEngine } from '../duckdb/duckdb';
import { loadEvalDatasets } from '../dataset/tables';
import {
  buildInsightProbes,
  idExclusionCandidates,
  nullPatternCandidates,
  rankInsights,
  type TableInsights,
} from '../../src/lib/insights';
import { rankNextActions } from '../../src/lib/capabilities';
import {
  passesPhrasingGuard,
  passesTrendGeneralisationGuard,
  TREND_GENERALISATION_TERMS,
} from '../../src/lib/producerValidators';
import { computeStats } from '../08-computed-facts/computeStats';
import { verifyStats } from '../08-computed-facts/verifyStats';
import type { RankedAction, TableRegistryEntry } from '../../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** `ok` — SQL ran and returned ≥1 row (kill criterion l's pass condition).
 * `empty` and `error` are this surface's two fabrication shapes. `no-sql` is
 * neither: a schema-provenance FactRef carries `sql: ''` by contract (it is read
 * off the registry, never queried), so there is nothing to execute and nothing
 * to fabricate — counted apart rather than scored as a pass or a failure. */
type OfferStatus = 'ok' | 'empty' | 'error' | 'no-sql';

interface OfferRecord {
  dataset: string;
  rank: number;
  verb: string;
  module: string;
  tab?: string;
  provenance: string;
  score: number;
  sql: string;
  status: OfferStatus;
  rowCount: number;
  error?: string;
  verbPassesPhrasingGuard: boolean;
  verbPassesTrendGuard: boolean;
  evidenceStatement: string;
}

async function computeTableInsights(engine: EvalEngine, tables: TableRegistryEntry[]): Promise<TableInsights[]> {
  const out: TableInsights[] = [];
  for (const table of tables) {
    const columns = table.columns ?? [];
    const syntactic = [...nullPatternCandidates(columns, table.tableName), ...idExclusionCandidates(columns, table.tableName)];
    const probes = buildInsightProbes(table.tableName, columns, table.rowCount);
    const probed = await Promise.all(probes.map((p) => engine.execute(p.sql).then((r) => p.describe(r))));
    out.push({ table, insights: rankInsights([...syntactic, ...probed.flat()]) });
  }
  return out;
}

async function executeOffer(engine: EvalEngine, action: RankedAction, dataset: string, rank: number): Promise<OfferRecord> {
  const base = {
    dataset,
    rank,
    verb: action.verb,
    module: action.module,
    tab: action.tab,
    provenance: action.evidence.provenance,
    score: action.score,
    sql: action.evidence.sql,
    verbPassesPhrasingGuard: passesPhrasingGuard(action.verb),
    verbPassesTrendGuard: passesTrendGeneralisationGuard(action.verb),
    evidenceStatement: action.evidence.statement,
  };
  if (action.evidence.sql === '') return { ...base, status: 'no-sql', rowCount: 0 };
  try {
    const result = await engine.execute(action.evidence.sql);
    return { ...base, status: result.rows.length > 0 ? 'ok' : 'empty', rowCount: result.rows.length };
  } catch (err) {
    return { ...base, status: 'error', rowCount: 0, error: String(err) };
  }
}

/** Every statement the app's own deterministic producers emit for this dataset
 * — honest by construction, so a guard rejection here is a false reject. */
interface GuardCorpusEntry {
  dataset: string;
  source: 'computed-fact' | 'insight' | 'offer-verb' | 'offer-evidence';
  text: string;
}

async function main(): Promise<void> {
  const engine = await createEvalEngine();
  const datasets = await loadEvalDatasets(engine);

  const offers: OfferRecord[] = [];
  const corpus: GuardCorpusEntry[] = [];

  for (const dataset of datasets) {
    const computedStats = await computeStats(engine, dataset.tables);
    await verifyStats(engine, dataset.tables, computedStats); // kill criterion (a) — same hard gate as the panel arm
    const tableInsights = await computeTableInsights(engine, dataset.tables);
    const actions = rankNextActions(dataset.tables, tableInsights);

    for (const f of computedStats) corpus.push({ dataset: dataset.id, source: 'computed-fact', text: f.statement });
    for (const ti of tableInsights) for (const i of ti.insights) corpus.push({ dataset: dataset.id, source: 'insight', text: i.description });

    for (const [i, action] of actions.entries()) {
      corpus.push({ dataset: dataset.id, source: 'offer-verb', text: action.verb });
      corpus.push({ dataset: dataset.id, source: 'offer-evidence', text: action.evidence.statement });
      offers.push(await executeOffer(engine, action, dataset.id, i + 1));
    }

    const own = offers.filter((o) => o.dataset === dataset.id);
    console.log(
      `${dataset.id}: ${own.length} offers — ok=${own.filter((o) => o.status === 'ok').length} ` +
        `empty=${own.filter((o) => o.status === 'empty').length} error=${own.filter((o) => o.status === 'error').length} ` +
        `no-sql=${own.filter((o) => o.status === 'no-sql').length}`,
    );
    for (const o of own) console.log(`  [${o.status}${o.status === 'ok' ? ` ${o.rowCount} rows` : ''}] ${o.verb}`);
  }

  const executable = offers.filter((o) => o.status !== 'no-sql');
  const phrasingRejects = offers.filter((o) => !o.verbPassesPhrasingGuard);
  const trendRejects = corpus.filter((e) => !passesTrendGeneralisationGuard(e.text));
  const shippedGuardRejects = corpus.filter((e) => !passesPhrasingGuard(e.text));

  const summary = {
    datasets: datasets.length,
    offers: offers.length,
    executable: executable.length,
    ok: executable.filter((o) => o.status === 'ok').length,
    empty: executable.filter((o) => o.status === 'empty').length,
    error: executable.filter((o) => o.status === 'error').length,
    noSql: offers.length - executable.length,
    /** Kill criterion (l): every executable offer runs and returns ≥1 row, and
     * every verb clears the shipped phrasing guard. */
    killCriterionL:
      executable.length > 0 && executable.every((o) => o.status === 'ok') && phrasingRejects.length === 0,
    verbPhrasingGuardRejects: phrasingRejects.map((o) => o.verb),
    trendGuard: {
      terms: TREND_GENERALISATION_TERMS,
      termCount: TREND_GENERALISATION_TERMS.length,
      corpusSize: corpus.length,
      falseRejects: trendRejects.length,
      falseRejectRate: corpus.length === 0 ? 0 : trendRejects.length / corpus.length,
      rejected: trendRejects,
    },
    /** The shipped guard measured over the same corpus, as the comparison the
     * trend guard's number is only meaningful against. */
    shippedPhrasingGuard: {
      corpusSize: corpus.length,
      falseRejects: shippedGuardRejects.length,
      rejected: shippedGuardRejects,
    },
  };

  fs.writeFileSync(
    path.resolve(__dirname, 'OFFERS-RESULTS.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), model: null, summary, offers }, null, 2),
  );

  console.log('\n=== Offers arm ===');
  console.log(`offers: ${summary.offers} (${summary.executable} executable, ${summary.noSql} schema-only/no SQL)`);
  console.log(`execution: ok=${summary.ok} empty=${summary.empty} error=${summary.error}`);
  console.log(`verb phrasing-guard rejects: ${phrasingRejects.length}`);
  console.log(`kill criterion (l): ${summary.killCriterionL ? 'PASS' : 'FAIL'}`);
  console.log(
    `trend-generalisation guard (unshipped): ${summary.trendGuard.falseRejects}/${corpus.length} deterministic statements rejected ` +
      `(${(summary.trendGuard.falseRejectRate * 100).toFixed(2)}% false-reject), ${TREND_GENERALISATION_TERMS.length} terms`,
  );
  console.log(`shipped phrasing guard over the same corpus: ${shippedGuardRejects.length}/${corpus.length}`);

  await engine.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
