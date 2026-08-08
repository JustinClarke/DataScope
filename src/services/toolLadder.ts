// The small-model determinism strategy (A4 defect ii) — shared by the Ollama
// and WebLLM providers, because both face the same unstructured-output problem
// and the old helpers were already shared across them (the defect record named
// only `ollamaProvider`; the cap governed the zero-egress WebLLM path too).
//
// **What was here before, and why it is not simply deleted.** The old rule was
// two rungs and a trapdoor: ask for SQL, and the moment a row result came back,
// omit `tools` entirely and append an answer-only instruction so the turn could
// only end as text. That was deliberate — the pinned `qwen2.5-coder:1.5b` never
// emits Ollama's structured `tool_calls`; it writes the call as prose, a JSON
// blob, or fenced SQL. Control flow was made rigid because the model could not
// be trusted to drive it. Removing it without a replacement regresses the 1.5b
// path to garbage; the cost of keeping it is one query per question, hard.
//
// **The replacement is a probe, not a deletion.** A model that demonstrably
// emits structured `tool_calls` drives itself: tools stay attached, nothing is
// appended, every call it emits is honoured. A model that does not keeps a
// deterministic ladder — but one with more than two rungs, so a *second* query
// is reachable without the model having to ask in a format it cannot produce.
// Either way the turn still terminates deterministically: the unstructured
// ladder's follow-up budget is finite and strictly decreasing, and past it the
// last rung is answer-only.
import type { ProviderMessage } from "../types";

/**
 * The catalog operation an extracted SQL statement is wrapped as. It is the
 * analyst core's own operation name (A0) rather than a loop-private alias,
 * because the loop now executes through the core — so the tool the model calls,
 * the operation that runs, and the `op` in the transcript are one name, and A5
 * has nothing to rename when it serves the same catalog over MCP.
 */
export const SQL_TOOL = "run_sql";

export const SQL_INSTRUCTION =
  "Reply with ONLY one DuckDB SQL SELECT statement that answers the question — " +
  "no explanation, no code fence commentary. DuckDB uses Postgres dialect: " +
  "double-quoted identifiers, LIMIT not TOP.";

export const ANSWER_INSTRUCTION =
  "The rows above answer the question. Reply with a short plain-language answer " +
  "for the user. Do not write SQL.";

/**
 * The rung the old ladder had no room for. It is the one that makes a second
 * query possible on a model that cannot request one: the reply is read the same
 * way either way — SQL in it becomes a call, prose ends the turn — so the model
 * picks the path by what it writes, not by a format it has to get right.
 */
export const CONTINUE_OR_ANSWER_INSTRUCTION =
  "The rows above are the result of that query. If they answer the question, " +
  "reply with a short plain-language answer for the user and no SQL. If you " +
  "still need one more query, reply with ONLY that DuckDB SQL SELECT statement.";

/**
 * How many further queries an unstructured model may ask for after its first
 * result. Bounded because this rung reads *prose* to decide control flow — a
 * model that keeps emitting SQL would otherwise never reach an answer. Past the
 * budget the ladder's last rung is answer-only, which is the guarantee the old
 * trapdoor gave unconditionally and this gives eventually.
 */
export const MAX_UNSTRUCTURED_FOLLOW_UPS = 2;

/**
 * Strip a reasoning model's `<think>...</think>` chain-of-thought before the
 * reply is parsed or shown. Also strips an unclosed `<think>` run to end of
 * string, since a token budget can truncate mid-thought before the closing tag.
 */
export function stripThink(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .trim();
}

/** Pull one SQL statement out of the model's text; null when there is none. */
export function extractSql(text: string): string | null {
  const withoutThink = stripThink(text);
  const fence = withoutThink.match(/```(?:sql|duckdb)?\s*([\s\S]*?)```/i);
  const candidate = (fence ? fence[1] : withoutThink)
    .trim()
    .split(";")[0]
    .trim();
  return /^\(*\s*(select|with)\b/i.test(candidate) ? candidate : null;
}

/**
 * What the last operation the loop ran actually did. The loop serializes every
 * outcome as JSON — an `OpResult` on success, an `OpError` carrying `ok: false`
 * on failure — so this reads the structured envelope rather than sniffing the
 * first character, which stopped distinguishing the two once errors became
 * structured too.
 */
export function lastToolOutcome(
  messages: ProviderMessage[],
): "rows" | "error" | "none" {
  const last = messages[messages.length - 1];
  if (last?.role !== "tool") return "none";
  try {
    return (JSON.parse(last.content) as { ok?: boolean }).ok === false
      ? "error"
      : "rows";
  } catch {
    return "error";
  }
}

/** How many queries this turn has already asked for — read off the conversation, so it needs no per-instance counter. */
function callsSoFar(messages: ProviderMessage[]): number {
  return messages.reduce(
    (n, m) => n + (m.role === "assistant" ? (m.toolCalls?.length ?? 0) : 0),
    0,
  );
}

export type LadderRung = "sql" | "continue-or-answer" | "answer";

/**
 * The rung for this round-trip, given the conversation so far. Only consulted
 * for a model that has not shown it can emit structured calls.
 *
 * - no result yet, or the last one failed → ask for (corrected) SQL;
 * - rows in and follow-ups left → let the model choose to continue or answer;
 * - otherwise → answer only, and the caller omits `tools`.
 */
export function ladderRung(
  messages: ProviderMessage[],
  hasSqlTool: boolean,
): LadderRung {
  if (!hasSqlTool) return "answer";
  const outcome = lastToolOutcome(messages);
  if (outcome === "none" || outcome === "error") return "sql";
  return callsSoFar(messages) > MAX_UNSTRUCTURED_FOLLOW_UPS
    ? "answer"
    : "continue-or-answer";
}

export const RUNG_INSTRUCTION: Record<LadderRung, string> = {
  sql: SQL_INSTRUCTION,
  "continue-or-answer": CONTINUE_OR_ANSWER_INSTRUCTION,
  answer: ANSWER_INSTRUCTION,
};

/**
 * One provider instance's memory of whether its model drives itself.
 *
 * Deliberately optimistic-then-latched: tools are offered on every rung that
 * could carry a call, so a tool-tuned model reveals itself on the first
 * round-trip and never returns to the ladder afterwards. It is never latched
 * the other way — one prose reply does not prove a model *cannot* emit calls,
 * only that it did not this time.
 */
export interface CapabilityProbe {
  /** True once the model has emitted at least one structured tool call. */
  readonly structured: boolean;
  observe(structuredCallCount: number): void;
}

export function createCapabilityProbe(): CapabilityProbe {
  let structured = false;
  return {
    get structured() {
      return structured;
    },
    observe(structuredCallCount: number) {
      if (structuredCallCount > 0) structured = true;
    },
  };
}
