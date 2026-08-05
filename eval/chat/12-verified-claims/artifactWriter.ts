import { createHash, randomBytes } from 'node:crypto';
import { appendFile, link, mkdir, open, readFile, readdir, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export interface RunManifest {
  runId: string;
  startedAt: string;
  command: string[];
  workingDirectory: string;
  experimentVersion: string;
  schemaVersions: { manifest: number; events: number; calls: number };
  git: { commit: string; statusShort: string };
  runtime: { node: string; duckdbWasm: string; harness: string };
  fixtures: Array<{ id: string; absolutePath: string; byteSize: number; sha256: string }>;
  provider: {
    name: string;
    endpointHost: string;
    modelTag: string;
    modelDigest: string | null;
  };
  options: {
    temperature: number;
    numCtx: number;
    keepAlive: string;
    timeoutMs: number;
    retryCap: number;
    repairCap: number;
  };
  selection: { questions: string[]; repeats: number; filters: string[] };
  hashes: {
    systemPrompts: Record<string, string>;
    schemas: Record<string, string>;
    deterministicSources: Record<string, string>;
  };
  privacy: { classification: string; bundledPublicFixturesOnly: boolean };
}

export interface RawCallArtifact {
  questionId: string;
  role: 'planner' | 'repair' | 'claim' | 'renderer';
  attempt: number;
  messages: Array<{ role: string; content: string }>;
  schema: unknown;
  requestOptions: unknown;
  http?: { status: number; headers: Record<string, string>; rawResponseBody: string };
  parsedValue?: unknown;
  parseError?: unknown;
  tokenCounts: { prompt: number | null; response: number | null; load?: number | null; eval?: number | null } | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  responseHash?: string;
  contentHash?: string;
  error?: unknown;
}

type TerminalEvent = 'run_completed' | 'run_interrupted';

interface RunEvent {
  timestamp: string;
  sequence: number;
  type: string;
  runId: string;
  [key: string]: unknown;
}

const SECRET_KEY = /(?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret|cookie)/i;
const TERMINAL_EVENTS = new Set<TerminalEvent>(['run_completed', 'run_interrupted']);

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function redactString(value: string): string {
  if (/^bearer\s+/i.test(value)) return '[REDACTED]';
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = '';
      url.password = '';
      return url.toString();
    }
  } catch {
    // Ordinary strings are not URLs.
  }
  return value;
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack,
      ...(value.cause === undefined ? {} : { cause: redactSecrets(value.cause) }),
    };
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY.test(key) ? '[REDACTED]' : redactSecrets(entry),
    ]));
  }
  return typeof value === 'string' ? redactString(value) : value;
}

