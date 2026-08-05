// Phase 1 driver (10-grounding-ladder.md) — the panel arm. Extends eval/08's
// runner rather than replacing it: same Ollama /api/chat convention, same
// `verifyStats` hard gate (kill criterion a), same RESULTS.json-of-records
// shape — but crossed over the doc's three axes (A1 rows, A2 schema
// legibility, A3 fact integrity — variants.ts) against slot-partitioned fact
// tables (slotFacts.ts) and the new panel output contract (panelSchema.ts),
// not 08's flat `{claims:[...]}`. `runChat.ts` (chat arm) and `runOffers.ts`
// (offers-arm SQL execution) are the other two surfaces, each its own file —
// this file's own offers handling is structural only (does the model return the ranker's
// exact 3 ids, does each verb clear the phrasing guard), never execution.
//
// Deliberately adds NO new fabrication-scoring logic for A3: feeding the
// corrupted (not pristine) SlotFactTables into `scorePanel`'s C2 check, while
// `scoreC1` keeps checking the header against the untouched PANEL-KEY.json
// truth, already closes both hatches (see corrupt.ts's own module comment).
//
// Env vars (all optional, all narrow a full run rather than change its
// meaning): EVAL_DATASET (one fixture), EVAL_CELL (one cell id),
// EVAL_REPEAT_CAP (caps N — a smoke test before committing to the full
// ~250-call, ~4h run the doc estimates). The rig's own vars (OLLAMA_CHAT_URL,
// OLLAMA_MODEL, OLLAMA_NUM_CTX, OLLAMA_KEEP_ALIVE, the two timeouts) live in
// ollamaRig.ts, shared with runChat.ts so the two arms cannot drift apart.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createEvalEngine, type EvalEngine } from '../../duckdb/duckdb';
import { loadEvalDatasets } from '../../dataset/tables';
import { quoteIdentifier } from '../../../src/services/ingestion';
import {
  buildInsightProbes,
  idExclusionCandidates,
  nullPatternCandidates,
  rankInsights,
  type TableInsights,
} from '../../../src/lib/insights';
import { rankNextActions } from '../../../src/lib/capabilities';
import { passesPhrasingGuard, TREND_GENERALISATION_TERMS } from '../../../src/lib/producerValidators';
import { extractEntities, extractValues } from '../../../src/lib/citableFacts';
import { computeStats, type ComputedFact } from '../08-computed-facts/computeStats';
import { verifyStats } from '../08-computed-facts/verifyStats';
import { CLOSURE_RULES } from '../08-computed-facts/closureRules';
import { buildSlotFactTables, type SlotFactTables } from './slotFacts';
import { assemble, estimateTokens, type PromptSection } from './assemble';
import { parsePanelAnswer, SLOT_CAPS, OFFERS_CAP, PANEL_RESPONSE_SCHEMA, type PanelAnswer } from './panelSchema';
import { scorePanel } from './scorePanel';
import type { PanelKey, PanelKeyEntry } from './buildKey';
import { buildOpaqueMapping, anonymizeSlotFactTables, deanonymizePanelAnswer, type OpaqueMapping } from './opaque';
import { applyFactIntegrity } from './corrupt';
import { PHASE1_CELLS, CEILING_CELLS, UNCAPPED_CELLS, IN_SCOPE_FIXTURES, CEILING_FIXTURE, type VariantCell, type RowsSent } from './variants';
import { installRigDispatcher, KEEP_ALIVE } from './ollamaRig';
import { resolvePanelRig, type ModelCallResult } from './providers';
import type { ClassifiedColumn, RankedAction, TableRegistryEntry } from '../../../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

installRigDispatcher();

// Headroom for the response (num_predict) — the panel object is longer than
// 08's flat claim list ("budget ~30s/call on the M4", doc's own estimate).
const RESPONSE_RESERVE_TOKENS = 1500;
const DATASET_FILTER = process.env.EVAL_DATASET;
const CELL_FILTER = process.env.EVAL_CELL;
const REPEAT_CAP = process.env.EVAL_REPEAT_CAP ? Number(process.env.EVAL_REPEAT_CAP) : undefined;
// `ollama` and `gemini` are the registered PanelRigs (11-gemini-comparison-
// arm.md Phase 2 + Phase 3) — the seam exists so a provider is a registry
// entry, not a fork through this file.
const rig = resolvePanelRig(process.env.EVAL_PROVIDER ?? 'ollama');

