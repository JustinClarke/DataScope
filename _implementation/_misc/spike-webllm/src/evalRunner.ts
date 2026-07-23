// D40 harness WebLLM runner (§11.4) — drives the D43-verified WebLLM engine
// against the *same* labeled question set and reference-SQL scoring the
// harness's other two providers use (app/eval/), so the "local" number is
// comparable, not a separately-invented measure. Reuses the product's real
// schema-classification + schema-prune logic (app/src/lib/*) rather than a
// second, harness-only schema builder (D58) — this file only adds the
// browser-side glue (WebLLM inference, single-shot SQL extraction) those
// modules don't provide.
//
// Single-shot, not the full tool-use loop (src/services/ai.ts `askAI`): the
// D43 spike's own criterion-B already proved plain-text SQL extraction is
// the reliable shape for this 1.5B quantized model — small models are not
// proven at structured tool-calling, so this mirrors the spike's approach
// rather than assuming tool-calling works.
import type { MLCEngineInterface } from '@mlc-ai/web-llm';
import { query, ingestCsvUrl } from './duckdb';
import { parseSummarizeResult } from '../../app/src/lib/profile';
import { classifyColumns } from '../../app/src/lib/classifier';
import { pruneSchema } from '../../app/src/lib/schemaPrune';
import type { TableRegistryEntry, QueryResult } from '../../app/src/types';
import { QUESTIONS } from '../../app/eval/dataset/questions';

const MANIFEST: { dataset: string; tableName: string; csv: string }[] = [
  { dataset: 'titanic', tableName: 'titanic', csv: '/eval-samples/titanic.csv' },
  { dataset: 'stock_prices', tableName: 'stock_prices', csv: '/eval-samples/stock_prices.csv' },
  { dataset: 'weather', tableName: 'weather', csv: '/eval-samples/weather.csv' },
  { dataset: 'product_reviews', tableName: 'product_reviews', csv: '/eval-samples/product_reviews.csv' },
  { dataset: 'ecommerce', tableName: 'customers', csv: '/eval-samples/ecommerce/customers.csv' },
  { dataset: 'ecommerce', tableName: 'products', csv: '/eval-samples/ecommerce/products.csv' },
  { dataset: 'ecommerce', tableName: 'orders', csv: '/eval-samples/ecommerce/orders.csv' },
  { dataset: 'ecommerce', tableName: 'order_items', csv: '/eval-samples/ecommerce/order_items.csv' },
];

function rowsToQueryResult(rows: Record<string, unknown>[]): QueryResult {
  const columnNames = rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    columnNames,
    columnTypes: columnNames.map(() => ''),
    rows: rows.map((r) => columnNames.map((c) => r[c])),
    rowCount: rows.length,
    executionTimeMs: 0,
  };
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function exactDistinctCounts(tableName: string, columnNames: string[]): Promise<Map<string, number>> {
  if (columnNames.length === 0) return new Map();
  const projections = columnNames.map((name, i) => `COUNT(DISTINCT ${quoteIdentifier(name)}) AS d${i}`).join(', ');
  const rows = await query(`SELECT ${projections} FROM ${quoteIdentifier(tableName)}`);
  const row = rows[0] ?? {};
  return new Map(columnNames.map((name, i) => [name, Number(row[`d${i}`] ?? 0)]));
}

async function loadDatasets(): Promise<Map<string, TableRegistryEntry[]>> {
  const byDataset = new Map<string, TableRegistryEntry[]>();
  for (const entry of MANIFEST) {
    await ingestCsvUrl(entry.csv, entry.tableName);
    const summarizeRows = await query(
      `SELECT column_name, column_type, min, max, approx_unique, avg, std, null_percentage FROM (SUMMARIZE ${quoteIdentifier(entry.tableName)})`,
    );
    const profile = parseSummarizeResult(rowsToQueryResult(summarizeRows));
    const countRows = await query(`SELECT count(*) AS n FROM ${quoteIdentifier(entry.tableName)}`);
    const rowCount = Number(countRows[0]?.n ?? 0);
    const exact = await exactDistinctCounts(entry.tableName, profile.map((p) => p.name));
    const classifyInput = profile.map((p) => ({ ...p, cardinality: exact.get(p.name) ?? p.cardinality }));
    const columns = classifyColumns(classifyInput, rowCount);
    const table: TableRegistryEntry = {
      id: entry.tableName,
      tableName: entry.tableName,
      datasetId: entry.dataset,
      origin: 'sample',
      rowCount,
      columnCount: profile.length,
      memoryBytes: 0,
      createdAt: new Date().toISOString(),
      profile,
      columns,
    };
    const list = byDataset.get(entry.dataset) ?? [];
    list.push(table);
    byDataset.set(entry.dataset, list);
  }
  return byDataset;
}

function extractSql(text: string): string {
  const fence = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  let sql = (fence ? fence[1] : text).trim();
  sql = sql.split(';')[0].trim();
  return sql;
}

function normalizeRows(rows: Record<string, unknown>[]): string {
  const round = (v: unknown) =>
    typeof v === 'number' || typeof v === 'bigint' ? Number(Number(v).toFixed(2)) : v;
  const norm = rows.map((r) => Object.values(r).map(round));
  norm.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(norm);
}

export interface WebLlmQuestionScore {
  questionId: string;
  provider: 'webllm';
  execOk: boolean;
  resultCorrect: boolean | null;
  neededRepair: false;
  repairSucceeded: null;
  attemptCount: 1;
  error?: string;
  genSql: string;
  ms: number;
}

const SYSTEM_INSTRUCTIONS =
  'You translate the user’s question into DuckDB SQL and answer it using only the ' +
  'tables below. DuckDB uses Postgres-dialect SQL: quote identifiers with "double quotes" ' +
  '(never backticks), use LIMIT (never TOP), and use || or CONCAT for strings. ' +
  'Return ONLY the SQL for a single SELECT statement, no explanation, no markdown.';

export async function runEval(
  engine: MLCEngineInterface,
  onProgress?: (i: number, total: number, questionId: string) => void,
): Promise<{ scores: WebLlmQuestionScore[] }> {
  const byDataset = await loadDatasets();
  const scores: WebLlmQuestionScore[] = [];

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    const tables = byDataset.get(q.dataset);
    if (!tables) throw new Error(`No tables loaded for dataset "${q.dataset}"`);
    const { prompt: schemaPrompt } = pruneSchema(q.question, tables, []);
    const fullPrompt = `${SYSTEM_INSTRUCTIONS}\n\n${schemaPrompt}\n\nQuestion: ${q.question}`;

    const t0 = performance.now();
    let genSql = '';
    let execOk = false;
    let resultCorrect: boolean | null = null;
    let error: string | undefined;
    try {
      const out = await engine.chat.completions.create({
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: 0,
        max_tokens: 300,
      });
      genSql = extractSql(out.choices[0]?.message?.content ?? '');
      const got = await query(genSql);
      execOk = true;
      const expected = await query(q.referenceSql);
      resultCorrect = normalizeRows(expected) === normalizeRows(got);
    } catch (e) {
      error = String(e).slice(0, 300);
    }
    const ms = performance.now() - t0;

    scores.push({
      questionId: q.id,
      provider: 'webllm',
      execOk,
      resultCorrect,
      neededRepair: false,
      repairSucceeded: null,
      attemptCount: 1,
      error,
      genSql,
      ms,
    });
    onProgress?.(i + 1, QUESTIONS.length, q.id);
  }

  return { scores };
}
