// The dual-keyed rate limiter — a per-session ceiling and a per-IP floor, so one
// session can't exhaust the endpoint and one IP can't spin up sessions to get
// around the session ceiling. Both counts are numeric and ephemeral (a fixed
// window); nothing about the request content is stored.
//
// The count store is injected: Cloudflare KV or a Durable Object in production,
// an in-memory map under test. This is the shared limiter build/09-edge/01 owns;
// each endpoint passes its own namespace so one endpoint's counts never collide
// with another's (`synthesis`, `ai-router`, `mcp`).

/** A minimal counter store — increment-with-window, all the limiter needs. */
export interface RateStore {
  /**
   * Returns the running total in the current window after incrementing the
   * key by `amount` (default 1, a request count). A byte-summing caller (the
   * persistence endpoint's daily aggregate cap) passes the chunk size.
   */
  increment(key: string, windowSeconds: number, amount?: number): Promise<number>
}

export interface RateLimits {
  perSession: number
  perIp: number
  windowSeconds: number
}

/**
 * Increments both keys and reports whether the request is within limits. A
 * request is allowed only when neither the session ceiling nor the IP floor is
 * exceeded. Both are always incremented so a blocked request still counts toward
 * the window (no free retries).
 */
export async function checkRateLimit(
  store: RateStore,
  namespace: string,
  sessionId: string,
  ip: string,
  limits: RateLimits,
): Promise<boolean> {
  const [sessionCount, ipCount] = await Promise.all([
    store.increment(`${namespace}:session:${sessionId}`, limits.windowSeconds),
    store.increment(`${namespace}:ip:${ip}`, limits.windowSeconds),
  ])
  return sessionCount <= limits.perSession && ipCount <= limits.perIp
}

/**
 * A single per-session counter over a wide window — the ai-router's per-session
 * daily Workers-AI turn quota (§11.2), or the persistence endpoint's daily
 * aggregate-byte cap (build/09-edge/04, §12.3), which passes the object's byte
 * count as `amount` instead of the default 1. Distinct from the per-minute
 * dual-keyed limiter above: it has no IP floor, and the ai-router increments it
 * only when Workers AI serves, never on a BYOK turn. Returns the post-increment
 * running total so the caller compares it to the quota/cap.
 */
export function incrementSessionQuota(
  store: RateStore,
  namespace: string,
  sessionId: string,
  windowSeconds: number,
  amount = 1,
): Promise<number> {
  return store.increment(`${namespace}:quota:${sessionId}`, windowSeconds, amount)
}

/** An in-memory RateStore for tests and local dev — a fixed-window counter. */
export function createMemoryRateStore(now: () => number = Date.now): RateStore {
  const windows = new Map<string, { count: number; resetAt: number }>()
  return {
    increment(key, windowSeconds, amount = 1) {
      const t = now()
      const entry = windows.get(key)
      if (entry === undefined || t >= entry.resetAt) {
        windows.set(key, { count: amount, resetAt: t + windowSeconds * 1000 })
        return Promise.resolve(amount)
      }
      entry.count += amount
      return Promise.resolve(entry.count)
    },
  }
}
