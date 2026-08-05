import type { CapabilityGapCode, DatasetPassport, EvidencePacket } from './contracts';

function hasColumn(passport: DatasetPassport, table: string, column: string): boolean {
  const found = passport.tables.find((candidate) => candidate.name === table);
  return found !== undefined && found.columns.some((candidate) => candidate.column === column);
}

export interface CapabilityGapMap {
  /** No dataset this generator serves carries experimental-design metadata, so causal claims are never supported. */
  causal_inference: true;
  missing_cost: boolean;
  missing_demographic: boolean;
}

/** Deterministic per dataset shape; distinguishes profit/revenue and age/country by column presence, not by wording. */
export function buildCapabilityGapMap(passport: DatasetPassport): CapabilityGapMap {
  const hasCost = hasColumn(passport, 'products', 'cost') || hasColumn(passport, 'order_items', 'cost');
  const hasAge = hasColumn(passport, 'customers', 'age') || hasColumn(passport, 'customers', 'birth_date');
  return {
    causal_inference: true,
    missing_cost: !hasCost,
    missing_demographic: !hasAge,
  };
}

/**
 * Corroborates a model-proposed unsupported reason against the deterministic gap map and (for
 * incomplete_scope only, since the AnalysisAction carries no evidence reference) whatever the
 * question has actually resolved so far. An uncorroborated proposal must be suppressed, not
 * trusted (§ Turn 1 rules: "unsupported is a proposal, not an authority").
 */
export function corroborateUnsupported(
  reason: CapabilityGapCode,
  gaps: Readonly<CapabilityGapMap>,
  /** Widened to the base packet so both arms corroborate identically: Arm A holds experiment 12's fixed EvidencePackets, Arm B holds compact ones. */
  resolvedEvidence: readonly EvidencePacket[],
): boolean {
  switch (reason) {
    case 'causal_inference':
      return gaps.causal_inference;
    case 'missing_cost':
      return gaps.missing_cost;
    case 'missing_demographic':
      return gaps.missing_demographic;
    case 'incomplete_scope':
      return resolvedEvidence.some((packet) => packet.completeness === 'truncated');
  }
}
