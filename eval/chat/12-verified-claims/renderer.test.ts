import { describe, expect, it } from 'vitest';
import { renderVerifiedFact } from './renderer';
import { verifyClaim } from './verifier';
import { monthlyRevenue } from './fixtures';

describe('deterministic renderer', () => {
  it('renders only the normalized fact returned by verification', () => {
    const result = verifyClaim({
      kind: 'comparison',
      left: { evidenceId: 'monthly-revenue', rowId: 'jan-2022', field: 'value' },
      operator: 'greater_than',
      right: { evidenceId: 'monthly-revenue', rowId: 'feb-2022', field: 'value' },
    }, [monthlyRevenue]);
    if (!result.accepted) throw new Error(result.detail);

    expect(renderVerifiedFact(result.fact)).toBe(
      'January 2022 revenue (13,750 USD) was greater than February 2022 revenue (11,250 USD).',
    );
  });

  it('has deterministic templates for every normalized fact kind', () => {
    expect(renderVerifiedFact({
      kind: 'change', operator: 'increase', subject: 'January', object: 'December',
      leftValue: 12, rightValue: 10, unit: 'USD',
    })).toBe('January was a verified increase from December: 10 USD to 12 USD.');
    expect(renderVerifiedFact({
      kind: 'extremum', operator: 'maximum', subject: 'Toys', object: 'maximum in categories',
      leftValue: 20, rightValue: 20, unit: 'USD',
    })).toBe('Toys (20 USD) was the maximum for the complete evidence scope.');
    expect(renderVerifiedFact({
      kind: 'threshold', operator: 'above', subject: 'Completed-order ratio', object: 'declared threshold',
      leftValue: 30, rightValue: 25, unit: 'USD/order',
    })).toBe('Completed-order ratio (30 USD/order) was above the threshold 25 USD/order.');
  });
});
