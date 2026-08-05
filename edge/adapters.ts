// Adapters that build the ai-router's injected seam collaborators from real
// Cloudflare bindings. The handler (`handleAiRouter`) only ever sees the seam
// interfaces (`InferenceProvider`, `RateStore`, `CounterSink`); these turn the
// runtime's `Env` into those shapes. Everything binding-specific lives here, so
// the tested handler stays binding-free.
import type {
  Ai,
  AnalyticsEngineDataset,
  KvNamespace,
  R2Bucket,
  RateLimiterNamespace,
} from './bindings'
import type { VaultStore } from './handlers/vault'
import type { PersistenceStore } from './handlers/persistence'
import {
  WorkersAiCeilingError,
  type InferenceProvider,
  type InferEvent,
} from './handlers/ai-router'
import type { RateStore } from './shared/limiter'
import type { CounterSink, EdgeMetric } from './shared/counters'
import type {
  WireProviderMessage,
  WireProviderTurn,
  WireTool,
  WireToolCall,
} from './protocol'

/**
 * Default cloud NL→SQL model; overridable via the AI_MODEL var. Mistral Small
 * 3.1 is used because it reliably emits structured `tool_calls` on Workers AI —
 * the code-specialized Qwen coder does not (it free-texts the call, leaving
 * `tool_calls` empty), which breaks the execute_local_sql tool loop. Mistral
 * also returns real `usage.neurons` and carries a 128K context.
 */
export const DEFAULT_AI_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct'

// ── Counter store over a Durable Object ─────────────────────────────────────
// Routes each already-namespaced limiter key to its own DO instance, so the DO's
// single-threaded execution serializes increments to a key and returns a
// strongly consistent count. This backs both the per-minute dual-keyed limiter
// and the daily Workers-AI quota. Both counters started on plain KV; live audits
// found KV's cross-colo eventual consistency under-counting bursts on each (a
// 60s window read 13 requests spaced ~1s apart back as 5; the 86,400s quota
// window read a ~95s burst of 21 back as 8 — a wide window only tolerates the
// slop under organic pacing, and bursts are exactly how an abuser spends the
// shared free pool). The counting logic and cleanup live in the RateLimiterDo
// class (rateLimiterDo.ts), reached here through the runtime stub.

export function createDurableObjectRateStore(namespace: RateLimiterNamespace): RateStore {
  return {
    increment(key: string, windowSeconds: number): Promise<number> {
      return namespace.getByName(key).increment(windowSeconds)
    },
  }
}

// ── Vault store over KV ─────────────────────────────────────────────────────
// KV backs the vault's *values* (D9, §11.2). That is the opposite call from
// ADR-006's counters, which moved off KV for under-counting bursts: a stored
// credential is written once and read back, so KV's ≤60s cross-colo propagation
// is a brief "reference not found yet" on a just-stored key, not a silently
// wrong number. Native `expirationTtl` is also exactly the idle-TTL primitive.

export function createKvVaultStore(kv: KvNamespace): VaultStore {
  return {
    get(key: string): Promise<string | null> {
      return kv.get(key)
    },
    put(key: string, value: string, ttlSeconds: number): Promise<void> {
      return kv.put(key, value, { expirationTtl: ttlSeconds })
    },
    delete(key: string): Promise<void> {
      return kv.delete(key)
    },
    async list(prefix: string): Promise<string[]> {
      // Only the credential cap calls this, so one page past the cap is plenty.
      const page = await kv.list({ prefix, limit: 100 })
      return page.keys.map((k) => k.name)
    },
  }
}

// ── Persistence store over R2 ────────────────────────────────────────────────
// R2 backs the save/share object bytes (D5, §12.3). Unlike the vault's KV
// store, there is no native per-object TTL argument here — retention is the
// Terraform-owned bucket lifecycle rule (§23.3), not something this adapter's
// `put` call can express.

export function createR2PersistenceStore(bucket: R2Bucket): PersistenceStore {
  return {
    put(key, value, options) {
      return bucket.put(key, value, options)
    },
    get(key) {
      return bucket.get(key)
    },
    head(key) {
      return bucket.head(key)
    },
    delete(key) {
      return bucket.delete(key)
    },
  }
}

