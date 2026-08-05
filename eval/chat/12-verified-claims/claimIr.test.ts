import { describe, expect, it } from 'vitest';
import { ClaimIRParseError, parseClaimIR } from './claimIr';

describe('Claim IR parser', () => {
  it('parses an exact comparison contract', () => {
    expect(parseClaimIR({
      kind: 'comparison',
      left: { evidenceId: 'monthly-revenue', rowId: 'jan', field: 'value' },
      operator: 'greater_than',
      right: { evidenceId: 'monthly-revenue', rowId: 'feb', field: 'value' },
    })).toEqual({
      kind: 'comparison',
      left: { evidenceId: 'monthly-revenue', rowId: 'jan', field: 'value' },
      operator: 'greater_than',
      right: { evidenceId: 'monthly-revenue', rowId: 'feb', field: 'value' },
    });
  });

  it('rejects extra prose fields rather than ignoring them', () => {
    try {
      parseClaimIR({
        kind: 'comparison',
        left: { evidenceId: 'monthly-revenue', rowId: 'jan', field: 'value' },
        operator: 'greater_than',
        right: { evidenceId: 'monthly-revenue', rowId: 'feb', field: 'value' },
        explanation: 'January substantially decreased.',
      });
      throw new Error('Expected parsing to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ClaimIRParseError);
      expect(error).toMatchObject({ code: 'UNSUPPORTED_FIELDS' });
      expect(error).toHaveProperty('message', 'claim contains unsupported fields: explanation');
    }
  });

  it.each([
    [null, 'INVALID_TYPE'],
    [{ kind: 'comparison' }, 'MISSING_FIELDS'],
    [{ kind: 'unknown' }, 'INVALID_VALUE'],
    [{
      kind: 'threshold',
      subject: { evidenceId: 'e', rowId: 'r', field: 'value' },
      operator: 'above',
      threshold: Number.NaN,
    }, 'INVALID_VALUE'],
  ] as const)('returns a stable rejection code for invalid input %#', (input, code) => {
    try {
      parseClaimIR(input);
      throw new Error('Expected parsing to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ClaimIRParseError);
      expect(error).toMatchObject({ code });
    }
  });
});
