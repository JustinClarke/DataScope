// The in-browser WebLLM provider — the zero-egress rung of the conversational
// ladder. It plugs into the same AIProvider seam as the cloud router and Ollama,
// so the tool-use loop, lint, execution, retry cap, and transcript audit trail
// are all reused unchanged.
//
// The pinned model does not emit structured tool calls reliably; what it does
// reliably is single-shot SQL generation with plain-text extraction (wrapped in
// a <think> block, since the pin is a reasoning model — toolLadder.ts strips
// it before parsing or display). So this provider does not ask it to drive —
// it walks the shared ladder in `toolLadder.ts` and reads the reply the same
// way on every rung: SQL in the text becomes a call, prose ends the turn. The
// model chooses *what* to do; it never has to express that choice in a format
// it cannot produce.
//
// A4 removed the trapdoor that used to sit on this path: a row result no longer
// forces an answer-only round-trip, so a second query is reachable here too.
// The ladder's follow-up budget is what keeps the turn terminating.
import type {
  AIProvider,
  AITool,
  ProviderMessage,
  ProviderTurn,
} from "../types";
import { webllmChat, type WebLLMChatMessage } from "./webllm";
import {
  RUNG_INSTRUCTION,
  SQL_TOOL,
  extractSql,
  ladderRung,
  stripThink,
} from "./toolLadder";

/**
 * Render the loop's conversation for a plain chat model. Tool traffic becomes
 * prose: the model's own prior SQL as assistant text, execution results and
 * error traces as user text — the shape a chat-tuned small coder actually
 * follows, with nothing about the exchange hidden from it.
 */
export function toChatMessages(
  messages: ProviderMessage[],
): WebLLMChatMessage[] {
  const chat: WebLLMChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "system" || message.role === "user") {
      chat.push({ role: message.role, content: message.content });
    } else if (message.role === "assistant") {
      // Every call the model made, in emitted order — rendering only the first
      // would show it a history it did not have (A4 defect iii).
      const sql = (message.toolCalls ?? [])
        .map((call) => (call.input as { sql?: unknown })?.sql)
        .filter((s): s is string => typeof s === "string")
        .map((s) => "```sql\n" + s + "\n```")
        .join("\n");
      chat.push({ role: "assistant", content: sql || message.content });
    } else {
      chat.push({
        role: "user",
        content: `Result of running that SQL:\n${message.content}`,
      });
    }
  }
  return chat;
}

/** Settles with the chat result, or an AbortError the moment `signal` fires. */
function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted)
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function createWebLLMProvider(
  chat: (
    messages: WebLLMChatMessage[],
    options?: { maxTokens?: number },
  ) => Promise<string> = webllmChat,
): AIProvider {
  return {
    id: "webllm",
    async complete(messages, tools: AITool[], options): Promise<ProviderTurn> {
      const sqlTool = tools.find((t) => t.name === SQL_TOOL);
      const rung = ladderRung(messages, sqlTool !== undefined);
      const output = await raceAbort(
        chat(
          [
            ...toChatMessages(messages),
            { role: "user", content: RUNG_INSTRUCTION[rung] },
          ],
          { maxTokens: 2048 },
        ),
        options?.signal,
      );
      const text = stripThink(output);

      // The answer rung never carries a call; on the other two, SQL in the reply
      // is the call and prose is the answer. No SQL where SQL was asked for
      // means the model answered (or declined) — surfaced as text rather than
      // fabricating a call it did not make.
      const sql =
        rung === "answer" || sqlTool === undefined ? null : extractSql(output);
      if (sql === null) return { text, calls: [] };
      return {
        text,
        calls: [
          {
            id: crypto.randomUUID().replace(/-/g, "").slice(0, 9),
            name: sqlTool!.name,
            input: { sql },
          },
        ],
      };
    },
  };
}
