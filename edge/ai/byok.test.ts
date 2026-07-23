import { describe, it, expect, vi, afterEach } from 'vitest'
import { createByokResolver } from './byok'
import type { ByokCredential, WireProviderMessage, WireTool } from '../protocol'

const MESSAGES: WireProviderMessage[] = [{ role: 'user', content: 'how many orders?' }]
const TOOLS: WireTool[] = [
  { name: 'execute_local_sql', description: 'run sql', inputSchema: { type: 'object' } },
]
const KEY = 'sk-secret-abc123'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createByokResolver — D9 pass-through custody', () => {
  it('places the raw key ONLY in the Authorization header, never in the request body or url', async () => {
    let captured: { url: string; init: RequestInit } | null = null
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      captured = { url, init }
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const resolver = createByokResolver()
    const provider = await resolver.resolve(
      { provider: 'openai', key: KEY } as ByokCredential,
      new AbortController().signal,
    )
    expect(provider).not.toBeNull()
    const gen = provider!.infer(MESSAGES, TOOLS, new AbortController().signal)
    await gen.next()

    expect(captured).not.toBeNull()
    const { url, init } = captured!
    const headers = init.headers as Record<string, string>
    // The key is exactly the bearer token…
    expect(headers.authorization).toBe(`Bearer ${KEY}`)
    // …and appears nowhere else the request could leak it.
    expect(String(init.body)).not.toContain(KEY)
    expect(url).not.toContain(KEY)
  })

  it('maps an OpenAI tool_call response to a wire tool_call turn', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    tool_calls: [
                      {
                        id: 'call_x',
                        function: { name: 'execute_local_sql', arguments: '{"sql":"SELECT 1"}' },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 },
          ),
        ),
      ),
    )
    const provider = await createByokResolver().resolve(
      { provider: 'openai', key: KEY } as ByokCredential,
      new AbortController().signal,
    )
    const ev = (await provider!.infer(MESSAGES, TOOLS, new AbortController().signal).next()).value as {
      turn: { kind: string; call: { name: string; input: unknown } }
    }
    expect(ev.turn.kind).toBe('tool_call')
    expect(ev.turn.call).toEqual({ id: 'call_x', name: 'execute_local_sql', input: { sql: 'SELECT 1' } })
  })

  it('resolves to null for a vault reference when no vault is configured', async () => {
    const provider = await createByokResolver().resolve(
      { provider: 'openai', vaultRef: 'ref-123', vaultSession: 'sess-1' } as ByokCredential,
      new AbortController().signal,
    )
    expect(provider).toBeNull()
  })

  it('resolves to null for an unknown provider', async () => {
    const provider = await createByokResolver().resolve(
      { provider: 'anthropic', key: KEY } as ByokCredential,
      new AbortController().signal,
    )
    expect(provider).toBeNull()
  })

  it('sends a vaulted key exactly where a pass-through key goes, and nowhere else', async () => {
    let captured: { url: string; init: RequestInit } | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        captured = { url, init }
        return Promise.resolve(
          new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }),
        )
      }),
    )
    const vault = vi.fn(() => Promise.resolve({ provider: 'openai', key: KEY }))
    const provider = await createByokResolver(vault).resolve(
      { provider: 'openai', vaultRef: 'ref-123', vaultSession: 'sess-1' } as ByokCredential,
      new AbortController().signal,
    )
    expect(vault).toHaveBeenCalledWith('sess-1', 'ref-123')
    await provider!.infer(MESSAGES, TOOLS, new AbortController().signal).next()

    const { url, init } = captured!
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`)
    expect(String(init.body)).not.toContain(KEY)
    expect(url).not.toContain(KEY)
  })

  it('resolves to null when the vault has no such reference', async () => {
    const provider = await createByokResolver(() => Promise.resolve(null)).resolve(
      { provider: 'openai', vaultRef: 'dead-ref', vaultSession: 'sess-1' } as ByokCredential,
      new AbortController().signal,
    )
    expect(provider).toBeNull()
  })

  it('needs both halves of a vault credential — a reference alone names nothing', async () => {
    const vault = vi.fn(() => Promise.resolve({ provider: 'openai', key: KEY }))
    const provider = await createByokResolver(vault).resolve(
      { provider: 'openai', vaultRef: 'ref-123' } as ByokCredential,
      new AbortController().signal,
    )
    expect(provider).toBeNull()
    expect(vault).not.toHaveBeenCalled()
  })

  it('trusts the vaulted record’s provider, not the request’s claim about it', async () => {
    // A stored key must not be redirectable at another provider by a request
    // that only holds the reference.
    const provider = await createByokResolver(() =>
      Promise.resolve({ provider: 'anthropic', key: KEY }),
    ).resolve(
      { provider: 'openai', vaultRef: 'ref-123', vaultSession: 'sess-1' } as ByokCredential,
      new AbortController().signal,
    )
    expect(provider).toBeNull()
  })

  it('throws a content-free transport error on an upstream failure (no key, no body echo)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('unauthorized: sk-secret-abc123', { status: 401 }))),
    )
    const provider = await createByokResolver().resolve(
      { provider: 'openai', key: KEY } as ByokCredential,
      new AbortController().signal,
    )
    const gen = provider!.infer(MESSAGES, TOOLS, new AbortController().signal)
    await expect(gen.next()).rejects.toThrow('byok upstream 401')
    // The thrown message carries only the status, never the upstream body/key.
    await expect(
      provider!.infer(MESSAGES, TOOLS, new AbortController().signal).next(),
    ).rejects.not.toThrow(KEY)
  })
})
