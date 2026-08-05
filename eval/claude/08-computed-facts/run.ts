// Harness for the computed-facts-with-data synthesis candidate
// (08-computed-facts-with-data.md, approach 08 of _implementation/_misc/_ideation/ai
// architecture experimentation/). Prototype only (owner decision, 2026-07-27) —
// nothing here is wired into the app; the deliverable is this file's
// RESULTS.json plus a hand-written verdict.
//
// Runs TWO arms per dataset, same rig, same session, so the comparison is
// same-day and same-hardware:
//   - control-03: 03's own unchanged mechanism (its narrower fact table, its
//     buildClaimsPrompt, its narrationValidator-based per-claim check) —
//     the doc's own "control arm runs in the same process" instruction.
//   - candidate-08: this doc's mechanism — the enriched fact table
//     (computeStats.ts + insight facts), non-citable exemplar rows, and every
//     claim checked twice (strict `checkCitation` and closure-extended).
//
// Uses Ollama's NATIVE /api/chat endpoint, not 03's OpenAI-compat
// /v1/chat/completions — 03's endpoint sends no `options` at all (harmless
// for its handful of facts); this doc's own "Ollama run" section makes
// setting `num_ctx` explicitly mandatory once the fact table is large enough
// to risk silent truncation, and the native endpoint is what accepts it. Also
// reports `prompt_eval_count` from the response — the model's own tokenizer,
// not an estimate.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine, type EvalEngine } from '../../duckdb/duckdb';
import { loadEvalDatasets, type EvalDataset } from '../../dataset/tables';
import {
  buildInsightProbes,
  idExclusionCandidates,
  nullPatternCandidates,
  rankInsights,
  type TableInsights,
} from '../../../src/lib/insights';
import { buildCitableFacts, type CitableFact } from '../../../src/lib/citableFacts';
import { narrationValidator } from '../../../src/lib/producerValidators';
import { buildClaimsPrompt as buildControlPrompt } from '../03-clause-citation-binding/prompt';
import { buildComputedFactsPrompt, parseClaimsAnswer, type ClauseClaim } from './prompt';
import { computeStats, type ComputedFact } from './computeStats';
import { verifyStats } from './verifyStats';
import { buildEnrichedCitableFacts, selectExemplarRows, formatSampleContext, type ExemplarRow } from './enrichedFacts';
import { checkSampleLeaks } from './sampleLeakCheck';
import { narrationCheckWithClosure, CLOSURE_RULES } from './closureRules';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA_CHAT_URL = process.env.OLLAMA_CHAT_URL ?? 'http://100.126.157.97:11434/api/chat';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:14b';
// The rig's model reports qwen2.context_length = 32768 with no `parameters`
// block in its Modelfile (verified live, 2026-07-27) — Ollama would otherwise
// silently apply its own smaller default. Set explicitly, never left implicit.
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 32768);
const REPEATS = Number(process.env.EVAL_REPEATS ?? 5);
// Narrows to one dataset id for a quick dry run; unset runs every §14 fixture.
const DATASET_FILTER = process.env.EVAL_DATASET;

interface OllamaCallResult {
  content: string;
  promptTokens: number;
  responseTokens: number;
}

async function callOllama(systemPrompt: string, userPrompt: string): Promise<OllamaCallResult> {
  const res = await fetch(OLLAMA_CHAT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      options: { num_ctx: NUM_CTX },
    }),
  });
  if (!res.ok) throw new Error(`ollama http ${res.status}`);
  const body = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
  return {
    content: body.message?.content ?? '',
    promptTokens: body.prompt_eval_count ?? -1,
    responseTokens: body.eval_count ?? -1,
  };
}

