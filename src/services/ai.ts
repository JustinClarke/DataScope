// The NL→SQL pipeline (§11.1) as an LLM tool-use loop, executing through the
// analyst core (§11.5, A0). One question in, one audited assistant turn out.
// The six stages:
//
//   1. normalize   — fuzzy-fix schema typos in the question (lib/inputNormalizer)
//   2. prune       — build a schema-only system prompt for the relevant tables (lib/schemaPrune)
//   3–5. loop      — the model calls `run_sql` (and `read_result` to page); each
//                    SQL call is dialect-linted (lib/sqlLint) before it runs,
//                    executed by the analyst core, and every outcome — rows or
//                    a structured `OpError` — goes back as an ordinary tool result
//   6. auto-chart  — the final result set goes through the shared chart translator
//
// **What A4 changed, and why each was load-bearing:**
//
//   - **Execution moved onto the analyst core** (`AskAIDeps.core`), not a bare
//     `runSql`. That is what gives the model result *handles*: a query is
//     materialized once, the model sees a preview plus the true row count, and
//     `read_result` pages the rest from that same materialization. The old path
//     sliced 20 rows and had no paging operation to ask with, so any answer
//     living past row 20 was unreachable. The core is also the one cancellation
//     path that actually reaches the engine, and the one door a derivation would
//     cross into `services/transforms.ts` — the guarded path — rather than
//     around it.
//   - **A turn carries any number of calls.** They execute in emitted order,
//     each producing its own correlated tool message, and the assistant message
//     carrying them is appended **verbatim before** any of them runs.
//   - **Tools are never withdrawn.** A row result does not switch the model into
//     a forced-answer mode; only a response with no tool calls ends the turn.
//     The small-model determinism that withdrawal used to provide now lives in
//     `toolLadder.ts` as a probe plus a ladder.
//   - **Errors go back structured** — the core's own `OpError`, `hint` included —
//     and the model recovers on an ordinary turn. Nothing here writes a repair
//     prompt or suggests what to do next.
//
// The chat never runs hidden SQL: every operation and every execution (timing,
// row count, error) is recorded on the returned turn's `attempts` — that
// transcript IS the trust surface (§11.1). Repair context is metadata-only by
// default (the error envelope + schema): stage 5's "data-sampled repair" (§11.3,
// 06-ai/03) is an opt-in escalation that additionally attaches up to 3 real rows
// from the question's relevant table(s) to the failure envelope, to help the
// model correct a data-shape assumption the error text alone doesn't show.
// Gated by `metadataOnlyRepair` (default true — off); every attempt that carried
// a sample records `sampledRows: true`, the transcript's audit trail for it.
import type {
  AIProvider,
  AITool,
  AITurn,
  ProviderMessage,
  ProviderToolCall,
  QueryResult,
  SqlAttempt,
  TableRegistryEntry,
  ChartRecommendation,
} from '../types';
import type { FkEdge } from '../lib/relationshipInference';
import type { AnalystCore } from '../lib/analyst/core';
import type { AnalystMcpSession } from '../lib/analyst/mcp/connect';
import { isOpError, type OpOutcome, type OpResult } from '../lib/analyst/types';
import { opError } from '../lib/analyst/errors';
import { ProviderQuotaExhaustedError } from './aiProvider';
import { SQL_TOOL } from './toolLadder';
import { normalizeQuestion } from '../lib/inputNormalizer';
import { pruneSchema } from '../lib/schemaPrune';
import { lintSql } from '../lib/sqlLint';
import { recommendChart as defaultRecommendChart } from '../lib/chartMapper';

// ── Ceilings, re-derived for an analyst loop (A4 defect v) ─────────────────
//
// The old numbers (8 round-trips, 3 cumulative SQL failures) were correct for a
// one-shot generate-execute-answer pipeline and wrong for a loop that is
// supposed to orient, look, compute and page before it answers. Re-derived, with
// the termination guarantee kept and named rather than dropped as an artifact:
//
// **The guarantee.** Every round-trip either ends the turn (no tool calls) or
// increments `providerCalls`, which is bounded by `MAX_PROVIDER_CALLS` and never
// decreases. So the turn terminates regardless of what the model does — the
// other two ceilings bound *cost*, not termination.

