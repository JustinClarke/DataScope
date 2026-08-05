// Main-thread client for the OPFS staging worker (S6.9 / 07b, ADR-011).
//
// Approach (B): source bytes are staged into origin-private storage at ingest
// and re-registered into a fresh in-memory worker on load. `createInstance()`
// in `duckdb.worker.ts` is untouched — the engine stays in-memory, and
// durability comes from these bytes plus replay.
//
// Nothing here throws at its callers. A staging failure (no support, a second
// tab holding the file, an eviction) lands in `usePersistenceStore` and the
// ingest continues: the session is simply not durable, which the settings
// panel says in place of an error nobody could act on.
import {
  stagingSupported,
  type StagingRequest,
  type StagingResponse,
} from '../workers/opfsStaging.protocol';
import { usePersistenceStore } from '../stores/persistence';

/**
 * One staged source, as recorded in the OPFS manifest. Deliberately minimal —
 * profile, columns and every other registry field are 07c's to persist, and
 * 07d reconciles this list against that registry by `tableName`/`fileHash`.
 */
export interface StagedTable {
  /** The DuckDB table name the bytes were ingested as — unique per workspace, and the staging file's key. */
  tableName: string;
  /** The original file name. Carries the extension, which is what decides the reader on restore. */
  fileName: string;
  /** D45's snapshot hash, when the source was fully buffered at ingest. 07d treats a mismatch as *lost*. */
  fileHash?: string;
  stagedAt: string;
}

const MANIFEST_NAME = 'manifest.json';

// Same realm caveat as the worker side: a structured-cloned buffer is not
// `instanceof` this realm's ArrayBuffer, so a successful read is recognized by
// shape.
function readBuffer(response: StagingResponse): ArrayBuffer | null {
  if (!response.ok || typeof (response.value as ArrayBuffer)?.byteLength !== 'number') return null;
  return response.value as ArrayBuffer;
}

function stagingFileName(tableName: string): string {
  return `t_${encodeURIComponent(tableName)}`;
}

// --- transport ------------------------------------------------------------

export interface StagingTransport {
  send: (request: StagingRequest) => Promise<StagingResponse>;
  dispose: () => void;
}

// No worker, no sync access handle, no staging — the same answer the probe
// gives on a browser that lacks the API. Reached in any environment without
// `Worker` at all (jsdom, an SSR pass), where an in-memory session is the only
// possible behavior anyway.
const NO_STAGING: StagingTransport = {
  send: (request) =>
    Promise.resolve(
      request.op === 'probe'
        ? { id: request.id, ok: true, value: false }
        : { id: request.id, ok: false, error: { name: 'NotSupportedError', message: 'Storage worker unavailable.' } },
    ),
  dispose: () => {},
};

