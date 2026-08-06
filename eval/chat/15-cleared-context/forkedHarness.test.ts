// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AnalystMcpSession } from '../../../src/lib/analyst/mcp/connect';
import type { OpOutcome } from '../../../src/lib/analyst/types';
import type { AITool, ProviderMessage, ProviderTurn } from '../../../src/types';
import { createEvalEngine, type EvalEngine } from '../../duckdb/duckdb';
import {
  classifyPhaseTwoOutcome,
  requestCheckpoint,
  runExperiment15A,
  runOperationLoop,
  type MeteredComplete,
  type OperationLoopResult,
} from './forkedHarness';
import { createLedgerSchema, insertAttempt, insertRequirement, listAttempts, updateRequirementStatus } from './ledger';
import type { CallUsage, PhaseCeilings } from './contracts';

let engine: EvalEngine;
beforeAll(async () => {
  engine = await createEvalEngine();
});
afterAll(async () => {
  await engine.close();
});
beforeEach(async () => {
  await engine.execute('DROP SCHEMA IF EXISTS analysis CASCADE');
  await createLedgerSchema(engine);
});

const USAGE: CallUsage = { rawPromptTokens: 10, rawOutputTokens: 5, billablePromptTokens: 10, billableOutputTokens: 5 };
const GENEROUS: PhaseCeilings = { maxProviderCalls: 100, maxOperations: 100 };

function turn(text: string, calls: ProviderTurn['calls'] = []): ProviderTurn {
  return { text, calls };
}

function scriptedComplete(script: readonly ProviderTurn[]): { complete: MeteredComplete; calls: ProviderMessage[][] } {
  const calls: ProviderMessage[][] = [];
  let i = 0;
  const complete: MeteredComplete = async (messages) => {
    // Snapshot, not a reference — `runOperationLoop` mutates its internal `messages`
    // array in place across turns, so capturing the same reference would let a later
    // push retroactively change what an earlier call appears to have seen.
    calls.push([...messages]);
    const t = script[Math.min(i, script.length - 1)];
    i += 1;
    return { turn: t, usage: USAGE };
  };
  return { complete, calls };
}

function fakeSession(callImpl: (name: string, args: unknown) => Promise<OpOutcome>): AnalystMcpSession & { callCount: number } {
  const state = { callCount: 0 };
  return {
    async tools(): Promise<AITool[]> {
      return [{ name: 'run_sql', description: 'x', inputSchema: {} }];
    },
    async call(name, args) {
      state.callCount += 1;
      return callImpl(name, args);
    },
    async close() {},
    get callCount() {
      return state.callCount;
    },
  };
}

function okResult(overrides: Partial<Extract<OpOutcome, { op: string }>> = {}): OpOutcome {
  return {
    op: 'run_sql',
    sql: 'select 1',
    resultId: 'r1',
    schema: [{ name: 'x', type: 'BIGINT' }],
    rowCount: 1,
    rows: [[1]],
    complete: true,
    nextOffset: null,
    elapsedMs: 1,
    ...overrides,
  };
}

const errorResult: OpOutcome = { ok: false, code: 'sql_error', message: 'boom' };

async function neverSatisfies(): Promise<number> {
  return 0;
}

