import { describe, it, expect } from 'vitest'
import {
  createDurableObjectRateStore,
  createAnalyticsSink,
  createWorkersAiProvider,
} from './adapters'
import { WorkersAiCeilingError } from './handlers/ai-router'
import type {
  Ai,
  AnalyticsEngineDataset,
  RateLimiterNamespace,
  RateLimiterStub,
} from './bindings'
import type { WireProviderMessage, WireTool } from './protocol'
import type { EdgeMetric } from './shared/counters'

/** An Ai binding that returns a scripted result, or throws a scripted error. */
function fakeAi(result: unknown, throwErr?: unknown): Ai {
  return {
    run: () => (throwErr !== undefined ? Promise.reject(throwErr) : Promise.resolve(result)),
  }
}

const MESSAGES: WireProviderMessage[] = [
  { role: 'system', content: 'schema…' },
  { role: 'user', content: 'how many orders?' },
]
const TOOLS: WireTool[] = [
  { name: 'execute_local_sql', description: 'run sql', inputSchema: { type: 'object' } },
]

async function drainOne(gen: AsyncGenerator<{ type: string }>): Promise<{ type: string }> {
  const first = await gen.next()
  return first.value as { type: string }
}

/**
 * A fake DO namespace: one stub (a running counter, standing in for a DO's
 * single-threaded per-key count) per name, so key routing and per-key isolation
 * can be asserted without the runtime.
 */
function fakeDoNamespace(): RateLimiterNamespace & { names: string[] } {
  const stubs = new Map<string, RateLimiterStub>()
  const names: string[] = []
  return {
    names,
    getByName(name: string): RateLimiterStub {
      names.push(name)
      let stub = stubs.get(name)
      if (stub === undefined) {
        let count = 0
        stub = { increment: () => Promise.resolve((count += 1)) }
        stubs.set(name, stub)
      }
      return stub
    },
  }
}

describe('createDurableObjectRateStore', () => {
  it('routes each key to its own DO instance and returns the running count', async () => {
    const ns = fakeDoNamespace()
    const store = createDurableObjectRateStore(ns)
    expect(await store.increment('ai-router:session:s', 60)).toBe(1)
    expect(await store.increment('ai-router:session:s', 60)).toBe(2)
    // A different key counts on its own instance — including a daily-quota key,
    // which shares this store with the per-minute limiter keys.
    expect(await store.increment('ai-router:ip:1.2.3.4', 60)).toBe(1)
    expect(await store.increment('ai-router:quota:s', 86_400)).toBe(1)
    expect(await store.increment('ai-router:session:s', 60)).toBe(3)
    expect(ns.names).toEqual([
      'ai-router:session:s',
      'ai-router:session:s',
      'ai-router:ip:1.2.3.4',
      'ai-router:quota:s',
      'ai-router:session:s',
    ])
  })
})

describe('createAnalyticsSink', () => {
  it('no-ops when the dataset is unbound', () => {
    const sink = createAnalyticsSink(undefined)
    expect(() => sink.record({ endpoint: 'mcp', outcome: 'ok', latency: 'fast' })).not.toThrow()
  })

  it('writes only outcome labels and numeric buckets — no content field exists to leak', () => {
    const points: Array<{ blobs?: string[]; doubles?: number[]; indexes?: string[] }> = []
    const dataset: AnalyticsEngineDataset = { writeDataPoint: (e) => points.push(e) }
    const sink = createAnalyticsSink(dataset)
    const metric: EdgeMetric = {
      endpoint: 'ai-router',
      outcome: 'ok',
      servedBy: 'workers-ai',
      tokensIn: 120,
      tokensOut: 40,
      attempt: 1,
      latency: 'normal',
    }
    sink.record(metric)
    expect(points).toHaveLength(1)
    expect(points[0].blobs).toEqual(['ai-router', 'ok', 'normal', 'workers-ai'])
    expect(points[0].doubles).toEqual([120, 40, 1])
    expect(points[0].indexes).toEqual(['ai-router'])
  })
})

