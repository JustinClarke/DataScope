// Runs the labeled question set through the real six-stage pipeline
// (src/services/ai.ts `askAI`) once per provider/mode — the harness never
// re-implements NL→SQL scoring logic against a second, harness-only pipeline
// (D58): it drives the exact function the product calls.
import { askAI } from '../../src/services/ai';
import type { AIProvider, ProviderMessage, ProviderTurn, AITool } from '../../src/types';
import type { EvalEngine } from '../duckdb/duckdb';
import type { EvalDataset } from '../dataset/tables';
import type { EvalQuestion } from '../dataset/questions';
import { scoreTurn, summarize, type ProviderSummary, type QuestionScore } from './scorer';

/** No provider reports real token usage (none of the three backends here are
 * a metered API), so cost is an estimated-tokens proxy — prompt+completion
 * character length / 4, the standard rough approximation — computed
 * uniformly across providers so the comparison is fair, not a real dollar
 * figure. Zero-egress providers (local-template, webllm) are $0 either way;
 * this column exists so a future metered cloud backend has a comparable
 * baseline shape to slot into (§11.4). */
function estimateTokens(messages: ProviderMessage[], turn: ProviderTurn): number {
  const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const completionChars = turn.kind === 'text' ? turn.text.length : JSON.stringify(turn.call.input).length;
  return Math.ceil((promptChars + completionChars) / 4);
}

function withTokenTracking(provider: AIProvider, onCall: (tokens: number) => void): AIProvider {
  return {
    id: provider.id,
    async complete(messages: ProviderMessage[], tools: AITool[], options?: { signal?: AbortSignal }) {
      const turn = await provider.complete(messages, tools, options);
      onCall(estimateTokens(messages, turn));
      return turn;
    },
  };
}

export interface ProviderConfig {
  id: string;
  create: (question: EvalQuestion) => AIProvider;
}

export interface HarnessResult {
  summary: ProviderSummary;
  scores: QuestionScore[];
}

export async function runHarness(
  engine: EvalEngine,
  datasets: EvalDataset[],
  questions: EvalQuestion[],
  providerConfig: ProviderConfig,
): Promise<HarnessResult> {
  const byDataset = new Map(datasets.map((d) => [d.id, d.tables]));
  const scores: QuestionScore[] = [];
  const estTokensByQuestion = new Map<string, number>();

  for (const question of questions) {
    const tables = byDataset.get(question.dataset);
    if (!tables) throw new Error(`No tables loaded for dataset "${question.dataset}"`);

    let tokensThisTurn = 0;
    const provider = withTokenTracking(providerConfig.create(question), (t) => {
      tokensThisTurn += t;
    });

    const turn = await askAI(question.question, {
      provider,
      tables,
      runSql: (sql: string) => engine.execute(sql),
    });

    estTokensByQuestion.set(question.id, tokensThisTurn);
    const score = await scoreTurn(engine, providerConfig.id, question.id, question.referenceSql, turn);
    scores.push(score);
  }

  return { summary: summarize(providerConfig.id, scores, estTokensByQuestion), scores };
}
