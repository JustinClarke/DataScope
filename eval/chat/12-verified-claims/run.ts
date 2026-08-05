import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { createRunDirectory, writeJsonExclusive } from './artifacts';
import { CLAIM_IR_SCHEMA, parseClaimIR } from './claimIr';
import { monthlyRevenue } from './fixtures';
import { renderVerifiedFact } from './renderer';
import { verifyClaim } from './verifier';

const ENDPOINT = process.env.OLLAMA_CHAT_URL ?? 'http://100.126.157.97:11434/api/chat';
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:7b';
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 8192);
const TIMEOUT_MS = Number(process.env.OLLAMA_CALL_TIMEOUT_MS ?? 600_000);
const REPEATS = 3;

const system = [
  'Return exactly one ClaimIR JSON object and no prose.',
  'Use only the supplied evidenceId, rowId, field, and numeric relations.',
  'Choose a relation that directly answers the question and is true of the evidence.',
  'Do not describe magnitude with words such as substantial; the schema does not support them.',
].join(' ');

const question = 'What changed in January 2022 compared with December 2021?';
const user = `Question: ${question}\n\nFixed evidence:\n${JSON.stringify(monthlyRevenue, null, 2)}`;

interface OllamaBody {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

function runId(): string {
  const timestamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z');
  return `${timestamp}-${randomBytes(3).toString('hex')}`;
}

function serializedError(error: unknown): object {
  if (!(error instanceof Error)) return { message: String(error) };
  return { name: error.name, message: error.message, stack: error.stack };
}

async function main(): Promise<void> {
  const id = runId();
  const directory = await createRunDirectory(join(import.meta.dirname, 'runs'), id);
  const request = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    stream: false,
    keep_alive: '30m',
    format: CLAIM_IR_SCHEMA,
    options: { num_ctx: NUM_CTX, temperature: 0 },
  };
  await writeJsonExclusive(join(directory, 'prompt.json'), {
    runId: id,
    question,
    evidence: monthlyRevenue,
    request,
    repeats: REPEATS,
  });

  let parsed = 0;
  let verified = 0;
  for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
    const startedAt = new Date().toISOString();
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const rawResponseBody = await response.text();
      let providerBody: OllamaBody | undefined;
      let modelContent: string | undefined;
      let parsedClaim: ReturnType<typeof parseClaimIR> | undefined;
      let disposition: ReturnType<typeof verifyClaim> | { accepted: false; reason: 'PARSE_FAILED'; detail: string };
      try {
        providerBody = JSON.parse(rawResponseBody) as OllamaBody;
        modelContent = providerBody.message?.content ?? '';
        parsedClaim = parseClaimIR(JSON.parse(modelContent) as unknown);
        parsed += 1;
        disposition = verifyClaim(parsedClaim, [monthlyRevenue]);
        if (disposition.accepted) verified += 1;
      } catch (error) {
        disposition = { accepted: false, reason: 'PARSE_FAILED', detail: error instanceof Error ? error.message : String(error) };
      }
      await writeJsonExclusive(join(directory, `response-${String(repeat).padStart(2, '0')}.json`), {
        repeat,
        startedAt,
        endedAt: new Date().toISOString(),
        httpStatus: response.status,
        rawResponseBody,
        modelContent,
        parsedClaim,
        disposition,
        sentence: disposition.accepted ? renderVerifiedFact(disposition.fact) : null,
        tokenCounts: providerBody
          ? { prompt: providerBody.prompt_eval_count ?? null, response: providerBody.eval_count ?? null }
          : null,
      });
    } catch (error) {
      await writeJsonExclusive(join(directory, `response-${String(repeat).padStart(2, '0')}.json`), {
        repeat,
        startedAt,
        endedAt: new Date().toISOString(),
        transportError: serializedError(error),
        disposition: { accepted: false, reason: 'TRANSPORT_FAILED' },
      });
    }
  }

  const summary = {
    runId: id,
    parsed,
    verified,
    repeats: REPEATS,
    acceptance: { parsedAtLeastTwo: parsed >= 2, verifiedAtLeastTwo: verified >= 2 },
    verdict: parsed >= 2 && verified >= 2 ? 'pass' : 'fail',
  };
  await writeJsonExclusive(join(directory, 'summary.json'), summary);
  console.log(JSON.stringify({ directory, ...summary }, null, 2));
}

await main();
