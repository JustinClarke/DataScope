// The fixed-window counter step, as a pure function so it can be exercised
// directly under node's vitest (the RateLimiterDo that wraps it lives behind the
// Cloudflare runtime and never loads in a test). Same bucket math as the plain-KV
// counter this store replaced — a window resets when its bucket rolls over — so
// moving to a Durable Object changed only the consistency guarantee, not the
// counting semantics.

/** A window's counter: which bucket it belongs to, and the count so far in it. */
export interface WindowState {
  bucket: number
  count: number
}

/**
 * One increment. `now` is ms since epoch; `windowSeconds` the window length;
 * `amount` defaults to 1 (a request count) but a caller summing bytes instead
 * of requests (the persistence endpoint's daily aggregate cap,
 * build/09-edge/04) passes the chunk size. Within the same bucket the running
 * total rises; a new bucket resets it to `amount`. The prior state is
 * `undefined` on a key's first-ever request (or after a cleanup wipe).
 */
export function stepWindow(
  prior: WindowState | undefined,
  now: number,
  windowSeconds: number,
  amount = 1,
): WindowState {
  const bucket = Math.floor(now / 1000 / windowSeconds)
  if (prior === undefined || prior.bucket !== bucket) return { bucket, count: amount }
  return { bucket, count: prior.count + amount }
}
