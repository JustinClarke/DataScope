// An in-memory stand-in for the slice of OPFS the staging worker uses (S6.9 /
// 07b). jsdom has no origin-private filesystem and no sync access handles, so
// this is what lets `opfsStaging.protocol.ts` and everything above it be tested
// for real rather than mocked away. It models the two behaviors the design
// actually depends on: exclusive access handles (the second holder throws the
// way a second tab does) and `removeEntry` failing while a handle is open.

import type { StagingScope } from '../workers/opfsStaging.protocol';

interface FakeFile {
  bytes: Uint8Array;
  open: boolean;
}

function domException(name: string, message: string): DOMException {
  return new DOMException(message, name);
}

export class FakeOpfsRoot {
  readonly files = new Map<string, FakeFile>();

  /** Set to a DOMException name to make the next `createSyncAccessHandle` fail — the second-tab case. */
  lockedError: string | null = null;

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<unknown> {
    if (!this.files.has(name)) {
      if (!options?.create) throw domException('NotFoundError', `No file named "${name}".`);
      this.files.set(name, { bytes: new Uint8Array(0), open: false });
    }
    const file = this.files.get(name)!;

    return {
      createSyncAccessHandle: async () => {
        if (this.lockedError !== null) {
          throw domException(this.lockedError, 'Access Handles cannot be created if there is another open Access Handle.');
        }
        if (file.open) {
          throw domException('NoModificationAllowedError', 'Access handle already open.');
        }
        file.open = true;
        return {
          getSize: () => file.bytes.byteLength,
          truncate: (size: number) => {
            file.bytes = file.bytes.slice(0, size);
          },
          write: (data: Uint8Array, options: { at: number }) => {
            const end = options.at + data.byteLength;
            if (end > file.bytes.byteLength) {
              const grown = new Uint8Array(end);
              grown.set(file.bytes, 0);
              file.bytes = grown;
            }
            file.bytes.set(data, options.at);
            return data.byteLength;
          },
          read: (target: Uint8Array, options: { at: number }) => {
            const slice = file.bytes.subarray(options.at, options.at + target.byteLength);
            target.set(slice, 0);
            return slice.byteLength;
          },
          flush: () => {},
          close: () => {
            file.open = false;
          },
        };
      },
    };
  }

  async *keys(): AsyncGenerator<string> {
    for (const name of Array.from(this.files.keys())) yield name;
  }

  async removeEntry(name: string): Promise<void> {
    const file = this.files.get(name);
    if (!file) throw domException('NotFoundError', `No file named "${name}".`);
    // The ordering constraint "Clear workspace data" is built around: a file
    // the engine still holds cannot be removed (ADR-011 build rule 3).
    if (file.open) throw domException('NoModificationAllowedError', 'File has a live access handle.');
    this.files.delete(name);
  }
}

/** A worker-like scope that reports staging as supported. */
export const SUPPORTED_SCOPE: StagingScope = {
  navigator: { storage: { getDirectory: () => {} } },
  FileSystemFileHandle: { prototype: { createSyncAccessHandle: () => {} } },
};

/** A worker-like scope with no sync access handles — the "can't stage at all" browser. */
export const UNSUPPORTED_SCOPE: StagingScope = {
  navigator: { storage: { getDirectory: () => {} } },
  FileSystemFileHandle: { prototype: {} },
};
