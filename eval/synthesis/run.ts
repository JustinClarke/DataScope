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
import { buildStructuralFacts } from '../../src/lib/structuralFacts';
import { requestSynthesis } from '../../src/services/synthesis';
import {
  SYNTHESIS_SYSTEM_PROMPT,
  parseModelAnswer,
  sliceFromAnswer,
  synthesisUserPrompt,
} from '../../edge/ai/synthesisProvider';
import { WIDENED_V1_SYSTEM_PROMPT, WIDENED_V2_SYSTEM_PROMPT } from './prompts';
import type { EvalEngine } from '../duckdb/duckdb';
import type { FactRef, RankedAction } from '../../src/types';
import type { AiRouterRequest, AiRouterResponse, SynthesisRequest } from '../../edge/protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENDPOINT =
  process.env.VITE_EDGE_SYNTHESIS ?? 'https://datascope-edge-staging.justinclarke.workers.dev/synthesis';
const AI_ROUTER_ENDPOINT =
  process.env.VITE_EDGE_AI_ROUTER ?? 'https://datascope-edge-staging.justinclarke.workers.dev/ai-router';
// The BYOK leg (Makefile's ollama-start): the same OpenAI-compatible endpoint
// `edge/ai/byok.ts` hardcodes as its pass-through target. This is a *third*
// leg alongside the cloud (Workers AI) one above — a remote 14B model over
// the BYOK seam, NOT the ADR-007 in-browser WebLLM local rung (kill
// criterion (c), still unrun). Informational only, like the prompt-variant
// axis itself.
const OLLAMA_CHAT_URL = process.env.OLLAMA_CHAT_URL ?? 'http://100.126.157.97:11434/v1/chat/completions';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:14b';

// S0 Probe A — the formal method (00-synthesis-and-limits-probe.md): does a
// widened system prompt reach §4's narrative by *composing* facts it was
// given, still inside the ADR-010 seam (`{headline, actions}`, never free
// prose)? The prompts themselves live in prompts.ts (a side-effect-free
// module) so other harness arms can import them without pulling in this
// file's own executable `main()` below.
interface PromptVariant {
  id: string;
  /** `undefined` → the real deployed `/synthesis` endpoint (production,
   * unmodified). A string routes through the open `ai-router` endpoint with
   * this substitute system prompt instead — same Worker, no new deploy, per
   * the probe doc's method (the fixed endpoint can't carry a different
   * prompt without a redeploy this probe explicitly avoids). */
  systemPromptOverride?: string;
}

const VARIANTS: PromptVariant[] = [
  { id: 'production' },
  { id: 'widened-v1-domain-and-dates', systemPromptOverride: WIDENED_V1_SYSTEM_PROMPT },
  { id: 'widened-v2-suited-for', systemPromptOverride: WIDENED_V2_SYSTEM_PROMPT },
];

/** Routes a `requestSynthesis` call meant for the fixed `/synthesis` endpoint
 * through the open `ai-router` endpoint instead, with `systemPrompt` in place
 * of the production one — then parses and reassembles the reply with the
 * exact same product functions (`parseModelAnswer`, `sliceFromAnswer`) so
 * `requestSynthesis`'s own seam validators run on the result unmodified (D58:
 * no second, harness-only validation path). */
function makeVariantFetch(systemPrompt: string): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as SynthesisRequest;
    const routerReq: AiRouterRequest = {
      sessionId: request.sessionId,
      routing: 'free-tier-first',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: synthesisUserPrompt(request) },
      ],
      tools: [],
      stream: false,
    };
    const res = await fetch(AI_ROUTER_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(routerReq),
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'ai-down' }), { status: res.status });
    }
    const body = (await res.json()) as AiRouterResponse;
    const text = body.turn.calls.length === 0 ? body.turn.text : '';
    try {
      const answer = parseModelAnswer(text, request.baseline.actions.length);
      return new Response(JSON.stringify(sliceFromAnswer(request, answer)), { status: 200 });
    } catch (err) {
      // Out-of-contract model output (not a validator rejection — that happens
      // one layer up, inside `requestSynthesis`). Surfaced as `ai-down` so the
      // harness's normal degrade path handles it; the parse failure itself is
      // still visible via console output for the hand audit.
      console.error(`  [parse failure] ${String(err)}`);
      return new Response(JSON.stringify({ error: 'ai-down' }), { status: 502 });
    }
  }) as typeof fetch;
}

/** Same contract as `makeVariantFetch`, but bypasses the Cloudflare Worker
 * entirely and hits the Ollama server's OpenAI-compatible chat endpoint
 * directly — the identical target `edge/ai/byok.ts`'s BYOK pass-through
 * hardcodes, called straight from this dev machine's network rather than
 * through a deployed Worker (Ollama's Tailscale address isn't reachable from
 * Cloudflare's edge). Parsed and reassembled with the exact same product
 * functions as every other leg (D58: no second, harness-only path). */
function makeOllamaFetch(systemPrompt: string): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as SynthesisRequest;
    const res = await fetch(OLLAMA_CHAT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: synthesisUserPrompt(request) },
        ],
      }),
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'ai-down' }), { status: res.status });
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content ?? '';
    try {
      const answer = parseModelAnswer(text, request.baseline.actions.length);
      return new Response(JSON.stringify(sliceFromAnswer(request, answer)), { status: 200 });
    } catch (err) {
      console.error(`  [ollama parse failure] ${String(err)}`);
      return new Response(JSON.stringify({ error: 'ai-down' }), { status: 502 });
    }
  }) as typeof fetch;
}

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