describe('runOperationLoop — ceilings', () => {
  it('stops before starting a new turn once the provider-call ceiling is reached', async () => {
    const { complete } = scriptedComplete([turn('x', [{ id: '1', name: 'run_sql', input: { sql: 'a' } }])]);
    const session = fakeSession(async () => okResult());
    const result = await runOperationLoop({
      phase: 1,
      arm: 'shared',
      visibleArms: ['shared'],
      datasetRevision: 'rev-1',
      session,
      complete,
      messages: [],
      ceilings: { maxProviderCalls: 2, maxOperations: 100 },
      engine,
      checkRequirements: neverSatisfies,
    });
    expect(result.accounting.actualProviderCalls).toBe(2);
  });

  it('finishes a turn that pushes operations past the ceiling rather than cutting it mid-turn', async () => {
    const threeCalls = turn('x', [
      { id: '1', name: 'run_sql', input: { sql: 'a' } },
      { id: '2', name: 'run_sql', input: { sql: 'b' } },
      { id: '3', name: 'run_sql', input: { sql: 'c' } },
    ]);
    const { complete } = scriptedComplete([threeCalls, turn('done')]);
    const session = fakeSession(async () => okResult());
    const result = await runOperationLoop({
      phase: 1,
      arm: 'shared',
      visibleArms: ['shared'],
      datasetRevision: 'rev-1',
      session,
      complete,
      messages: [],
      ceilings: { maxProviderCalls: 100, maxOperations: 2 },
      engine,
      checkRequirements: neverSatisfies,
    });
    expect(result.accounting.actualOperations).toBe(3); // all 3 in the turn ran, even past the ceiling of 2
    expect(result.accounting.actualProviderCalls).toBe(1); // but a second turn was never started
  });

  it('a voluntary stop (empty calls) ends the loop before the ceiling', async () => {
    const { complete } = scriptedComplete([turn('nothing more to do', [])]);
    const session = fakeSession(async () => okResult());
    const result = await runOperationLoop({
      phase: 1,
      arm: 'shared',
      visibleArms: ['shared'],
      datasetRevision: 'rev-1',
      session,
      complete,
      messages: [],
      ceilings: GENEROUS,
      engine,
      checkRequirements: neverSatisfies,
    });
    expect(result.accounting.actualProviderCalls).toBe(1);
    expect(result.accounting.actualOperations).toBe(0);
  });
});

describe('runOperationLoop — blocked', () => {
  it('three consecutive failed operations end the phase early, without attempting a fourth', async () => {
    const fourFailingCalls = turn('x', [
      { id: '1', name: 'run_sql', input: { sql: 'a' } },
      { id: '2', name: 'run_sql', input: { sql: 'b' } },
      { id: '3', name: 'run_sql', input: { sql: 'c' } },
      { id: '4', name: 'run_sql', input: { sql: 'd' } },
    ]);
    const { complete } = scriptedComplete([fourFailingCalls]);
    const session = fakeSession(async () => errorResult);
    const result = await runOperationLoop({
      phase: 2,
      arm: 'treatment',
      visibleArms: ['shared', 'treatment'],
      datasetRevision: 'rev-1',
      session,
      complete,
      messages: [],
      ceilings: GENEROUS,
      engine,
      checkRequirements: neverSatisfies,
    });
    expect(result.accounting.endedEarly).toBe('blocked');
    expect(result.accounting.actualOperations).toBe(3); // the 4th call in the turn was never attempted
    expect(session.callCount).toBe(3);
  });

  it('a duplicate does not count toward the consecutive-failure streak', async () => {
    // Two failures, then a duplicate of a prior *successful* attempt, then two more failures —
    // never 3 in a row, so the phase should not be blocked.
    await insertAttempt(engine, {
      attemptId: 'prior-ok',
      phase: 1,
      arm: 'shared',
      operation: 'run_sql',
      parameters: { sql: 'dup' },
      disposition: 'ok',
      outcome: okResult(),
      usage: USAGE,
      requestHash: 'dup-hash',
      createdAt: '2026-08-06T00:00:00.000Z',
    });

    const calls = turn('x', [
      { id: '1', name: 'run_sql', input: { sql: 'fail-a' } },
      { id: '2', name: 'run_sql', input: { sql: 'fail-b' } },
      { id: '3', name: 'run_sql', input: { sql: 'dup' } },
      { id: '4', name: 'run_sql', input: { sql: 'fail-c' } },
      { id: '5', name: 'run_sql', input: { sql: 'fail-d' } },
    ]);
    const { complete } = scriptedComplete([calls, turn('done')]);
    const session = fakeSession(async (_name, args) => ((args as { sql: string }).sql === 'dup' ? okResult() : errorResult));
    const result = await runOperationLoop({
      phase: 1,
      arm: 'shared',
      visibleArms: ['shared'],
      datasetRevision: 'rev-1',
      session,
      complete,
      messages: [],
      ceilings: GENEROUS,
      engine,
      checkRequirements: neverSatisfies,
    });
    expect(result.accounting.endedEarly).toBeUndefined();
    expect(result.accounting.actualOperations).toBe(5);
  });
});