async function computeTableInsights(engine: EvalEngine, dataset: EvalDataset): Promise<TableInsights[]> {
  const out: TableInsights[] = [];
  for (const table of dataset.tables) {
    const columns = table.columns ?? [];
    const syntactic = [
      ...nullPatternCandidates(columns, table.tableName),
      ...idExclusionCandidates(columns, table.tableName),
    ];
    const probes = buildInsightProbes(table.tableName, columns, table.rowCount);
    const probed = await Promise.all(probes.map((p) => engine.execute(p.sql).then((r) => p.describe(r))));
    out.push({ table, insights: rankInsights([...syntactic, ...probed.flat()]) });
  }
  return out;
}

// ---- Control arm: 03's own unchanged mechanism, invoked directly rather than
// through `requestSynthesis` — 03 already proved D58 compliance on its own
// dedicated run (RESULTS.json, 2026-07-26); this harness only needs a
// same-session baseline, which calling the same buildClaimsPrompt/
// parseClaimsAnswer/narrationValidator functions provides just as validly. ----

interface ControlResult {
  compliant: boolean;
  raw?: string;
  promptTokens: number;
  responseTokens: number;
  claimCount: number;
  survivorCount: number;
  citedIds: string[];
  headline?: string;
}

async function runControl(facts: CitableFact[]): Promise<ControlResult> {
  const { systemPrompt, userPrompt } = buildControlPrompt(facts);
  let call: OllamaCallResult;
  try {
    call = await callOllama(systemPrompt, userPrompt);
  } catch (err) {
    console.error(`  [control ollama transport failure] ${String(err)}`);
    return { compliant: false, promptTokens: -1, responseTokens: -1, claimCount: 0, survivorCount: 0, citedIds: [] };
  }

  let claims: ClauseClaim[];
  try {
    claims = parseClaimsAnswer(call.content);
  } catch (err) {
    console.error(`  [control parse failure] raw="${call.content}" err=${String(err)}`);
    return {
      compliant: false, raw: call.content, promptTokens: call.promptTokens, responseTokens: call.responseTokens,
      claimCount: 0, survivorCount: 0, citedIds: [],
    };
  }

  const factTable = new Map(facts.map((f) => [f.id, f]));
  const survivors = new Map<string, string>();
  let survivorCount = 0;
  for (const claim of claims) {
    const fact = factTable.get(claim.cites);
    if (!fact) continue;
    const ok = narrationValidator(fact.ref, { ...fact.ref, statement: claim.text }, fact);
    if (ok) {
      survivorCount++;
      if (!survivors.has(claim.cites)) survivors.set(claim.cites, claim.text);
    }
  }
  const ordered = facts.filter((f) => survivors.has(f.id)).map((f) => survivors.get(f.id)!);

  return {
    compliant: true,
    raw: call.content,
    promptTokens: call.promptTokens,
    responseTokens: call.responseTokens,
    claimCount: claims.length,
    survivorCount,
    citedIds: [...survivors.keys()],
    headline: ordered.length > 0 ? ordered.join(' ') : undefined,
  };
}

// ---- Candidate arm: 08's own mechanism ----

interface ClaimDisposition {
  claim: ClauseClaim;
  strictOk: boolean;
  closureOk: boolean;
  closedByRule: boolean;
  reason?: string;
  sampleLeak?: string[];
}

interface CandidateResult {
  compliant: boolean;
  raw?: string;
  promptTokens: number;
  responseTokens: number;
  dispositions: ClaimDisposition[];
  strictCitedIds: string[];
  closureCitedIds: string[];
  strictHeadline?: string;
  closureHeadline?: string;
}