interface VariantResult {
  variant: string;
  dataset: string;
  score: ItemScore;
  facts: ReturnType<typeof buildStructuralFacts>;
}

async function main() {
  const engine = await createEvalEngine();
  const datasets = await loadEvalDatasets(engine);
  const scores: ItemScore[] = [];
  const variantResults: VariantResult[] = [];

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
    const facts = buildStructuralFacts(dataset.tables);

    for (const variant of VARIANTS) {
      const upgrade = await requestSynthesis(
        { aiMode: 'cloud', sessionId: crypto.randomUUID(), tables: dataset.tables, baseline },
        variant.systemPromptOverride
          ? { endpoint: ENDPOINT, timeoutMs: 20_000, fetchImpl: makeVariantFetch(variant.systemPromptOverride) }
          : { endpoint: ENDPOINT, timeoutMs: 20_000 },
      );
      const score = scoreItem(dataset.id, baseline, upgrade);
      variantResults.push({ variant: variant.id, dataset: dataset.id, score, facts });

      if (variant.id === 'production') {
        // The D40 gate below is computed from this variant only — unchanged
        // from before the prompt-variant axis existed.
        scores.push(score);
        console.log(
          `${dataset.id}: served=${score.served} headlineWin=${score.headlineWin} actionsUpgraded=${score.actionsUpgraded}` +
            (score.degradeReason ? ` degrade=${score.degradeReason}` : ''),
        );
      } else {
        console.log(
          `[${variant.id}] ${dataset.id}: served=${score.served} headlineWin=${score.headlineWin} ` +
            `actionsUpgraded=${score.actionsUpgraded}` + (score.degradeReason ? ` degrade=${score.degradeReason}` : ''),
        );
      }
      if (score.composedHeadline) {
        console.log(`  det: ${score.baselineHeadline}`);
        console.log(`  ai:  ${score.composedHeadline}`);
      }
    }

    // BYOK leg (Makefile's ollama-start) — the same three prompts, scored the
    // same way, served by qwen2.5-coder:14b over the BYOK seam instead of
    // Workers AI. Informational only: never feeds `scores`/the D40 gate.
    for (const variant of VARIANTS) {
      const upgrade = await requestSynthesis(
        { aiMode: 'cloud', sessionId: crypto.randomUUID(), tables: dataset.tables, baseline },
        { endpoint: ENDPOINT, timeoutMs: 60_000, fetchImpl: makeOllamaFetch(
          variant.systemPromptOverride ?? SYNTHESIS_SYSTEM_PROMPT,
        ) },
      );
      const score = scoreItem(dataset.id, baseline, upgrade);
      variantResults.push({ variant: `${variant.id}__ollama`, dataset: dataset.id, score, facts });
      console.log(
        `[${variant.id}__ollama] ${dataset.id}: served=${score.served} headlineWin=${score.headlineWin} ` +
          `actionsUpgraded=${score.actionsUpgraded}` + (score.degradeReason ? ` degrade=${score.degradeReason}` : ''),
      );
      if (score.composedHeadline) {
        console.log(`  det: ${score.baselineHeadline}`);
        console.log(`  ai:  ${score.composedHeadline}`);
      }
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

  // S0 Probe A — informational, not gated. Kill criterion (a) is the win-rate
  // comparison below AND zero validator rejections; criterion (b) needs a hand
  // audit of every composedHeadline against the `facts` recorded alongside it
  // (SYNTHESIS-VARIANT-RESULTS.json) — not automatable, per the probe doc.
  console.log('\n--- S0 Probe A: prompt-variant axis (informational — see 00-synthesis-and-limits-probe.md) ---');
  const allVariantIds = [...VARIANTS.map((v) => v.id), ...VARIANTS.map((v) => `${v.id}__ollama`)];
  const variantSummary = allVariantIds.map((variantId) => {
    const rows = variantResults.filter((r) => r.variant === variantId);
    const wins = rows.filter((r) => r.score.headlineWin).length;
    const upgrades = rows.filter((r) => r.score.actionsUpgraded).length;
    const validatorRejections = rows.filter((r) => r.score.degradeReason === 'ai-rejected').length;
    const summary = {
      variant: variantId,
      headlineWinRate: wins / rows.length,
      actionsUpgradedRate: upgrades / rows.length,
      validatorRejections,
    };
    console.log(
      `${summary.variant}: headline-win ${(summary.headlineWinRate * 100).toFixed(0)}% · ` +
        `actions-upgraded ${(summary.actionsUpgradedRate * 100).toFixed(0)}% · ` +
        `validator-rejections ${summary.validatorRejections}`,
    );
    return summary;
  });

  fs.writeFileSync(
    path.resolve(__dirname, 'SYNTHESIS-VARIANT-RESULTS.json'),
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        aiRouterEndpoint: AI_ROUTER_ENDPOINT,
        ollamaEndpoint: OLLAMA_CHAT_URL,
        ollamaModel: OLLAMA_MODEL,
        variantSummary,
        variantResults,
      },
      null,
      2,
    ),
  );

  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
