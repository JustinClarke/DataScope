import { describe, expect, it } from 'vitest';
import type { DatasetPassport, DraftAnswer, EvidencePacket, ProbePlan } from './contracts';
import { parsePlan } from './ollama';
import { compileProbe } from './probes';
import { validateAnswer } from './validator';

const passport: DatasetPassport = {
  datasetId: 'shop',
  header: { tableCount: 2, totalRows: 13, dateRange: { min: '2024-01-01', max: '2024-02-01' } },
  tables: [
    {
      name: 'orders',
      rowCount: 10,
      candidateKeys: ['order_id'],
      duplicateRows: 0,
      columns: [
        { table: 'orders', column: 'order_id', physicalType: 'BIGINT', semanticType: 'Identifier', distinctCount: 10, nullCount: 0, min: 1, max: 10 },
        { table: 'orders', column: 'customer_id', physicalType: 'BIGINT', semanticType: 'Identifier', distinctCount: 3, nullCount: 0, min: 1, max: 3 },
        { table: 'orders', column: 'order_date', physicalType: 'DATE', semanticType: 'Temporal', distinctCount: 8, nullCount: 0, min: '2024-01-01', max: '2024-02-01' },
        { table: 'orders', column: 'amount', physicalType: 'DOUBLE', semanticType: 'Quantitative', distinctCount: 9, nullCount: 0, min: 5, max: 99 },
      ],
    },
    {
      name: 'customers',
      rowCount: 3,
      candidateKeys: ['customer_id'],
      duplicateRows: 0,
      columns: [
        { table: 'customers', column: 'customer_id', physicalType: 'BIGINT', semanticType: 'Identifier', distinctCount: 3, nullCount: 0, min: 1, max: 3 },
        { table: 'customers', column: 'country', physicalType: 'VARCHAR', semanticType: 'Categorical', distinctCount: 2, nullCount: 0, min: 'CA', max: 'US' },
      ],
    },
  ],
  relationships: [
    {
      one: { table: 'customers', column: 'customer_id' },
      many: { table: 'orders', column: 'customer_id' },
      orphanCount: 0,
    },
  ],
  quality: [],
};

function rankingProbe(): ProbePlan {
  return {
    id: 'sales_by_country',
    title: 'Sales by country',
    kind: 'ranking',
    metric: { aggregate: 'sum', column: { table: 'orders', column: 'amount' } },
    dimension: { table: 'customers', column: 'country' },
    filters: [],
    limit: 10,
  };
}

describe('typed probe compiler', () => {
  it('compiles a relationship-aware aggregate without model SQL', () => {
    const sql = compileProbe(passport, rankingProbe());
    expect(sql).toContain('LEFT JOIN "customers"');
    expect(sql).toContain('SUM(t0."amount")');
    expect(sql).toContain('GROUP BY 1');
  });

  it('fails closed for an unknown column', () => {
    const probe = rankingProbe();
    probe.dimension = { table: 'customers', column: 'imaginary' };
    expect(() => compileProbe(passport, probe)).toThrow(/unknown column/);
  });

  it('fails closed when no relationship path exists', () => {
    expect(() => compileProbe({ ...passport, relationships: [] }, rankingProbe())).toThrow(/no inferred relationship path/);
  });

  it('requires a temporal dimension for a trend', () => {
    const probe = { ...rankingProbe(), kind: 'trend' as const, timeGrain: 'month' as const };
    expect(() => compileProbe(passport, probe)).toThrow(/not temporal/);
  });
});

describe('model boundary', () => {
  it('rejects model-authored SQL instead of ignoring it', () => {
    expect(() =>
      parsePlan({
        rationale: 'try raw sql',
        sql: 'DROP TABLE orders',
        probes: [],
      }),
    ).toThrow(/unsupported fields: sql/);
  });
});

describe('claim validator', () => {
  const evidence: EvidencePacket[] = [
    {
      id: 'evidence:sales',
      title: 'Sales by country',
      sql: 'SELECT ...',
      result: { columnNames: ['label', 'value'], columnTypes: ['VARCHAR', 'DOUBLE'], rows: [['US', 125.5]], rowCount: 1, executionTimeMs: 1 },
      statement: 'Sales by country: US = 125.50; CA = 80.00',
    },
  ];

  function answer(observation: string, evidenceIds = ['evidence:sales']): DraftAnswer {
    return {
      summary: 'A grounded summary.',
      findings: [{ observation, implication: 'This may merit investigation.', evidenceIds, confidence: 'medium' }],
      presentationIdeas: [],
      transformIdeas: [],
      limits: [],
    };
  }

  it('retains a cited observation whose number is present in evidence', () => {
    const result = validateAnswer(answer('US sales are 125.50.'), evidence);
    expect(result.findings).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('normalizes comma-formatted numbers before checking evidence', () => {
    const result = validateAnswer(answer('US sales are 125.50 and not 1,000.00.'), [
      { ...evidence[0]!, statement: 'Sales by country: US = 125.50; target = 1000.00' },
    ]);
    expect(result.findings).toHaveLength(1);
  });

  it('does not mistake a visible citation label for a data number', () => {
    const result = validateAnswer(answer('US sales are 125.50 (evidence:evidence:1).'), evidence);
    expect(result.findings).toHaveLength(1);
  });

  it('rejects a fabricated number', () => {
    const result = validateAnswer(answer('US sales are 999.00.'), evidence);
    expect(result.findings).toHaveLength(0);
    expect(result.rejected[0]?.reasons[0]).toMatch(/999/);
  });

  it('rejects an unknown citation', () => {
    const result = validateAnswer(answer('US leads.', ['evidence:missing']), evidence);
    expect(result.findings).toHaveLength(0);
    expect(result.rejected[0]?.reasons[0]).toMatch(/unknown evidence/);
  });
});
