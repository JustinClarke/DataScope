import { describe, expect, it } from 'vitest';
import type { ClassifiedColumn, SemanticType, TableRegistryEntry } from '../types';
import {
  applyOverrides,
  assembleEdges,
  buildContainmentSql,
  buildParentKeySql,
  comparisonModeFor,
  generateCandidates,
  nameAgrees,
  parseContainmentSql,
  parseParentKeySql,
  scoreCandidate,
  type FkCandidate,
  type FkEdge,
  type ScoredCandidate,
} from './relationshipInference';

function col(
  name: string,
  semanticType: SemanticType,
  overrides: Partial<ClassifiedColumn> = {},
): ClassifiedColumn {
  return {
    name,
    semanticType,
    physicalType: 'BIGINT',
    cardinality: 100,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
    ...overrides,
  };
}

function table(
  id: string,
  tableName: string,
  columns: ClassifiedColumn[],
  rowCount = 100,
): TableRegistryEntry {
  return {
    id,
    tableName,
    datasetId: 'ds1',
    origin: 'file',
    rowCount,
    columnCount: columns.length,
    memoryBytes: 1000,
    createdAt: '2026-01-01T00:00:00.000Z',
    columns,
  };
}

function candidate(overrides: Partial<FkCandidate> = {}): FkCandidate {
  return {
    childTable: 'orders',
    childColumn: 'customer_id',
    childPhysicalType: 'BIGINT',
    parentTable: 'customers',
    parentColumn: 'id',
    parentPhysicalType: 'BIGINT',
    nameAgreement: true,
    comparison: 'numeric',
    ...overrides,
  };
}

function scored(overrides: Partial<ScoredCandidate> = {}): ScoredCandidate {
  return {
    ...candidate(),
    containment: 1,
    coverage: 1,
    parentKeyUniqueness: 1,
    ...overrides,
  };
}

describe('nameAgrees', () => {
  it('matches an exact column-name echo (customer_id on both sides)', () => {
    expect(nameAgrees('customer_id', 'customers', 'customer_id')).toBe(true);
  });

  it('matches the parent table stem (customer_id -> customers.id)', () => {
    expect(nameAgrees('customer_id', 'customers', 'id')).toBe(true);
  });

  it('matches a prefixed key against a singular table (l_partkey -> part)', () => {
    expect(nameAgrees('l_partkey', 'part', 'p_partkey')).toBe(true);
  });

  it('singularizes an -ies plural (category_id -> categories)', () => {
    expect(nameAgrees('category_id', 'categories', 'id')).toBe(true);
  });

  it('does not match a coincidental dense key with no name link', () => {
    expect(nameAgrees('session_id', 'customers', 'id')).toBe(false);
  });
});

describe('comparisonModeFor', () => {
  it('compares two integers numerically', () => {
    expect(comparisonModeFor('BIGINT', 'INTEGER')).toBe('numeric');
  });

  it('compares two strings as strings', () => {
    expect(comparisonModeFor('VARCHAR', 'VARCHAR')).toBe('string');
  });

  it('bridges string vs int numerically (recovers zero-padded keys)', () => {
    expect(comparisonModeFor('VARCHAR', 'BIGINT')).toBe('numeric');
  });

  it('rejects temporal and boolean columns as keys', () => {
    expect(comparisonModeFor('DATE', 'DATE')).toBeNull();
    expect(comparisonModeFor('BOOLEAN', 'BIGINT')).toBeNull();
  });
});

