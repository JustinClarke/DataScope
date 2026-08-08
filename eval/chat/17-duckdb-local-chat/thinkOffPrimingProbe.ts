// Cheapest possible test of the open "thinking mode is a forced choice"
// blocker (see doc + memory handoff): does one worked few-shot example let
// qwen3:4b classify status correctly with CHAT_THINK off, avoiding the
// multi-minute thinking-mode tax entirely? If yes, that's a bigger win than
// any latency optimization — it removes the need for thinking mode at all.
//
// Standalone probe, not a change to catalog.ts's frozen buildSchemaPrompt():
// reuses ollama.ts's exported callForProposal against a hand-modified system
// prompt string, so a negative result costs nothing beyond this file. Only
// tests the proposal call's `status` field (query vs unsupported) — no guard,
// no execution, no answer call — because that field is exactly what the prior
// live dry run found broken (0/4 answered with thinking off).
//
// Run: `npx tsx eval/chat/17-duckdb-local-chat/thinkOffPrimingProbe.ts [model]`
// (model defaults to qwen3:4b). Do not set CHAT_THINK=1 — the point is to
// test the off case.
import { buildSchemaPrompt } from './catalog';
import { callForProposal, resolveModel, type ChatMessage } from './ollama';

const MODEL = process.argv[2] ?? 'qwen3:4b';

const FEWSHOT_EXAMPLE = `
Example of a correctly answered question:
Q: "How many orders are there?"
A: {"status":"query","sql":"SELECT COUNT(*) AS n FROM analytics.order_totals","assumptions":[],"result_shape":"scalar"}
Note: this question is answerable even though it does not mention a view or column by name — propose a query for anything the schema above can support.`;

const SAMPLE: Array<{ id: number; question: string; expect: 'query' | 'unsupported' }> = [
  { id: 1, question: 'How many orders are there?', expect: 'query' },
  { id: 2, question: 'How many completed orders are there?', expect: 'query' },
  { id: 6, question: 'Which category has the most completed revenue?', expect: 'query' },
  { id: 7, question: 'Show completed revenue by month.', expect: 'query' },
  { id: 14, question: 'What was profit by category?', expect: 'unsupported' },
  { id: 15, question: 'Which marketing campaign caused the most sales?', expect: 'unsupported' },
  { id: 16, question: 'Break sales down by customer age.', expect: 'unsupported' },
  { id: 17, question: 'What does "best customer" mean?', expect: 'query' },
];

async function runArm(name: string, systemPrompt: string): Promise<number> {
  console.log(`\n=== ${name} ===`);
  let correct = 0;
  const start = performance.now();
  for (const { id, question, expect } of SAMPLE) {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ];
    const t0 = performance.now();
    const call = await callForProposal(MODEL, messages);
    const ms = Math.round(performance.now() - t0);
    const got = call.proposal?.status ?? `PARSE_FAIL(${call.parseError})`;
    const ok = got === expect;
    if (ok) correct += 1;
    console.log(`  Q${id} [expect ${expect}, got ${got}] ${ok ? 'OK' : 'MISS'} (${ms}ms)`);
  }
  const totalMs = Math.round(performance.now() - start);
  console.log(`${name}: ${correct}/${SAMPLE.length} correct, ${totalMs}ms total`);
  return correct;
}

async function main(): Promise<void> {
  if (process.env.CHAT_THINK === '1') {
    console.log('NOTE: CHAT_THINK=1 is set. This probe is meant to test the off case — unset it to get a meaningful answer.');
  }
  const resolved = await resolveModel(MODEL);
  console.log(
    `Using ${resolved.tag} (${resolved.parameterSize ?? '?'}, ${resolved.quantizationLevel ?? '?'}), thinking ${process.env.CHAT_THINK === '1' ? 'ON' : 'off'}.`,
  );

  const baseline = buildSchemaPrompt();
  const baselineCorrect = await runArm('baseline (current prompt, no example)', baseline);

  const primed = `${baseline}\n${FEWSHOT_EXAMPLE}`;
  const primedCorrect = await runArm('primed (+1 worked example)', primed);

  console.log(`\nSummary: baseline ${baselineCorrect}/${SAMPLE.length}, primed ${primedCorrect}/${SAMPLE.length}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
