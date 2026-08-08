// The run/scoring loop wiring (DESIGN.md §3-§5, §7 "still not built"): for
// one {arm, model, question} cell, builds the right arm prompt, calls the
// right structured-output path (A0-A3 via ollama.ts's callForProposal, A4
// via planFirstOllama.ts's callForPlannedProposal), executes the emitted SQL
// with the uniform one-shot repair DESIGN.md §3 requires (applied identically
// to every arm, never just some — see that section's binding-rescue-vs-
// grain-correction warning), and scores the result with score.ts. This file
// owns one cell; sweeping {dataset x arm x model x question} and writing a
// manifest file is the caller's job, kept separate so a single cell can be
// smoke-tested without paying for a live sweep.
//
// Not exp17's guard (`sqlGuard.ts`): that gate's ALLOWED_VIEWS/ANALYTICS_SCHEMA
// are hardcoded to exp17's own fixed dataset/views (score.ts's module comment
// makes the same reuse call for the same reason). In place of it, a minimal
// generic read-only check — reject anything but a single SELECT/WITH
// statement — guards against a destructive statement reaching the local
// DuckDB file, without an exp17-specific allowlist this experiment's six
// datasets and dynamically-generated views don't fit.
import type { DuckDBConnection } from '@duckdb/node-api';
import { callForProposal, type CallUsage, type ChatMessage } from '../17-duckdb-local-chat/ollama';
import { buildA0Prompt, buildA1Prompt, buildA2Prompt, buildA2PrimePrompt, buildA3Prompt } from './armPrompts';
import type { DatasetFacts } from './datasetFacts';
import { buildA4Prompt, callForPlannedProposal } from './planFirstOllama';
import type { RollupView } from './profiler';
import { bucketOutcome, tagViewUsage, type CallOutcome, type ExecutedResult, type GoldCheck, type ScoreBucket, type ViewUsage } from './score';
import type { TableRegistryEntry } from '../../../src/types/dataset';

/** A2′ and A1x are DESIGN.md §3's diagnostic arms (ecommerce/ only, per that section — never run on the other 5 datasets): A2′ breaks the ladder's order-dependence (views without a preceding profile), A1x is the negative control (A1's grain statement deliberately corrupted). */
export type Arm = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A2prime' | 'A1x';

export interface ArmContext {
  tables: readonly TableRegistryEntry[];
  facts: DatasetFacts;
  grainByTable: ReadonlyMap<string, string>;
  views: readonly RollupView[];
  /** Only read by the A1x diagnostic arm — the deliberately corrupted grain/fanout text (`describeGrainCorrupted`, DESIGN.md §3's negative control). */
  corruptedGrainByTable?: ReadonlyMap<string, string>;
}

export function buildArmPrompt(arm: Arm, ctx: ArmContext): string {
  switch (arm) {
    case 'A0':
      return buildA0Prompt(ctx.tables);
    case 'A1':
      return buildA1Prompt(ctx.tables, ctx.facts, ctx.grainByTable);
    case 'A2':
      return buildA2Prompt(ctx.tables, ctx.facts, ctx.grainByTable, ctx.views);
    case 'A3':
      return buildA3Prompt(ctx.tables, ctx.facts, ctx.grainByTable, ctx.views);
    case 'A4':
      return buildA4Prompt(ctx.tables, ctx.facts, ctx.grainByTable, ctx.views);
    case 'A2prime':
      return buildA2PrimePrompt(ctx.tables, ctx.views);
    case 'A1x':
      if (!ctx.corruptedGrainByTable) throw new Error('A1x arm requires ArmContext.corruptedGrainByTable');
      return buildA1Prompt(ctx.tables, ctx.facts, ctx.corruptedGrainByTable);
  }
}

/** Every arm's proposal, collapsed to the fields the run loop actually branches on — A4's `plan` field is logged in `rawContent` but doesn't change dispatch. */
interface NormalizedCall {
  status: 'query' | 'unsupported' | null;
  sql: string | null;
  reason: string | null;
  parseError: string | null;
  rawContent: string;
  usage: CallUsage;
}

async function callArm(arm: Arm, model: string, messages: readonly ChatMessage[], baseUrl?: string): Promise<NormalizedCall> {
  if (arm === 'A4') {
    const call = await callForPlannedProposal(model, messages, baseUrl);
    if (call.proposal === null) {
      return { status: null, sql: null, reason: null, parseError: call.parseError, rawContent: call.rawContent, usage: call.usage };
    }
    if (call.proposal.status === 'unsupported') {
      return { status: 'unsupported', sql: null, reason: call.proposal.reason, parseError: null, rawContent: call.rawContent, usage: call.usage };
    }
    return { status: 'query', sql: call.proposal.sql, reason: null, parseError: null, rawContent: call.rawContent, usage: call.usage };
  }
  const call = await callForProposal(model, messages, baseUrl);
  if (call.proposal === null) {
    return { status: null, sql: null, reason: null, parseError: call.parseError, rawContent: call.rawContent, usage: call.usage };
  }
  if (call.proposal.status === 'unsupported') {
    return { status: 'unsupported', sql: null, reason: call.proposal.reason, parseError: null, rawContent: call.rawContent, usage: call.usage };
  }
  return { status: 'query', sql: call.proposal.sql, reason: null, parseError: null, rawContent: call.rawContent, usage: call.usage };
}

function normalizeCell(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  return value;
}

const READ_ONLY_LEADING_KEYWORD = /^\s*(select|with)\b/i;

function assertReadOnly(sql: string): void {
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (statements.length !== 1) {
    throw new Error(`only a single SELECT/WITH statement is permitted, got ${statements.length}`);
  }
  if (!READ_ONLY_LEADING_KEYWORD.test(statements[0]!)) {
    throw new Error('only SELECT/WITH statements are permitted');
  }
}

