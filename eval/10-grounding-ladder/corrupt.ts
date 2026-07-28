// 09's A/B/C fact-integrity variants (10-grounding-ladder.md, A3 axis:
// TRUE / CORRUPTED / DELETED — variants.ts's `FactIntegrity`). Corrupts or
// deletes exactly one anchor fact, chosen deterministically per the doc's own
// worked example ("corrupt titanic's mean fare" — a recognizable, trainable
// number): prefer a fact whose id ends `.rowCount` (the single most iconic
// recallable number for a named dataset, e.g. "Titanic, 891 passengers"),
// then `.aggregate`, then `.temporal-span`, else the first fact by id.
//
// Deliberately does NOT add new scoring logic. The existing pipeline already
// closes both hatches once the corrupted (not pristine) `SlotFactTables` is
// what `scorePanel`'s C2 check runs against, while `scoreC1` keeps checking
// the header against the untouched `PANEL-KEY.json` truth:
//   - model states the corrupted value, citing the corrupted fact -> C2 ok,
//     C1 disagreement (differs from real truth) -> prompt won over recall.
//   - model states the true value -> C1 ok, but citing the (now corrupted)
//     fact's id makes that value an "offending value" under C2 -> recall
//     won over the prompt, which is 09's central question.
// `run.ts` is what has to feed the corrupted tables into `scorePanel`, not a
// pristine copy — this module only produces that corrupted table plus a
// record of what was changed, for RESULTS.json.
import type { CitableFact } from '../../src/lib/citableFacts';
import type { FactIntegrity } from './variants';
import type { PanelSlot, SlotFactTables } from './slotFacts';

export interface FactCorruption {
  factId: string;
  targetValueIndex: number;
  original: string;
  corrupted: string;
}

export interface FactIntegrityResult {
  tables: SlotFactTables;
  mode: FactIntegrity;
  /** The fact `corrupt`/`delete` acted on — absent only for TRUE (no-op). */
  anchorFactId?: string;
  corruption?: FactCorruption;
}

const ANCHOR_ID_SUFFIXES = ['.rowCount', '.aggregate', '.temporal-span'];

function allFacts(tables: SlotFactTables): CitableFact[] {
  return (Object.keys(tables.tables) as PanelSlot[])
    .flatMap((slot) => tables.tables[slot])
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Deterministic across runs and across CLEAR/OPAQUE (kind suffixes like
 * `.rowCount`/`.aggregate` are never anonymized — see opaque.ts's
 * `mapIdSegments`), so the same logical fact is the anchor either way. */
export function pickAnchorFact(tables: SlotFactTables): CitableFact {
  const facts = allFacts(tables);
  for (const suffix of ANCHOR_ID_SUFFIXES) {
    const hit = facts.find((f) => f.id.endsWith(suffix));
    if (hit) return hit;
  }
  if (facts.length === 0) throw new Error('pickAnchorFact: no facts available to corrupt');
  return facts[0];
}

function parseNumeric(v: string): number | null {
  const n = Number(v.replace(/,/g, ''));
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
}

/** A fixed, deterministic drift — no RNG, so a corrupted cell reproduces
 * identically across repeats and the only variance measured is the model's. */
function corruptNumber(n: number): number {
  if (n === 0) return 42;
  const corrupted = n * 1.4;
  return Number.isInteger(n) ? Math.round(corrupted) : Math.round(corrupted * 100) / 100;
}

/** Reproduces `template`'s formatting style (a locale-grouped "10,420" stays
 * grouped) so a corrupted value doesn't announce itself by format alone. */
function formatLike(template: string, n: number): string {
  return template.includes(',') ? n.toLocaleString('en-US') : String(n);
}

/**
 * Alters exactly one logical value in `fact` — every representation of that
 * same underlying number across `fact.values` (e.g. a rowCount fact's plain
 * "10420" and locale-grouped "10,420" both derive from one number) is
 * replaced consistently, and every occurrence of those representations in
 * `ref.statement` is rewritten too. Without this, a fact could end up
 * self-contradicting — one representation corrupted, a sibling still true —
 * which would make the fact table internally inconsistent rather than simply
 * wrong, and 09's probe is about the latter.
 */
export function corruptFact(fact: CitableFact, targetValueIndex = 0): { fact: CitableFact; corruption: FactCorruption } {
  const rawTarget = fact.values[targetValueIndex];
  const original = String(rawTarget);
  const targetNumber = parseNumeric(original);

  if (targetNumber === null) {
    // Non-numeric (categorical) value — no numeric drift applies. Swap in a
    // different value this same fact already carries if one exists (still
    // "one value altered, id unchanged"); otherwise a fixed suffix. Not the
    // doc's own worked example (rowCount/mean are both numeric) but keeps the
    // function total over every ComputedFactKind's value shape.
    const alternate = fact.values.find((v, i) => i !== targetValueIndex && v !== original);
    const corrupted = alternate ?? `${original}-corrupted`;
    const values = fact.values.map((v, i) => (i === targetValueIndex ? corrupted : v));
    const statement = fact.ref.statement.split(original).join(corrupted);
    return {
      fact: { ...fact, values, ref: { ...fact.ref, statement } },
      corruption: { factId: fact.id, targetValueIndex, original, corrupted },
    };
  }

  const corruptedNumber = corruptNumber(targetNumber);
  const values = fact.values.map((v) => (parseNumeric(v) === targetNumber ? formatLike(v, corruptedNumber) : v));
  let statement = fact.ref.statement;
  for (const v of fact.values) {
    if (parseNumeric(v) === targetNumber) statement = statement.split(v).join(formatLike(v, corruptedNumber));
  }
  const corrupted = formatLike(original, corruptedNumber);

  return {
    fact: { ...fact, values, ref: { ...fact.ref, statement } },
    corruption: { factId: fact.id, targetValueIndex, original, corrupted },
  };
}

export function deleteFact(tables: SlotFactTables, factId: string): SlotFactTables {
  const slot = tables.slotOf.get(factId);
  const slotOf = new Map(tables.slotOf);
  slotOf.delete(factId);
  const out = { ...tables.tables };
  if (slot) out[slot] = out[slot].filter((f) => f.id !== factId);
  return { tables: out, slotOf };
}

/** Single entry point `run.ts` calls for the A3 axis: TRUE is a pass-through,
 * CORRUPTED/DELETED act on the deterministic anchor fact `pickAnchorFact` picks. */
export function applyFactIntegrity(tables: SlotFactTables, mode: FactIntegrity): FactIntegrityResult {
  if (mode === 'TRUE') return { tables, mode };

  const anchor = pickAnchorFact(tables);
  if (mode === 'DELETED') {
    return { tables: deleteFact(tables, anchor.id), mode, anchorFactId: anchor.id };
  }

  const { fact: corruptedFact, corruption } = corruptFact(anchor);
  const slot = tables.slotOf.get(anchor.id);
  if (!slot) throw new Error(`applyFactIntegrity: anchor fact ${anchor.id} missing from slotOf`);
  const out = { ...tables.tables, [slot]: tables.tables[slot].map((f) => (f.id === anchor.id ? corruptedFact : f)) };
  return { tables: { tables: out, slotOf: tables.slotOf }, mode, anchorFactId: anchor.id, corruption };
}
