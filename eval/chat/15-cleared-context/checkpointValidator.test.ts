import { describe, expect, it } from 'vitest';
import {
  describeRepairPrompt,
  initialSubmissionState,
  nextSubmissionState,
  recordCheckpointSubmission,
  validateCheckpointSubmission,
} from './checkpointValidator';

const knownArtifactIds = new Set(['artifact-1', 'artifact-2']);

function validSubmission() {
  return {
    candidateClaims: [
      { claimId: 'c1', statement: 'revenue rose in Q2', evidenceLocators: [{ artifactId: 'artifact-1' }] },
    ],
    caveats: ['excludes refunded orders'],
    openWork: [{ workItemId: 'w1', question: 'check join multiplicity', priority: 1 }],
    recommendedNextAction: 'verify refund exclusion',
  };
}

describe('validateCheckpointSubmission — happy path', () => {
  it('accepts a fully-formed submission and returns the typed checkpoint fields', () => {
    const result = validateCheckpointSubmission(validSubmission(), { knownArtifactIds });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.checkpoint).toEqual(validSubmission());
  });

  it('accepts empty candidateClaims/caveats/openWork — a round may find nothing worth claiming', () => {
    const result = validateCheckpointSubmission(
      { candidateClaims: [], caveats: [], openWork: [], recommendedNextAction: '' },
      { knownArtifactIds },
    );
    expect(result.ok).toBe(true);
  });

  it('accepts an evidence locator with an optional locator string', () => {
    const submission = {
      ...validSubmission(),
      candidateClaims: [
        { claimId: 'c1', statement: 'x', evidenceLocators: [{ artifactId: 'artifact-1', locator: 'rows[0]' }] },
      ],
    };
    expect(validateCheckpointSubmission(submission, { knownArtifactIds }).ok).toBe(true);
  });
});

describe('validateCheckpointSubmission — schema rejection', () => {
  it('rejects a non-object submission', () => {
    expect(validateCheckpointSubmission('not an object', { knownArtifactIds }).ok).toBe(false);
    expect(validateCheckpointSubmission(null, { knownArtifactIds }).ok).toBe(false);
    expect(validateCheckpointSubmission([], { knownArtifactIds }).ok).toBe(false);
  });

  it('rejects an unknown top-level field — this is where a smuggled requirement-status change would be caught', () => {
    const result = validateCheckpointSubmission({ ...validSubmission(), requirementStatus: 'satisfied' }, { knownArtifactIds });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes('requirementStatus'))).toBe(true);
  });

  it('rejects a claim with no evidence locators', () => {
    const submission = { ...validSubmission(), candidateClaims: [{ claimId: 'c1', statement: 'x', evidenceLocators: [] }] };
    const result = validateCheckpointSubmission(submission, { knownArtifactIds });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes('evidenceLocators'))).toBe(true);
  });

  it('rejects a claim citing an artifact id that does not exist in the ledger', () => {
    const submission = {
      ...validSubmission(),
      candidateClaims: [{ claimId: 'c1', statement: 'x', evidenceLocators: [{ artifactId: 'made-up' }] }],
    };
    const result = validateCheckpointSubmission(submission, { knownArtifactIds });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes('made-up') && i.includes('does not exist'))).toBe(true);
  });

  it('rejects a duplicate claimId within one submission', () => {
    const submission = {
      ...validSubmission(),
      candidateClaims: [
        { claimId: 'c1', statement: 'a', evidenceLocators: [{ artifactId: 'artifact-1' }] },
        { claimId: 'c1', statement: 'b', evidenceLocators: [{ artifactId: 'artifact-2' }] },
      ],
    };
    const result = validateCheckpointSubmission(submission, { knownArtifactIds });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes('duplicated'))).toBe(true);
  });

  it('rejects a non-string caveat', () => {
    const result = validateCheckpointSubmission({ ...validSubmission(), caveats: [42] }, { knownArtifactIds });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-finite work item priority', () => {
    const submission = { ...validSubmission(), openWork: [{ workItemId: 'w1', question: 'q', priority: Number.NaN }] };
    expect(validateCheckpointSubmission(submission, { knownArtifactIds }).ok).toBe(false);
  });

  it('rejects a duplicate workItemId within one submission', () => {
    const submission = {
      ...validSubmission(),
      openWork: [
        { workItemId: 'w1', question: 'a', priority: 1 },
        { workItemId: 'w1', question: 'b', priority: 2 },
      ],
    };
    const result = validateCheckpointSubmission(submission, { knownArtifactIds });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes('duplicated'))).toBe(true);
  });

  it('rejects a non-string recommendedNextAction', () => {
    expect(validateCheckpointSubmission({ ...validSubmission(), recommendedNextAction: 42 }, { knownArtifactIds }).ok).toBe(false);
  });

  it('never partially accepts — multiple issues are all reported, not just the first', () => {
    const result = validateCheckpointSubmission({ candidateClaims: 'nope', caveats: 'nope', openWork: 'nope' }, { knownArtifactIds });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(4); // 3 wrong-type arrays + missing recommendedNextAction
  });
});

