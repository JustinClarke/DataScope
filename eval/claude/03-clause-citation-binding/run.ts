// Harness for the clause-citation-binding synthesis candidate
// (03-clause-citation-binding.md, approach 03 of _implementation/_misc/_ideation/ai
// architecture experimentation/). The model answers with `{claims:[{text,cites}]}`
// bound to the addressable fact table (src/lib/citableFacts.ts) instead of free
// prose; each claim is verified against the ONE fact it cites (the amended
// `narrationValidator`, src/lib/producerValidators.ts) before being assembled,
// in the app's own order, into the headline the real seam then re-checks.
//
// Usage: `npm run eval:clause-citation` (needs `make ollama-start`; see the
// ideation README's rig section).
//
// Reuses the real seam end to end: `requestSynthesis` still applies
// `narrationValidator`/`rankedActionValidator` to whatever this harness's
// fetchImpl returns (D58 — no second, harness-only validation path). Only the
// fetchImpl and the candidate-specific prompt/parse/fact-table (prompt.ts,
// src/lib/citableFacts.ts) are written fresh — dataset loading, insight
// probes, the Verdict builder, and structural facts are all imported from the
// product code unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine } from '../../duckdb/duckdb';
import { loadEvalDatasets, type EvalDataset } from '../../dataset/tables';
import {
  buildInsightProbes,
  idExclusionCandidates,
  nullPatternCandidates,
  rankInsights,
  type TableInsights,
} from '../../../src/lib/insights';
import { buildDatasetVerdict } from '../../../src/lib/dossier';
import { requestSynthesis } from '../../../src/services/synthesis';
import { sliceFromAnswer } from '../../../edge/ai/synthesisProvider';
import { narrationValidator } from '../../../src/lib/producerValidators';
import { buildCitableFacts, type CitableFact } from '../../../src/lib/citableFacts';
import { buildClaimsPrompt, parseClaimsAnswer, type ClauseClaim } from './prompt';
import type { EvalEngine } from '../../duckdb/duckdb';
import type { FactRef } from '../../../src/types';
import type { SynthesisRequest } from '../../../edge/protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA_CHAT_URL = process.env.OLLAMA_CHAT_URL ?? 'http://100.126.157.97:11434/v1/chat/completions';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:14b';
const INERT_ENDPOINT = 'unused://clause-citation-binding';
const REPEATS = 5;

interface ClaimDisposition {
  claim: ClauseClaim;
  ok: boolean;
  reason?: string;
}

/** Set once per fetchImpl call, read by the outer loop right after the
 * `requestSynthesis` await — calls are sequential, never concurrent, so a
 * single shared slot is enough to carry the fetchImpl's internal detail (raw
 * model output, per-claim dispositions) out to the RESULTS.json record
 * without threading it through `SynthesisUpgrade`'s own shape. */
interface RunDetail {
  compliant: boolean;
  raw?: string;
  dispositions: ClaimDisposition[];
  assembled?: string;
}
let lastDetail: RunDetail | undefined;

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

/** The candidate's own fetchImpl. Ignores the production synthesis prompt
 * entirely — builds its own claims prompt from `facts`, verifies each
 * returned claim against the one fact it cites, and assembles the survivors
 * (app order, i.e. `facts`' own order) into the headline the real seam then
 * re-checks via `sliceFromAnswer` + `requestSynthesis`'s own `validateSlice`. */
