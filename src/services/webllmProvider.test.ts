import { describe, it, expect, vi } from 'vitest';
import { createWebLLMProvider, extractSql, toChatMessages } from './webllmProvider';
import type { WebLLMChatMessage } from './webllm';
import type { AITool, ProviderMessage } from '../types';

/** A chat fake with the real signature, recording the messages it was sent. */
function fakeChat(reply: string) {
  const calls: WebLLMChatMessage[][] = [];
  const chat = (messages: WebLLMChatMessage[]) => {
    calls.push(messages);
    return Promise.resolve(reply);
  };
  return { chat, calls };
}

function lastSent(calls: WebLLMChatMessage[][]): WebLLMChatMessage {
  const messages = calls[0];
  return messages[messages.length - 1];
}

const SQL_TOOL: AITool = {
  name: 'execute_local_sql',
  description: 'run sql',
  inputSchema: { type: 'object' },
};

const question: ProviderMessage[] = [
  { role: 'system', content: 'schema: "titanic"("Survived" INTEGER)' },
  { role: 'user', content: 'How many survived?' },
];

describe('extractSql', () => {
  it('takes a fenced sql block, first statement only', () => {
    expect(extractSql('```sql\nSELECT count(*) FROM "t";\nSELECT 2;\n```')).toBe(
      'SELECT count(*) FROM "t"',
    );
  });

  it('accepts bare SELECT and WITH text', () => {
    expect(extractSql('SELECT 1')).toBe('SELECT 1');
    expect(extractSql('WITH x AS (SELECT 1) SELECT * FROM x')).toMatch(/^WITH/);
  });

  it('returns null for prose', () => {
    expect(extractSql('I cannot answer that from this schema.')).toBeNull();
  });
});

describe('toChatMessages', () => {
  it('renders tool traffic as prose the model can follow', () => {
    const messages: ProviderMessage[] = [
      ...question,
      {
        role: 'assistant',
        content: '',
        toolCall: { id: 'abc123def', name: 'execute_local_sql', input: { sql: 'SELECT 1' } },
      },
      { role: 'tool', toolCallId: 'abc123def', content: '{"columns":["n"],"rowCount":1,"rows":[{"n":355}]}' },
    ];
    const chat = toChatMessages(messages);
    expect(chat[2]).toEqual({ role: 'assistant', content: '```sql\nSELECT 1\n```' });
    expect(chat[3].role).toBe('user');
    expect(chat[3].content).toContain('Result of running that SQL:');
    expect(chat[3].content).toContain('355');
  });
});

describe('createWebLLMProvider — deterministic control flow', () => {
  it('asks for SQL on a fresh question and wraps it as a tool call', async () => {
    const { chat, calls } = fakeChat('```sql\nSELECT count(*) FROM "titanic" WHERE "Survived" = 1\n```');
    const provider = createWebLLMProvider(chat);
    const turn = await provider.complete(question, [SQL_TOOL]);
    expect(turn.kind).toBe('tool_call');
    if (turn.kind !== 'tool_call') return;
    expect(turn.call.name).toBe('execute_local_sql');
    expect(turn.call.input).toEqual({ sql: 'SELECT count(*) FROM "titanic" WHERE "Survived" = 1' });
    expect(turn.call.id).toMatch(/^[a-zA-Z0-9]{9}$/);
    // The steering instruction rode along as the final message.
    expect(lastSent(calls).content).toContain('ONLY one DuckDB SQL SELECT');
  });

  it('asks for a plain-language answer once rows are in and returns a text turn', async () => {
    const { chat, calls } = fakeChat('355 passengers survived.');
    const provider = createWebLLMProvider(chat);
    const messages: ProviderMessage[] = [
      ...question,
      {
        role: 'assistant',
        content: '',
        toolCall: { id: 'abc123def', name: 'execute_local_sql', input: { sql: 'SELECT 1' } },
      },
      { role: 'tool', toolCallId: 'abc123def', content: '{"columns":["n"],"rowCount":1,"rows":[{"n":355}]}' },
    ];
    const turn = await provider.complete(messages, [SQL_TOOL]);
    expect(turn).toEqual({ kind: 'text', text: '355 passengers survived.' });
    expect(lastSent(calls).content).toContain('plain-language answer');
  });

  it('asks for corrected SQL after an error trace, not an answer', async () => {
    const { chat, calls } = fakeChat('SELECT count(*) FROM "titanic"');
    const provider = createWebLLMProvider(chat);
    const messages: ProviderMessage[] = [
      ...question,
      {
        role: 'assistant',
        content: '',
        toolCall: { id: 'abc123def', name: 'execute_local_sql', input: { sql: 'SELECT x FROM t' } },
      },
      { role: 'tool', toolCallId: 'abc123def', content: 'Query failed: table t does not exist' },
    ];
    const turn = await provider.complete(messages, [SQL_TOOL]);
    expect(turn.kind).toBe('tool_call');
    expect(lastSent(calls).content).toContain('ONLY one DuckDB SQL SELECT');
  });

  it('surfaces a prose reply as the final text instead of fabricating a call', async () => {
    const { chat } = fakeChat('That column is not in this dataset.');
    const provider = createWebLLMProvider(chat);
    const turn = await provider.complete(question, [SQL_TOOL]);
    expect(turn).toEqual({ kind: 'text', text: 'That column is not in this dataset.' });
  });

  it('rejects with AbortError when the signal is already aborted', async () => {
    const chat = vi.fn(() => new Promise<string>(() => {}));
    const provider = createWebLLMProvider(chat);
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.complete(question, [SQL_TOOL], { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
