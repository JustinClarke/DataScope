// Scores an emitted PanelAnswer against PANEL-KEY.json's mechanical truths
// (C1, C3) and the live slot fact table (C2), per the claim-class taxonomy
// 10-grounding-ladder.md lays out. C2's check needs no key at all — it's
// citation-plus-closure against the slot's own fact table (checkCitationWithClosure),
// exactly the mechanism 03/08 already ship. C4 has no check by construction;
// this module counts C4 residue (claims that clear neither the C2 nor the C3
// check) so a human reads exactly that residue, never the whole panel.
import { checkCitationWithClosure } from '../08-computed-facts/closureRules';
import { passesTrendGeneralisationGuard } from '../../../src/lib/producerValidators';
import type { CitableFact } from '../../../src/lib/citableFacts';
import type { PanelAnswer, PanelClaim, PanelSlot } from './panelSchema';
import type { SlotFactTables } from './slotFacts';
import type { KeyAssertion, PanelKeyEntry } from './buildKey';

export interface C1Disagreement {
  /** The numeric/date token stated in the header that matches no C1 truth. */
  text: string;
  truths: string[];
}

export interface C2Disposition {
  slot: Exclude<PanelSlot, 'offers'>;
  claim: PanelClaim;
  citeId: string;
  ok: boolean;
  closedByRule: boolean;
  offendingEntities: string[];
  offendingValues: string[];
  /** Kill criterion (k): the cited fact belongs to a different slot's own partition. */
  slotMisassigned: boolean;
}

export interface C3Occurrence {
  slot: Exclude<PanelSlot, 'offers'>;
  text: string;
}

export interface PanelScoreResult {
  c1: C1Disagreement[];
  c2: C2Disposition[];
  c3: C3Occurrence[];
  /** Claims that named no checkable citation and don't read as a C3 absence
   * claim — the residue a human must read (doc: "C4 still needs a human, and
   * no key can fix that"). A heuristic for triage, not a certified classification. */
  c4Residue: Array<{ slot: Exclude<PanelSlot, 'offers'>; text: string }>;
  /** Claims the (unshipped) trend-generalisation guard would reject — the
   * hit-rate half of the number that guard has to earn its way in with (doc,
   * "Extend the phrasing guard to trend generalisation, and measure the cost").
   * Its false-reject half is measured against the app's own deterministic
   * statements in runOffers.ts, never against model output. Reported, never
   * folded into the C2 or C4 counts. */
  trendGeneralisations: Array<{ slot: Exclude<PanelSlot, 'offers'>; text: string }>;
}

// The mock-up's own exhaustive-absence phrasing ("No duplicate rows
// detected", "No zero-variance columns") — kill criterion (j): any
// model-authored absence claim is a fabrication regardless of whether it
// happens to be true, so this only needs to detect the *shape*.
const ABSENCE_PATTERN = /\bno\s+(duplicate|zero[- ]variance)\b|\bnone detected\b/i;

function numericTokens(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((t) => t.replace(/,/g, ''));
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** An ISO-date truth ("2023-01-01") is a compound token: `numericTokens`
 * never extracts it whole (the hyphens split it), so a header that states
 * the *same* date in prose ("January 1, 2023") or even echoes the ISO form
 * verbatim ("2023-01-01" tokenizes to "2023"/"01"/"01") would otherwise flag
 * every one of its digit groups as a disagreement against a correct date.
 * Found 2026-07-30 via a $0 replay of persisted headers: 248 of the 7B's 254
 * clean-data C1 disagreements were exactly this — a scorer artifact, not a
 * fabrication. Adding the date's component tokens (year, and month/day both
 * zero-padded and bare) is a narrower fix than full date parsing but closes
 * the demonstrated failure mode. */
function c1TruthTokens(assertions: KeyAssertion[]): Set<string> {
  const truths = new Set<string>();
  for (const a of assertions) {
    if (a.class !== 'C1') continue;
    const values = Array.isArray(a.truth) ? a.truth : [a.truth];
    for (const v of values) {
      const s = String(v);
      truths.add(s);
      const iso = s.match(ISO_DATE);
      if (iso) {
        const [, year, month, day] = iso;
        for (const part of [year, month, day]) {
          truths.add(part);
          truths.add(String(Number(part)));
        }
      }
    }
  }
  return truths;
}

