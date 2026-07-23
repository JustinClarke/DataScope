import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider, isOllamaEndpoint, DEFAULT_OLLAMA_MODEL } from './ollamaProvider';
import type { AITool, ProviderMessage } from '../types';

const TOOLS: AITool[] = [
  { name: 'execute_local_sql', description: 'run sql', inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } },
];
const MESSAGES: ProviderMessage[] = [
  { role: 'system', content: 'schema' },
  { role: 'user', content: 'average fare' },
];

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe('createOllamaProvider', () => {
  it('posts to the localhost /api/chat endpoint with mapped tools and returns a text turn', async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(ok({ message: { role: 'assistant', content: 'The average fare is 33.' } })));
    const provider = createOllamaProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const turn = await provider.complete(MESSAGES, TOOLS);

    expect(turn).toEqual({ kind: 'text', text: 'The average fare is 33.' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    const sent = JSON.parse(init!.body as string);
    expect(sent.model).toBe(DEFAULT_OLLAMA_MODEL);
    expect(sent.stream).toBe(false);
    expect(sent.tools[0]).toMatchObject({ type: 'function', function: { name: 'execute_local_sql' } });
  });

  it('maps a tool call in the response to a provider tool_call turn', async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(ok({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'execute_local_sql', arguments: { sql: 'SELECT avg(fare) FROM t' } } }] } })),
    );
    const provider = createOllamaProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const turn = await provider.complete(MESSAGES, TOOLS);

    expect(turn.kind).toBe('tool_call');
    if (turn.kind === 'tool_call') {
      expect(turn.call.name).toBe('execute_local_sql');
      expect(turn.call.input).toEqual({ sql: 'SELECT avg(fare) FROM t' });
      expect(turn.call.id).toBeTruthy();
    }
  });

  it('replays an assistant tool call and a tool result into Ollama message shape', async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(ok({ message: { role: 'assistant', content: 'done' } })));
    const provider = createOllamaProvider({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: 'http://host:9/', model: 'coder' });

    await provider.complete(
      [
        ...MESSAGES,
        { role: 'assistant', content: '', toolCall: { id: 't1', name: 'execute_local_sql', input: { sql: 'SELECT 1' } } },
        { role: 'tool', toolCallId: 't1', content: '{"rows":[]}' },
      ],
      TOOLS,
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://host:9/api/chat'); // trailing slash trimmed
    const sent = JSON.parse(init!.body as string);
    expect(sent.model).toBe('coder');
    expect(sent.messages[2]).toEqual({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'execute_local_sql', arguments: { sql: 'SELECT 1' } } }] });
    expect(sent.messages[3]).toEqual({ role: 'tool', content: '{"rows":[]}' });
  });

  it('extracts plain-text SQL from a coder that never emits structured tool_calls', async () => {
    // The pinned qwen2.5-coder:1.5b replies with fenced SQL (or prose), not
    // tool_calls — probed live against a real daemon. The provider must wrap
    // the extracted statement as an execute_local_sql call itself.
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(ok({ message: { role: 'assistant', content: 'Here you go:\n```sql\nSELECT COUNT(*) FROM "titanic" WHERE "Survived" = 1;\n```' } })),
    );
    const provider = createOllamaProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const turn = await provider.complete(MESSAGES, TOOLS);

    expect(turn.kind).toBe('tool_call');
    if (turn.kind === 'tool_call') {
      expect(turn.call.name).toBe('execute_local_sql');
      expect(turn.call.input).toEqual({ sql: 'SELECT COUNT(*) FROM "titanic" WHERE "Survived" = 1' });
    }
    // SQL mode: the request carries the tools and appends the SQL instruction.
    const sent = JSON.parse(fetchImpl.mock.calls[0][1]!.body as string);
    expect(sent.tools).toBeDefined();
    expect(sent.messages.at(-1)).toMatchObject({ role: 'user', content: expect.stringContaining('ONLY one DuckDB SQL SELECT') });
  });

  it('asks for a plain-language answer, with no tools offered, once rows are in', async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(ok({ message: { role: 'assistant', content: '342 passengers survived.' } })),
    );
    const provider = createOllamaProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const turn = await provider.complete(
      [
        ...MESSAGES,
        { role: 'assistant', content: '', toolCall: { id: 't1', name: 'execute_local_sql', input: { sql: 'SELECT 1' } } },
        { role: 'tool', toolCallId: 't1', content: '{"rows":[{"count":342}]}' },
      ],
      TOOLS,
    );

    expect(turn).toEqual({ kind: 'text', text: '342 passengers survived.' });
    // Answer mode: tools omitted so the model cannot be offered a call; the
    // answer instruction rides as the final user message.
    const sent = JSON.parse(fetchImpl.mock.calls[0][1]!.body as string);
    expect(sent.tools).toBeUndefined();
    expect(sent.messages.at(-1)).toMatchObject({ role: 'user', content: expect.stringContaining('plain-language answer') });
  });

  it('retries SQL mode after an error trace (a failed attempt is not rows)', async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(ok({ message: { role: 'assistant', content: '```sql\nSELECT "Fare" FROM "titanic"\n```' } })),
    );
    const provider = createOllamaProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const turn = await provider.complete(
      [
        ...MESSAGES,
        { role: 'assistant', content: '', toolCall: { id: 't1', name: 'execute_local_sql', input: { sql: 'SELECT fare FROM t' } } },
        { role: 'tool', toolCallId: 't1', content: 'Binder Error: column "fare" not found' },
      ],
      TOOLS,
    );

    expect(turn.kind).toBe('tool_call');
    const sent = JSON.parse(fetchImpl.mock.calls[0][1]!.body as string);
    expect(sent.tools).toBeDefined();
  });

  it('throws a helpful error when the daemon rejects the request', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response);
    const provider = createOllamaProvider({ fetchImpl });

    await expect(provider.complete(MESSAGES, TOOLS)).rejects.toThrow(/Ollama request failed \(404\)/);
  });
});

describe('isOllamaEndpoint — API mode field-shape detection (D9, 2026-07-22)', () => {
  it('treats http/https URLs as a local Ollama endpoint', () => {
    expect(isOllamaEndpoint('http://localhost:11434')).toBe(true);
    expect(isOllamaEndpoint('https://ollama.local:1234')).toBe(true);
    expect(isOllamaEndpoint('  http://localhost:11434  ')).toBe(true); // whitespace-tolerant
  });

  it('treats an opaque bearer key as not an endpoint', () => {
    expect(isOllamaEndpoint('sk-abcdef1234567890')).toBe(false);
  });

  it('treats a non-http(s) scheme as not an endpoint (never a bearer auth path)', () => {
    expect(isOllamaEndpoint('ftp://localhost:11434')).toBe(false);
  });

  it('treats an empty or malformed string as not an endpoint', () => {
    expect(isOllamaEndpoint('')).toBe(false);
    expect(isOllamaEndpoint('not a url')).toBe(false);
  });
});
