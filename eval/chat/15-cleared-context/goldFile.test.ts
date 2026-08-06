// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEvalEngine, type EvalEngine } from '../../duckdb/duckdb';
import type { Artifact, Checkpoint } from './contracts';
import { createGoldFileChecker, evaluateRequirementCheck, type GoldFile } from './goldFile';
import { createLedgerSchema, insertArtifact, insertRequirement, listRequirements, upsertCheckpoint } from './ledger';

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

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    artifactId: 'a1',
    attemptId: 'attempt-1',
    arm: 'shared',
    operation: 'run_sql',
    sql: 'SELECT SUM(amount) AS total FROM orders WHERE region = \'west\' GROUP BY region',
    datasetRevision: 'rev-1',
    schema: [{ name: 'total', type: 'DECIMAL(12,2)' }],
    rowCount: 1,
    rows: [[1234.56]],
    complete: true,
    warnings: [],
    requestHash: 'h1',
    resultHash: 'r1',
    createdAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

function checkpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    phase: 1,
    arm: 'shared',
    candidateClaims: [],
    caveats: [],
    openWork: [],
    recommendedNextAction: '',
    createdAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

describe('evaluateRequirementCheck — accepted_value', () => {
  const check = { kind: 'accepted_value' as const, requirementId: 'req-1', expected: 1234.56, tolerance: 0.01 };

  it('satisfies when a matching cell is within tolerance', () => {
    const result = evaluateRequirementCheck(check, { artifacts: [artifact()], checkpoint: null });
    expect(result).toEqual({ satisfied: true, satisfyingArtifactId: 'a1' });
  });

  it('does not satisfy outside tolerance', () => {
    const result = evaluateRequirementCheck({ ...check, expected: 1234.56, tolerance: 0.001 }, { artifacts: [artifact({ rows: [[1234.58]] })], checkpoint: null });
    expect(result.satisfied).toBe(false);
  });

  it('restricts the scan to the named column when given', () => {
    const twoColumnArtifact = artifact({
      schema: [{ name: 'count', type: 'BIGINT' }, { name: 'total', type: 'DECIMAL(12,2)' }],
      rows: [[1234, 999]], // "count" coincidentally matches the expected value, "total" does not
    });
    const result = evaluateRequirementCheck({ ...check, expected: 1234, tolerance: 0.01, column: 'total' }, { artifacts: [twoColumnArtifact], checkpoint: null });
    expect(result.satisfied).toBe(false); // the match is in "count", which is excluded
  });
});

describe('evaluateRequirementCheck — required_entity', () => {
  const check = { kind: 'required_entity' as const, requirementId: 'req-1', entity: 'west' };

  it('satisfies when the entity appears in a row cell', () => {
    const result = evaluateRequirementCheck(check, { artifacts: [artifact({ schema: [{ name: 'region', type: 'VARCHAR' }], rows: [['west']] })], checkpoint: null });
    expect(result.satisfied).toBe(true);
  });

  it('satisfies when the entity appears only in the recorded SQL', () => {
    const result = evaluateRequirementCheck(check, { artifacts: [artifact({ rows: [[1]] })], checkpoint: null }); // "west" is in the fixture's default SQL
    expect(result.satisfied).toBe(true);
  });

  it('is case-insensitive by default and case-sensitive when requested', () => {
    const upper = artifact({ sql: 'SELECT * FROM orders WHERE region = \'WEST\'' });
    expect(evaluateRequirementCheck(check, { artifacts: [upper], checkpoint: null }).satisfied).toBe(true);
    expect(evaluateRequirementCheck({ ...check, caseSensitive: true }, { artifacts: [upper], checkpoint: null }).satisfied).toBe(false);
  });
});

describe('evaluateRequirementCheck — required_caveat', () => {
  const check = { kind: 'required_caveat' as const, requirementId: 'req-1', pattern: 'refund', matchType: 'substring' as const };

  it('is unsatisfied when there is no checkpoint at all', () => {
    expect(evaluateRequirementCheck(check, { artifacts: [], checkpoint: null }).satisfied).toBe(false);
  });

  it('satisfies on a substring match against a caveat', () => {
    const result = evaluateRequirementCheck(check, { artifacts: [], checkpoint: checkpoint({ caveats: ['excludes refunded orders'] }) });
    expect(result.satisfied).toBe(true);
  });

  it('satisfies on a regex match', () => {
    const regexCheck = { ...check, pattern: 'refund(ed)?\\s+orders', matchType: 'regex' as const };
    const result = evaluateRequirementCheck(regexCheck, { artifacts: [], checkpoint: checkpoint({ caveats: ['excludes refunded orders'] }) });
    expect(result.satisfied).toBe(true);
  });
});

describe('evaluateRequirementCheck — prohibited_substitution', () => {
  const check = { kind: 'prohibited_substitution' as const, requirementId: 'req-1', prohibitedTerm: 'profit', matchType: 'substring' as const };

  it('is satisfied (the prohibition holds) when the term appears nowhere', () => {
    const result = evaluateRequirementCheck(check, { artifacts: [artifact({ sql: 'SELECT revenue FROM orders' })], checkpoint: checkpoint() });
    expect(result.satisfied).toBe(true);
  });

  it('is unsatisfied (violated) when the term appears in artifact SQL', () => {
    const result = evaluateRequirementCheck(check, { artifacts: [artifact({ sql: 'SELECT profit FROM orders' })], checkpoint: null });
    expect(result.satisfied).toBe(false);
  });

  it('is unsatisfied when the term appears in a checkpoint claim statement', () => {
    const withClaim = checkpoint({
      candidateClaims: [{ claimId: 'c1', statement: 'profit rose in Q2', evidenceLocators: [{ artifactId: 'a1' }] }],
    });
    const result = evaluateRequirementCheck(check, { artifacts: [], checkpoint: withClaim });
    expect(result.satisfied).toBe(false);
  });
});

