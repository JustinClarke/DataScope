import type { DatasetPassport, PassportColumn } from './contracts';

/**
 * The model-facing dataset map (§ Turn 0). The passport itself is built by experiment 11's
 * unchanged `buildPassport`; this is the projection of it that a prompt may carry.
 *
 * Experiment 11's `compactPassport` is deliberately NOT used here. It emits `min`/`max` for
 * every column, and for a VARCHAR column those are verbatim cell values — the ecommerce fixture
 * produces `customers.email` min `alex.chen129@example.com`, `customers.name` min `Alex Chen`.
 * That is a sample value reaching the first prompt, which § Turn 0 forbids ("No raw rows,
 * sample values, SQL, model-authored labels, or precomputed narrative enter the first prompt")
 * and kill criterion 3 counts as raw-row leakage.
 *
 * § Turn 0 enumerates what the map may carry: "tables, fields, physical/semantic types, row
 * counts, candidate keys, inferred relationships, null counts, cardinalities, and temporal
 * ranges". Column extremes appear on that list only as temporal ranges, so `min`/`max` survive
 * on Temporal columns and nowhere else — numeric extremes are individual rows' values too.
 */
export interface DatasetMapColumn {
  name: string;
  type: string;
  semanticType: string;
  distinct: number;
  nulls: number;
  /** Temporal columns only — the authorized "temporal ranges". */
  min?: string;
  max?: string;
}

export interface DatasetMap {
  datasetId: string;
  header: DatasetPassport['header'];
  tables: Array<{
    name: string;
    rowCount: number;
    candidateKeys: string[];
    columns: DatasetMapColumn[];
  }>;
  relationships: Array<{
    one: { table: string; column: string };
    many: { table: string; column: string };
    orphanCount: number;
  }>;
  quality: DatasetPassport['quality'];
}

function mapColumn(column: PassportColumn): DatasetMapColumn {
  const base: DatasetMapColumn = {
    name: column.column,
    type: column.physicalType,
    semanticType: column.semanticType,
    distinct: column.distinctCount,
    nulls: column.nullCount,
  };
  if (column.semanticType !== 'Temporal' || column.min === null || column.max === null) return base;
  return { ...base, min: String(column.min), max: String(column.max) };
}

/**
 * Run-time guard over everything a prompt's menus carry, checked before the first model call of
 * a run. Two leaks are cheap to reintroduce and expensive to discover after scoring:
 *
 * 1. a Phase 5 question id in a card or offer, which lets the model match the asking question's
 *    id against a tag string instead of reasoning (§ Metrics and ROI, "Probe relevance");
 * 2. a non-temporal column extreme, which for a VARCHAR column is a verbatim cell value
 *    (kill criterion 3, raw-row leakage).
 *
 * Numeric extremes are skipped: `buildDatasetMap` already drops them, and their digits collide
 * with ordinary counts, so asserting on them would fail runs for no reason.
 */
export function assertPromptSurfaceClean(
  serializedMenus: string,
  passport: DatasetPassport,
  questionIds: readonly string[],
): void {
  const offenders: string[] = [];
  for (const questionId of questionIds) {
    if (serializedMenus.includes(questionId)) offenders.push(`question id ${questionId}`);
  }
  for (const table of passport.tables) {
    for (const column of table.columns) {
      if (column.semanticType === 'Temporal') continue;
      for (const extreme of [column.min, column.max]) {
        if (typeof extreme !== 'string' || Number.isFinite(Number(extreme))) continue;
        if (serializedMenus.includes(extreme)) {
          offenders.push(`${table.name}.${column.column} sample value ${JSON.stringify(extreme)}`);
        }
      }
    }
  }
  if (offenders.length > 0) throw new Error(`prompt surface leak, no model call made: ${offenders.join('; ')}`);
}

/** Pure function of the passport: no clocks, no randomness, byte-stable for a given dataset. */
export function buildDatasetMap(passport: DatasetPassport): DatasetMap {
  return {
    datasetId: passport.datasetId,
    header: passport.header,
    tables: passport.tables.map((table) => ({
      name: table.name,
      rowCount: table.rowCount,
      candidateKeys: table.candidateKeys,
      columns: table.columns.map(mapColumn),
    })),
    relationships: passport.relationships.map((relationship) => ({
      one: { table: relationship.one.table, column: relationship.one.column },
      many: { table: relationship.many.table, column: relationship.many.column },
      orphanCount: relationship.orphanCount,
    })),
    quality: passport.quality,
  };
}