async function writeAtomicExclusive(path: string, contents: string): Promise<void> {
  const temporaryPath = join(dirname(path), `.${basename(path)}.tmp-${randomBytes(6).toString('hex')}`);
  const handle = await open(temporaryPath, 'wx');
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    // Linking is the no-replace form of atomic publication available through
    // Node's portable filesystem API. It preserves the crash-safe temp-file
    // protocol without Unix rename's overwrite behavior.
    await link(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function writeJsonAtomicExclusive(path: string, value: unknown): Promise<void> {
  await writeAtomicExclusive(path, `${JSON.stringify(redactSecrets(value), null, 2)}\n`);
}

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await appendFile(path, `${JSON.stringify(redactSecrets(value))}\n`, { encoding: 'utf8', flag: 'a' });
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class ArtifactWriter {
  readonly directory: string;
  readonly runId: string;
  private sequence = 0;
  private callSequence = 0;
  private terminal = false;
  private operation = Promise.resolve();

  private constructor(directory: string, runId: string) {
    this.directory = directory;
    this.runId = runId;
  }

  static async start(root: string, manifest: RunManifest): Promise<ArtifactWriter> {
    await mkdir(root, { recursive: true });
    const directory = join(root, manifest.runId);
    await mkdir(directory);
    await Promise.all(['calls', 'plans', 'sql', 'evidence', 'claims'].map((name) => mkdir(join(directory, name))));
    await writeJsonAtomicExclusive(join(directory, 'manifest.json'), manifest);

    const writer = new ArtifactWriter(directory, manifest.runId);
    await writer.appendEvent('run_started', {});
    return writer;
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.operation.then(work);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }

  appendEvent(type: string, detail: Record<string, unknown>): Promise<void> {
    return this.enqueue(async () => {
      if (this.terminal) throw new Error(`run is terminal: ${this.runId}`);
      this.sequence += 1;
      const event: RunEvent = {
        timestamp: new Date().toISOString(),
        sequence: this.sequence,
        type,
        runId: this.runId,
        ...detail,
      };
      await appendJsonLine(join(this.directory, 'events.jsonl'), event);
      if (TERMINAL_EVENTS.has(type as TerminalEvent)) this.terminal = true;
    });
  }

  writeCall(call: RawCallArtifact): Promise<string> {
    return this.enqueue(async () => {
      if (this.terminal) throw new Error(`run is terminal: ${this.runId}`);
      this.callSequence += 1;
      const callId = String(this.callSequence).padStart(4, '0');
      const path = join(this.directory, 'calls', `${callId}-${call.role}-attempt-${call.attempt}.json`);
      await writeJsonAtomicExclusive(path, { callId, ...call });
      return path;
    });
  }

  writeJsonArtifact(
    category: 'plans' | 'evidence' | 'claims',
    filename: string,
    value: unknown,
  ): Promise<string> {
    return this.enqueue(async () => {
      if (this.terminal) throw new Error(`run is terminal: ${this.runId}`);
      if (!/^[a-z0-9][a-z0-9._-]*\.json$/.test(filename)) {
        throw new Error(`invalid JSON artifact filename: ${filename}`);
      }
      const path = join(this.directory, category, filename);
      await writeJsonAtomicExclusive(path, value);
      return path;
    });
  }

  writeSqlArtifact(filename: string, sql: string): Promise<string> {
    return this.enqueue(async () => {
      if (this.terminal) throw new Error(`run is terminal: ${this.runId}`);
      if (!/^[a-z0-9][a-z0-9._-]*\.sql$/.test(filename)) {
        throw new Error(`invalid SQL artifact filename: ${filename}`);
      }
      const path = join(this.directory, 'sql', filename);
      await writeAtomicExclusive(path, sql.endsWith('\n') ? sql : `${sql}\n`);
      return path;
    });
  }

  async complete(verdict: unknown): Promise<void> {
    await this.enqueue(async () => {
      if (this.terminal) throw new Error(`run is terminal: ${this.runId}`);
      await writeJsonAtomicExclusive(join(this.directory, 'verdict.json'), verdict);
    });
    await this.appendEvent('run_completed', { verdict: 'recorded' });
  }

  async interrupt(reason: unknown): Promise<void> {
    await this.appendEvent('run_interrupted', { reason });
  }
}

export async function inspectRun(directory: string): Promise<{
  runId: string;
  status: 'completed' | 'interrupted' | 'incomplete';
  terminalEvent: TerminalEvent | null;
  dispositions: Record<string, number>;
  incompleteTemporaryFiles: string[];
}> {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as RunManifest;
  const ledger = await readFile(join(directory, 'events.jsonl'), 'utf8');
  const events = ledger.split('\n').filter(Boolean).map((line) => JSON.parse(line) as RunEvent);
  const terminal = [...events].reverse().find((event) => TERMINAL_EVENTS.has(event.type as TerminalEvent));
  const dispositions: Record<string, number> = {};
  for (const event of events) {
    if (typeof event.disposition !== 'string') continue;
    dispositions[event.disposition] = (dispositions[event.disposition] ?? 0) + 1;
  }
  const incompleteTemporaryFiles = (await readdir(directory))
    .filter((name) => name.includes('.tmp-'))
    .sort();

  return {
    runId: manifest.runId,
    status: terminal?.type === 'run_completed' ? 'completed' : terminal?.type === 'run_interrupted' ? 'interrupted' : 'incomplete',
    terminalEvent: (terminal?.type as TerminalEvent | undefined) ?? null,
    dispositions,
    incompleteTemporaryFiles,
  };
}

export async function writeDerivedRescore(directory: string, scorerId: string, value: unknown): Promise<string> {
  const derived = join(directory, 'derived');
  await mkdir(derived, { recursive: true });
  const path = join(derived, `rescore-${scorerId}.json`);
  await writeJsonAtomicExclusive(path, { scorerId, sourceRunId: basename(directory), result: value });
  return path;
}
