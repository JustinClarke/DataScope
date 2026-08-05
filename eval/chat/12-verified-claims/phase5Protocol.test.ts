import { describe, expect, it } from 'vitest';
import { parsePhase5Proposal, PHASE5_QUESTIONS } from './phase5Protocol';

describe('phase 5 protocol', () => {
  it('keeps four answerable questions and four negative controls', () => {
    expect(PHASE5_QUESTIONS.filter((question) => question.kind === 'answerable')).toHaveLength(4);
    expect(PHASE5_QUESTIONS.filter((question) => question.kind === 'control')).toHaveLength(4);
  });

  it('strictly parses typed unsupported responses', () => {
    expect(parsePhase5Proposal({ disposition: 'unsupported', reason: 'missing_cost' })).toEqual({ disposition: 'unsupported', reason: 'missing_cost' });
    expect(() => parsePhase5Proposal({ disposition: 'unsupported', reason: 'missing_cost', prose: 'no' })).toThrow();
  });

  it('strictly parses nested Claim IR', () => {
    expect(parsePhase5Proposal({
      disposition: 'claim',
      claim: {
        kind: 'comparison',
        left: { evidenceId: 'evidence:x', rowId: 'r1', field: 'value' },
        operator: 'less_than',
        right: { evidenceId: 'evidence:x', rowId: 'r2', field: 'value' },
      },
    }).disposition).toBe('claim');
  });
});
