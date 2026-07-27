// Addressable fact table for the clause-citation-binding synthesis candidate
// (_implementation/_misc/_ideation/ai architecture experimentation/
// 03-clause-citation-binding.md). Every deterministic fact the app already
// computed (an insight candidate, or a structural fact read off
// `StructuralFacts`) gets a stable id and an explicit entity set — the ONLY
// column/table names a claim citing it may use — so a claim can be checked
// against the one fact it names, not the dataset at large (the gap that lets
// a real statistic get attached to the wrong column). Pure, no I/O.
import type { FactRef, TableRegistryEntry } from '../types';
import type { TableInsights } from './insights';

export interface CitableFact {
  id: string;
  /** The only table/column names a claim citing this fact may name. */
  entities: string[];
  /** The only data values (numbers, category labels, dates) a claim citing this fact may state. */
  values: string[];
  /** Every table/column name in the dataset (not just this fact's own) — lets
   * the entity check recognize a real schema name wherever it's mentioned,
   * so it can tell "a real name, wrong fact" (misattribution) apart from "not
   * a real name at all" (invention). */
  vocabulary: string[];
  /** The existing seam claim-carrier this fact addresses — untouched (D45). */
  ref: FactRef;
}

// Ordinary connective English a claim may use regardless of what it cites —
// kept short and reported in the doc's Verdict per the doc's own kill
// criterion (d): "Neutral vocabulary ≤ 25 words. Above that, report it as a
// failure of the approach, not a tuning task." Case-insensitive at check time.
export const NEUTRAL_VOCABULARY: readonly string[] = [
  'row',
  'rows',
  'record',
  'records',
  'value',
  'values',
  'column',
  'columns',
  'table',
  'tables',
  'data',
  'average',
  'mean',
  'higher',
  'lower',
  'above',
  'below',
  'group',
  'groups',
  'null',
  'missing',
  'duplicate',
  'duplicates',
  'span',
  'spans',
];

function normalizeValue(raw: string): string {
  return raw
    .trim()
    .replace(/,/g, '')
    .replace(/[%σ]$/, '')
    .toLowerCase();
}

// Suffixes tried when hunting for a shared stem, longest/most-specific first
// so "survivors" strips to "surviv" via "ors" rather than misfiring on a
// shorter alternative — a cheap heuristic, not a real stemmer.
const STRIP_SUFFIXES = ['ations', 'ives', 'ions', 'ers', 'ors', 'ing', 'ive', 'ion', 'ed', 'es', 's'];

// A calendar month name naming a date the cited fact already asserts (see
// `hasDateValue` in `checkCitation`) is a temporal descriptor, not an
// invented entity — but the same word with NO date among the fact's values
// (F3: "sank in April 1912" cited against a fact with no date at all) is
// exactly the world-knowledge-injection case this mechanism exists to catch,
// so the exemption is conditional, never blanket.
const MONTH_NAMES = new Set([
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]);

// A spelled-out cardinal number ("Seven review entries") states a value just
// as much as a digit does — and unlike a digit it is invisible to the value
// regex AND exempt from the entity check when sentence-initial, so an
// invented count in word form would otherwise pass `checkCitation` cleanly
// (a live-run fabrication: "Seven" served in place of a fact's real "20").
const WORD_NUMBERS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
  eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40',
  fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90',
  hundred: '100', thousand: '1000', million: '1000000',
};

/** Every plausible root of `word` — the bare word plus one candidate per
 * suffix that could plausibly be stripped (only when at least 3 letters
 * remain). Returning a set of candidates rather than one committed stem
 * avoids the classic overstemming trap (picking "es" over "s" for "fares"
 * and mangling "fare" into "far") without needing real morphology. */
function stemCandidates(word: string): Set<string> {
  const alpha = word.toLowerCase().replace(/[^a-z]/g, '');
  const candidates = new Set<string>([alpha]);
  for (const suffix of STRIP_SUFFIXES) {
    if (alpha.endsWith(suffix) && alpha.length - suffix.length >= 3) {
      candidates.add(alpha.slice(0, -suffix.length));
    }
  }
  return candidates;
}

/** Resolves a claim word to the one real table/column name it refers to, or
 * `null` if it matches none — exact case-insensitive match first (any
 * length, so a short name like "Age" still matches its literal reuse), then
 * a shared-stem match (candidates under 4 letters are dropped, to keep short
 * words from colliding) for an inflected reference like "survivors" ->
 * "Survived". */