describe('submission state machine', () => {
  it('starts awaiting_first', () => {
    expect(initialSubmissionState()).toBe('awaiting_first');
  });

  it('a valid first submission closes the phase directly — no repair needed', () => {
    expect(nextSubmissionState('awaiting_first', 'valid')).toBe('closed');
  });

  it('an invalid first submission opens the one bounded repair attempt', () => {
    expect(nextSubmissionState('awaiting_first', 'invalid')).toBe('awaiting_repair');
  });

  it('a repair attempt always closes the phase, whether it validated or not — there is no third attempt', () => {
    expect(nextSubmissionState('awaiting_repair', 'valid')).toBe('closed');
    expect(nextSubmissionState('awaiting_repair', 'invalid')).toBe('closed');
  });

  it('throws on any submission after the phase already closed', () => {
    expect(() => nextSubmissionState('closed', 'valid')).toThrow(/already closed/);
  });
});

describe('recordCheckpointSubmission — validation and state machine together', () => {
  it('a valid first submission validates and closes in one call', () => {
    const result = recordCheckpointSubmission('awaiting_first', validSubmission(), { knownArtifactIds });
    expect(result.validation.ok).toBe(true);
    expect(result.state).toBe('closed');
  });

  it('an invalid first submission opens the repair window', () => {
    const result = recordCheckpointSubmission('awaiting_first', { bogus: true }, { knownArtifactIds });
    expect(result.validation.ok).toBe(false);
    expect(result.state).toBe('awaiting_repair');
  });

  it('a second, still-invalid submission closes the phase without a third chance', () => {
    const first = recordCheckpointSubmission('awaiting_first', { bogus: true }, { knownArtifactIds });
    const second = recordCheckpointSubmission(first.state, { stillBogus: true }, { knownArtifactIds });
    expect(second.validation.ok).toBe(false);
    expect(second.state).toBe('closed');
  });

  it('a repaired, now-valid second submission closes the phase with the checkpoint recorded', () => {
    const first = recordCheckpointSubmission('awaiting_first', { bogus: true }, { knownArtifactIds });
    const second = recordCheckpointSubmission(first.state, validSubmission(), { knownArtifactIds });
    expect(second.validation.ok).toBe(true);
    expect(second.state).toBe('closed');
  });

  it('throws if the harness calls it again after closed — a harness bug, not a model output to recover from', () => {
    const first = recordCheckpointSubmission('awaiting_first', validSubmission(), { knownArtifactIds });
    expect(first.state).toBe('closed');
    expect(() => recordCheckpointSubmission(first.state, validSubmission(), { knownArtifactIds })).toThrow(/already closed/);
  });
});

describe('describeRepairPrompt', () => {
  it('lists every issue and never invents one not passed in', () => {
    const prompt = describeRepairPrompt(['issue A', 'issue B']);
    expect(prompt).toContain('issue A');
    expect(prompt).toContain('issue B');
    expect(prompt).toContain('only repair attempt');
  });
});