async function executeSql(conn: DuckDBConnection, sql: string): Promise<ExecutedResult> {
  assertReadOnly(sql);
  const result = await conn.run(sql);
  const columnNames = result.columnNames();
  const rows = (await result.getRowsJS()).map((row) => row.map(normalizeCell));
  return { columnNames, rows };
}

const REPAIR_INSTRUCTION_PREFIX = 'That query failed with this exact error: ';
const CORRECTION_SUFFIX = ' Reply again with ONLY the corrected structured JSON.';

/** DESIGN.md §4: a call whose prompt token count exceeds this fraction of num_ctx fails the run rather than being scored — Ollama truncates silently from the front, where the DDL/grain text lives. */
export const PROMPT_TOKEN_BUDGET_FRACTION = 0.8;

export interface RunOneCallResult {
  arm: Arm;
  model: string;
  questionId: string;
  prompt: string;
  /** Full message list actually sent, including the one-shot repair round if one happened. */
  messages: readonly ChatMessage[];
  finalSql: string | null;
  rawContent: string;
  repairUsed: boolean;
  repairSucceeded: boolean;
  /** True when the prompt exceeded DESIGN.md §4's 0.8x num_ctx budget — this call was not scored (`bucket`/`viewUsage` are null), it failed the run. */
  promptOverflow: boolean;
  bucket: ScoreBucket | null;
  viewUsage: ViewUsage | null;
  errorMessage: string | null;
  usage: CallUsage[];
  elapsedMs: number;
}

export interface RunOneCallParams {
  arm: Arm;
  model: string;
  question: string;
  questionId: string;
  ctx: ArmContext;
  conn: DuckDBConnection;
  gold: GoldCheck;
  /** Every view name this dataset generated, for tagViewUsage — not just the "correct" one, so a wrong-view reference is distinguishable from no view reference at all. */
  allViewNames: readonly string[];
  /** The view this specific question/check should use, or null if the question has no single correct view (e.g. a plain profiling question). Caller-supplied — this function has no per-question knowledge of its own. */
  correctViewName: string | null;
  /** The num_ctx this model is pinned to for this run (DESIGN.md §4) — used only for the 0.8x overflow check, not passed to the call itself (callForProposal/callForPlannedProposal read CHAT_NUM_CTX from the environment). */
  numCtx: number;
  baseUrl?: string;
}

/**
 * Runs one {arm, model, question} cell end to end: prompt -> proposal call ->
 * execute -> (one-shot repair on failure) -> score. Never more than two
 * model calls total, matching DESIGN.md §3's "one-shot" repair (not exp17's
 * multi-call follow-up budget, which this experiment's single-shot design
 * deliberately doesn't reuse — see score.ts's module comment for the same
 * scoping call).
 */
export async function runOneCall(params: RunOneCallParams): Promise<RunOneCallResult> {
  const started = performance.now();
  const prompt = buildArmPrompt(params.arm, params.ctx);
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt },
    { role: 'user', content: params.question },
  ];

  let call = await callArm(params.arm, params.model, messages, params.baseUrl);
  const usage: CallUsage[] = [call.usage];

  if (call.usage.promptTokens > params.numCtx * PROMPT_TOKEN_BUDGET_FRACTION) {
    return {
      arm: params.arm,
      model: params.model,
      questionId: params.questionId,
      prompt,
      messages,
      finalSql: null,
      rawContent: call.rawContent,
      repairUsed: false,
      repairSucceeded: false,
      promptOverflow: true,
      bucket: null,
      viewUsage: null,
      errorMessage: null,
      usage,
      elapsedMs: performance.now() - started,
    };
  }

  let sql: string | null = call.status === 'query' ? call.sql : null;
  let executed: ExecutedResult | null = null;
  let executionError: string | null = null;
  let repairUsed = false;

  if (call.status === 'query') {
    try {
      executed = await executeSql(params.conn, sql!);
    } catch (error) {
      executionError = error instanceof Error ? error.message : String(error);
    }

    if (executed === null) {
      repairUsed = true;
      messages.push(
        { role: 'assistant', content: call.rawContent },
        { role: 'user', content: `${REPAIR_INSTRUCTION_PREFIX}${executionError}${CORRECTION_SUFFIX}` },
      );
      const repairCall = await callArm(params.arm, params.model, messages, params.baseUrl);
      usage.push(repairCall.usage);
      call = repairCall;
      if (call.status === 'query') {
        sql = call.sql;
        try {
          executed = await executeSql(params.conn, sql!);
        } catch (error) {
          executionError = error instanceof Error ? error.message : String(error);
        }
      }
    }
  }

  const proposalStatus: CallOutcome['proposalStatus'] = call.status === null ? 'malformed' : call.status;
  const outcome: CallOutcome = {
    proposalStatus,
    ranSuccessfully: executed !== null,
    result: executed,
    errorMessage: executionError ?? call.parseError ?? call.reason,
  };
  const bucket = bucketOutcome(outcome, params.gold);
  const repairSucceeded = repairUsed && executed !== null;
  const viewUsage = sql !== null ? tagViewUsage(sql, params.allViewNames, params.correctViewName) : 'none';

  return {
    arm: params.arm,
    model: params.model,
    questionId: params.questionId,
    prompt,
    messages,
    finalSql: sql,
    rawContent: call.rawContent,
    repairUsed,
    repairSucceeded,
    promptOverflow: false,
    bucket,
    viewUsage,
    errorMessage: outcome.errorMessage,
    usage,
    elapsedMs: performance.now() - started,
  };
}