describe('generateCandidates', () => {
  const customers = table('c', 'customers', [
    col('id', 'Identifier', { cardinality: 100 }),
    col('name', 'Textual', { physicalType: 'VARCHAR', cardinality: 100 }),
  ]);
  const orders = table('o', 'orders', [
    col('order_id', 'Identifier', { cardinality: 100 }),
    col('customer_id', 'Categorical', { cardinality: 40 }),
    col('placed_on', 'Temporal', { physicalType: 'DATE' }),
  ]);

  it('proposes a FK from a type-compatible child column to a parent key', () => {
    const candidates = generateCandidates([customers, orders]);
    const match = candidates.find(
      (c) => c.childTable === 'orders' && c.childColumn === 'customer_id' && c.parentTable === 'customers' && c.parentColumn === 'id',
    );
    expect(match).toBeDefined();
    expect(match?.nameAgreement).toBe(true);
  });

  it('never targets a non-key parent column', () => {
    // A genuinely low-cardinality column is not a key, so nothing points at it.
    const lowCard = table('p', 'products', [col('category', 'Categorical', { cardinality: 3 })]);
    const cands = generateCandidates([lowCard, orders]);
    expect(cands.some((c) => c.parentTable === 'products' && c.parentColumn === 'category')).toBe(false);
  });

  it('excludes temporal columns from candidates entirely', () => {
    const candidates = generateCandidates([customers, orders]);
    expect(candidates.some((c) => c.childColumn === 'placed_on' || c.parentColumn === 'placed_on')).toBe(false);
  });

  it('never treats a near-unique float as a parent key even when the classifier calls it Identifier', () => {
    // The classifier promotes any near-unique column to Identifier, so a
    // coincidentally-unique price reads as Identifier/DOUBLE — still not a key.
    const products = table(
      'p',
      'products',
      [col('product_id', 'Identifier', { cardinality: 150 }), col('unit_price', 'Identifier', { physicalType: 'DOUBLE', cardinality: 150 })],
      150,
    );
    const items = table(
      'i',
      'order_items',
      [col('order_item_id', 'Identifier', { cardinality: 100 }), col('unit_price', 'Quantitative', { physicalType: 'DOUBLE', cardinality: 80 })],
      100,
    );
    const cands = generateCandidates([products, items]);
    expect(cands.some((c) => c.parentColumn === 'unit_price')).toBe(false);
    expect(cands.some((c) => c.parentTable === 'products' && c.parentColumn === 'product_id')).toBe(true);
  });

  it('skips a unique-key child pointing at another key when the names do not link (sequence overlap)', () => {
    const custs = table('c', 'customers', [col('customer_id', 'Identifier', { cardinality: 400 })], 400);
    const prods = table('p', 'products', [col('product_id', 'Identifier', { cardinality: 150 })], 150);
    const cands = generateCandidates([custs, prods]);
    expect(cands.some((c) => c.childColumn === 'product_id' && c.parentColumn === 'customer_id')).toBe(false);
    expect(cands.some((c) => c.childColumn === 'customer_id' && c.parentColumn === 'product_id')).toBe(false);
  });

  it('sorts name-agreeing candidates ahead of structure-only ones', () => {
    const flags = generateCandidates([customers, orders]).map((c) => c.nameAgreement);
    const firstFalse = flags.indexOf(false);
    if (firstFalse !== -1) expect(flags.slice(firstFalse).every((f) => !f)).toBe(true);
  });
});

describe('SQL builders', () => {
  it('parent-key SQL uses an exact distinct count, not an approximate one', () => {
    const sql = buildParentKeySql('customers', 'id');
    expect(sql).toContain('count(DISTINCT "id")');
    expect(sql).not.toMatch(/approx/i);
  });

  it('containment SQL row-weights via a left semi-join and normalizes numerically', () => {
    const sql = buildContainmentSql(candidate({ comparison: 'numeric' }));
    expect(sql).toContain('LEFT JOIN');
    expect(sql).toContain('TRY_CAST("customer_id" AS DOUBLE)');
    expect(sql).toContain('TRY_CAST("id" AS DOUBLE)');
    expect(sql).toContain('child_matched');
  });

  it('containment SQL trims strings when both sides are string keys', () => {
    const sql = buildContainmentSql(candidate({ comparison: 'string', childColumn: 'sku', parentColumn: 'sku' }));
    expect(sql).toContain('TRIM(CAST("sku" AS VARCHAR))');
  });

  it('parses probe rows into numbers', () => {
    expect(parseParentKeySql({ non_null: 100n, distinct_ct: 100n })).toEqual({ nonNull: 100, distinctCt: 100, uniqueness: 1 });
    expect(parseContainmentSql({ child_non_null: 90, child_matched: 81, distinct_referenced: 40 })).toEqual({
      childNonNull: 90,
      childMatched: 81,
      distinctReferenced: 40,
    });
  });
});

