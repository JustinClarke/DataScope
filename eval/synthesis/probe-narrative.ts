// S0 Probe A research variant — structure-only vs. structure+rows, against the
// open ai-router endpoint. Throwaway, D18 discipline: never wired into product
// code, outside eval:synthesis's pass/fail gate, and not itself the S0 verdict.
//
// Why this can't run through requestSynthesis/synthesisProvider: that seam's
// ModelAnswer contract is `{headline, actions}`, reassembled from the client's
// baseline (ADR-010) — it cannot emit free prose no matter what it's given, so it
// can't answer "does more data help write §4's narrative." This script asks the
// ai-router endpoint instead (edge/handlers/ai-router.ts), which already carries
// open prompt content for the NL→SQL path — same Worker, sibling route, no new
// deploy.
//
// Row-upload authorization: 2026-07-26, explicit human instruction ("give the
// data to cloudflare as well to see if there is better ai synthesis"), confirmed
// unbounded/full-table for research purposes only and against synthetic/public
// §14 fixture data only — reopening the row-upload boundary
// `00-synthesis-and-limits-probe.md`'s Probe A section otherwise calls out of
// scope by default (D20/D45/D46/D59). This script is that authorized exception,
// not a precedent for anything else sending rows to the edge. Record the graded
// verdict in that probe doc, master-first, once read.
//
// Follow-up widening, same day/authorization ("push further on rows/freedom,
// let it have as much info/context/power over the data as you do"): the
// deployed ai-router's body cap was the actual ceiling on the run above (every
// dataset backed off to fit ~50KB, well under full table). `wrangler.toml`'s
// `env.staging.vars.AI_ROUTER_MAX_BODY_BYTES` is temporarily raised to 1MB so
// this script's own target below can approach *full* tables instead of a
// byte-capped prefix — the real ceiling this run measures is Mistral Small
// 3.1's 128K context, not our own artificial ceiling. Revert the wrangler.toml
// var once this data collection is done.
//
// Usage: `npm run eval:synthesis:narrative-probe` (needs the staging Worker).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine } from '../duckdb/duckdb';
import { loadEvalDatasets, type EvalDataset } from '../dataset/tables';
import { buildStructuralFacts } from '../../src/lib/structuralFacts';
import type { AiRouterRequest, AiRouterResponse, StructuralFacts } from '../../edge/protocol';
import type { EvalEngine } from '../duckdb/duckdb';
import type { TableRegistryEntry } from '../../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENDPOINT =
  process.env.VITE_EDGE_AI_ROUTER ?? 'https://datascope-edge-staging.justinclarke.workers.dev/ai-router';

// Margin under the temporarily-raised 1MB staging body cap (see header comment) —
// large enough that every §14 sample's full table fits without the fraction
// backoff below ever engaging for a size reason (a 4xx from the model's own
// context ceiling can still engage it).
const TARGET_PAYLOAD_BYTES = 950_000;

const NARRATIVE_SYSTEM_PROMPT = [
  "You write the opening one-paragraph summary of a dataset for a data-analysis app's",
  'landing screen. You are given the dataset\'s structure — table names, row counts,',
  'column names, types, null rates — and, when provided, a sample of actual rows from',
  'each table.',
  '',
  'Write ONE short paragraph (2-4 sentences) that: (1) names what kind of dataset this',
  'appears to be, (2) cites entity/row counts for the tables that matter, (3) states the',
  'covered date range if any date/timestamp-like column exists, and (4) names 2-3 concrete',
  'kinds of analysis this dataset is well-suited for — specific to what the data actually',
  'contains, not generic ("well-suited for X, Y, and Z").',
  '',
  "Only state what the structure (and any given rows) actually support. Do not invent a",
  "domain, a date range, or a recommendation the data doesn't back up. Prose only — no",
  'JSON, no bullet list, no headers.',
].join('\n');

type RouterOutcome = { text: string; servedBy: string } | { error: string };

function buildUserPrompt(
  datasetId: string,
  facts: StructuralFacts,
  sampleRows?: Record<string, Record<string, unknown>[]>,
): string {
  return JSON.stringify({
    dataset: datasetId,
    tables: facts.tables,
    ...(sampleRows ? { sampleRows } : {}),
  });
}

async function fetchAllRows(engine: EvalEngine, tableName: string): Promise<Record<string, unknown>[]> {
  const result = await engine.execute(`SELECT * FROM "${tableName}"`);
  return result.rows.map((row) => Object.fromEntries(result.columnNames.map((name, i) => [name, row[i]])));
}