/**
 * THOR-style failure cap, re-scoped from cumulative to **consecutive**. A model
 * that cannot recover after three failures in a row is not recovering; but a
 * long analyst turn legitimately accumulates failures it *does* recover from,
 * and the cumulative form would kill it on the third across twenty good calls.
 */
export const MAX_CONSECUTIVE_FAILURES = 3;
/** Round-trips to the provider. This is the ceiling the termination guarantee rests on. */
export const MAX_PROVIDER_CALLS = 24;
/** Total operations across the turn — bounds cost when a model emits many calls per round-trip. */
export const MAX_TOOL_CALLS = 48;

/**
 * Rows the loop previews inline when the model names no `limit` of its own.
 *
 * Deliberately below the catalog's own default (`DEFAULT_PREVIEW_ROWS`, sized
 * for a UI panel): a tool result is *prompt* text, and the cloud router caps a
 * request body at 64 KB (§11.2). The old 20 was a correctness cliff because
 * nothing could reach row 21; that is what A1's handles fixed, so preview size
 * is now only a cost knob. 50 covers an ordinary grouped aggregate inline while
 * leaving the body cap real headroom, and anything larger is a paging job the
 * model can do with `read_result` — or by naming a bigger `limit` itself, which
 * still wins over this.
 */
export const DEFAULT_TOOL_PREVIEW_ROWS = 50;
// §21.6 provider timeout — a slow provider yields a clean error, never a hung chat.
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * A4 shipped a deliberate two-tool placeholder here — `run_sql` and
 * `read_result`, hand-written in this file — and said in a comment that
 * advertising two while the core accepted seventeen was a lie about the surface
 * that A5 would fix. This is that fix, and the fix is a deletion: there is no
 * tool list in this file any more.
 *
 * The loop now asks its MCP session what tools exist (`tools/list`) and gets the
 * catalog's own schemas back. The app's chat and an external agent read the same
 * declarations from the same server, so the two cannot drift — not because they
 * are kept in sync, but because there is only one of them (`lib/analyst/toolSchemas.ts`).
 */
const SYSTEM_INSTRUCTIONS =
  'You answer the user’s question about their data using only the tables below. You have a ' +
  'catalog of operations that compute over the dataset — inspect it, and choose what to call. ' +
  'DuckDB uses Postgres-dialect SQL: quote identifiers with "double quotes" (never backticks), ' +
  'use LIMIT (never TOP), and use || or CONCAT for strings. Call as many operations as the ' +
  'question needs — you may compute, read the rows, and compute again. Every result reports its ' +
  'true rowCount; when a result is not complete, call read_result with its resultId and ' +
  'nextOffset to see the rest. Failures come back structured, with a hint — correct and retry. ' +
  'When you have what you need, reply in plain language with no tool call.';

