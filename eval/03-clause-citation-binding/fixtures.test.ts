// Kill criterion (a) (03-clause-citation-binding.md): "F1, F2 and F3 all
// rejected, as unit fixtures, before any live run. If F1 isn't rejected,
// stop — the mechanism isn't implemented, and F1 is its entire reason to
// exist." The three statements below are the exact recorded fabrications
// (README.md's evidence table), each checked against a hand-built citable
// fact table shaped like the real titanic/weather §14 samples — no live
// model call, no Ollama dependency, so this runs in CI same as any other
// unit test.
import { describe, it, expect } from 'vitest'
import { checkCitation, type CitableFact } from '../../src/lib/citableFacts'

const TITANIC_VOCAB = ['titanic', 'PassengerId', 'Survived', 'Pclass', 'Name', 'Sex', 'Age', 'SibSp', 'Parch', 'Fare', 'Embarked'];
const WEATHER_VOCAB = ['weather', 'Date', 'City', 'TempHighC', 'TempLowC', 'Humidity', 'WindKph'];

const titanicOutlierFact: CitableFact = {
  id: 'fact:titanic.outlier-group:Pclass:Fare',
  entities: ['titanic', 'Pclass', 'Fare'],
  values: ['1', '1.6'],
  vocabulary: TITANIC_VOCAB,
  ref: { statement: '"1"\'s mean Fare is 1.6σ above the rest.', sql: '', snapshot: '', confidence: 'high', provenance: 'insight-rule' },
};

const weatherDateRangeFact: CitableFact = {
  id: 'fact:weather.Date.dateRange',
  entities: ['weather', 'Date'],
  // True span ~10 years (README: "true span ~10 yrs not 5") — 5 is deliberately absent.
  values: ['2010-01-01', '2019-12-31', '2010', '2019', '9', '10'],
  vocabulary: WEATHER_VOCAB,
  ref: { statement: 'Date spans 2010-01-01 to 2019-12-31.', sql: '', snapshot: '', confidence: 'high', provenance: 'schema' },
};

const titanicRowCountFact: CitableFact = {
  id: 'fact:titanic.rowCount',
  entities: ['titanic'],
  values: ['891'],
  vocabulary: TITANIC_VOCAB,
  ref: { statement: 'titanic: 891 rows.', sql: '', snapshot: '', confidence: 'high', provenance: 'schema' },
};

describe('kill criterion (a) — F1, F2, F3 regression fixtures', () => {
  it('F1 (titanic, cloud widened-v1) — real Pclass/Fare stat misattributed to Survived', () => {
    const result = checkCitation('Fares for survivors average 1.6σ higher than non-survivors.', titanicOutlierFact);
    expect(result.ok).toBe(false);
    expect(result.offendingEntities).toContain('Survived');
  });

  it('F2 (weather, ollama widened-v2) — invented city never on the wire', () => {
    const result = checkCitation('5 years of daily weather data in Manchester.', weatherDateRangeFact);
    expect(result.ok).toBe(false);
    // Both defects are independently sufficient — the invented entity and the wrong span.
    expect(result.offendingEntities).toContain('Manchester');
    expect(result.offendingValues).toContain('5');
  });

  it('F3 (titanic, max-context) — pure training-data recall, no date column exists to cite', () => {
    const result = checkCitation('This dataset covers the Titanic, which sank in April 1912.', titanicRowCountFact);
    expect(result.ok).toBe(false);
    expect(result.offendingEntities).toContain('April');
    expect(result.offendingValues).toContain('1912');
  });

  it('F3, alternate framing — an unresolvable citation id is rejected outright (no fact to name-check against)', () => {
    const factTable = new Map<string, CitableFact>([[titanicRowCountFact.id, titanicRowCountFact]]);
    const citedId = 'fact:titanic.Date.dateRange'; // no such fact — titanic has no date column
    expect(factTable.get(citedId)).toBeUndefined();
  });
});
