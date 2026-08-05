import { describe, it, expect } from 'vitest';
import { buildOpaqueMapping, anonymizeId, deanonymizeId, deanonymizePanelAnswer } from './opaque';
import type { TableRegistryEntry } from '../../../src/types';
import type { PanelAnswer } from './panelSchema';

function minimalTable(tableName: string, columnNames: string[]): TableRegistryEntry {
  return {
    id: tableName,
    tableName,
    datasetId: tableName,
    origin: 'sample',
    rowCount: 10,
    columnCount: columnNames.length,
    memoryBytes: 0,
    createdAt: '2026-07-26T00:00:00Z',
    sampled: false,
    columns: columnNames.map((name) => ({
      name,
      physicalType: 'VARCHAR',
      cardinality: 10,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
      semanticType: 'Categorical',
    })),
  };
}

// Declared out of name order deliberately — buildOpaqueMapping sorts tables by
// name, so this also proves the mapping doesn't depend on declaration order.
const tables = [minimalTable('weather', ['Date']), minimalTable('titanic', ['Fare', 'Pclass'])];

describe('buildOpaqueMapping', () => {
  it('assigns table_* names-sorted, not in declaration order', () => {
    const mapping = buildOpaqueMapping(tables);
    expect(mapping.toOpaque.get('titanic')).toBe('table_a');
    expect(mapping.toOpaque.get('weather')).toBe('table_b');
  });

  it('numbers columns dataset-globally across tables, not restarted per table', () => {
    const mapping = buildOpaqueMapping(tables);
    // titanic sorts first, so its columns (declaration order Fare, Pclass) are numbered first.
    expect(mapping.toOpaque.get('Fare')).toBe('col_1');
    expect(mapping.toOpaque.get('Pclass')).toBe('col_2');
    expect(mapping.toOpaque.get('Date')).toBe('col_3');
  });

  it('anonymizeText/deanonymizeText round-trip a statement naming real schema tokens', () => {
    const mapping = buildOpaqueMapping(tables);
    const statement = 'Fare for Pclass group "1" runs 1.6σ above the rest.';
    const opaque = mapping.anonymizeText(statement);
    expect(opaque).not.toContain('Fare');
    expect(opaque).not.toContain('Pclass');
    expect(mapping.deanonymizeText(opaque)).toBe(statement);
  });
});

describe('anonymizeId / deanonymizeId', () => {
  it('round-trips a prefixed fact id through opaque table/column names', () => {
    const mapping = buildOpaqueMapping(tables);
    const id = 'fact:titanic.Fare.aggregate';
    const opaque = anonymizeId(id, mapping);
    expect(opaque).toBe('fact:table_a.col_1.aggregate');
    expect(deanonymizeId(opaque, mapping)).toBe(id);
  });
});

describe('deanonymizePanelAnswer', () => {
  it('inverts a panel answer produced under opaque names/ids back to the real ones — deanonymizePanelAnswer(anonymize(x)) === x', () => {
    const mapping = buildOpaqueMapping(tables);
    const realAnswer: PanelAnswer = {
      header: { text: 'titanic: 891 rows.', cites: ['fact:titanic.rowCount'] },
      structural: [{ text: 'Fare for Pclass group "1" runs 1.6σ above the rest.', cites: ['fact:titanic.Fare.aggregate'] }],
      quality: [],
      behavioral: [],
      offers: [{ actionId: 'action-1', verb: 'Explore' }],
    };

    // What the model actually sees/emits under an OPAQUE cell: the same shape,
    // built with the mapping's own anonymize functions — never a hand-typed
    // opaque string, so this exercises the exact inverse run.ts depends on.
    const opaqueAnswer: PanelAnswer = {
      header: {
        text: mapping.anonymizeText(realAnswer.header.text),
        cites: realAnswer.header.cites.map((id) => anonymizeId(id, mapping)),
      },
      structural: realAnswer.structural.map((c) => ({
        text: mapping.anonymizeText(c.text),
        cites: c.cites.map((id) => anonymizeId(id, mapping)),
      })),
      quality: [],
      behavioral: [],
      offers: realAnswer.offers,
    };

    expect(deanonymizePanelAnswer(opaqueAnswer, mapping)).toEqual(realAnswer);
  });
});
