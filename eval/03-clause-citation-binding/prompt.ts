// Prompt + parse for the clause-citation-binding candidate
// (03-clause-citation-binding.md, approach 03 of _implementation/_misc/_ideation/ai
// architecture experimentation/). The model never sees the production
// synthesis prompt — it sees only the addressable fact table
// (src/lib/citableFacts.ts) and is told to answer with claims bound to one
// fact id each. Parsing is tolerant of a fenced/prefaced JSON object (same
// shape of leniency as `parseModelAnswer`, edge/ai/synthesisProvider.ts) but
// throws on anything structurally out of contract, so the harness's fetchImpl
// degrades instead of serving a mangled slice.
import type { CitableFact } from '../../src/lib/citableFacts';

export interface ClauseClaim {
  text: string;
  cites: string;
}

export function buildClaimsPrompt(facts: CitableFact[]): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    'You polish the opening screen of a data-analysis app. You receive a numbered',
    'list of citable facts about a dataset — each with a stable id and its own',
    'true statement, already computed by the app. You never see the raw data.',
    '',
    'Write one short claim sentence per fact you choose to use, citing that',
    "fact's id. A claim's wording may use ONLY the names and numbers that",
    'already appear in the ONE fact you cite for it — never borrow a name or',
    "number from a different fact, and never add anything the cited fact",
    "doesn't itself state. If a fact isn't interesting enough to mention, skip",
    'it — you do not have to cite every fact given.',
    '',
    'Answer with ONLY this JSON, no prose, no code fences:',
    '{"claims": [{"text": "...", "cites": "fact:..."}]}',
  ].join('\n');

  const userPrompt = JSON.stringify({
    facts: facts.map((f) => ({ id: f.id, statement: f.ref.statement })),
  });

  return { systemPrompt, userPrompt };
}

/** Throws on anything structurally out of contract — no `cites` field, no
 * `text`, a non-array `claims` — so the caller degrades to baseline instead
 * of assembling a mangled headline. Does NOT validate that `cites` names a
 * real fact id or that the claim's wording stays inside it — that is
 * `checkCitation`'s job (src/lib/citableFacts.ts), run per-claim by the
 * caller against the real fact table. */
export function parseClaimsAnswer(raw: string): ClauseClaim[] {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model output');
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { claims?: unknown };

  if (!Array.isArray(parsed.claims)) throw new Error('missing claims array');
  const claims: ClauseClaim[] = [];
  for (const entry of parsed.claims) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as { text?: unknown }).text !== 'string' ||
      (entry as { text: string }).text.trim() === '' ||
      typeof (entry as { cites?: unknown }).cites !== 'string' ||
      (entry as { cites: string }).cites.trim() === ''
    ) {
      throw new Error('a claim is missing text/cites');
    }
    claims.push({ text: (entry as { text: string }).text.trim(), cites: (entry as { cites: string }).cites.trim() });
  }
  return claims;
}
