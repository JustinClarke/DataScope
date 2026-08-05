import { describe, expect, it } from 'vitest';
import { candidateCacheKey } from './cache';
import { PHASE5_QUESTIONS } from '../12-verified-claims/phase5Protocol';
import { artifactStem, parseRepeatArgs, repeatId, repeatPlan, seededOrder } from './repeats';

const ids = (questions: readonly { id: string }[]): string[] => questions.map((question) => question.id);

describe('seeded question order', () => {
  it('is reproducible from the seed alone', () => {
    const first = seededOrder(PHASE5_QUESTIONS, 'checkpoint-5', 3);
    const second = seededOrder(PHASE5_QUESTIONS, 'checkpoint-5', 3);
    expect(ids(first)).toEqual(ids(second));
  });

  it('permutes rather than drops or duplicates questions', () => {
    const ordered = seededOrder(PHASE5_QUESTIONS, 'checkpoint-5', 1);
    expect([...ids(ordered)].sort()).toEqual([...ids(PHASE5_QUESTIONS)].sort());
  });

  it('gives different repeats different orders under one seed', () => {
    const orders = repeatPlan(PHASE5_QUESTIONS, 'checkpoint-5', 5).map((entry) => ids(entry.questions).join(','));
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it('gives different seeds different orders for the same repeat', () => {
    expect(ids(seededOrder(PHASE5_QUESTIONS, 'seed-a', 1))).not.toEqual(ids(seededOrder(PHASE5_QUESTIONS, 'seed-b', 1)));
  });

  it('plans one entry per repeat, numbered from one', () => {
    expect(repeatPlan(PHASE5_QUESTIONS, 'checkpoint-5', 5).map((entry) => entry.repeat)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('--repeats / --seed', () => {
  it('defaults to the Checkpoint 1-4 single repeat', () => {
    expect(parseRepeatArgs(['node', 'runActive.ts']).repeats).toBe(1);
  });

  it('reads the scored core flags', () => {
    expect(parseRepeatArgs(['node', 'runActive.ts', '--repeats=5', '--seed=abc'])).toEqual({ repeats: 5, seed: 'abc' });
  });

  it('rejects a non-positive or non-integer repeat count', () => {
    expect(() => parseRepeatArgs(['--repeats=0'])).toThrow();
    expect(() => parseRepeatArgs(['--repeats=2.5'])).toThrow();
    expect(() => parseRepeatArgs(['--repeats=five'])).toThrow();
  });
});

describe('repeat isolation', () => {
  const candidate = { id: 'monthly-revenue', kind: 'time_series' } as unknown as Parameters<typeof candidateCacheKey>[0]['candidate'];

  it('keys the cache differently for each repeat, so no repeat can read another repeat evidence', () => {
    const keys = [1, 2, 3, 4, 5].map((repeat) =>
      candidateCacheKey({ datasetHash: 'hash', candidate, repeatId: String(repeat) }),
    );
    expect(new Set(keys).size).toBe(5);
  });

  it('leaves the product-shaped repeat-blind identity intact when no repeat id is given', () => {
    expect(candidateCacheKey({ datasetHash: 'hash', candidate })).toEqual(
      candidateCacheKey({ datasetHash: 'hash', candidate }),
    );
    expect(candidateCacheKey({ datasetHash: 'hash', candidate })).not.toEqual(
      candidateCacheKey({ datasetHash: 'hash', candidate, repeatId: '1' }),
    );
  });

  it('namespaces a repeat only when the run has more than one', () => {
    expect(repeatId(1, 1)).toBeUndefined();
    expect(repeatId(3, 5)).toBe('3');
  });
});

describe('artifact naming', () => {
  it('keeps five repeats of one question from colliding in one run directory', () => {
    const stems = [1, 2, 3, 4, 5].map((repeat) => artifactStem('sales-presentation', String(repeat)));
    expect(new Set(stems).size).toBe(5);
    for (const stem of stems) expect(`${stem}-disposition.json`).toMatch(/^[a-z0-9][a-z0-9._-]*\.json$/);
  });

  it('leaves a single-repeat run name unchanged', () => {
    expect(artifactStem('sales-presentation', undefined)).toBe('sales-presentation');
  });
});