function makeClauseCitationFetch(facts: CitableFact[]): typeof fetch {
  const factTable = new Map(facts.map((f) => [f.id, f]));

  return (async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as SynthesisRequest;
    const { systemPrompt, userPrompt } = buildClaimsPrompt(facts);

    let raw: string;
    try {
      raw = await callOllama(systemPrompt, userPrompt);
    } catch (err) {
      console.error(`  [ollama transport failure] ${String(err)}`);
      lastDetail = { compliant: false, dispositions: [] };
      return new Response(JSON.stringify({ error: 'ai-down' }), { status: 502 });
    }

    let claims: ClauseClaim[];
    try {
      claims = parseClaimsAnswer(raw);
    } catch (err) {
      console.error(`  [parse failure] raw="${raw}" err=${String(err)}`);
      lastDetail = { compliant: false, raw, dispositions: [] };
      return new Response(JSON.stringify({ error: 'ai-down' }), { status: 502 });
    }

    const dispositions: ClaimDisposition[] = [];
    const survivorText = new Map<string, string>(); // fact id -> claim text, first survivor wins
    for (const claim of claims) {
      const fact = factTable.get(claim.cites);
      if (!fact) {
        dispositions.push({ claim, ok: false, reason: 'unknown citation id' });
        continue;
      }
      const baselineRef: FactRef = fact.ref;
      const candidateRef: FactRef = { ...fact.ref, statement: claim.text };
      const ok = narrationValidator(baselineRef, candidateRef, fact);
      dispositions.push({ claim, ok, reason: ok ? undefined : 'entity/value/phrasing check rejected' });
      if (ok && !survivorText.has(claim.cites)) survivorText.set(claim.cites, claim.text);
    }

    // Assembled in the app's own order (the fact table's order), not the
    // model's — per the doc's mechanism section 3.
    const orderedSurvivors = facts.filter((f) => survivorText.has(f.id)).map((f) => survivorText.get(f.id)!);

    if (orderedSurvivors.length === 0) {
      lastDetail = { compliant: true, raw, dispositions };
      return new Response(JSON.stringify({ error: 'ai-down' }), { status: 502 });
    }

    const assembled = orderedSurvivors.join(' ');
    lastDetail = { compliant: true, raw, dispositions, assembled };

    const answer = {
      headline: assembled,
      actions: request.baseline.actions.map((a, index) => ({ index, verb: a.verb })),
    };
    return new Response(JSON.stringify(sliceFromAnswer(request, answer)), { status: 200 });
  }) as typeof fetch;
}

/** Same glue every other harness arm needs — not a copy of product code. */
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

interface RunRecord {
  dataset: string;
  repeat: number;
  factCount: number;
  compliant: boolean;
  claimCount: number;
  survivorCount: number;
  rejected: Array<{ text: string; cites: string; reason?: string }>;
  served: boolean;
  degradeReason?: string;
  baselineHeadline: string;
  composedHeadline?: string;
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
    const facts = buildCitableFacts(dataset.tables, tableInsights);
    console.log(`\n${dataset.id}: ${facts.length} citable facts`);

    for (let repeat = 1; repeat <= REPEATS; repeat++) {
      lastDetail = undefined;
      const upgrade = await requestSynthesis(
        { aiMode: 'cloud', sessionId: crypto.randomUUID(), tables: dataset.tables, baseline },
        { endpoint: INERT_ENDPOINT, timeoutMs: 60_000, fetchImpl: makeClauseCitationFetch(facts) },
      );
      const detail: RunDetail = lastDetail ?? { compliant: false, dispositions: [] };
      const served = upgrade.headlineFact.source === 'ai';
      const rejected = detail.dispositions.filter((d) => !d.ok).map((d) => ({ text: d.claim.text, cites: d.claim.cites, reason: d.reason }));
      const survivorCount = detail.dispositions.filter((d) => d.ok).length;

      const record: RunRecord = {
        dataset: dataset.id,
        repeat,
        factCount: facts.length,
        compliant: detail.compliant,
        claimCount: detail.dispositions.length,
        survivorCount,
        rejected,
        served,
        degradeReason: upgrade.headlineFact.degradeReason,
        baselineHeadline: baseline.headlineFact.statement,
        composedHeadline: served ? upgrade.headlineFact.value.statement : undefined,
      };
      records.push(record);
      console.log(
        `  [#${repeat}] compliant=${detail.compliant} claims=${record.claimCount} survivors=${survivorCount} served=${served}` +
          (record.degradeReason ? ` degrade=${record.degradeReason}` : '') +
          (rejected.length ? ` rejected=${JSON.stringify(rejected)}` : '') +
          (record.composedHeadline ? ` :: ${record.composedHeadline}` : ''),
      );
    }
  }

  fs.writeFileSync(
    path.resolve(__dirname, 'RESULTS.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), ollamaModel: OLLAMA_MODEL, records }, null, 2),
  );

  const compliant = records.filter((r) => r.compliant);
  const served = records.filter((r) => r.served);
  const totalClaims = records.reduce((n, r) => n + r.claimCount, 0);
  const totalRejected = records.reduce((n, r) => n + r.rejected.length, 0);
  console.log(`\n${compliant.length}/${records.length} runs returned well-formed {claims} JSON (kill criterion e).`);
  console.log(`${served.length}/${records.length} runs served an AI-sourced headline.`);
  console.log(`${totalRejected}/${totalClaims} individual claims rejected by the citation check.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
