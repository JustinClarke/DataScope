// The in-browser WebLLM provider — the zero-egress rung of the conversational
// ladder. It plugs into the same AIProvider seam as the cloud router and Ollama,
// so the tool-use loop, lint, execution, retry cap, and transcript audit trail
// are all reused unchanged.
//
// The pinned 1.5B coder does not emit structured tool calls reliably; what it
// does reliably is single-shot SQL generation with plain-text extraction. So
// this provider keeps the control flow deterministic and asks the model only
// for content: when the conversation needs SQL (a fresh question, a failed or
// lint-blocked attempt) it prompts for one SELECT and wraps the extracted text
// as an execute_local_sql call; when the last tool result carries rows it
// prompts for a plain-language answer and returns a text turn. The model never
// chooses the control path, so the loop's caps still bound every turn.
import type { AIProvider, AITool, ProviderMessage, ProviderTurn } from '../types';
import { webllmChat, type WebLLMChatMessage } from './webllm';

// The instructions and mode test are shared with the Ollama provider — the same
// pinned small coder runs behind both, so both drive it the same deterministic way.
export const SQL_INSTRUCTION =
  'Reply with ONLY one DuckDB SQL SELECT statement that answers the question — ' +
  'no explanation, no code fence commentary. DuckDB uses Postgres dialect: ' +
  'double-quoted identifiers, LIMIT not TOP.';

export const ANSWER_INSTRUCTION =
  'The rows above answer the question. Reply with a short plain-language answer ' +
  'for the user. Do not write SQL.';

/** Pull one SQL statement out of the model's text; null when there is none. */
export function extractSql(text: string): string | null {
  const fence = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  const candidate = (fence ? fence[1] : text).trim().split(';')[0].trim();
  return /^\(*\s*(select|with)\b/i.test(candidate) ? candidate : null;
}

/**
 * Render the loop's conversation for a plain chat model. Tool traffic becomes
 * prose: the model's own prior SQL as assistant text, execution results and
 * error traces as user text — the shape a chat-tuned small coder actually
 * follows, with nothing about the exchange hidden from it.
 */
export function toChatMessages(messages: ProviderMessage[]): WebLLMChatMessage[] {
  const chat: WebLLMChatMessage[] = [];
  for (const message of messages) {
    if (message.role === 'system' || message.role === 'user') {
      chat.push({ role: message.role, content: message.content });
    } else if (message.role === 'assistant') {
      const sql =
        message.toolCall && typeof (message.toolCall.input as { sql?: unknown })?.sql === 'string'
          ? ((message.toolCall.input as { sql: string }).sql)
          : null;
      chat.push({ role: 'assistant', content: sql ? '```sql\n' + sql + '\n```' : message.content });
    } else {
      chat.push({ role: 'user', content: `Result of running that SQL:\n${message.content}` });
    }
  }
  return chat;
}

/** The loop serializes a successful execution as a JSON object; errors are prose. */
export function lastToolResultIsRows(messages: ProviderMessage[]): boolean {
  const last = messages[messages.length - 1];
  return last?.role === 'tool' && last.content.trimStart().startsWith('{');
}

/** Settles with the chat result, or an AbortError the moment `signal` fires. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export function createWebLLMProvider(
  chat: (messages: WebLLMChatMessage[], options?: { maxTokens?: number }) => Promise<string> = webllmChat,
): AIProvider {
  return {
    id: 'webllm',
    async complete(messages, tools: AITool[], options): Promise<ProviderTurn> {
      const sqlTool = tools.find((t) => t.name === 'execute_local_sql');
      const rendered = toChatMessages(messages);

      // Rows are in: ask for the answer, end the loop with a text turn.
      if (sqlTool === undefined || lastToolResultIsRows(messages)) {
        const text = await raceAbort(
          chat([...rendered, { role: 'user', content: ANSWER_INSTRUCTION }], { maxTokens: 256 }),
          options?.signal,
        );
        return { kind: 'text', text: text.trim() };
      }

      // Fresh question or a failed attempt: ask for (corrected) SQL.
      const output = await raceAbort(
        chat([...rendered, { role: 'user', content: SQL_INSTRUCTION }], { maxTokens: 256 }),
        options?.signal,
      );
      const sql = extractSql(output);
      // No SQL in the output means the model answered in prose (or declined) —
      // surface that as the final text rather than fabricating a call.
      if (sql === null) return { kind: 'text', text: output.trim() };
      return {
        kind: 'tool_call',
        call: { id: crypto.randomUUID().replace(/-/g, '').slice(0, 9), name: sqlTool.name, input: { sql } },
      };
    },
  };
}
