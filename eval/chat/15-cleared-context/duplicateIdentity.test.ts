import { describe, expect, it } from 'vitest';
import { canonicalJson, computeRequestHash, computeResultHash } from './duplicateIdentity';

describe('canonicalJson', () => {
  it('is stable across construction order', () => {
    const a = canonicalJson({ b: 1, a: { d: 4, c: 3 } });
    const b = canonicalJson({ a: { c: 3, d: 4 }, b: 1 });
    expect(a).toBe(b);
  });

  it('preserves array order — arrays are not sorted', () => {
    expect(canonicalJson({ xs: [3, 1, 2] })).toBe(canonicalJson({ xs: [3, 1, 2] }));
    expect(canonicalJson({ xs: [3, 1, 2] })).not.toBe(canonicalJson({ xs: [1, 2, 3] }));
  });
});

describe('computeRequestHash', () => {
  const base = { datasetRevision: 'rev-1', operation: 'run_sql', parameters: { sql: 'select 1', limit: 10 } };

  it('is deterministic for the same logical input', () => {
    expect(computeRequestHash(base)).toBe(computeRequestHash({ ...base }));
  });

  it('is insensitive to parameter key order', () => {
    const reordered = { ...base, parameters: { limit: 10, sql: 'select 1' } };
    expect(computeRequestHash(base)).toBe(computeRequestHash(reordered));
  });

  it('changes when the dataset revision changes — a rerun after ingestion is not the same request', () => {
    expect(computeRequestHash(base)).not.toBe(computeRequestHash({ ...base, datasetRevision: 'rev-2' }));
  });

  it('changes when the operation changes', () => {
    expect(computeRequestHash(base)).not.toBe(computeRequestHash({ ...base, operation: 'sample_rows' }));
  });

  it('changes when a parameter value changes', () => {
    expect(computeRequestHash(base)).not.toBe(
      computeRequestHash({ ...base, parameters: { sql: 'select 2', limit: 10 } }),
    );
  });
});

describe('computeResultHash', () => {
  const schema = [{ name: 'id', type: 'BIGINT' }];

  it('is deterministic for the same schema and rows', () => {
    const input = { schema, rows: [[1], [2]] };
    expect(computeResultHash(input)).toBe(computeResultHash({ schema, rows: [[1], [2]] }));
  });

  it('is order-sensitive — a re-ordered unordered result does not compare equal (documented false-negative, never a false positive)', () => {
    expect(computeResultHash({ schema, rows: [[1], [2]] })).not.toBe(computeResultHash({ schema, rows: [[2], [1]] }));
  });

  it('changes when the schema changes even if the rows are identical', () => {
    const otherSchema = [{ name: 'identifier', type: 'BIGINT' }];
    expect(computeResultHash({ schema, rows: [[1]] })).not.toBe(computeResultHash({ schema: otherSchema, rows: [[1]] }));
  });
});
