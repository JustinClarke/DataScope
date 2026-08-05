import { describe, expect, it } from 'vitest';
import type { DatasetPassport, ProbeCandidate } from './contracts';
import { candidateCacheKey, COMPILER_VERSION, datasetContentHash, EvidenceCache } from './cache';

const passportA: DatasetPassport = {
  datasetId: 'ecommerce',
  header: { tableCount: 1, totalRows: 10, dateRange: null },
  tables: [],
  relationships: [],
  quality: [],
};
const passportB: DatasetPassport = { ...passportA, header: { ...passportA.header, totalRows: 11 } };

const candidate: ProbeCandidate = {
  id: 'monthly-revenue',
  kind: 'time_series',
  metric: { kind: 'sum', column: { table: 'order_items', column: 'quantity' } },
  filters: [],
  maxResultRows: 100,
  estimatedCostClass: 'medium',
  questionRelevance: ['understand-ecommerce'],
  topicTags: ['time', 'monthly', 'value'],
  resolution: { mode: 'plan', plan: { id: 'monthly-revenue', metric: { kind: 'sum', column: { table: 'order_items', column: 'quantity' } }, filters: [], maxRows: 100 } },
};

describe('cache identity (§ dataset content hash + normalized candidate definition + compiler version)', () => {
  it('is stable for the same passport and changes when the dataset content changes', () => {
    expect(datasetContentHash(passportA)).toBe(datasetContentHash({ ...passportA }));
    expect(datasetContentHash(passportA)).not.toBe(datasetContentHash(passportB));
  });

  it('changes the cache key when any of dataset hash, candidate definition, or compiler version changes', () => {
    const base = candidateCacheKey({ datasetHash: datasetContentHash(passportA), candidate });
    expect(candidateCacheKey({ datasetHash: datasetContentHash(passportA), candidate })).toBe(base);
    expect(candidateCacheKey({ datasetHash: datasetContentHash(passportB), candidate })).not.toBe(base);
    expect(candidateCacheKey({ datasetHash: datasetContentHash(passportA), candidate: { ...candidate, maxResultRows: 12 } })).not.toBe(base);
    expect(candidateCacheKey({ datasetHash: datasetContentHash(passportA), candidate, compilerVersion: `${COMPILER_VERSION}-x` })).not.toBe(base);
  });

  it('is repeat-blind by default (Checkpoints 1-4 product-shaped identity)', () => {
    const withoutRepeat = candidateCacheKey({ datasetHash: datasetContentHash(passportA), candidate });
    const withRepeatUndefinedExplicitly = candidateCacheKey({ datasetHash: datasetContentHash(passportA), candidate, repeatId: undefined });
    expect(withRepeatUndefinedExplicitly).toBe(withoutRepeat);
  });

  it('isolates repeats when a repeatId is supplied (Checkpoint 5 only)', () => {
    const datasetHash = datasetContentHash(passportA);
    const repeat1 = candidateCacheKey({ datasetHash, candidate, repeatId: '1' });
    const repeat2 = candidateCacheKey({ datasetHash, candidate, repeatId: '2' });
    const repeatBlind = candidateCacheKey({ datasetHash, candidate });
    expect(new Set([repeat1, repeat2, repeatBlind]).size).toBe(3);
  });
});

describe('EvidenceCache', () => {
  it('reproduces byte-identical compact evidence on a hit', () => {
    const cache = new EvidenceCache();
    const key = candidateCacheKey({ datasetHash: datasetContentHash(passportA), candidate });
    const packet = {
      id: 'evidence:monthly-revenue',
      metric: 'sum(order_items.quantity)',
      unit: 'item',
      filters: [],
      completeness: 'complete' as const,
      sourceRowCount: 1,
      returnedRowCount: 1,
      rows: [{ rowId: 'r1', label: '2024-01-01', value: 10 }],
    };
    expect(cache.has(key)).toBe(false);
    cache.set(key, packet);
    expect(cache.has(key)).toBe(true);
    expect(JSON.stringify(cache.get(key))).toBe(JSON.stringify(packet));
    expect(cache.size).toBe(1);
  });
});