describe('evaluateRequirementCheck — structural_scope', () => {
  const check = { kind: 'structural_scope' as const, requirementId: 'req-1', requiredSqlFragments: ['GROUP BY', 'region'] };

  it('satisfies when every fragment appears in one artifact\'s SQL', () => {
    expect(evaluateRequirementCheck(check, { artifacts: [artifact()], checkpoint: null }).satisfied).toBe(true);
  });

  it('does not satisfy when a fragment is missing, even if others match', () => {
    const result = evaluateRequirementCheck(check, { artifacts: [artifact({ sql: 'SELECT SUM(amount) FROM orders' })], checkpoint: null });
    expect(result.satisfied).toBe(false);
  });

  it('does not satisfy when fragments are split across two different artifacts', () => {
    const a = artifact({ artifactId: 'a1', sql: 'SELECT SUM(amount) FROM orders GROUP BY status' }); // has GROUP BY, not "region"
    const b = artifact({ artifactId: 'a2', sql: 'SELECT region FROM orders' }); // has "region", not GROUP BY
    const result = evaluateRequirementCheck(check, { artifacts: [a, b], checkpoint: null });
    expect(result.satisfied).toBe(false);
  });
});

describe('createGoldFileChecker — ledger integration', () => {
  const goldFile: GoldFile = {
    taskId: 'task-1',
    checks: [
      { kind: 'accepted_value', requirementId: 'req-value', expected: 1234.56, tolerance: 0.01 },
      { kind: 'prohibited_substitution', requirementId: 'req-no-profit', prohibitedTerm: 'profit', matchType: 'substring' },
    ],
  };

  it('satisfies a requirement once matching evidence is inserted, and reports one transition', async () => {
    await insertRequirement(engine, { requirementId: 'req-value', description: 'total revenue', status: 'unsatisfied' });
    await insertRequirement(engine, { requirementId: 'req-no-profit', description: 'never substitutes profit', status: 'unsatisfied' });

    const checker = createGoldFileChecker(goldFile);
    const firstPass = await checker(engine, ['shared']);
    // req-no-profit starts satisfied (nothing violates it yet, and no artifacts exist) —
    // req-value stays unsatisfied (no artifacts yet) — so exactly one transition.
    expect(firstPass).toBe(1);

    await insertArtifact(engine, artifact());
    const secondPass = await checker(engine, ['shared']);
    expect(secondPass).toBe(1); // req-value newly satisfied
    const requirements = await listRequirements(engine);
    expect(requirements.find((r) => r.requirementId === 'req-value')).toMatchObject({ status: 'satisfied', satisfiedByArtifactId: 'a1' });
  });

  it('reports zero transitions on a re-check with no new evidence', async () => {
    await insertRequirement(engine, { requirementId: 'req-value', description: 'x', status: 'unsatisfied' });
    await insertRequirement(engine, { requirementId: 'req-no-profit', description: 'y', status: 'unsatisfied' });
    const checker = createGoldFileChecker(goldFile);
    await checker(engine, ['shared']);
    expect(await checker(engine, ['shared'])).toBe(0);
  });

  it('can un-satisfy a prohibited_substitution requirement when new violating evidence appears', async () => {
    await insertRequirement(engine, { requirementId: 'req-no-profit', description: 'x', status: 'unsatisfied' });
    const checker = createGoldFileChecker(goldFile);
    await checker(engine, ['shared']); // becomes satisfied — nothing violates it yet
    expect((await listRequirements(engine))[0].status).toBe('satisfied');

    await insertArtifact(engine, artifact({ artifactId: 'bad', sql: 'SELECT profit FROM orders' }));
    const transitioned = await checker(engine, ['shared']);
    expect(transitioned).toBe(1);
    expect((await listRequirements(engine))[0].status).toBe('unsatisfied');
  });

  it('ignores a check whose requirementId was never seeded in this run', async () => {
    const checker = createGoldFileChecker(goldFile); // neither requirement inserted
    await expect(checker(engine, ['shared'])).resolves.toBe(0);
  });

  it('reads the checkpoint for required_caveat/prohibited_substitution checks', async () => {
    await insertRequirement(engine, { requirementId: 'req-caveat', description: 'must caveat refunds', status: 'unsatisfied' });
    const caveatGoldFile: GoldFile = {
      taskId: 'task-2',
      checks: [{ kind: 'required_caveat', requirementId: 'req-caveat', pattern: 'refund', matchType: 'substring' }],
    };
    const checker = createGoldFileChecker(caveatGoldFile);
    expect(await checker(engine, ['shared'])).toBe(0); // no checkpoint yet

    await upsertCheckpoint(engine, checkpoint({ caveats: ['excludes refunded orders'] }));
    expect(await checker(engine, ['shared'])).toBe(1);
    expect((await listRequirements(engine))[0].status).toBe('satisfied');
  });
});
