// Harness for the generate-then-verify synthesis candidate
// (02-generate-then-verify.md, approach 02 of _implementation/_misc/_ideation/ai
// architecture experimentation/). The model writes free prose under the
// widened prompts (eval/synthesis/prompts.ts's WIDENED_V1/V2_SYSTEM_PROMPT —
// no new prompt is authored here), and groundingCheck.ts is applied to the
// composed headline after the real seam has already run. A statement the
// check rejects is logged as `groundingRejected` but NOT what determines
// `served`/`degradeReason` below — this harness measures the check's
// judgment against the seam's, it does not wire the check into the seam
// itself (that would require a product code change, out of scope for an
// ideation-folder harness; see the doc's own "What to build").
//
// Usage: `npm run eval:generate-then-verify` (needs `make ollama-start`).
//
// Reuses the real seam end to end: `requestSynthesis` still applies
// `narrationValidator`/`rankedActionValidator` (D58 — no second, harness-only
// validation path). Only the fetchImpl is written fresh; dataset loading,
// insight probes, the Verdict builder, structural facts, and the widened
// prompts themselves are all imported unchanged.
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
import { synthesisUserPrompt, parseModelAnswer, sliceFromAnswer } from '../../edge/ai/synthesisProvider';
import { WIDENED_V1_SYSTEM_PROMPT, WIDENED_V2_SYSTEM_PROMPT } from '../synthesis/prompts';
import { allowedMentions, groundingCheck, CLOSURE_RULES } from './groundingCheck';
import type { EvalEngine } from '../duckdb/duckdb';
import type { SynthesisRequest } from '../../edge/protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA_CHAT_URL = process.env.OLLAMA_CHAT_URL ?? 'http://100.126.157.97:11434/v1/chat/completions';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:14b';
// Never actually fetched — same inert-endpoint pattern as
// eval/01-phrase-library/run.ts; requestSynthesis's deps require an endpoint
// string but the fetchImpl below replaces the transport entirely.
const INERT_ENDPOINT = 'unused://generate-then-verify';
const REPEATS = 5;

type Variant = 'widened-v1-domain-and-dates' | 'widened-v2-suited-for';
const VARIANTS: Record<Variant, string> = {
  'widened-v1-domain-and-dates': WIDENED_V1_SYSTEM_PROMPT,
  'widened-v2-suited-for': WIDENED_V2_SYSTEM_PROMPT,
};

/** Same glue as eval/synthesis/run.ts's and eval/01-phrase-library/run.ts's
 * own `computeTableInsights` — not a copy of product code, just the same
 * combination of imported pieces every harness arm needs. */
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

/** Bypasses the deployed Worker entirely (Ollama's Tailscale address isn't
 * reachable from Cloudflare's edge) — identical shape to
 * eval/synthesis/run.ts's own `makeOllamaFetch`, just parameterized on the
 * widened system prompt instead of the production one. Parsed and
 * reassembled with the exact same product functions (D58). */
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

interface RunRecord {
  dataset: string;
  variant: Variant;
  repeat: number;
  served: boolean;
  degradeReason?: string;
  baselineHeadline: string;
  composedHeadline?: string;
  groundingOk?: boolean;
  groundingOffending?: string[];
}

async function main(): Promise<void> {
  const engine = await createEvalEngine();
  const datasets = await loadEvalDatasets(engine);
  const records: RunRecord[] = [];

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

    for (const variant of Object.keys(VARIANTS) as Variant[]) {
      for (let repeat = 1; repeat <= REPEATS; repeat++) {
        const upgrade = await requestSynthesis(
          { aiMode: 'cloud', sessionId: crypto.randomUUID(), tables: dataset.tables, baseline },
          { endpoint: INERT_ENDPOINT, timeoutMs: 60_000, fetchImpl: makeOllamaFetch(VARIANTS[variant]) },
        );
        const served = upgrade.headlineFact.source === 'ai';
        const composedHeadline = served ? upgrade.headlineFact.value.statement : undefined;

        let groundingOk: boolean | undefined;
        let groundingOffending: string[] | undefined;
        if (composedHeadline !== undefined) {
          const allowed = allowedMentions(facts, baseline.headlineFact.statement);
          const result = groundingCheck(composedHeadline, allowed);
          groundingOk = result.ok;
          groundingOffending = result.offending;
        }

        const record: RunRecord = {
          dataset: dataset.id,
          variant,
          repeat,
          served,
          degradeReason: upgrade.headlineFact.degradeReason,
          baselineHeadline: baseline.headlineFact.statement,
          composedHeadline,
          groundingOk,
          groundingOffending,
        };
        records.push(record);
        console.log(
          `[${variant} #${repeat}] ${dataset.id}: served=${served}` +
            (record.degradeReason ? ` degrade=${record.degradeReason}` : '') +
            (groundingOk !== undefined ? ` grounding=${groundingOk ? 'ok' : 'REJECTED'}` : '') +
            (groundingOffending?.length ? ` offending=${JSON.stringify(groundingOffending)}` : '') +
            (composedHeadline ? ` :: ${composedHeadline}` : ''),
        );
      }
    }
  }

  fs.writeFileSync(
    path.resolve(__dirname, 'RESULTS.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), ollamaModel: OLLAMA_MODEL, closureRules: CLOSURE_RULES, records }, null, 2),
  );

  const served = records.filter((r) => r.served);
  const rejected = served.filter((r) => r.groundingOk === false);
  console.log(`\n${served.length}/${records.length} runs served an AI-sourced headline.`);
  console.log(`${rejected.length}/${served.length} served headlines rejected by groundingCheck.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
