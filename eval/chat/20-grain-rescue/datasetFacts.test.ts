// Validates the dataset-facts.json generator and the premise-assertion gate
// (DESIGN.md §2) against the combined 8-table catalog — the same realistic
// "everything loaded at once" scenario BUILD_NOTES.md used to catch the
// profiler's first-match-only bug. The headline check operationalizes
// OPUS_REVIEW.md B1 directly: weather.csv is 100% City='Springfield', so a
// question premised on it being multi-city must fail this gate, not survive
// to review.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DuckDBConnection } from '@duckdb/node-api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALL_TABLE_SOURCES, bootstrapAllDatasets } from './bootstrap';
import { buildTableRegistry } from './profiler';
import { buildDatasetFacts, type DatasetFacts } from './datasetFacts';
import { assertPremises } from './premises';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(HERE, 'runs', 'test', 'dataset-facts.duckdb');

describe('dataset-facts.json generator + premise-assertion gate', () => {
  let conn: DuckDBConnection;
  let facts: DatasetFacts;

  beforeAll(async () => {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    if (existsSync(DB_PATH)) rmSync(DB_PATH);
    const bootstrapped = await bootstrapAllDatasets(DB_PATH);
    conn = bootstrapped.conn;
    const tables = await buildTableRegistry(conn, ALL_TABLE_SOURCES.map((s) => s.tableName));
    facts = await buildDatasetFacts(conn, tables);
  }, 120_000);

  afterAll(() => conn?.closeSync());

  it('reports weather.City as exactly one distinct value (Springfield) — the fact that would have caught v1 describing it as multi-city', () => {
    expect(facts.tables.weather!.categoricalValues.City).toEqual(['Springfield']);
  });

  it('reports row counts and column lists matching the raw CSVs', () => {
    expect(facts.tables.titanic!.rowCount).toBe(891);
    expect(facts.tables.titanic!.columns).toContain('Age');
    expect(facts.tables.order_items!.rowCount).toBe(3487);
  });

  it('reports a Temporal range for weather.Date covering 2015-2024, and no Temporal columns for titanic', () => {
    const [min, max] = facts.tables.weather!.temporalRange.Date!;
    expect(String(min)).toMatch(/^2015-01-01/);
    expect(String(max)).toMatch(/^2024-12-28/);
    expect(facts.tables.titanic!.temporalRange).toEqual({});
  });

  it('passes a premise that matches the data (weather has a City column, and it does take the value Springfield)', () => {
    const violations = assertPremises(facts, [
      { kind: 'column', table: 'weather', column: 'City' },
      { kind: 'categoricalValue', table: 'weather', column: 'City', value: 'Springfield' },
      { kind: 'temporalYear', table: 'weather', column: 'Date', year: 2024 },
    ]);
    expect(violations).toEqual([]);
  });

  it('rejects the v1-style false premise that weather.csv has a city other than Springfield', () => {
    const violations = assertPremises(facts, [
      { kind: 'categoricalValue', table: 'weather', column: 'City', value: 'Chicago' },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.reason).toMatch(/never takes the value 'Chicago'/);
  });

  it('rejects a year outside the temporal range, a nonexistent column, and a nonexistent table', () => {
    const violations = assertPremises(facts, [
      { kind: 'temporalYear', table: 'weather', column: 'Date', year: 2030 },
      { kind: 'column', table: 'weather', column: 'Country' },
      { kind: 'column', table: 'nope', column: 'x' },
    ]);
    expect(violations).toHaveLength(3);
    expect(violations[0]!.reason).toMatch(/does not include 2030/);
    expect(violations[1]!.reason).toMatch(/no column 'Country'/);
    expect(violations[2]!.reason).toMatch(/no such table 'nope'/);
  });
});