async function runCandidate(
  facts: CitableFact[],
  sampleContext: string,
  exemplarRows: ExemplarRow[],
  computedStats: ComputedFact[],
): Promise<CandidateResult> {
  const { systemPrompt, userPrompt } = buildComputedFactsPrompt(facts, sampleContext);
  let call: OllamaCallResult;
  try {
    call = await callOllama(systemPrompt, userPrompt);
  } catch (err) {
    console.error(`  [candidate ollama transport failure] ${String(err)}`);
    return { compliant: false, promptTokens: -1, responseTokens: -1, dispositions: [], strictCitedIds: [], closureCitedIds: [] };
  }

  let claims: ClauseClaim[];
  try {
    claims = parseClaimsAnswer(call.content);
  } catch (err) {
    console.error(`  [candidate parse failure] raw="${call.content}" err=${String(err)}`);
    return {
      compliant: false, raw: call.content, promptTokens: call.promptTokens, responseTokens: call.responseTokens,
      dispositions: [], strictCitedIds: [], closureCitedIds: [],
    };
  }

  const factTable = new Map(facts.map((f) => [f.id, f]));
  const dispositions: ClaimDisposition[] = [];
  const strictSurvivors = new Map<string, string>();
  const closureSurvivors = new Map<string, string>();

  for (const claim of claims) {
    const fact = factTable.get(claim.cites);
    if (!fact) {
      dispositions.push({ claim, strictOk: false, closureOk: false, closedByRule: false, reason: 'unknown citation id' });
      continue;
    }
    const { strict, closure } = narrationCheckWithClosure(claim.text, fact);
    const leaks = checkSampleLeaks([claim.text], exemplarRows, computedStats);
    dispositions.push({
      claim,
      strictOk: strict,
      closureOk: closure,
      closedByRule: !strict && closure,
      reason: strict ? undefined : 'citation/phrasing check rejected (strict)',
      sampleLeak: leaks[0]?.leaked,
    });
    if (strict && !strictSurvivors.has(claim.cites)) strictSurvivors.set(claim.cites, claim.text);
    if (closure && !closureSurvivors.has(claim.cites)) closureSurvivors.set(claim.cites, claim.text);
  }

  const orderedStrict = facts.filter((f) => strictSurvivors.has(f.id)).map((f) => strictSurvivors.get(f.id)!);
  const orderedClosure = facts.filter((f) => closureSurvivors.has(f.id)).map((f) => closureSurvivors.get(f.id)!);

  return {
    compliant: true,
    raw: call.content,
    promptTokens: call.promptTokens,
    responseTokens: call.responseTokens,
    dispositions,
    strictCitedIds: [...strictSurvivors.keys()],
    closureCitedIds: [...closureSurvivors.keys()],
    strictHeadline: orderedStrict.length > 0 ? orderedStrict.join(' ') : undefined,
    closureHeadline: orderedClosure.length > 0 ? orderedClosure.join(' ') : undefined,
  };
}

// ---- Recording ----

interface RunRecord {
  dataset: string;
  arm: 'control-03' | 'candidate-08';
  repeat: number;
  factCount: number;
  compliant: boolean;
  promptTokens: number;
  responseTokens: number;
  numCtx: number;
  rowsSent: number;
  rowsAvailable: number;
  claimCount: number;
  survivorCount?: number; // control arm
  strictSurvivorCount?: number; // candidate arm
  closureSurvivorCount?: number; // candidate arm
  sampleLeakCount: number;
  rejected: Array<{ text: string; cites: string; reason?: string }>;
  citedIds: string[];
  headline?: string; // control arm
  strictHeadline?: string; // candidate arm
  closureHeadline?: string; // candidate arm
}

function factSetStats(facts: ComputedFact[]): { byKind: Record<string, number>; meanValueSetSize: number; maxValueSetSize: number } {
  const byKind: Record<string, number> = {};
  let totalValues = 0;
  let maxValues = 0;
  for (const f of facts) {
    byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
    totalValues += f.values.length;
    maxValues = Math.max(maxValues, f.values.length);
  }
  return {
    byKind,
    meanValueSetSize: facts.length > 0 ? totalValues / facts.length : 0,
    maxValueSetSize: maxValues,
  };
}

