// Prompt builder, index-response parser/validator, and deterministic headline
// assembly for the phrase-library candidate (01-phrase-library.md). The model's
// only representable output is an array of integer indices into a candidate
// list it was shown — never prose — so nothing it returns can introduce a
// value or claim the app didn't already author or compute (F2/F3's structural
// fix). Experiment-scoped: this is candidate-specific, not product code.
import type { StructuralFacts } from '../../edge/protocol';
import { isRepeatedEntityKey, type CapabilityKey } from '../../src/lib/datasetCapabilities';
import type { CapabilityPhrase } from './capabilityPhrases';

type Table = StructuralFacts['tables'][number];

// Mirrors the money-name signal `hasLifetimeValue` (datasetCapabilities.ts)
// uses to detect the candidate — needed again here only to name the *specific*
// evidence column in the extractive-floor's fact sentence, never to redecide
// whether the key fired (detectCapabilities already decided that).
const MONEY_NAME_PATTERN = /price|cost|amount|revenue|total|fee|charge|value/i;

export interface PhraseCandidate {
  key: CapabilityKey;
  text: string;
}

/** Flattens every detected key's authored phrasings into one indexed list — the
 * selective arm's candidate pool. A key absent from `phrases` contributes
 * nothing (should not happen once the asset covers all five keys). */
export function buildCandidates(detected: CapabilityKey[], phrases: CapabilityPhrase[]): PhraseCandidate[] {
  const byKey = new Map(phrases.map((p) => [p.key, p]));
  const candidates: PhraseCandidate[] = [];
  for (const key of detected) {
    const phrase = byKey.get(key);
    if (!phrase) continue;
    for (const text of phrase.phrasings) candidates.push({ key, text });
  }
  return candidates;
}

function findEvidence(key: CapabilityKey, facts: StructuralFacts): string {
  switch (key) {
    case 'seasonality': {
      for (const t of facts.tables) {
        const temporal = t.columns.find((c) => c.semanticType === 'Temporal');
        const categorical = t.columns.find((c) => c.semanticType === 'Categorical');
        const quantitative = t.columns.find((c) => c.semanticType === 'Quantitative');
        if (temporal && categorical && quantitative) {
          return `${t.name}.${temporal.name} alongside ${t.name}.${categorical.name} (${categorical.cardinality} distinct) and ${t.name}.${quantitative.name}`;
        }
      }
      return 'a time column alongside a category column and a numeric column';
    }
    case 'cohort-retention': {
      for (const t of facts.tables) {
        const temporal = t.columns.find((c) => c.semanticType === 'Temporal');
        const key2 = t.columns.find((c) => isRepeatedEntityKey(c, t.rowCount));
        if (temporal && key2) {
          return `${t.name}.${key2.name} (${key2.cardinality} distinct values over ${t.rowCount} rows) repeating alongside ${t.name}.${temporal.name}`;
        }
      }
      return 'a repeating key column alongside a time column';
    }
    case 'group-comparison': {
      for (const t of facts.tables) {
        const twoValue = t.columns.find((c) => c.semanticType === 'Categorical' && c.cardinality === 2);
        const quantitative = t.columns.find((c) => c.semanticType === 'Quantitative');
        if (twoValue && quantitative) {
          return `${t.name}.${twoValue.name} splitting into 2 groups alongside ${t.name}.${quantitative.name}`;
        }
      }
      return 'a two-valued category column alongside a numeric column';
    }
    case 'lifetime-value': {
      for (const a of facts.tables as Table[]) {
        for (const b of facts.tables as Table[]) {
          if (a.name === b.name) continue;
          const bNames = new Set(b.columns.map((c) => c.name));
          const shared = a.columns.find((c) => bNames.has(c.name));
          const aTemporal = a.columns.find((c) => c.semanticType === 'Temporal');
          const bMoney = b.columns.find((c) => c.semanticType === 'Quantitative' && MONEY_NAME_PATTERN.test(c.name));
          if (shared && aTemporal && bMoney) {
            return `${a.name} and ${b.name} sharing ${shared.name}, with ${a.name}.${aTemporal.name} and ${b.name}.${bMoney.name}`;
          }
        }
      }
      return 'two tables sharing a join column, one with a time column and the other a price-like column';
    }
    case 'correlation-study': {
      for (const t of facts.tables) {
        const quant = t.columns.filter((c) => c.semanticType === 'Quantitative');
        if (quant.length >= 2) {
          return `${t.name} carrying ${quant.length} numeric columns (${quant.map((c) => c.name).join(', ')})`;
        }
      }
      return 'a table carrying two or more numeric columns';
    }
  }
}

/** The extractive-floor's candidate pool: one deterministic, dataset-specific
 * fact sentence per detected key — no human spin, no model authorship at all
 * in the text. Exactly one candidate per key (unlike the selective arm's three
 * phrasings each), since the control arm's only freedom is ordering them. */
export function buildExtractiveCandidates(detected: CapabilityKey[], facts: StructuralFacts): PhraseCandidate[] {
  return detected.map((key) => ({ key, text: findEvidence(key, facts) }));
}