async function callAiRouter(userPrompt: string): Promise<RouterOutcome> {
  const request: AiRouterRequest = {
    sessionId: crypto.randomUUID(),
    routing: 'free-tier-first',
    messages: [
      { role: 'system', content: NARRATIVE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    tools: [],
    stream: false,
  };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? `http ${res.status}` };
  }
  const body = (await res.json()) as AiRouterResponse;
  return {
    text: body.turn.kind === 'text' ? body.turn.text : '(unexpected tool-call turn)',
    servedBy: body.servedBy,
  };
}

/**
 * Sends structure + as many rows as fit the endpoint's body cap — "full table"
 * when that fits, backing off (recorded, not hidden) when it doesn't. Answers
 * Probe A's implicit third question: what ceiling does the endpoint itself set.
 */
async function sendWithRowBudget(
  datasetId: string,
  facts: StructuralFacts,
  tables: TableRegistryEntry[],
  fullRows: Record<string, Record<string, unknown>[]>,
): Promise<{ result: RouterOutcome; rowsSent: Record<string, number>; totalRows: number; bytes: number }> {
  let fraction = 1;
  for (let attempt = 0; attempt < 8; attempt++) {
    const sampleRows: Record<string, Record<string, unknown>[]> = {};
    for (const t of tables) {
      const n = Math.max(1, Math.round(t.rowCount * fraction));
      sampleRows[t.tableName] = fullRows[t.tableName].slice(0, n);
    }
    const prompt = buildUserPrompt(datasetId, facts, sampleRows);
    const bytes = Buffer.byteLength(prompt, 'utf8');
    if (bytes > TARGET_PAYLOAD_BYTES) {
      fraction *= TARGET_PAYLOAD_BYTES / bytes;
      continue;
    }
    const result = await callAiRouter(prompt);
    const totalRows = Object.values(sampleRows).reduce((sum, rows) => sum + rows.length, 0);
    if (
      'error' in result &&
      (result.error === 'bad-request' ||
        result.error.startsWith('http 4') ||
        // 'upstream-error' (502) is also how a model-side context-length
        // rejection surfaces through the router — found live: stock_prices
        // (236KB), weather (382KB) and ecommerce (481KB) all hit this while
        // titanic (124KB) and product_reviews (69KB) didn't, so it backs off
        // the same as a body-cap 4xx to find the model's actual ceiling.
        result.error === 'upstream-error')
    ) {
      fraction *= 0.5;
      continue;
    }
    const rowsSent = Object.fromEntries(Object.entries(sampleRows).map(([k, v]) => [k, v.length]));
    return { result, rowsSent, totalRows, bytes };
  }
  return { result: { error: 'could not fit any row sample under the body cap' }, rowsSent: {}, totalRows: 0, bytes: 0 };
}

interface DatasetResult {
  dataset: string;
  structureOnly: RouterOutcome;
  withRows: RouterOutcome & { rowsSent: Record<string, number>; totalRowsAvailable: number; bytes: number };
}

async function main() {
  const engine = await createEvalEngine();
  const datasets: EvalDataset[] = await loadEvalDatasets(engine);
  const results: DatasetResult[] = [];

  for (const dataset of datasets) {
    const facts = buildStructuralFacts(dataset.tables);
    const totalRowsAvailable = dataset.tables.reduce((sum, t) => sum + t.rowCount, 0);

    console.log(`\n=== ${dataset.id} ===`);

    const structureOnly = await callAiRouter(buildUserPrompt(dataset.id, facts));
    console.log('-- structure-only --');
    console.log('text' in structureOnly ? structureOnly.text : `ERROR: ${structureOnly.error}`);

    const fullRows: Record<string, Record<string, unknown>[]> = {};
    for (const t of dataset.tables) fullRows[t.tableName] = await fetchAllRows(engine, t.tableName);

    const { result: withRowsResult, rowsSent, bytes } = await sendWithRowBudget(
      dataset.id,
      facts,
      dataset.tables,
      fullRows,
    );
    const sentCount = Object.values(rowsSent).reduce((a, b) => a + b, 0);
    const capped = sentCount < totalRowsAvailable;
    console.log(
      `-- structure + rows (${sentCount}/${totalRowsAvailable} rows${capped ? ', capped by body limit' : ', full table'}, ${bytes}B) --`,
    );
    console.log('text' in withRowsResult ? withRowsResult.text : `ERROR: ${withRowsResult.error}`);

    results.push({
      dataset: dataset.id,
      structureOnly,
      withRows: { ...withRowsResult, rowsSent, totalRowsAvailable, bytes },
    });
  }

  const outFile = process.env.NARRATIVE_PROBE_OUT ?? 'NARRATIVE-PROBE-RESULTS.json';
  fs.writeFileSync(
    path.resolve(__dirname, outFile),
    JSON.stringify({ ranAt: new Date().toISOString(), endpoint: ENDPOINT, results }, null, 2),
  );
  console.log(`\nWritten to eval/synthesis/${outFile}`);
  await engine.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
