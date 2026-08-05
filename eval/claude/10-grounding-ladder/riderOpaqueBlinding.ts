// R-B — does OPAQUE actually blind the model? (11-gemini-comparison-arm.md,
// Phase 5 riders). Deliberately NOT the panel path: no PanelAnswer, no
// scorePanel, never written to RESULTS-*.json — its own {guess, confidence,
// reasoning} contract (doc's own D58 boundary note for this rider), scored by
// a single keyword rule pre-registered below, before any answer is read.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine } from '../../duckdb/duckdb';
import { loadEvalDatasets } from '../../dataset/tables';
import { buildSchemaCard, packRowsToBudget, loadAllRows } from './run';
import { buildOpaqueMapping } from './opaque';
import { geminiPanelRig, GEMINI_CONTEXT_WINDOW, requireApiKey } from './geminiRig';
import type { PanelJsonSchema } from './panelSchema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.EVAL_PROVIDER && process.env.EVAL_PROVIDER !== 'gemini') {
  throw new Error('R-B only makes sense against the frontier instrument (Gemini) — do not set EVAL_PROVIDER to anything else.');
}
requireApiKey();

// Pre-registered before any answer is read (doc's own kill-line requirement:
// "a fixed identifying term list... written before the run, not after reading
// the answers"). product_reviews has no documented real-world source
// anywhere in this repo (its columns — ReviewId/ProductId/Rating/ReviewText/
// ReviewDate — read as a synthetic/generated sample, not an attributed public
// corpus), so its list is a defensible guess at plausible review-platform
// names a model might invoke, not a confirmed provenance term the way
// titanic's is.
const IDENTIFYING_TERMS: Record<string, string[]> = {
  titanic: ['titanic', 'lusitania'],
  product_reviews: ['amazon', 'yelp', 'kaggle', 'flipkart', 'walmart', 'e-commerce review', 'product review dataset'],
};

const FIXTURES = ['titanic', 'product_reviews'] as const;
const RUNGS = [0, 'max'] as const;
type Rung = (typeof RUNGS)[number];
const N = 10;
const RESPONSE_RESERVE_TOKENS = 1500;

