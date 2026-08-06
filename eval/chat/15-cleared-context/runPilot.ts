// The pilot runner — § Task set and repetitions, run order #1: "one unscored
// shared phase-one trajectory per task, forked into both arms. Use it only to
// repair mechanical failures and measure briefing/token sizes." Explicitly
// gated behind the harness (README: "start[s] only once this directory's
// harness is frozen") and behind task authoring (`tasks.ts`), both now done.
//
// This is a CLI entrypoint, not a library the other checkpoints import —
// nothing else in this directory depends on it. It wires together, per task:
//
//   - a fresh in-process DuckDB `Executor` loaded with the frozen fixture,
//     for the analyst core the model actually calls tools against;
//   - a fresh `EvalEngine` hosting only the `analysis.*` ledger schema — the
//     two are separate DuckDB instances on purpose. The ledger never queries
//     `orders`/`customers` itself (every row it stores is a JSON blob of
//     something the analyst core already computed), so there is nothing for
//     a shared connection to buy and one bad `run_sql` call in a task has no
//     way to reach the ledger's own tables;
//   - `qwen3Provider.ts`'s live-host provider, adapted to the `MeteredComplete`
//     shape `forkedHarness.ts` expects;
//   - `tasks.ts`'s gold file as that task's `checkRequirements`.
//
// Every task gets its own pair of engines. The doc's "clone the
// ledger/result-store snapshot for two isolated phase-two branches" is
// `forkedHarness.ts`'s concern *within* one task (arm-tagged rows on one
// engine, see that file's header); *across* tasks there is no snapshot to
// clone at all — a fresh pair is cheaper to reason about than resetting one.
//
// What this file deliberately does not do: choose `maxBriefingBytes` or
// `num_ctx` as frozen numbers. § Midpoint briefing contract reserves the
// briefing ceiling for pilot measurement ("size is an input, not an outcome"),
// and § What is held constant reserves `num_ctx` for the same pass — sizing
// the worst case "is what the pilot's briefing/token measurement is already
// for." This runner takes both as CLI-overridable inputs with a generous,
// clearly-labeled provisional default and prints what it actually observed,
// so a human reads the pilot's own report before freezing either number.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAnalystCore } from '../../../src/lib/analyst/core';
import { connectAnalystMcp, type AnalystMcpSession } from '../../../src/lib/analyst/mcp/connect';
import { isOpError } from '../../../src/lib/analyst/types';
import type { AIProvider, ProviderMessage } from '../../../src/types';
import { createHarnessCatalog } from '../../analyst/harnessCatalog';
import { FIXTURE_SQL, FIXTURE_TABLES } from '../../analyst/fixtures';
import { createWasmConformanceExecutor, type ClosableExecutor } from '../../analyst/wasmExecutor';
import { createEvalEngine, type EvalEngine } from '../../duckdb/duckdb';
import type { CallUsage, RoundAccounting, TaskOutcome } from './contracts';
import { createLedgerSchema, getRoundAccounting, insertRequirement } from './ledger';
import { createGoldFileChecker } from './goldFile';
import { runExperiment15A, type Experiment15AResult, type MeteredComplete } from './forkedHarness';
import { composeOriginalTask, DATASET_REVISION, OPERATING_MANUAL, TASKS, taskById, type Task15A } from './tasks';
import { createUsageTrackedQwen3Provider, resolveQwen3, QWEN3_MODEL_TAG, OLLAMA_BASE_URL, NUM_CTX, type Qwen3CallUsage } from './qwen3Provider';

const here = path.dirname(fileURLToPath(import.meta.url));
const runsRoot = path.join(here, 'runs');

/**
 * Provisional, printed loudly as such — see file header. 8000 bytes is
 * generous relative to the packet's own bounded sections, not a measurement.
 */
const DEFAULT_MAX_BRIEFING_BYTES = 8000;

