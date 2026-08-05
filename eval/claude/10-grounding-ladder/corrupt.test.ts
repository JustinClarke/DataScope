import { describe, it, expect } from 'vitest';
import { pickAnchorFact, corruptFact, deleteFact, applyFactIntegrity } from './corrupt';
import type { SlotFactTables } from './slotFacts';
import type { CitableFact } from '../../../src/lib/citableFacts';

function fact(id: string, values: string[], statement: string): CitableFact {
  return { id, entities: ['titanic'], values, vocabulary: ['titanic'], ref: { statement, sql: '', snapshot: '', confidence: 'high', provenance: 'schema' } };
}

function makeTables(): SlotFactTables {
  const rowCount = fact('fact:titanic.rowCount', ['891', '891'], 'titanic: 891 rows.');
  const aggregate = fact('stat:titanic.Fare.aggregate', ['32.2'], 'Fare averages 32.2.');
  const nullStructure = fact('fact:titanic.Cabin.null-structure', ['687'], 'Cabin has 687 missing values.');
  return {
    tables: { header: [rowCount], structural: [], quality: [nullStructure], behavioral: [aggregate], offers: [] },
    slotOf: new Map([
      [rowCount.id, 'header'],
      [aggregate.id, 'behavioral'],
      [nullStructure.id, 'quality'],
    ]),
  };
}

describe('pickAnchorFact', () => {
  it('prefers a .rowCount fact over .aggregate or any other suffix', () => {
    const anchor = pickAnchorFact(makeTables());
    expect(anchor.id).toBe('fact:titanic.rowCount');
  });

  it('falls back to .aggregate when no .rowCount fact exists', () => {
    const tables = makeTables();
    tables.tables.header = [];
    tables.slotOf.delete('fact:titanic.rowCount');
    const anchor = pickAnchorFact(tables);
    expect(anchor.id).toBe('stat:titanic.Fare.aggregate');
  });

  it('throws when no facts are available to corrupt', () => {
    const empty: SlotFactTables = { tables: { header: [], structural: [], quality: [], behavioral: [], offers: [] }, slotOf: new Map() };
    expect(() => pickAnchorFact(empty)).toThrow();
  });
});

describe('corruptFact', () => {
  it('alters exactly one logical value consistently across representations, and leaves the id untouched', () => {
    const rowCount = fact('fact:titanic.rowCount', ['891', '891'], 'titanic: 891 rows.');
    const { fact: corrupted, corruption } = corruptFact(rowCount);

    expect(corrupted.id).toBe(rowCount.id);
    expect(corruption.factId).toBe(rowCount.id);
    expect(corruption.original).toBe('891');
    expect(corrupted.values[0]).not.toBe('891');
    // Both representations of the same underlying number move together.
    expect(corrupted.values[0]).toBe(corrupted.values[1]);
    expect(corrupted.ref.statement).not.toBe(rowCount.ref.statement);
    expect(corrupted.ref.statement).toContain(corruption.corrupted);
  });

  it('reproduces locale-grouped formatting on the corrupted value', () => {
    const grouped = fact('fact:x.rowCount', ['10,420'], 'x: 10,420 rows.');
    const { corruption } = corruptFact(grouped);
    expect(corruption.corrupted).toContain(',');
  });

  it('is deterministic — no RNG, so the same fact corrupts identically every time', () => {
    const rowCount = fact('fact:titanic.rowCount', ['891', '891'], 'titanic: 891 rows.');
    const a = corruptFact(rowCount);
    const b = corruptFact(rowCount);
    expect(a.corruption).toEqual(b.corruption);
  });

  it('swaps in an alternate existing value for a non-numeric (categorical) value', () => {
    const categorical = fact('fact:titanic.Embarked.top-values', ['S', 'C'], 'Embarked is most commonly S, then C.');
    const { corruption } = corruptFact(categorical);
    expect(corruption.original).toBe('S');
    expect(corruption.corrupted).toBe('C');
  });
});

describe('deleteFact', () => {
  it('removes the fact from its slot table and from slotOf, leaving other facts untouched', () => {
    const tables = makeTables();
    const result = deleteFact(tables, 'stat:titanic.Fare.aggregate');

    expect(result.tables.behavioral).toEqual([]);
    expect(result.slotOf.has('stat:titanic.Fare.aggregate')).toBe(false);
    expect(result.tables.quality).toHaveLength(1);
  });
});

describe('applyFactIntegrity', () => {
  it('TRUE is a pass-through — no anchor, no corruption, same tables reference', () => {
    const tables = makeTables();
    const result = applyFactIntegrity(tables, 'TRUE');

    expect(result.tables).toBe(tables);
    expect(result.anchorFactId).toBeUndefined();
    expect(result.corruption).toBeUndefined();
  });

  it('CORRUPTED alters the anchor fact within its own slot only, and records the corruption', () => {
    const tables = makeTables();
    const result = applyFactIntegrity(tables, 'CORRUPTED');

    expect(result.anchorFactId).toBe('fact:titanic.rowCount');
    expect(result.corruption).toBeDefined();
    const corrupted = result.tables.tables.header.find((f) => f.id === 'fact:titanic.rowCount')!;
    expect(corrupted.values).not.toEqual(['891', '891']);
    expect(result.tables.tables.quality).toEqual(tables.tables.quality);
  });

  it('DELETED removes the anchor fact from its table and from slotOf', () => {
    const tables = makeTables();
    const result = applyFactIntegrity(tables, 'DELETED');

    expect(result.anchorFactId).toBe('fact:titanic.rowCount');
    expect(result.tables.tables.header).toEqual([]);
    expect(result.tables.slotOf.has('fact:titanic.rowCount')).toBe(false);
  });
});
