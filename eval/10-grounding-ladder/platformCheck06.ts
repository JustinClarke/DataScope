// D18-style throwaway (10-grounding-ladder.md, "Run 06's platform check
// first" — 20 minutes, run before building the rest of the harness). NOT
// part of the "What to build" tree (opaque.ts/corrupt.ts/run.ts/etc. stay
// unbuilt). Answers one question: does Ollama's JSON-schema `format`
// parameter, scoped to a single panel slot's live fact-id enum, actually
// constrain `cites` at decode time — or is it advisory? If it holds, an
// invalid citation is unrepresentable rather than post-hoc rejected, and 06's
// per-slot constrained decoding is worth folding into panelSchema.ts/run.ts
// for real. If not, citation checking stays post-hoc (03/08's mechanism,
// unchanged) and 06 is dropped from the doc's build list.
//
// Method: pull titanic's real "quality" slot fact table (buildSlotFactTables
// — the actual partition run.ts will use), build a JSON schema whose `cites`
// enum is exactly those live ids, and ask the model to write one claim under
// an adversarial prompt that dangles a real-world fact (the Titanic's 1912
// sinking) outside that fact table. Run N=5 unconstrained (no `format`) and
// N=5 constrained (`format` = the schema), and report whether the enum was
// ever violated in the constrained arm — that's the whole test.
import { Agent, setGlobalDispatcher } from 'undici';
import { createEvalEngine } from '../duckdb/duckdb';
import { loadEvalDatasets } from '../dataset/tables';
import { computeStats } from '../08-computed-facts/computeStats';
import { verifyStats } from '../08-computed-facts/verifyStats';
import { buildSlotFactTables } from './slotFacts';

// This rig measured ~6-7s/token at num_ctx=32768 on a live probe (2026-07-28,
// trivial "Say OK." prompt: eval_duration 13.5s for 2 tokens) — undici's
// default 300s headers timeout trips on stream:false before generation
// finishes. Raise it; this is a diagnostic script, not the production harness.
setGlobalDispatcher(new Agent({ headersTimeout: 600_000, bodyTimeout: 600_000 }));

const OLLAMA_CHAT_URL = process.env.OLLAMA_CHAT_URL ?? 'http://100.126.157.97:11434/api/chat';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:14b';
// This diagnostic's prompt is a couple hundred tokens — it does not need the
// production ladder's 32768 (10-grounding-ladder.md's own num_ctx, sized for
// max-that-fits row evidence). A live probe at 32768 crashed the Ollama
// runner mid-generation on this rig (2026-07-28: connection reset, then
// `/api/ps` showed no model loaded) even though trivial round trips at that
// same num_ctx succeeded — the KV-cache allocation cost under real generation
// load, not networking. 4096 comfortably covers this prompt+response.
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 4096);
const N = Number(process.env.PLATFORM_CHECK_N ?? 3);

function claimSchema(enumIds: string[]) {
  return {
    type: 'object',
    properties: {
      text: { type: 'string' },
      cites: { type: 'array', items: { type: 'string', enum: enumIds }, minItems: 1, maxItems: 1 },
    },
    required: ['text', 'cites'],
  };
}

async function callOllama(systemPrompt: string, userPrompt: string, format?: unknown): Promise<string> {
  const res = await fetch(OLLAMA_CHAT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      options: { num_ctx: NUM_CTX, num_predict: 200 },
      ...(format ? { format } : {}),
    }),
  });
  if (!res.ok) throw new Error(`ollama http ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { message?: { content?: string } };
  return body.message?.content ?? '';
}

async function main(): Promise<void> {
  const engine = await createEvalEngine();
  const [dataset] = (await loadEvalDatasets(engine)).filter((d) => d.id === 'titanic');
  if (!dataset) throw new Error('titanic fixture not found');

  const computedStats = await computeStats(engine, dataset.tables);
  await verifyStats(engine, dataset.tables, computedStats); // hard gate, kill criterion (a)

  const { tables } = buildSlotFactTables(dataset.tables, computedStats);
  const qualityFacts = tables.quality;
  const enumIds = qualityFacts.map((f) => f.id);
  console.log(`quality slot: ${enumIds.length} live fact ids\n  ${enumIds.join('\n  ')}`);

  const factListText = qualityFacts.map((f) => `- ${f.id}: ${f.ref.statement}`).join('\n');
  const systemPrompt =
    'You are a data reporter. Write exactly one claim about data quality, citing exactly one fact id ' +
    'from the list given. Respond with JSON only: {"text": "...", "cites": ["fact-id"]}.';
  const userPrompt =
    `Dataset: titanic (the RMS Titanic passenger list, sank April 1912).\n\n` +
    `Available quality facts:\n${factListText}\n\n` +
    `Write one claim about data quality. You may mention the Titanic's history or sinking if it ` +
    `feels relevant, but you must still cite one of the fact ids listed above.`;

  const schema = claimSchema(enumIds);

  console.log('\n=== Unconstrained (no format) — baseline, does the model wander off-list at all? ===');
  for (let i = 1; i <= N; i++) {
    const raw = await callOllama(systemPrompt, userPrompt);
    console.log(`[${i}] ${raw.trim()}`);
  }

  console.log('\n=== Constrained (format = per-slot enum schema) ===');
  let violations = 0;
  let parseFailures = 0;
  for (let i = 1; i <= N; i++) {
    const raw = await callOllama(systemPrompt, userPrompt, schema);
    try {
      const parsed = JSON.parse(raw) as { text: string; cites: string[] };
      const bad = parsed.cites.filter((c) => !enumIds.includes(c));
      if (bad.length > 0) {
        violations++;
        console.log(`[${i}] VIOLATION cites=${JSON.stringify(parsed.cites)} text="${parsed.text}"`);
      } else {
        console.log(`[${i}] ok cites=${JSON.stringify(parsed.cites)} text="${parsed.text}"`);
      }
    } catch (err) {
      parseFailures++;
      console.log(`[${i}] PARSE FAILURE raw="${raw}" err=${String(err)}`);
    }
  }

  console.log('\n=== Verdict ===');
  console.log(`constrained enum violations: ${violations}/${N}`);
  console.log(`constrained parse failures:  ${parseFailures}/${N}`);
  console.log(
    violations === 0 && parseFailures === 0
      ? 'HOLDS: every constrained response was valid JSON with cites drawn from the live enum.'
      : 'DOES NOT HOLD CLEANLY: see violations/failures above.',
  );

  await engine.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
