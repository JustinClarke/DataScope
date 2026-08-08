// The bounded query -> execute -> explain loop (build order step 3, experiment
// doc "SQL safety and execution" + "Answer generation", as amended by the doc's
// "Accepted change: a bounded correction ladder").
//
// Call budget per turn, deterministic and always terminating:
//   1 proposal call
//   + at most FOLLOW_UP_BUDGET follow-up calls drawn from one shared pool (a
//     malformed-response retry, an unsupported dispute, a guard correction, or
//     a post-execution repair — any combination, hard-capped)
//   + at most 1 answer call (skipped for a one-row result, which gets a
//     deterministic template instead — "it should not be paid tokens to
//     restate COUNT(*) = 1400")
//
// A guard rejection is repairable rather than terminal, but only when it is a
// `parse` failure: `sqlGuard.ts` first tries to normalize the statement for
// free, and only a parse rejection that survives that costs a follow-up. A
// `policy` rejection (stacked statements, non-SELECT, a view outside the
// allowlist, a table function) is terminal and costs nothing — it is a
// proposal, not a defect, and re-asking would only coach the model toward a
// compliant restatement of the same intent. The budget is two rather than one
// so that a guard correction cannot cannibalize the execution repair that may
// follow it.
import { buildSchemaPrompt, matchUnsupportedTopic, UNSUPPORTED_TOPICS } from './catalog';
import type { SealedRuntime } from './database';
import { callForProposal, callForText, type CallUsage, type ChatMessage, type ModelProposal } from './ollama';
import { guardSql } from './sqlGuard';

export const PREVIEW_ROW_CAP = 200;
export const BYTE_CEILING = 200_000;
/** Follow-up model calls a single turn may spend, across every failure kind combined. */
export const FOLLOW_UP_BUDGET = 2;
export const EXECUTION_TIMEOUT_MS = Number(process.env.CHAT_EXECUTION_TIMEOUT_MS ?? 10_000);

export interface ExecutedQuery {
  columnNames: string[];
  rows: unknown[][];
  totalCount: number;
  rowTruncated: boolean;
  byteTruncated: boolean;
  elapsedMs: number;
}

export type TurnStatus = 'answered' | 'unsupported' | 'refused' | 'error';

export interface TurnResult {
  status: TurnStatus;
  question: string;
  sql: string | null;
  assumptions: string[];
  result: ExecutedQuery | null;
  answer: string | null;
  /** Refusal reason (guard), unsupported reason (model or host-confirmed topic), or execution error message. */
  reason: string | null;
  /** True when the host disputed a model 'unsupported' claim and the model still would not propose a query with its remaining budget. */
  unsupportedDisputed: boolean;
  /** True when a model correction (guard or execution) produced the query that finally answered the turn. */
  repaired: boolean;
  /** Follow-up calls spent from the shared budget, at most `FOLLOW_UP_BUDGET`. */
  followUpsUsed: number;
  /** Model replies that failed to parse as the structured proposal, anywhere in the turn. Reported directly rather than inferred by elimination, since several failure kinds now share the budget. */
  malformedReplies: number;
  /**
   * The raw model SQL of each statement `sqlGuard.ts` had to salvage this turn
   * (one entry per occurrence — the guard runs again after every correction).
   * Recorded because salvage is otherwise invisible: the repair costs no model
   * call and the executed statement looks identical to one that never glitched,
   * so without this the scored run cannot tell "never glitched" from "glitched
   * constantly and was silently repaired". The raw strings, not just a count,
   * so the verdict can quote the actual shapes.
   */
  salvagedSql: string[];
  usage: CallUsage[];
  totalElapsedMs: number;
}

function formatCell(value: unknown): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return String(value);
}

/** For a single-row result: "col: value, col2: value2" — the deterministic template that replaces a second model call. */
function deterministicAnswer(result: ExecutedQuery): string {
  if (result.rows.length === 0) return 'No rows matched.';
  if (result.columnNames.length === 1) return formatCell(result.rows[0]![0]);
  return result.columnNames.map((name, i) => `${name}: ${formatCell(result.rows[0]![i])}`).join(', ');
}

