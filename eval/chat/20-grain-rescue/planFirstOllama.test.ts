// Validates A4's prompt composition (DESIGN.md §3's "A3 + forced plan-first,
// same structured-output call"): buildA4Prompt must carry every A3 content
// block forward unchanged (stats, generated views, worked examples) under a
// footer that actually matches PLANNED_PROPOSAL_JSON_SCHEMA — not A3's own
// footer, which never mentions `plan` and would contradict the schema if
// reused verbatim. callForPlannedProposal's call/parse path is exercised
// live in BUILD_NOTES.md's smoke test, not re-tested here.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DuckDBConnection } from '@duckdb/node-api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildA3Prompt } from './armPrompts';
import { ALL_TABLE_SOURCES, bootstrapAllDatasets } from './bootstrap';
import { buildDatasetFacts, type DatasetFacts } from './datasetFacts';
import { buildA4Prompt, PLANNED_PROPOSAL_JSON_SCHEMA } from './planFirstOllama';
import { buildAllRollupViews, buildTableRegistry, describeGrain, inferEdges } from './profiler';
import type { RollupView } from './profiler';
import type { TableRegistryEntry } from '../../../src/types/dataset';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(HERE, 'runs', 'test', 'plan-first.duckdb');

describe('A4 prompt composition (buildA4Prompt)', () => {
  let conn: DuckDBConnection;
  let tables: TableRegistryEntry[];
  let facts: DatasetFacts;
  let grainByTable: Map<string, string>;
  let views: RollupView[];

  beforeAll(async () => {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    if (existsSync(DB_PATH)) rmSync(DB_PATH);
    const bootstrapped = await bootstrapAllDatasets(DB_PATH);
    conn = bootstrapped.conn;
    tables = await buildTableRegistry(conn, ALL_TABLE_SOURCES.map((s) => s.tableName));
    facts = await buildDatasetFacts(conn, tables);
    const edges = await inferEdges(conn, tables);
    views = await buildAllRollupViews(conn, edges, tables);
    grainByTable = new Map<string, string>();
    for (const t of tables) grainByTable.set(t.tableName, await describeGrain(conn, t, edges));
  }, 120_000);

  afterAll(() => conn?.closeSync());

  function ecommerceSubset() {
    const subset = tables.filter((t) => ['customers', 'products', 'orders', 'order_items'].includes(t.tableName));
    const subsetViews = views.filter((v) => v.viewName === 'order_items_rollup_by_orders' || v.viewName === 'orders_rollup_by_customers');
    return { subset, subsetViews };
  }

  it('carries A3\'s content forward unchanged: same stats, same views, same worked examples', () => {
    const { subset, subsetViews } = ecommerceSubset();
    const a3 = buildA3Prompt(subset, facts, grainByTable, subsetViews);
    const a4 = buildA4Prompt(subset, facts, grainByTable, subsetViews);
    const a3Content = a3.slice(0, a3.lastIndexOf('Given a question'));
    const a4Content = a4.slice(0, a4.lastIndexOf('Given a question'));
    expect(a4Content).toBe(a3Content);
  });

  it('replaces A3\'s response-format footer with one that names the plan field, matching PLANNED_PROPOSAL_JSON_SCHEMA', () => {
    const { subset, subsetViews } = ecommerceSubset();
    const a4 = buildA4Prompt(subset, facts, grainByTable, subsetViews);
    expect(a4).toMatch(/"plan":\{"grain".*"tables".*"filters"/);
    expect(a4).not.toContain('{"status":"query","sql":"...","assumptions":[...],"result_shape":"scalar"|"table"}'); // A3's old footer shape
  });

  it('the footer\'s advertised JSON shape actually matches the live schema\'s required fields', () => {
    const requiredFields = PLANNED_PROPOSAL_JSON_SCHEMA.oneOf[0]!.required;
    expect(requiredFields).toEqual(['status', 'plan', 'sql', 'assumptions', 'result_shape']);
    const planRequiredFields = PLANNED_PROPOSAL_JSON_SCHEMA.oneOf[0]!.properties.plan!.required;
    expect(planRequiredFields).toEqual(['grain', 'tables', 'filters']);
  });
});
