// The arm prompt-assembly layer (DESIGN.md §3, §7 "not yet built"): turns
// the profiler's already-computed, dataset-agnostic output
// (TableRegistryEntry[], DatasetFacts, per-table grain sentences,
// RollupView[]) into the actual system-prompt text for each ladder level
// A0-A3 (A4 layers `planFirstOllama.ts`'s forced-plan schema on top of A3's
// content blocks via the exported `buildA3ContentBlocks`/`assembleWithFooter`
// — A4's own response-format footer text is that file's concern, not this
// one's). Nothing here names a specific
// dataset, table, or column — every string is built from metadata already
// on TableRegistryEntry/DatasetFacts/RollupView, so the same functions
// produce a correct prompt for ecommerce, the chasm dataset, or any future
// sample dataset with zero code changes.
//
// Built after a live smoke test (BUILD_NOTES.md) found that A1's stats +
// A2's raw view SQL, pasted into the prompt with no worked usage example,
// was not enough on its own: qwen3:1.7b ignored the view and hand-rolled a
// line-grain aggregate anyway; qwen3:4b used the view but multiplied its
// rollup sum by a key column (nonsense); qwen2.5-coder:1.5b tried to filter
// the view on a column that only exists on the parent table, never joining
// back to get it. A3's synthesized worked examples exist specifically to
// close those three gaps: the "prefer the view" directive plus a worked
// direct-aggregate example targets the first; a correct `AVG(measure)`
// pattern with no extra arithmetic targets the second; a worked
// join-back-for-a-parent-filter example targets the third. Every example is
// synthesized from schema+grain metadata alone — DESIGN.md's A3 requirement
// is that it is never derived from the real eval questions.
import type { ClassifiedColumn } from '../../../src/types';
import type { TableRegistryEntry } from '../../../src/types/dataset';
import type { DatasetFacts, TableFacts } from './datasetFacts';
import type { RollupMeasureColumn, RollupView } from './profiler';

const RESPONSE_FORMAT_INSTRUCTIONS =
  'Given a question, respond with a JSON object: ' +
  '{"status":"query","sql":"...","assumptions":[...],"result_shape":"scalar"|"table"} ' +
  'or {"status":"unsupported","reason":"..."}.';

const MAX_FEWSHOT_EXAMPLES = 3;

/** Exported so planFirstOllama.ts's A4 builder can join A3's content blocks under its own plan-aware footer instead of this one — A4's schema requires a `plan` field this footer doesn't mention. */
export function assembleWithFooter(parts: readonly string[], footer: string): string {
  return `${parts.filter((p) => p.length > 0).join('\n\n')}\n\n${footer}`;
}

function assemble(parts: readonly string[]): string {
  return assembleWithFooter(parts, RESPONSE_FORMAT_INSTRUCTIONS);
}

function singularize(name: string): string {
  if (name.endsWith('ies')) return `${name.slice(0, -3)}y`;
  if (name.endsWith('ses')) return name.slice(0, -2);
  if (name.endsWith('s')) return name.slice(0, -1);
  return name;
}

function humanizeMeasureName(name: string): string {
  return name.replace(/_(sum|avg|product_sum)$/, '').replace(/_/g, ' ');
}

// ---- A0: bare DDL ----

function ddlBlock(tables: readonly TableRegistryEntry[]): string {
  const lines = tables.map((t) => `${t.tableName}(${(t.columns ?? []).map((c) => c.name).join(', ')})`);
  return `Tables:\n${lines.join('\n')}`;
}

export function buildA0Prompt(tables: readonly TableRegistryEntry[]): string {
  return assemble([ddlBlock(tables)]);
}

// ---- A1: + deterministic profile (stats + grain statements) ----