function createWorkerTransport(): StagingTransport {
  if (typeof Worker === 'undefined') return NO_STAGING;
  const worker = new Worker(new URL('../workers/opfs.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, (response: StagingResponse) => void>();
  let nextId = 0;

  worker.addEventListener('message', (event: MessageEvent<StagingResponse>) => {
    pending.get(event.data.id)?.(event.data);
    pending.delete(event.data.id);
  });

  return {
    send(request) {
      const id = nextId++;
      return new Promise<StagingResponse>((resolve) => {
        pending.set(id, resolve);
        // A `Blob`/`File` payload is cloned by reference, so a 300MB drop is
        // not copied on the way to the worker.
        worker.postMessage({ ...request, id });
      });
    },
    dispose() {
      worker.terminate();
    },
  };
}

let transport: StagingTransport | null = null;
let transportFactory: () => StagingTransport = createWorkerTransport;

function getTransport(): StagingTransport {
  if (!transport) transport = transportFactory();
  return transport;
}

/** Test seam: swap the worker for an in-process handler. Passing `null` restores the real worker. */
export function setStagingTransportForTests(factory: (() => StagingTransport) | null): void {
  transport?.dispose();
  transport = null;
  transportFactory = factory ?? createWorkerTransport;
  supportedPromise = null;
}

/** Drops the staging worker — used by "Clear workspace data" once OPFS is empty. */
export function disposeStagingWorker(): void {
  transport?.dispose();
  transport = null;
}

// --- capability -----------------------------------------------------------

let supportedPromise: Promise<boolean> | null = null;

/**
 * Whether this browser can stage at all — asked **in the worker**. The
 * main-thread answer is false on both Chromium and Safari even where the
 * worker-side call succeeds (ADR-011 build rule 2), so this must never be
 * short-circuited with a local `stagingSupported(window)`.
 */
export function isStagingSupported(): Promise<boolean> {
  if (!supportedPromise) {
    supportedPromise = getTransport()
      .send({ id: 0, op: 'probe' })
      .then((response) => response.ok && response.value === true)
      .catch(() => false)
      .then((supported) => {
        if (!supported) {
          usePersistenceStore
            .getState()
            .setStatus('unsupported', 'This browser can’t store a workspace on disk, so a refresh starts fresh.');
        }
        return supported;
      });
  }
  return supportedPromise;
}

// --- failure reporting ----------------------------------------------------

// Both engines report a contended sync access handle this way — Chromium
// "Access Handles cannot be created if there is another open Access Handle",
// Safari "The object is in an invalid state." (ADR-011, finding 2).
const LOCKED_ERRORS = new Set(['NoModificationAllowedError', 'InvalidStateError']);

function report(response: StagingResponse): boolean {
  if (response.ok) {
    usePersistenceStore.getState().setStatus('ready');
    return true;
  }
  const error = response.error;
  if (error && LOCKED_ERRORS.has(error.name)) {
    usePersistenceStore
      .getState()
      .setStatus('locked', 'Another DataScope tab is using this workspace’s storage — this table won’t survive a refresh.');
  } else {
    usePersistenceStore
      .getState()
      .setStatus('failed', `Couldn’t store this table on disk: ${error?.message ?? 'unknown error'}`);
  }
  return false;
}

// --- manifest -------------------------------------------------------------

async function readManifestRaw(): Promise<StagedTable[]> {
  const buffer = readBuffer(await getTransport().send({ id: 0, op: 'read', name: MANIFEST_NAME }));
  if (buffer === null) return [];
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(buffer));
    return Array.isArray(parsed) ? (parsed as StagedTable[]) : [];
  } catch {
    // A truncated manifest is a lost workspace, not a crash — the same
    // *Lost* outcome an eviction produces (07d).
    return [];
  }
}

async function writeManifest(entries: StagedTable[]): Promise<boolean> {
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  const response = await getTransport().send({
    id: 0,
    op: 'write',
    name: MANIFEST_NAME,
    data: bytes.buffer as ArrayBuffer,
  });
  return report(response);
}

/** Everything staged in this origin, or `[]` on a browser that can't stage / a workspace that was never staged. */
export async function readStagedManifest(): Promise<StagedTable[]> {
  if (!(await isStagingSupported())) return [];
  return readManifestRaw();
}

// --- operations -----------------------------------------------------------

/**
 * Stage one table's source bytes. `source` is the original `File` wherever one
 * exists, so the bytes are never copied on the main thread just to persist
 * them. Returns false when the workspace simply isn't durable right now.
 */
export async function stageTable(entry: StagedTable, source: Blob): Promise<boolean> {
  if (!(await isStagingSupported())) return false;

  const write = await getTransport().send({
    id: 0,
    op: 'write',
    name: stagingFileName(entry.tableName),
    data: source,
  });
  if (!report(write)) return false;

  const manifest = await readManifestRaw();
  const next = manifest.filter((staged) => staged.tableName !== entry.tableName);
  next.push(entry);
  return writeManifest(next);
}

/** The staged bytes for one table, or null when they're gone (evicted, cleared, never staged). */
export async function readStagedBytes(tableName: string): Promise<Uint8Array | null> {
  if (!(await isStagingSupported())) return null;
  const buffer = readBuffer(await getTransport().send({ id: 0, op: 'read', name: stagingFileName(tableName) }));
  return buffer === null ? null : new Uint8Array(buffer);
}

/** Drops one table's staged bytes — the storage half of removing a table from the registry. */
export async function unstageTable(tableName: string): Promise<void> {
  if (!(await isStagingSupported())) return;
  // Manifest first: an entry pointing at bytes that are gone is the
  // inconsistency 07d exists to prevent, and the reverse order can leave one
  // behind if the removal fails.
  const manifest = await readManifestRaw();
  const next = manifest.filter((staged) => staged.tableName !== tableName);
  if (next.length !== manifest.length) await writeManifest(next);
  await getTransport().send({ id: 0, op: 'remove', name: stagingFileName(tableName) });
}

/** Empties the staging directory. The caller must have terminated the DuckDB worker first (see `clearWorkspaceData`). */
export async function clearStagingStorage(): Promise<boolean> {
  if (!(await isStagingSupported())) return true;
  const response = await getTransport().send({ id: 0, op: 'clear' });
  return report(response);
}

/** Re-exported so callers that already hold a worker scope can reuse the one detection rule. */
export { stagingSupported };