function candidateIndexLines(candidates: PhraseCandidate[]): string {
  return candidates.map((c, i) => `[${i}] ${c.text}`).join('\n');
}

/** Selective arm: the model may pick at most one phrasing per group (skipping a
 * group entirely is allowed) and orders its picks by presentation priority. */
export function buildSelectivePrompt(candidates: PhraseCandidate[]): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    "You choose which pre-written descriptions best fit a dataset's shape.",
    'You do not write any new text — you only return the index numbers of the',
    'options you pick, in the order you want them presented (most to least',
    'relevant first). The options are grouped; pick at most one option per',
    'group, and you may skip a group entirely if none of its options fit.',
    '',
    'Answer with ONLY this JSON, no prose, no code fences:',
    '{"suitedFor": [<index>, <index>, ...]}',
  ].join('\n');
  const userPrompt = candidateIndexLines(candidates);
  return { systemPrompt, userPrompt };
}

/** Extractive-floor (zero-freedom control) arm: the model may not select or
 * drop anything — every fact sentence must appear exactly once — it only
 * orders them by presentation priority. */
export function buildOrderOnlyPrompt(candidates: PhraseCandidate[]): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    'You order a list of pre-computed facts about a dataset from most to least',
    'interesting for a first-time viewer. You do not change, add, drop, or',
    'rewrite any fact — you only return their index numbers in your chosen',
    'order, and every index below must appear exactly once.',
    '',
    'Answer with ONLY this JSON, no prose, no code fences:',
    '{"suitedFor": [<index>, <index>, ...]}',
  ].join('\n');
  const userPrompt = candidateIndexLines(candidates);
  return { systemPrompt, userPrompt };
}

export interface SelectionAnswer {
  suitedFor: number[];
}

/**
 * Parses and validates the model's only representable answer shape. `mode:
 * 'select'` (the selective arm) allows 1..(distinct key count) indices, at
 * most one per key. `mode: 'order-only'` (the extractive floor) requires
 * exactly one index per candidate — a full permutation, nothing dropped.
 * Throws on any violation — an out-of-range integer, a duplicate key, wrong
 * arity — so the harness degrades instead of serving a mangled headline.
 */
export function parseSelectionAnswer(
  raw: string,
  candidates: PhraseCandidate[],
  mode: 'select' | 'order-only',
): SelectionAnswer {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model output');
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { suitedFor?: unknown };
  if (!Array.isArray(parsed.suitedFor)) throw new Error('missing suitedFor array');

  const seenKeys = new Set<CapabilityKey>();
  const indices: number[] = [];
  for (const entry of parsed.suitedFor) {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0 || entry >= candidates.length) {
      throw new Error('suitedFor index out of range');
    }
    const candidate = candidates[entry];
    if (seenKeys.has(candidate.key)) throw new Error('duplicate capability key in suitedFor');
    seenKeys.add(candidate.key);
    indices.push(entry);
  }

  if (indices.length === 0) throw new Error('empty suitedFor');
  const distinctKeys = new Set(candidates.map((c) => c.key)).size;
  if (mode === 'order-only' && indices.length !== distinctKeys) {
    throw new Error('order-only mode must include every detected capability exactly once');
  }
  if (mode === 'select' && indices.length > distinctKeys) {
    throw new Error('too many selections for the number of detected capabilities');
  }

  return { suitedFor: indices };
}

function tableCount(facts: StructuralFacts): number {
  return facts.tables.length;
}

function totalRows(facts: StructuralFacts): number {
  return facts.tables.reduce((n, t) => n + t.rowCount, 0);
}

function dateSpan(facts: StructuralFacts): { min: string; max: string } | null {
  let min: string | null = null;
  let max: string | null = null;
  for (const table of facts.tables) {
    for (const column of table.columns) {
      if (column.minDate && (min === null || column.minDate < min)) min = column.minDate;
      if (column.maxDate && (max === null || column.maxDate > max)) max = column.maxDate;
    }
  }
  return min && max ? { min, max } : null;
}

function joinWithAnd(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** Assembles the final headline from deterministic parts only (table/row
 * counts, the Temporal span if any) plus the model-selected phrase text,
 * verbatim. Nothing here is model-authored except which strings appear and in
 * what order — the scaffolding sentence is fixed. */
export function assembleHeadline(facts: StructuralFacts, selectedPhrases: string[]): string {
  const tables = tableCount(facts);
  const rows = totalRows(facts);
  const span = dateSpan(facts);
  const tableWord = tables === 1 ? 'table' : 'tables';
  let sentence = `${tables} ${tableWord}, ${rows.toLocaleString('en-US')} rows`;
  if (span) sentence += `, spanning ${span.min} to ${span.max}`;
  sentence += '.';
  if (selectedPhrases.length > 0) {
    sentence += ` This dataset looks well suited for ${joinWithAnd(selectedPhrases)}.`;
  }
  return sentence;
}
