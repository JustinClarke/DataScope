import type { ClaimIR, EvidenceCellRef } from './claimIr';
import type { EvidencePacket, EvidenceRow } from './evidence';

export type RejectionReason =
  | 'EVIDENCE_NOT_FOUND'
  | 'ROW_NOT_FOUND'
  | 'NON_NUMERIC_OPERAND'
  | 'INVALID_TOLERANCE'
  | 'INCOMPATIBLE_METRIC'
  | 'INCOMPATIBLE_UNIT'
  | 'INCOMPLETE_SCOPE'
  | 'SCOPE_MISMATCH'
  | 'INVALID_CHRONOLOGY'
  | 'CHRONOLOGY_REVERSED'
  | 'RELATION_FALSE';

export interface VerifiedFact {
  kind: ClaimIR['kind'];
  operator: string;
  subject: string;
  object: string;
  leftValue: number;
  rightValue: number;
  unit: string;
}

export type VerificationResult =
  | { accepted: true; fact: VerifiedFact }
  | { accepted: false; reason: RejectionReason; detail: string };

type Rejection = Extract<VerificationResult, { accepted: false }>;

export interface VerificationOptions {
  absoluteTolerance: number;
}

export const DEFAULT_VERIFICATION_OPTIONS: Readonly<VerificationOptions> = {
  absoluteTolerance: 1e-9,
};

interface ResolvedCell {
  packet: EvidencePacket;
  row: EvidenceRow;
  order: number;
  value: number;
}

function rejected(reason: RejectionReason, detail: string): Rejection {
  return { accepted: false, reason, detail };
}

function resolveCell(ref: EvidenceCellRef, evidence: readonly EvidencePacket[]): ResolvedCell | Rejection {
  const packet = evidence.find((candidate) => candidate.id === ref.evidenceId);
  if (!packet) return rejected('EVIDENCE_NOT_FOUND', `Evidence ${ref.evidenceId} does not exist.`);
  const rowIndex = packet.rows.findIndex((candidate) => candidate.rowId === ref.rowId);
  if (rowIndex < 0) return rejected('ROW_NOT_FOUND', `Row ${ref.rowId} does not exist in ${packet.id}.`);
  const row = packet.rows[rowIndex]!;
  if (typeof row.value !== 'number' || !Number.isFinite(row.value)) {
    return rejected('NON_NUMERIC_OPERAND', `${packet.id}/${row.rowId} has no finite numeric value.`);
  }
  return { packet, row, order: row.order ?? rowIndex, value: row.value };
}

function isRejection(value: ResolvedCell | Rejection): value is Rejection {
  return 'accepted' in value;
}

function compatible(left: ResolvedCell, right: ResolvedCell): VerificationResult | undefined {
  if (left.packet.metric !== right.packet.metric) {
    return rejected('INCOMPATIBLE_METRIC', `Cannot compare ${left.packet.metric} with ${right.packet.metric}.`);
  }
  if (left.packet.unit !== right.packet.unit) {
    return rejected('INCOMPATIBLE_UNIT', `Cannot compare ${left.packet.unit} with ${right.packet.unit}.`);
  }
}

function fact(
  kind: ClaimIR['kind'],
  operator: string,
  left: ResolvedCell,
  rightValue: number,
  object: string,
): VerificationResult {
  return {
    accepted: true,
    fact: {
      kind,
      operator,
      subject: left.row.label,
      object,
      leftValue: left.value,
      rightValue,
      unit: left.packet.unit,
    },
  };
}

const equal = (left: number, right: number, tolerance: number): boolean => Math.abs(left - right) <= tolerance;

