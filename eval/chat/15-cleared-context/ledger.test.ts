// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEvalEngine, type EvalEngine } from '../../duckdb/duckdb';
import { PHASE_CEILINGS, ZERO_USAGE_TOTALS, type Attempt, type Artifact, type Checkpoint, type RoundAccounting } from './contracts';
import {
  createLedgerSchema,
  findAttemptsByRequestHash,
  getArtifact,
  getCheckpoint,
  getRoundAccounting,
  insertArtifact,
  insertAttempt,
  insertRequirement,
  listArtifacts,
  listAttempts,
  listRequirements,
  updateRequirementStatus,
  upsertCheckpoint,
  upsertRoundAccounting,
} from './ledger';

let engine: EvalEngine;

beforeAll(async () => {
  engine = await createEvalEngine();
});

afterAll(async () => {
  await engine.close();
});

beforeEach(async () => {
  // Fresh schema per test — DROP...CASCADE is cheap in an in-memory engine and keeps tests independent.
  await engine.execute('DROP SCHEMA IF EXISTS analysis CASCADE');
  await createLedgerSchema(engine);
});

describe('requirements', () => {
  it('round-trips an insert and reflects a status update', async () => {
    await insertRequirement(engine, { requirementId: 'req-1', description: 'total revenue is 1234.56 ± 0.01', status: 'unsatisfied' });
    expect(await listRequirements(engine)).toEqual([
      { requirementId: 'req-1', description: 'total revenue is 1234.56 ± 0.01', status: 'unsatisfied' },
    ]);

    await updateRequirementStatus(engine, 'req-1', 'satisfied', 'artifact-1');
    expect(await listRequirements(engine)).toEqual([
      { requirementId: 'req-1', description: 'total revenue is 1234.56 ± 0.01', status: 'satisfied', satisfiedByArtifactId: 'artifact-1' },
    ]);
  });
});

function makeAttempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    attemptId: 'attempt-1',
    phase: 1,
    arm: 'shared',
    operation: 'run_sql',
    parameters: { sql: 'select 1' },
    disposition: 'ok',
    outcome: { op: 'run_sql', sql: 'select 1', resultId: 'r1', schema: [], rowCount: 1, rows: [[1]], complete: true, nextOffset: null, elapsedMs: 3 },
    usage: { rawPromptTokens: 100, rawOutputTokens: 20, billablePromptTokens: 100, billableOutputTokens: 20 },
    requestHash: 'hash-1',
    createdAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

describe('attempts', () => {
  it('round-trips a successful attempt, including its full OpOutcome', async () => {
    const attempt = makeAttempt();
    await insertAttempt(engine, attempt);
    expect(await listAttempts(engine)).toEqual([attempt]);
  });

  it('round-trips a failed attempt and preserves the error outcome', async () => {
    const attempt = makeAttempt({
      attemptId: 'attempt-2',
      disposition: 'error',
      outcome: { ok: false, code: 'sql_error', message: 'no such column' },
    });
    await insertAttempt(engine, attempt);
    expect((await listAttempts(engine))[0].outcome).toEqual({ ok: false, code: 'sql_error', message: 'no such column' });
  });

  it('scopes duplicate lookup to the given arms only — isolated branches never see each other', async () => {
    await insertAttempt(engine, makeAttempt({ attemptId: 'shared-1', arm: 'shared', requestHash: 'dup-hash' }));
    await insertAttempt(engine, makeAttempt({ attemptId: 'control-1', phase: 2, arm: 'control', requestHash: 'dup-hash' }));
    await insertAttempt(engine, makeAttempt({ attemptId: 'treatment-1', phase: 2, arm: 'treatment', requestHash: 'dup-hash' }));

    const visibleToControl = await findAttemptsByRequestHash(engine, 'dup-hash', ['shared', 'control']);
    expect(visibleToControl.map((a) => a.attemptId).sort()).toEqual(['control-1', 'shared-1']);

    const visibleToTreatment = await findAttemptsByRequestHash(engine, 'dup-hash', ['shared', 'treatment']);
    expect(visibleToTreatment.map((a) => a.attemptId).sort()).toEqual(['shared-1', 'treatment-1']);
  });

  it('excludes non-ok dispositions from duplicate lookup — a failed attempt is not something to dedupe against', async () => {
    await insertAttempt(engine, makeAttempt({ attemptId: 'failed-1', disposition: 'error', requestHash: 'h', outcome: { ok: false, code: 'timeout', message: 'slow' } }));
    expect(await findAttemptsByRequestHash(engine, 'h', ['shared'])).toEqual([]);
  });
});