describe('runOperationLoop — exact-duplicate detection', () => {
  it('skips execution for a request already seen in a visible arm and links duplicateOfAttemptId', async () => {
    const calls = turn('x', [
      { id: '1', name: 'run_sql', input: { sql: 'select 1' } },
      { id: '2', name: 'run_sql', input: { sql: 'select 1' } }, // identical request
    ]);
    const { complete } = scriptedComplete([calls, turn('done')]);
    const session = fakeSession(async () => okResult());
    await runOperationLoop({
      phase: 1,
      arm: 'shared',
      visibleArms: ['shared'],
      datasetRevision: 'rev-1',
      session,
      complete,
      messages: [],
      ceilings: GENEROUS,
      engine,
      checkRequirements: neverSatisfies,
    });
    expect(session.callCount).toBe(1); // the second, identical call was never executed

    const attempts = await listAttempts(engine);
    expect(attempts.map((a) => a.disposition).sort()).toEqual(['duplicate', 'ok']);
    const duplicate = attempts.find((a) => a.disposition === 'duplicate')!;
    const original = attempts.find((a) => a.disposition === 'ok')!;
    expect(duplicate.duplicateOfAttemptId).toBe(original.attemptId);
  });

  it('does not treat an identical request in a non-visible arm as a duplicate — branch isolation', async () => {
    await insertAttempt(engine, {
      attemptId: 'treatment-attempt',
      phase: 2,
      arm: 'treatment',
      operation: 'run_sql',
      parameters: { sql: 'select 1' },
      disposition: 'ok',
      outcome: okResult(),
      usage: USAGE,
      requestHash: 'irrelevant-because-recomputed-below',
      createdAt: '2026-08-06T00:00:00.000Z',
    });

    const { complete } = scriptedComplete([turn('x', [{ id: '1', name: 'run_sql', input: { sql: 'select 1' } }]), turn('done')]);
    const session = fakeSession(async () => okResult());
    await runOperationLoop({
      phase: 2,
      arm: 'control',
      visibleArms: ['shared', 'control'], // deliberately excludes 'treatment'
      datasetRevision: 'rev-1',
      session,
      complete,
      messages: [],
      ceilings: GENEROUS,
      engine,
      checkRequirements: neverSatisfies,
    });
    expect(session.callCount).toBe(1); // executed for real — treatment's identical attempt was invisible
  });
});

describe('runOperationLoop — requirement satisfaction stops the loop early', () => {
  it('stops as soon as checkRequirements reports every requirement satisfied, before the ceiling', async () => {
    await insertRequirement(engine, { requirementId: 'req-1', description: 'x', status: 'unsatisfied' });
    const alwaysSatisfy = async (): Promise<number> => {
      await updateRequirementStatus(engine, 'req-1', 'satisfied');
      return 1;
    };
    const { complete } = scriptedComplete([
      turn('x', [{ id: '1', name: 'run_sql', input: { sql: 'a' } }]),
      turn('should never run', [{ id: '2', name: 'run_sql', input: { sql: 'b' } }]),
    ]);
    const session = fakeSession(async () => okResult());
    const result = await runOperationLoop({
      phase: 1,
      arm: 'shared',
      visibleArms: ['shared'],
      datasetRevision: 'rev-1',
      session,
      complete,
      messages: [],
      ceilings: GENEROUS,
      engine,
      checkRequirements: alwaysSatisfy,
    });
    expect(result.accounting.actualProviderCalls).toBe(1);
    expect(result.requirementTransitionCount).toBe(1);
  });
});

