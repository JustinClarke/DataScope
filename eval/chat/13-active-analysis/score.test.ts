import { describe, expect, it } from 'vitest';
import type { LoopDisposition } from './analysisLoop';
import {
  cacheReuseRate,
  correctUnsupportedRate,
  primaryRoi,
  probeProductivity,
  probeRelevance,
  refusalCollapseCodes,
  stability,
  verifiedUsefulYield,
} from './score';

const claim: LoopDisposition = { kind: 'final_claim', claim: { kind: 'threshold', subject: { evidenceId: 'e', rowId: 'r', field: 'value' }, operator: 'above', threshold: 0 }, fact: { kind: 'threshold', operator: 'above', subject: 'r', object: 'declared threshold', leftValue: 1, rightValue: 0, unit: 'USD' }, rendered: 'ok' };
const noYield: LoopDisposition = { kind: 'no_useful_verified_result' };

describe('verifiedUsefulYield', () => {
  it('counts final_claim and final_offer as useful yield out of all answerable dispositions', () => {
    const offer: LoopDisposition = { kind: 'final_offer', offerId: 'offer:x' };
    expect(verifiedUsefulYield([claim, offer, noYield, noYield])).toBe(0.5);
  });

  it('reports zero yield, not NaN, for an empty question set', () => {
    expect(verifiedUsefulYield([])).toBe(0);
  });
});

describe('correctUnsupportedRate', () => {
  it('requires the exact corroborated reason, not merely any refusal', () => {
    const results = [
      { questionId: 'causal-control', disposition: { kind: 'unsupported', reason: 'causal_inference' } as const, expectedReason: 'causal_inference' as const },
      { questionId: 'profit-control', disposition: { kind: 'unsupported', reason: 'causal_inference' } as const, expectedReason: 'missing_cost' as const },
    ];
    expect(correctUnsupportedRate(results)).toBe(0.5);
  });
});

describe('refusalCollapseCodes', () => {
  it('flags a code reused across two different answerable questions', () => {
    const collapsed = refusalCollapseCodes([
      { questionId: 'q1', reason: 'causal_inference' },
      { questionId: 'q2', reason: 'causal_inference' },
    ]);
    expect(collapsed).toEqual(['causal_inference']);
  });

  it('does not flag the same code reused within one question, or distinct codes across questions', () => {
    expect(refusalCollapseCodes([{ questionId: 'q1', reason: 'causal_inference' }])).toEqual([]);
    expect(
      refusalCollapseCodes([
        { questionId: 'q1', reason: 'causal_inference' },
        { questionId: 'q2', reason: 'missing_cost' },
      ]),
    ).toEqual([]);
  });
});

describe('probeRelevance and probeProductivity', () => {
  it('splits requested probes into relevant/irrelevant by whether the question id is among the tags', () => {
    const requested = [
      { candidateId: 'a', questionRelevance: ['sales-presentation'] },
      { candidateId: 'b', questionRelevance: ['understand-ecommerce'] },
    ];
    expect(probeRelevance(requested, 'sales-presentation')).toEqual({ relevant: 1, irrelevant: 1 });
  });

  it('splits executed probes into productive/wasted by whether they contributed to the final result', () => {
    expect(probeProductivity(['a', 'b', 'c'], ['b'])).toEqual({ productive: 1, wasted: 2, wastedRate: 2 / 3 });
  });
});

describe('cacheReuseRate', () => {
  it('divides hits by total lookups and stays zero with no lookups', () => {
    expect(cacheReuseRate(3, 1)).toBe(0.75);
    expect(cacheReuseRate(0, 0)).toBe(0);
  });
});

describe('primaryRoi', () => {
  it('reports undefined rather than an infinite ratio for zero yield', () => {
    expect(primaryRoi(0, 5000)).toBe('undefined');
  });

  it('computes verified useful results per 1,000 total model tokens', () => {
    expect(primaryRoi(2, 4000)).toBe(0.5);
  });
});

describe('stability', () => {
  it('is stable when every repeat lands on the same disposition kind', () => {
    expect(stability([claim, claim, claim])).toEqual({ distinctKinds: 1, stable: true });
  });

  it('is not stable when repeats disagree on disposition kind', () => {
    expect(stability([claim, noYield])).toEqual({ distinctKinds: 2, stable: false });
  });
});