interface OpaqueGuess {
  guess: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

const OPAQUE_GUESS_SCHEMA: PanelJsonSchema = {
  type: 'object',
  properties: {
    guess: { type: 'string' },
    confidence: { type: 'string' },
    reasoning: { type: 'string' },
  },
  required: ['guess', 'confidence', 'reasoning'],
};

function parseGuess(raw: string): OpaqueGuess {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model output');
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  const { guess, confidence, reasoning } = parsed;
  if (typeof guess !== 'string' || typeof confidence !== 'string' || typeof reasoning !== 'string') {
    throw new Error('missing guess/confidence/reasoning');
  }
  const conf = confidence.toLowerCase();
  const normalizedConf: OpaqueGuess['confidence'] = conf === 'high' || conf === 'medium' || conf === 'low' ? conf : 'low';
  return { guess, confidence: normalizedConf, reasoning };
}

function buildSystemPrompt(): string {
  return [
    'You are shown a database schema and, sometimes, a sample of its raw rows. Table and column names have',
    'been replaced with anonymised tokens (e.g. "table_a", "col_3"), but every data VALUE shown is real and unaltered.',
    '',
    'Task: based on the structure and any visible values, identify what real-world dataset this is, if you',
    'recognize it. If you do not recognize it, say so plainly in "guess" (e.g. "unknown") — do not fabricate',
    'a plausible-sounding answer.',
    '',
    'Answer with ONLY this JSON, no prose, no code fences:',
    '{"guess": "...", "confidence": "high"|"medium"|"low", "reasoning": "..."}',
  ].join('\n');
}

function isHit(guess: string, fixture: string): boolean {
  const terms = IDENTIFYING_TERMS[fixture] ?? [];
  const lower = guess.toLowerCase();
  return terms.some((t) => lower.includes(t));
}

interface BlindingRecord {
  fixture: string;
  rung: Rung;
  repeat: number;
  guess: string;
  confidence: string;
  reasoning: string;
  hit: boolean;
  promptTokens: number;
  responseTokens: number;
}

async function main(): Promise<void> {
  const engine = await createEvalEngine();
  const allDatasets = await loadEvalDatasets(engine);
  const records: BlindingRecord[] = [];

  for (const fixtureId of FIXTURES) {
    const dataset = allDatasets.find((d) => d.id === fixtureId);
    if (!dataset) throw new Error(`${fixtureId} not found`);
    const [table] = dataset.tables;
    const mapping = buildOpaqueMapping(dataset.tables);
    const nameFor = (n: string) => mapping.toOpaque.get(n) ?? n;
    const schemaCard = buildSchemaCard(table, nameFor);
    const allRows = await loadAllRows(engine, table);

    for (const rung of RUNGS) {
      const rowEvidence =
        rung === 'max'
          ? packRowsToBudget(allRows, table.columns ?? [], nameFor, GEMINI_CONTEXT_WINDOW - RESPONSE_RESERVE_TOKENS - 500).text
          : '';
      const user = [schemaCard, rowEvidence].filter(Boolean).join('\n\n');
      const system = buildSystemPrompt();

      console.log(`\n[${fixtureId} rows=${rung}]`);
      for (let repeat = 1; repeat <= N; repeat++) {
        const call = await geminiPanelRig.call(system, user, OPAQUE_GUESS_SCHEMA);
        try {
          const parsed = parseGuess(call.content);
          const hit = isHit(parsed.guess, fixtureId);
          records.push({
            fixture: fixtureId,
            rung,
            repeat,
            guess: parsed.guess,
            confidence: parsed.confidence,
            reasoning: parsed.reasoning,
            hit,
            promptTokens: call.promptTokens,
            responseTokens: call.responseTokens,
          });
          console.log(`  #${repeat} guess="${parsed.guess}" confidence=${parsed.confidence} hit=${hit}`);
        } catch (err) {
          console.error(`  #${repeat} [parse failure] raw="${call.content}" err=${String(err)}`);
          records.push({
            fixture: fixtureId,
            rung,
            repeat,
            guess: '<parse failure>',
            confidence: 'low',
            reasoning: String(err),
            hit: false,
            promptTokens: call.promptTokens,
            responseTokens: call.responseTokens,
          });
        }
      }
    }
  }

  await engine.close();

  const summary: Record<string, unknown> = {};
  for (const fixtureId of FIXTURES) {
    for (const rung of RUNGS) {
      const cell = records.filter((r) => r.fixture === fixtureId && r.rung === rung);
      const hits = cell.filter((r) => r.hit);
      summary[`${fixtureId}/rows=${rung}`] = {
        n: cell.length,
        hitRate: cell.length ? hits.length / cell.length : null,
        hitConfidences: hits.map((h) => h.confidence),
      };
    }
  }

  const out = {
    ranAt: new Date().toISOString(),
    rider: 'R-B — does OPAQUE blind the model? (11-gemini-comparison-arm.md, Phase 5)',
    note:
      'Not the panel path: no PanelAnswer, no scorePanel, never written to RESULTS-*.json (D58 boundary). ' +
      "Keyword lists pre-registered before this run (see IDENTIFYING_TERMS in the source) — product_reviews' " +
      'list is a plausible-guess set, not a confirmed real-world provenance, since no source corpus is ' +
      'documented anywhere in this repo for that fixture. Kill line, stated in advance: any hit rate above 0 ' +
      'at rows=0 means anonymisation leaks through column statistics alone; a hit rate that rises from rows=0 ' +
      'to rows=max localises the leak to row values rather than the schema.',
    identifyingTerms: IDENTIFYING_TERMS,
    records,
    summary,
  };
  fs.writeFileSync(path.resolve(__dirname, 'OPAQUE-BLINDING-gemini.json'), JSON.stringify(out, null, 2));

  console.log('\n=== R-B summary ===');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
