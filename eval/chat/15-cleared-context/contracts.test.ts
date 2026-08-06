// Checkpoint 1 — contracts only. No harness, no provider, no model call
// exists yet in this directory; these tests exercise only the pure functions
// and frozen constants defined in contracts.ts.
import { describe, expect, it } from 'vitest';
import {
  accountUsage,
  CONSECUTIVE_FAILURE_LIMIT,
  PHASE_CEILINGS,
  TERMINAL_REASONS,
  toFingerprint,
  WHOLE_ANALYST_CEILINGS,
  ZERO_USAGE_TOTALS,
  type Attempt,
} from './contracts';

describe('frozen ceilings (§ Frozen comparison arms)', () => {
  it('phase ceilings are eight provider calls and sixteen operations', () => {
    expect(PHASE_CEILINGS).toEqual({ maxProviderCalls: 8, maxOperations: 16 });
  });

  it('whole-analyst ceilings are exactly double the phase ceilings', () => {
    expect(WHOLE_ANALYST_CEILINGS).toEqual({
      maxProviderCalls: PHASE_CEILINGS.maxProviderCalls * 2,
      maxOperations: PHASE_CEILINGS.maxOperations * 2,
    });
  });

  it('three consecutive failures end a phase early', () => {
    expect(CONSECUTIVE_FAILURE_LIMIT).toBe(3);
  });
});

describe('terminal reasons (§ Early completion and terminal reasons)', () => {
  it('is exactly the six frozen values, in table order', () => {
    expect(TERMINAL_REASONS).toEqual(['satisfied', 'exhausted', 'no_progress', 'blocked', 'cancelled', 'harness_error']);
  });
});

describe('accountUsage', () => {
  it('sums raw and billable tokens independently and tracks the raw high-water', () => {
    const afterFirst = accountUsage(ZERO_USAGE_TOTALS, {
      rawPromptTokens: 500,
      rawOutputTokens: 50,
      billablePromptTokens: 100, // cached prefix — billable can be lower than raw
      billableOutputTokens: 50,
    });
    const afterSecond = accountUsage(afterFirst, {
      rawPromptTokens: 300,
      rawOutputTokens: 40,
      billablePromptTokens: 300,
      billableOutputTokens: 40,
    });

    expect(afterSecond).toEqual({
      calls: 2,
      rawPromptTokens: 800,
      rawOutputTokens: 90,
      billablePromptTokens: 400,
      billableOutputTokens: 90,
      highWaterRawPromptTokens: 500, // the larger of the two raw prompts, not their sum
    });
  });

  it('does not mutate the accumulator it was given', () => {
    const before = { ...ZERO_USAGE_TOTALS };
    accountUsage(ZERO_USAGE_TOTALS, { rawPromptTokens: 1, rawOutputTokens: 1, billablePromptTokens: 1, billableOutputTokens: 1 });
    expect(ZERO_USAGE_TOTALS).toEqual(before);
  });
});

describe('toFingerprint', () => {
  const base: Attempt = {
    attemptId: 'a1',
    phase: 1,
    arm: 'shared',
    operation: 'run_sql',
    parameters: { sql: 'select 1' },
    disposition: 'ok',
    outcome: { op: 'run_sql', sql: 'select 1', resultId: 'r1', schema: [], rowCount: 0, rows: [], complete: true, nextOffset: null, elapsedMs: 1 },
    usage: { rawPromptTokens: 1, rawOutputTokens: 1, billablePromptTokens: 1, billableOutputTokens: 1 },
    requestHash: 'h1',
    createdAt: '2026-08-06T00:00:00.000Z',
  };

  it('is null for a successful attempt — only failures and duplicates are fingerprinted', () => {
    expect(toFingerprint(base)).toBeNull();
  });

  it('carries the error code for a failed attempt', () => {
    const failed: Attempt = {
      ...base,
      disposition: 'error',
      outcome: { ok: false, code: 'sql_error', message: 'boom' },
    };
    expect(toFingerprint(failed)).toEqual({
      operation: 'run_sql',
      requestHash: 'h1',
      disposition: 'error',
      errorCode: 'sql_error',
    });
  });

  it('omits errorCode for a duplicate attempt, which reuses the original ok outcome', () => {
    const duplicate: Attempt = { ...base, disposition: 'duplicate', duplicateOfAttemptId: 'a0' };
    expect(toFingerprint(duplicate)).toEqual({
      operation: 'run_sql',
      requestHash: 'h1',
      disposition: 'duplicate',
    });
  });

  it('never leaks parameters or usage into the compact fingerprint', () => {
    const failed: Attempt = { ...base, disposition: 'error', outcome: { ok: false, code: 'timeout', message: 'slow' } };
    const fingerprint = toFingerprint(failed) as unknown as Record<string, unknown>;
    expect(Object.keys(fingerprint).sort()).toEqual(['disposition', 'errorCode', 'operation', 'requestHash']);
  });
});
