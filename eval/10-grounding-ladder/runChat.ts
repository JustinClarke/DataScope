// Phase 1's chat arm (10-grounding-ladder.md, "Three measurement surfaces, one
// substrate"). The cheap oracle: the same row ladder the panel arm climbs, run
// through the product's own NL→SQL pipeline (`askAI`, driven by
// eval/harness/runHarness) against the 34 labeled questions on the three
// single-table §14 fixtures, scored by the existing D58 scorer — exec-rate,
// result-correctness by execution-match, repair-rate. No hand audit, no answer
// key of its own, no new scoring path (D58: the harness never re-implements
// scoring against a second pipeline).
//
// **Scope: A1 only.** Kill criterion (g) and the Verdict's own deliverable ask
// this arm for a curve "across rungs", and that is what it measures. A2
// (OPAQUE) is deliberately not run here: anonymised table/column names make the
// emitted SQL unexecutable against the real fixtures, so every cell would score
// zero for a reason that has nothing to do with reading-vs-recall. A3
// (CORRUPTED/DELETED) has no purchase either — this path cites no computed
// facts. Both stay panel-arm axes; say so in the verdict rather than implying
// the chat arm swept the same cross.
//
// Rows reach the model through `assemble()` — the same budgeted assembler the
// panel arm uses, appended to the system message the pipeline already builds,
// so "prompt assembly" means one thing across both arms.
//
// Env: EVAL_DATASET (one fixture), EVAL_RUNG (one of 0/10/100/max),
// EVAL_REPEAT_CAP (caps N). Rig vars live in ollamaRig.ts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine, type EvalEngine } from '../duckdb/duckdb';
import { loadEvalDatasets } from '../dataset/tables';
import { QUESTIONS } from '../dataset/questions';
import { quoteIdentifier } from '../../src/services/ingestion';
import { askAI } from '../../src/services/ai';
import { createOllamaProvider } from '../../src/services/ollamaProvider';
import { scoreTurn, summarize, type QuestionScore } from '../harness/scorer';
import { assemble, estimateTokens } from './assemble';
import { installRigDispatcher, warmUpAndReport, KEEP_ALIVE, NUM_CTX, OLLAMA_BASE_URL, OLLAMA_MODEL } from './ollamaRig';
import type { AIProvider, ClassifiedColumn, ProviderMessage, TableRegistryEntry } from '../../src/types';
import type { RowsSent } from './variants';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

installRigDispatcher();

/** The doc's own three in-scope chat fixtures — the single-table ones the row
 * ladder is defined on (titanic 12 + product_reviews 10 + stock_prices 12 = the
 * doc's 34 questions). */
const CHAT_FIXTURES = ['titanic', 'product_reviews', 'stock_prices'] as const;
const RUNGS: RowsSent[] = [0, 10, 100, 'max'];
/** Doc: 34 questions × 4 rungs × N=3 = 408 chat calls. */
const REPEATS = 3;
/** Headroom for the pipeline's own remaining turns (tool call, tool result,
 * final answer) on top of the assembled prompt. */
const RESPONSE_RESERVE_TOKENS = 2000;

const DATASET_FILTER = process.env.EVAL_DATASET;
const RUNG_FILTER = process.env.EVAL_RUNG;
const REPEAT_CAP = process.env.EVAL_REPEAT_CAP ? Number(process.env.EVAL_REPEAT_CAP) : undefined;

interface RigCall {
  promptTokens: number;
  responseTokens: number;
}

/**
 * `createOllamaProvider` speaks the product's own wire shape and is what the
 * chat path actually runs on — but it sets no `num_ctx` (it has no reason to;
 * a browser talking to a user's daemon takes the daemon's default). This
 * experiment's whole subject is context, so the rig's num_ctx/keep_alive are
 * injected into every request body here, and Ollama's own token counts are read
 * back off each response: kill criterion (b) is asserted on `prompt_eval_count`,
 * never on an estimate.
 */
function rigFetch(calls: RigCall[]): typeof fetch {
  return async (input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    const withRig = JSON.stringify({
      ...body,
      keep_alive: KEEP_ALIVE,
      options: { ...((body.options as Record<string, unknown>) ?? {}), num_ctx: NUM_CTX },
    });
    const res = await fetch(input, { ...init, body: withRig });
    if (!res.ok) return res;
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { prompt_eval_count?: number; eval_count?: number };
      calls.push({ promptTokens: parsed.prompt_eval_count ?? -1, responseTokens: parsed.eval_count ?? -1 });
    } catch {
      calls.push({ promptTokens: -1, responseTokens: -1 });
    }
    return new Response(text, { status: res.status, headers: res.headers });
  };
}

/** Appends the assembled row-evidence section to the system message the
 * pipeline built (schema card + dialect rules), leaving every other stage
 * untouched — the arm varies prompt assembly and nothing else. */
function withRowEvidence(provider: AIProvider, rowEvidence: string): AIProvider {
  if (rowEvidence === '') return provider;
  return {
    id: provider.id,
    complete(messages: ProviderMessage[], tools, options) {
      const augmented = messages.map((m, i) =>
        i === 0 && m.role === 'system' ? { ...m, content: `${m.content}\n\n${rowEvidence}` } : m,
      );
      return provider.complete(augmented, tools, options);
    },
  };
}

