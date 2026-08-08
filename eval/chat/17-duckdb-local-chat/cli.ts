// Minimal interactive REPL (experiment doc, "Commands for the first CLI can
// be minimal"). Layers directly on the same bootstrap/chat/session library
// code the scorer (score.ts) drives — this file adds no new chat logic, only
// a terminal loop around it. Not part of the scored path.
import { createInterface } from 'node:readline/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrap } from './bootstrap';
import { openSealedRuntime, type SealedRuntime } from './database';
import { runTurn, type ExecutedQuery } from './chat';
import { buildTurnSummary, createSession, recordTurn, resolveStandaloneQuestion, type Session } from './session';
import { CHAT_THINK, OLLAMA_BASE_URL, resolveModel } from './ollama';
import { buildSchemaPrompt } from './catalog';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = join(HERE, '..', '..', '..', 'public', 'samples', 'ecommerce');
const DB_PATH = join(HERE, 'runs', 'dev', 'database.duckdb');

function printResult(sql: string, result: ExecutedQuery): void {
  console.log(`  sql: ${sql}`);
  console.log(`  ${result.columnNames.join(' | ')}`);
  for (const row of result.rows.slice(0, 20)) console.log(`  ${row.join(' | ')}`);
  if (result.rows.length > 20) console.log(`  ... (${result.rows.length - 20} more rows in this preview)`);
  if (result.rowTruncated) console.log(`  (preview capped at ${result.rows.length} of ${result.totalCount} total rows)`);
}

async function main(): Promise<void> {
  let model = process.env.CHAT_MODEL ?? 'qwen3:4b';
  let showSql = false;

  console.log(`Resolving ${model} against ${OLLAMA_BASE_URL} ...`);
  const resolved = await resolveModel(model);
  console.log(
    `Using ${resolved.tag} (${resolved.parameterSize ?? '?'}, ${resolved.quantizationLevel ?? '?'}), thinking ${CHAT_THINK ? 'ON' : 'off'}.`,
  );

  mkdirSync(dirname(DB_PATH), { recursive: true });
  if (!existsSync(DB_PATH)) {
    console.log(`Bootstrapping ${DB_PATH} from ${DATASET_DIR} ...`);
    const report = await bootstrap(DB_PATH, DATASET_DIR);
    console.log(`Loaded ${report.tables.map((t) => `${t.table}=${t.loadedRowCount}`).join(', ')}.`);
  }

  const runtime: SealedRuntime = await openSealedRuntime(DB_PATH);
  let session: Session = createSession();
  let turnId = 0;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(
    '\nChatting with the ecommerce dataset (customers, orders, order_items, products).\n' +
      'Commands: /schema  /sql on|off  /model <tag>  /reset  /quit\n',
  );

  try {
    while (true) {
      let line: string;
      try {
        line = (await rl.question('> ')).trim();
      } catch (error) {
        // Input stream closed (EOF, e.g. Ctrl-D or a piped-input source that
        // ended) while no line was pending — exit the loop instead of
        // crashing with ERR_USE_AFTER_CLOSE.
        if (error instanceof Error && error.message.includes('readline was closed')) break;
        throw error;
      }
      if (line.length === 0) continue;
      if (line === '/quit') break;
      if (line === '/schema') {
        console.log(buildSchemaPrompt());
        continue;
      }
      if (line === '/reset') {
        session = createSession();
        turnId = 0;
        console.log('Session reset.');
        continue;
      }
      if (line === '/sql on' || line === '/sql off') {
        showSql = line === '/sql on';
        console.log(`SQL display ${showSql ? 'on' : 'off'}.`);
        continue;
      }
      if (line.startsWith('/model ')) {
        const tag = line.slice('/model '.length).trim();
        try {
          const r = await resolveModel(tag);
          model = tag;
          console.log(`Switched to ${r.tag} (${r.parameterSize ?? '?'}, ${r.quantizationLevel ?? '?'}).`);
        } catch (error) {
          console.log(`Could not switch: ${error instanceof Error ? error.message : String(error)}`);
        }
        continue;
      }
      if (line.startsWith('/')) {
        console.log(`Unknown command: ${line}`);
        continue;
      }

      turnId += 1;
      const { standaloneQuestion } = await resolveStandaloneQuestion(model, line, session);
      if (showSql && standaloneQuestion !== line) console.log(`  (resolved: ${standaloneQuestion})`);

      const result = await runTurn(model, standaloneQuestion, runtime);
      session = recordTurn(session, buildTurnSummary(turnId, line, standaloneQuestion, result));

      if (result.status === 'answered') {
        console.log(result.answer);
        if (showSql && result.sql && result.result) printResult(result.sql, result.result);
      } else if (result.status === 'unsupported') {
        console.log(`Can't answer that from this dataset: ${result.reason}`);
      } else if (result.status === 'refused') {
        console.log(`Refused: ${result.reason}`);
      } else {
        console.log(`Error: ${result.reason}`);
      }
    }
  } finally {
    rl.close();
    runtime.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
