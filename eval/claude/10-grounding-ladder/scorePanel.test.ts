import { describe, it, expect } from 'vitest';
import { scorePanel } from './scorePanel';
import type { PanelAnswer } from './panelSchema';
import type { PanelKeyEntry } from './buildKey';
import type { SlotFactTables } from './slotFacts';
import type { CitableFact } from '../../../src/lib/citableFacts';

// Same fixture shapes as src/lib/citableFacts.test.ts's checkCitation suite,
// reused here rather than re-derived so the entity/value extraction behaviour
// this module depends on stays proven correct at the boundary.
const VOCAB = ['titanic', 'Pclass', 'Fare', 'Cabin', 'Survived'];

const structuralFact: CitableFact = {
  id: 'fact:titanic.outlier-group:Pclass:Fare',
  entities: ['titanic', 'Pclass', 'Fare'],
  values: ['1', '1.6'],
  vocabulary: VOCAB,
  ref: { statement: '"1"\'s mean Fare is 1.6σ above the rest.', sql: '', snapshot: '', confidence: 'high', provenance: 'insight-rule' },
};

const qualityFact: CitableFact = {
  id: 'fact:titanic.null-structure:Cabin',
  entities: ['titanic', 'Cabin'],
  values: ['77'],
  vocabulary: VOCAB,
  ref: { statement: 'Cabin has 77 missing values.', sql: '', snapshot: '', confidence: 'high', provenance: 'insight-rule' },
};

const behavioralFact: CitableFact = {
  id: 'fact:titanic.correlation:Fare:Pclass',
  entities: ['titanic', 'Fare', 'Pclass'],
  values: ['0.55'],
  vocabulary: VOCAB,
  ref: { statement: 'Fare correlates with Pclass at 0.55.', sql: '', snapshot: '', confidence: 'high', provenance: 'insight-rule' },
};

const rowCountFact: CitableFact = {
  id: 'fact:titanic.rowCount',
  entities: ['titanic'],
  values: ['891'],
  vocabulary: VOCAB,
  ref: { statement: 'titanic: 891 rows.', sql: '', snapshot: '', confidence: 'high', provenance: 'schema' },
};

const slotFacts: SlotFactTables = {
  tables: { header: [rowCountFact], structural: [structuralFact], quality: [qualityFact], behavioral: [behavioralFact], offers: [] },
  slotOf: new Map([
    [rowCountFact.id, 'header'],
    [structuralFact.id, 'structural'],
    [qualityFact.id, 'quality'],
    [behavioralFact.id, 'behavioral'],
  ]),
};

const key: PanelKeyEntry = {
  header: [{ class: 'C1', assertion: 'titanic.rowCount', truth: 891, author: 'app' }],
  structural: [],
  quality: [],
  behavioral: [],
  offers: [],
  pendingHumanAuthoring: [],
};

function cleanPanel(): PanelAnswer {
  return {
    header: { text: 'titanic: 891 rows.', cites: [rowCountFact.id] },
    structural: [{ text: 'Fare for Pclass group "1" runs 1.6σ above the rest.', cites: [structuralFact.id] }],
    quality: [{ text: 'Cabin has 77 missing values.', cites: [qualityFact.id] }],
    behavioral: [{ text: 'Fare correlates with Pclass at 0.55.', cites: [behavioralFact.id] }],
    offers: [],
  };
}

describe('scorePanel — known-good panel (step 0, item 1)', () => {
  const result = scorePanel(cleanPanel(), key, slotFacts);

  it('scores zero C1 disagreements', () => {
    expect(result.c1).toEqual([]);
  });

  it('scores zero C2 rejects', () => {
    expect(result.c2).toHaveLength(3);
    expect(result.c2.every((d) => d.ok)).toBe(true);
  });

  it('scores zero C3 occurrences', () => {
    expect(result.c3).toEqual([]);
  });

  it('leaves zero C4 residue', () => {
    expect(result.c4Residue).toEqual([]);
  });
});

describe('scorePanel — known-bad panel, F1/F2/F3 each caught in class (step 0, item 2)', () => {
  it('F1 — misattribution: a real column named by inflection the cited fact never named', () => {
    const answer = cleanPanel();
    answer.structural = [{ text: 'Fares for survivors average 1.6σ higher than non-survivors.', cites: [structuralFact.id] }];
    const result = scorePanel(answer, key, slotFacts);

    const disposition = result.c2.find((d) => d.slot === 'structural')!;
    expect(disposition.ok).toBe(false);
    expect(disposition.offendingEntities).toContain('Survived');
    expect(result.c4Residue).toContainEqual({ slot: 'structural', text: answer.structural[0].text });
  });

  it('F2 — invented value: a data value the cited fact never stated', () => {
    const answer = cleanPanel();
    answer.quality = [{ text: 'Cabin has 84 missing values.', cites: [qualityFact.id] }];
    const result = scorePanel(answer, key, slotFacts);

    const disposition = result.c2.find((d) => d.slot === 'quality')!;
    expect(disposition.ok).toBe(false);
    expect(disposition.offendingValues).toContain('84');
    expect(result.c4Residue).toContainEqual({ slot: 'quality', text: answer.quality[0].text });
  });

  it('F3 — world knowledge: a claim naming a date the cited fact asserts nothing about', () => {
    const answer = cleanPanel();
    answer.behavioral = [
      { text: 'Fare correlates with Pclass, a pattern set after the Titanic sank in April 1912.', cites: [behavioralFact.id] },
    ];
    const result = scorePanel(answer, key, slotFacts);

    const disposition = result.c2.find((d) => d.slot === 'behavioral')!;
    expect(disposition.ok).toBe(false);
    expect(disposition.offendingEntities).toContain('April');
    expect(result.c4Residue).toContainEqual({ slot: 'behavioral', text: answer.behavioral[0].text });
  });
});

