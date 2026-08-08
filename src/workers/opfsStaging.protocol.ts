// The OPFS staging protocol (S6.9 / 07b, ADR-011). Every write goes through a
// worker's `createSyncAccessHandle` — never `createWritable`, which Safari 18.6
// does not have on an OPFS file handle (ADR-011 build rule 1). The request
// handler lives here rather than inside the worker module so it can be driven
// directly in tests against a fake directory handle; `opfs.worker.ts` is a
// five-line adapter over it.

export interface StagingRequest {
  id: number;
  op: "probe" | "write" | "read" | "remove" | "clear";
  /** File name inside the OPFS root — absent for `probe`/`clear`. */
  name?: string;
  /** `write` payload. A `Blob` is passed by reference through `postMessage`, so a dropped `File` never gets copied on the main thread. */
  data?: Blob | ArrayBuffer;
}

export interface StagingFailure {
  /** DOMException name — `NoModificationAllowedError`/`InvalidStateError` are the two that mean "another tab holds this file". */
  name: string;
  message: string;
}

export interface StagingResponse {
  id: number;
  ok: boolean;
  /** `probe` → boolean; `read` → ArrayBuffer; everything else → undefined. */
  value?: boolean | ArrayBuffer;
  error?: StagingFailure;
}

/**
 * The sync-access-handle surface, declared here because the DOM lib this
 * project builds against doesn't carry it yet. Worker-only by specification —
 * which is the whole reason this module exists.
 */
interface SyncAccessHandle {
  getSize: () => number;
  read: (buffer: Uint8Array, options: { at: number }) => number;
  write: (buffer: Uint8Array, options: { at: number }) => number;
  truncate: (size: number) => void;
  flush: () => void;
  close: () => void;
}

type SyncCapableFileHandle = FileSystemFileHandle & {
  createSyncAccessHandle: () => Promise<SyncAccessHandle>;
};

/** The worker global as this module reads it — narrowed so tests can pass a stand-in. */
export interface StagingScope {
  navigator?: { storage?: { getDirectory?: unknown } };
  FileSystemFileHandle?: { prototype: object };
}

/**
 * Capability detection, deliberately worker-side.
 * `'createSyncAccessHandle' in FileSystemFileHandle.prototype` reports **false**
 * on the main thread in both Chromium and Safari while the worker-side call
 * succeeds in both (ADR-011 build rule 2) — running this check on the main
 * thread would disable persistence on every browser that supports it.
 */
export function stagingSupported(scope: StagingScope): boolean {
  if (typeof scope.navigator?.storage?.getDirectory !== "function")
    return false;
  const handleCtor = scope.FileSystemFileHandle;
  return (
    handleCtor !== undefined && "createSyncAccessHandle" in handleCtor.prototype
  );
}

// Written in slices rather than one `arrayBuffer()`: a 300MB file (the §7.3
// ceiling) would otherwise be fully materialized in the worker on top of the
// copy DuckDB already holds.
const WRITE_CHUNK_BYTES = 8 * 1024 * 1024;

// Duck-typed, not `instanceof`: this value arrives by structured clone, so its
// constructor belongs to whichever realm deserialized it.
function isBlobLike(data: Blob | ArrayBuffer): data is Blob {
  return (
    typeof (data as Blob).size === "number" &&
    typeof (data as Blob).slice === "function"
  );
}

async function writeFile(
  root: FileSystemDirectoryHandle,
  name: string,
  data: Blob | ArrayBuffer,
): Promise<void> {
  const handle = (await root.getFileHandle(name, {
    create: true,
  })) as SyncCapableFileHandle;
  const access = await handle.createSyncAccessHandle();
  try {
    access.truncate(0);
    if (!isBlobLike(data)) {
      access.write(new Uint8Array(data), { at: 0 });
    } else {
      let at = 0;
      while (at < data.size) {
        const chunk = await data
          .slice(at, at + WRITE_CHUNK_BYTES)
          .arrayBuffer();
        access.write(new Uint8Array(chunk), { at });
        at += chunk.byteLength;
      }
    }
    access.flush();
  } finally {
    access.close();
  }
}

async function readFile(
  root: FileSystemDirectoryHandle,
  name: string,
): Promise<ArrayBuffer> {
  const handle = (await root.getFileHandle(name)) as SyncCapableFileHandle;
  const access = await handle.createSyncAccessHandle();
  try {
    const buffer = new ArrayBuffer(access.getSize());
    access.read(new Uint8Array(buffer), { at: 0 });
    return buffer;
  } finally {
    access.close();
  }
}

async function clearRoot(root: FileSystemDirectoryHandle): Promise<void> {
  // Collected before removing: mutating the directory while iterating its own
  // async keys is not something the spec promises anything about.
  const names: string[] = [];
  for await (const name of root.keys()) names.push(name);
  for (const name of names) {
    await root.removeEntry(name, { recursive: true });
  }
}

function toFailure(error: unknown): StagingFailure {
  if (error instanceof DOMException || error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "UnknownError", message: String(error) };
}

/**
 * Runs one request against an OPFS directory. `root` is injected so tests can
 * pass a fake; the worker passes `navigator.storage.getDirectory()`.
 * A missing file resolves as a failure (`NotFoundError`), never a throw — an
 * evicted staging file is an ordinary outcome here (ADR-011 build rule 4).
 */
export async function handleStagingRequest(
  request: StagingRequest,
  getRoot: () => Promise<FileSystemDirectoryHandle>,
  scope: StagingScope,
): Promise<{ response: StagingResponse; transfer: Transferable[] }> {
  const plain = (response: StagingResponse) => ({
    response,
    transfer: [] as Transferable[],
  });

  try {
    switch (request.op) {
      case "probe":
        return plain({
          id: request.id,
          ok: true,
          value: stagingSupported(scope),
        });
      case "write":
        await writeFile(await getRoot(), request.name!, request.data!);
        return plain({ id: request.id, ok: true });
      case "read": {
        const buffer = await readFile(await getRoot(), request.name!);
        return {
          response: { id: request.id, ok: true, value: buffer },
          transfer: [buffer],
        };
      }
      case "remove":
        await (await getRoot()).removeEntry(request.name!);
        return plain({ id: request.id, ok: true });
      case "clear":
        await clearRoot(await getRoot());
        return plain({ id: request.id, ok: true });
    }
  } catch (error) {
    return plain({ id: request.id, ok: false, error: toFailure(error) });
  }
}