/** Byte-equality against the computed value — doc: "one equality check, not
 * a judgement call." Any numeric token in the header that isn't in the key's
 * own C1 truth set is a disagreement.
 *
 * Exception: the anchor-probe DELETED condition removes the anchor fact
 * entirely, and a model that reasonably pivots the header to a different,
 * legitimately-cited fact (e.g. "Top Sex values: male (575), female (316)"
 * instead of a row count) has its numbers checked against the wrong truth
 * set by construction — every token fails. If the header's own citation
 * resolves to a fact outside the key's anchor set, score it like a C2 claim
 * (citation-closure against what it actually cited) instead. */
function scoreC1(
  headerClaim: PanelClaim,
  headerKey: KeyAssertion[],
  slotFacts: SlotFactTables,
): C1Disagreement[] {
  const truths = c1TruthTokens(headerKey);
  if (truths.size === 0) return [];

  const anchorFactIds = new Set(headerKey.map((a) => `fact:${a.assertion}`));
  const citesAnchor = headerClaim.cites.some((id) => anchorFactIds.has(id));
  const citesOtherResolvedFact = !citesAnchor && headerClaim.cites.some((id) => {
    for (const table of Object.values(slotFacts.tables)) {
      if (table.some((f) => f.id === id)) return true;
    }
    return false;
  });

  if (citesOtherResolvedFact) {
    const factsById = new Map<string, CitableFact>();
    for (const table of Object.values(slotFacts.tables)) {
      for (const f of table) factsById.set(f.id, f);
    }
    const disagreements: C1Disagreement[] = [];
    for (const citeId of headerClaim.cites) {
      const fact = factsById.get(citeId);
      if (!fact) continue;
      const { closure } = checkCitationWithClosure(headerClaim.text, fact);
      if (!closure.ok) {
        disagreements.push({ text: closure.offendingValues.join(', '), truths: [...truths] });
      }
    }
    return disagreements;
  }

  const disagreements: C1Disagreement[] = [];
  for (const token of numericTokens(headerClaim.text)) {
    if (!truths.has(token)) disagreements.push({ text: token, truths: [...truths] });
  }
  return disagreements;
}

function scoreC2(
  slot: Exclude<PanelSlot, 'offers'>,
  claims: PanelClaim[],
  slotFacts: SlotFactTables,
): C2Disposition[] {
  const factsById = new Map<string, CitableFact>();
  for (const table of Object.values(slotFacts.tables)) {
    for (const f of table) factsById.set(f.id, f);
  }

  const dispositions: C2Disposition[] = [];
  for (const claim of claims) {
    for (const citeId of claim.cites) {
      const fact = factsById.get(citeId);
      if (!fact) {
        dispositions.push({
          slot,
          claim,
          citeId,
          ok: false,
          closedByRule: false,
          offendingEntities: [],
          offendingValues: [],
          slotMisassigned: false,
        });
        continue;
      }
      const { strict, closure } = checkCitationWithClosure(claim.text, fact);
      const homeSlot = slotFacts.slotOf.get(citeId);
      dispositions.push({
        slot,
        claim,
        citeId,
        ok: closure.ok,
        closedByRule: !strict.ok && closure.ok,
        offendingEntities: closure.offendingEntities,
        offendingValues: closure.offendingValues,
        slotMisassigned: homeSlot !== undefined && homeSlot !== slot,
      });
    }
  }
  return dispositions;
}

const SCORABLE_SLOTS = ['structural', 'quality', 'behavioral'] as const;

export function scorePanel(answer: PanelAnswer, key: PanelKeyEntry, slotFacts: SlotFactTables): PanelScoreResult {
  const c1 = scoreC1(answer.header, key.header, slotFacts);

  const c2: C2Disposition[] = [];
  for (const slot of SCORABLE_SLOTS) c2.push(...scoreC2(slot, answer[slot], slotFacts));

  const c3: C3Occurrence[] = [];
  const c4Residue: PanelScoreResult['c4Residue'] = [];
  const trendGeneralisations: PanelScoreResult['trendGeneralisations'] = [];

  for (const slot of SCORABLE_SLOTS) {
    for (const claim of answer[slot]) {
      if (!passesTrendGeneralisationGuard(claim.text)) trendGeneralisations.push({ slot, text: claim.text });
      const isAbsenceClaim = ABSENCE_PATTERN.test(claim.text);
      if (isAbsenceClaim) c3.push({ slot, text: claim.text });

      const ownDispositions = c2.filter((d) => d.slot === slot && d.claim === claim);
      const allFailed = ownDispositions.length > 0 && ownDispositions.every((d) => !d.ok);
      if (!isAbsenceClaim && (ownDispositions.length === 0 || allFailed)) {
        c4Residue.push({ slot, text: claim.text });
      }
    }
  }

  return { c1, c2, c3, c4Residue, trendGeneralisations };
}
