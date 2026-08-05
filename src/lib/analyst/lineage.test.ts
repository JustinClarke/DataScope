import { describe, expect, it } from 'vitest';
import { findReferencedObjects, lineageNote, lineageOf } from './lineage';

const objects = [
  { name: 'orders' },
  { name: 'customers' },
  { name: 'big_orders', generatingSql: 'CREATE TABLE "big_orders" AS SELECT * FROM orders WHERE amount > 100' },
  { name: 'big_by_region', generatingSql: 'CREATE TABLE "big_by_region" AS SELECT region FROM big_orders JOIN customers USING (customer)' },
];

describe('findReferencedObjects', () => {
  it('matches quoted and bare identifiers, and nothing that merely contains the name', () => {
    expect(findReferencedObjects('SELECT * FROM "orders"', ['orders'])).toEqual(['orders']);
    expect(findReferencedObjects('SELECT * FROM orders', ['orders'])).toEqual(['orders']);
    expect(findReferencedObjects('SELECT * FROM orders_archive', ['orders'])).toEqual([]);
    expect(findReferencedObjects('SELECT * FROM big_orders', ['orders'])).toEqual([]);
  });

  it('returns matches sorted, so two engines and two runs agree', () => {
    expect(findReferencedObjects('SELECT * FROM zeta JOIN alpha', ['zeta', 'alpha'])).toEqual(['alpha', 'zeta']);
  });
});

describe('lineageOf', () => {
  it('reports direct inputs from the object’s own generating SQL', () => {
    expect(lineageOf('big_orders', objects).sources).toEqual(['orders']);
  });

  it('reports the objects that would be orphaned by a drop', () => {
    expect(lineageOf('big_orders', objects).dependents).toEqual(['big_by_region']);
  });

  it('gives a source table neither, since no statement produced it', () => {
    expect(lineageOf('customers', objects)).toEqual({ sources: [], dependents: ['big_by_region'] });
    expect(lineageOf('orders', objects).sources).toEqual([]);
  });

  it('stops at direct edges rather than closing transitively', () => {
    // `big_by_region` reads `big_orders`, which reads `orders` — but the
    // question a drop asks is what breaks *first*.
    expect(lineageOf('orders', objects).dependents).toEqual(['big_orders']);
  });

  it('does not report a rebuild-in-place as depending on itself', () => {
    const rebuilt = [{ name: 'x', generatingSql: 'CREATE TABLE "x" AS SELECT * FROM x' }];
    expect(lineageOf('x', rebuilt)).toEqual({ sources: [], dependents: [] });
  });

  it('is empty for an object the catalog has never heard of', () => {
    expect(lineageOf('ghost', objects)).toEqual({ sources: [], dependents: [] });
  });
});

describe('lineageNote', () => {
  it('is undefined when there is nothing factual to say', () => {
    expect(lineageNote({ sources: [], dependents: [] })).toBeUndefined();
  });

  it('states both directions without advising anything', () => {
    const note = lineageNote(lineageOf('big_orders', objects))!;
    expect(note).toContain('Derived from orders');
    expect(note).toContain('big_by_region');
    expect(note).not.toMatch(/should|try|consider/i);
  });
});
