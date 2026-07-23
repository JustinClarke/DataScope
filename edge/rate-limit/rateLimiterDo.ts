// The per-key rate-limiter counter, backed by a Durable Object. One instance per
// limiter key (`ai-router:session:<id>`, `ai-router:ip:<ip>`,
// `ai-router:quota:<id>`): a Durable Object runs single-threaded, so every
// increment to a key is serialized and the count it returns is strongly
// consistent within the window. That is the whole reason this exists — live
// audits of the previous plain-KV counters found KV's cross-colo eventual
// consistency under-counting bursts (a 60s window read 13 requests spaced ~1s
// apart back as 5; the daily-quota window read a ~95s burst of 21 back as 8),
// which defeats an abuse limiter regardless of window width.
//
// This class only runs inside the Cloudflare runtime (it imports the runtime base
// class), so it is never loaded by the node test suite; the counting logic it
// wraps (rateWindow.ts) is pure and tested directly, and the adapter that routes
// keys to instances (createDurableObjectRateStore) is tested against a fake
// namespace. worker.ts exports this class so the runtime can bind it.
import { DurableObject } from 'cloudflare:workers'
import { stepWindow, type WindowState } from './rateWindow'

const STATE_KEY = 'window'

export class RateLimiterDo extends DurableObject {
  /**
   * Increments this key's window counter/sum and returns the running total.
   * `amount` defaults to 1 (a request count); the persistence endpoint's daily
   * byte-aggregate cap (build/09-edge/04) passes the chunk size instead.
   */
  async increment(windowSeconds: number, amount = 1): Promise<number> {
    const prior = await this.ctx.storage.get<WindowState>(STATE_KEY)
    const next = stepWindow(prior, Date.now(), windowSeconds, amount)
    // Persist before returning — an eviction mid-window must not lose the count
    // (losing it would under-count, the exact failure this store fixes).
    await this.ctx.storage.put(STATE_KEY, next)
    // A fresh window opened exactly when the bucket moved (not `count ===
    // amount`, which a byte-summing caller could coincidentally hit mid-window).
    if (prior === undefined || prior.bucket !== next.bucket) {
      // Schedule a wipe at its end so an idle session/IP key stops retaining
      // storage; setAlarm replaces any prior alarm, so only the current
      // window's cleanup is ever pending. A request that reopens a window
      // reschedules it forward.
      await this.ctx.storage.setAlarm((next.bucket + 1) * windowSeconds * 1000)
    }
    return next.count
  }

  /** The window elapsed with no traffic to reopen it — drop the counter. */
  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
  }
}