describe('classifyPhaseTwoOutcome', () => {
  function loopResult(overrides: Partial<OperationLoopResult['accounting']> = {}, extra: Partial<OperationLoopResult> = {}): OperationLoopResult {
    return {
      messages: [],
      newArtifactCount: 0,
      requirementTransitionCount: 0,
      accounting: {
        phase: 2,
        arm: 'control',
        enforcedCeilings: GENEROUS,
        actualProviderCalls: 1,
        actualOperations: 1,
        usage: { calls: 1, rawPromptTokens: 1, rawOutputTokens: 1, billablePromptTokens: 1, billableOutputTokens: 1, highWaterRawPromptTokens: 1 },
        ...overrides,
      },
      ...extra,
    };
  }

  it('blocked takes priority regardless of requirement state', () => {
    const outcome = classifyPhaseTwoOutcome('control', loopResult({ endedEarly: 'blocked' }), ['still unmet']);
    expect(outcome).toMatchObject({ terminalReason: 'blocked' });
  });

  it('satisfied when no requirements remain unmet', () => {
    const outcome = classifyPhaseTwoOutcome('control', loopResult(), []);
    expect(outcome).toMatchObject({ terminalReason: 'satisfied' });
  });

  it('no_progress when nothing new happened and requirements remain unmet', () => {
    const outcome = classifyPhaseTwoOutcome('treatment', loopResult(), ['still unmet']);
    expect(outcome).toMatchObject({ terminalReason: 'no_progress', materialUnmetRequirements: ['still unmet'] });
  });

  it('exhausted when the phase produced new evidence but did not fully satisfy the task', () => {
    const outcome = classifyPhaseTwoOutcome(
      'control',
      loopResult({}, { newArtifactCount: 1 }),
      ['still unmet'],
    );
    expect(outcome).toMatchObject({ terminalReason: 'exhausted' });
  });
});

describe('requestCheckpoint', () => {
  const knownArtifactIds = new Set(['artifact-1']);
  const validSubmission = {
    candidateClaims: [{ claimId: 'c1', statement: 's', evidenceLocators: [{ artifactId: 'artifact-1' }] }],
    caveats: [],
    openWork: [],
    recommendedNextAction: 'next',
  };

  it('returns the checkpoint on a valid first submission, with exactly one call', async () => {
    const { complete, calls } = scriptedComplete([turn(JSON.stringify(validSubmission))]);
    const result = await requestCheckpoint(complete, [], knownArtifactIds, 1, 'shared');
    expect(result.checkpoint).toMatchObject({ phase: 1, arm: 'shared', ...validSubmission });
    expect(calls.length).toBe(1);
  });

  it('repairs once on an invalid first submission and succeeds on the second', async () => {
    const { complete, calls } = scriptedComplete([turn('not json at all'), turn(JSON.stringify(validSubmission))]);
    const result = await requestCheckpoint(complete, [], knownArtifactIds, 1, 'shared');
    expect(result.checkpoint).not.toBeNull();
    expect(calls.length).toBe(2);
    // the repair prompt is visible in the second call's messages
    expect(calls[1].some((m) => m.role === 'user' && m.content.includes('only repair attempt'))).toBe(true);
  });

  it('gives up after the repair also fails, with exactly two calls total', async () => {
    const { complete, calls } = scriptedComplete([turn('nope'), turn('still nope')]);
    const result = await requestCheckpoint(complete, [], knownArtifactIds, 1, 'shared');
    expect(result.checkpoint).toBeNull();
    expect(calls.length).toBe(2);
  });
});