describe('createWorkersAiProvider', () => {
  it('maps a plain response to a text turn with token usage', async () => {
    const ai = fakeAi({ response: 'SELECT 1', usage: { prompt_tokens: 30, completion_tokens: 5 } })
    const provider = createWorkersAiProvider(ai, 'model')
    const ev = await drainOne(
      provider.infer(MESSAGES, TOOLS, new AbortController().signal) as AsyncGenerator<{ type: string }>,
    )
    expect(ev).toEqual({
      type: 'done',
      turn: { kind: 'text', text: 'SELECT 1' },
      tokensIn: 30,
      tokensOut: 5,
    })
  })

  it('maps a tool_calls response to a tool_call turn, parsing string arguments', async () => {
    const ai = fakeAi({
      tool_calls: [{ name: 'execute_local_sql', arguments: '{"sql":"SELECT count(*) FROM orders"}' }],
    })
    const provider = createWorkersAiProvider(ai, 'model')
    const gen = provider.infer(MESSAGES, TOOLS, new AbortController().signal)
    const ev = (await gen.next()).value as { turn: { kind: string; call: { id: string; name: string; input: unknown } } }
    expect(ev.turn.kind).toBe('tool_call')
    expect(ev.turn.call.name).toBe('execute_local_sql')
    expect(ev.turn.call.input).toEqual({ sql: 'SELECT count(*) FROM orders' })
    // The id must be exactly 9 chars of [a-zA-Z0-9] — Mistral rejects any other
    // shape when the id is echoed back on the tool result.
    expect(ev.turn.call.id).toMatch(/^[A-Za-z0-9]{9}$/)
  })

  it('raises WorkersAiCeilingError on a capacity/neuron-limit error so the router can overflow', async () => {
    const ai = fakeAi(null, new Error('Workers AI error 3040: Account is limited'))
    const provider = createWorkersAiProvider(ai, 'model')
    const gen = provider.infer(MESSAGES, TOOLS, new AbortController().signal)
    await expect(gen.next()).rejects.toBeInstanceOf(WorkersAiCeilingError)
  })

  it('rethrows a non-ceiling error unchanged', async () => {
    const ai = fakeAi(null, new Error('bad gateway'))
    const provider = createWorkersAiProvider(ai, 'model')
    const gen = provider.infer(MESSAGES, TOOLS, new AbortController().signal)
    await expect(gen.next()).rejects.toThrow('bad gateway')
  })

  it('aborts before calling the model when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    let called = false
    const ai: Ai = { run: () => ((called = true), Promise.resolve({ response: 'x' })) }
    const provider = createWorkersAiProvider(ai, 'model')
    const gen = provider.infer(MESSAGES, TOOLS, controller.signal)
    await expect(gen.next()).rejects.toMatchObject({ name: 'AbortError' })
    expect(called).toBe(false)
  })

  it('aborts a pending call once the signal fires mid-flight, without waiting for it to settle', async () => {
    const controller = new AbortController()
    const hangingAi: Ai = { run: () => new Promise(() => {}) }
    const provider = createWorkersAiProvider(hangingAi, 'model')
    const gen = provider.infer(MESSAGES, TOOLS, controller.signal)
    const pending = gen.next()
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

/** A byte stream delivering the given strings one enqueue each, then closing. */
function byteStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(enc.encode(chunk))
      controller.close()
    },
  })
}

/** An Ai binding whose run resolves to a streamed SSE body. */
function streamingAi(chunks: string[]): Ai {
  return { run: () => Promise.resolve(byteStream(chunks)) }
}

async function collect(
  gen: AsyncGenerator<unknown>,
): Promise<Array<Record<string, unknown>>> {
  const events: Array<Record<string, unknown>> = []
  for await (const ev of gen) events.push(ev as Record<string, unknown>)
  return events
}