async function loadAllRows(engine: EvalEngine, table: TableRegistryEntry): Promise<Record<string, unknown>[]> {
  const result = await engine.execute(`SELECT * FROM ${quoteIdentifier(table.tableName)}`);
  return result.rows.map((row) => Object.fromEntries(result.columnNames.map((name, i) => [name, row[i]])));
}

/** TSV, greedily packed to budget — the panel arm's own encoding and its own
 * "max-that-fits" rule, so the two arms' rungs mean the same thing. */
function packRowsToBudget(
  rows: Record<string, unknown>[],
  columns: ClassifiedColumn[],
  budgetTokens: number,
): { text: string; rowsSent: number } {
  if (rows.length === 0 || budgetTokens <= 0) return { text: '', rowsSent: 0 };
  const header = columns.map((c) => c.name).join('\t');
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
  if (sent === 0) return { text: '', rowsSent: 0 };
  const section = `ROW EVIDENCE (${sent} of ${rows.length} rows, TSV — context only, never a substitute for querying the table):\n${text}`;
  return { text: assemble([{ name: 'row-evidence', content: section }], budgetTokens).prompt, rowsSent: sent };
}

interface ChatRecord extends QuestionScore {
  dataset: string;
  rung: RowsSent;
  repeat: number;
  rowsSent: number;
  rowsAvailable: number;
  numCtx: number;
  maxPromptTokens: number;
  /** Kill criterion (b): any turn whose prompt hit num_ctx is a failed run. */
  truncated: boolean;
}

async function main(): Promise<void> {
  const warm = await warmUpAndReport();

  const engine = await createEvalEngine();
  const datasets = await loadEvalDatasets(engine);
  const records: ChatRecord[] = [];
  const repeats = REPEAT_CAP ? Math.min(REPEAT_CAP, REPEATS) : REPEATS;

  for (const datasetId of CHAT_FIXTURES) {
    if (DATASET_FILTER && DATASET_FILTER !== datasetId) continue;
    const dataset = datasets.find((d) => d.id === datasetId);
    if (!dataset) throw new Error(`fixture not found: ${datasetId}`);
    const [table] = dataset.tables;
    const questions = QUESTIONS.filter((q) => q.dataset === datasetId);
    const allRows = await loadAllRows(engine, table);

    for (const rung of RUNGS) {
      if (RUNG_FILTER && RUNG_FILTER !== String(rung)) continue;
      const slice = rung === 'max' ? allRows : allRows.slice(0, rung);

      for (let repeat = 1; repeat <= repeats; repeat++) {
        for (const question of questions) {
          const calls: RigCall[] = [];
          const provider = createOllamaProvider({
            baseUrl: OLLAMA_BASE_URL,
            model: OLLAMA_MODEL,
            fetchImpl: rigFetch(calls),
          });
          const { text: rowEvidence, rowsSent } = packRowsToBudget(
            slice,
            table.columns ?? [],
            NUM_CTX - RESPONSE_RESERVE_TOKENS,
          );

          const turn = await askAI(question.question, {
            provider: withRowEvidence(provider, rowEvidence),
            tables: dataset.tables,
            runSql: (sql: string) => engine.execute(sql),
          });
          const score = await scoreTurn(engine, `rung-${rung}`, question.id, question.referenceSql, turn);
          const maxPromptTokens = calls.reduce((n, c) => Math.max(n, c.promptTokens), -1);

          records.push({
            ...score,
            dataset: datasetId,
            rung,
            repeat,
            rowsSent,
            rowsAvailable: allRows.length,
            numCtx: NUM_CTX,
            maxPromptTokens,
            truncated: maxPromptTokens >= NUM_CTX,
          });
        }

        const cell = records.filter((r) => r.dataset === datasetId && r.rung === rung && r.repeat === repeat);
        console.log(
          `  [${datasetId} rung=${rung} #${repeat}] rowsSent=${cell[0]?.rowsSent ?? 0} ` +
            `exec=${cell.filter((r) => r.execOk).length}/${cell.length} ` +
            `correct=${cell.filter((r) => r.resultCorrect === true).length}/${cell.length}` +
            `${cell.some((r) => r.truncated) ? ' TRUNCATED' : ''}`,
        );
      }
    }
  }

  // Per-rung summary through the harness's own summarizer — same metric
  // definitions as `npm run eval`, so the two reports are comparable.
  const perRung = RUNGS.filter((rung) => records.some((r) => r.rung === rung)).map((rung) => {
    const scores = records.filter((r) => r.rung === rung);
    return {
      rung,
      calls: scores.length,
      truncated: scores.filter((r) => r.truncated).length,
      ...summarize(`rung-${rung}`, scores, new Map()),
    };
  });

  fs.writeFileSync(
    path.resolve(__dirname, 'CHAT-RESULTS.json'),
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        ollamaModel: OLLAMA_MODEL,
        numCtx: NUM_CTX,
        keepAlive: KEEP_ALIVE,
        warmUp: warm,
        questionCount: records.length,
        perRung,
        records,
      },
      null,
      2,
    ),
  );

  console.log('\n=== Chat arm (kill criterion g) ===');
  for (const r of perRung) {
    console.log(
      `rung ${String(r.rung).padEnd(4)} calls=${String(r.calls).padStart(4)} ` +
        `exec=${(r.execRate * 100).toFixed(1)}% correct=${(r.correctnessRate * 100).toFixed(1)}% ` +
        `repair=${r.repairRate === null ? 'n/a' : `${(r.repairRate * 100).toFixed(1)}%`} truncated=${r.truncated}`,
    );
  }

  await engine.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