describe('runExperiment15A', () => {
  it('ends satisfied_before_boundary and never requests a checkpoint or runs phase two', async () => {
    await insertRequirement(engine, { requirementId: 'req-1', description: 'x', status: 'unsatisfied' });
    const satisfiesImmediately = async (): Promise<number> => {
      await updateRequirementStatus(engine, 'req-1', 'satisfied');
      return 1;
    };
    const { complete, calls } = scriptedComplete([turn('x', [{ id: '1', name: 'run_sql', input: { sql: 'a' } }])]);
    const session = fakeSession(async () => okResult());

    const result = await runExperiment15A({
      originalTask: 'why did revenue fall?',
      operatingManual: 'SYSTEM PROMPT',
      datasetRevision: 'rev-1',
      schemaSummary: 'orders(...)',
      session,
      engine,
      complete,
      checkRequirements: satisfiesImmediately,
      maxBriefingBytes: 100_000,
    });

    expect(result).toEqual({ kind: 'satisfied_before_boundary' });
    expect(calls.length).toBe(1); // only phase one's single provider call — no checkpoint, no phase two
  });

  it('carries the full transcript into control but only the operating manual + briefing into treatment', async () => {
    await insertRequirement(engine, { requirementId: 'req-1', description: 'total revenue', status: 'unsatisfied' });
    const validCheckpoint = { candidateClaims: [], caveats: [], openWork: [], recommendedNextAction: 'keep going' };

    const { complete, calls } = scriptedComplete([
      turn('working', [{ id: '1', name: 'run_sql', input: { sql: 'select 1' } }]), // phase 1, call 1
      turn('done with phase one', []), // phase 1, call 2 — voluntary stop
      turn(JSON.stringify(validCheckpoint)), // checkpoint request
      turn('control done', []), // control phase 2 — immediate voluntary stop
      turn('treatment done', []), // treatment phase 2 — immediate voluntary stop
    ]);
    const session = fakeSession(async () => okResult());

    const result = await runExperiment15A({
      originalTask: 'why did revenue fall?',
      operatingManual: 'SYSTEM PROMPT',
      datasetRevision: 'rev-1',
      schemaSummary: 'orders(...)',
      session,
      engine,
      complete,
      checkRequirements: neverSatisfies,
      maxBriefingBytes: 100_000,
    });

    expect(result.kind).toBe('scored');
    if (result.kind !== 'scored') throw new Error('unreachable');
    // Neither arm produced anything in phase two (immediate voluntary stop) and the
    // requirement never got satisfied — both classify as no_progress.
    expect(result.control).toMatchObject({ terminalReason: 'no_progress' });
    expect(result.treatment).toMatchObject({ terminalReason: 'no_progress' });

    expect(calls.length).toBe(5);
    const controlMessages = calls[3];
    const treatmentMessages = calls[4];

    expect(controlMessages[0]).toEqual({ role: 'system', content: 'SYSTEM PROMPT' });
    expect(controlMessages.length).toBeGreaterThan(2); // retains the phase-one exchange
    expect(controlMessages.at(-1)?.role).toBe('user'); // the briefing message

    expect(treatmentMessages).toHaveLength(2); // system + briefing only, transcript discarded
    expect(treatmentMessages[0]).toEqual({ role: 'system', content: 'SYSTEM PROMPT' });
    expect(treatmentMessages[1]).toEqual(controlMessages.at(-1)); // the identical briefing byte-for-byte
  });

  it('classifies an arm as harness_error when its phase two throws, without affecting the other arm', async () => {
    await insertRequirement(engine, { requirementId: 'req-1', description: 'x', status: 'unsatisfied' });
    const validCheckpoint = { candidateClaims: [], caveats: [], openWork: [], recommendedNextAction: '' };
    const { complete } = scriptedComplete([
      turn('p1', []), // phase one voluntary stop immediately
      turn(JSON.stringify(validCheckpoint)), // checkpoint
      turn('control turn', [{ id: '1', name: 'run_sql', input: { sql: 'boom' } }]), // control phase 2 — will throw
      turn('treatment done', []), // treatment phase 2 — fine
    ]);
    let callIndex = 0;
    const session: AnalystMcpSession = {
      async tools() {
        return [{ name: 'run_sql', description: 'x', inputSchema: {} }];
      },
      async call() {
        callIndex += 1;
        throw new Error('engine exploded');
      },
      async close() {},
    };

    const result = await runExperiment15A({
      originalTask: 'q',
      operatingManual: 'SYSTEM',
      datasetRevision: 'rev-1',
      schemaSummary: 's',
      session,
      engine,
      complete,
      checkRequirements: neverSatisfies,
      maxBriefingBytes: 100_000,
    });

    expect(result.kind).toBe('scored');
    if (result.kind !== 'scored') throw new Error('unreachable');
    expect(result.control).toMatchObject({ terminalReason: 'harness_error', materialUnmetRequirements: [] });
    expect(result.treatment).toMatchObject({ terminalReason: 'no_progress' });
    expect(callIndex).toBe(1); // treatment's phase two made no tool calls, so session.call ran only for control
  });
});