function parseArgs(argv: readonly string[]): { taskIds: string[]; maxBriefingBytes: number; numCtx: number } {
  const taskArgIndex = argv.indexOf('--task');
  const taskIds = taskArgIndex >= 0 ? [argv[taskArgIndex + 1]] : TASKS.map((t) => t.taskId);
  const briefingArgIndex = argv.indexOf('--max-briefing-bytes');
  const maxBriefingBytes = briefingArgIndex >= 0 ? Number(argv[briefingArgIndex + 1]) : DEFAULT_MAX_BRIEFING_BYTES;
  const numCtxArgIndex = argv.indexOf('--num-ctx');
  const numCtx = numCtxArgIndex >= 0 ? Number(argv[numCtxArgIndex + 1]) : NUM_CTX;
  return { taskIds, maxBriefingBytes, numCtx };
}

/** Adapts `qwen3Provider.ts`'s side-effecting `onUsage` callback into `forkedHarness.ts`'s `MeteredComplete` — one call in, one `{turn, usage}` out. Safe under sequential (never concurrent) use, which is all `runOperationLoop` and `requestCheckpoint` ever do: `onUsage` fires synchronously before `complete()` resolves, so the value captured here is always this call's own. Exported for `runPilot.test.ts`, which exercises this adapter against a scripted, non-Ollama `AIProvider`. */
export function toMeteredComplete(provider: AIProvider, captured: { last: Qwen3CallUsage | null }): MeteredComplete {
  return async (messages: ProviderMessage[], tools, options) => {
    captured.last = null;
    const turn = await provider.complete(messages, tools, options);
    if (!captured.last) throw new Error('qwen3 provider completed a call without reporting usage');
    const usage: CallUsage = captured.last;
    return { turn, usage };
  };
}

export async function buildSchemaSummary(session: AnalystMcpSession): Promise<string> {
  const outcome = await session.call('get_schema', {});
  if (isOpError(outcome)) throw new Error(`get_schema failed during setup: ${outcome.message}`);
  return outcome.rows.map((row) => `${row[0]}.${row[1]}: ${row[2]}`).join('\n');
}

export interface TaskEngines {
  executor: ClosableExecutor;
  ledgerEngine: EvalEngine;
  session: AnalystMcpSession;
}

export async function setUpTaskEngines(): Promise<TaskEngines> {
  const executor = await createWasmConformanceExecutor();
  for (const statement of FIXTURE_SQL) await executor.execute(statement);
  const core = createAnalystCore(executor, { authority: 'sealed', catalog: createHarnessCatalog(executor, FIXTURE_TABLES) });
  const session = await connectAnalystMcp(core);

  const ledgerEngine = await createEvalEngine();
  await createLedgerSchema(ledgerEngine);

  return { executor, ledgerEngine, session };
}

export async function tearDownTaskEngines(engines: TaskEngines): Promise<void> {
  await engines.session.close();
  await engines.executor.close();
  await engines.ledgerEngine.close();
}

export interface TaskRunReport {
  taskId: string;
  family: string;
  wallTimeMs: number;
  result:
    | { kind: 'satisfied_before_boundary' }
    | { kind: 'scored'; control: TaskOutcome; treatment: TaskOutcome }
    | { kind: 'runner_error'; message: string };
  roundAccounting: Partial<Record<'phase1' | 'control' | 'treatment', RoundAccounting | null>>;
}

export async function runOneTask(task: Task15A, complete: MeteredComplete, maxBriefingBytes: number): Promise<TaskRunReport> {
  const engines = await setUpTaskEngines();
  const startedAt = performance.now();

  try {
    for (const requirement of task.requirements) await insertRequirement(engines.ledgerEngine, requirement);
    const schemaSummary = await buildSchemaSummary(engines.session);
    const checkRequirements = createGoldFileChecker(task.goldFile);

    let result: Experiment15AResult;
    try {
      result = await runExperiment15A({
        originalTask: composeOriginalTask(task),
        operatingManual: OPERATING_MANUAL,
        datasetRevision: DATASET_REVISION,
        schemaSummary,
        session: engines.session,
        engine: engines.ledgerEngine,
        complete,
        checkRequirements,
        maxBriefingBytes,
      });
    } catch (error) {
      // Phase one itself has no try/catch inside `runExperiment15A` (only
      // phase two does — see that file's `runArm`), so a truncation or
      // transport failure before the midpoint would otherwise crash the
      // whole pilot instead of failing this one task. This is the runner's
      // half of § Early completion and terminal reasons' `harness_error`.
      return {
        taskId: task.taskId,
        family: task.family,
        wallTimeMs: performance.now() - startedAt,
        result: { kind: 'runner_error', message: error instanceof Error ? error.message : String(error) },
        roundAccounting: {},
      };
    }

    const roundAccounting = {
      phase1: await getRoundAccounting(engines.ledgerEngine, 1, 'shared'),
      control: await getRoundAccounting(engines.ledgerEngine, 2, 'control'),
      treatment: await getRoundAccounting(engines.ledgerEngine, 2, 'treatment'),
    };

    return { taskId: task.taskId, family: task.family, wallTimeMs: performance.now() - startedAt, result, roundAccounting };
  } finally {
    await tearDownTaskEngines(engines);
  }
}