function columnStatLine(col: ClassifiedColumn, tableFacts: TableFacts | undefined): string {
  const parts = [`${col.name} (${col.physicalType}, ${col.semanticType}`];
  const categoricalValues = tableFacts?.categoricalValues[col.name];
  if (col.semanticType === 'Categorical' && categoricalValues) {
    parts.push(`, values: ${categoricalValues.join('/')}`);
  }
  const temporalRange = tableFacts?.temporalRange[col.name];
  if (col.semanticType === 'Temporal' && temporalRange) {
    parts.push(`, range: ${temporalRange[0]}..${temporalRange[1]}`);
  }
  if (col.nullPercentage) parts.push(`, ${col.nullPercentage.toFixed(1)}% null`);
  parts.push(')');
  return parts.join('');
}

function statsBlock(tables: readonly TableRegistryEntry[], facts: DatasetFacts, grainByTable: ReadonlyMap<string, string>): string {
  const blocks = tables.map((t) => {
    const cols = (t.columns ?? []).map((c) => `  ${columnStatLine(c, facts.tables[t.tableName])}`).join('\n');
    const grain = grainByTable.get(t.tableName);
    return `${t.tableName} — ${t.rowCount} rows\n${cols}${grain ? `\n  Grain: ${grain}` : ''}`;
  });
  return blocks.join('\n\n');
}

export function buildA1Prompt(
  tables: readonly TableRegistryEntry[],
  facts: DatasetFacts,
  grainByTable: ReadonlyMap<string, string>,
): string {
  return assemble([statsBlock(tables, facts, grainByTable)]);
}

// ---- A2: + auto-generated grain-correct views ----

function viewsBlock(views: readonly RollupView[]): string {
  if (views.length === 0) return '';
  const lines = views.map((v) => `${v.sql}\n-- ${v.description}`);
  return (
    'Pre-built views (already resolve fan-out correctly for you — prefer one of these over a ' +
    "hand-written GROUP BY rollup whenever it matches the question's grain):\n" +
    lines.join('\n\n')
  );
}

export function buildA2Prompt(
  tables: readonly TableRegistryEntry[],
  facts: DatasetFacts,
  grainByTable: ReadonlyMap<string, string>,
  views: readonly RollupView[],
): string {
  return assemble([statsBlock(tables, facts, grainByTable), viewsBlock(views)]);
}

// ---- A2′: + views, no profile (DESIGN.md §3 diagnostic — breaks the ladder's order-dependence) ----

export function buildA2PrimePrompt(tables: readonly TableRegistryEntry[], views: readonly RollupView[]): string {
  return assemble([ddlBlock(tables), viewsBlock(views)]);
}

// ---- A3: + schema-derived few-shot examples ----

export interface FewShotExample {
  question: string;
  sql: string;
}

function primaryMeasure(view: RollupView): RollupMeasureColumn | null {
  return (
    view.measureColumns.find((c) => c.kind === 'product_sum') ??
    view.measureColumns.find((c) => c.kind === 'sum') ??
    null
  );
}

/** First Categorical column on the parent table (excluding the join key itself) with at least one known value — a stand-in for "some attribute you'd plausibly filter on," e.g. `orders.status` or `products.category`. Returns null if the parent has no such column, in which case no join-filter example is synthesized for this view. */
function parentFilterColumn(
  parentTable: TableRegistryEntry,
  joinKeyColumn: string,
  facts: DatasetFacts,
): { name: string; value: string | number } | null {
  const parentFacts = facts.tables[parentTable.tableName];
  if (!parentFacts) return null;
  for (const col of parentTable.columns ?? []) {
    if (col.name === joinKeyColumn || col.semanticType !== 'Categorical') continue;
    const values = parentFacts.categoricalValues[col.name];
    if (values && values.length > 0) return { name: col.name, value: values[0]! };
  }
  return null;
}

/**
 * Two worked examples per view, both derived purely from view/column
 * metadata (never from the real eval questions, per DESIGN.md's A3
 * requirement): a direct aggregate over the view (teaches "use the view,
 * don't re-derive it, and don't do extra arithmetic to it"), and — when the
 * parent table has a plausible filter column — a join-back-to-parent example
 * (teaches "the view doesn't carry parent attributes; join for those").
 */
