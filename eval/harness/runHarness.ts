// Runs the labeled question set through the real six-stage pipeline
// (src/services/ai.ts `askAI`) once per provider/mode — the harness never
// re-implements NL→SQL scoring logic against a second, harness-only pipeline
// (D58): it drives the exact function the product calls.
import { askAI } from '../../src/services/ai';
import { createAnalystCore } from '../../src/lib/analyst/core';
import { connectAnalystMcp, type AnalystMcpSession } from '../../src/lib/analyst/mcp/connect';
import { PRODUCT_SURFACE_OPERATIONS } from '../../src/lib/analyst/toolSchemas';
import type { Executor } from '../../src/lib/analyst/types';
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
  // Prose *and* every emitted call — a turn can carry both (A4).
  const completionChars =
    turn.text.length + turn.calls.reduce((n, c) => n + JSON.stringify(c.input).length, 0);
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

/**
 * The harness's analyst core, over the **same connection** the datasets were
 * loaded into — materializations have to land in the catalog the tables live in
 * or `read_result` pages nothing.
 *
 * No `catalog` seam is supplied, so this core is read-only: the three derive
 * verbs refuse. That is right for the harness, which measures the NL→SQL loop
 * and never derives (D74(d) — `eval/` is a harness, not a second product path).
 */
export function createHarnessCore(engine: EvalEngine) {
  const executor: Executor = {
    engine: 'duckdb-wasm',
    async execute(sql) {
      const result = await engine.execute(sql);
      return { columnNames: result.columnNames, rows: result.rows, elapsedMs: result.executionTimeMs };
    },
  };
  return createAnalystCore(executor, { authority: 'shared' });
}

/**
 * The D74 scored surface, enforced at the one place it matters (A6).
 *
 * `create_chart` and `pin_result` are product surface — one draws, one keeps —
 * and neither produces a gradeable analytical fact, so the scored run does not
 * offer them. This is not tidiness: D74 froze the scored catalog and warned that
 * **tool count is itself one of the variables being measured**, so a run that
 * advertised the app's full twenty tools would not be comparable with the runs
 * that established the numbers.
 *
 * A filter over the server's own declarations, keyed on the catalog's
 * `PRODUCT_SURFACE_OPERATIONS` tag rather than a name list copied into `eval/` —
 * a third operation of the same kind lands here without anyone remembering to.
 * Calls are untouched: nothing is intercepted, and a model that named one anyway
 * would get the core's ordinary `No tool named` refusal.
 */
function scoredSurfaceOnly(session: AnalystMcpSession): AnalystMcpSession {
  return {
    ...session,
    async tools() {
      return (await session.tools()).filter((tool) => !PRODUCT_SURFACE_OPERATIONS.has(tool.name));
    },
  };
}

export async function runHarness(
  engine: EvalEngine,
  datasets: EvalDataset[],
  questions: EvalQuestion[],
  providerConfig: ProviderConfig,
): Promise<HarnessResult> {
  const byDataset = new Map(datasets.map((d) => [d.id, d.tables]));
  const core = createHarnessCore(engine);
  // A5: the harness drives the loop over the same MCP surface the tab uses. An
  // in-memory pair, not stdio — this process owns both ends, and per D74(d) the
  // transport a harness picks authorizes nothing in the product either way.
  const session = await connectAnalystMcp(core);
  const scoredSession = scoredSurfaceOnly(session);
  const scores: QuestionScore[] = [];
  const estTokensByQuestion = new Map<string, number>();

  for (const question of questions) {
    const tables = byDataset.get(question.dataset);
    if (!tables) throw new Error(`No tables loaded for dataset "${question.dataset}"`);

    let tokensThisTurn = 0;
    const provider = withTokenTracking(providerConfig.create(question), (t) => {
      tokensThisTurn += t;
    });

    const turn = await askAI(question.question, { provider, tables, core, session: scoredSession });

    estTokensByQuestion.set(question.id, tokensThisTurn);
    const score = await scoreTurn(engine, providerConfig.id, question.id, question.referenceSql, turn);
    scores.push(score);
  }

  await session.close();
  await core.close();
  return { summary: summarize(providerConfig.id, scores, estTokensByQuestion), scores };
}
