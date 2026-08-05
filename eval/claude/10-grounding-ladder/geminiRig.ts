// Phase 3's second `PanelRig` implementation (11-gemini-comparison-arm.md,
// "What ships" §2) — plain `fetch` against the REST endpoint, no new
// dependency, following ollamaRig.ts's own precedent that this harness has no
// SDKs. `GEMINI_API_KEY` is read from the shell environment only: this repo
// has no dotenv and none is to be added (`.env.local` is Vite's, loaded by the
// app, not by tsx) — export the key into the shell before running, e.g.:
// export GEMINI_API_KEY=$(grep '^GEMINI_API_KEY=' .env.local | cut -d= -f2-)
import type { ModelCallResult, PanelRig, WarmUpResult } from './providers';
import type { PanelResponseSchema } from './panelSchema';

// `gemini-2.5-flash` — and the whole 2.5 generation (-lite, -image too) — 404s
// as "no longer available to new users" on this project's key (confirmed
// 2026-07-29 via direct curl to each). `gemini-flash-latest` is the working
// default per the user's real-time call that day; it currently resolves to
// `gemini-3.6-flash`, a materially newer generation than the doc's original
// "cheapest capable tier, closest in class to the 14B" framing assumed. See
// the doc's "Decisions already made" section for the amendment.
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';
/** ~1M token window (verified at build, doc's "Verify at build" section);
 * not enforced client-side the way NUM_CTX is for Ollama — Gemini rejects an
 * over-budget request itself, so this is bookkeeping, not a live guard. */
export const GEMINI_CONTEXT_WINDOW = Number(process.env.GEMINI_CONTEXT_WINDOW ?? 1_000_000);
export const GEMINI_TEMPERATURE = Number(process.env.GEMINI_TEMPERATURE ?? 0.8);
/** Gemini 3.x models (unlike 2.5, which used a numeric `thinkingBudget`) take
 * a `thinkingLevel` string — and per Google's own docs, Gemini 3 Flash/
 * Flash-Lite **cannot fully disable thinking**; `'minimal'` is the lowest
 * available level, not off. A probe with no thinkingConfig at all returned
 * 115 thinking tokens for a one-word reply, confirming thinking is on by
 * default. This means the doc's "comparable rungs" cross runs at
 * minimal-not-zero thinking on this provider — flagged in the doc rather than
 * silently reported as a true apples-to-apples zero-thinking comparison. */
export const GEMINI_THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL ?? 'minimal';
/** Repeats are independent calls, so bounded concurrency is most of Job 1's
 * value (doc: turns a ~4h serial pass into minutes) — conservative default
 * since Tier 1 pricing-tier RPM varies by account. */
const GEMINI_CONCURRENCY = Number(process.env.GEMINI_CONCURRENCY ?? 2);
const MAX_RETRIES = 5;

const GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** Exported for `providers/geminiProvider.ts` (the chat arm) — the same
 * fail-loud precondition, not re-derived, so the two arms fail identically. */
export function requireApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY is unset. This repo has no dotenv (.env.local is Vite\'s, not tsx\'s) — export it into the shell first, ' +
        'e.g. export GEMINI_API_KEY=$(grep \'^GEMINI_API_KEY=\' .env.local | cut -d= -f2-)',
    );
  }
  return key;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: GeminiUsageMetadata;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries on 429/503 with exponential backoff — the harness has zero retry
 * logic today (Ollama never needed it, and its failure mode is thermal/
 * cold-load, not rate limiting). An unretried 429 silently becomes a lost data
 * point the same way the cold-load timeout did on the first Ollama attempt. */
async function fetchWithRetry(apiKey: string, body: unknown): Promise<GeminiResponse> {
  for (let attempt = 0; ; attempt++) {
    // The `?key=` query param 401s on this key's format
    // (ACCESS_TOKEN_TYPE_UNSUPPORTED, confirmed 2026-07-29 via curl against
    // both the harness and the raw endpoint) — the `X-goog-api-key` header is
    // what the working sample request actually used.
    const res = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as GeminiResponse;
    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
      const backoffMs = 1000 * 2 ** attempt;
      console.error(`  [gemini http ${res.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${backoffMs}ms]`);
      await sleep(backoffMs);
      continue;
    }
    throw new Error(`gemini http ${res.status}: ${await res.text()}`);
  }
}

// A counting semaphore, not a queue library — this harness has no dependency
// for one and the need here is exactly "at most N calls in flight."
let inFlight = 0;
const waiters: Array<() => void> = [];
async function acquireSlot(): Promise<() => void> {
  if (inFlight >= GEMINI_CONCURRENCY) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  inFlight += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlight -= 1;
    const next = waiters.shift();
    if (next) next();
  };
}

/** `schema`, when given, is handed to Gemini as `responseSchema` under
 * `responseMimeType: 'application/json'` (doc, "What ships" §2). The PANEL_
 * RESPONSE_SCHEMA authored in Phase 2 constrains `cites` to a non-empty
 * string array only — it does not enumerate valid fact ids (that's R-E's
 * "cites enum-size curve" rider, not this base contract), so "verify the enum
 * survives" from the Phase 3 checklist has no enum to check yet; what *is*
 * verified (see doc's "Verify at build" section) is that Gemini's OpenAPI-
 * subset dialect supports the `enum` keyword at all, for when a rider needs it. */
async function call(system: string, user: string, schema?: PanelResponseSchema): Promise<ModelCallResult> {
  const apiKey = requireApiKey();
  const release = await acquireSlot();
  try {
    const generationConfig: Record<string, unknown> = {
      temperature: GEMINI_TEMPERATURE,
      thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL },
    };
    if (schema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = schema;
    }
    const body = await fetchWithRetry(apiKey, {
      contents: [{ role: 'user', parts: [{ text: user }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig,
    });
    const usage = body.usageMetadata ?? {};
    return {
      content: body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
      promptTokens: usage.promptTokenCount ?? -1,
      responseTokens: usage.candidatesTokenCount ?? -1,
      thinkingTokens: usage.thoughtsTokenCount ?? 0,
      cachedTokens: usage.cachedContentTokenCount ?? 0,
    };
  } finally {
    release();
  }
}

/** No cold-load to pre-pay — this rig's only "warm-up" job is the doc's
 * required fail-loud precondition check, done here so it runs once at the
 * top of `main()` (via `rig.warmUp()`) rather than on the first scored call. */
async function warmUp(): Promise<WarmUpResult> {
  const startedAt = Date.now();
  requireApiKey();
  return { ok: true, elapsedMs: Date.now() - startedAt };
}

export const geminiPanelRig: PanelRig = {
  id: 'gemini',
  model: GEMINI_MODEL,
  contextWindow: GEMINI_CONTEXT_WINDOW,
  temperature: GEMINI_TEMPERATURE,
  thinkingConfig: `thinkingLevel:${GEMINI_THINKING_LEVEL}`,
  warmUp,
  call,
};
