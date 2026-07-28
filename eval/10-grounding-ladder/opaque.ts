// 07 D2 schema anonymizer (10-grounding-ladder.md, A2 axis: CLEAR vs OPAQUE —
// "table_a, col_1…col_n"). Deterministic real-name -> opaque-name mapping and
// its exact inverse, so an OPAQUE cell runs the same scoring path a CLEAR cell
// does: anonymize the slot fact tables (and the schema card, in run.ts) before
// they go on the wire, then de-anonymize the model's raw PanelAnswer before
// scorePanel/PANEL-KEY.json — both keyed by real names — ever see it. This is
// what "reversible for audit" means: every opaque token can be inverted back,
// so a failing cell can be read in real column names, not `col_3`.
//
// Column numbering is dataset-global (col_1, col_2, … across every table in
// `tables`), not restarted per table. That's simpler than per-table
// bookkeeping and produces an identical result for this doc's actual scope —
// every phase-1 fixture (titanic, product_reviews, stock_prices) is a single
// table (dataset/tables.ts's MANIFEST). Cross-table facts (join-cardinality,
// referential-integrity) are not exercised by any in-scope fixture and are
// out of scope here; a same-named column in two different tables would still
// map to two distinct opaque tokens (numbering is position-based, not
// name-based), so it wouldn't silently collide if it ever came up.
import type { CitableFact } from '../../src/lib/citableFacts';
import type { TableRegistryEntry } from '../../src/types';
import type { PanelAnswer, PanelClaim } from './panelSchema';
import type { PanelSlot, SlotFactTables } from './slotFacts';

export interface OpaqueMapping {
  toOpaque: Map<string, string>;
  toReal: Map<string, string>;
  anonymizeText: (text: string) => string;
  deanonymizeText: (text: string) => string;
}

const ID_PREFIX_RE = /^(stat|fact|check):/;

function tableLetter(index: number): string {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word replace over every mapped name, longest names first so e.g. an
 * "AgeGroup" column can't be half-clobbered by an "Age" column's replacement. */
function buildReplacer(pairs: Map<string, string>): (text: string) => string {
  const keys = [...pairs.keys()].sort((a, b) => b.length - a.length);
  if (keys.length === 0) return (text) => text;
  const pattern = new RegExp(`\\b(${keys.map(escapeRegExp).join('|')})\\b`, 'g');
  return (text) => text.replace(pattern, (match) => pairs.get(match) ?? match);
}

/** Builds the table_a.. / col_1.. mapping for every table/column name in
 * `tables`, plus both text directions. Table order is name-sorted (not
 * declaration order) so the mapping is stable across two loads of the same
 * dataset; column order is each table's own declaration order, since that's
 * already stable (it's the SUMMARIZE/profile order) and carries no naming bias. */
export function buildOpaqueMapping(tables: TableRegistryEntry[]): OpaqueMapping {
  const toOpaque = new Map<string, string>();
  const toReal = new Map<string, string>();

  const sortedTables = [...tables].sort((a, b) => a.tableName.localeCompare(b.tableName));
  sortedTables.forEach((table, i) => {
    if (toOpaque.has(table.tableName)) return; // first mapping wins on a name collision
    const opaqueTable = `table_${tableLetter(i)}`;
    toOpaque.set(table.tableName, opaqueTable);
    toReal.set(opaqueTable, table.tableName);
  });

  let columnIndex = 0;
  for (const table of sortedTables) {
    for (const column of table.columns ?? []) {
      if (toOpaque.has(column.name)) continue;
      columnIndex += 1;
      const opaqueColumn = `col_${columnIndex}`;
      toOpaque.set(column.name, opaqueColumn);
      toReal.set(opaqueColumn, column.name);
    }
  }

  return { toOpaque, toReal, anonymizeText: buildReplacer(toOpaque), deanonymizeText: buildReplacer(toReal) };
}

/** Fact ids are `<prefix>:<table>.<col>[.<col2>].<kind>`, sometimes with a
 * `by_<col>` segment (computeStats.ts's group-breakdown/variance-explained/
 * seasonality ids) — never a bare name standing alone as segment 0, which
 * always carries the prefix glued to the table name. `kind` segments
 * ('aggregate', 'null-structure', …) are never real names, so an unmapped
 * segment simply passes through unchanged. */
function mapIdSegments(id: string, lookup: Map<string, string>): string {
  return id
    .split('.')
    .map((segment) => {
      const prefixMatch = segment.match(ID_PREFIX_RE);
      if (prefixMatch) {
        const rest = segment.slice(prefixMatch[0].length);
        return prefixMatch[0] + (lookup.get(rest) ?? rest);
      }
      const byMatch = segment.match(/^by_(.+)$/);
      if (byMatch) return `by_${lookup.get(byMatch[1]) ?? byMatch[1]}`;
      return lookup.get(segment) ?? segment;
    })
    .join('.');
}

export function anonymizeId(id: string, mapping: OpaqueMapping): string {
  return mapIdSegments(id, mapping.toOpaque);
}

export function deanonymizeId(id: string, mapping: OpaqueMapping): string {
  return mapIdSegments(id, mapping.toReal);
}

/** `values` (data, not names) and `ref.sql` (never sent to the model — the
 * prompt builders send only `{id, statement, entities, values}`, per 08's own
 * prompt.ts) are left untouched. Everything a claim's citation check reads
 * against — id, entities, vocabulary, statement — is anonymized consistently. */
export function anonymizeFact(fact: CitableFact, mapping: OpaqueMapping): CitableFact {
  return {
    id: anonymizeId(fact.id, mapping),
    entities: fact.entities.map((e) => mapping.toOpaque.get(e) ?? e),
    values: fact.values,
    vocabulary: fact.vocabulary.map((v) => mapping.toOpaque.get(v) ?? v),
    ref: { ...fact.ref, statement: mapping.anonymizeText(fact.ref.statement) },
  };
}

export function anonymizeSlotFactTables(slotFacts: SlotFactTables, mapping: OpaqueMapping): SlotFactTables {
  const tables = {} as Record<PanelSlot, CitableFact[]>;
  const slotOf = new Map<string, PanelSlot>();
  for (const slot of Object.keys(slotFacts.tables) as PanelSlot[]) {
    tables[slot] = slotFacts.tables[slot].map((f) => anonymizeFact(f, mapping));
  }
  for (const [id, slot] of slotFacts.slotOf) slotOf.set(anonymizeId(id, mapping), slot);
  return { tables, slotOf };
}

/** Inverts a model answer produced under OPAQUE back to real names/ids before
 * `scorePanel` (which only knows real slot fact tables and PANEL-KEY.json)
 * ever sees it — the "reversible" half of this module's job. `offers` is
 * untouched: `actionId` is the deterministic ranker's own id, never a schema
 * name, so it was never anonymized in the first place. */
export function deanonymizePanelAnswer(answer: PanelAnswer, mapping: OpaqueMapping): PanelAnswer {
  const deClaim = (c: PanelClaim): PanelClaim => ({
    text: mapping.deanonymizeText(c.text),
    cites: c.cites.map((id) => deanonymizeId(id, mapping)),
  });
  return {
    header: deClaim(answer.header),
    structural: answer.structural.map(deClaim),
    quality: answer.quality.map(deClaim),
    behavioral: answer.behavioral.map(deClaim),
    offers: answer.offers,
  };
}