async function main(): Promise<void> {
  const engine = await createEvalEngine();
  const allDatasets = await loadEvalDatasets(engine);
  const datasets = DATASET_FILTER ? allDatasets.filter((d) => d.id === DATASET_FILTER) : allDatasets;
  const records: RunRecord[] = [];
  const datasetFactStats: Record<string, ReturnType<typeof factSetStats>> = {};
  const exemplarReport: Record<string, { sent: number; dropped: number; droppedDetail: unknown[] }> = {};

  for (const dataset of datasets) {
    const tableInsights = await computeTableInsights(engine, dataset);
    const computedStats = await computeStats(engine, dataset.tables);

    // Kill criterion (g) — hard gate, before any live call for this dataset.
    // A wrong statistic carrying a valid citation is a verified lie; this
    // throws (stopping the whole run) rather than degrade quietly.
    await verifyStats(engine, dataset.tables, computedStats);

    const controlFacts = buildCitableFacts(dataset.tables, tableInsights);
    const candidateFacts = buildEnrichedCitableFacts(dataset.tables, tableInsights, computedStats);
    const exemplarSelection = await selectExemplarRows(engine, dataset.tables, computedStats);
    const sampleContext = formatSampleContext(exemplarSelection);
    const rowsAvailable = dataset.tables.reduce((s, t) => s + t.rowCount, 0);

    datasetFactStats[dataset.id] = factSetStats(computedStats);
    exemplarReport[dataset.id] = {
      sent: exemplarSelection.rows.length,
      dropped: exemplarSelection.dropped.length,
      droppedDetail: exemplarSelection.dropped,
    };

    console.log(
      `\n${dataset.id}: ${controlFacts.length} control facts, ${candidateFacts.length} candidate facts ` +
        `(${computedStats.length} computed), ${exemplarSelection.rows.length} exemplar rows sent ` +
        `(${exemplarSelection.dropped.length} dropped by inertness rule)`,
    );

    for (let repeat = 1; repeat <= REPEATS; repeat++) {
      const control = await runControl(controlFacts);
      records.push({
        dataset: dataset.id,
        arm: 'control-03',
        repeat,
        factCount: controlFacts.length,
        compliant: control.compliant,
        promptTokens: control.promptTokens,
        responseTokens: control.responseTokens,
        numCtx: NUM_CTX,
        rowsSent: 0,
        rowsAvailable,
        claimCount: control.claimCount,
        survivorCount: control.survivorCount,
        sampleLeakCount: 0,
        rejected: [],
        citedIds: control.citedIds,
        headline: control.headline,
      });
      console.log(
        `  [control  #${repeat}] compliant=${control.compliant} claims=${control.claimCount} survivors=${control.survivorCount}` +
          (control.headline ? ` :: ${control.headline}` : ''),
      );

      const candidate = await runCandidate(candidateFacts, sampleContext, exemplarSelection.rows, computedStats);
      const rejected = candidate.dispositions
        .filter((d) => !d.strictOk)
        .map((d) => ({ text: d.claim.text, cites: d.claim.cites, reason: d.reason }));
      const sampleLeakCount = candidate.dispositions.filter((d) => d.sampleLeak && d.sampleLeak.length > 0).length;
      records.push({
        dataset: dataset.id,
        arm: 'candidate-08',
        repeat,
        factCount: candidateFacts.length,
        compliant: candidate.compliant,
        promptTokens: candidate.promptTokens,
        responseTokens: candidate.responseTokens,
        numCtx: NUM_CTX,
        rowsSent: exemplarSelection.rows.length,
        rowsAvailable,
        claimCount: candidate.dispositions.length,
        strictSurvivorCount: candidate.dispositions.filter((d) => d.strictOk).length,
        closureSurvivorCount: candidate.dispositions.filter((d) => d.closureOk).length,
        sampleLeakCount,
        rejected,
        citedIds: candidate.strictCitedIds,
        strictHeadline: candidate.strictHeadline,
        closureHeadline: candidate.closureHeadline,
      });
      console.log(
        `  [candidate#${repeat}] compliant=${candidate.compliant} claims=${candidate.dispositions.length} ` +
          `strict=${candidate.dispositions.filter((d) => d.strictOk).length} closure=${candidate.dispositions.filter((d) => d.closureOk).length} ` +
          `leaks=${sampleLeakCount} promptTokens=${candidate.promptTokens}` +
          (candidate.strictHeadline ? ` :: ${candidate.strictHeadline}` : ''),
      );
    }
  }

  // ---- Kill criterion (h): determinism, reported not assumed ----
  interface DeterminismRow {
    dataset: string;
    arm: string;
    identicalHeadlineRate: number;
    citedSetOverlap: number;
  }
  const determinism: DeterminismRow[] = [];
  for (const dataset of datasets) {
    for (const arm of ['control-03', 'candidate-08'] as const) {
      const runs = records.filter((r) => r.dataset === dataset.id && r.arm === arm);
      const headlines = runs.map((r) => (arm === 'control-03' ? r.headline : r.strictHeadline) ?? '');
      const identicalRate = headlines.length > 0 ? headlines.filter((h) => h === headlines[0]).length / headlines.length : 0;
      const idSets = runs.map((r) => new Set(r.citedIds));
      const allIds = new Set(idSets.flatMap((s) => [...s]));
      let overlapSum = 0;
      let overlapCount = 0;
      for (const id of allIds) {
        const presentIn = idSets.filter((s) => s.has(id)).length;
        overlapSum += presentIn === idSets.length || presentIn === 0 ? 1 : presentIn / idSets.length;
        overlapCount++;
      }
      determinism.push({
        dataset: dataset.id,
        arm,
        identicalHeadlineRate: identicalRate,
        citedSetOverlap: overlapCount > 0 ? overlapSum / overlapCount : 1,
      });
    }
  }

  fs.writeFileSync(
    path.resolve(__dirname, 'RESULTS.json'),
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        ollamaModel: OLLAMA_MODEL,
        numCtx: NUM_CTX,
        repeats: REPEATS,
        closureRules: CLOSURE_RULES,
        datasetFactStats,
        exemplarReport,
        determinism,
        records,
      },
      null,
      2,
    ),
  );

  const controlRecords = records.filter((r) => r.arm === 'control-03');
  const candidateRecords = records.filter((r) => r.arm === 'candidate-08');
  const controlServed = controlRecords.filter((r) => r.headline !== undefined);
  const candidateServedStrict = candidateRecords.filter((r) => r.strictHeadline !== undefined);
  const candidateServedClosure = candidateRecords.filter((r) => r.closureHeadline !== undefined);
  const totalCandidateClaims = candidateRecords.reduce((n, r) => n + r.claimCount, 0);
  const totalCandidateRejectedStrict = candidateRecords.reduce((n, r) => n + r.rejected.length, 0);
  const totalSampleLeaks = candidateRecords.reduce((n, r) => n + r.sampleLeakCount, 0);

  console.log('\n=== Summary ===');
  console.log(`control-03  compliant: ${controlRecords.filter((r) => r.compliant).length}/${controlRecords.length}`);
  console.log(`control-03  served:    ${controlServed.length}/${controlRecords.length}`);
  console.log(`candidate-08 compliant: ${candidateRecords.filter((r) => r.compliant).length}/${candidateRecords.length}`);
  console.log(`candidate-08 served (strict):  ${candidateServedStrict.length}/${candidateRecords.length}`);
  console.log(`candidate-08 served (closure): ${candidateServedClosure.length}/${candidateRecords.length}`);
  console.log(`candidate-08 claims rejected (strict): ${totalCandidateRejectedStrict}/${totalCandidateClaims}`);
  console.log(`candidate-08 sample-leak claims (kill criterion f): ${totalSampleLeaks}/${totalCandidateClaims}`);
  console.log(`closure rules applied: ${CLOSURE_RULES.length}`);

  await engine.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
