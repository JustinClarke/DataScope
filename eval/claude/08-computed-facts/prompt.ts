// Prompt + parse for the computed-facts-with-data candidate
// (08-computed-facts-with-data.md, approach 08). Mechanism §3: the model
// receives the enriched computed-fact table plus a non-citable sample-row
// block, and must answer with `{claims:[{text,cites}]}` — one fact id per
// claim, exactly 03's output contract, so `parseClaimsAnswer`/`ClauseClaim`
// are reused unchanged rather than re-implemented (import discipline, README).
import type { CitableFact } from '../../../src/lib/citableFacts';

export { parseClaimsAnswer, type ClauseClaim } from '../03-clause-citation-binding/prompt';

// The same permanence/causal/"verified" wording D45's `passesPhrasingGuard`
// (src/lib/producerValidators.ts) rejects — told to the model up front so a
// rejection is a contract violation, not a surprise; enforcement happens via
// `passesPhrasingGuard` regardless of what the model does with this list.
const FORBIDDEN_WORDS = [
  'always', 'never', 'permanent', 'permanently', 'guaranteed', 'guarantee', 'invariant',
  'certain', 'certainly', 'proven', 'verified', 'confirmed', 'because', 'causes', 'caused',
  'due to', 'leads to', 'results in', 'drives',
];

export function buildComputedFactsPrompt(
  facts: CitableFact[],
  sampleContext: string,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    'You are describing a dataset for a data-analysis app\'s opening screen. You receive:',
    '1. COMPUTED FACTS — verified statistics about this dataset, each with a stable id.',
    '   You may ONLY state claims that cite one of these facts.',
    '2. SAMPLE ROWS — a small sample for domain context, when present. Do NOT derive',
    '   statistics, counts, percentages, or trends from these rows. They have no ids',
    '   and cannot be cited.',
    '',
    'Write one short claim sentence per fact you choose to use, citing that fact\'s id.',
    'A claim\'s wording may use ONLY the names and numbers that already appear in the',
    'ONE fact you cite for it — never borrow a name or number from a different fact,',
    'and never state anything the cited fact doesn\'t itself say. If a fact isn\'t',
    'interesting enough to mention, skip it — you do not have to cite every fact given.',
    '',
    `Never use any of these words: ${FORBIDDEN_WORDS.join(', ')}.`,
    '',
    'Answer with ONLY this JSON, no prose, no code fences:',
    '{"claims": [{"text": "...", "cites": "stat:..."}, ...]}',
  ].join('\n');

  const userPayload: { facts: Array<{ id: string; statement: string }>; sample?: string } = {
    facts: facts.map((f) => ({ id: f.id, statement: f.ref.statement })),
  };
  const userPrompt = sampleContext
    ? `${JSON.stringify(userPayload)}\n\n${sampleContext}`
    : JSON.stringify(userPayload);

  return { systemPrompt, userPrompt };
}
