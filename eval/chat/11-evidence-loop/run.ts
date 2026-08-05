import { createEvalEngine } from '../../duckdb/duckdb';
import { loadEvalDatasets } from '../../dataset/tables';
import type { DatasetPassport, ValidatedAnswer } from './contracts';
import { OLLAMA_CHAT_URL, OLLAMA_MODEL, OLLAMA_NUM_CTX, draftAnswer, planQuestion } from './ollama';
import { buildPassport, compactPassport } from './passport';
import { executePlan } from './probes';
import { validateAnswer } from './validator';

const QUESTIONS = [
  'What can I understand from this ecommerce data?',
  'What can I present to a sales team from this data?',
  'What is something odd in the data that could help us investigate how to drive sales?',
  'What transforms should I apply to take the analysis further?',
];

interface QuestionResult {
  question: string;
  planned: boolean;
  evidenceCount: number;
  answer?: ValidatedAnswer;
  error?: string;
  promptTokens: number;
  responseTokens: number;
}

function printPassport(passport: DatasetPassport): void {
  console.log('\n=== Deterministic passport ===');
  console.log(JSON.stringify(compactPassport(passport), null, 2));
}

async function ollamaReachable(): Promise<boolean> {
  const tagsUrl = OLLAMA_CHAT_URL.replace(/\/api\/chat$/, '/api/tags').replace(/\/v1\/chat\/completions$/, '/api/tags');
  try {
    const response = await fetch(tagsUrl, { signal: AbortSignal.timeout(5_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const engine = await createEvalEngine();
  try {
    const dataset = (await loadEvalDatasets(engine)).find((candidate) => candidate.id === 'ecommerce');
    if (!dataset) throw new Error('ecommerce fixture not found');
    const passport = await buildPassport(engine, dataset.id, dataset.tables);
    printPassport(passport);

    console.log(`\n=== Live semantic arm ===\nmodel=${OLLAMA_MODEL} num_ctx=${OLLAMA_NUM_CTX} endpoint=${OLLAMA_CHAT_URL}`);
    if (!(await ollamaReachable())) {
      console.log('SKIPPED: Ollama endpoint is not reachable from this process. The deterministic passport completed.');
      process.exitCode = 2;
      return;
    }

    const limit = Math.max(1, Math.min(QUESTIONS.length, Number(process.env.EVAL_QUESTION_LIMIT ?? QUESTIONS.length)));
    const results: QuestionResult[] = [];
    for (const question of QUESTIONS.slice(0, limit)) {
      console.log(`\n--- ${question} ---`);
      try {
        let planned = await planQuestion(passport, question);
        let evidence;
        try {
          evidence = await executePlan(engine, passport, planned.plan);
        } catch (firstError) {
          console.log(`PLAN REJECTED; requesting one repair: ${String(firstError)}`);
          planned = await planQuestion(passport, question, String(firstError));
          evidence = await executePlan(engine, passport, planned.plan);
        }
        const drafted = await draftAnswer(passport, question, evidence);
        const answer = validateAnswer(drafted.answer, evidence);
        const result: QuestionResult = {
          question,
          planned: true,
          evidenceCount: evidence.length,
          answer,
          promptTokens: planned.metadata.promptTokens + drafted.metadata.promptTokens,
          responseTokens: planned.metadata.responseTokens + drafted.metadata.responseTokens,
        };
        results.push(result);
        console.log(JSON.stringify({ plan: planned.plan, evidence: evidence.map((item) => ({ id: item.id, statement: item.statement })), answer }, null, 2));
      } catch (error) {
        const result: QuestionResult = {
          question,
          planned: false,
          evidenceCount: 0,
          error: String(error),
          promptTokens: 0,
          responseTokens: 0,
        };
        results.push(result);
        console.log(`FAILED CLOSED: ${result.error}`);
      }
    }

    const planned = results.filter((result) => result.planned && result.evidenceCount > 0).length;
    const grounded = results.filter((result) => (result.answer?.findings.length ?? 0) > 0).length;
    const retained = results.flatMap((result) => result.answer?.findings ?? []);
    const citationsValid = retained.every((finding) => finding.evidenceIds.length > 0);
    const required = limit === 4 ? 3 : Math.ceil(limit * 0.75);
    const passed = planned >= required && grounded >= required && citationsValid;
    console.log('\n=== Verdict ===');
    console.log(JSON.stringify({ questions: limit, plannedWithEvidence: planned, groundedAnswers: grounded, retainedFindings: retained.length, citationsValid, required, passed }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await engine.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
