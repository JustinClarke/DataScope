// The budgeted prompt assembler (10-grounding-ladder.md, "The seam to get
// right"). Not string concatenation: every section declares its own content
// and a priority; the assembler fills sections in priority order until the
// budget is spent and records what it dropped. Today's in-scope case is
// budget = ∞ — everything fits, nothing is dropped — which is the point: the
// assembler is trivial now and the seam is correct. This is what stops the
// large-table round (retrieval, stratified sampling, map-reduce over chunks)
// from being a revamp later — that round changes which sections get built and
// what budget they're given, never this function.
export type SectionName =
  | 'dialect-rules'
  | 'schema-card'
  | 'computed-facts'
  | 'offer-candidates'
  | 'conversation-state'
  | 'row-evidence'
  | 'result-digests';

// Priority order per the doc: dialect rules → schema card → computed facts →
// conversation state → row evidence → result digests. Lower fills first.
// `offer-candidates` (run.ts's panel arm: the ranker's 3 fixed actionIds a
// model may only re-verb) slots in beside computed-facts — it's the same
// kind of "candidate set the model selects/narrates from," never data.
const SECTION_PRIORITY: Record<SectionName, number> = {
  'dialect-rules': 0,
  'schema-card': 1,
  'computed-facts': 2,
  'offer-candidates': 3,
  'conversation-state': 4,
  'row-evidence': 5,
  'result-digests': 6,
};

export interface PromptSection {
  name: SectionName;
  content: string;
}

interface CostedSection extends PromptSection {
  priority: number;
  tokens: number;
}

export interface AssembleResult {
  prompt: string;
  included: CostedSection[];
  dropped: CostedSection[];
  totalTokens: number;
  budgetTokens: number;
}

/** A conservative ~4-chars-per-token estimate — good enough to fill a budget
 * against; the actual per-run count that matters for the doc's num_ctx
 * discipline is Ollama's own `prompt_eval_count`, read off the live response,
 * not this estimate. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Fills `sections` in priority order until `budgetTokens` is spent; anything
 * that doesn't fit is recorded in `dropped`, never silently omitted. Empty
 * sections are skipped entirely — an empty row-evidence section at rung 0
 * shouldn't count as "dropped". */
export function assemble(sections: PromptSection[], budgetTokens = Infinity): AssembleResult {
  const costed: CostedSection[] = sections
    .filter((s) => s.content.length > 0)
    .map((s) => ({ ...s, priority: SECTION_PRIORITY[s.name], tokens: estimateTokens(s.content) }))
    .sort((a, b) => a.priority - b.priority);

  const included: CostedSection[] = [];
  const dropped: CostedSection[] = [];
  let spent = 0;
  for (const section of costed) {
    if (spent + section.tokens <= budgetTokens) {
      included.push(section);
      spent += section.tokens;
    } else {
      dropped.push(section);
    }
  }

  return {
    prompt: included.map((s) => s.content).join('\n\n'),
    included,
    dropped,
    totalTokens: spent,
    budgetTokens,
  };
}
