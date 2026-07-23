// Minimal ambient types for the slice of the Cloudflare Workers runtime the edge
// deploy touches — declared locally, exactly like the binding interfaces in
// bindings.ts, instead of pulling in @cloudflare/workers-types (which redeclares
// the DOM globals the edge tsconfig already gets from lib.DOM). Only the members
// the RateLimiterDo uses are typed; wrangler bundles the real runtime, which
// provides the rest. tsc typechecks against these; nothing here ships.

/** The subset of a Durable Object's storage the rate limiter uses (KV-style API). */
interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  put<T = unknown>(key: string, value: T): Promise<void>
  deleteAll(): Promise<void>
  setAlarm(scheduledTime: number): Promise<void>
}

/** The DO's context: its durable, per-instance storage. */
interface DurableObjectState {
  readonly storage: DurableObjectStorage
}

declare module 'cloudflare:workers' {
  /**
   * The runtime base class every Durable Object extends. The constructor is
   * called with the instance's state (`ctx`) and the Worker `env`; subclasses add
   * RPC methods (and an optional `alarm()`). Typed here only enough to extend.
   */
  export class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState
    protected env: Env
    constructor(ctx: DurableObjectState, env: Env)
  }
}
