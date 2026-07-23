// The NL→SQL pipeline (§11.1) as an LLM tool-use loop. One question in, one
// audited assistant turn out. The six stages:
//
//   1. normalize   — fuzzy-fix schema typos in the question (lib/inputNormalizer)
//   2. prune       — build a schema-only system prompt for the relevant tables (lib/schemaPrune)
//   3–5. loop      — the model calls `execute_local_sql`; each call is dialect-linted
//                    (lib/sqlLint) before it runs, executed against DuckDB, and on
//                    failure the error trace is fed back and retried — hard cap 3 attempts
//   6. auto-chart  — the final result set goes through the shared chart translator
//
// The chat never runs hidden SQL: every generated query and every execution
// (timing, row count, error, retry number) is recorded on the returned turn's
// `attempts` — that transcript IS the trust surface (§11.1). Repair context is
// metadata-only by default (the error trace + schema): stage 5's "data-sampled
// repair" (§11.3, 06-ai/03) is an opt-in escalation that additionally resamples
// up to 3 real rows from the question's relevant table(s) alongside the error
// trace on a failed attempt, to help the model correct a data-shape assumption
// (a type mismatch, an unexpected format) the trace text alone doesn't show.
// Gated by `metadataOnlyRepair` (default true — off); every attempt that
// carried a sample records `sampledRows: true`, the transcript's audit trail
// for the toggle's effect.
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
import { ProviderQuotaExhaustedError } from './aiProvider';
import { normalizeQuestion } from '../lib/inputNormalizer';
import { pruneSchema } from '../lib/schemaPrune';
import { lintSql } from '../lib/sqlLint';
import { recommendChart as defaultRecommendChart } from '../lib/chartMapper';

// THOR-style hard cap: three SQL attempts that fail (lint-blocked or errored) end
// the turn. Guarantees termination and bounds provider cost.
export const MAX_SQL_ATTEMPTS = 3;
// Defensive ceiling on total provider round-trips, so a model that neither
// answers nor errors cannot loop forever.
const MAX_PROVIDER_CALLS = 8;
// §21.6 provider timeout — a slow provider yields a clean error, never a hung chat.
const DEFAULT_TIMEOUT_MS = 30_000;

const EXECUTE_LOCAL_SQL: AITool = {
  name: 'execute_local_sql',
  description:
    'Execute one DuckDB SQL SELECT statement against the local dataset and return the result rows. ' +
    'The query runs entirely in the user’s browser. Call this to answer the question, then explain the result.',
  inputSchema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'A single DuckDB SQL SELECT statement (Postgres-dialect).' },
    },
    required: ['sql'],
  },
};

const SYSTEM_INSTRUCTIONS =
  'You translate the user’s question into DuckDB SQL and answer it using only the ' +
  'tables below. DuckDB uses Postgres-dialect SQL: quote identifiers with "double quotes" ' +
  '(never backticks), use LIMIT (never TOP), and use || or CONCAT for strings. Call ' +
  'execute_local_sql with a single SELECT, read the returned rows, then reply in plain ' +
  'language. If a query errors, read the error and try a corrected query.';

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
  /** Runs SQL against the engine (services/sql or the chart runner); returns rows + timing. */
  runSql: (sql: string, signal?: AbortSignal) => Promise<QueryResult>;
  /** Stage 6; defaults to the shared translator. Injectable for tests. */
  recommendChart?: (result: QueryResult, sql: string) => ChartRecommendation;
  /**
   * §11.3 / 06-ai/03: when false ("data-sampled repair" is on), a failed
   * stage-5 execution additionally resamples up to 3 rows from the question's
   * relevant table(s) and sends them alongside the error trace. Default true
   * (metadata-only) — the privacy-safer default; cloud mode only in practice
   * (local modes never leave the browser regardless of this setting).
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
      provider.complete(messages, [EXECUTE_LOCAL_SQL], { signal: controller.signal }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer!);
    callerSignal?.removeEventListener('abort', onAbort);
  }
}

function extractSql(call: ProviderToolCall): string | null {
  const input = call.input as { sql?: unknown } | null;
  return input && typeof input.sql === 'string' ? input.sql : null;
}

/**
 * Run the full pipeline for one question. Returns the assistant turn to append
 * to the transcript — carrying the model's answer plus the complete audit trail.
 * Never throws for an expected failure (timeout, retry cap, provider down, no
 * provider): those surface as a turn with a clean `error`. Re-throws only on
 * caller cancellation (AbortError), which is control flow, not an error.
 */
