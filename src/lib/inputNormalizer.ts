// Stage 1 of the NL→SQL pipeline (§11.1): fuzzy pre-match. Before the model
// ever sees the question, correct tokens that are near-misses for a known table
// or column name — typo repair against the schema vocabulary only. Cheap and
// symbolic: Levenshtein distance, no embeddings, no model call. It never
// touches a token that is already an exact schema name, a SQL keyword, or too
// short to correct safely, and only rewrites when one vocabulary term is
// unambiguously the closest — so it fixes "custmer" → "customer" but leaves
// ordinary English ("of", "highest") and unrelated words alone.

/** A single typo repair, surfaced in the transcript so a rewrite is never hidden. */
export interface NormalizationCorrection {
  from: string;
  to: string;
}

export interface NormalizedQuestion {
  text: string;
  corrections: NormalizationCorrection[];
}

// Tokens shorter than this are too ambiguous to auto-correct (a 2-char typo is
// within edit distance of dozens of names); left untouched.
const MIN_TOKEN_LENGTH = 3;
// A token may be rewritten only if the edit distance to its nearest vocabulary
// term is within this fraction of the longer word. 0.4 catches a two-char slip
// in a four-letter name ("fair" → "fare") while a wholly different word stays
// far outside the window.
const MAX_DISTANCE_RATIO = 0.4;

// Word-like runs — SQL/identifier characters. Punctuation and whitespace
// between matches is preserved verbatim when the text is rebuilt.
const TOKEN = /[A-Za-z_][A-Za-z0-9_]*/g;

// A compact guard so a real SQL keyword is never rewritten into a column that
// happens to sit one edit away (e.g. "count" → a "county" column). Not the full
// dialect — just the words a natural-language question actually contains.
const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'group', 'order', 'by', 'having', 'limit', 'offset',
  'join', 'inner', 'outer', 'left', 'right', 'full', 'on', 'as', 'and', 'or', 'not',
  'count', 'sum', 'avg', 'min', 'max', 'distinct', 'between', 'like', 'in', 'is',
  'null', 'asc', 'desc', 'union', 'all', 'case', 'when', 'then', 'else', 'end',
]);

/** Standard Levenshtein edit distance (insert / delete / substitute), case-insensitive by caller. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

interface NearestMatch {
  term: string;
  distance: number;
  /** Distance to the second-closest term — used to reject ambiguous corrections. */
  runnerUp: number;
}

/** Closest vocabulary term to `token` (all compared lowercased), with the runner-up gap. */
function nearest(token: string, vocab: Array<{ lower: string; canonical: string }>): NearestMatch | null {
  let bestTerm: string | null = null;
  let bestDistance = Infinity;
  let runnerUp = Infinity;
  for (const { lower, canonical } of vocab) {
    const distance = levenshtein(token, lower);
    if (distance < bestDistance) {
      runnerUp = bestDistance;
      bestTerm = canonical;
      bestDistance = distance;
    } else if (distance < runnerUp) {
      runnerUp = distance;
    }
  }
  return bestTerm === null ? null : { term: bestTerm, distance: bestDistance, runnerUp };
}

/**
 * Correct schema-token typos in a question. `vocabulary` is the set of known
 * table and column names (the service assembles it from the table registry);
 * corrections rewrite to the canonical spelling from that list. Pure and
 * offline — safe to run on every keystroke's worth of input.
 */
export function normalizeQuestion(question: string, vocabulary: string[]): NormalizedQuestion {
  const vocab = vocabulary.map((canonical) => ({ lower: canonical.toLowerCase(), canonical }));
  const exact = new Set(vocab.map((v) => v.lower));
  const corrections: NormalizationCorrection[] = [];

  const text = question.replace(TOKEN, (token) => {
    const lower = token.toLowerCase();
    if (token.length < MIN_TOKEN_LENGTH) return token;
    if (exact.has(lower)) return token;
    if (SQL_KEYWORDS.has(lower)) return token;

    const match = nearest(lower, vocab);
    if (match === null || match.distance === 0) return token;

    const threshold = Math.max(1, Math.round(Math.max(lower.length, match.term.length) * MAX_DISTANCE_RATIO));
    // Within the edit window and strictly closer than any other term: a safe,
    // unambiguous rewrite. Ties (distance === runnerUp) are left uncorrected.
    if (match.distance <= threshold && match.distance < match.runnerUp) {
      corrections.push({ from: token, to: match.term });
      return match.term;
    }
    return token;
  });

  return { text, corrections };
}
