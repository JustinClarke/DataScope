// Merges computed statistics (computeStats.ts) with the existing insight-rule
// fact table (src/lib/citableFacts.ts) into one addressable CitableFact[], and
// selects the exemplar rows §1/§1a of 08-computed-facts-with-data.md specify —
// the modal row plus the rows outlier detection already flagged, never a
// random/stratified sample. Also enforces the inertness rule (§1a, load-bearing):
// a candidate exemplar row is dropped, not sent, if any of its non-textual
// cell values isn't already covered by some ComputedFact's value set — an
// exemplar row must never be able to tell the model something the fact table
// doesn't already say.
//
// Scope note on "every value" (§1a's own wording): checked here means every
// Quantitative/Categorical/Identifier cell — the shapes `checkCitation`'s
// `extractValues`/`extractEntities` can actually pick up as a citable-looking
// mention. Free-text (Textual) and Temporal cells are exempt: a person's name
// or a raw date string is not a value shape the citation mechanism polices,
// and gating on those would drop every row unconditionally, which is not what
// the rule is protecting against (see the module's own inertness-rule note).
import { quoteIdentifier } from '../../src/services/ingestion';
import { buildCitableFacts, type CitableFact } from '../../src/lib/citableFacts';
import type { TableInsights } from '../../src/lib/insights';
import type { QueryResult, TableRegistryEntry } from '../../src/types';
import type { EvalEngine } from '../duckdb/duckdb';
import type { ComputedFact } from './computeStats';

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

function computedFactToCitable(fact: ComputedFact, vocabulary: string[], snapshot: string): CitableFact {
  return {
    id: fact.id,
    entities: fact.entities,
    values: fact.values.map(String),
    vocabulary,
    ref: {
      statement: fact.statement,
      sql: fact.sql,
      snapshot,
      confidence: 'high',
      // No `ComputedFact` provenance tag exists in the product's FactProvenance
      // union (insight-rule | schema) — 'schema' is the nearer fit: a computed
      // stat is a deterministic read off the dataset, not a ranked heuristic.
      provenance: 'schema',
    },
  };
}

/**
 * Merges 03's insight-derived facts with 08's computed statistics into one
 * addressable table. Both are `CitableFact`-shaped, so both flow through the
 * same `checkCitation`/`checkCitationWithClosure`. On an id collision (should
 * not occur — the two builders use disjoint id prefixes, `fact:` vs `stat:`)
 * the computed-stats version wins, since it carries real SQL provenance.
 */
export function buildEnrichedCitableFacts(
  tables: TableRegistryEntry[],
  tableInsights: TableInsights[],
  computedStats: ComputedFact[],
): CitableFact[] {
  const vocabulary = buildVocabulary(tables);
  const snapshot = latestSnapshot(tables);
  const merged = new Map<string, CitableFact>();
  for (const f of buildCitableFacts(tables, tableInsights)) merged.set(f.id, f);
  for (const f of computedStats) merged.set(f.id, computedFactToCitable(f, vocabulary, snapshot));
  return [...merged.values()];
}

function rowObject(result: QueryResult): Record<string, unknown> | null {
  const row = result.rows[0];
  if (!row) return null;
  return Object.fromEntries(result.columnNames.map((name, i) => [name, row[i]]));
}