function resolveVocabulary(word: string, vocabulary: string[]): string | null {
  const lower = word.toLowerCase();
  for (const name of vocabulary) if (name.toLowerCase() === lower) return name;

  const wordStems = [...stemCandidates(word)].filter((s) => s.length >= 4);
  if (wordStems.length === 0) return null;
  for (const name of vocabulary) {
    const nameStems = stemCandidates(name);
    if (wordStems.some((s) => nameStems.has(s))) return name;
  }
  return null;
}

/**
 * Candidate entity mentions in `text`, resolved against the dataset's full
 * `vocabulary` (every real table/column name — not just the fact being
 * checked against). A word that resolves to a real name is reported as that
 * name (so "survivors" reports as "Survived"); a word that looks like a
 * proper noun (capitalized, not the sentence's own first word) but resolves
 * to nothing is reported as itself — an invented name can never belong to
 * any fact's entity set, so it is rejected downstream regardless. Both
 * classes are deliberately over-inclusive: better to over-extract and have
 * `checkCitation` reject a false positive than under-extract and let a
 * fabrication pass.
 */
export function extractEntities(text: string, vocabulary: string[] = []): string[] {
  // Underscore stays part of the token (not a separator): a snake_case name
  // like "order_items" must resolve as one identifier, or its fragment
  // "order" can stem-match an unrelated sibling ("orders") and misattribute
  // the mention — the exact failure class this function exists to catch.
  const words = text.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? [];
  const out = new Set<string>();
  words.forEach((word, i) => {
    const resolved = resolveVocabulary(word, vocabulary);
    if (resolved !== null) {
      out.add(resolved);
      return;
    }
    if (i === 0) return; // ordinary sentence-initial capitalization, not a mention
    if (/^[A-Z]/.test(word)) out.add(word);
  });
  return [...out];
}

/** Numeric tokens (with optional %/σ suffix), spelled-out cardinal numbers
 * (normalized to their digit form), and quoted substrings — the only shapes
 * a data value takes in this app's deterministic prose. `vocabulary`
 * (the dataset's real table/column names, when known) lets a quoted mention
 * of an entity — `'stock_prices'`, `"Volume"` — be recognized as a name, not
 * a stated value; an ISO date (`2016-01-04`) is extracted as one token before
 * the digit scan runs, so its month/day components aren't re-split into
 * standalone numbers that could never match the fact's own value set. */
export function extractValues(text: string, vocabulary: string[] = []): string[] {
  const out: string[] = [];

  const dateStripped = text.replace(/\b\d{4}-\d{2}(?:-\d{2})?\b/g, (match) => {
    out.push(match);
    return '#'.repeat(match.length);
  });
  for (const m of dateStripped.matchAll(/\d[\d,]*(?:\.\d+)?[%σ]?/g)) out.push(m[0]);

  for (const m of text.matchAll(/[A-Za-z]+/g)) {
    const digit = WORD_NUMBERS[m[0].toLowerCase()];
    if (digit !== undefined) out.push(digit);
  }

  const isVocabName = (s: string) => vocabulary.some((v) => v.toLowerCase() === s.toLowerCase());
  for (const m of text.matchAll(/"([^"]*)"/g)) {
    const inner = m[1].trim();
    if (inner !== '' && !isVocabName(inner)) out.push(inner);
  }
  for (const m of text.matchAll(/'([^']*)'/g)) {
    const inner = m[1].trim();
    if (inner !== '' && !isVocabName(inner)) out.push(inner);
  }
  return out;
}

/** `rule:colA:colB` → `[colA, colB]`; the syntactic rules (`duplicates`) name
 * no column at all. Parsed from the id the insight rule itself minted from
 * its real `ClassifiedColumn` objects (lib/insights.ts) — never re-guessed
 * from the rendered description string, per the doc's own load-bearing note.
 * `id-exclusion` facts also get `Profile` added: `idExclusionCandidates`'
 * own canonical description ("override in Profile") always names it, so it
 * belongs to this fact *type*'s entity set, not the shared neutral-vocabulary
 * blocklist — it can't be confused with a real schema name either way. */
function entitiesFromInsightId(id: string, tableName: string): string[] {
  const [rule, ...rest] = id.split(':');
  const entities = [tableName, ...rest];
  if (rule === 'id-exclusion') entities.push('Profile');
  return entities;
}

