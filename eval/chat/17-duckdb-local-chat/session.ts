// Multi-turn state (build order step 4, experiment doc "Conversation state").
//
// Chat history is not the data source — every turn is still recomputed by
// DuckDB. This keeps a compact typed record per turn (never raw result rows)
// and, on a follow-up, resolves it to a standalone question from that typed
// state before it ever reaches `chat.ts`'s query loop, which has no memory of
// its own. Bounded to the three most recent turns, so a long conversation's
// context cost stays flat rather than growing every turn.
import type { CallUsage, ChatMessage } from './ollama';
import { callForText } from './ollama';
import type { TurnResult, TurnStatus } from './chat';

const MAX_KEPT_TURNS = 3;

export interface TurnSummary {
  turnId: number;
  question: string;
  standaloneQuestion: string;
  status: TurnStatus;
  sql: string | null;
  assumptions: string[];
  resultSchema: string[] | null;
  /** A short description, never raw rows — e.g. "1 row: 842" or "5 rows, columns: category, revenue". */
  resultSummary: string;
}

export interface Session {
  turns: TurnSummary[];
}

export function createSession(): Session {
  return { turns: [] };
}

function summarizeResult(result: TurnResult): string {
  if (result.status === 'unsupported') return `unsupported — ${result.reason ?? ''}`;
  if (result.status === 'refused') return `refused — ${result.reason ?? ''}`;
  if (result.status === 'error') return `error — ${result.reason ?? ''}`;
  if (!result.result) return 'answered — no result';
  const { rows, columnNames, totalCount, rowTruncated } = result.result;
  if (rows.length === 1 && columnNames.length === 1) return `1 row: ${String(rows[0]![0])}`;
  return `${totalCount} row(s)${rowTruncated ? ' (truncated)' : ''}, columns: ${columnNames.join(', ')}`;
}

/** Builds the typed summary appended to the session after a turn runs. */
export function buildTurnSummary(turnId: number, question: string, standaloneQuestion: string, result: TurnResult): TurnSummary {
  return {
    turnId,
    question,
    standaloneQuestion,
    status: result.status,
    sql: result.sql,
    assumptions: result.assumptions,
    resultSchema: result.result?.columnNames ?? null,
    resultSummary: summarizeResult(result),
  };
}

/** Appends a turn summary, keeping only the most recent `MAX_KEPT_TURNS`. */
export function recordTurn(session: Session, summary: TurnSummary): Session {
  return { turns: [...session.turns, summary].slice(-MAX_KEPT_TURNS) };
}

export interface ResolveResult {
  standaloneQuestion: string;
  usage: CallUsage | null;
}

/**
 * Resolves a follow-up like "now by month" to a standalone question using the
 * session's typed turn summaries — e.g. "Break completed revenue down by
 * calendar month, preserving the previous completed-order scope." The first
 * turn of a session needs no resolution and costs no model call.
 */
export async function resolveStandaloneQuestion(
  model: string,
  question: string,
  session: Session,
  baseUrl?: string,
): Promise<ResolveResult> {
  if (session.turns.length === 0) {
    return { standaloneQuestion: question, usage: null };
  }

  const context = session.turns
    .map(
      (t) =>
        `Turn ${t.turnId}: asked "${t.question}", resolved as "${t.standaloneQuestion}", status ${t.status}` +
        (t.sql ? `, SQL: ${t.sql}` : '') +
        `, result: ${t.resultSummary}`,
    )
    .join('\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Rewrite the user\'s follow-up into one fully standalone question, using the recent turns below for scope and ' +
        'filters (e.g. "only completed", "by category") that the follow-up does not repeat. Preserve prior scope unless ' +
        'the follow-up clearly changes it. Reply with ONLY the standalone question as one plain-text sentence — no SQL, ' +
        `no explanation.\n\nRecent turns:\n${context}`,
    },
    { role: 'user', content: question },
  ];

  const { text, usage } = await callForText(model, messages, baseUrl);
  return { standaloneQuestion: text.trim(), usage };
}