// ── Metric sink over Analytics Engine ───────────────────────────────────────
// Writes the content-free metric as numeric doubles + label blobs. The metric
// shape (counters.ts) already makes content-bearing telemetry unrepresentable;
// this mapping only ever reads those fixed fields, so nothing but outcome labels
// and numeric buckets can reach the dataset. No-ops when the dataset is unbound.

export function createAnalyticsSink(dataset: AnalyticsEngineDataset | undefined): CounterSink {
  return {
    record(metric: EdgeMetric): void {
      if (dataset === undefined) return
      const blobs: string[] = [metric.endpoint, metric.outcome, metric.latency]
      const doubles: number[] = []
      if (metric.endpoint === 'ai-router') {
        blobs.push(metric.servedBy)
        doubles.push(metric.tokensIn, metric.tokensOut, metric.attempt)
      } else if (metric.endpoint === 'synthesis' || metric.endpoint === 'persistence') {
        blobs.push(metric.size)
      }
      dataset.writeDataPoint({ blobs, doubles, indexes: [metric.endpoint] })
    },
  }
}

// ── Workers AI inference provider ───────────────────────────────────────────

/** Loose shape of a Workers AI chat completion (non-streaming). Read defensively. */
interface WorkersAiChatResult {
  response?: string
  tool_calls?: Array<{ name: string; arguments: unknown }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/** Maps our wire messages onto Workers AI's OpenAI-style chat messages. */
function toWorkersAiMessages(messages: WireProviderMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.toolCalls !== undefined && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        })),
      }
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
    }
    return { role: m.role, content: m.content }
  })
}

/** Maps our wire tools onto Workers AI's OpenAI-style function tools. */
function toWorkersAiTools(tools: WireTool[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }))
}

const TOOL_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * A fresh tool-call id: exactly 9 chars of [a-zA-Z0-9]. Some Workers AI models
 * (Mistral) reject any other id shape when the id is echoed back on the tool
 * result, and a fixed id would also collide across the loop's retry attempts —
 * so each call gets a unique compliant id.
 */
function newToolCallId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  let id = ''
  for (const b of bytes) id += TOOL_ID_ALPHABET[b % TOOL_ID_ALPHABET.length]
  return id
}

/**
 * Turns a Workers AI result into one wire turn, carrying **every** emitted call
 * in emitted order alongside whatever prose came with it (A4 defect iii — this
 * used to read `tool_calls[0]` and drop the rest silently). An empty `calls` is
 * what the client reads as terminal.
 */
function toWireTurn(result: WorkersAiChatResult): WireProviderTurn {
  const calls = (result.tool_calls ?? []).map((call): WireToolCall => ({
    id: newToolCallId(),
    name: call.name,
    input: typeof call.arguments === 'string' ? safeParse(call.arguments) : (call.arguments ?? {}),
  }))
  return { text: result.response ?? '', calls }
}

/** What the model actually produced this turn, for the token-count fallback: its prose plus every call's arguments. */
function completionText(turn: WireProviderTurn): string {
  return turn.text + turn.calls.map((c) => JSON.stringify(c.input)).join('')
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    // A tool-call argument that isn't valid JSON is surfaced verbatim; the client
    // lint stage rejects it, feeding the model a repair prompt (§11.1 loop).
    return raw
  }
}

/** ~4 chars/token — the same proxy the eval harness uses when a provider reports no usage. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

const CEILING_SIGNAL = /3040|capacity|too many requests|rate.?limit|neuron|account.*limit|quota/i

/**
 * Whether an error from the Workers AI binding signals the account-wide free
 * pool's rate/neuron ceiling — the condition that overflows to a BYOK key (D3).
 * Shared with the synthesis provider so both callers classify identically.
 */
export function isCeilingSignal(err: unknown): boolean {
  return CEILING_SIGNAL.test(String((err as Error)?.message ?? err))
}

