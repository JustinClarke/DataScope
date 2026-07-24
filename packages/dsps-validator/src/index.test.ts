import { describe, expect, it } from 'vitest';
import { DSPS_VERSION, parseDsps, validateDsps, type DspsDocument } from './index';

function sampleDoc(overrides: Partial<DspsDocument> = {}): DspsDocument {
  return {
    dspsVersion: DSPS_VERSION,
    generatedAt: '2026-07-23T00:00:00.000Z',
    tables: [
      {
        tableName: 'orders',
        rowCount: 100,
        columnCount: 2,
        columns: [
          { name: 'order_id', semanticType: 'identifier', physicalType: 'BIGINT', nullPercentage: 0, cardinality: 100 },
          { name: 'total', semanticType: 'currency', physicalType: 'DOUBLE', nullPercentage: 1.2, cardinality: 87 },
        ],
      },
    ],
    insights: [
      {
        tableName: 'orders',
        rule: 'high-uniqueness',
        description: 'order_id is 99.8% unique with 4 nulls',
        provenance: 'derived-this-run',
        snapshot: { date: '2026-07-23T00:00:00.000Z', fileHash: 'ab12cd34' },
      },
    ],
    ...overrides,
  };
}

describe('validateDsps', () => {
  it('accepts a well-formed document with relationships', () => {
    const doc = sampleDoc({
      relationships: [
        {
          childTable: 'orders',
          childColumn: 'customer_id',
          parentTable: 'customers',
          parentColumn: 'id',
          confidence: 'confident',
          containment: 0.98,
          evidence: 'containment check',
        },
      ],
    });
    expect(validateDsps(doc)).toEqual({ valid: true, errors: [] });
  });

  it('accepts a document with relationships omitted — the D24 schema-only cut path', () => {
    const doc = sampleDoc();
    expect('relationships' in doc).toBe(false);
    expect(validateDsps(doc)).toEqual({ valid: true, errors: [] });
  });

  it('accepts a null fileHash — a sampled-tier file never fully buffered for hashing', () => {
    const doc = sampleDoc();
    doc.insights[0].snapshot.fileHash = null;
    expect(validateDsps(doc)).toEqual({ valid: true, errors: [] });
  });

  it('tolerates an unknown extra field — forward-compatible read (D37)', () => {
    const doc = { ...sampleDoc(), fromTheFuture: true };
    expect(validateDsps(doc)).toEqual({ valid: true, errors: [] });
  });

  it('rejects a missing tables array', () => {
    const doc = sampleDoc();
    // @ts-expect-error deliberately malformed for the test
    delete doc.tables;
    const result = validateDsps(doc);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tables must be an array');
  });

  it('rejects an invalid provenance tag', () => {
    const doc = sampleDoc();
    // @ts-expect-error deliberately malformed for the test
    doc.insights[0].provenance = 'verified';
    const result = validateDsps(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('provenance'))).toBe(true);
  });

  it('rejects a non-object input', () => {
    expect(validateDsps(null).valid).toBe(false);
    expect(validateDsps('a string').valid).toBe(false);
    expect(validateDsps([1, 2, 3]).valid).toBe(false);
  });
});

describe('parseDsps', () => {
  it('round-trips a well-formed document through JSON serialization', () => {
    const doc = sampleDoc();
    const roundTripped = JSON.parse(JSON.stringify(doc));
    const result = parseDsps(roundTripped);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toEqual(doc);
  });

  it('reports the seen version rather than failing opaquely on a major-version mismatch', () => {
    const result = parseDsps(sampleDoc({ dspsVersion: '2.0.0' }));
    expect(result).toMatchObject({ ok: false, seenVersion: '2.0.0' });
  });

  it('reports "unversioned" when dspsVersion is missing entirely', () => {
    const doc = sampleDoc() as unknown as Record<string, unknown>;
    delete doc.dspsVersion;
    const result = parseDsps(doc);
    expect(result).toMatchObject({ ok: false, seenVersion: 'unversioned' });
  });

  it('accepts a newer minor/patch within the same major (forward-compatible)', () => {
    const result = parseDsps(sampleDoc({ dspsVersion: '1.9.9' }));
    expect(result.ok).toBe(true);
  });
});