describe('scorePanel — header pivot under the anchor-probe DELETED condition', () => {
  it('does not flag a header that legitimately pivots to a different, correctly-cited fact', () => {
    const answer = cleanPanel();
    // The anchor (row count) fact was removed; the model substitutes a real,
    // correctly-cited claim about a different fact rather than the row count.
    answer.header = { text: 'Cabin has 77 missing values.', cites: [qualityFact.id] };
    const result = scorePanel(answer, key, slotFacts);

    expect(result.c1).toEqual([]);
  });

  it('still flags a header that pivots to a different fact but misstates its value', () => {
    const answer = cleanPanel();
    answer.header = { text: 'Cabin has 84 missing values.', cites: [qualityFact.id] };
    const result = scorePanel(answer, key, slotFacts);

    expect(result.c1.length).toBeGreaterThan(0);
  });

  it('still applies strict byte-equality when the header cites the anchor fact itself', () => {
    const answer = cleanPanel();
    answer.header = { text: 'titanic: 1247 rows.', cites: [rowCountFact.id] };
    const result = scorePanel(answer, key, slotFacts);

    expect(result.c1).toEqual([{ text: '1247', truths: ['891'] }]);
  });
});

describe('scorePanel — ISO-date C1 truth vs prose-formatted header (found 2026-07-30 via replay)', () => {
  const dateKey: PanelKeyEntry = {
    header: [
      { class: 'C1', assertion: 'product_reviews.rowCount', truth: 520, author: 'app' },
      { class: 'C1', assertion: 'product_reviews.ReviewDate.temporal-span', truth: ['2023-01-01', '2024-11-29'], author: 'app' },
    ],
    structural: [],
    quality: [],
    behavioral: [],
    offers: [],
    pendingHumanAuthoring: [],
  };
  const dateRowCountFact: CitableFact = { ...rowCountFact, id: 'fact:product_reviews.rowCount', entities: ['product_reviews'], values: ['520'] };
  const dateSpanFact: CitableFact = {
    id: 'fact:product_reviews.ReviewDate.dateRange',
    entities: ['product_reviews', 'ReviewDate'],
    values: ['2023-01-01', '2024-11-29'],
    vocabulary: VOCAB,
    ref: { statement: 'ReviewDate spans 2023-01-01 to 2024-11-29.', sql: '', snapshot: '', confidence: 'high', provenance: 'schema' },
  };
  const dateSlotFacts: SlotFactTables = {
    tables: { header: [dateRowCountFact, dateSpanFact], structural: [], quality: [], behavioral: [], offers: [] },
    slotOf: new Map([
      [dateRowCountFact.id, 'header'],
      [dateSpanFact.id, 'header'],
    ]),
  };
  const cites = [dateRowCountFact.id, dateSpanFact.id];

  it('does not flag a correct date span written in prose ("January 1, 2023")', () => {
    const answer: PanelAnswer = {
      header: { text: 'There are 520 reviews spanning from January 1, 2023 to November 29, 2024.', cites },
      structural: [],
      quality: [],
      behavioral: [],
      offers: [],
    };
    const result = scorePanel(answer, dateKey, dateSlotFacts);
    expect(result.c1).toEqual([]);
  });

  it('does not flag a correct date span echoed verbatim in ISO form (hyphens split it into digit groups)', () => {
    const answer: PanelAnswer = {
      header: { text: '520 rows spanning from 2023-01-01 to 2024-11-29.', cites },
      structural: [],
      quality: [],
      behavioral: [],
      offers: [],
    };
    const result = scorePanel(answer, dateKey, dateSlotFacts);
    expect(result.c1).toEqual([]);
  });

  it('still flags a genuinely wrong date component', () => {
    const answer: PanelAnswer = {
      header: { text: '520 reviews spanning from January 1, 2023 to December 30, 2024.', cites },
      structural: [],
      quality: [],
      behavioral: [],
      offers: [],
    };
    const result = scorePanel(answer, dateKey, dateSlotFacts);
    expect(result.c1.length).toBeGreaterThan(0);
    expect(result.c1.map((d) => d.text)).toContain('30');
  });
});

describe('scorePanel — absence phrasing and slot misassignment', () => {
  it('flags an exhaustive-absence claim as C3 regardless of whether it is true (kill criterion j)', () => {
    const answer = cleanPanel();
    answer.quality = [{ text: 'No duplicate rows detected.', cites: [qualityFact.id] }];
    const result = scorePanel(answer, key, slotFacts);

    expect(result.c3).toContainEqual({ slot: 'quality', text: 'No duplicate rows detected.' });
    // An absence claim is never counted as C4 residue even if its citation fails.
    expect(result.c4Residue).not.toContainEqual({ slot: 'quality', text: 'No duplicate rows detected.' });
  });

  it('flags a citation to a fact that belongs to a different slot (kill criterion k)', () => {
    const answer = cleanPanel();
    // Cites the structural fact from the behavioral slot.
    answer.behavioral = [{ text: 'Fare for Pclass group "1" runs 1.6σ above the rest.', cites: [structuralFact.id] }];
    const result = scorePanel(answer, key, slotFacts);

    const disposition = result.c2.find((d) => d.slot === 'behavioral')!;
    expect(disposition.slotMisassigned).toBe(true);
  });
});
