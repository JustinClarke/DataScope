// The BYOK pass-through resolver (D9) — the security-sensitive custody boundary.
//
// Custody rule, enforced structurally here: the user's raw key is read from the
// request credential, held only in the closure of the provider it builds, and
// placed only in the outbound `Authorization` header. It is never persisted,
// never logged, never written to a counter or rate key, and never echoed in a
// response — the returned provider's `id` is a fixed label, and no code path
// serializes the key anywhere but the upstream request. This is the seam
// build/09-edge/03-vault later widens with server-side reference resolution; the
// pass-through form is what a live custody audit (logs/KV/response) runs against.
// The vault widened that seam (build/09-edge/03) without widening custody: a
// vaulted key is decrypted in-process and handed to the same closure, so both
// forms converge on one `Authorization` header and nothing else.
import type { ByokResolver, InferenceProvider, InferEvent } from '../handlers/ai-router'
import type { VaultResolver } from '../handlers/vault'
import type {
  ByokCredential,
  WireProviderMessage,
  WireProviderTurn,
  WireTool,
} from '../protocol'

/** OpenAI-compatible chat-completions endpoint (the canonical pass-through case). */
const OPENAI_CHAT_URL = 'http://100.126.157.97:11434/v1/chat/completions'
const DEFAULT_OPENAI_MODEL = 'qwen2.5-coder:14b'

interface OpenAiChatResult {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>
    }
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

function toOpenAiMessages(messages: WireProviderMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.toolCall !== undefined) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: [
          {
            id: m.toolCall.id,
            type: 'function',
            function: { name: m.toolCall.name, arguments: JSON.stringify(m.toolCall.input) },
          },
        ],
      }
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
    }
    return { role: m.role, content: m.content }
  })
}

function toOpenAiTools(tools: WireTool[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }))
}

function toWireTurn(result: OpenAiChatResult): WireProviderTurn {
  const message = result.choices?.[0]?.message
  const call = message?.tool_calls?.[0]
  if (call?.function?.name !== undefined) {
    let input: unknown = {}
    try {
      input = JSON.parse(call.function.arguments ?? '{}')
    } catch {
      input = call.function.arguments ?? {}
    }
    return { kind: 'tool_call', call: { id: call.id ?? 'call_0', name: call.function.name, input } }
  }
  return { kind: 'text', text: message?.content ?? '' }
}

/**
 * Builds a one-shot OpenAI-compatible provider bound to the raw key. The key is a
 * local parameter used only in the `Authorization` header of the single outbound
 * request; nothing else in this closure retains or emits it.
 */
function createOpenAiProvider(key: string, model: string): InferenceProvider {
  return {
    id: 'byok',
    async *infer(
      messages: WireProviderMessage[],
      tools: WireTool[],
      signal: AbortSignal,
    ): AsyncGenerator<InferEvent, void, unknown> {
      const body: Record<string, unknown> = { model, messages: toOpenAiMessages(messages) }
      if (tools.length > 0) body.tools = toOpenAiTools(tools)
      const res = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal,
      })
      if (!res.ok) {
        // Surface a transport failure without leaking the upstream body (which may
        // echo request fragments); the router records only a numeric outcome.
        throw new Error(`byok upstream ${res.status}`)
      }
      const result = (await res.json()) as OpenAiChatResult
      const turn = toWireTurn(result)
      const tokensIn = result.usage?.prompt_tokens ?? 0
      const tokensOut = result.usage?.completion_tokens ?? 0
      yield { type: 'done', turn, tokensIn, tokensOut }
    },
  }
}

/**
 * The credential resolver, covering both D9 custody forms. A raw `key` is the
 * pass-through case above. A `vaultRef` + `vaultSession` is the opt-in case: the
 * injected `vault` (build/09-edge/03) reads the key server-side and it goes
 * straight into the same closure — the vaulted key reaches exactly one place the
 * pass-through key does, and no more. An unknown provider, an unresolvable
 * reference, or a deploy with no vault configured all return null, which the
 * router turns into a typed bad-request rather than a silent fallback.
 */
export function createByokResolver(vault?: VaultResolver): ByokResolver {
  return {
    async resolve(cred: ByokCredential): Promise<InferenceProvider | null> {
      if (cred.provider === 'openai' && typeof cred.key === 'string' && cred.key.length > 0) {
        return createOpenAiProvider(cred.key, cred.model ?? DEFAULT_OPENAI_MODEL)
      }
      if (
        vault !== undefined &&
        typeof cred.vaultRef === 'string' &&
        typeof cred.vaultSession === 'string'
      ) {
        const found = await vault(cred.vaultSession, cred.vaultRef)
        // The vaulted record carries its own provider/model — the request's copy
        // is not trusted to redirect a stored key at a different provider.
        if (found !== null && found.provider === 'openai') {
          return createOpenAiProvider(found.key, found.model ?? DEFAULT_OPENAI_MODEL)
        }
        return null
      }
      // Non-OpenAI adapters are not wired in this deploy.
      return null
    },
  }
}
