// Harness for the phrase-library synthesis candidate (01-phrase-library.md,
// approach 01 of _implementation/_misc/_ideation/ai architecture
// experimentation/). Runs two arms — `selective` (the candidate: the model
// picks among hand-authored phrasings) and `extractive-floor` (the zero-freedom
// control: the model only orders deterministic fact sentences) — against all
// five §14 samples, N=5 repeats each, over Ollama.
//
// Usage: `npm run eval:phrase-library` (needs `make ollama-start`; see the
// ideation README's rig section).
//
// Reuses the real seam end to end: `requestSynthesis` (src/services/synthesis)
// still applies `narrationValidator`/`rankedActionValidator` to whatever this
// harness's fetchImpl returns (D58 — no second, harness-only validation path).
// Only the fetchImpl and the candidate-specific prompt/parse/assembly
// (selection.ts, capabilityPhrases.ts) are written fresh — everything else
// (dataset loader, eval engine, insight probes, the Verdict builder, the
// structural-facts builder) is imported from the product code unchanged.
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
import { detectCapabilities } from '../../src/lib/datasetCapabilities';
import type { EvalEngine } from '../duckdb/duckdb';
import type { SynthesisRequest, SynthesisResponse } from '../../edge/protocol';
import {
  buildCandidates,
  buildExtractiveCandidates,
  buildSelectivePrompt,
  buildOrderOnlyPrompt,
  parseSelectionAnswer,
  assembleHeadline,
  type PhraseCandidate,
} from './selection';
import { CAPABILITY_PHRASES } from './capabilityPhrases';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same Tailscale-only rig every other eval arm uses (Makefile's ollama-start).
const OLLAMA_CHAT_URL = process.env.OLLAMA_CHAT_URL ?? 'http://100.126.157.97:11434/v1/chat/completions';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:14b';
// Never actually fetched — the fetchImpl below replaces the transport
// entirely, exactly like eval/synthesis/run.ts's own makeOllamaFetch. Kept
// only because requestSynthesis's deps accept an endpoint string.
const INERT_ENDPOINT = 'unused://phrase-library';
const REPEATS = 5;

type Arm = 'selective' | 'extractive-floor';
const ARMS: Arm[] = ['selective', 'extractive-floor'];

/** The product's insight path over the eval engine — same probes, same ranking
 * as eval/synthesis/run.ts's own helper (glue code combining imported pieces,
 * not a copy of any one module). */
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

async function callOllama(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(OLLAMA_CHAT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama http ${res.status}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content ?? '';
}

/** The phrase-library candidate's own fetchImpl — bypasses the deployed Worker
 * entirely (Ollama's Tailscale address isn't reachable from Cloudflare's edge,
 * same constraint eval/synthesis/run.ts's makeOllamaFetch works around) and
 * reassembles a SynthesisResponse through the real seam: requestSynthesis's
 * own validators score whatever this returns (D58). Only the headline is
 * touched — this candidate's mechanism never re-ranks actions, so the baseline
 * actions travel back unchanged. */
function makePhraseLibraryFetch(arm: Arm): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as SynthesisRequest;
    const detected = detectCapabilities(request.facts);

    if (detected.length === 0) {
      // No capability evidence — the honest "nothing to say" state (R5), never
      // an invented one. Degrades to the deterministic baseline.
      return new Response(JSON.stringify({ error: 'ai-down' }), { status: 502 });
    }

    const candidates: PhraseCandidate[] =
      arm === 'selective'
        ? buildCandidates(detected, CAPABILITY_PHRASES)
        : buildExtractiveCandidates(detected, request.facts);

    const { systemPrompt, userPrompt } =
      arm === 'selective' ? buildSelectivePrompt(candidates) : buildOrderOnlyPrompt(candidates);

    let text: string;
    try {
      text = await callOllama(systemPrompt, userPrompt);
    } catch (err) {
      console.error(`  [ollama transport failure] ${String(err)}`);
      return new Response(JSON.stringify({ error: 'ai-down' }), { status: 502 });
    }

    let answer;
    try {
      answer = parseSelectionAnswer(text, candidates, arm === 'selective' ? 'select' : 'order-only');
    } catch (err) {
      console.error(`  [${arm} parse failure] raw="${text}" err=${String(err)}`);
      return new Response(JSON.stringify({ error: 'ai-down' }), { status: 502 });
    }

    const selectedTexts = answer.suitedFor.map((i) => candidates[i].text);
    const headline = assembleHeadline(request.facts, selectedTexts);
    const response: SynthesisResponse = {
      headlineFact: { ...request.baseline.headlineFact, statement: headline },
      actions: request.baseline.actions,
    };
    return new Response(JSON.stringify(response), { status: 200 });
  }) as typeof fetch;
}

interface RunRecord {
  dataset: string;
  arm: Arm;
  repeat: number;
  detectedCapabilities: string[];
  served: boolean;
  degradeReason?: string;
  baselineHeadline: string;
  composedHeadline?: string;
}

async function main() {
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
    const detected = detectCapabilities(facts);
    console.log(`\n${dataset.id}: detected = [${detected.join(', ') || 'none'}]`);

    for (const arm of ARMS) {
      for (let repeat = 1; repeat <= REPEATS; repeat++) {
        const upgrade = await requestSynthesis(
          { aiMode: 'cloud', sessionId: crypto.randomUUID(), tables: dataset.tables, baseline },
          { endpoint: INERT_ENDPOINT, timeoutMs: 60_000, fetchImpl: makePhraseLibraryFetch(arm) },
        );
        const served = upgrade.headlineFact.source === 'ai';
        const record: RunRecord = {
          dataset: dataset.id,
          arm,
          repeat,
          detectedCapabilities: detected,
          served,
          degradeReason: upgrade.headlineFact.degradeReason,
          baselineHeadline: baseline.headlineFact.statement,
          composedHeadline: served ? upgrade.headlineFact.value.statement : undefined,
        };
        records.push(record);
        console.log(
          `  [${arm} #${repeat}] served=${served}` +
            (record.degradeReason ? ` degrade=${record.degradeReason}` : '') +
            (record.composedHeadline ? ` :: ${record.composedHeadline}` : ''),
        );
      }
    }
  }

  fs.writeFileSync(
    path.resolve(__dirname, 'RESULTS.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), ollamaModel: OLLAMA_MODEL, records }, null, 2),
  );

  const servedCount = records.filter((r) => r.served).length;
  console.log(`\n${servedCount}/${records.length} runs served an AI-sourced headline.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
