// `derivableFrom` — the value-closure the computed-facts-with-data candidate's
// "What to build" item 3 calls its highest-risk piece (08-computed-facts-with-data.md).
// `checkCitation` (src/lib/citableFacts.ts) applies strict set membership on
// stated values — survivable for 03, whose facts carry pre-rendered strings a
// model can echo verbatim, but not for 08, whose facts carry raw computed
// numbers: a fact stating `84.15` gets narrated as "about 84" and rejected
// outright under the strict check. Modeled exactly on 02's `CLOSURE_RULES`
// discipline (groundingCheck.ts) — an enumerated, exported, logged list, never
// a fuzzy/tolerance-based substitute for the strict check itself. Every claim
// is evaluated under BOTH settings (`checkCitationWithClosure` returns both),
// so the price of each rule is measured, not assumed.
import { checkCitation, type CitableFact, type CitationCheckResult } from '../../../src/lib/citableFacts';
import { passesPhrasingGuard } from '../../../src/lib/producerValidators';

/** Every closure rule applied, in application order. Logged verbatim in the
 * verdict per the doc's own instruction — the list length itself is a result. */
export const CLOSURE_RULES = [
  'rounding — a stated number that is a genuine rounding (to 0/1/2 decimal places, or to the nearest 1/10/100) of exactly ONE value already in the cited fact\'s value set',
  'ratio — a stated "roughly Nx" comparison between exactly TWO values already in the cited fact\'s value set, correct to one significant figure',
  'percentage/share — a stated percentage computed from exactly TWO values already in the cited fact\'s value set (a part and a whole), i.e. part/whole × 100',
] as const;

function parseNumeric(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** True when `stated` is a genuine rounding of `real` — never of a value
 * itself derived from two others (that is rule 2/3's job, kept separate so
 * "roughly 6×" can never masquerade as "a rounding of 6.15"). */
function isRoundingOf(stated: number, real: number): boolean {
  if (real === 0) return stated === 0;
  for (const digits of [0, 1, 2]) {
    const rounded = Math.round(real * 10 ** digits) / 10 ** digits;
    if (Math.abs(stated - rounded) < 1e-9) return true;
  }
  for (const magnitude of [1, 10, 100]) {
    const rounded = Math.round(real / magnitude) * magnitude;
    if (Math.abs(stated - rounded) < 1e-9) return true;
  }
  return false;
}

function roundToSigFigs(x: number, figs: number): number {
  if (x === 0) return 0;
  const magnitude = Math.ceil(Math.log10(Math.abs(x)));
  const factor = 10 ** (figs - magnitude);
  return Math.round(x * factor) / factor;
}

/** `stated` reads as "roughly a/b" (or b/a), within one significant figure —
 * doc's own example: a fact stating `{1: 84.15, 3: 13.68}` licenses "roughly 6x". */
function isRatioOf(stated: number, a: number, b: number): boolean {
  if (b === 0) return false;
  const ratio = a / b;
  if (!Number.isFinite(ratio) || ratio === 0) return false;
  if (Math.abs(stated - roundToSigFigs(ratio, 1)) < 1e-9) return true;
  return Math.abs(stated - ratio) / Math.abs(ratio) <= 0.08;
}

/**
 * True when `offendingValue` (a value `checkCitation` already rejected as
 * absent from `fact`'s own value set, normalized the same way
 * `checkCitation` normalizes) is nonetheless derivable from that fact's OWN
 * values via one of `CLOSURE_RULES` — never from a value belonging to a
 * different fact (that would defeat the citation mechanism's entire point).
 */
export function derivableFrom(offendingValue: string, fact: CitableFact): boolean {
  const stated = parseNumeric(offendingValue);
  if (stated === null) return false;

  const allowed = fact.values
    .map((v) => parseNumeric(String(v)))
    .filter((n): n is number => n !== null);
  if (allowed.length === 0) return false;

  for (const real of allowed) {
    if (isRoundingOf(stated, real)) return true; // rule 1
  }
  for (const a of allowed) {
    for (const b of allowed) {
      if (a === b) continue;
      if (isRatioOf(stated, a, b)) return true; // rule 2
    }
  }
  for (const part of allowed) {
    for (const whole of allowed) {
      if (whole === 0 || part === whole) continue;
      if (isRoundingOf(stated, (part / whole) * 100)) return true; // rule 3
    }
  }
  return false;
}

export interface ClosureCheckResult {
  strict: CitationCheckResult;
  closure: CitationCheckResult;
  /** Offending values under the strict check that a closure rule covered — the
   * per-claim measurement `derivableFrom`'s cost is reported from. */
  closedBy: string[];
}

/**
 * Runs the strict check (`checkCitation`) and the closure-extended check in
 * one pass, so both numbers come free per claim (the doc's own instruction).
 * Closure only ever narrows `offendingValues` — `offendingEntities` is never
 * touched, since a closure rule licenses a *value* relationship, never a new
 * entity name (that would be a second, silent way to name-check a fabrication in).
 */
export function checkCitationWithClosure(statement: string, fact: CitableFact): ClosureCheckResult {
  const strict = checkCitation(statement, fact);
  if (strict.ok) return { strict, closure: strict, closedBy: [] };

  const closedBy = strict.offendingValues.filter((v) => derivableFrom(v, fact));
  const remainingValues = strict.offendingValues.filter((v) => !closedBy.includes(v));
  const closure: CitationCheckResult = {
    ok: strict.offendingEntities.length === 0 && remainingValues.length === 0,
    offendingEntities: strict.offendingEntities,
    offendingValues: remainingValues,
  };
  return { strict, closure, closedBy };
}

/** Same shape as `narrationValidator` (src/lib/producerValidators.ts) — D45's
 * phrasing guard plus a citation check — but run twice per claim, once under
 * each setting, so both counts come free (the doc's own instruction). There is
 * no `FactRef` struct-equality check here (unlike `narrationValidator`): 08
 * never mutates a baseline `FactRef`, it only ever narrates a cited
 * `ComputedFact`'s own statement, so that equality is guaranteed by
 * construction rather than needing to be re-verified per claim. */
export function narrationCheckWithClosure(statement: string, fact: CitableFact): { strict: boolean; closure: boolean } {
  if (!passesPhrasingGuard(statement)) return { strict: false, closure: false };
  const { strict, closure } = checkCitationWithClosure(statement, fact);
  return { strict: strict.ok, closure: closure.ok };
}