export function verifyClaim(
  claim: ClaimIR,
  evidence: readonly EvidencePacket[],
  options: Readonly<VerificationOptions> = DEFAULT_VERIFICATION_OPTIONS,
): VerificationResult {
  const tolerance = options.absoluteTolerance;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return rejected('INVALID_TOLERANCE', 'The absolute tolerance must be a finite non-negative number.');
  }
  if (claim.kind === 'comparison') {
    const left = resolveCell(claim.left, evidence);
    if (isRejection(left)) return left;
    const right = resolveCell(claim.right, evidence);
    if (isRejection(right)) return right;
    const incompatibility = compatible(left, right);
    if (incompatibility) return incompatibility;
    const holds = claim.operator === 'equal'
      ? equal(left.value, right.value, tolerance)
      : claim.operator === 'greater_than'
        ? left.value > right.value && !equal(left.value, right.value, tolerance)
        : left.value < right.value && !equal(left.value, right.value, tolerance);
    if (!holds) {
      return rejected('RELATION_FALSE', `${left.value} is not ${claim.operator} ${right.value}.`);
    }
    return fact('comparison', claim.operator, left, right.value, right.row.label);
  }

  if (claim.kind === 'extremum') {
    const subject = resolveCell(claim.subject, evidence);
    if (isRejection(subject)) return subject;
    const scope = evidence.find((candidate) => candidate.id === claim.scope.evidenceId);
    if (!scope) return rejected('EVIDENCE_NOT_FOUND', `Evidence ${claim.scope.evidenceId} does not exist.`);
    if (scope.id !== subject.packet.id) {
      return rejected('SCOPE_MISMATCH', 'The extremum subject and scope must use the same evidence packet.');
    }
    if (scope.completeness !== 'complete') {
      return rejected('INCOMPLETE_SCOPE', `Evidence ${scope.id} is truncated and cannot prove a global extremum.`);
    }
    const expectedRows = scope.rows.map((row) => row.rowId);
    if (claim.scope.rowIds.length !== expectedRows.length || expectedRows.some((rowId) => !claim.scope.rowIds.includes(rowId))) {
      return rejected('SCOPE_MISMATCH', 'The declared scope does not include every evidence row.');
    }
    const values = scope.rows.flatMap((row) => typeof row.value === 'number' && Number.isFinite(row.value) ? [row.value] : []);
    if (values.length === 0) return rejected('NON_NUMERIC_OPERAND', `Evidence ${scope.id} has no finite numeric values.`);
    const extreme = claim.operator === 'maximum' ? Math.max(...values) : Math.min(...values);
    if (!equal(subject.value, extreme, tolerance)) {
      return rejected('RELATION_FALSE', `${subject.value} is not the ${claim.operator}; the extremum is ${extreme}.`);
    }
    return fact('extremum', claim.operator, subject, extreme, `${claim.operator} in ${scope.id}`);
  }

  if (claim.kind === 'change') {
    const from = resolveCell(claim.from, evidence);
    if (isRejection(from)) return from;
    const to = resolveCell(claim.to, evidence);
    if (isRejection(to)) return to;
    const incompatibility = compatible(from, to);
    if (incompatibility) return incompatibility;
    if (!Number.isFinite(from.order) || !Number.isFinite(to.order)) {
      return rejected('INVALID_CHRONOLOGY', 'A change requires finite deterministic row-order values.');
    }
    if (from.packet.id !== to.packet.id || from.order >= to.order) {
      return rejected('CHRONOLOGY_REVERSED', 'A change must reference a later row in the same ordered evidence packet.');
    }
    const relation = equal(from.value, to.value, tolerance)
      ? 'no_change'
      : to.value > from.value
        ? 'increase'
        : 'decrease';
    if (claim.operator !== relation) {
      return rejected('RELATION_FALSE', `Expected ${claim.operator}, but ${from.value} changed to ${to.value}.`);
    }
    return fact('change', claim.operator, to, from.value, from.row.label);
  }

  const subject = resolveCell(claim.subject, evidence);
  if (isRejection(subject)) return subject;
  const holds = claim.operator === 'at'
    ? equal(subject.value, claim.threshold, tolerance)
    : claim.operator === 'above'
      ? subject.value > claim.threshold && !equal(subject.value, claim.threshold, tolerance)
      : subject.value < claim.threshold && !equal(subject.value, claim.threshold, tolerance);
  if (!holds) {
    return rejected('RELATION_FALSE', `${subject.value} is not ${claim.operator} ${claim.threshold}.`);
  }
  return fact('threshold', claim.operator, subject, claim.threshold, 'declared threshold');
}