describe('artifacts', () => {
  const artifact: Artifact = {
    artifactId: 'artifact-1',
    attemptId: 'attempt-1',
    arm: 'shared',
    operation: 'run_sql',
    sql: 'select 1',
    datasetRevision: 'rev-1',
    schema: [{ name: 'x', type: 'BIGINT' }],
    rowCount: 1,
    rows: [[1]],
    complete: true,
    warnings: [],
    requestHash: 'hash-1',
    resultHash: 'result-hash-1',
    createdAt: '2026-08-06T00:00:00.000Z',
  };

  it('round-trips through listArtifacts and getArtifact identically', async () => {
    await insertArtifact(engine, artifact);
    expect(await listArtifacts(engine)).toEqual([artifact]);
    expect(await getArtifact(engine, 'artifact-1')).toEqual(artifact);
  });

  it('preserves a null sql (an operation that never touched the engine)', async () => {
    await insertArtifact(engine, { ...artifact, sql: null });
    expect((await getArtifact(engine, 'artifact-1'))?.sql).toBeNull();
  });

  it('returns null for an unknown artifact id', async () => {
    expect(await getArtifact(engine, 'nope')).toBeNull();
  });
});

describe('checkpoints', () => {
  const checkpoint: Checkpoint = {
    phase: 1,
    arm: 'shared',
    candidateClaims: [{ claimId: 'c1', statement: 'revenue rose in Q2', evidenceLocators: [{ artifactId: 'artifact-1' }] }],
    caveats: ['excludes refunded orders'],
    openWork: [{ workItemId: 'w1', question: 'check join multiplicity', priority: 1 }],
    recommendedNextAction: 'verify refund exclusion against the requirement',
    createdAt: '2026-08-06T00:00:00.000Z',
  };

  it('round-trips a checkpoint', async () => {
    await upsertCheckpoint(engine, checkpoint);
    expect(await getCheckpoint(engine, 1, 'shared')).toEqual(checkpoint);
  });

  it('replaces rather than duplicates on a second checkpoint for the same (phase, arm) — the bounded repair path', async () => {
    await upsertCheckpoint(engine, checkpoint);
    const repaired: Checkpoint = { ...checkpoint, recommendedNextAction: 'repaired action', caveats: [] };
    await upsertCheckpoint(engine, repaired);

    expect(await getCheckpoint(engine, 1, 'shared')).toEqual(repaired);
    const count = await engine.execute('SELECT COUNT(*) FROM analysis.checkpoints');
    expect(count.rows[0][0]).toBe(1);
  });

  it('returns null when no checkpoint was ever submitted for that (phase, arm)', async () => {
    expect(await getCheckpoint(engine, 2, 'control')).toBeNull();
  });
});

describe('round accounting', () => {
  const round: RoundAccounting = {
    phase: 1,
    arm: 'shared',
    enforcedCeilings: PHASE_CEILINGS,
    actualProviderCalls: 5,
    actualOperations: 9,
    usage: { ...ZERO_USAGE_TOTALS, calls: 5, rawPromptTokens: 4000, rawOutputTokens: 300, billablePromptTokens: 4000, billableOutputTokens: 300, highWaterRawPromptTokens: 1200 },
  };

  it('round-trips a round with no early termination', async () => {
    await upsertRoundAccounting(engine, round);
    expect(await getRoundAccounting(engine, 1, 'shared')).toEqual(round);
  });

  it('records the blocked early-termination reason', async () => {
    const blocked: RoundAccounting = { ...round, phase: 2, arm: 'treatment', endedEarly: 'blocked' };
    await upsertRoundAccounting(engine, blocked);
    expect(await getRoundAccounting(engine, 2, 'treatment')).toEqual(blocked);
  });

  it('returns null for a round that never ran', async () => {
    expect(await getRoundAccounting(engine, 2, 'control')).toBeNull();
  });
});