function factRefFromInsight(table: TableRegistryEntry, insight: TableInsights['insights'][number]): FactRef {
  return {
    statement: insight.description,
    sql: insight.sql,
    snapshot: table.createdAt,
    confidence: table.sampled ? 'medium' : 'high',
    provenance: 'insight-rule',
  };
}

function buildVocabulary(tables: TableRegistryEntry[]): string[] {
  const names = new Set<string>();
  for (const table of tables) {
    names.add(table.tableName);
    for (const column of table.columns ?? []) names.add(column.name);
  }
  return [...names];
}

/**
 * Builds the citable fact table from the same deterministic computation the
 * baseline headline/actions are themselves selected from (`TableInsights`,
 * `lib/dossier.ts#selectHeadlineFact`/`rankNextActions`) plus the structural
 * facts (`StructuralFacts`-shaped: row counts, Temporal column spans) the
 * synthesis payload already carries. Every entry's `entities` names only the
 * columns the underlying rule actually read.
 */
export function buildCitableFacts(tables: TableRegistryEntry[], tableInsights: TableInsights[]): CitableFact[] {
  const vocabulary = buildVocabulary(tables);
  const facts: CitableFact[] = [];

  for (const table of tables) {
    facts.push({
      id: `fact:${table.tableName}.rowCount`,
      entities: [table.tableName],
      values: [String(table.rowCount), table.rowCount.toLocaleString('en-US')],
      vocabulary,
      ref: {
        statement: `${table.tableName}: ${table.rowCount.toLocaleString()} rows.`,
        sql: '',
        snapshot: table.createdAt,
        confidence: table.sampled ? 'medium' : 'high',
        provenance: 'schema',
      },
    });

    for (const column of table.columns ?? []) {
      if (column.semanticType !== 'Temporal' || column.min == null || column.max == null) continue;
      const minDate = String(column.min);
      const maxDate = String(column.max);
      const minYear = minDate.match(/^\d{4}/)?.[0];
      const maxYear = maxDate.match(/^\d{4}/)?.[0];
      const values = [minDate, maxDate];
      if (minYear) values.push(minYear);
      if (maxYear) values.push(maxYear);
      if (minYear && maxYear) {
        const span = Number(maxYear) - Number(minYear);
        values.push(String(span), String(span + 1));
      }
      facts.push({
        id: `fact:${table.tableName}.${column.name}.dateRange`,
        entities: [table.tableName, column.name],
        values,
        vocabulary,
        ref: {
          statement: `${column.name} spans ${minDate} to ${maxDate}.`,
          sql: '',
          snapshot: table.createdAt,
          confidence: table.sampled ? 'medium' : 'high',
          provenance: 'schema',
        },
      });
    }
  }

  for (const ti of tableInsights) {
    for (const insight of ti.insights) {
      facts.push({
        id: `fact:${ti.table.tableName}.${insight.id}`,
        entities: entitiesFromInsightId(insight.id, ti.table.tableName),
        values: extractValues(insight.description).map(normalizeValue),
        vocabulary,
        ref: factRefFromInsight(ti.table, insight),
      });
    }
  }

  return facts;
}

export interface CitationCheckResult {
  ok: boolean;
  offendingEntities: string[];
  offendingValues: string[];
}

/**
 * The mechanism's core check (03's step 3): every entity named in `statement`
 * must belong to `fact`'s own entity set (or the neutral vocabulary), and
 * every value stated must belong to `fact`'s own value set. Reject whole on
 * either miss — never repair, never partially accept (the doc's own rule).
 */
export function checkCitation(statement: string, fact: CitableFact): CitationCheckResult {
  const allowedEntities = new Set([...fact.entities.map((e) => e.toLowerCase()), ...NEUTRAL_VOCABULARY]);
  const allowedValues = new Set(fact.values.map(normalizeValue));
  // A month name only describes a date the fact itself already asserts if the
  // fact actually states one (a year or ISO date among its values) — F3 cites
  // a fact with no date at all, so "April" there stays a bare invented entity.
  const hasDateValue = fact.values.some((v) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(v));

  const offendingEntities = extractEntities(statement, fact.vocabulary).filter(
    (e) => !allowedEntities.has(e.toLowerCase()) && !(hasDateValue && MONTH_NAMES.has(e.toLowerCase())),
  );
  const offendingValues = extractValues(statement, fact.vocabulary)
    .map(normalizeValue)
    .filter((v) => !allowedValues.has(v));

  return { ok: offendingEntities.length === 0 && offendingValues.length === 0, offendingEntities, offendingValues };
}
