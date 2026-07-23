// Stage 2 of the NL→SQL pipeline (§11.1): schema-pruned prompting. The model
// sees only the tables and columns relevant to the question — never the whole
// catalog. This bundle is a *fragment of the same structural-facts substrate*
// the classifier and DSPS share (one model, two views): table + column names,
// physical types, and the classifier's semantic roles. Facts only — none of the
// dsps_version / provenance machinery, which never rides this per-turn path (D45).
//
// Relevance is symbolic and cheap (no embeddings): a table is included when its
// name or a column name is mentioned in the question, plus any table joinable to
// a matched one so the model can write the join. When nothing matches, the whole
// (typically small) schema is included — pruning needs a signal to prune on.
import type { TableRegistryEntry } from '../types';
import type { FkEdge } from './relationshipInference';

const IDENTIFIER_TOKEN = /[a-z0-9_]+/g;

/** Lowercased word tokens of the question, for name-mention matching. */
function questionTokens(question: string): Set<string> {
  return new Set(question.toLowerCase().match(IDENTIFIER_TOKEN) ?? []);
}

/** Does any table/column identifier for this table appear in the question? */
function tableIsMentioned(table: TableRegistryEntry, tokens: Set<string>): boolean {
  if (tokens.has(table.tableName.toLowerCase())) return true;
  const columns = table.columns ?? [];
  return columns.some((c) => tokens.has(c.name.toLowerCase()));
}

function renderColumn(column: { name: string; semanticType: string; physicalType: string }): string {
  return `  - ${column.name}: ${column.semanticType} (${column.physicalType})`;
}

/** One table's DDL-ish block: name, row count, and each column's role + physical type. */
function renderTable(table: TableRegistryEntry): string {
  const lines = [`Table ${table.tableName} (${table.rowCount.toLocaleString()} rows):`];
  const columns = table.columns ?? [];
  if (columns.length === 0) {
    lines.push('  - (columns not yet profiled)');
  } else {
    for (const c of columns) lines.push(renderColumn(c));
  }
  return lines.join('\n');
}

export interface PrunedSchema {
  /** The prompt fragment to hand the model — relevant tables only. */
  prompt: string;
  /** Names of the tables that survived pruning, in prompt order. */
  includedTables: string[];
}

/**
 * Build the schema-pruned prompt for a question. `edges` (optional) lets a
 * matched table pull in its FK neighbours so a join stays writable; omit it for
 * the schema-only path. Pure and offline.
 */
export function pruneSchema(
  question: string,
  tables: TableRegistryEntry[],
  edges: FkEdge[] = [],
): PrunedSchema {
  const tokens = questionTokens(question);
  const mentioned = new Set(tables.filter((t) => tableIsMentioned(t, tokens)).map((t) => t.tableName));

  // Pull in tables directly joinable to a mentioned one, so the model can express
  // the join even when the question only named one side.
  if (mentioned.size > 0) {
    for (const edge of edges) {
      if (mentioned.has(edge.childTable)) mentioned.add(edge.parentTable);
      if (mentioned.has(edge.parentTable)) mentioned.add(edge.childTable);
    }
  }

  // No signal to prune on → include everything (the small-schema / broad-question case).
  const included = mentioned.size > 0 ? tables.filter((t) => mentioned.has(t.tableName)) : tables;

  const blocks = included.map(renderTable);
  const relevantEdges = edges.filter(
    (e) => mentioned.has(e.childTable) && mentioned.has(e.parentTable),
  );
  if (relevantEdges.length > 0) {
    const rels = ['Relationships:'];
    for (const e of relevantEdges) {
      rels.push(`  - ${e.childTable}.${e.childColumn} → ${e.parentTable}.${e.parentColumn}`);
    }
    blocks.push(rels.join('\n'));
  }

  return { prompt: blocks.join('\n\n'), includedTables: included.map((t) => t.tableName) };
}
