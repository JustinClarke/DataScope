// Manifest logging (DESIGN.md §4: "every prompt, emitted SQL, raw result,
// error, arm, model, machine, token counts, and peak memory logged per
// call"). runner.ts's runOneCall stays pure/single-purpose (one cell in,
// one result out, no I/O) — this module is the thin, separately-testable
// layer that adds the fields runOneCall has no way to know about itself
// (which dataset, which machine, peak RSS around the call) and appends the
// result as one JSONL line, so a sweep can be killed and resumed without
// losing completed rows.
import { execSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runOneCall, type RunOneCallParams, type RunOneCallResult } from './runner';

export interface ManifestRow extends RunOneCallResult {
  dataset: string;
  machine: string;
  /** This harness process's own peak RSS — negligible (DuckDB + Node), kept for historical comparability with bakeoff.ts/ladderDiagnosis.ts's already-collected manifests, not what DESIGN.md §4's "peak RSS under 6GB" viability budget means. */
  peakRssBytes: number;
  /** The actual memory the viability budget cares about (roadmap item 2): peak summed RSS, in bytes, of every locally-running Ollama model-runner subprocess during this call. Confirmed live (0.32.1, this machine) that `ollama serve` itself never exceeds ~50MB regardless of what's loaded — it spawns a separate `llama-server` child process per loaded model, and *that* process is where the model's weights and KV cache actually live; sampling the parent (this field's predecessor) would silently read near-zero always. Summed rather than max'd in case a prior sweep step left a model resident. */
  ollamaRssBytes: number;
  timestamp: string;
}

export function appendManifestRow(path: string, row: ManifestRow): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`, 'utf8');
}

const RSS_SAMPLE_INTERVAL_MS = 50;
/** Shelling out to `ps` is far more expensive than reading this process's own `process.memoryUsage()`, so the external sampler runs on a coarser tick — still fine against DESIGN.md §4's 30s p95 budget (at most ~150 forks per call). */
const OLLAMA_RSS_SAMPLE_INTERVAL_MS = 200;
/** Ollama's model-runner binary has been named both of these across versions (`llama-server` on 0.32.x, `ollama_llama_server` on older releases) — matching both keeps this from silently reading zero after an Ollama upgrade. */
const OLLAMA_RUNNER_PATTERNS = ['llama-server', 'ollama_llama_server'];

/** Sums RSS (bytes) across every running process whose command line matches an Ollama runner pattern. Returns 0 (never throws) if `ps` is unavailable or nothing matches — e.g. no model currently loaded, or a non-Unix host. */
function sampleOllamaRunnerRssBytes(): number {
  let stdout: string;
  try {
    stdout = execSync('ps -axo rss=,command=', { encoding: 'utf8' });
  } catch {
    return 0;
  }
  return stdout
    .split('\n')
    .filter((line) => OLLAMA_RUNNER_PATTERNS.some((pattern) => line.includes(pattern)))
    .reduce((sum, line) => {
      const rssKb = Number(line.trim().split(/\s+/)[0]);
      return sum + (Number.isFinite(rssKb) ? rssKb * 1024 : 0);
    }, 0);
}

/**
 * Runs one cell via `runOneCall`, samples both this process's RSS and the
 * live Ollama runner subprocess(es)' RSS at fixed intervals while the call
 * is in flight to catch each peak (not just before/after), and appends the
 * combined row to the manifest at `path`. `dataset` and `machine` are
 * caller-supplied labels (e.g. "ecommerce", "M4") — this function has no
 * way to infer either from `params` alone.
 */
export async function runAndLog(
  path: string,
  dataset: string,
  machine: string,
  params: RunOneCallParams,
): Promise<ManifestRow> {
  let peakRssBytes = process.memoryUsage().rss;
  const sampler = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  }, RSS_SAMPLE_INTERVAL_MS);
  let peakOllamaRssBytes = sampleOllamaRunnerRssBytes();
  const ollamaSampler = setInterval(() => {
    peakOllamaRssBytes = Math.max(peakOllamaRssBytes, sampleOllamaRunnerRssBytes());
  }, OLLAMA_RSS_SAMPLE_INTERVAL_MS);
  try {
    const result = await runOneCall(params);
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    peakOllamaRssBytes = Math.max(peakOllamaRssBytes, sampleOllamaRunnerRssBytes());
    const row: ManifestRow = { ...result, dataset, machine, peakRssBytes, ollamaRssBytes: peakOllamaRssBytes, timestamp: new Date().toISOString() };
    appendManifestRow(path, row);
    return row;
  } finally {
    clearInterval(sampler);
    clearInterval(ollamaSampler);
  }
}
