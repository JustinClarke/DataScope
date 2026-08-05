import type { ClaimIR } from '../12-verified-claims/claimIr';
import type { EvidencePacket } from '../12-verified-claims/evidence';
import { renderVerifiedFact } from '../12-verified-claims/renderer';
import type { VerifiedFact } from '../12-verified-claims/verifier';

/**
 * The display seam (§ Checkpoint 4, Finding 1). Experiment 12's extremum template never names
 * the dimension it ranked over, so Arm A's "Books (507,332.51 USD) was the maximum for the
 * complete evidence scope." and Arm B's "completed (952,190.31 USD) was ..." are the same
 * sentence shape, and a reader of the second cannot tell that `completed` is an `orders.status`
 * rather than another product category. § The boundary assigns DataScope the rendered sentence
 * precisely so a false impression cannot be created at display.
 *
 * Experiment 12 stays imported unedited — the same reason 13 has its own `datasetMap.ts`. The
 * dimension is already deterministic compiler-authored metadata on the evidence packet, so
 * naming it changes neither `VerifiedFact` nor what the verifier accepts. Every other fact kind
 * keeps experiment 12's template verbatim; `comparison` and `change` already name both operand
 * labels, and Finding 1 is scoped to the extremum sentence.
 */

/** Byte-identical to experiment 12's private value formatter; `renderer.test.ts` pins the two together. */
function value(number: number, unit: string): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(number)} ${unit}`;
}

export function renderFact(fact: VerifiedFact, claim: ClaimIR, evidence: readonly EvidencePacket[]): string {
  if (fact.kind !== 'extremum' || claim.kind !== 'extremum') return renderVerifiedFact(fact);
  // The verifier has already proven subject and scope share one packet, so either id resolves it.
  const dimension = evidence.find((packet) => packet.id === claim.scope.evidenceId)?.dimension;
  if (dimension === undefined) return renderVerifiedFact(fact);
  return `${fact.subject} (${value(fact.leftValue, fact.unit)}) was the ${fact.operator} across ${dimension} for the complete evidence scope.`;
}