async function pickModalRow(
  engine: EvalEngine,
  table: TableRegistryEntry,
  facts: ComputedFact[],
): Promise<Record<string, unknown> | null> {
  const t = quoteIdentifier(table.tableName);
  const modalFact = facts.find(
    (f) => f.entities[0] === table.tableName && ((f.kind === 'concentration' && !f.id.endsWith('.pareto')) || f.kind === 'dead-column'),
  );
  if (modalFact) {
    const col = modalFact.entities[1];
    const value = String(modalFact.values[0]).replace(/'/g, "''");
    const result = await engine.execute(`SELECT * FROM ${t} WHERE ${quoteIdentifier(col)} = '${value}' LIMIT 1`);
    const row = rowObject(result);
    if (row) return row;
  }
  return rowObject(await engine.execute(`SELECT * FROM ${t} LIMIT 1`));
}

async function pickOutlierRows(
  engine: EvalEngine,
  table: TableRegistryEntry,
  facts: ComputedFact[],
  cap: number,
): Promise<Record<string, unknown>[]> {
  const t = quoteIdentifier(table.tableName);
  const outlierFacts = facts
    .filter((f) => f.entities[0] === table.tableName && f.kind === 'outlier')
    .slice(0, cap);
  const rows: Record<string, unknown>[] = [];
  for (const fact of outlierFacts) {
    const col = fact.entities[1];
    const result = await engine.execute(`SELECT * FROM ${t} ORDER BY ${quoteIdentifier(col)} DESC LIMIT 1`);
    const row = rowObject(result);
    if (row) rows.push(row);
  }
  return rows;
}

const COVERAGE_TOLERANCE_RELATIVE = 0.02;
const COVERAGE_TOLERANCE_ABSOLUTE = 0.5;

/** True when `value` matches some value in `facts`' combined value set — a
 * loose-but-bounded numeric tolerance (mirrors `closureRules.ts`'s own
 * rounding allowance) plus exact case-insensitive string match. */
function isCoveredByFacts(value: unknown, facts: ComputedFact[]): boolean {
  const asNum = Number(value);
  const asStr = String(value).toLowerCase().trim();
  const numeric = Number.isFinite(asNum);
  for (const fact of facts) {
    for (const v of fact.values) {
      if (numeric && typeof v === 'number') {
        if (Math.abs(v - asNum) <= Math.max(COVERAGE_TOLERANCE_ABSOLUTE, Math.abs(v) * COVERAGE_TOLERANCE_RELATIVE)) return true;
      }
      if (String(v).toLowerCase().trim() === asStr) return true;
    }
  }
  return false;
}

export interface InertnessCheck {
  ok: boolean;
  uncovered: string[];
}

/** Kill criterion (f)'s precondition, applied at selection time rather than
 * only after the fact: every Quantitative/Categorical/Identifier cell in
 * `row` must already be covered by some computed fact's value set, or the
 * row never gets a chance to leak an uncitable statistic in the first place. */
export function checkInertness(
  row: Record<string, unknown>,
  table: TableRegistryEntry,
  facts: ComputedFact[],
): InertnessCheck {
  const uncovered: string[] = [];
  for (const col of table.columns ?? []) {
    if (col.semanticType === 'Textual' || col.semanticType === 'Temporal') continue;
    const value = row[col.name];
    if (value === null || value === undefined) continue;
    if (!isCoveredByFacts(value, facts)) uncovered.push(`${col.name}=${String(value)}`);
  }
  return { ok: uncovered.length === 0, uncovered };
}

export interface ExemplarRow {
  table: string;
  reason: 'modal' | 'outlier';
  row: Record<string, unknown>;
}

export interface ExemplarSelection {
  rows: ExemplarRow[];
  /** Candidates the inertness rule rejected — reported, not silently discarded
   * (kill criterion f is exactly what this measures the price of). */
  dropped: Array<{ table: string; reason: ExemplarRow['reason']; uncovered: string[] }>;
}

const MAX_OUTLIER_ROWS_PER_TABLE = 2;

/** Selects exemplar rows per §1a: the modal row (what boring looks like here)
 * and the rows outlier detection flagged — never a random/stratified sample —
 * then drops any candidate the inertness rule rejects. */
export async function selectExemplarRows(
  engine: EvalEngine,
  tables: TableRegistryEntry[],
  facts: ComputedFact[],
): Promise<ExemplarSelection> {
  const rows: ExemplarRow[] = [];
  const dropped: ExemplarSelection['dropped'] = [];

  for (const table of tables) {
    const modal = await pickModalRow(engine, table, facts);
    if (modal) {
      const check = checkInertness(modal, table, facts);
      if (check.ok) rows.push({ table: table.tableName, reason: 'modal', row: modal });
      else dropped.push({ table: table.tableName, reason: 'modal', uncovered: check.uncovered });
    }

    for (const row of await pickOutlierRows(engine, table, facts, MAX_OUTLIER_ROWS_PER_TABLE)) {
      const check = checkInertness(row, table, facts);
      if (check.ok) rows.push({ table: table.tableName, reason: 'outlier', row });
      else dropped.push({ table: table.tableName, reason: 'outlier', uncovered: check.uncovered });
    }
  }

  return { rows, dropped };
}

/** Renders surviving exemplar rows as a markdown table per table, prefixed by
 * the non-citable disclaimer §2 of the doc specifies — formatted separately
 * from the fact table so the prompt's two sections are visually distinct. */
export function formatSampleContext(selection: ExemplarSelection): string {
  if (selection.rows.length === 0) return '';
  const byTable = new Map<string, ExemplarRow[]>();
  for (const r of selection.rows) {
    (byTable.get(r.table) ?? byTable.set(r.table, []).get(r.table)!).push(r);
  }

  const sections: string[] = [
    'SAMPLE ROWS (context for understanding the domain only — do NOT derive',
    'statistics, counts, percentages, or trends from these rows; cite only the',
    'computed facts above):',
  ];
  for (const [table, tableRows] of byTable) {
    const columns = Object.keys(tableRows[0].row);
    sections.push(`\n${table}:`);
    sections.push(`| ${columns.join(' | ')} |`);
    sections.push(`| ${columns.map(() => '---').join(' | ')} |`);
    for (const r of tableRows) {
      sections.push(`| ${columns.map((c) => String(r.row[c] ?? '')).join(' | ')} |`);
    }
  }
  return sections.join('\n');
}
