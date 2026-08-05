import { describe, expect, it } from 'vitest';
import { roiConditions, scoreArm, scoreRepeat, type ArmRecord, type ArmVerdict } from './scoreCheckpoint5';
import type { LoopDisposition } from './analysisLoop';
import type { TokenAccounting } from './contracts';

const tokens = (prompt: number, response = 100, calls = 1): TokenAccounting => ({
  calls,
  totalPromptTokens: prompt,
  totalResponseTokens: response,
  callHighWaterPromptTokens: prompt,
});

const claim = (evidenceId: string): LoopDisposition =>
  ({
    kind: 'final_claim',
    claim: { kind: 'extremum', subject: { evidenceId, rowId: 'r1', field: 'value' }, scope: { evidenceId, rowIds: ['r1'] } },
    fact: {},
    rendered: `fact from ${evidenceId}`,
  }) as unknown as LoopDisposition;

function record(overrides: Partial<ArmRecord> & Pick<ArmRecord, 'questionId' | 'questionKind'>): ArmRecord {
  return {
    repeat: 1,
    transportFailure: null,
    disposition: { kind: 'no_useful_verified_result' },
    rendered: null,
    tokens: tokens(1000),
    durationMs: 1000,
    ...overrides,
  };
}

const verdict = (records: ArmRecord[], repeats = 1): ArmVerdict => ({ arm: 'test', repeats, records });

describe('per-repeat scoring', () => {
  it('counts an accepted claim and an accepted offer as useful yield, and nothing else', () => {
    const scored = scoreRepeat(
      [
        record({ questionId: 'understand-ecommerce', questionKind: 'answerable', disposition: claim('evidence:monthly-revenue'), rendered: 'a' }),
        record({ questionId: 'sales-presentation', questionKind: 'answerable', disposition: { kind: 'final_offer', offerId: 'offer:x' }, rendered: null }),
        record({ questionId: 'odd-sales-investigation', questionKind: 'answerable', disposition: { kind: 'rejected_claim' } as LoopDisposition }),
        record({ questionId: 'further-transforms', questionKind: 'answerable', disposition: { kind: 'no_useful_verified_result' } }),
      ],
      1,
    );
    expect(scored.usefulCount).toBe(2);
    expect(scored.meetsThreeOfFour).toBe(false);
  });

  it('separates three useful results from one useful result reached three times', () => {
    const repeated = scoreRepeat(
      ['understand-ecommerce', 'sales-presentation', 'further-transforms'].map((questionId) =>
        record({ questionId, questionKind: 'answerable', disposition: claim('evidence:monthly-revenue'), rendered: 'the same sentence' }),
      ),
      1,
    );
    expect(repeated.usefulCount).toBe(3);
    expect(repeated.distinctRenderedFacts).toBe(1);
  });

  it('requires the exact expected gap code on a control, not merely a refusal', () => {
    const scored = scoreRepeat(
      [
        record({ questionId: 'profit-control', questionKind: 'control', disposition: { kind: 'unsupported', reason: 'causal_inference' } }),
        record({ questionId: 'causal-control', questionKind: 'control', disposition: { kind: 'unsupported', reason: 'causal_inference' } }),
      ],
      1,
    );
    expect(scored.controlDetail.filter((control) => control.correct).map((control) => control.questionId)).toEqual(['causal-control']);
    expect(scored.meetsControlThreshold).toBe(false);
  });

  it('excludes a transport failure from the repeat rather than scoring it as a refusal', () => {
    const scored = scoreRepeat(
      [record({ questionId: 'sales-presentation', questionKind: 'answerable', transportFailure: 'ETIMEDOUT' })],
      1,
    );
    expect(scored.transportFailures).toEqual(['sales-presentation']);
  });
});

describe('arm aggregates', () => {
  it('flags a rendered sentence that did not come from an accepted claim (kill criterion 1)', () => {
    const scored = scoreArm(
      verdict([record({ questionId: 'sales-presentation', questionKind: 'answerable', disposition: { kind: 'rejected_claim' } as LoopDisposition, rendered: 'displayed anyway' })]),
      [],
    );
    expect(scored.safety.falseDisplay).toHaveLength(1);
  });

  it('flags a loop escape past two rounds or four probes (kill criterion 8)', () => {
    const scored = scoreArm(
      verdict([
        record({
          questionId: 'sales-presentation',
          questionKind: 'answerable',
          executedCandidateIds: ['a', 'b', 'c', 'd', 'e'],
        }),
      ]),
      [],
    );
    expect(scored.safety.loopEscapes).toHaveLength(1);
  });

  it('counts an irrelevant-and-unused probe once, and adds rejections on top', () => {
    const scored = scoreArm(
      verdict([
        record({
          questionId: 'sales-presentation',
          questionKind: 'answerable',
          disposition: claim('evidence:category-revenue'),
          rendered: 'x',
          executedCandidateIds: ['category-revenue', 'country-orders'],
          requestedQuestionRelevance: [
            { candidateId: 'category-revenue', questionRelevance: ['sales-presentation'] },
            { candidateId: 'country-orders', questionRelevance: ['odd-sales-investigation'] },
          ],
          probeRejections: [{ candidateId: 'ghost', code: 'unknown_candidate' }],
        }),
      ]),
      [],
    );
    expect(scored.aggregate.probes.executed).toBe(2);
    expect(scored.aggregate.probes.relevant).toBe(1);
    expect(scored.aggregate.probes.wasted).toBe(1);
    expect(scored.aggregate.probes.wastedRate).toBeCloseTo(2 / 3);
  });

  it('reports an undefined ROI rather than an infinite one for a zero-yield arm', () => {
    const scored = scoreArm(verdict([record({ questionId: 'sales-presentation', questionKind: 'answerable' })]), []);
    expect(scored.aggregate.primaryRoiPerThousandTokens).toBe('undefined');
  });

  it('detects a cache key shared across repeats (Checkpoint 5 repeat isolation)', () => {
    const leaked = scoreArm(
      verdict(
        [
          record({ questionId: 'sales-presentation', questionKind: 'answerable', repeat: 1 }),
          record({ questionId: 'understand-ecommerce', questionKind: 'answerable', repeat: 2 }),
        ],
        2,
      ),
      [
        { type: 'cache_miss', questionId: 'sales-presentation', repeat: 1, cacheKey: 'shared' },
        { type: 'cache_hit', questionId: 'understand-ecommerce', repeat: 2, cacheKey: 'shared' },
      ],
    );
    expect(leaked.safety.cacheKeysSharedAcrossRepeats.length).toBeGreaterThan(0);
  });
});

describe('predeclared ROI conditions', () => {
  const armOf = (records: ArmRecord[], repeats = 1) => scoreArm(verdict(records, repeats), []);

  it('fails condition 4 when the active arm high-water exceeds the fixed arm', () => {
    const armA = armOf([record({ questionId: 'sales-presentation', questionKind: 'answerable', disposition: claim('evidence:a'), rendered: 'a', tokens: tokens(1373) })]);
    const armB = armOf([record({ questionId: 'sales-presentation', questionKind: 'answerable', disposition: claim('evidence:a'), rendered: 'a', tokens: tokens(2504) })]);
    const roi = roiConditions(armA, armB);
    expect(roi.conditions.find((condition) => condition.id === 4)?.met).toBe(false);
    expect(roi.positiveRoi).toBe(false);
  });
});
