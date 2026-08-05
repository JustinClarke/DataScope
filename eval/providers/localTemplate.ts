// The "local-only, deterministic templates" baseline (§11.2 mode `local-only`
// — no LLM in the loop, D2's kill-switch path). `resolveProvider('local-only')`
// returns null in the product because the AI loop never runs in that mode;
// here the harness measures what a template-only, zero-inference floor can
// answer, so the D40 report can show the real gap an LLM closes. No repair:
// one templated guess, then a plain-language answer over whatever ran (or an
// honest "couldn't match a template" reply) — matching the product's honest
// "no provider" degradation rather than pretending to loop.
import type { AIProvider, ProviderMessage, ProviderTurn } from '../../src/types';
import { SQL_TOOL } from '../../src/services/toolLadder';
import { parseSchemaPrompt, type ParsedTable } from './schemaParse';

const AGG_PATTERNS: { re: RegExp; agg: string; wantsColumn: boolean }[] = [
  { re: /how many|count of|number of/, agg: 'COUNT(*)', wantsColumn: false },
  { re: /average|mean\b/, agg: 'AVG', wantsColumn: true },
  { re: /total|sum\b/, agg: 'SUM', wantsColumn: true },
  { re: /highest|maximum|max\b/, agg: 'MAX', wantsColumn: true },
  { re: /lowest|minimum|min\b/, agg: 'MIN', wantsColumn: true },
];

const GROUP_BY_PATTERN = /\b(?:per|each|by) ([a-z][a-z0-9 ]*?)(?:\?|$|,| with| for)/i;

/** Splits `TempHighC` / `order_date` into lowercase words for loose matching against question text. */
function columnWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function findMentionedColumn(
  question: string,
  columns: ParsedTable['columns'],
  preferQuantitative: boolean,
): ParsedTable['columns'][number] | null {
  const q = question.toLowerCase();
  const candidates = columns.filter((c) => columnWords(c.name).every((w) => q.includes(w)));
  if (candidates.length === 0) return null;
  if (preferQuantitative) {
    const numeric = candidates.find((c) => c.semanticType === 'Quantitative');
    if (numeric) return numeric;
  }
  return candidates[0];
}

function pickTable(question: string, tables: ParsedTable[]): ParsedTable {
  const q = question.toLowerCase();
  const mentioned = tables.find((t) => q.includes(t.tableName.toLowerCase()));
  return mentioned ?? tables[0];
}

/** Best-effort SQL from a fixed set of shapes: count / avg / sum / max / min, optionally grouped. Returns null when nothing matches. */
export function generateTemplateSql(question: string, tables: ParsedTable[]): string | null {
  if (tables.length === 0) return null;
  const table = pickTable(question, tables);
  const q = question.toLowerCase();

  const groupMatch = GROUP_BY_PATTERN.exec(q);
  const groupColumn = groupMatch ? findMentionedColumn(groupMatch[1], table.columns, false) : null;

  for (const pattern of AGG_PATTERNS) {
    if (!pattern.re.test(q)) continue;
    const column = pattern.wantsColumn ? findMentionedColumn(question, table.columns, true) : null;
    if (pattern.wantsColumn && !column) continue;

    const expr = pattern.wantsColumn ? `${pattern.agg}("${column!.name}")` : pattern.agg;
    if (groupColumn) {
      return `SELECT "${groupColumn.name}", ${expr} AS result FROM "${table.tableName}" GROUP BY "${groupColumn.name}"`;
    }
    return `SELECT ${expr} AS result FROM "${table.tableName}"`;
  }

  return null;
}

export function createLocalTemplateProvider(): AIProvider {
  return {
    id: 'local-template',
    async complete(messages: ProviderMessage[]): Promise<ProviderTurn> {
      const alreadyCalledTool = messages.some((m) => m.role === 'tool');
      const system = messages.find((m) => m.role === 'system');
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');

      if (alreadyCalledTool) {
        const toolResult = [...messages].reverse().find((m) => m.role === 'tool');
        return { text: toolResult ? 'Here is the result.' : "I couldn't answer that.", calls: [] };
      }

      const tables = system && system.role === 'system' ? parseSchemaPrompt(system.content) : [];
      const question = lastUser && lastUser.role === 'user' ? lastUser.content : '';
      const sql = generateTemplateSql(question, tables);

      if (!sql) {
        return { text: "This question doesn't match one of the fixed local templates (count / average / total / highest / lowest, optionally grouped).", calls: [] };
      }
      return { text: '', calls: [{ id: crypto.randomUUID(), name: SQL_TOOL, input: { sql } }] };
    },
  };
}
