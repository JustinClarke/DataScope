// Kill criterion (a) (08-computed-facts-with-data.md): "F1, F2 and F3 all
// rejected as unit fixtures, before any live run. This is the same gate as
// 03 — the citation mechanism is identical. If the richer fact set somehow
// weakens 03's rejection (e.g. by accidentally making a fabrication citable),
// stop and report that."
//
// Unlike 03's fixtures.test.ts (hand-built stand-in facts, no DB dependency),
// this runs the three recorded fabrications against 08's REAL enriched fact
// table — computeStats.ts + buildEnrichedCitableFacts against the actual
// titanic/weather §14 fixtures via DuckDB — because the doc's own concern is
// specifically whether 08's *richer* fact set (not 03's narrower one)
// introduces a new value/entity that would make a fabrication citable. A
// hand-built fact wouldn't test that; the real merged table does. Still fully
// local/deterministic — no Ollama dependency, runs in CI same as any other unit test.
import { describe, it, expect, beforeAll } from 'vitest';
import { createEvalEngine, type EvalEngine } from '../../duckdb/duckdb';
import { loadEvalDatasets, type EvalDataset } from '../../dataset/tables';
import {
  buildInsightProbes,
  idExclusionCandidates,
  nullPatternCandidates,
  rankInsights,
  type TableInsights,
} from '../../../src/lib/insights';
import { checkCitation, type CitableFact } from '../../../src/lib/citableFacts';
import { computeStats } from './computeStats';
import { buildEnrichedCitableFacts } from './enrichedFacts';

async function computeTableInsights(engine: EvalEngine, dataset: EvalDataset): Promise<TableInsights[]> {
  const out: TableInsights[] = [];
  for (const table of dataset.tables) {
    const columns = table.columns ?? [];
    const syntactic = [
      ...nullPatternCandidates(columns, table.tableName),
      ...idExclusionCandidates(columns, table.tableName),
    ];
    const probes = buildInsightProbes(table.tableName, columns, table.rowCount);
    const probed = await Promise.all(probes.map((p) => engine.execute(p.sql).then((r) => p.describe(r))));
    out.push({ table, insights: rankInsights([...syntactic, ...probed.flat()]) });
  }
  return out;
}

describe('kill criterion (a) — F1, F2, F3 against 08\'s real enriched fact table', () => {
  let titanicFacts: CitableFact[];
  let weatherFacts: CitableFact[];
  let engine: EvalEngine;

  beforeAll(async () => {
    engine = await createEvalEngine();
    const datasets = await loadEvalDatasets(engine);
    const titanic = datasets.find((d) => d.id === 'titanic')!;
    const weather = datasets.find((d) => d.id === 'weather')!;

    const titanicInsights = await computeTableInsights(engine, titanic);
    const titanicStats = await computeStats(engine, titanic.tables);
    titanicFacts = buildEnrichedCitableFacts(titanic.tables, titanicInsights, titanicStats);

    const weatherInsights = await computeTableInsights(engine, weather);
    const weatherStats = await computeStats(engine, weather.tables);
    weatherFacts = buildEnrichedCitableFacts(weather.tables, weatherInsights, weatherStats);

    await engine.close();
  });

  it('F1 (titanic) — real Pclass/Fare outlier-group fact still rejects a Survived misattribution (03 regression check)', () => {
    const fact = titanicFacts.find((f) => f.id === 'fact:titanic.outlier-group:Pclass:Fare');
    expect(fact).toBeDefined();
    const result = checkCitation('Fares for survivors average 1.6σ higher than non-survivors.', fact!);
    expect(result.ok).toBe(false);
    expect(result.offendingEntities).toContain('Survived');
  });

  it('F1 (titanic) — 08\'s OWN new Fare-by-Survived variance-explained fact does not make the same misattribution citable either', () => {
    const fact = titanicFacts.find((f) => f.id === 'stat:titanic.Fare.by_Survived.variance-explained');
    expect(fact).toBeDefined();
    const result = checkCitation('Fares for survivors average 1.6σ higher than non-survivors.', fact!);
    expect(result.ok).toBe(false);
    expect(result.offendingValues).toContain('1.6');
  });

  it('F2 (weather) — real dead-column fact for City rejects the invented "Manchester"', () => {
    const fact = weatherFacts.find((f) => f.id === 'stat:weather.City.dead-column');
    expect(fact).toBeDefined();
    const result = checkCitation('5 years of daily weather data in Manchester.', fact!);
    expect(result.ok).toBe(false);
    expect(result.offendingEntities).toContain('Manchester');
  });

  it('F2 (weather) — real dateRange fact (true span ~10yrs) rejects both the invented city and the wrong span', () => {
    const fact = weatherFacts.find((f) => f.id === 'fact:weather.Date.dateRange');
    expect(fact).toBeDefined();
    const result = checkCitation('5 years of daily weather data in Manchester.', fact!);
    expect(result.ok).toBe(false);
    expect(result.offendingEntities).toContain('Manchester');
    expect(result.offendingValues).toContain('5');
  });

  it('F3 (titanic) — real rowCount fact carries no date at all, rejects pure training-data recall', () => {
    const fact = titanicFacts.find((f) => f.id === 'fact:titanic.rowCount');
    expect(fact).toBeDefined();
    const result = checkCitation('This dataset covers the Titanic, which sank in April 1912.', fact!);
    expect(result.ok).toBe(false);
    expect(result.offendingEntities).toContain('April');
    expect(result.offendingValues).toContain('1912');
  });

  it('F3, alternate framing — titanic has no Temporal column, so no computed or insight fact ever states a date at all', () => {
    const anyDateFact = titanicFacts.find((f) => f.id.includes('dateRange') || f.id.includes('temporal-span'));
    expect(anyDateFact).toBeUndefined();
  });
});
