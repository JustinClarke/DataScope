// DESIGN.md §4: "Determinism probe, run first: 20 identical calls, one
// prompt, one model, temperature 0. Record the identical-output rate in the
// manifest. If >=95%, run N=2 (one repeat is a determinism audit, not a
// statistical sample — repeats are never treated as independent trials in
// any confidence interval; the unit of analysis is the *check*). If <95%,
// the backend isn't deterministic enough and N=5 is used instead — report
// the probe result either way."
//
// The decision logic (`summarizeDeterminismProbe`) is pure and unit-tested
// without a network call; `runDeterminismProbe` wraps it with `repeats` live
// calls through ollama.ts's shared `callForProposal` — the same call path
// A0-A3 use — sequential, not parallel, so a manifest reading the result back
// sees calls in order.
import { pathToFileURL } from 'node:url';
import { callForProposal, resolveModel, type ChatMessage } from '../17-duckdb-local-chat/ollama';

export const DETERMINISM_PROBE_REPEATS = 20;
export const DETERMINISM_PROBE_THRESHOLD = 0.95;

export interface DeterminismProbeResult {
  model: string;
  repeats: number;
  /** Every call's raw response content, in call order — kept so a report can show what actually varied, not just the rate. */
  responses: string[];
  /** Size of the largest group of byte-identical responses, divided by `repeats`. 0 for a 0-repeat probe. */
  identicalRate: number;
  /** DESIGN.md's decision rule applied to `identicalRate`. */
  recommendedN: 2 | 5;
}

function modalGroupSize(responses: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const r of responses) counts.set(r, (counts.get(r) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

/**
 * Pure: turns a list of raw response strings into the probe verdict.
 * `identicalRate` is the largest identical-response group's share of the
 * total, not "matches the first call" — a rare first-call outlier shouldn't
 * understate an otherwise-deterministic model.
 */
export function summarizeDeterminismProbe(model: string, responses: readonly string[]): DeterminismProbeResult {
  const repeats = responses.length;
  const identicalRate = repeats > 0 ? modalGroupSize(responses) / repeats : 0;
  return {
    model,
    repeats,
    responses: [...responses],
    identicalRate,
    recommendedN: identicalRate >= DETERMINISM_PROBE_THRESHOLD ? 2 : 5,
  };
}

/**
 * Live probe: `repeats` sequential calls to `model` with the exact same
 * `messages`, through the same structured-output path (`callForProposal`)
 * A0-A3 use. Temperature is whatever `callForProposal` is configured with
 * (`CHAT_TEMPERATURE`, 0 by default) — this function doesn't override it, per
 * DESIGN.md's "temperature 0" being a run-level setting, not probe-specific.
 */
export async function runDeterminismProbe(
  model: string,
  messages: readonly ChatMessage[],
  repeats: number = DETERMINISM_PROBE_REPEATS,
): Promise<DeterminismProbeResult> {
  const responses: string[] = [];
  for (let i = 0; i < repeats; i++) {
    const { rawContent } = await callForProposal(model, messages);
    responses.push(rawContent);
  }
  return summarizeDeterminismProbe(model, responses);
}

// ---- CLI entry: `npx tsx eval/chat/20-grain-rescue/determinismProbe.ts [model]` ----
// Self-contained placeholder prompt (a minimal schema + the flagship "average
// order value" grain question) — deliberately not wired to the arm
// prompt-assembly layer, which doesn't exist yet (DESIGN.md §7). This lets
// the probe run and report a real number now; once arm assembly lands, point
// it at an actual A0/A2 prompt instead.
const PLACEHOLDER_PROMPT: ChatMessage[] = [
  {
    role: 'system',
    content:
      'Tables:\n' +
      'orders(order_id, customer_id, order_date, status)\n' +
      'order_items(order_item_id, order_id, product_id, quantity, unit_price)\n' +
      'Given a question, respond with a JSON object: ' +
      '{"status":"query","sql":"...","assumptions":[...],"result_shape":"scalar"|"table"} ' +
      'or {"status":"unsupported","reason":"..."}.',
  },
  { role: 'user', content: 'What is the average order value?' },
];

async function main(): Promise<void> {
  const model = process.argv[2] ?? 'qwen3:1.7b';
  const resolved = await resolveModel(model);
  console.log(
    `Determinism probe: ${resolved.tag} (${resolved.parameterSize ?? '?'}, ${resolved.quantizationLevel ?? '?'}), ` +
      `${DETERMINISM_PROBE_REPEATS} calls, temperature 0.`,
  );

  const result = await runDeterminismProbe(model, PLACEHOLDER_PROMPT);

  const counts = new Map<string, number>();
  for (const r of result.responses) counts.set(r, (counts.get(r) ?? 0) + 1);
  console.log(`\n${counts.size} distinct response(s) across ${result.repeats} calls:`);
  for (const [response, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  x${count}: ${response.slice(0, 200)}${response.length > 200 ? '…' : ''}`);
  }
  console.log(
    `\nidentical-output rate: ${(result.identicalRate * 100).toFixed(1)}% -> recommended N=${result.recommendedN} ` +
      `(threshold ${DETERMINISM_PROBE_THRESHOLD * 100}%)`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  });
}
