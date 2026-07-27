// Post-hoc grounding check for the generate-then-verify candidate
// (02-generate-then-verify.md, approach 02 of _implementation/_misc/_ideation/ai
// architecture experimentation/). Pure, model-free: given the exact
// `StructuralFacts` payload and the given baseline headline the model saw, and
// a free-text statement it produced, decide whether every suspicious token in
// the statement is derivable from what the model was actually given.
//
// Deliberately narrow extraction, not a full token check: only three candidate
// mention classes are ever extracted (capitalized words, digit runs, quoted
// substrings) — ordinary connective English ("customers", "records", "data")
// is invisible to the check by construction, which is what keeps the
// false-reject rate measurable at all (kill criterion c). Word-form numerals
// ("ten years") are equally invisible for the same reason — a stated, known
// gap (see the Verdict), not a closure rule.
import type { StructuralFacts } from '../../edge/protocol';

export interface GroundingResult {
  ok: boolean;
  offending: string[];
}

/** Every closure rule applied when computing the allowed set, in application
 * order. Logged verbatim in the Verdict per the doc's own kill criterion (d) —
 * the list length itself is a result. */
export const CLOSURE_RULES = [
  'case-insensitive match for table names, column names, and semanticType values',
  'numeric normalization — thousands separators and trailing %/σ stripped before comparing digit runs',
  'year extraction — the 4-digit year prefix of any minDate/maxDate is allowed',
  'date-span arithmetic — |maxYear - minYear| and |maxYear - minYear| + 1 are both allowed as span-length numbers',
  "baseline-headline carryover — every numeric token and quoted substring already present in the given baseline headline is allowed verbatim (it crossed the wire in the request's `headline` field, and the system prompt requires the model preserve it)",
] as const;

function normalizeNumeric(raw: string): string {
  return raw.replace(/,/g, '').replace(/[%σ]$/, '');
}

/** Numeric tokens of a statement — same shape as eval/synthesis/run.ts's own
 * `numericTokens`, plus the σ suffix these headlines also use. The decimal
 * portion requires a trailing digit (`\.\d+`, not `\.?`) so a sentence-ending
 * period right after a whole number ("...1.000.") isn't swallowed into the
 * token. */
function numericTokens(text: string): string[] {
  return text.match(/\d[\d,]*(?:\.\d+)?[%σ]?/g) ?? [];
}

function quotedSubstrings(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/"([^"]*)"/g)) out.push(m[1]);
  for (const m of text.matchAll(/'([^']*)'/g)) out.push(m[1]);
  return out;
}

/**
 * Builds the allowed set deterministically from the payload the model was
 * given: `StructuralFacts` (table/column names, semanticType vocabulary,
 * rowCounts, cardinalities, minDate/maxDate) plus the closure rules above.
 * `baselineHeadline` is the given headline the model was told to preserve
 * numbers/quoted values from (crosses the wire alongside `facts`, just in a
 * different request field) — rule 5.
 */
export function allowedMentions(facts: StructuralFacts, baselineHeadline: string): Set<string> {
  const allowed = new Set<string>();

  for (const table of facts.tables) {
    allowed.add(table.name.toLowerCase()); // rule 1
    allowed.add(String(table.rowCount));
    allowed.add(table.rowCount.toLocaleString('en-US'));

    for (const column of table.columns) {
      allowed.add(column.name.toLowerCase()); // rule 1
      allowed.add(column.semanticType.toLowerCase()); // rule 1
      allowed.add(String(column.cardinality));
      allowed.add(column.cardinality.toLocaleString('en-US'));

      if (column.minDate) {
        allowed.add(column.minDate.toLowerCase());
        const minYear = column.minDate.match(/^\d{4}/)?.[0];
        if (minYear) allowed.add(minYear); // rule 3
      }
      if (column.maxDate) {
        allowed.add(column.maxDate.toLowerCase());
        const maxYear = column.maxDate.match(/^\d{4}/)?.[0];
        if (maxYear) allowed.add(maxYear); // rule 3
      }
      if (column.minDate && column.maxDate) {
        const minYear = Number(column.minDate.match(/^\d{4}/)?.[0]);
        const maxYear = Number(column.maxDate.match(/^\d{4}/)?.[0]);
        if (Number.isFinite(minYear) && Number.isFinite(maxYear)) {
          allowed.add(String(maxYear - minYear)); // rule 4
          allowed.add(String(maxYear - minYear + 1)); // rule 4
        }
      }
    }
  }

  for (const token of numericTokens(baselineHeadline)) {
    allowed.add(normalizeNumeric(token).toLowerCase()); // rule 5
  }
  for (const quoted of quotedSubstrings(baselineHeadline)) {
    allowed.add(quoted.toLowerCase()); // rule 5
  }

  return allowed;
}

/** Capitalized-word candidates — proper nouns and (in this app's naming)
 * column-shaped tokens alike, since every real column name in the five §14
 * samples starts uppercase (PassengerId, TempHighC, ...). The statement's own
 * first word is exempt (ordinary sentence-initial capitalization, not a
 * mention). */
function capitalizedWordCandidates(statement: string): string[] {
  const out: string[] = [];
  const re = /\b[A-Z][A-Za-z0-9]*\b/g;
  for (const m of statement.matchAll(re)) {
    if (m.index === 0) continue;
    out.push(m[0]);
  }
  return out;
}

/**
 * Checks one free-text statement against the allowed set. Extracts three
 * candidate-mention classes only (capitalized words, digit runs, quoted
 * substrings) and rejects the whole statement if any extracted candidate's
 * normalized form is absent from `allowed`. Reject whole, never repair — the
 * caller degrades to baseline on `ok: false`.
 */
export function groundingCheck(statement: string, allowed: Set<string>): GroundingResult {
  const offending: string[] = [];

  for (const word of capitalizedWordCandidates(statement)) {
    if (!allowed.has(word.toLowerCase())) offending.push(word);
  }
  for (const num of numericTokens(statement)) {
    const normalized = normalizeNumeric(num).toLowerCase();
    if (!allowed.has(normalized)) offending.push(num);
  }
  for (const quoted of quotedSubstrings(statement)) {
    if (quoted.trim() === '') continue;
    if (!allowed.has(quoted.toLowerCase())) offending.push(`"${quoted}"`);
  }

  return { ok: offending.length === 0, offending };
}