async function executeGuarded(runtime: SealedRuntime, sql: string): Promise<ExecutedQuery> {
  const signal = AbortSignal.timeout(EXECUTION_TIMEOUT_MS);
  const preview = await runtime.execute(`SELECT * FROM (${sql}) AS _q LIMIT ${PREVIEW_ROW_CAP}`, signal);
  const countResult = await runtime.execute(`SELECT COUNT(*) AS n FROM (${sql}) AS _q`, signal);
  const totalCount = Number(countResult.rows[0]![0]);

  let rows = preview.rows;
  let byteTruncated = false;
  while (rows.length > 0 && JSON.stringify(rows).length > BYTE_CEILING) {
    rows = rows.slice(0, Math.max(1, Math.floor(rows.length / 2)));
    byteTruncated = true;
  }

  return {
    columnNames: preview.columnNames,
    rows,
    totalCount,
    rowTruncated: totalCount > rows.length,
    byteTruncated,
    elapsedMs: preview.elapsedMs,
  };
}

function proposalMessage(proposal: ModelProposal): string {
  return JSON.stringify(proposal);
}

const MALFORMED_RETRY = 'That reply was not valid JSON matching the required schema. Reply again with ONLY the structured JSON.';
const REPAIR_INSTRUCTION_PREFIX = 'That query failed with this exact DuckDB error: ';
const GUARD_INSTRUCTION_PREFIX = 'That query was rejected before it ran, for this exact reason: ';
const CORRECTION_SUFFIX = ' Reply again with ONLY the corrected structured JSON.';
const disputeInstruction = (topics: readonly string[]) =>
  `The host does not recognize this question as covering an unsupported topic (this dataset's known gaps are: ${topics.join('; ')}). ` +
  'If the question is genuinely about one of those, keep your "unsupported" reply. Otherwise propose a query.';

/**
 * Runs one bounded turn. `question` must already be a standalone question — on
 * a multi-turn follow-up, resolve it with `session.ts`'s
 * `resolveStandaloneQuestion` first; this function has no memory of its own.
 */