describe('createWorkersAiProvider (streamed)', () => {
  // Frame shapes below mirror a live probe of Mistral Small 3.1 on Workers AI:
  // per-token chunks with choices[0].delta, a trailing no-choices usage summary,
  // then [DONE].
  it('yields text deltas as they arrive and a done turn with summary usage', async () => {
    const ai = streamingAi([
      'data: {"choices":[{"delta":{"content":"","role":"assistant"}}],"usage":{"prompt_tokens":107,"completion_tokens":0}}\n\n',
      'data: {"choices":[{"delta":{"content":"SELECT"}}],"usage":{"prompt_tokens":0,"completion_tokens":1}}\n\n',
      'data: {"choices":[{"delta":{"content":" 1"}}],"usage":{"prompt_tokens":0,"completion_tokens":1}}\n\n',
      'data: {"choices":[{"delta":{"content":""},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":0,"completion_tokens":0}}\n\n',
      'data: {"response":"","usage":{"prompt_tokens":8,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ])
    const provider = createWorkersAiProvider(ai, 'model')
    const events = await collect(provider.infer(MESSAGES, TOOLS, new AbortController().signal))
    expect(events).toEqual([
      { type: 'delta', text: 'SELECT' },
      { type: 'delta', text: ' 1' },
      { type: 'done', turn: { kind: 'text', text: 'SELECT 1' }, tokensIn: 8, tokensOut: 2 },
    ])
  })

  it('reassembles a fragmented tool call without emitting argument deltas', async () => {
    const ai = streamingAi([
      'data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"execute_local_sql"},"id":"SGU1YI5YC","index":0,"type":"function"}]}}],"usage":{"prompt_tokens":107,"completion_tokens":10}}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\\""},"index":0}]}}],"usage":{"prompt_tokens":0,"completion_tokens":1}}\n\n',
      // One SSE frame deliberately split across two network reads — the parser
      // must buffer the partial frame, not drop it.
      'data: {"choices":[{"delta":{"tool_calls":[{"function":{"argu',
      'ments":"sql\\": \\"SELECT count(*) FROM orders\\"}"},"index":0}]}}],"usage":{"prompt_tokens":0,"completion_tokens":9}}\n\n',
      'data: [DONE]\n\n',
    ])
    const provider = createWorkersAiProvider(ai, 'model')
    const events = await collect(provider.infer(MESSAGES, TOOLS, new AbortController().signal))
    expect(events).toHaveLength(1)
    const done = events[0] as {
      type: string
      turn: { kind: string; call: { id: string; name: string; input: unknown } }
      tokensIn: number
      tokensOut: number
    }
    expect(done.type).toBe('done')
    expect(done.turn.kind).toBe('tool_call')
    expect(done.turn.call.name).toBe('execute_local_sql')
    expect(done.turn.call.input).toEqual({ sql: 'SELECT count(*) FROM orders' })
    expect(done.turn.call.id).toMatch(/^[A-Za-z0-9]{9}$/)
    // No summary chunk arrived: prompt from the opening chunk, completion summed.
    expect(done.tokensIn).toBe(107)
    expect(done.tokensOut).toBe(20)
  })

  it('surfaces unparseable reassembled arguments verbatim for the client lint stage', async () => {
    const ai = streamingAi([
      'data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"execute_local_sql"},"index":0}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"not json"},"index":0}]}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    const provider = createWorkersAiProvider(ai, 'model')
    const events = await collect(provider.infer(MESSAGES, TOOLS, new AbortController().signal))
    const done = events[0] as { turn: { call: { input: unknown } } }
    expect(done.turn.call.input).toBe('not json')
  })

  it('finalizes from accumulated state when the stream closes without [DONE]', async () => {
    const ai = streamingAi([
      'data: {"choices":[{"delta":{"content":"OK"}}],"usage":{"prompt_tokens":5,"completion_tokens":1}}\n\n',
    ])
    const provider = createWorkersAiProvider(ai, 'model')
    const events = await collect(provider.infer(MESSAGES, TOOLS, new AbortController().signal))
    expect(events).toEqual([
      { type: 'delta', text: 'OK' },
      { type: 'done', turn: { kind: 'text', text: 'OK' }, tokensIn: 5, tokensOut: 1 },
    ])
  })

  it('aborts mid-stream when the signal fires between reads', async () => {
    const controller = new AbortController()
    const enc = new TextEncoder()
    // Delivers one frame then hangs open — the abort must cut the wait.
    const ai: Ai = {
      run: () =>
        Promise.resolve(
          new ReadableStream({
            start(c) {
              c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"par"}}]}\n\n'))
            },
          }),
        ),
    }
    const provider = createWorkersAiProvider(ai, 'model')
    const gen = provider.infer(MESSAGES, TOOLS, controller.signal)
    expect((await gen.next()).value).toEqual({ type: 'delta', text: 'par' })
    const pending = gen.next()
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
