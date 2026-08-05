import type { ClaimIR } from './claimIr';
import type { EvidencePacket } from './evidence';
import type { RejectionReason } from './verifier';

export interface SyntheticVerifierCase {
  id: string;
  claim: ClaimIR;
  evidence: EvidencePacket[];
  expected: { accepted: true } | { accepted: false; reason: RejectionReason };
}

const orderedRevenue: EvidencePacket = {
  id: 'ordered-revenue',
  metric: 'sum(revenue)',
  unit: 'USD',
  completeness: 'complete',
  rows: [
    { rowId: 'mar', label: 'March', value: 80, order: 3 },
    { rowId: 'jan', label: 'January', value: 100, order: 1 },
    { rowId: 'feb', label: 'February', value: 120, order: 2 },
    { rowId: 'apr', label: 'April', value: 80, order: 4 },
    { rowId: 'missing', label: 'Unknown month', value: null, order: 5 },
  ],
};

const nearTie: EvidencePacket = {
  id: 'near-tie',
  metric: 'average(score)',
  unit: 'points',
  completeness: 'complete',
  rows: [
    { rowId: 'a', label: 'A', value: 10, order: 1 },
    { rowId: 'b', label: 'B', value: 10 + 5e-10, order: 2 },
  ],
};

const duplicateMaximum: EvidencePacket = {
  id: 'duplicate-maximum',
  metric: 'count(rows)',
  unit: 'rows',
  completeness: 'complete',
  rows: [
    { rowId: 'a', label: 'A', value: 9 },
    { rowId: 'b', label: 'B', value: 12 },
    { rowId: 'c', label: 'C', value: 12 },
  ],
};

const nullableMinimum: EvidencePacket = {
  id: 'nullable-minimum',
  metric: 'average(score)',
  unit: 'points',
  completeness: 'complete',
  rows: [
    { rowId: 'missing', label: 'Missing', value: null },
    { rowId: 'low', label: 'Low', value: -2 },
    { rowId: 'high', label: 'High', value: 4 },
  ],
};

const ratio: EvidencePacket = {
  id: 'average-order-value',
  metric: 'ratio(sum(revenue),count_distinct(order_id))',
  unit: 'USD/order',
  completeness: 'complete',
  rows: [{ rowId: 'all', label: 'Average order value', value: 125 }],
};

const zeroDenominatorRatio: EvidencePacket = {
  ...ratio,
  id: 'zero-denominator-ratio',
  rows: [{ rowId: 'all', label: 'Average order value', value: null }],
};

const ordersSameValue: EvidencePacket = {
  id: 'orders-same-value',
  metric: 'count_distinct(order_id)',
  unit: 'orders',
  completeness: 'complete',
  rows: [{ rowId: 'jan', label: 'January orders', value: 100 }],
};

const revenueEuros: EvidencePacket = {
  id: 'revenue-euros',
  metric: 'sum(revenue)',
  unit: 'EUR',
  completeness: 'complete',
  rows: [{ rowId: 'jan', label: 'January revenue', value: 100 }],
};

const cell = (evidenceId: string, rowId: string) => ({ evidenceId, rowId, field: 'value' as const });
const fullScope = (packet: EvidencePacket) => ({
  evidenceId: packet.id,
  rowIds: packet.rows.map((row) => row.rowId),
});