/**
 * Settles with the wrapped promise, or an `AbortError` the moment `signal`
 * fires — whichever comes first. `Ai.run` takes no signal of its own (unlike
 * `fetch`), so without this a provider timeout would set `signal.aborted` but
 * never actually stop the caller from waiting on a hung call. This only stops
 * *waiting*; it does not cancel the underlying Workers AI request server-side
 * (the binding gives no hook for that).
 */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new DOMException('aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e) => {
        signal.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}

/**
 * One SSE `data:` payload from a streamed Workers AI run, read defensively. The
 * shape was probed live against Mistral Small 3.1 (OpenAI-style
 * `chat.completion.chunk`): text arrives as `choices[0].delta.content`; a tool
 * call opens with a `delta.tool_calls` entry carrying `function.name`, then
 * subsequent chunks append `function.arguments` string fragments to reassemble;
 * a trailing summary chunk (no `choices`) carries the authoritative usage
 * totals; the stream ends with `data: [DONE]`. The top-level `response` mirror
 * is NOT read — it is type-unstable (a lone digit arrives as a JSON number).
 */
interface WorkersAiStreamChunk {
  choices?: Array<{
    delta?: {
      content?: unknown
      tool_calls?: Array<{ index?: number; function?: { name?: string; arguments?: unknown } }>
    }
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/** One call being reassembled across chunks, identified by the provider's own `index`. */
interface StreamToolCall {
  index: number
  name: string | null
  args: string
}

/** The turn being reassembled from a chunk stream, plus running usage. */
interface StreamTurnState {
  text: string
  /**
   * Every call in the stream, kept separate by `index` and ordered by first
   * appearance. This used to be a single `toolName`/`toolArgs` pair with
   * `index !== 0` skipped outright, which silently dropped every parallel call
   * after the first (A4 defect iii, streamed half).
   */
  toolCalls: StreamToolCall[]
  /** From the trailing summary chunk (authoritative), when one arrives. */
  summary: { tokensIn: number; tokensOut: number } | null
  /** Fallbacks accumulated from per-token chunks, used when no summary arrives. */
  promptTokensSeen: number
  completionTokensSum: number
}

export function newStreamTurnState(): StreamTurnState {
  return {
    text: '',
    toolCalls: [],
    summary: null,
    promptTokensSeen: 0,
    completionTokensSum: 0,
  }
}

/**
 * Applies one parsed chunk to the state; returns text to emit as a delta, or
 * null. Once any tool call opens, text deltas stop (there is nothing
 * token-streamable about a JSON argument blob — a garbled partial would only
 * mislead the transcript).
 */
export function applyStreamChunk(state: StreamTurnState, chunk: WorkersAiStreamChunk): string | null {
  const choice = chunk.choices?.[0]
  for (const tc of choice?.delta?.tool_calls ?? []) {
    const index = tc.index ?? 0
    let call = state.toolCalls.find((c) => c.index === index)
    if (call === undefined) {
      call = { index, name: null, args: '' }
      state.toolCalls.push(call)
    }
    if (typeof tc.function?.name === 'string') call.name = tc.function.name
    if (typeof tc.function?.arguments === 'string') call.args += tc.function.arguments
  }
  if (chunk.usage !== undefined) {
    const prompt = chunk.usage.prompt_tokens ?? 0
    const completion = chunk.usage.completion_tokens ?? 0
    if (chunk.choices === undefined || chunk.choices.length === 0) {
      // A chunk with usage but no choices is the trailing summary (the zeroed
      // keep-alive variant of it is skipped by the prompt>0 check).
      if (prompt > 0) state.summary = { tokensIn: prompt, tokensOut: completion }
    } else {
      if (prompt > state.promptTokensSeen) state.promptTokensSeen = prompt
      state.completionTokensSum += completion
    }
  }
  const content = choice?.delta?.content
  if (typeof content === 'string' && content !== '' && state.toolCalls.length === 0) {
    state.text += content
    return content
  }
  return null
}

/** Extracts the `data:` payload from one SSE frame, or null for non-data frames. */
function sseData(frame: string): string | null {
  const lines = frame
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.startsWith('data:'))
  if (lines.length === 0) return null
  return lines.map((l) => l.replace(/^data:\s?/, '')).join('')
}

/**
 * The Workers AI provider (ADR-007). Each turn is one `env.AI.run` with
 * `stream: true`: text tokens are yielded as `delta` events as they arrive, so
 * the client can render the answer incrementally instead of waiting out the
 * whole turn, and a tool-call turn is reassembled from its argument fragments
 * and yielded whole in the final `done` event — argument fragments are never
 * emitted as deltas. If the reassembled arguments are not valid JSON the raw
 * string is surfaced verbatim, and the client lint stage rejects it, feeding
 * the model a repair prompt — a garbled stream degrades to the existing retry
 * path, never a crash. Should the binding answer with a plain
 * JSON result despite the stream request, the non-streamed mapping applies
 * unchanged. A neuron/rate ceiling from Cloudflare is raised as
 * `WorkersAiCeilingError` so the router can overflow to a BYOK key (§11.2/D3).
 */
export function createWorkersAiProvider(ai: Ai, model: string): InferenceProvider {
  return {
    id: 'workers-ai',
    async *infer(
      messages: WireProviderMessage[],
      tools: WireTool[],
      signal: AbortSignal,
    ): AsyncGenerator<InferEvent, void, unknown> {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      const inputs: Record<string, unknown> = {
        messages: toWorkersAiMessages(messages),
        stream: true,
      }
      if (tools.length > 0) inputs.tools = toWorkersAiTools(tools)

      let result: unknown
      try {
        result = await raceAbort(ai.run(model, inputs), signal)
      } catch (err) {
        if (isCeilingSignal(err)) {
          throw new WorkersAiCeilingError()
        }
        throw err
      }

      const promptChars = messages.reduce((n, m) => n + m.content.length, 0)

      if (!(result instanceof ReadableStream)) {
        // Non-streamed fallback: the binding resolved to a single JSON result.
        const whole = result as WorkersAiChatResult
        const turn = toWireTurn(whole)
        const tokensIn = whole.usage?.prompt_tokens ?? Math.ceil(promptChars / 4)
        const tokensOut = whole.usage?.completion_tokens ?? estimateTokens(completionText(turn))
        yield { type: 'done', turn, tokensIn, tokensOut }
        return
      }

      const state = newStreamTurnState()
      const reader = (result as ReadableStream<Uint8Array>).getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let ended = false
      try {
        while (!ended) {
          const { done, value } = await raceAbort(reader.read(), signal)
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          // SSE frames are separated by a blank line; the tail past the last
          // separator is an incomplete frame — keep it for the next read.
          const frames = buffer.split('\n\n')
          buffer = frames.pop() ?? ''
          for (const frame of frames) {
            const data = sseData(frame)
            if (data === null || data === '') continue
            if (data === '[DONE]') {
              ended = true
              break
            }
            let parsed: WorkersAiStreamChunk
            try {
              parsed = JSON.parse(data) as WorkersAiStreamChunk
            } catch {
              continue // a malformed chunk is dropped, not fatal
            }
            const delta = applyStreamChunk(state, parsed)
            if (delta !== null) yield { type: 'delta', text: delta }
          }
        }
      } finally {
        try {
          await reader.cancel()
        } catch {
          // Cancelling an already-errored/closed stream is a no-op failure.
        }
      }

      const turn: WireProviderTurn = {
        text: state.text,
        calls: state.toolCalls.flatMap((call): WireToolCall[] =>
          call.name === null ? [] : [{ id: newToolCallId(), name: call.name, input: safeParse(call.args) }],
        ),
      }
      const tokensIn =
        state.summary?.tokensIn ??
        (state.promptTokensSeen > 0 ? state.promptTokensSeen : Math.ceil(promptChars / 4))
      const tokensOut =
        state.summary?.tokensOut ??
        (state.completionTokensSum > 0 ? state.completionTokensSum : estimateTokens(completionText(turn)))
      yield { type: 'done', turn, tokensIn, tokensOut }
    },
  }
}
