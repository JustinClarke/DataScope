import { describe, expect, it } from 'vitest';
import type { ClaimIR } from './claimIr';
import { monthlyRevenue } from './fixtures';
import { verifyClaim } from './verifier';

function change(operator: 'increase' | 'decrease' | 'no_change'): Extract<ClaimIR, { kind: 'change' }> {
  return {
    kind: 'change',
    from: { evidenceId: 'monthly-revenue', rowId: 'dec-2021', field: 'value' },
    to: { evidenceId: 'monthly-revenue', rowId: 'jan-2022', field: 'value' },
    operator,
  };
}

describe('deterministic claim verifier', () => {
  it('rejects the observed January decrease claim when the values increased', () => {
    const result = verifyClaim(change('decrease'), [monthlyRevenue]);

    expect(result).toEqual({
      accepted: false,
      reason: 'RELATION_FALSE',
      detail: 'Expected decrease, but 12500 changed to 13750.',
    });
  });

  it('accepts a true comparison and returns a normalized fact', () => {
    const result = verifyClaim({
      kind: 'comparison',
      left: { evidenceId: 'monthly-revenue', rowId: 'jan-2022', field: 'value' },
      operator: 'greater_than',
      right: { evidenceId: 'monthly-revenue', rowId: 'feb-2022', field: 'value' },
    }, [monthlyRevenue]);

    expect(result).toEqual({
      accepted: true,
      fact: {
        kind: 'comparison',
        operator: 'greater_than',
        subject: 'January 2022 revenue',
        object: 'February 2022 revenue',
        leftValue: 13750,
        rightValue: 11250,
        unit: 'USD',
      },
    });
  });

  it('rejects a wrong maximum and a maximum over truncated evidence', () => {
    const wrongMaximum: ClaimIR = {
      kind: 'extremum',
      subject: { evidenceId: 'monthly-revenue', rowId: 'feb-2022', field: 'value' },
      operator: 'maximum',
      scope: { evidenceId: 'monthly-revenue', rowIds: ['dec-2021', 'jan-2022', 'feb-2022'] },
    };
    expect(verifyClaim(wrongMaximum, [monthlyRevenue])).toMatchObject({
      accepted: false,
      reason: 'RELATION_FALSE',
    });
    expect(verifyClaim({
      ...wrongMaximum,
      subject: { evidenceId: 'monthly-revenue', rowId: 'jan-2022', field: 'value' },
    }, [{ ...monthlyRevenue, completeness: 'truncated' }])).toMatchObject({
      accepted: false,
      reason: 'INCOMPLETE_SCOPE',
    });
  });

  it('accepts the true maximum over the complete evidence scope', () => {
    expect(verifyClaim({
      kind: 'extremum',
      subject: { evidenceId: 'monthly-revenue', rowId: 'jan-2022', field: 'value' },
      operator: 'maximum',
      scope: { evidenceId: 'monthly-revenue', rowIds: ['dec-2021', 'jan-2022', 'feb-2022'] },
    }, [monthlyRevenue])).toMatchObject({ accepted: true });
  });

  it('rejects a change whose time operands are reversed', () => {
    expect(verifyClaim({
      kind: 'change',
      from: { evidenceId: 'monthly-revenue', rowId: 'jan-2022', field: 'value' },
      to: { evidenceId: 'monthly-revenue', rowId: 'dec-2021', field: 'value' },
      operator: 'decrease',
    }, [monthlyRevenue])).toMatchObject({ accepted: false, reason: 'CHRONOLOGY_REVERSED' });
  });

  it('uses explicit chronology rather than packet row position', () => {
    const outOfOrderRows = {
      ...monthlyRevenue,
      rows: [
        { ...monthlyRevenue.rows[1]!, order: 2 },
        { ...monthlyRevenue.rows[0]!, order: 1 },
        { ...monthlyRevenue.rows[2]!, order: 3 },
      ],
    };

    expect(verifyClaim(change('increase'), [outOfOrderRows])).toMatchObject({ accepted: true });
    expect(verifyClaim({
      ...change('decrease'),
      from: { evidenceId: 'monthly-revenue', rowId: 'jan-2022', field: 'value' },
      to: { evidenceId: 'monthly-revenue', rowId: 'dec-2021', field: 'value' },
    }, [outOfOrderRows])).toMatchObject({ accepted: false, reason: 'CHRONOLOGY_REVERSED' });
  });

  it('fails closed when an explicit chronology value is not finite', () => {
    const invalidChronology = {
      ...monthlyRevenue,
      rows: monthlyRevenue.rows.map((row) => row.rowId === 'jan-2022' ? { ...row, order: Number.NaN } : row),
    };

    expect(verifyClaim(change('increase'), [invalidChronology])).toMatchObject({
      accepted: false,
      reason: 'INVALID_CHRONOLOGY',
    });
  });

  it('evaluates ties using the explicitly supplied absolute tolerance', () => {
    const nearTie = {
      ...monthlyRevenue,
      rows: [
        { rowId: 'a', label: 'A', value: 10, order: 1 },
        { rowId: 'b', label: 'B', value: 10 + 5e-10, order: 2 },
      ],
    };
    const claim: ClaimIR = {
      kind: 'change',
      from: { evidenceId: 'monthly-revenue', rowId: 'a', field: 'value' },
      to: { evidenceId: 'monthly-revenue', rowId: 'b', field: 'value' },
      operator: 'increase',
    };

    expect(verifyClaim(claim, [nearTie], { absoluteTolerance: 0 })).toMatchObject({ accepted: true });
    expect(verifyClaim(claim, [nearTie], { absoluteTolerance: 1e-9 })).toMatchObject({
      accepted: false,
      reason: 'RELATION_FALSE',
    });
  });

  it('rejects an invalid tolerance configuration', () => {
    expect(verifyClaim(change('increase'), [monthlyRevenue], { absoluteTolerance: -1 })).toMatchObject({
      accepted: false,
      reason: 'INVALID_TOLERANCE',
    });
  });

  it('rejects operands with incompatible metric semantics', () => {
    expect(verifyClaim({
      kind: 'comparison',
      left: { evidenceId: 'monthly-revenue', rowId: 'jan-2022', field: 'value' },
      operator: 'greater_than',
      right: { evidenceId: 'monthly-orders', rowId: 'jan-2022', field: 'value' },
    }, [monthlyRevenue, {
      ...monthlyRevenue,
      id: 'monthly-orders',
      metric: 'count_distinct(orders.order_id)',
      unit: 'orders',
    }])).toMatchObject({ accepted: false, reason: 'INCOMPATIBLE_METRIC' });
  });

  it.each([
    ['from', 'dec-2021', 14_000],
    ['to', 'jan-2022', 10_000],
  ] as const)('re-evaluates the %s operand so an altered value cannot retain acceptance', (_operand, rowId, value) => {
    const claim = change('increase');
    expect(verifyClaim(claim, [monthlyRevenue])).toMatchObject({ accepted: true });

    const altered = {
      ...monthlyRevenue,
      rows: monthlyRevenue.rows.map((row) => row.rowId === rowId ? { ...row, value } : row),
    };
    expect(verifyClaim(claim, [altered])).toMatchObject({ accepted: false, reason: 'RELATION_FALSE' });
  });

  it.each([
    ['above', 13_000, true],
    ['below', 14_000, true],
    ['at', 13_750, true],
    ['above', 14_000, false],
  ] as const)('evaluates the %s threshold relation', (operator, threshold, accepted) => {
    expect(verifyClaim({
      kind: 'threshold',
      subject: { evidenceId: 'monthly-revenue', rowId: 'jan-2022', field: 'value' },
      operator,
      threshold,
    }, [monthlyRevenue])).toMatchObject(accepted
      ? { accepted: true }
      : { accepted: false, reason: 'RELATION_FALSE' });
  });
});