export const syntheticVerifierCases: readonly SyntheticVerifierCase[] = [
  {
    id: 'strict-increase-accepted',
    claim: { kind: 'change', from: cell('ordered-revenue', 'jan'), to: cell('ordered-revenue', 'feb'), operator: 'increase' },
    evidence: [orderedRevenue],
    expected: { accepted: true },
  },
  {
    id: 'strict-increase-as-decrease-rejected',
    claim: { kind: 'change', from: cell('ordered-revenue', 'jan'), to: cell('ordered-revenue', 'feb'), operator: 'decrease' },
    evidence: [orderedRevenue],
    expected: { accepted: false, reason: 'RELATION_FALSE' },
  },
  {
    id: 'strict-decrease-accepted',
    claim: { kind: 'change', from: cell('ordered-revenue', 'feb'), to: cell('ordered-revenue', 'mar'), operator: 'decrease' },
    evidence: [orderedRevenue],
    expected: { accepted: true },
  },
  {
    id: 'strict-decrease-as-increase-rejected',
    claim: { kind: 'change', from: cell('ordered-revenue', 'feb'), to: cell('ordered-revenue', 'mar'), operator: 'increase' },
    evidence: [orderedRevenue],
    expected: { accepted: false, reason: 'RELATION_FALSE' },
  },
  {
    id: 'tie-within-tolerance-accepted',
    claim: { kind: 'change', from: cell('near-tie', 'a'), to: cell('near-tie', 'b'), operator: 'no_change' },
    evidence: [nearTie],
    expected: { accepted: true },
  },
  {
    id: 'tie-within-tolerance-as-increase-rejected',
    claim: { kind: 'change', from: cell('near-tie', 'a'), to: cell('near-tie', 'b'), operator: 'increase' },
    evidence: [nearTie],
    expected: { accepted: false, reason: 'RELATION_FALSE' },
  },
  {
    id: 'duplicate-maximum-first-accepted',
    claim: { kind: 'extremum', subject: cell('duplicate-maximum', 'b'), operator: 'maximum', scope: fullScope(duplicateMaximum) },
    evidence: [duplicateMaximum],
    expected: { accepted: true },
  },
  {
    id: 'duplicate-maximum-second-accepted',
    claim: { kind: 'extremum', subject: cell('duplicate-maximum', 'c'), operator: 'maximum', scope: fullScope(duplicateMaximum) },
    evidence: [duplicateMaximum],
    expected: { accepted: true },
  },
  {
    id: 'wrong-maximum-rejected',
    claim: { kind: 'extremum', subject: cell('duplicate-maximum', 'a'), operator: 'maximum', scope: fullScope(duplicateMaximum) },
    evidence: [duplicateMaximum],
    expected: { accepted: false, reason: 'RELATION_FALSE' },
  },
  {
    id: 'minimum-with-null-accepted',
    claim: { kind: 'extremum', subject: cell('nullable-minimum', 'low'), operator: 'minimum', scope: fullScope(nullableMinimum) },
    evidence: [nullableMinimum],
    expected: { accepted: true },
  },
  {
    id: 'null-as-minimum-rejected',
    claim: { kind: 'extremum', subject: cell('nullable-minimum', 'missing'), operator: 'minimum', scope: fullScope(nullableMinimum) },
    evidence: [nullableMinimum],
    expected: { accepted: false, reason: 'NON_NUMERIC_OPERAND' },
  },
  {
    id: 'ratio-non-zero-denominator-accepted',
    claim: { kind: 'threshold', subject: cell('average-order-value', 'all'), operator: 'above', threshold: 100 },
    evidence: [ratio],
    expected: { accepted: true },
  },
  {
    id: 'ratio-division-by-zero-rejected',
    claim: { kind: 'threshold', subject: cell('zero-denominator-ratio', 'all'), operator: 'above', threshold: 0 },
    evidence: [zeroDenominatorRatio],
    expected: { accepted: false, reason: 'NON_NUMERIC_OPERAND' },
  },
  {
    id: 'out-of-array-order-chronology-accepted',
    claim: { kind: 'change', from: cell('ordered-revenue', 'jan'), to: cell('ordered-revenue', 'feb'), operator: 'increase' },
    evidence: [orderedRevenue],
    expected: { accepted: true },
  },
  {
    id: 'reversed-explicit-chronology-rejected',
    claim: { kind: 'change', from: cell('ordered-revenue', 'feb'), to: cell('ordered-revenue', 'jan'), operator: 'decrease' },
    evidence: [orderedRevenue],
    expected: { accepted: false, reason: 'CHRONOLOGY_REVERSED' },
  },
  {
    id: 'non-finite-chronology-rejected',
    claim: { kind: 'change', from: cell('ordered-revenue', 'jan'), to: cell('ordered-revenue', 'feb'), operator: 'increase' },
    evidence: [{
      ...orderedRevenue,
      rows: orderedRevenue.rows.map((row) => row.rowId === 'jan' ? { ...row, order: Number.NaN } : row),
    }],
    expected: { accepted: false, reason: 'INVALID_CHRONOLOGY' },
  },
  {
    id: 'same-value-different-metric-rejected',
    claim: { kind: 'comparison', left: cell('ordered-revenue', 'jan'), operator: 'equal', right: cell('orders-same-value', 'jan') },
    evidence: [orderedRevenue, ordersSameValue],
    expected: { accepted: false, reason: 'INCOMPATIBLE_METRIC' },
  },
  {
    id: 'same-metric-different-unit-rejected',
    claim: { kind: 'comparison', left: cell('ordered-revenue', 'jan'), operator: 'equal', right: cell('revenue-euros', 'jan') },
    evidence: [orderedRevenue, revenueEuros],
    expected: { accepted: false, reason: 'INCOMPATIBLE_UNIT' },
  },
  {
    id: 'truncated-global-maximum-rejected',
    claim: { kind: 'extremum', subject: cell('duplicate-maximum', 'b'), operator: 'maximum', scope: fullScope(duplicateMaximum) },
    evidence: [{ ...duplicateMaximum, completeness: 'truncated' }],
    expected: { accepted: false, reason: 'INCOMPLETE_SCOPE' },
  },
  {
    id: 'incomplete-declared-scope-rejected',
    claim: {
      kind: 'extremum',
      subject: cell('duplicate-maximum', 'b'),
      operator: 'maximum',
      scope: { evidenceId: 'duplicate-maximum', rowIds: ['a', 'b'] },
    },
    evidence: [duplicateMaximum],
    expected: { accepted: false, reason: 'SCOPE_MISMATCH' },
  },
  {
    id: 'scope-from-different-evidence-rejected',
    claim: {
      kind: 'extremum',
      subject: cell('duplicate-maximum', 'b'),
      operator: 'maximum',
      scope: { evidenceId: 'nullable-minimum', rowIds: fullScope(nullableMinimum).rowIds },
    },
    evidence: [duplicateMaximum, nullableMinimum],
    expected: { accepted: false, reason: 'SCOPE_MISMATCH' },
  },
  {
    id: 'missing-evidence-rejected',
    claim: { kind: 'threshold', subject: cell('absent', 'row'), operator: 'above', threshold: 0 },
    evidence: [orderedRevenue],
    expected: { accepted: false, reason: 'EVIDENCE_NOT_FOUND' },
  },
  {
    id: 'missing-row-rejected',
    claim: { kind: 'threshold', subject: cell('ordered-revenue', 'absent'), operator: 'above', threshold: 0 },
    evidence: [orderedRevenue],
    expected: { accepted: false, reason: 'ROW_NOT_FOUND' },
  },
  {
    id: 'false-threshold-rejected',
    claim: { kind: 'threshold', subject: cell('ordered-revenue', 'jan'), operator: 'above', threshold: 100 },
    evidence: [orderedRevenue],
    expected: { accepted: false, reason: 'RELATION_FALSE' },
  },
];
