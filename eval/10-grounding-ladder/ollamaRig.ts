// The rig contract both live arms share (10-grounding-ladder.md, "Non-negotiable
// rig detail" + the first run attempt's handoff items 1 and 2): num_ctx set
// explicitly on every call, keep_alive set explicitly so a stalled pass doesn't
// re-pay the cold load, and the cold load itself paid once by a warm-up that
// runs outside the timing path on a dispatcher long enough to survive it.
//
// Extracted here rather than duplicated because run.ts (panel arm) and
// runChat.ts (chat arm) must not drift on it: a run whose two arms used
// different context sizes measures nothing comparable.
import { Agent, setGlobalDispatcher } from 'undici';

export const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? 'http://100.126.157.97:11434').replace(/\/$/, '');
export const OLLAMA_CHAT_URL = process.env.OLLAMA_CHAT_URL ?? `${OLLAMA_BASE_URL}/api/chat`;
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:14b';
export const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 32768);
/** Ollama's observed default expiry is ~5 min; a 250-call pass that stalls
 * anywhere longer than that re-pays the full cold load — the very cost the
 * warm-up exists to pay once. Set explicitly and recorded, like num_ctx. */
export const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE ?? '60m';

/** platformCheck06's own live finding on this rig: generation at num_ctx=32768
 * can take minutes; undici's 300s default trips on stream:false before
 * generation finishes. */
const CALL_TIMEOUT_MS = Number(process.env.OLLAMA_CALL_TIMEOUT_MS ?? 600_000);
const WARMUP_TIMEOUT_MS = Number(process.env.OLLAMA_WARMUP_TIMEOUT_MS ?? 1_800_000);

export function installRigDispatcher(): void {
  setGlobalDispatcher(new Agent({ headersTimeout: CALL_TIMEOUT_MS, bodyTimeout: CALL_TIMEOUT_MS }));
}

export interface WarmUpResult {
  ok: boolean;
  elapsedMs: number;
  error?: string;
}

/** One trivial generation at the run's own num_ctx/keep_alive, on a dispatcher
 * that tolerates a full cold load — the first run attempt's one reproducible
 * harness bug was that cold-loading a 14B q4 at num_ctx=32768 outlasts the call
 * timeout, so call #1 of any cold run failed by construction and, at N=20,
 * silently lost a ladder data point to a transport error rather than a result.
 * Not a data point and never scored: its only job is that the first *scored*
 * call meets a resident model. A failure here is reported and the caller
 * continues — the per-call transport catch still records what happens next. */
export async function warmUp(): Promise<WarmUpResult> {
  const dispatcher = new Agent({ headersTimeout: WARMUP_TIMEOUT_MS, bodyTimeout: WARMUP_TIMEOUT_MS });
  const startedAt = Date.now();
  try {
    const res = await fetch(OLLAMA_CHAT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
        stream: false,
        keep_alive: KEEP_ALIVE,
        options: { num_ctx: NUM_CTX, num_predict: 4 },
      }),
      dispatcher,
    } as RequestInit);
    if (!res.ok) throw new Error(`ollama http ${res.status}`);
    await res.json();
    return { ok: true, elapsedMs: Date.now() - startedAt };
  } catch (err) {
    return { ok: false, elapsedMs: Date.now() - startedAt, error: String(err) };
  }
}

/** Logs the warm-up the same way for both arms. */
export async function warmUpAndReport(): Promise<WarmUpResult> {
  console.log(`warming up ${OLLAMA_MODEL} at num_ctx=${NUM_CTX} (keep_alive=${KEEP_ALIVE}, timeout ${WARMUP_TIMEOUT_MS / 1000}s)...`);
  const warm = await warmUp();
  console.log(warm.ok ? `warm-up ok in ${(warm.elapsedMs / 1000).toFixed(1)}s` : `warm-up FAILED after ${(warm.elapsedMs / 1000).toFixed(1)}s: ${warm.error}`);
  return warm;
}