// The doc's prompt-capture sidecar ("the token cross-check that replaces kill
// criterion (b)"): one JSONL line per call, keyed dataset/cellId/repeat, so
// the smaller tiers can replay byte-identical inputs and so promptTokens
// (the provider's true count) can be diffed against estimatedPromptTokens.
const PROMPTS_PATH = path.resolve(__dirname, `PROMPTS-${rig.id}.jsonl`);

function capturePrompt(entry: { dataset: string; cellId: string; repeat: number; system: string; user: string; estimatedPromptTokens: number }): void {
  fs.appendFileSync(PROMPTS_PATH, `${JSON.stringify(entry)}\n`);
}

export async function computeTableInsights(engine: EvalEngine, tables: TableRegistryEntry[]): Promise<TableInsights[]> {
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

export async function loadAllRows(engine: EvalEngine, table: TableRegistryEntry): Promise<Record<string, unknown>[]> {
  const result = await engine.execute(`SELECT * FROM ${quoteIdentifier(table.tableName)}`);
  return result.rows.map((row) => Object.fromEntries(result.columnNames.map((name, i) => [name, row[i]])));
}

export function loadPanelKey(): PanelKey {
  const raw = fs.readFileSync(path.resolve(__dirname, 'PANEL-KEY.json'), 'utf-8');
  return JSON.parse(raw) as PanelKey;
}

// ---- Offers: rankNextActions has no stable id (RankedAction carries verb/
// module/tab/prefill/evidence/score, never an id) — mint a positional one,
// scoped to this harness only, so the model has something to echo back. ----

export interface OfferCandidate {
  actionId: string;
  verb: string;
  module: string;
  tab?: string;
  statement: string;
}

export function buildOfferCandidates(actions: RankedAction[]): OfferCandidate[] {
  return actions.slice(0, OFFERS_CAP).map((a, i) => ({
    actionId: `act:${i + 1}`,
    verb: a.verb,
    module: a.module,
    tab: a.tab,
    statement: a.evidence.statement,
  }));
}

function checkOffersCompliance(offers: PanelAnswer['offers'], candidates: OfferCandidate[]): { compliant: boolean; phrasingViolations: number } {
  const candidateIds = new Set(candidates.map((c) => c.actionId));
  const returnedIds = offers.map((o) => o.actionId);
  const compliant =
    returnedIds.length === candidates.length &&
    returnedIds.every((id) => candidateIds.has(id)) &&
    new Set(returnedIds).size === returnedIds.length;
  const phrasingViolations = offers.filter((o) => !passesPhrasingGuard(o.verb)).length;
  return { compliant, phrasingViolations };
}

// ---- Prompt assembly ----

export function buildSchemaCard(table: TableRegistryEntry, nameFor: (name: string) => string): string {
  const lines = [`SCHEMA: ${nameFor(table.tableName)} (${table.rowCount.toLocaleString()} rows)`];
  for (const col of table.columns ?? []) lines.push(`  ${nameFor(col.name)}: ${col.semanticType}`);
  return lines.join('\n');
}

// The doc's own highest-leverage change: send {id, statement, entities,
// values}, not just {id, statement} (08's prompt.ts) — the model is graded on
// `entities`/`values` (checkCitationWithClosure) whether or not it ever sees
// them, so showing them makes the constraint visible instead of inferred.
function buildComputedFactsSection(slotFacts: SlotFactTables): string {
  const lines = ['COMPUTED FACTS (grouped by the panel slot they may support — cite only a fact from the slot you are writing):'];
  for (const slot of ['header', 'structural', 'quality', 'behavioral'] as const) {
    const facts = slotFacts.tables[slot];
    if (facts.length === 0) continue;
    lines.push(`\n${slot.toUpperCase()}:`);
    for (const f of facts) lines.push(JSON.stringify({ id: f.id, statement: f.ref.statement, entities: f.entities, values: f.values }));
  }
  return lines.join('\n');
}

function buildOffersSection(candidates: OfferCandidate[], mapping?: OpaqueMapping): string {
  if (candidates.length === 0) return '';
  const lines = ['OFFER CANDIDATES (rewrite only "verb" for each; keep actionId fixed; return exactly these, none invented):'];
  for (const c of candidates) {
    const evidence = mapping ? mapping.anonymizeText(c.statement) : c.statement;
    lines.push(JSON.stringify({ actionId: c.actionId, module: c.module, tab: c.tab, evidence, suggestedVerb: c.verb }));
  }
  return lines.join('\n');
}

function selectRowSlice(rows: Record<string, unknown>[], rung: RowsSent): Record<string, unknown>[] {
  return rung === 'max' ? rows : rows.slice(0, rung);
}

/** Greedily packs `rows` (TSV — the doc's own fixed choice over row-JSON) into
 * `budgetTokens`, so "max-that-fits" (the ceiling-control fixture) is exactly
 * that: as many complete rows as fit, not all-or-nothing. `assemble()`'s own
 * section-level budget still applies on top of this as the real safety net —
 * this just pre-sizes the row-evidence section so it doesn't get dropped
 * whole for one row too many. */
export function packRowsToBudget(
  rows: Record<string, unknown>[],
  columns: ClassifiedColumn[],
  nameFor: (name: string) => string,
  budgetTokens: number,
): { text: string; rowsSent: number } {
  if (rows.length === 0 || budgetTokens <= 0) return { text: '', rowsSent: 0 };
  const header = columns.map((c) => nameFor(c.name)).join('\t');
  let text = header;
  let tokens = estimateTokens(header);
  let sent = 0;
  for (const row of rows) {
    const line = `\n${columns.map((c) => String(row[c.name] ?? '')).join('\t')}`;
    const lineTokens = estimateTokens(line);
    if (tokens + lineTokens > budgetTokens) break;
    text += line;
    tokens += lineTokens;
    sent += 1;
  }
  return { text: sent > 0 ? `ROW EVIDENCE (${sent} of ${rows.length} rows, TSV — context only, never a stats source):\n${text}` : '', rowsSent: sent };
}

function buildSystemPrompt(): string {
  return [
    'You are describing a dataset for a data-analysis app\'s opening screen (a "synthesis panel" with five sections).',
    'You receive a SCHEMA card, COMPUTED FACTS (grouped by which panel section they may support), three OFFER',
    'CANDIDATES from a fixed ranker, and — sometimes — ROW EVIDENCE (a small sample of raw rows).',
    '',
    'Rules:',
    '1. Every claim in header/structural/quality/behavioral must cite exactly one fact id from COMPUTED FACTS,',
    '   and ONLY from that fact\'s own slot (never cite a quality fact from the structural section, etc.).',
    '2. A claim\'s wording may use only the names and numbers that already appear in the ONE fact you cite for it.',
    '3. ROW EVIDENCE, when present, is context only — never derive a statistic, count, percentage, or trend from',
    '   it that isn\'t already backed by a cited computed fact.',
    `4. Caps: structural ≤ ${SLOT_CAPS.structural} claims, quality ≤ ${SLOT_CAPS.quality} claims, behavioral ≤ ${SLOT_CAPS.behavioral} claims. Header is exactly one claim.`,
    '5. Offers: return exactly the given actionIds, unchanged. You may only rewrite each one\'s "verb" text — never',
    '   add, drop, or invent an actionId.',
    '6. Never use absolute or causal wording (always, never, guaranteed, because, causes, due to, leads to, drives).',
    '7. Never state that a check found nothing (e.g. "no duplicates") — you cannot perform an exhaustive check.',
    '',
    'Answer with ONLY this JSON, no prose, no code fences:',
    '{"header": {"text": "...", "cites": ["..."]},',
    ' "structural": [{"text": "...", "cites": ["..."]}],',
    ' "quality": [{"text": "...", "cites": ["..."]}],',
    ' "behavioral": [{"text": "...", "cites": ["..."]}],',
    ' "offers": [{"actionId": "...", "verb": "..."}]}',
  ].join('\n');
}

function checkRowLeaks(claimTexts: string[], rows: Record<string, unknown>[], facts: Array<{ values: (string | number)[] }>, vocabulary: string[]): number {
  if (rows.length === 0) return 0;
  const cellValues = new Set<string>();
  for (const row of rows) {
    for (const v of Object.values(row)) {
      if (v === null || v === undefined) continue;
      cellValues.add(String(v).toLowerCase().trim());
    }
  }
  const factValues = new Set<string>();
  for (const f of facts) for (const v of f.values) factValues.add(String(v).toLowerCase().trim());

  let leaks = 0;
  for (const text of claimTexts) {
    const mentioned = [...extractValues(text, vocabulary), ...extractEntities(text, vocabulary)].map((v) => v.toLowerCase().trim());
    if (mentioned.some((m) => cellValues.has(m) && !factValues.has(m))) leaks += 1;
  }
  return leaks;
}

// ---- Recording ----

export interface RunRecord {
  dataset: string;
  cellId: string;
  block: VariantCell['block'];
  a1: VariantCell['a1'];
  a2: VariantCell['a2'];
  a3: VariantCell['a3'];
  repeat: number;
  compliant: boolean;
  truncated: boolean;
  numCtx: number;
  promptTokens: number;
  responseTokens: number;
  /** assemble()'s estimate for the same prompt — cross-checked against
   * promptTokens (the provider's true count) per 11-gemini-comparison-arm.md's
   * "token cross-check that replaces kill criterion (b)". */
  estimatedPromptTokens: number;
  /** Gemini's thoughtsTokenCount/cachedContentTokenCount; undefined elsewhere. */
  thinkingTokens?: number;
  cachedTokens?: number;
  rowsSent: number;
  rowsAvailable: number;
  anchorFactId?: string;
  corruptionOriginal?: string;
  corruptionCorrupted?: string;
  c1DisagreementCount: number;
  c2Total: number;
  c2Ok: number;
  c2ClosedByRule: number;
  c2SlotMisassigned: number;
  c3OccurrenceCount: number;
  c4ResidueCount: number;
  trendGeneralisationCount: number;
  sampleLeakCount: number;
  offersCompliant: boolean;
  offersPhrasingViolations: number;
  headerText?: string;
  raw?: string;
}

export interface DatasetContext {
  datasetId: string;
  table: TableRegistryEntry;
  tables: TableRegistryEntry[];
  computedStats: ComputedFact[];
  panelKeyEntry: PanelKeyEntry;
  offerCandidates: OfferCandidate[];
  allRows: Record<string, unknown>[];
  vocabulary: string[];
}

export async function runCell(ctx: DatasetContext, cell: VariantCell): Promise<RunRecord[]> {
  const records: RunRecord[] = [];
  const repeats = REPEAT_CAP ? Math.min(REPEAT_CAP, cell.repeats) : cell.repeats;

  for (let repeat = 1; repeat <= repeats; repeat++) {
    const realSlotFacts = buildSlotFactTables(ctx.tables, ctx.computedStats);
    const integrity = applyFactIntegrity(realSlotFacts, cell.a3);
    const mapping = cell.a2 === 'OPAQUE' ? buildOpaqueMapping(ctx.tables) : undefined;
    const nameFor = mapping ? (n: string) => mapping.toOpaque.get(n) ?? n : (n: string) => n;
    const modelSlotFacts = mapping ? anonymizeSlotFactTables(integrity.tables, mapping) : integrity.tables;

    const schemaCard = buildSchemaCard(ctx.table, nameFor);
    const computedFactsSection = buildComputedFactsSection(modelSlotFacts);
    const offersSection = buildOffersSection(ctx.offerCandidates, mapping);
    const rowSlice = selectRowSlice(ctx.allRows, cell.a1);

    // Two-pass budgeting: size everything else first, then fit rows into
    // what's left — the seam assemble.ts's own module comment describes.
    const withoutRows = assemble([
      { name: 'schema-card', content: schemaCard },
      { name: 'computed-facts', content: computedFactsSection },
      { name: 'offer-candidates', content: offersSection },
    ]);
    // The uncapped cell has no budget by design (doc: "For the uncapped cell
    // there is no budget by design; record actual prompt tokens instead of a
    // truncation flag") — every row is packed, and assemble()'s own
    // section-level safety net is lifted too, or "uncapped" would just be a
    // relabelled max-that-fits.
    const uncapped = cell.block === 'uncapped';
    const rowBudget = uncapped ? Infinity : Math.max(0, rig.contextWindow - RESPONSE_RESERVE_TOKENS - withoutRows.totalTokens);
    const { text: rowEvidenceText, rowsSent } = packRowsToBudget(rowSlice, ctx.table.columns ?? [], nameFor, rowBudget);

    const assembled = assemble(
      [
        { name: 'schema-card', content: schemaCard },
        { name: 'computed-facts', content: computedFactsSection },
        { name: 'offer-candidates', content: offersSection },
        { name: 'row-evidence', content: rowEvidenceText },
      ] satisfies PromptSection[],
      uncapped ? Infinity : rig.contextWindow - RESPONSE_RESERVE_TOKENS,
    );
    const systemPrompt = buildSystemPrompt();

    // The fully assembled prompt, captured regardless of call outcome — the
    // doc's "token cross-check that replaces kill criterion (b)": without the
    // byte-identical input, an Ollama-vs-Gemini difference can't be attributed
    // to the model rather than to a differently-packed prompt.
    capturePrompt({
      dataset: ctx.datasetId,
      cellId: cell.id,
      repeat,
      system: systemPrompt,
      user: assembled.prompt,
      estimatedPromptTokens: assembled.totalTokens,
    });

    const base = {
      dataset: ctx.datasetId,
      cellId: cell.id,
      block: cell.block,
      a1: cell.a1,
      a2: cell.a2,
      a3: cell.a3,
      repeat,
      numCtx: rig.contextWindow,
      estimatedPromptTokens: assembled.totalTokens,
      rowsSent,
      rowsAvailable: ctx.allRows.length,
      anchorFactId: integrity.anchorFactId,
      corruptionOriginal: integrity.corruption?.original,
      corruptionCorrupted: integrity.corruption?.corrupted,
    };
    const zeroScores = {
      c1DisagreementCount: 0,
      c2Total: 0,
      c2Ok: 0,
      c2ClosedByRule: 0,
      c2SlotMisassigned: 0,
      c3OccurrenceCount: 0,
      c4ResidueCount: 0,
      trendGeneralisationCount: 0,
      sampleLeakCount: 0,
      offersCompliant: false,
      offersPhrasingViolations: 0,
    };

    let call: ModelCallResult;
    try {
      call = await rig.call(systemPrompt, assembled.prompt, PANEL_RESPONSE_SCHEMA);
    } catch (err) {
      console.error(`  [${cell.id}#${repeat} transport failure] ${String(err)}`);
      records.push({ ...base, ...zeroScores, compliant: false, truncated: false, promptTokens: -1, responseTokens: -1 });
      continue;
    }

    // Kill criterion (b): a run whose prompt exceeded num_ctx is a failed
    // run, not a data point — asserted against the rig's own token count.
    const truncated = call.promptTokens >= rig.contextWindow;

    let parsed: PanelAnswer;
    try {
      parsed = parsePanelAnswer(call.content);
    } catch (err) {
      console.error(`  [${cell.id}#${repeat} parse failure] raw="${call.content}" err=${String(err)}`);
      records.push({
        ...base,
        ...zeroScores,
        compliant: false,
        truncated,
        promptTokens: call.promptTokens,
        responseTokens: call.responseTokens,
        raw: call.content,
      });
      continue;
    }

    const answerForScoring = mapping ? deanonymizePanelAnswer(parsed, mapping) : parsed;
    // Score against the tables the model actually saw (post-corruption), in
    // real names — never the pristine table — per corrupt.ts's own note.
    const score = scorePanel(answerForScoring, ctx.panelKeyEntry, integrity.tables);
    const allClaims = [answerForScoring.header, ...answerForScoring.structural, ...answerForScoring.quality, ...answerForScoring.behavioral];
    const sampleLeakCount = checkRowLeaks(allClaims.map((c) => c.text), rowSlice, ctx.computedStats, ctx.vocabulary);
    const offersCheck = checkOffersCompliance(answerForScoring.offers, ctx.offerCandidates);

    records.push({
      ...base,
      compliant: true,
      truncated,
      promptTokens: call.promptTokens,
      responseTokens: call.responseTokens,
      thinkingTokens: call.thinkingTokens,
      cachedTokens: call.cachedTokens,
      raw: call.content,
      headerText: answerForScoring.header.text,
      c1DisagreementCount: score.c1.length,
      c2Total: score.c2.length,
      c2Ok: score.c2.filter((d) => d.ok).length,
      c2ClosedByRule: score.c2.filter((d) => d.closedByRule).length,
      c2SlotMisassigned: score.c2.filter((d) => d.slotMisassigned).length,
      c3OccurrenceCount: score.c3.length,
      c4ResidueCount: score.c4Residue.length,
      trendGeneralisationCount: score.trendGeneralisations.length,
      sampleLeakCount,
      offersCompliant: offersCheck.compliant,
      offersPhrasingViolations: offersCheck.phrasingViolations,
    });

    console.log(
      `  [${cell.id}#${repeat}] compliant=true promptTokens=${call.promptTokens}${truncated ? ' TRUNCATED' : ''} rowsSent=${rowsSent} ` +
        `c1=${score.c1.length} c2ok=${score.c2.filter((d) => d.ok).length}/${score.c2.length} c3=${score.c3.length} c4=${score.c4Residue.length} leaks=${sampleLeakCount}`,
    );
  }

  return records;
}

async function main(): Promise<void> {
  // Generic across providers: run.ts's own PanelRig, not ollamaRig.ts's
  // warmUpAndReport() directly — a hardcoded Ollama warm-up ran even under
  // EVAL_PROVIDER=gemini before Phase 3, hitting an irrelevant daemon before
  // ever reaching Gemini. Gemini's warmUp() is where the fail-loud
  // GEMINI_API_KEY check lives (doc: "fail loudly at startup if it's unset").
  console.log(`warming up ${rig.id}:${rig.model}...`);
  const warm = await rig.warmUp();
  console.log(warm.ok ? `warm-up ok in ${(warm.elapsedMs / 1000).toFixed(1)}s` : `warm-up FAILED after ${(warm.elapsedMs / 1000).toFixed(1)}s: ${warm.error}`);

  const engine = await createEvalEngine();
  const allDatasets = await loadEvalDatasets(engine);
  const panelKey = loadPanelKey();

  // The uncapped cell (doc, "Panel arm and the uncapped cell") is gated to
  // Gemini — the local Ollama rig's 32k num_ctx can't run it at all, and
  // `totalPanelCalls()` must stay at 250 for the Ollama pass regardless.
  const uncapped = rig.id === 'gemini' ? UNCAPPED_CELLS : [];
  const runs: Array<{ datasetId: string; cells: VariantCell[] }> = [
    ...IN_SCOPE_FIXTURES.map((datasetId) => ({ datasetId, cells: [...PHASE1_CELLS, ...uncapped] })),
    { datasetId: CEILING_FIXTURE, cells: [...CEILING_CELLS, ...uncapped] },
  ];

  const records: RunRecord[] = [];

  for (const { datasetId, cells } of runs) {
    if (DATASET_FILTER && DATASET_FILTER !== datasetId) continue;
    const dataset = allDatasets.find((d) => d.id === datasetId);
    if (!dataset) throw new Error(`fixture not found: ${datasetId}`);
    if (dataset.tables.length !== 1) {
      throw new Error(
        `${datasetId}: the row ladder assumes a single table (doc scope: "one table whose rows fit in the model's context"), got ${dataset.tables.length}`,
      );
    }
    const [table] = dataset.tables;

    const computedStats = await computeStats(engine, dataset.tables);
    await verifyStats(engine, dataset.tables, computedStats); // kill criterion (a) — hard gate

    const tableInsights = await computeTableInsights(engine, dataset.tables);
    const offerCandidates = buildOfferCandidates(rankNextActions(dataset.tables, tableInsights));

    const allRows = await loadAllRows(engine, table);
    const vocabulary = [table.tableName, ...(table.columns ?? []).map((c) => c.name)];

    const panelKeyEntry = panelKey[datasetId];
    if (!panelKeyEntry) throw new Error(`PANEL-KEY.json has no entry for ${datasetId} — run npm run eval:grounding-ladder:key first`);

    console.log(`\n${datasetId}: ${table.rowCount} rows, ${computedStats.length} computed facts, ${cells.length} cells`);

    const ctx: DatasetContext = { datasetId, table, tables: dataset.tables, computedStats, panelKeyEntry, offerCandidates, allRows, vocabulary };

    for (const cell of cells) {
      if (CELL_FILTER && CELL_FILTER !== cell.id) continue;
      console.log(`  [${cell.id}] a1=${cell.a1} a2=${cell.a2} a3=${cell.a3} repeats=${cell.repeats}`);
      records.push(...(await runCell(ctx, cell)));
    }
  }

  // Non-ollama providers get their own results file (doc, "Panel arm and the
  // uncapped cell": "Results go to RESULTS-gemini.json") so a Gemini smoke
  // test doesn't clobber the Ollama arm's RESULTS.json.
  const resultsFile = rig.id === 'ollama' ? 'RESULTS.json' : `RESULTS-${rig.id}.json`;
  fs.writeFileSync(
    path.resolve(__dirname, resultsFile),
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        // Invariant 1 / D20/D45/D46/D59 (11-gemini-comparison-arm.md,
        // "Constraints that bind this arm"): third-party arms run only on the
        // five public §14 sample fixtures and are never evidence for a
        // rows-to-cloud product path. `null` for ollama, which runs under the
        // local-tier-only override instead (rows never leave the machine).
        scopeNote:
          rig.id === 'ollama'
            ? null
            : 'Public §14 sample fixtures only. No result here may be cited as evidence for a rows-to-cloud product path (Invariant 1 / D20/D45/D46/D59).',
        provider: rig.id,
        model: rig.model,
        temperature: rig.temperature,
        thinkingConfig: rig.thinkingConfig ?? null,
        contextWindow: rig.contextWindow,
        keepAlive: KEEP_ALIVE,
        warmUp: warm,
        closureRules: CLOSURE_RULES,
        trendGeneralisationTerms: TREND_GENERALISATION_TERMS,
        records,
      },
      null,
      2,
    ),
  );

  console.log('\n=== Summary ===');
  console.log(`total calls: ${records.length}`);
  console.log(`compliant: ${records.filter((r) => r.compliant).length}/${records.length}`);
  console.log(`truncated (kill criterion b): ${records.filter((r) => r.truncated).length}`);
  console.log(`C1 disagreements (kill criterion i): ${records.reduce((n, r) => n + r.c1DisagreementCount, 0)}`);
  console.log(`C3 occurrences (kill criterion j): ${records.reduce((n, r) => n + r.c3OccurrenceCount, 0)}`);
  console.log(`slot misassignments (kill criterion k): ${records.reduce((n, r) => n + r.c2SlotMisassigned, 0)}`);
  console.log(`sample leaks (kill criterion e): ${records.reduce((n, r) => n + r.sampleLeakCount, 0)}`);
  console.log(`closure rules applied: ${CLOSURE_RULES.length} (kill criterion f)`);
  console.log(
    `trend-generalisation guard: ${records.reduce((n, r) => n + r.trendGeneralisationCount, 0)} claims hit, ${TREND_GENERALISATION_TERMS.length} terms (unshipped — measurement only)`,
  );

  await engine.close();
}

// Guarded so the riders (11-gemini-comparison-arm.md Phase 5) can import
// `runCell`/`DatasetContext`/etc. from this module — for exact prompt/scoring
// parity with the main cross — without triggering a full paid run as an
// import side effect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
