import { describe, expect, it } from 'vitest';
import { buildMidpointBriefing, type BuildBriefingInput } from './briefingBuilder';
import type { Artifact, Attempt, Checkpoint, Requirement } from './contracts';

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    artifactId: 'a1',
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
    requestHash: 'h1',
    resultHash: 'r1',
    createdAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    attemptId: 'attempt-1',
    phase: 1,
    arm: 'shared',
    operation: 'run_sql',
    parameters: { sql: 'select 1' },
    disposition: 'ok',
    outcome: { op: 'run_sql', sql: 'select 1', resultId: 'r1', schema: [], rowCount: 1, rows: [[1]], complete: true, nextOffset: null, elapsedMs: 1 },
    usage: { rawPromptTokens: 1, rawOutputTokens: 1, billablePromptTokens: 1, billableOutputTokens: 1 },
    requestHash: 'h1',
    createdAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

const baseInput: BuildBriefingInput = {
  originalTask: 'Why did revenue fall in Q2?',
  requirements: [{ requirementId: 'req-1', description: 'total revenue value', status: 'unsatisfied' }],
  schemaSummary: 'orders(order_id, amount, ordered_at)',
  artifacts: [],
  checkpoint: null,
  attempts: [],
  remainingCeilings: { phaseProviderCalls: 4, phaseOperations: 8, wholeProviderCalls: 12, wholeOperations: 24 },
};

describe('buildMidpointBriefing — required content', () => {
  it('always includes the original task, every requirement, and the schema summary regardless of budget', () => {
    const briefing = buildMidpointBriefing(baseInput, 1); // an impossibly tiny budget
    expect(briefing.originalTask).toBe(baseInput.originalTask);
    expect(briefing.mandatoryRequirements).toEqual(baseInput.requirements);
    expect(briefing.schemaSummary).toBe(baseInput.schemaSummary);
  });

  it('contains no raw transcript field — the packet type itself has none to leak', () => {
    const briefing = buildMidpointBriefing(baseInput, 100_000);
    expect(Object.keys(briefing)).not.toContain('transcript');
  });

  it('defaults caveats/openWork/recommendedNextAction to empty when phase one produced no checkpoint', () => {
    const briefing = buildMidpointBriefing(baseInput, 100_000);
    expect(briefing.modelCaveats).toEqual([]);
    expect(briefing.openWork).toEqual([]);
    expect(briefing.recommendedNextAction).toBe('');
  });
});

