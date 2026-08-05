import { describe, expect, it } from 'vitest';
import { syntheticVerifierCases } from './syntheticCases';
import { verifyClaim } from './verifier';

describe('synthetic verifier gold and adversarial suite', () => {
  it.each(syntheticVerifierCases)('$id', ({ claim, evidence, expected }) => {
    expect(verifyClaim(claim, evidence)).toMatchObject(expected);
  });

  it('has zero false accepts and zero false rejects', () => {
    const outcomes = syntheticVerifierCases.map((fixture) => ({
      expected: fixture.expected.accepted,
      actual: verifyClaim(fixture.claim, fixture.evidence).accepted,
    }));

    expect(outcomes.filter(({ expected, actual }) => !expected && actual)).toHaveLength(0);
    expect(outcomes.filter(({ expected, actual }) => expected && !actual)).toHaveLength(0);
  });
});