export interface AskAIDeps {
  provider: AIProvider;
  /**
   * The D3 client-orchestrated overflow (2026-07-23): an explicit free-tier-
   * first routing state pairs an Ollama-shaped BYOK field with the cloud
   * provider as primary. On a `ProviderQuotaExhaustedError`, the loop swaps to
   * this provider for the rest of the turn — the edge Worker cannot reach the
   * user's localhost, so the fallback has to happen here, not server-side.
   */
  overflowProvider?: AIProvider;
  /** The overflow provider's endpoint, named in the failure message if it too goes down. */
  overflowBaseUrl?: string;
  tables: TableRegistryEntry[];
  edges?: FkEdge[];
  /**
   * The MCP session every model-facing operation runs through (A5, D74a).
   *
   * A4 had this as the bare `AnalystCore`, which was right then and is one layer
   * too low now: the tool *schemas* have to come from the same place the calls
   * go, or the app is back to declaring its own list. The session answers both —
   * `tools()` is `tools/list`, `call()` is `tools/call` — over an in-process
   * linked pair, so the indirection costs a function call and buys the guarantee
   * that the in-tab surface is the external one.
   *
   * A `runSql` callback remains deliberately *not* the seam: result handles,
   * paging, engine-level cancellation and the guarded derive path all live
   * behind this door, and a callback can express none of them (A4 defects i, iv).
   */
  session: AnalystMcpSession;
  /**
   * The same core the session is built over, for the two things that are host
   * bookkeeping rather than model-facing operations: marking which results
   * informed the answer (D74h compaction retention), and the §11.3 repair
   * sample. Neither is something a model calls, so neither goes over the
   * protocol.
   */
  core: AnalystCore;
  /** Stage 6; defaults to the shared translator. Injectable for tests. */
  recommendChart?: (result: QueryResult, sql: string) => ChartRecommendation;
  /**
   * §11.3 / 06-ai/03: when false ("data-sampled repair" is on), a failed
   * stage-5 execution additionally attaches up to 3 rows from the question's
   * relevant table(s) to the error envelope. Default true (metadata-only) —
   * the privacy-safer default; cloud mode only in practice (local modes never
   * leave the browser regardless of this setting).
   */
  metadataOnlyRepair?: boolean;
  /** Caller cancellation (a new question supersedes the old). */
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Vocabulary for stage-1 typo correction: every table and column name. */
function buildVocabulary(tables: TableRegistryEntry[]): string[] {
  const vocab = new Set<string>();
  for (const t of tables) {
    vocab.add(t.tableName);
    for (const c of t.columns ?? []) vocab.add(c.name);
  }
  return [...vocab];
}

function newTurn(partial: Omit<AITurn, 'id' | 'createdAt' | 'role'>): AITurn {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

/** Race a provider call against the §21.6 timeout, aborting the in-flight request on either. */
async function completeWithTimeout(
  provider: AIProvider,
  messages: ProviderMessage[],
  tools: AITool[],
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  callerSignal?.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout>;
  // Detection is the race, not the provider's abort handling: whether or not the
  // provider forwards the abort reason, the timeout branch fires deterministically.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DOMException('Provider timed out', 'TimeoutError'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      provider.complete(messages, tools, { signal: controller.signal }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer!);
    callerSignal?.removeEventListener('abort', onAbort);
  }
}

/** The core's envelope, in the shape the shared chart translator reads. */
function toQueryResult(result: OpResult): QueryResult {
  return {
    columnNames: result.schema.map((f) => f.name),
    columnTypes: result.schema.map((f) => f.type),
    rows: result.rows,
    rowCount: result.rowCount,
    executionTimeMs: result.elapsedMs,
  };
}

function callSql(call: ProviderToolCall): string | null {
  const input = call.input as { sql?: unknown } | null;
  return input && typeof input.sql === 'string' ? input.sql : null;
}

/** Apply the loop's prompt-sized preview default, unless the model named a size itself. */
function withPreviewDefault(input: unknown): unknown {
  if (input === null || typeof input !== 'object') return input;
  const params = input as { limit?: unknown };
  return params.limit === undefined ? { ...params, limit: DEFAULT_TOOL_PREVIEW_ROWS } : params;
}

/**
 * Run the full pipeline for one question. Returns the assistant turn to append
 * to the transcript — carrying the model's answer plus the complete audit trail.
 * Never throws for an expected failure (timeout, ceiling reached, provider down,
 * no provider): those surface as a turn with a clean `error`. Re-throws only on
 * caller cancellation (AbortError), which is control flow, not an error.
 */
export async function askAI(rawQuestion: string, deps: AskAIDeps): Promise<AITurn> {
  const { provider, overflowProvider, overflowBaseUrl, tables, edges = [], core, session, signal } = deps;
  const recommendChart = deps.recommendChart ?? defaultRecommendChart;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const metadataOnlyRepair = deps.metadataOnlyRepair ?? true;
  // Swaps once, on a quota-family error, and persists for the rest of the turn
  // (the quota typically fires mid-turn, not on the first round-trip).
  let activeProvider = provider;
  let usedOverflow = false;

  // Stage 1 — normalize; Stage 2 — prune.
  const { text: question, corrections } = normalizeQuestion(rawQuestion, buildVocabulary(tables));
  const { prompt: schemaPrompt, includedTables } = pruneSchema(question, tables, edges);

  const messages: ProviderMessage[] = [
    { role: 'system', content: `${SYSTEM_INSTRUCTIONS}\n\n${schemaPrompt}` },
    { role: 'user', content: question },
  ];

  const attempts: SqlAttempt[] = [];
  let consecutiveFailures = 0;
  let toolCallCount = 0;
  let lastResult: { sql: string; result: QueryResult } | null = null;
  /**
   * A chart the model asked for by name (A6's `create_chart`), which outranks
   * stage 6's auto-chart of whatever ran last. Stage 6 guesses at the end of a
   * turn; this is the model saying which result was worth drawing and how — a
   * spec already validated against that result by the operation itself.
   */
  let requestedChart: { chart: ChartRecommendation; result: QueryResult } | null = null;
  // Every materialization this turn informed the answer, so compaction retains
  // them ahead of merely recent ones (D74h) — marked once the turn actually
  // produces a statement, which is the thing they informed.
  const resultIds = new Set<string>();

  const fail = (message: string, opts?: { quotaExhausted?: boolean }): AITurn =>
    newTurn({ content: '', error: message, attempts, corrections, ...opts });

  const answer = (content: string): AITurn => {
    for (const id of resultIds) core.noteContribution(id);
    const charted =
      requestedChart ??
      (lastResult ? { chart: recommendChart(lastResult.result, lastResult.sql), result: lastResult.result } : null);
    return newTurn({
      content,
      attempts,
      chart: charted?.chart,
      chartResult: charted?.result,
      corrections,
      servedByOllamaOverflow: usedOverflow || undefined,
    });
  };

  /**
   * Execute one emitted call. Returns the envelope that goes back to the model
   * verbatim — a structured `OpError` on any failure, never a host-authored
   * instruction about how to recover — plus the exact JSON the tool message
   * carries, which is the envelope alone unless §11.3's opt-in sample rode along.
   */
  const runCall = async (
    call: ProviderToolCall,
    toolNames: Set<string>,
  ): Promise<{ outcome: OpOutcome; content: string }> => {
    const plain = (outcome: OpOutcome) => ({ outcome, content: JSON.stringify(outcome) });

    // Not a second source of truth — `toolNames` is what the server just
    // declared. Checking here only saves a round trip on a hallucinated name;
    // the core would refuse it identically, with the same mechanical hint.
    if (!toolNames.has(call.name)) {
      return plain(opError('invalid_argument', `No tool named ${call.name}.`, [...toolNames].join(', ')));
    }

    // Stage 4 — dialect lint, before the engine is touched. A blocking fault is
    // reported as the findings themselves; the rule names are the mechanical
    // hint, in the same sense as the core's own hints.
    if (call.name === SQL_TOOL) {
      const sql = callSql(call);
      if (sql === null) return plain(opError('invalid_argument', 'run_sql requires a string "sql" argument.'));
      const lint = lintSql(sql);
      if (!lint.ok) {
        const blocking = lint.findings.filter((f) => f.blocking);
        const messages = blocking.map((f) => f.message).join(' ');
        attempts.push({
          attempt: attempts.length + 1,
          op: SQL_TOOL,
          sql,
          status: 'error',
          executionTimeMs: 0,
          error: messages,
          lint: lint.findings,
        });
        return plain(opError('sql_error', messages, blocking.map((f) => f.rule).join(', ')));
      }
    }

    const outcome = await session.call(call.name, withPreviewDefault(call.input), { signal });

    if (isOpError(outcome)) {
      const sql = call.name === SQL_TOOL ? (callSql(call) ?? '') : '';
      const record: SqlAttempt = {
        attempt: attempts.length + 1,
        op: call.name,
        sql,
        status: 'error',
        executionTimeMs: 0,
        error: outcome.message,
      };

      // §11.3 "data-sampled repair" (06-ai/03): an opt-in escalation attaching
      // up to 3 real rows from a relevant table to the failure envelope — off by
      // default. Skipped on the terminal failure (no point paying for a sample
      // the model will never read), and a sampling failure degrades silently to
      // metadata-only rather than failing the turn.
      let sample: OpResult | null = null;
      const terminal = consecutiveFailures + 1 >= MAX_CONSECUTIVE_FAILURES;
      if (!metadataOnlyRepair && !terminal && includedTables.length > 0) {
        const sampled = await core.call('sample_rows', { table: includedTables[0], limit: 3 }, { signal });
        if (!isOpError(sampled)) sample = sampled;
      }
      if (sample) record.sampledRows = true;
      attempts.push(record);
      // The sample rides *beside* the envelope rather than inside it: `OpError`
      // is the core's shape and this is the chat's opt-in privacy escalation,
      // not a new field of the catalog's contract.
      if (!sample) return plain(outcome);
      return {
        outcome,
        content: JSON.stringify({
          ...outcome,
          sampleRows: {
            table: includedTables[0],
            columns: sample.schema.map((f) => f.name),
            rows: sample.rows.slice(0, 3),
          },
        }),
      };
    }

    attempts.push({
      attempt: attempts.length + 1,
      op: call.name,
      sql: outcome.sql ?? '',
      status: 'ok',
      executionTimeMs: outcome.elapsedMs,
      rowCount: outcome.rowCount,
    });
    if (outcome.resultId !== null) resultIds.add(outcome.resultId);
    if (outcome.sql !== null) lastResult = { sql: outcome.sql, result: toQueryResult(outcome) };
    // The operation carries the spec it validated; nothing here re-derives one.
    // Last call wins — a model that charts twice meant the second.
    if (outcome.chart) requestedChart = { chart: outcome.chart, result: toQueryResult(outcome) };
    return plain(outcome);
  };

  // The catalog, as the server declares it. Fetched once per turn rather than
  // per round-trip: `tools/list` is in-process and cheap, but the model must see
  // a stable tool set across a turn — a list that changed underneath it mid-turn
  // would invalidate calls it had already planned.
  let tools: AITool[];
  try {
    tools = await session.tools();
  } catch (error) {
    return fail(
      `The analyst catalog could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const toolNames = new Set(tools.map((tool) => tool.name));

  try {
    for (let providerCalls = 0; providerCalls < MAX_PROVIDER_CALLS; providerCalls++) {
      let turn;
      try {
        turn = await completeWithTimeout(activeProvider, messages, tools, signal, timeoutMs);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError' && signal?.aborted) throw error;
        // Shared free budget spent or the router's kill-switch flipped (§11.2, §23.5).
        // With a D3 overflow provider (2026-07-23) and no swap made yet, retry this
        // same iteration on it instead of failing the turn — the swap then persists
        // for every remaining round-trip.
        if (error instanceof ProviderQuotaExhaustedError && overflowProvider !== undefined && !usedOverflow) {
          activeProvider = overflowProvider;
          usedOverflow = true;
          providerCalls--;
          continue;
        }
        // The overflow provider itself failing is a distinct, actionable state —
        // never folded into the generic "could not be reached" message, since the
        // fix here is specific (check the endpoint, or stop overflowing to it).
        if (usedOverflow) {
          const where = overflowBaseUrl ? ` (${overflowBaseUrl})` : '';
          return fail(
            `The shared free budget ran out and your local Ollama endpoint${where} could not be reached either. Check that Ollama is running, or switch routing to "Prefer my key".`,
          );
        }
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          return fail('The AI provider timed out. Try again, or switch modes.');
        }
        if (error instanceof ProviderQuotaExhaustedError) {
          return fail(
            'The free AI budget is used up for today. Bring your own key, switch to the local model, or retry tomorrow.',
            { quotaExhausted: true },
          );
        }
        return fail('The AI provider could not be reached. Check your connection or mode and try again.');
      }

      // The assistant message is appended **verbatim before** anything executes,
      // so the conversation the model sees next contains exactly what it said —
      // prose included — followed by one correlated result per call.
      messages.push({
        role: 'assistant',
        content: turn.text,
        ...(turn.calls.length > 0 ? { toolCalls: turn.calls } : {}),
      });

      // The one terminal condition: a response with no tool calls. Prose
      // alongside calls is preserved and execution continues.
      if (turn.calls.length === 0) return answer(turn.text);

      for (const call of turn.calls) {
        toolCallCount += 1;
        if (toolCallCount > MAX_TOOL_CALLS) {
          return fail(`The AI ran ${MAX_TOOL_CALLS} operations without reaching an answer.`);
        }

        const { outcome, content } = await runCall(call, toolNames);
        messages.push({ role: 'tool', toolCallId: call.id, content });

        if (isOpError(outcome)) {
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            return fail(`The query failed ${MAX_CONSECUTIVE_FAILURES} times in a row. Last error: ${outcome.message}`);
          }
        } else {
          consecutiveFailures = 0;
        }
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return fail(error instanceof Error ? error.message : 'The AI pipeline hit an unexpected error.');
  }

  // Provider-call ceiling reached without an answer: return what ran, if anything.
  if (lastResult) return answer('Here are the results of the last query.');
  return fail('The AI did not produce an answer.');
}