function callsAndSeconds(reports: readonly TaskRunReport[]): { calls: number; seconds: number } {
  let calls = 0;
  for (const r of reports) {
    for (const key of ['phase1', 'control', 'treatment'] as const) {
      calls += r.roundAccounting[key]?.usage.calls ?? 0;
    }
  }
  const seconds = reports.reduce((sum, r) => sum + r.wallTimeMs, 0) / 1000;
  return { calls, seconds };
}

async function main(): Promise<void> {
  const { taskIds, maxBriefingBytes, numCtx } = parseArgs(process.argv.slice(2));
  console.log(`resolving ${QWEN3_MODEL_TAG} on ${OLLAMA_BASE_URL}...`);
  const model = await resolveQwen3();
  console.log(`resolved ${model.tag} digest=${model.digest} quant=${model.quantizationLevel} params=${model.parameterSize}`);
  console.log(`num_ctx=${numCtx} (${numCtx === NUM_CTX ? 'default' : 'overridden'}), maxBriefingBytes=${maxBriefingBytes} (PROVISIONAL — not frozen, see file header)`);

  // One `captured`/`provider`/`complete` triple for the whole run, not one per
  // task: `onUsage` is wired to `captured` here, once, correctly — building the
  // provider with a no-op `onUsage` and rebuilding a fresh capture per task
  // (an earlier version of this file) meant `toMeteredComplete` could never
  // observe a real usage report, since a provider's `onUsage` is bound once at
  // construction. Reuse across tasks is safe because every provider call in
  // this harness is awaited before the next begins — never concurrent.
  const captured: { last: Qwen3CallUsage | null } = { last: null };
  const provider = createUsageTrackedQwen3Provider({ numCtx, onUsage: (usage) => { captured.last = usage; } });
  const complete = toMeteredComplete(provider, captured);

  const reports: TaskRunReport[] = [];
  for (const taskId of taskIds) {
    const task = taskById(taskId);
    if (!task) {
      console.error(`unknown task id: ${taskId} (known: ${TASKS.map((t) => t.taskId).join(', ')})`);
      process.exitCode = 1;
      return;
    }
    console.log(`\n=== ${task.taskId} (${task.family}) ===`);
    const report = await runOneTask(task, complete, maxBriefingBytes);
    reports.push(report);
    console.log(JSON.stringify(report, null, 2));
  }

  const { calls, seconds } = callsAndSeconds(reports);
  console.log(`\n=== pilot summary ===`);
  console.log(`tasks run: ${reports.length}`);
  console.log(`provider calls: ${calls}, wall time: ${seconds.toFixed(1)}s, mean seconds/call: ${calls > 0 ? (seconds / calls).toFixed(2) : 'n/a'}`);
  console.log('§ Cost and feasibility envelope: use the mean seconds/call above to size the scored run before starting it.');

  const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const outDir = path.join(runsRoot, runId);
  await mkdir(outDir, { recursive: true });
  const reportPath = path.join(outDir, 'pilot-report.json');
  await writeFile(reportPath, JSON.stringify({ model, numCtx, maxBriefingBytes, reports }, null, 2));
  console.log(`\nwrote ${reportPath}`);
}

// Guarded so `runPilot.test.ts` can import this module's exports (`runOneTask`,
// `toMeteredComplete`, etc.) against a scripted fake provider without also
// triggering a live `resolveQwen3()` network call merely by importing the file.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