export function synthesizeFewShotExamples(
  view: RollupView,
  tables: readonly TableRegistryEntry[],
  facts: DatasetFacts,
): FewShotExample[] {
  const parentTable = tables.find((t) => t.tableName === view.parentTable);
  const examples: FewShotExample[] = [];
  const measure = primaryMeasure(view);
  const rowCountCol = view.measureColumns.find((c) => c.kind === 'row_count')!;

  if (measure) {
    examples.push({
      question: `On average, what is the total ${humanizeMeasureName(measure.name)} per ${singularize(view.parentTable)}?`,
      sql: `SELECT AVG(${measure.name}) AS result FROM ${view.viewName}`,
    });
  } else {
    examples.push({
      question: `On average, how many rows does each ${singularize(view.parentTable)} have in the underlying detail table?`,
      sql: `SELECT AVG(${rowCountCol.name}) AS result FROM ${view.viewName}`,
    });
  }

  if (parentTable) {
    const filterCol = parentFilterColumn(parentTable, view.grainColumn, facts);
    if (filterCol) {
      const measureExpr = measure ? `v.${measure.name}` : `v.${rowCountCol.name}`;
      const valueLiteral = typeof filterCol.value === 'string' ? `'${filterCol.value}'` : String(filterCol.value);
      examples.push({
        question:
          `What is the average ${measure ? humanizeMeasureName(measure.name) : humanizeMeasureName(rowCountCol.name)} ` +
          `per ${singularize(view.parentTable)}, only counting ${view.parentTable} where ${filterCol.name} = ${filterCol.value}?`,
        sql:
          `SELECT AVG(${measureExpr}) AS result FROM ${view.parentTable} p ` +
          `JOIN ${view.viewName} v ON v.${view.grainColumn} = p.${view.grainColumn} ` +
          `WHERE p.${filterCol.name} = ${valueLiteral}`,
      });
    }
  }

  return examples;
}

function fewShotBlock(views: readonly RollupView[], tables: readonly TableRegistryEntry[], facts: DatasetFacts): string {
  if (views.length === 0) return '';
  const prioritized = [...views].sort((a, b) => Number(primaryMeasure(b) !== null) - Number(primaryMeasure(a) !== null));
  const examples: FewShotExample[] = [];
  for (const view of prioritized) {
    if (examples.length >= MAX_FEWSHOT_EXAMPLES) break;
    examples.push(...synthesizeFewShotExamples(view, tables, facts));
  }
  const capped = examples.slice(0, MAX_FEWSHOT_EXAMPLES);
  if (capped.length === 0) return '';
  const lines = capped.map(
    (e, i) =>
      `Example ${i + 1}:\nQ: "${e.question}"\n` +
      `A: {"status":"query","sql":"${e.sql.replace(/"/g, '\\"')}","assumptions":[],"result_shape":"scalar"}`,
  );
  return `Worked examples (synthesized from the schema above — not from the question you'll be asked):\n${lines.join('\n\n')}`;
}

/** The stats/views/few-shot content A3 and A4 share, without either arm's response-format footer — exported so planFirstOllama.ts's A4 builder never re-derives A3's content independently (the genericity/no-drift guarantee the rest of this file relies on). */
export function buildA3ContentBlocks(
  tables: readonly TableRegistryEntry[],
  facts: DatasetFacts,
  grainByTable: ReadonlyMap<string, string>,
  views: readonly RollupView[],
): readonly string[] {
  return [statsBlock(tables, facts, grainByTable), viewsBlock(views), fewShotBlock(views, tables, facts)];
}

export function buildA3Prompt(
  tables: readonly TableRegistryEntry[],
  facts: DatasetFacts,
  grainByTable: ReadonlyMap<string, string>,
  views: readonly RollupView[],
): string {
  return assemble(buildA3ContentBlocks(tables, facts, grainByTable, views));
}