describe('buildMidpointBriefing — ranking', () => {
  const requirements: Requirement[] = [{ requirementId: 'req-1', description: 'revenue', status: 'satisfied', satisfiedByArtifactId: 'linked' }];
  const artifacts: Artifact[] = [
    artifact({ artifactId: 'unlinked-old', createdAt: '2026-08-01T00:00:00.000Z' }),
    artifact({ artifactId: 'linked', createdAt: '2026-08-02T00:00:00.000Z' }),
    artifact({ artifactId: 'unlinked-new', createdAt: '2026-08-03T00:00:00.000Z' }),
  ];

  it('ranks requirement-linked findings first, then newest-first within each group', () => {
    const briefing = buildMidpointBriefing({ ...baseInput, requirements, artifacts }, 100_000);
    expect(briefing.verifiedFindings.map((f) => f.artifactId)).toEqual(['linked', 'unlinked-new', 'unlinked-old']);
    expect(briefing.verifiedFindings.find((f) => f.artifactId === 'linked')?.requirementId).toBe('req-1');
    expect(briefing.verifiedFindings.find((f) => f.artifactId === 'unlinked-new')?.requirementId).toBeUndefined();
  });

  it('sorts open work by declared priority ascending', () => {
    const checkpoint: Checkpoint = {
      phase: 1,
      arm: 'shared',
      candidateClaims: [],
      caveats: [],
      openWork: [
        { workItemId: 'w-low', question: 'low priority', priority: 5 },
        { workItemId: 'w-high', question: 'high priority', priority: 1 },
      ],
      recommendedNextAction: 'keep going',
      createdAt: '2026-08-06T00:00:00.000Z',
    };
    const briefing = buildMidpointBriefing({ ...baseInput, checkpoint }, 100_000);
    expect(briefing.openWork.map((w) => w.workItemId)).toEqual(['w-high', 'w-low']);
  });

  it('sources caveats and the recommended next action from the checkpoint, visibly as its own fields', () => {
    const checkpoint: Checkpoint = {
      phase: 1,
      arm: 'shared',
      candidateClaims: [],
      caveats: ['excludes refunded orders'],
      openWork: [],
      recommendedNextAction: 'verify refund exclusion',
      createdAt: '2026-08-06T00:00:00.000Z',
    };
    const briefing = buildMidpointBriefing({ ...baseInput, checkpoint }, 100_000);
    expect(briefing.modelCaveats).toEqual(['excludes refunded orders']);
    expect(briefing.recommendedNextAction).toBe('verify refund exclusion');
  });

  it('deduplicates identical failure/duplicate fingerprints across repeated attempts', () => {
    const attempts: Attempt[] = [
      attempt({ attemptId: 'e1', disposition: 'error', requestHash: 'same', outcome: { ok: false, code: 'sql_error', message: 'x' } }),
      attempt({ attemptId: 'e2', disposition: 'error', requestHash: 'same', outcome: { ok: false, code: 'sql_error', message: 'x' } }),
      attempt({ attemptId: 'e3', disposition: 'error', requestHash: 'different', outcome: { ok: false, code: 'timeout', message: 'y' } }),
      attempt({ attemptId: 'ok', disposition: 'ok' }), // never fingerprinted
    ];
    const briefing = buildMidpointBriefing({ ...baseInput, attempts }, 100_000);
    expect(briefing.failureFingerprints).toEqual([
      { operation: 'run_sql', requestHash: 'same', disposition: 'error', errorCode: 'sql_error' },
      { operation: 'run_sql', requestHash: 'different', disposition: 'error', errorCode: 'timeout' },
    ]);
  });
});

describe('buildMidpointBriefing — bounded truncation', () => {
  const manyArtifacts: Artifact[] = Array.from({ length: 20 }, (_, i) =>
    artifact({ artifactId: `a${i}`, createdAt: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
  );

  it('respects the byte ceiling, measured on content excluding the size field itself (a Content-Length header does not count its own bytes)', () => {
    const briefing = buildMidpointBriefing({ ...baseInput, artifacts: manyArtifacts }, 900);
    expect(briefing.serializedByteSize).toBeLessThanOrEqual(900);
    const { serializedByteSize: _reported, ...content } = briefing;
    expect(Buffer.byteLength(JSON.stringify(content), 'utf8')).toBe(briefing.serializedByteSize);
  });

  it('drops from the bottom of the rank order first — findings are cut before caveats are ever reached', () => {
    const checkpoint: Checkpoint = {
      phase: 1,
      arm: 'shared',
      candidateClaims: [],
      caveats: ['a caveat that must survive'],
      openWork: [],
      recommendedNextAction: '',
      createdAt: '2026-08-06T00:00:00.000Z',
    };
    // A budget that fits the required fields plus a handful of findings, but
    // not all twenty — the point is that whichever findings survive are a
    // prefix of the ranked list (newest-first here, since none are linked),
    // never a re-ordering to fit more in.
    const briefing = buildMidpointBriefing({ ...baseInput, artifacts: manyArtifacts, checkpoint }, 1200);
    expect(briefing.verifiedFindings.length).toBeGreaterThan(0);
    expect(briefing.verifiedFindings.length).toBeLessThan(manyArtifacts.length);
    const expectedPrefix = [...manyArtifacts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, briefing.verifiedFindings.length);
    expect(briefing.verifiedFindings.map((f) => f.artifactId)).toEqual(expectedPrefix.map((a) => a.artifactId));
  });

  it('never fabricates content to fill space — an empty input yields an empty, small packet', () => {
    const briefing = buildMidpointBriefing(baseInput, 100_000);
    expect(briefing.verifiedFindings).toEqual([]);
    expect(briefing.modelCaveats).toEqual([]);
    expect(briefing.openWork).toEqual([]);
    expect(briefing.failureFingerprints).toEqual([]);
  });
});
