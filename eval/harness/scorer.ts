// D40 metrics (§11.4): exec-rate, result-correctness, cost per turn,
// repair-rate — computed the same way for every provider/mode so the report
// is a fair comparison, not a per-provider bespoke scoring path.
import type { AITurn, QueryResult } from '../../src/types';
import type { EvalEngine } from '../duckdb/duckdb';

/** Order-insensitive, numerically-rounded result comparison — a differently
 * shaped but equivalent query still scores correct (mirrors spike-webllm's
 * criterion-B scorer). */
function normalizeRows(result: QueryResult): string {
  const round = (v: unknown) => {
    const n = typeof v === 'bigint' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(2)) : n;
  };
  const rows = result.rows.map((row) => row.map(round));
  rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(rows);
}

export interface QuestionScore {
  questionId: string;
  provider: string;
  /** Did the turn produce at least one successfully-executed SQL attempt? */
  execOk: boolean;
  /** Among exec-ok turns: did the *final* successful result match the reference execution? */
  resultCorrect: boolean | null;
  /** The turn needed at least one repair (a failed attempt before success or the final answer). */
  neededRepair: boolean;
  /** True when a repair was needed AND the turn still ended exec-ok. Null when no repair was needed (excluded from repair-rate). */
  repairSucceeded: boolean | null;
  attemptCount: number;
  error?: string;
}

export async function scoreTurn(
  engine: EvalEngine,
  provider: string,
  questionId: string,
  referenceSql: string,
  turn: AITurn,
): Promise<QuestionScore> {
  const attempts = turn.attempts ?? [];
  const neededRepair = attempts.length > 1 || (attempts.length === 1 && attempts[0].status === 'error');
  const lastOk = [...attempts].reverse().find((a) => a.status === 'ok');
  const execOk = lastOk !== undefined;

  let resultCorrect: boolean | null = null;
  if (execOk && lastOk) {
    try {
      const [expected, got] = await Promise.all([
        engine.execute(referenceSql),
        engine.execute(lastOk.sql),
      ]);
      resultCorrect = normalizeRows(expected) === normalizeRows(got);
    } catch {
      resultCorrect = false;
    }
  }

  return {
    questionId,
    provider,
    execOk,
    resultCorrect,
    neededRepair,
    repairSucceeded: neededRepair ? execOk : null,
    attemptCount: attempts.length,
    error: turn.error,
  };
}

export interface ProviderSummary {
  provider: string;
  total: number;
  execRate: number;
  correctnessRate: number;
  repairRate: number | null;
  avgEstTokensPerTurn: number;
}

export function summarize(provider: string, scores: QuestionScore[], estTokensByQuestion: Map<string, number>): ProviderSummary {
  const total = scores.length;
  const execCount = scores.filter((s) => s.execOk).length;
  const correctCount = scores.filter((s) => s.resultCorrect === true).length;
  const repairEligible = scores.filter((s) => s.neededRepair);
  const repairSucceeded = repairEligible.filter((s) => s.repairSucceeded === true).length;
  const totalTokens = scores.reduce((sum, s) => sum + (estTokensByQuestion.get(s.questionId) ?? 0), 0);

  return {
    provider,
    total,
    execRate: total === 0 ? 0 : execCount / total,
    correctnessRate: total === 0 ? 0 : correctCount / total,
    repairRate: repairEligible.length === 0 ? null : repairSucceeded / repairEligible.length,
    avgEstTokensPerTurn: total === 0 ? 0 : totalTokens / total,
  };
}