export async function runTurn(
  model: string,
  question: string,
  runtime: SealedRuntime,
  options: { baseUrl?: string } = {},
): Promise<TurnResult> {
  const started = performance.now();
  const usage: CallUsage[] = [];
  let followUpsUsed = 0;
  let malformedReplies = 0;
  let corrections = 0;
  let unsupportedDisputed = false;
  const salvagedSql: string[] = [];

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSchemaPrompt() },
    { role: 'user', content: question },
  ];

  let call = await callForProposal(model, messages, options.baseUrl);
  usage.push(call.usage);

  while (call.proposal === null) {
    malformedReplies += 1;
    if (followUpsUsed >= FOLLOW_UP_BUDGET) {
      return finish('error', { reason: `model reply did not parse after ${followUpsUsed} retries: ${call.parseError}` });
    }
    followUpsUsed += 1;
    messages.push({ role: 'assistant', content: call.rawContent }, { role: 'user', content: MALFORMED_RETRY });
    call = await callForProposal(model, messages, options.baseUrl);
    usage.push(call.usage);
  }

  let proposal: ModelProposal = call.proposal;

  if (proposal.status === 'unsupported') {
    const hostMatch = matchUnsupportedTopic(question);
    if (hostMatch !== null) {
      return finish('unsupported', { reason: proposal.reason });
    }
    // One dispute only, even with budget left: a model that restates its refusal has taken a
    // position, not hit a transient failure. The exhausted-budget case is reported the same way.
    unsupportedDisputed = true;
    if (followUpsUsed >= FOLLOW_UP_BUDGET) {
      return finish('unsupported', { reason: proposal.reason });
    }
    followUpsUsed += 1;
    const topics = UNSUPPORTED_TOPICS.map((t) => t.topic);
    messages.push(
      { role: 'assistant', content: proposalMessage(proposal) },
      { role: 'user', content: disputeInstruction(topics) },
    );
    call = await callForProposal(model, messages, options.baseUrl);
    usage.push(call.usage);
    if (call.proposal === null) {
      malformedReplies += 1;
      return finish('error', { reason: `model reply did not parse after unsupported dispute: ${call.parseError}` });
    }
    proposal = call.proposal;
    if (proposal.status === 'unsupported') {
      return finish('unsupported', { reason: proposal.reason });
    }
  }

  // proposal.status === 'query' from here on. Each pass either executes, or spends one follow-up on
  // a correction and tries again; `requestCorrection` returning not-ok ends the turn either way.
  let sql = proposal.status === 'query' ? proposal.sql : '';
  let result: ExecutedQuery | null = null;

  while (result === null) {
    const guard = guardSql(sql);
    if (!guard.ok) {
      // A policy rejection ends the turn where it stands, at zero further cost.
      if (guard.kind === 'policy') return finish('refused', { sql, reason: guard.reason });
      const correction = await requestCorrection(`${GUARD_INSTRUCTION_PREFIX}${guard.reason}${CORRECTION_SUFFIX}`);
      if (!correction.ok) {
        return finish('refused', {
          sql,
          reason: correction.detail === null ? guard.reason : `${guard.reason}; ${correction.detail}`,
        });
      }
      sql = correction.sql;
      continue;
    }
    if (guard.salvaged) salvagedSql.push(sql);
    // Execute the guard's normalized statement, never the raw model text.
    sql = guard.sql;
    try {
      result = await executeGuarded(runtime, sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const correction = await requestCorrection(`${REPAIR_INSTRUCTION_PREFIX}${message}${CORRECTION_SUFFIX}`);
      if (!correction.ok) {
        return finish('error', { sql, reason: correction.detail === null ? message : `${message}; ${correction.detail}` });
      }
      sql = correction.sql;
    }
  }

  const assumptions = proposal.status === 'query' ? proposal.assumptions : [];
  let answer: string;
  if (result.rows.length <= 1) {
    answer = deterministicAnswer(result);
  } else {
    const answerMessages: ChatMessage[] = [
      { role: 'system', content: buildSchemaPrompt() },
      {
        role: 'user',
        content:
          `Question: ${question}\nExecuted SQL: ${sql}\nColumns: ${result.columnNames.join(', ')}\n` +
          `Rows (${result.rows.length}${result.rowTruncated ? ` of ${result.totalCount}, truncated` : ''}): ` +
          `${JSON.stringify(result.rows)}\nAssumptions: ${assumptions.join('; ') || '(none)'}\n\n` +
          'The rows above answer the question. Reply with a short plain-language answer for the user. Do not write SQL.',
      },
    ];
    const textResult = await callForText(model, answerMessages, options.baseUrl);
    usage.push(textResult.usage);
    answer = textResult.text;
  }

  return finish('answered', { sql, assumptions, result, answer });

  /**
   * One correction round: shows the model its own last proposal plus `instruction`,
   * and returns the SQL from its next proposal. Spends one follow-up from the shared
   * budget; `detail: null` means the budget was already exhausted and no call was made.
   */
  async function requestCorrection(
    instruction: string,
  ): Promise<{ ok: true; sql: string } | { ok: false; detail: string | null }> {
    if (followUpsUsed >= FOLLOW_UP_BUDGET) return { ok: false, detail: null };
    followUpsUsed += 1;
    messages.push({ role: 'assistant', content: proposalMessage(proposal) }, { role: 'user', content: instruction });
    const next = await callForProposal(model, messages, options.baseUrl);
    usage.push(next.usage);
    if (next.proposal === null) {
      malformedReplies += 1;
      return { ok: false, detail: `the correction reply did not parse: ${next.parseError}` };
    }
    if (next.proposal.status !== 'query') {
      return { ok: false, detail: `the correction reply was "${next.proposal.status}": ${next.proposal.reason}` };
    }
    proposal = next.proposal;
    corrections += 1;
    return { ok: true, sql: next.proposal.sql };
  }

  function finish(
    status: TurnStatus,
    fields: Partial<Pick<TurnResult, 'sql' | 'assumptions' | 'result' | 'answer' | 'reason'>>,
  ): TurnResult {
    return {
      status,
      question,
      sql: fields.sql ?? null,
      assumptions: fields.assumptions ?? [],
      result: fields.result ?? null,
      answer: fields.answer ?? null,
      reason: fields.reason ?? null,
      unsupportedDisputed,
      repaired: status === 'answered' && corrections > 0,
      followUpsUsed,
      malformedReplies,
      salvagedSql,
      usage,
      totalElapsedMs: performance.now() - started,
    };
  }
}
