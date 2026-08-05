// Automates kill criterion (f) (08-computed-facts-with-data.md): "No
// statistical claim derived from the exemplar rows." For every served claim,
// extracts its stated entity/value mentions and flags any that appear in the
// sent exemplar rows' cell values but in NO `ComputedFact`'s value set — the
// exact failure mode the original "send rows" probe reproduced (a model
// eyeballing a sample and stating something only the sample, not a citable
// fact, supports). One occurrence fails this criterion; it is the gate the
// entire row-sending premise stands on, so it is checked per claim, not just
// sampled.
import { extractEntities, extractValues } from '../../../src/lib/citableFacts';
import type { ComputedFact } from './computeStats';
import type { ExemplarRow } from './enrichedFacts';

export interface SampleLeak {
  claimText: string;
  leaked: string[];
}

function normalizedCellValues(rows: ExemplarRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    for (const v of Object.values(r.row)) {
      if (v === null || v === undefined) continue;
      out.add(String(v).toLowerCase().trim());
    }
  }
  return out;
}

function normalizedFactValues(facts: ComputedFact[]): Set<string> {
  const out = new Set<string>();
  for (const f of facts) {
    for (const v of f.values) out.add(String(v).toLowerCase().trim());
  }
  return out;
}

/**
 * Returns a `SampleLeak` when `claimText` states something that appears in the
 * sent exemplar rows' own cell values but is absent from every computed
 * fact's value set — a claim citing a real fact id can still smuggle in a
 * sample-derived number/label if the model's prose happens to also match a
 * cell it saw, which `checkCitation` alone cannot see (it only checks the ONE
 * fact cited, not what else was on the wire). `null` when clean.
 */
export function checkSampleLeak(
  claimText: string,
  exemplarRows: ExemplarRow[],
  facts: ComputedFact[],
): SampleLeak | null {
  if (exemplarRows.length === 0) return null;
  const cellValues = normalizedCellValues(exemplarRows);
  const factValues = normalizedFactValues(facts);

  const mentioned = [...extractValues(claimText), ...extractEntities(claimText)].map((v) => v.toLowerCase().trim());
  const leaked = [...new Set(mentioned.filter((v) => cellValues.has(v) && !factValues.has(v)))];
  return leaked.length > 0 ? { claimText, leaked } : null;
}

/** Runs the check across every served claim in one run — the harness records
 * the result per row-count condition (kill criterion f's own instruction),
 * not just in aggregate. */
export function checkSampleLeaks(
  claimTexts: string[],
  exemplarRows: ExemplarRow[],
  facts: ComputedFact[],
): SampleLeak[] {
  return claimTexts.map((text) => checkSampleLeak(text, exemplarRows, facts)).filter((l): l is SampleLeak => l !== null);
}
