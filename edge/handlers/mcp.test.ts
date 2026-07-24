import { describe, it, expect } from 'vitest'
import { handleMcp, createR2SharedArtifactStore, type McpEnv, type SharedArtifactStore } from './mcp'
import { createMemoryPersistenceStore } from './persistence'
import { createMemoryRateStore } from '../shared/limiter'
import { createMemorySink } from '../shared/counters'
import type { McpRequest } from '../protocol'

const dspsDoc = {
  dspsVersion: '1.0.0',
  generatedAt: '2026-07-23T00:00:00.000Z',
  tables: [
    {
      tableName: 'orders',
      rowCount: 1200,
      columnCount: 1,
      columns: [
        { name: 'order_id', semanticType: 'identifier', physicalType: 'BIGINT', nullPercentage: 0, cardinality: 1200 },
      ],
    },
  ],
  insights: [],
}

function store(shared: Record<string, unknown>): SharedArtifactStore {
  return {
    listShared: () => Promise.resolve(Object.keys(shared)),
    getDsps: (id) => Promise.resolve(shared[id] ?? null),
  }
}

function makeEnv(overrides: Partial<McpEnv> = {}): McpEnv {
  return {
    store: store({ 'art-1': dspsDoc }),
    rateStore: createMemoryRateStore(),
    sink: createMemorySink(),
    ...overrides,
  }
}

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://edge.example/mcp', {
    method,
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

describe('mcp: read-only DSPS surface (D38 stage A)', () => {
  it('list_shared returns the shared artifact ids', async () => {
    const req: McpRequest = { sessionId: 's', tool: 'list_shared' }
    const res = await handleMcp(makeRequest(req), makeEnv())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tool: 'list_shared', artifactIds: ['art-1'] })
  })

  it('get_dsps returns the identical client-generated DSPS document, passed through verbatim', async () => {
    const req: McpRequest = { sessionId: 's', tool: 'get_dsps', artifactId: 'art-1' }
    const res = await handleMcp(makeRequest(req), makeEnv())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tool: 'get_dsps', artifactId: 'art-1', dsps: dspsDoc })
  })

  it('get_dsps for an unshared/unknown id is not-found, never a leak', async () => {
    const req: McpRequest = { sessionId: 's', tool: 'get_dsps', artifactId: 'art-secret' }
    const res = await handleMcp(makeRequest(req), makeEnv())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not-found' })
  })

  it('rejects a non-POST request', async () => {
    const res = await handleMcp(makeRequest(null, 'GET'), makeEnv())
    expect(res.status).toBe(400)
  })

  it('an unbound store reports unavailable, never half-working', async () => {
    const req: McpRequest = { sessionId: 's', tool: 'list_shared' }
    const res = await handleMcp(makeRequest(req), makeEnv({ store: undefined }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'unavailable' })
  })

  it('inherits the kill switch → paused 503', async () => {
    const req: McpRequest = { sessionId: 's', tool: 'list_shared' }
    const res = await handleMcp(makeRequest(req), makeEnv({ MCP_KILL_SWITCH: 'on' }))
    expect(res.status).toBe(503)
  })

  it('inherits the dual-keyed limiter → rate-limited', async () => {
    const rateStore = createMemoryRateStore()
    const req: McpRequest = { sessionId: 's', tool: 'list_shared' }
    const env: McpEnv = { ...makeEnv({ perMinuteLimits: { perSession: 1, perIp: 100, windowSeconds: 60 } }), rateStore }
    await handleMcp(makeRequest(req), env)
    const second = await handleMcp(makeRequest(req), env)
    expect(second.status).toBe(429)
  })

  it('rejects an unknown tool as bad-request', async () => {
    const res = await handleMcp(makeRequest({ sessionId: 's', tool: 'delete_everything' }), makeEnv())
    expect(res.status).toBe(400)
  })

  it('records only content-free mcp metrics', async () => {
    const sink = createMemorySink()
    await handleMcp(makeRequest({ sessionId: 's', tool: 'get_dsps', artifactId: 'art-1' }), makeEnv({ sink }))
    expect(sink.metrics[0]).toEqual({ endpoint: 'mcp', outcome: 'ok', latency: expect.any(String) })
    expect(JSON.stringify(sink.metrics)).not.toContain('orders')
  })
})

describe('createR2SharedArtifactStore (build/08-persistence/03-dsps-spec)', () => {
  const DSPS_CONTENT_TYPE = 'application/vnd.datascope.dsps+json'

  it('returns the raw DSPS JSON for a structure-only share', async () => {
    const persistenceStore = createMemoryPersistenceStore()
    await persistenceStore.put('share:tok-1', textStream(JSON.stringify(dspsDoc)), {
      httpMetadata: { contentType: DSPS_CONTENT_TYPE },
      customMetadata: { deleteTokenHash: 'irrelevant' },
    })
    const sharedStore = createR2SharedArtifactStore(persistenceStore)
    await expect(sharedStore.getDsps('tok-1')).resolves.toEqual(dspsDoc)
  })

  it('never returns a full-dataset share (wrong content type) as if it were DSPS', async () => {
    const persistenceStore = createMemoryPersistenceStore()
    await persistenceStore.put('share:tok-2', textStream('not json, raw parquet bytes stand-in'), {
      httpMetadata: { contentType: 'application/vnd.apache.parquet' },
      customMetadata: { deleteTokenHash: 'irrelevant' },
    })
    const sharedStore = createR2SharedArtifactStore(persistenceStore)
    await expect(sharedStore.getDsps('tok-2')).resolves.toBeNull()
  })

  it('returns null for an unknown token', async () => {
    const sharedStore = createR2SharedArtifactStore(createMemoryPersistenceStore())
    await expect(sharedStore.getDsps('nope')).resolves.toBeNull()
  })

  it('listShared is a named gap — no session index exists server-side, so it always returns []', async () => {
    const sharedStore = createR2SharedArtifactStore(createMemoryPersistenceStore())
    await expect(sharedStore.listShared('any-session')).resolves.toEqual([])
  })
})

function textStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}
