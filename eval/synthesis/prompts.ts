// Widened system prompts for S0 Probe A (00-synthesis-and-limits-probe.md) —
// split out from run.ts so other harness arms (eval/claude/02-generate-then-verify/)
// can import the prompt text without pulling in run.ts's own executable
// `main()`, which runs unconditionally at module scope on import. This file
// has no side effects: importing it does nothing but bind these constants.
//
// Each variant only changes the headline-rewrite instructions; the JSON
// contract, the numeric-carryover rule, and the forbidden-words guard are
// unchanged from production, and every variant is still parsed and validated
// by the exact same code the product uses (`parseModelAnswer`,
// `sliceFromAnswer`, the seam validators inside `requestSynthesis`) — a
// variant that only wins by escaping the validator has failed, not won.
import { FORBIDDEN_WORDS } from '../../edge/ai/synthesisProvider';

const WIDENED_HEADLINE_TAIL = (extra: string) =>
  [
    '',
    extra,
    '',
    'Everything else is unchanged: every number in the given headline still MUST',
    'appear verbatim in yours, table/column names stay exact, you add no claim',
    `the structure below doesn't support, and you never use any of these words: ${FORBIDDEN_WORDS}.`,
  ].join('\n');

const SYNTHESIS_SYSTEM_PROMPT_HEAD = [
  'You polish the opening screen of a data-analysis app. You receive a dataset\'s',
  'structure (tables, columns, types, null rates — never any data rows), a',
  'deterministic headline sentence about it, and a numbered list of suggested',
  'next explorations.',
  '',
  'Rewrite the headline as one short, inviting, concrete sentence, different',
  'from the given one.',
].join('\n');

const SYNTHESIS_SYSTEM_PROMPT_TAIL = [
  '',
  'Then re-order the suggested explorations from most to least interesting for',
  'this specific dataset, and re-phrase each one\'s label as a short imperative',
  '(at most ~8 words). You may not add, drop, or merge explorations — return',
  'exactly the given indices, each exactly once.',
  '',
  'Answer with ONLY this JSON, no prose, no code fences:',
  '{"headline": "...", "actions": [{"index": 0, "verb": "..."}, ...]}',
].join('\n');

export const WIDENED_V1_SYSTEM_PROMPT =
  SYNTHESIS_SYSTEM_PROMPT_HEAD +
  WIDENED_HEADLINE_TAIL(
    [
      'Your rewritten headline MAY also name what kind of dataset this appears to',
      'be, inferred only from the table and column names and semantic types given',
      '— never a guess beyond what those names and types actually suggest. It MAY',
      'also state the covered date range, but only when a column below carries',
      'both `minDate` and `maxDate` — state that exact range plainly (e.g.',
      '"spanning 2021 to 2024") and never a range not given.',
    ].join('\n'),
  ) +
  SYNTHESIS_SYSTEM_PROMPT_TAIL;

export const WIDENED_V2_SYSTEM_PROMPT =
  SYNTHESIS_SYSTEM_PROMPT_HEAD +
  WIDENED_HEADLINE_TAIL(
    [
      'Your rewritten headline MAY also name what kind of dataset this appears to',
      'be and state the covered date range, under the same rules as above (domain',
      'from names/types only; a date range only when a column carries both',
      '`minDate` and `maxDate`). It MAY additionally name 1-2 concrete kinds of',
      'analysis this dataset looks suited for, derived only from the combination',
      'of semantic types present below (e.g. a Temporal column alongside a',
      'Quantitative one suggests trend analysis; a low-cardinality Categorical',
      'column suggests segment comparison) — never a domain-specific claim the',
      'structure doesn\'t support, and never phrased as a certainty.',
    ].join('\n'),
  ) +
  SYNTHESIS_SYSTEM_PROMPT_TAIL;
