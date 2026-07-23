// Synthesis eval gate (D56-style, D40 pattern) — dev/CI only, never product
// runtime. Usage: `npm run eval:synthesis` (needs the staging Worker deployed;
// override the endpoint with VITE_EDGE_SYNTHESIS).
//
// Measures whether the edge-composed opening narrative *beats* the
// deterministic one over a labeled set: one item per §14 sample dataset, each
// built by the exact product pipeline (profile → classify → insight probes →
// `buildDatasetVerdict`) and sent through the exact product client
// (`requestSynthesis`, seam validators included) — no second, harness-only
// path (D58).
//
// A composed headline "beats" the deterministic template only when the seam
// validators accepted it (so every non-prose field and the D45 honesty guard
// held), every numeric token of the deterministic claim survived verbatim, and
// the prose actually differs from the template (an echo is not a win). The
// action slice counts as upgraded when the validator accepted it AND the model
// actually re-ordered or re-phrased something.
//
// Thresholds (declared here, when the harness was built — the D40 rule):
// headline-win ≥ 80% AND actions-upgraded ≥ 80% over the set. Failing either
// leaves the deterministic Blueprint as the product: flip SYNTHESIS_KILL_SWITCH
// on (or hold the ship) — the gate is on the feature, never the tier.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine } from '../duckdb/duckdb';
import { loadEvalDatasets, type EvalDataset } from '../dataset/tables';
import {
  buildInsightProbes,
  idExclusionCandidates,
  nullPatternCandidates,
  rankInsights,
  type TableInsights,
} from '../../src/lib/insights';
import { buildDatasetVerdict } from '../../src/lib/dossier';
import { requestSynthesis } from '../../src/services/synthesis';
import type { EvalEngine } from '../duckdb/duckdb';
import type { FactRef, RankedAction } from '../../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENDPOINT =
  process.env.VITE_EDGE_SYNTHESIS ?? 'https://datascope-edge-staging.justinclarke.workers.dev/synthesis';

/** The product's insight path over the eval engine — same probes, same ranking. */
async function computeTableInsights(engine: EvalEngine, dataset: EvalDataset): Promise<TableInsights[]> {
  const out: TableInsights[] = [];
  for (const table of dataset.tables) {
    const columns = table.columns ?? [];
    const syntactic = [
      ...nullPatternCandidates(columns, table.tableName),
      ...idExclusionCandidates(columns, table.tableName),
    ];
    const probes = buildInsightProbes(table.tableName, columns, table.rowCount);
    const probed = await Promise.all(
      probes.map((probe) => engine.execute(probe.sql).then((result) => probe.describe(result))),
    );
    out.push({ table, insights: rankInsights([...syntactic, ...probed.flat()]) });
  }
  return out;
}

/** Numeric tokens of the deterministic claim ("1,200", "42%", …) — each must survive verbatim. */
function numericTokens(statement: string): string[] {
  return statement.match(/\d[\d,.]*%?/g) ?? [];
}

interface ItemScore {
  dataset: string;
  served: boolean;
  headlineWin: boolean;
  actionsUpgraded: boolean;
  degradeReason?: string;
  baselineHeadline: string;
  composedHeadline?: string;
}

function scoreItem(
  dataset: string,
  baseline: { headlineFact: FactRef; actions: RankedAction[] },
  upgrade: Awaited<ReturnType<typeof requestSynthesis>>,
): ItemScore {
  const headlineAi = upgrade.headlineFact.source === 'ai';
  const actionsAi = upgrade.actions.source === 'ai';
  const composed = upgrade.headlineFact.value.statement;

  const numbersKept = numericTokens(baseline.headlineFact.statement).every((t) => composed.includes(t));
  const differs = composed !== baseline.headlineFact.statement;
  const reordered =
    upgrade.actions.value.some((a, i) => a.verb !== baseline.actions[i]?.verb) ||
    upgrade.actions.value.map((a) => a.evidence.sql).join('|') !==
      baseline.actions.map((a) => a.evidence.sql).join('|');

  return {
    dataset,
    served: headlineAi || actionsAi,
    headlineWin: headlineAi && numbersKept && differs,
    actionsUpgraded: actionsAi && reordered,
    degradeReason: upgrade.headlineFact.degradeReason ?? upgrade.actions.degradeReason,
    baselineHeadline: baseline.headlineFact.statement,
    composedHeadline: headlineAi ? composed : undefined,
  };
}

async function main() {
  const engine = await createEvalEngine();
  const datasets = await loadEvalDatasets(engine);
  const scores: ItemScore[] = [];

  for (const dataset of datasets) {
    const tableInsights = await computeTableInsights(engine, dataset);
    const verdict = buildDatasetVerdict({
      datasetLabel: dataset.id,
      tables: dataset.tables,
      tableInsights,
      timeCoverage: [],
      profiledAt: new Date().toISOString(),
    });
    const baseline = { headlineFact: verdict.headlineFact, actions: verdict.actions };

    const upgrade = await requestSynthesis(
      { aiMode: 'cloud', sessionId: crypto.randomUUID(), tables: dataset.tables, baseline },
      { endpoint: ENDPOINT, timeoutMs: 20_000 },
    );
    const score = scoreItem(dataset.id, baseline, upgrade);
    scores.push(score);
    console.log(
      `${dataset.id}: served=${score.served} headlineWin=${score.headlineWin} actionsUpgraded=${score.actionsUpgraded}` +
        (score.degradeReason ? ` degrade=${score.degradeReason}` : ''),
    );
    if (score.composedHeadline) {
      console.log(`  det: ${score.baselineHeadline}`);
      console.log(`  ai:  ${score.composedHeadline}`);
    }
  }

  const n = scores.length;
  const headlineWins = scores.filter((s) => s.headlineWin).length;
  const actionUpgrades = scores.filter((s) => s.actionsUpgraded).length;
  const headlineRate = headlineWins / n;
  const actionsRate = actionUpgrades / n;
  const pass = headlineRate >= 0.8 && actionsRate >= 0.8;

  console.log(
    `\nheadline-win ${headlineWins}/${n} (${(headlineRate * 100).toFixed(0)}%) · ` +
      `actions-upgraded ${actionUpgrades}/${n} (${(actionsRate * 100).toFixed(0)}%) · ` +
      `gate (≥80% both): ${pass ? 'PASS' : 'FAIL'}`,
  );

  fs.writeFileSync(
    path.resolve(__dirname, 'SYNTHESIS-EVAL-RESULTS.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), endpoint: ENDPOINT, scores, headlineRate, actionsRate, pass }, null, 2),
  );
  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