export async function askAI(rawQuestion: string, deps: AskAIDeps): Promise<AITurn> {
  const { provider, overflowProvider, overflowBaseUrl, tables, edges = [], runSql, signal } = deps;
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
  let failedAttempts = 0;
  let lastResult: { sql: string; result: QueryResult } | null = null;

  const fail = (message: string, opts?: { quotaExhausted?: boolean }): AITurn =>
    newTurn({ content: '', error: message, attempts, corrections, ...opts });

  try {
    for (let call = 0; call < MAX_PROVIDER_CALLS; call++) {
      let turn;
      try {
        turn = await completeWithTimeout(activeProvider, messages, signal, timeoutMs);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError' && signal?.aborted) throw error;
        // Shared free budget spent or the router's kill-switch flipped (§11.2, §23.5).
        // With a D3 overflow provider (2026-07-23) and no swap made yet, retry this
        // same iteration on it instead of failing the turn — the swap then persists
        // for every remaining round-trip.
        if (error instanceof ProviderQuotaExhaustedError && overflowProvider !== undefined && !usedOverflow) {
          activeProvider = overflowProvider;
          usedOverflow = true;
          call--;
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

      // A text turn is the model's final answer (stage 3 concluded).
      if (turn.kind === 'text') {
        const chart = lastResult ? recommendChart(lastResult.result, lastResult.sql) : undefined;
        return newTurn({ content: turn.text, attempts, chart, corrections, servedByOllamaOverflow: usedOverflow || undefined });
      }

      // A tool call: validate, lint (stage 4), execute (stage 5).
      const toolCall = turn.call;
      messages.push({ role: 'assistant', content: '', toolCall });

      if (toolCall.name !== EXECUTE_LOCAL_SQL.name) {
        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: `Unknown tool "${toolCall.name}". Only execute_local_sql is available.`,
        });
        continue;
      }
      const sql = extractSql(toolCall);
      if (sql === null) {
        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: 'execute_local_sql requires a string "sql" argument.',
        });
        continue;
      }

      const lint = lintSql(sql);

      // Stage 4 — a blocking dialect fault: correct it before wasting an execution.
      if (!lint.ok) {
        failedAttempts += 1;
        const hints = lint.findings.filter((f) => f.blocking).map((f) => f.message).join(' ');
        attempts.push({ attempt: failedAttempts, sql, status: 'error', executionTimeMs: 0, error: hints, lint: lint.findings });
        if (failedAttempts >= MAX_SQL_ATTEMPTS) {
          return fail(`Could not produce runnable SQL after ${MAX_SQL_ATTEMPTS} attempts.`);
        }
        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: `The SQL was not run — fix these DuckDB dialect issues and try again: ${hints}`,
        });
        continue;
      }

      // Stage 5 — execute; on failure, feed the trace back (metadata-only) and retry.
      const advisory = lint.findings.length > 0 ? lint.findings : undefined;
      try {
        const result = await runSql(sql, signal);
        attempts.push({
          attempt: attempts.length + 1,
          sql,
          status: 'ok',
          executionTimeMs: result.executionTimeMs,
          rowCount: result.rowCount,
          lint: advisory,
        });
        lastResult = { sql, result };
        const preview = result.rows.slice(0, 20);
        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: JSON.stringify({ columns: result.columnNames, rowCount: result.rowCount, rows: preview }),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        failedAttempts += 1;
        const trace = error instanceof Error ? error.message : String(error);
        const attemptRecord: SqlAttempt = { attempt: failedAttempts, sql, status: 'error', executionTimeMs: 0, error: trace, lint: advisory };
        if (failedAttempts >= MAX_SQL_ATTEMPTS) {
          attempts.push(attemptRecord);
          return fail(`The query failed after ${MAX_SQL_ATTEMPTS} attempts. Last error: ${trace}`);
        }

        // §11.3 "data-sampled repair" (06-ai/03): an opt-in escalation that
        // resamples up to 3 real rows from a relevant table alongside the
        // trace — off by default (metadataOnlyRepair). A sampling failure
        // (e.g. the table itself is unreadable) degrades silently to
        // metadata-only for this attempt rather than failing the turn.
        let sample: QueryResult | null = null;
        if (!metadataOnlyRepair && includedTables.length > 0) {
          try {
            sample = await runSql(`SELECT * FROM "${includedTables[0]}" LIMIT 3`, signal);
          } catch (sampleError) {
            if (sampleError instanceof DOMException && sampleError.name === 'AbortError') throw sampleError;
          }
        }
        if (sample) attemptRecord.sampledRows = true;
        attempts.push(attemptRecord);

        const sampleBlock = sample
          ? `\nSample rows from "${includedTables[0]}" (for reference only — may not reflect the failing query): ${JSON.stringify({ columns: sample.columnNames, rows: sample.rows.slice(0, 3) })}`
          : '';
        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: `Query failed: ${trace}\nThe schema is unchanged (see the system message). Correct the SQL and try again.${sampleBlock}`,
        });
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return fail(error instanceof Error ? error.message : 'The AI pipeline hit an unexpected error.');
  }

  // Provider-call ceiling reached without a text answer: return what ran, if anything.
  if (lastResult) {
    return newTurn({
      content: 'Here are the results of the last query.',
      attempts,
      chart: recommendChart(lastResult.result, lastResult.sql),
      corrections,
      servedByOllamaOverflow: usedOverflow || undefined,
    });
  }
  return fail('The AI did not produce an answer.');
}
