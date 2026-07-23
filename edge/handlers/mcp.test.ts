import { describe, it, expect } from 'vitest'
import { handleMcp, type McpEnv, type SharedArtifactStore } from './mcp'
import { createMemoryRateStore } from '../shared/limiter'
import { createMemorySink } from '../shared/counters'
import type { McpRequest, StructuralFacts } from '../protocol'

const facts: StructuralFacts = {
  tables: [
    {
      name: 'orders',
      rowCount: 1200,
      columns: [
        { name: 'order_id', semanticType: 'identifier', physicalType: 'BIGINT', nullPercentage: 0, cardinality: 1200 },
      ],
    },
  ],
}

function store(shared: Record<string, StructuralFacts>): SharedArtifactStore {
  return {
    listShared: () => Promise.resolve(Object.keys(shared)),
    getDsps: (id) => Promise.resolve(shared[id] ?? null),
  }
}

function makeEnv(overrides: Partial<McpEnv> = {}): McpEnv {
  return {
    store: store({ 'art-1': facts }),
    rateStore: createMemoryRateStore(),
    sink: createMemorySink(),
    ...overrides,
  }
}

function makeRequest(body: unknown): Request {
  return new Request('https://edge.example/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
    body: JSON.stringify(body),
  })
}

describe('mcp: read-only DSPS surface (D38 stage A)', () => {
  it('list_shared returns the shared artifact ids', async () => {
    const req: McpRequest = { sessionId: 's', tool: 'list_shared' }
    const res = await handleMcp(makeRequest(req), makeEnv())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tool: 'list_shared', artifactIds: ['art-1'] })
  })

  it('get_dsps returns a shared artifact’s structure-only facts', async () => {
    const req: McpRequest = { sessionId: 's', tool: 'get_dsps', artifactId: 'art-1' }
    const res = await handleMcp(makeRequest(req), makeEnv())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tool: 'get_dsps', artifactId: 'art-1', facts })
  })

  it('get_dsps for an unshared/unknown id is not-found, never a leak', async () => {
    const req: McpRequest = { sessionId: 's', tool: 'get_dsps', artifactId: 'art-secret' }
    const res = await handleMcp(makeRequest(req), makeEnv())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not-found' })
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
