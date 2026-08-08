// The in-browser local model's lifecycle: consent-gated background download,
// resumable warm-up, and the one chat entry point the WebLLM provider and the
// local synthesis producer share. The engine itself runs in a Worker
// (workers/webllm.worker.ts) — model load janks the main thread badly enough
// that a main-thread engine is ruled out.
//
// The model is pinned to Qwen3-1.7B: the largest MLC-converted variant that
// still fits alongside DuckDB-Wasm in browser memory (2036 MB VRAM, ~924 MB
// download; 3B+ variants are unverified on 8 GB machines and out of budget).
// It is a reasoning model — replies wrap SQL in a <think> block, which
// toolLadder.ts strips before parsing. Inference is zero-egress — once the
// shards are cached, a completion makes no network request.
import { useWebLLMStore } from "../stores/webllm";
import { useSettingsStore } from "../stores/settings";

/** The pinned model. Larger variants are not verified to fit beside DuckDB. */
export const WEBLLM_MODEL_ID = "Qwen3-1.7B-q4f16_1-MLC";

/** The download's size, surfaced wherever consent is asked. */
export const WEBLLM_DOWNLOAD_SIZE = "~924 MB";

export interface WebLLMChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** The slice of the WebLLM engine the app uses — injectable for tests. */
export interface WebLLMEngine {
  chat: {
    completions: {
      create(request: {
        messages: WebLLMChatMessage[];
        temperature?: number;
        max_tokens?: number;
      }): Promise<{
        choices: Array<{ message?: { content?: string | null } }>;
      }>;
    };
  };
}

export interface WarmDeps {
  /** One engine-creation attempt; rejects on a dropped shard download. */
  createEngine?: (
    onProgress: (progress: number, text: string) => void,
  ) => Promise<WebLLMEngine>;
  hasWebGPU?: () => boolean;
  /** Backoff between download retry attempts; injectable so tests don't sleep. */
  delay?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

// The model CDN drops the connection roughly every ~3 shards. Completed shards
// persist in Cache Storage, so re-creating the engine resumes from the failed
// shard — a generous retry ceiling is cheap and converges across the 30 shards.
const DEFAULT_MAX_ATTEMPTS = 30;

async function defaultCreateEngine(
  onProgress: (progress: number, text: string) => void,
): Promise<WebLLMEngine> {
  const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
  const worker = new Worker(
    new URL("../workers/webllm.worker.ts", import.meta.url),
    {
      type: "module",
    },
  );
  return CreateWebWorkerMLCEngine(worker, WEBLLM_MODEL_ID, {
    initProgressCallback: (report) => onProgress(report.progress, report.text),
  });
}

function defaultHasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

let engine: WebLLMEngine | null = null;
let warmPromise: Promise<boolean> | null = null;

/** True only when a completion can be served locally right now. */
export function isWebLLMReady(): boolean {
  return useWebLLMStore.getState().status === "ready" && engine !== null;
}

/**
 * True when the local model should actually serve: warm AND still consented.
 * Turning the model off in settings after a download must stop it serving, not
 * just stop future downloads — the provider ladder and the synthesis rung both
 * route through this.
 */
export function isWebLLMServing(): boolean {
  return (
    isWebLLMReady() && useSettingsStore.getState().webllmConsent === "accepted"
  );
}

/**
 * Download and warm the model in the background. Idempotent: concurrent calls
 * share one in-flight warm-up, and a warm engine resolves immediately. Never
 * throws — failure lands as status 'error' (the surface stays on the edge rung)
 * and resolves false, so callers can fire-and-forget.
 */
export function warmWebLLM(deps: WarmDeps = {}): Promise<boolean> {
  if (engine !== null) return Promise.resolve(true);
  if (warmPromise !== null) return warmPromise;

  const store = useWebLLMStore.getState();
  const hasWebGPU = deps.hasWebGPU ?? defaultHasWebGPU;
  if (!hasWebGPU()) {
    store.setStatus("unavailable");
    return Promise.resolve(false);
  }

  const createEngine = deps.createEngine ?? defaultCreateEngine;
  const delay =
    deps.delay ?? ((ms) => new Promise((res) => setTimeout(res, ms)));
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  warmPromise = (async () => {
    store.setStatus("downloading");
    const onProgress = (progress: number, text: string) => {
      // WebLLM reports shard fetches at fractional progress and the final
      // GPU load at 1.0 — surface the switch so the bar can say "warming".
      useWebLLMStore.getState().setProgress(progress, text);
      if (progress >= 1) useWebLLMStore.getState().setStatus("warming");
    };

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        engine = await createEngine(onProgress);
        useWebLLMStore.getState().setStatus("ready");
        return true;
      } catch (error) {
        lastError = error;
        await delay(Math.min(2500, 600 * attempt));
      }
    }
    useWebLLMStore
      .getState()
      .setError(
        lastError instanceof Error
          ? lastError.message
          : "Local model failed to load",
      );
    return false;
  })().finally(() => {
    warmPromise = null;
  });
  return warmPromise;
}

/**
 * One local completion. Rejects if the engine is not warm or the engine call
 * fails; an engine-level failure drops status to 'error' so the provider ladder
 * routes the next turn to the edge instead of a dead local engine.
 */
export async function webllmChat(
  messages: WebLLMChatMessage[],
  options: { maxTokens?: number } = {},
): Promise<string> {
  if (engine === null) throw new Error("WebLLM engine is not warm");
  try {
    const result = await engine.chat.completions.create({
      messages,
      temperature: 0,
      max_tokens: options.maxTokens ?? 512,
    });
    return result.choices[0]?.message?.content ?? "";
  } catch (error) {
    engine = null;
    useWebLLMStore
      .getState()
      .setError(
        error instanceof Error ? error.message : "Local model inference failed",
      );
    throw error;
  }
}

/** Test-only: drop the module-level engine so each test starts cold. */
export function resetWebLLMForTests(): void {
  engine = null;
  warmPromise = null;
}
