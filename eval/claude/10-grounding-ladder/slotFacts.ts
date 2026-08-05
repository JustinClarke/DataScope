// ComputedFactKind → PanelSlot partition (10-grounding-ladder.md, "Partition
// the fact table by slot"). Cuts selection pressure from "pick 5 of 38" to
// "pick 2 of 6" and makes slot misassignment structurally checkable rather
// than post-hoc detectable (kill criterion k). Four ComputedFactKinds have no
// stated home in the doc's own partition table — aggregate, group-breakdown,
// join-cardinality, domain-guess — and stay OUT of every slot's fact table
// until a future revision places them; domain-guess in particular has no
// builder at all (computeStats.ts never mints it).
import { buildCitableFacts, type CitableFact } from '../../../src/lib/citableFacts';
import type { TableRegistryEntry } from '../../../src/types';
import type { ComputedFact, ComputedFactKind } from '../08-computed-facts/computeStats';
import { computedFactToCitable } from '../08-computed-facts/enrichedFacts';

export type PanelSlot = 'header' | 'structural' | 'quality' | 'behavioral' | 'offers';

const SLOT_BY_KIND: Partial<Record<ComputedFactKind, Exclude<PanelSlot, 'offers'>>> = {
  'temporal-span': 'header',
  concentration: 'structural',
  distribution: 'structural',
  'dead-column': 'structural',
  'top-values': 'structural',
  dependency: 'structural',
  'null-structure': 'quality',
  sentinel: 'quality',
  outlier: 'quality',
  'coverage-gap': 'quality',
  'referential-integrity': 'quality',
  'arithmetic-consistency': 'quality',
  trend: 'behavioral',
  seasonality: 'behavioral',
  correlation: 'behavioral',
  association: 'behavioral',
  'variance-explained': 'behavioral',
};

export interface SlotFactTables {
  tables: Record<PanelSlot, CitableFact[]>;
  /** Reverse index for kill criterion (k): the one slot a fact id belongs to. */
  slotOf: Map<string, PanelSlot>;
}

function buildVocabulary(tables: TableRegistryEntry[]): string[] {
  const names = new Set<string>();
  for (const table of tables) {
    names.add(table.tableName);
    for (const column of table.columns ?? []) names.add(column.name);
  }
  return [...names];
}

function latestSnapshot(tables: TableRegistryEntry[]): string {
  return tables.reduce((latest, t) => (t.createdAt > latest ? t.createdAt : latest), tables[0]?.createdAt ?? '');
}

/** Builds one CitableFact[] per panel slot. Header gets the schema-level
 * rowCount/dateRange facts (`fact:*`, buildCitableFacts's own schema loop —
 * called with no tableInsights so only those, never the insight-rule facts,
 * come back) plus computed temporal-span facts; structural/quality/behavioral
 * get their partitioned computed facts; offers gets none — that slot is
 * scored by SQL execution (runOffers.ts), never by citation. */
export function buildSlotFactTables(tables: TableRegistryEntry[], computedStats: ComputedFact[]): SlotFactTables {
  const vocabulary = buildVocabulary(tables);
  const snapshot = latestSnapshot(tables);
  const out: Record<PanelSlot, CitableFact[]> = { header: [], structural: [], quality: [], behavioral: [], offers: [] };
  const slotOf = new Map<string, PanelSlot>();

  for (const f of buildCitableFacts(tables, [])) {
    out.header.push(f);
    slotOf.set(f.id, 'header');
  }

  for (const fact of computedStats) {
    const slot = SLOT_BY_KIND[fact.kind];
    if (!slot) continue;
    const citable = computedFactToCitable(fact, vocabulary, snapshot);
    out[slot].push(citable);
    slotOf.set(citable.id, slot);
  }

  return { tables: out, slotOf };
}
