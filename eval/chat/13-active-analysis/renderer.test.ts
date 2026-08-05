import { describe, expect, it } from 'vitest';
import { monthlyRevenue } from '../12-verified-claims/fixtures';
import { renderVerifiedFact } from '../12-verified-claims/renderer';
import { verifyClaim } from '../12-verified-claims/verifier';
import type { ClaimIR, EvidencePacket } from './contracts';
import { renderFact } from './renderer';

/** The § Checkpoint 4 Arm B packet, which produced the dimension-free sentence in Finding 1. */
const statusRevenue: EvidencePacket = {
  id: 'evidence:status-revenue',
  metric: 'sum_product(order_items.quantity,order_items.unit_price)',
  unit: 'USD',
  dimension: 'orders.status',
  completeness: 'complete',
  rows: [
    { rowId: 'r1', label: 'cancelled', value: 358_072.55, order: 0 },
    { rowId: 'r2', label: 'completed', value: 952_190.31, order: 1 },
    { rowId: 'r3', label: 'refunded', value: 321_894.74, order: 2 },
    { rowId: 'r4', label: 'shipped', value: 295_423.15, order: 3 },
  ],
};

const statusExtremum: ClaimIR = {
  kind: 'extremum',
  subject: { evidenceId: 'evidence:status-revenue', rowId: 'r2', field: 'value' },
  operator: 'maximum',
  scope: { evidenceId: 'evidence:status-revenue', rowIds: ['r1', 'r2', 'r3', 'r4'] },
};

function verified(claim: ClaimIR, evidence: readonly EvidencePacket[]) {
  const result = verifyClaim(claim, evidence);
  if (!result.accepted) throw new Error(result.detail);
  return result.fact;
}

describe('extremum rendering names the dimension', () => {
  it('names the dimension the extremum ranked over', () => {
    const fact = verified(statusExtremum, [statusRevenue]);
    expect(renderFact(fact, statusExtremum, [statusRevenue])).toBe(
      'completed (952,190.31 USD) was the maximum across orders.status for the complete evidence scope.',
    );
  });

  it('adds only the dimension to experiment 12s sentence, with identical value formatting', () => {
    const fact = verified(statusExtremum, [statusRevenue]);
    expect(renderFact(fact, statusExtremum, [statusRevenue])).toBe(
      renderVerifiedFact(fact).replace(' was the maximum for', ' was the maximum across orders.status for'),
    );
  });

  it('falls back to experiment 12s template when the packet has no dimension', () => {
    const claim: ClaimIR = {
      kind: 'extremum',
      subject: { evidenceId: 'monthly-revenue', rowId: 'jan-2022', field: 'value' },
      operator: 'maximum',
      scope: { evidenceId: 'monthly-revenue', rowIds: ['dec-2021', 'jan-2022', 'feb-2022'] },
    };
    const fact = verified(claim, [monthlyRevenue]);
    expect(renderFact(fact, claim, [monthlyRevenue])).toBe(renderVerifiedFact(fact));
    expect(renderFact(fact, claim, [monthlyRevenue])).toBe(
      'January 2022 revenue (13,750 USD) was the maximum for the complete evidence scope.',
    );
  });

  it('leaves every other fact kind on experiment 12s template', () => {
    const comparison: ClaimIR = {
      kind: 'comparison',
      left: { evidenceId: 'monthly-revenue', rowId: 'jan-2022', field: 'value' },
      operator: 'greater_than',
      right: { evidenceId: 'monthly-revenue', rowId: 'feb-2022', field: 'value' },
    };
    const change: ClaimIR = {
      kind: 'change',
      from: { evidenceId: 'monthly-revenue', rowId: 'dec-2021', field: 'value' },
      operator: 'increase',
      to: { evidenceId: 'monthly-revenue', rowId: 'jan-2022', field: 'value' },
    };
    const threshold: ClaimIR = {
      kind: 'threshold',
      subject: { evidenceId: 'monthly-revenue', rowId: 'jan-2022', field: 'value' },
      operator: 'above',
      threshold: 10_000,
    };
    for (const claim of [comparison, change, threshold]) {
      const fact = verified(claim, [monthlyRevenue]);
      expect(renderFact(fact, claim, [monthlyRevenue])).toBe(renderVerifiedFact(fact));
    }
  });
});