describe('scoreCandidate', () => {
  const key = { nonNull: 100, distinctCt: 100, uniqueness: 1 };

  it('rejects a parent that is not a near-unique key', () => {
    const notKey = { nonNull: 100, distinctCt: 50, uniqueness: 0.5 };
    expect(scoreCandidate(candidate(), { childNonNull: 100, childMatched: 100, distinctReferenced: 50 }, notKey)).toBeNull();
  });

  it('rejects an all-null child column', () => {
    expect(scoreCandidate(candidate(), { childNonNull: 0, childMatched: 0, distinctReferenced: 0 }, key)).toBeNull();
  });

  it('rejects too little overlap (below the containment floor)', () => {
    expect(scoreCandidate(candidate(), { childNonNull: 100, childMatched: 20, distinctReferenced: 10 }, key)).toBeNull();
  });

  it('scores a clean match with row-weighted containment and coverage', () => {
    const result = scoreCandidate(candidate(), { childNonNull: 100, childMatched: 100, distinctReferenced: 80 }, key);
    expect(result?.containment).toBe(1);
    expect(result?.coverage).toBe(0.8);
  });

  it('rejects a structure-only candidate that covers too little of the parent key (quantity in an id range)', () => {
    const bigKey = { nonNull: 400, distinctCt: 400, uniqueness: 1 };
    const c = candidate({ nameAgreement: false, childColumn: 'quantity' });
    expect(scoreCandidate(c, { childNonNull: 3487, childMatched: 3487, distinctReferenced: 5 }, bigKey)).toBeNull();
  });

  it('keeps a structure-only candidate with real parent coverage (a renamed FK survives as a dashed candidate)', () => {
    const bigKey = { nonNull: 400, distinctCt: 400, uniqueness: 1 };
    const c = candidate({ nameAgreement: false, childColumn: 'cust' });
    const result = scoreCandidate(c, { childNonNull: 1400, childMatched: 1400, distinctReferenced: 380 }, bigKey);
    expect(result).not.toBeNull();
    expect(result?.coverage).toBeCloseTo(0.95);
  });
});

describe('assembleEdges', () => {
  it('marks a name-agreeing full-containment edge confident (solid)', () => {
    const [edge] = assembleEdges([scored({ nameAgreement: true, containment: 1 })]);
    expect(edge.confidence).toBe('confident');
    expect(edge.evidence).toContain('100% of `orders.customer_id`');
  });

  it('marks a structure-only match (no name link) a dashed candidate even at full containment', () => {
    const [edge] = assembleEdges([
      scored({ childColumn: 'session_id', nameAgreement: false, containment: 1 }),
    ]);
    expect(edge.confidence).toBe('candidate');
  });

  it('degrades an orphan-bearing named edge to candidate (not dropped), confidence shown reduced', () => {
    const [edge] = assembleEdges([scored({ nameAgreement: true, containment: 0.8 })]);
    expect(edge.confidence).toBe('candidate');
    expect(edge.confidenceScore).toBe(0.8);
  });

  it('keeps one edge per child column and records a near-tied runner-up as ambiguity', () => {
    const edges = assembleEdges([
      scored({ parentTable: 'customers', parentColumn: 'id', containment: 1, nameAgreement: false }),
      scored({ parentTable: 'sessions', parentColumn: 'id', containment: 0.99, nameAgreement: false }),
    ]);
    expect(edges).toHaveLength(1);
    expect(edges[0].ambiguity).toBeDefined();
    expect(edges[0].ambiguity?.parentTable).toBe('sessions');
  });

  it('orders confident edges before candidates', () => {
    const edges = assembleEdges([
      scored({ childTable: 'a', childColumn: 'x', nameAgreement: false, containment: 1 }),
      scored({ childTable: 'b', childColumn: 'y', nameAgreement: true, containment: 1 }),
    ]);
    expect(edges[0].confidence).toBe('confident');
  });
});

describe('applyOverrides', () => {
  const inferred: FkEdge[] = assembleEdges([scored({ nameAgreement: true, containment: 1 })]);
  const live = ['orders', 'customers', 'sessions'];

  it('drops a removed edge', () => {
    const result = applyOverrides(inferred, { removed: ['orders.customer_id'], repointed: {}, added: [] }, live);
    expect(result).toHaveLength(0);
  });

  it('re-points an edge to a user-chosen parent and marks it manual', () => {
    const result = applyOverrides(
      inferred,
      { removed: [], repointed: { 'orders.customer_id': { parentTable: 'sessions', parentColumn: 'id' } }, added: [] },
      live,
    );
    expect(result[0].parentTable).toBe('sessions');
    expect(result[0].source).toBe('manual');
  });

  it('adds a manual edge', () => {
    const result = applyOverrides(
      [],
      { removed: [], repointed: {}, added: [{ childTable: 'orders', childColumn: 'sku', parentTable: 'customers', parentColumn: 'id' }] },
      live,
    );
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('manual');
    expect(result[0].evidence).toBe('Set manually');
  });

  it('prunes overrides that reference a table no longer registered', () => {
    const result = applyOverrides(
      [],
      { removed: [], repointed: {}, added: [{ childTable: 'orders', childColumn: 'sku', parentTable: 'ghost', parentColumn: 'id' }] },
      live,
    );
    expect(result).toHaveLength(0);
  });

  it('applies a re-point on a child column that had no inferred edge', () => {
    const result = applyOverrides(
      [],
      { removed: [], repointed: { 'orders.region_id': { parentTable: 'customers', parentColumn: 'id' } }, added: [] },
      live,
    );
    expect(result).toHaveLength(1);
    expect(result[0].childColumn).toBe('region_id');
  });
});
