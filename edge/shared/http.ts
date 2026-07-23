// Shared HTTP helpers for the edge endpoints — the request-body cap and the
// typed error responses every endpoint returns instead of a bare 500 + prose.
//
// This is part of the shared edge infrastructure (the dual-keyed limiter, the
// per-endpoint kill-switch, the content-free counters) that build/09-edge/01
// will own and formalize as the router. The synthesis worker is a sibling
// endpoint that sits on it; these helpers are the seam it binds to today.
import type { SynthesisErrorCode } from '../protocol'

/** Reads the body with a hard byte cap. Returns null when the body exceeds it. */
export async function readCappedJson<T>(request: Request, maxBytes: number): Promise<T | null> {
  const raw = await request.text()
  // Byte length, not string length — multibyte column names must not slip the cap.
  if (new TextEncoder().encode(raw).length > maxBytes) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * A typed JSON error the client branches on by code — never content-bearing.
 * The body is only the code; every endpoint on the shared infra returns this
 * shape instead of a bare 500 + prose so the client can render the right
 * paused/rate-limited/quota state deterministically.
 */
export function typedError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const STATUS: Record<SynthesisErrorCode, number> = {
  'bad-request': 400,
  'rate-limited': 429,
  paused: 503,
}

/** The synthesis endpoint's typed error — its codes carry fixed statuses. */
export function errorResponse(code: SynthesisErrorCode): Response {
  return typedError(code, STATUS[code])
}

export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
