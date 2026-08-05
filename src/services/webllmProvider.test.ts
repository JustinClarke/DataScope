import { describe, it, expect, vi } from 'vitest';
import { createWebLLMProvider, toChatMessages } from './webllmProvider';
import { MAX_UNSTRUCTURED_FOLLOW_UPS, SQL_TOOL, extractSql } from './toolLadder';
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

const SQL_TOOL_DEF: AITool = {
  name: SQL_TOOL,
  description: 'run sql',
  inputSchema: { type: 'object' },
};

const question: ProviderMessage[] = [
  { role: 'system', content: 'schema: "titanic"("Survived" INTEGER)' },
  { role: 'user', content: 'How many survived?' },
];

/** The loop's own tool-result shape: an `OpResult` on success, an `OpError` on failure. */
const rowResult = JSON.stringify({ op: SQL_TOOL, sql: 'SELECT 1', resultId: 'r1', schema: [{ name: 'n', type: 'BIGINT' }], rowCount: 1, rows: [[355]], complete: true, nextOffset: null, elapsedMs: 1 });
const errorResult = JSON.stringify({ ok: false, code: 'sql_error', message: 'table t does not exist' });

const afterOneQuery = (result: string, sql = 'SELECT 1'): ProviderMessage[] => [
  ...question,
  { role: 'assistant', content: '', toolCalls: [{ id: 'abc123def', name: SQL_TOOL, input: { sql } }] },
  { role: 'tool', toolCallId: 'abc123def', content: result },
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
    const chat = toChatMessages(afterOneQuery(rowResult));
    expect(chat[2]).toEqual({ role: 'assistant', content: '```sql\nSELECT 1\n```' });
    expect(chat[3].role).toBe('user');
    expect(chat[3].content).toContain('Result of running that SQL:');
    expect(chat[3].content).toContain('355');
  });

  it('renders every call the assistant made, not just the first (A4 defect iii)', () => {
    const chat = toChatMessages([
      ...question,
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'a', name: SQL_TOOL, input: { sql: 'SELECT 1' } },
          { id: 'b', name: SQL_TOOL, input: { sql: 'SELECT 2' } },
        ],
      },
    ]);
    expect(chat[2].content).toContain('SELECT 1');
    expect(chat[2].content).toContain('SELECT 2');
  });
});

describe('createWebLLMProvider — deterministic control flow', () => {
  it('asks for SQL on a fresh question and wraps it as a tool call', async () => {
    const { chat, calls } = fakeChat('```sql\nSELECT count(*) FROM "titanic" WHERE "Survived" = 1\n```');
    const provider = createWebLLMProvider(chat);
    const turn = await provider.complete(question, [SQL_TOOL_DEF]);
    expect(turn.calls).toHaveLength(1);
    expect(turn.calls[0].name).toBe(SQL_TOOL);
    expect(turn.calls[0].input).toEqual({ sql: 'SELECT count(*) FROM "titanic" WHERE "Survived" = 1' });
    expect(turn.calls[0].id).toMatch(/^[a-zA-Z0-9]{9}$/);
    // The steering instruction rode along as the final message.
    expect(lastSent(calls).content).toContain('ONLY one DuckDB SQL SELECT');
  });

  it('lets the model answer once rows are in and returns a text turn', async () => {
    const { chat, calls } = fakeChat('355 passengers survived.');
    const provider = createWebLLMProvider(chat);
    const turn = await provider.complete(afterOneQuery(rowResult), [SQL_TOOL_DEF]);
    expect(turn).toEqual({ text: '355 passengers survived.', calls: [] });
    expect(lastSent(calls).content).toContain('If they answer the question');
  });

  it('lets the model run a SECOND query after rows come back (A4 defect ii — the shared cap)', async () => {
    // The zero-egress path was governed by the same withdrawal rule as Ollama,
    // because these helpers are shared. One query per question, hard — here.
    const { chat } = fakeChat('```sql\nSELECT avg("Fare") FROM "titanic"\n```');
    const provider = createWebLLMProvider(chat);
    const turn = await provider.complete(afterOneQuery(rowResult), [SQL_TOOL_DEF]);
    expect(turn.calls).toHaveLength(1);
    expect(turn.calls[0].input).toEqual({ sql: 'SELECT avg("Fare") FROM "titanic"' });
  });

  it('falls back to an answer-only rung once the follow-up budget is spent, so the turn still terminates', async () => {
    const { chat, calls } = fakeChat('```sql\nSELECT 1\n```');
    const provider = createWebLLMProvider(chat);
    const spent: ProviderMessage[] = [
      ...question,
      ...Array.from({ length: MAX_UNSTRUCTURED_FOLLOW_UPS + 1 }, (_, n): ProviderMessage[] => [
        { role: 'assistant', content: '', toolCalls: [{ id: `t${n}`, name: SQL_TOOL, input: { sql: `SELECT ${n}` } }] },
        { role: 'tool', toolCallId: `t${n}`, content: rowResult },
      ]).flat(),
    ];

    const turn = await provider.complete(spent, [SQL_TOOL_DEF]);

    expect(turn.calls).toEqual([]);
    expect(lastSent(calls).content).toContain('plain-language answer');
  });

  it('asks for corrected SQL after an error envelope, not an answer', async () => {
    const { chat, calls } = fakeChat('SELECT count(*) FROM "titanic"');
    const provider = createWebLLMProvider(chat);
    const turn = await provider.complete(afterOneQuery(errorResult, 'SELECT x FROM t'), [SQL_TOOL_DEF]);
    expect(turn.calls).toHaveLength(1);
    expect(lastSent(calls).content).toContain('ONLY one DuckDB SQL SELECT');
  });

  it('surfaces a prose reply as the final text instead of fabricating a call', async () => {
    const { chat } = fakeChat('That column is not in this dataset.');
    const provider = createWebLLMProvider(chat);
    const turn = await provider.complete(question, [SQL_TOOL_DEF]);
    expect(turn).toEqual({ text: 'That column is not in this dataset.', calls: [] });
  });

  it('rejects with AbortError when the signal is already aborted', async () => {
    const chat = vi.fn(() => new Promise<string>(() => {}));
    const provider = createWebLLMProvider(chat);
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.complete(question, [SQL_TOOL_DEF], { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
