import { describe, expect, it } from 'vitest';
import { computeColumns, layoutColumns, orderColumns } from './layout';
import type { FkEdge } from '../../lib/relationshipInference';

let nextId = 0;
function edge(childTable: string, parentTable: string, confidence: FkEdge['confidence'] = 'confident'): FkEdge {
  return {
    id: `e${++nextId}`,
    childTable,
    childColumn: `${parentTable}_id`,
    parentTable,
    parentColumn: 'id',
    containment: 1,
    coverage: 1,
    parentKeyUniqueness: 1,
    nameAgreement: true,
    confidence,
    confidenceScore: 100,
    evidence: 'test fixture',
    source: 'inferred',
  };
}

describe('computeColumns', () => {
  it('places a single table with no edges in one column', () => {
    expect(computeColumns(['orders'], [])).toEqual([['orders']]);
  });

  it('layers a linear FK chain by longest-path depth, child left / referenced-parent right', () => {
    const edges = [edge('orders', 'customers'), edge('customers', 'regions')];
    expect(computeColumns(['orders', 'customers', 'regions'], edges)).toEqual([
      ['orders'],
      ['customers'],
      ['regions'],
    ]);
  });

  it('takes the longer of two available parent paths', () => {
    // x -> y -> z and x -> z directly: x's longest path is via y (depth 2), not the direct edge (depth 1).
    const edges = [edge('x', 'y'), edge('y', 'z'), edge('x', 'z')];
    const columns = computeColumns(['x', 'y', 'z'], edges);
    expect(columns).toEqual([['x'], ['y'], ['z']]);
  });

  it('terminates on a self-referencing FK without throwing or looping', () => {
    const edges = [edge('employees', 'employees')];
    const columns = computeColumns(['employees'], edges);
    expect(columns.flat()).toEqual(['employees']);
  });

  it('terminates on an FK cycle without throwing or looping', () => {
    const edges = [edge('a', 'b'), edge('b', 'a')];
    const columns = computeColumns(['a', 'b'], edges);
    expect(columns.flat().sort()).toEqual(['a', 'b']);
  });

  it('never drops or duplicates a table across columns', () => {
    const tableNames = ['a', 'b', 'c', 'd', 'e'];
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('d', 'c'), edge('e', 'd')];
    const columns = computeColumns(tableNames, edges);
    expect(columns.flat().sort()).toEqual([...tableNames].sort());
  });
});

describe('orderColumns', () => {
  // Matches the signed-off hallmark mock's sample schema/edges exactly
  // (dataset-map.html, formerly _misc/ideation/hallmark/, deleted post-v0.69)
  // — same six tables, same six edges, so this fixture is the actual
  // reference case, not an invented one.
  const edges = [
    edge('ratings', 'users'),
    edge('ratings', 'movies'),
    edge('tags', 'users'),
    edge('tags', 'movies', 'candidate'),
    edge('movie_genres', 'movies'),
    edge('movie_genres', 'genres'),
  ];

  it('reorders each column by neighbor barycenter under a frozen per-pass snapshot, matching the mock algorithm exactly', () => {
    // This table iteration order is deliberately not already barycenter-sorted,
    // so the reorder is visibly exercised rather than a no-op.
    const tableNames = ['movies', 'genres', 'users', 'ratings', 'tags', 'movie_genres'];
    const naive = computeColumns(tableNames, edges);
    expect(naive).toEqual([
      ['ratings', 'tags', 'movie_genres'],
      ['movies', 'genres', 'users'],
    ]);

    const ordered = orderColumns(naive, edges);
    expect(ordered).toEqual([
      ['movie_genres', 'ratings', 'tags'],
      ['users', 'movies', 'genres'],
    ]);

    // Same tables, same column membership — only intra-column order changes.
    expect(ordered.map((c) => [...c].sort())).toEqual(naive.map((c) => [...c].sort()));
  });

  it('is a crossing-reduction heuristic, not a guarantee — inherited as-is from the signed-off mock, not a porting bug', () => {
    // The frozen-snapshot barycenter pass can leave crossings unchanged (this
    // exact input) or even increase them (found during development on other
    // permutations of the same six tables/edges) since both columns resort
    // simultaneously off one pre-pass snapshot rather than each other's live
    // positions. Documented here so a future "let's assert it always
    // improves" change doesn't get written against a false premise.
    const tableNames = ['users', 'movies', 'genres', 'ratings', 'tags', 'movie_genres'];
    const naive = computeColumns(tableNames, edges);
    const ordered = orderColumns(naive, edges);
    expect(ordered).toEqual(naive);
  });

  it('leaves a single-column layout unchanged', () => {
    const columns = [['a', 'b', 'c']];
    expect(orderColumns(columns, [])).toEqual(columns);
  });
});

describe('layoutColumns', () => {
  it('composes computeColumns and orderColumns into one entry point', () => {
    const tableNames = ['orders', 'customers'];
    const edges = [edge('orders', 'customers')];
    expect(layoutColumns(tableNames, edges)).toEqual(orderColumns(computeColumns(tableNames, edges), edges));
  });
});
