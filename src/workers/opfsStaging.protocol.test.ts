import { describe, expect, it } from 'vitest';
import { handleStagingRequest, stagingSupported, type StagingScope } from './opfsStaging.protocol';
import { FakeOpfsRoot, SUPPORTED_SCOPE, UNSUPPORTED_SCOPE } from '../test/fakeOpfs';

function driver(root: FakeOpfsRoot, scope: StagingScope = SUPPORTED_SCOPE) {
  const getRoot = async () => root as unknown as FileSystemDirectoryHandle;
  let id = 0;
  return (op: 'probe' | 'write' | 'read' | 'remove' | 'clear', name?: string, data?: Blob | ArrayBuffer) =>
    handleStagingRequest({ id: id++, op, name, data }, getRoot, scope);
}

const bytesOf = (text: string) => new TextEncoder().encode(text);

describe('staging capability detection', () => {
  it('is true only where a sync access handle exists on the handle prototype', () => {
    expect(stagingSupported(SUPPORTED_SCOPE)).toBe(true);
    expect(stagingSupported(UNSUPPORTED_SCOPE)).toBe(false);
  });

  it('is false without an origin-private filesystem at all', () => {
    expect(stagingSupported({ navigator: {}, FileSystemFileHandle: { prototype: {} } })).toBe(false);
  });
});

describe('staging request handler', () => {
  it('round-trips bytes written from an ArrayBuffer', async () => {
    const send = driver(new FakeOpfsRoot());
    const write = await send('write', 't_orders', bytesOf('id,total\n1,9').buffer as ArrayBuffer);
    expect(write.response.ok).toBe(true);

    const read = await send('read', 't_orders');
    expect(read.response.ok).toBe(true);
    expect(new TextDecoder().decode(read.response.value as ArrayBuffer)).toBe('id,total\n1,9');
  });

  it('round-trips a Blob larger than one write chunk', async () => {
    // 20MB against an 8MB chunk — the slicing loop that keeps a 300MB drop
    // from being materialized whole in the worker.
    const chunk = 'x'.repeat(1024 * 1024);
    const blob = new Blob(Array.from({ length: 20 }, () => chunk));
    const send = driver(new FakeOpfsRoot());

    expect((await send('write', 't_big', blob)).response.ok).toBe(true);
    const read = await send('read', 't_big');
    expect((read.response.value as ArrayBuffer).byteLength).toBe(20 * 1024 * 1024);
  });

  it('truncates on overwrite rather than leaving a longer file behind', async () => {
    const send = driver(new FakeOpfsRoot());
    await send('write', 't_orders', bytesOf('the original longer content').buffer as ArrayBuffer);
    await send('write', 't_orders', bytesOf('short').buffer as ArrayBuffer);

    const read = await send('read', 't_orders');
    expect(new TextDecoder().decode(read.response.value as ArrayBuffer)).toBe('short');
  });

  it('transfers the read buffer instead of copying it', async () => {
    const send = driver(new FakeOpfsRoot());
    await send('write', 't_orders', bytesOf('a').buffer as ArrayBuffer);
    const read = await send('read', 't_orders');
    expect(read.transfer).toEqual([read.response.value]);
  });

  it('reports a missing file as a failure, never a throw', async () => {
    const read = await driver(new FakeOpfsRoot())('read', 't_gone');
    expect(read.response.ok).toBe(false);
    expect(read.response.error?.name).toBe('NotFoundError');
  });

  it('reports a contended access handle with the name the second-tab case produces', async () => {
    const root = new FakeOpfsRoot();
    root.lockedError = 'NoModificationAllowedError';
    const write = await driver(root)('write', 't_orders', bytesOf('a').buffer as ArrayBuffer);

    expect(write.response.ok).toBe(false);
    expect(write.response.error?.name).toBe('NoModificationAllowedError');
  });

  it('releases the access handle even when the write fails', async () => {
    const root = new FakeOpfsRoot();
    const send = driver(root);
    await send('write', 't_orders', bytesOf('a').buffer as ArrayBuffer);
    // A Blob whose slice rejects mid-write — the handle must still close, or
    // every later operation on this file would report a phantom lock.
    const hostile = { size: 10, slice: () => ({ arrayBuffer: () => Promise.reject(new Error('read failed')) }) };
    const failed = await send('write', 't_orders', hostile as unknown as Blob);

    expect(failed.response.ok).toBe(false);
    expect((await send('write', 't_orders', bytesOf('b').buffer as ArrayBuffer)).response.ok).toBe(true);
  });

  it('clear empties every entry', async () => {
    const root = new FakeOpfsRoot();
    const send = driver(root);
    await send('write', 't_a', bytesOf('a').buffer as ArrayBuffer);
    await send('write', 't_b', bytesOf('b').buffer as ArrayBuffer);

    expect((await send('clear')).response.ok).toBe(true);
    expect(root.files.size).toBe(0);
  });

  it('clear fails rather than half-emptying while a file is still held', async () => {
    const root = new FakeOpfsRoot();
    const send = driver(root);
    await send('write', 't_a', bytesOf('a').buffer as ArrayBuffer);
    // Simulate the DuckDB worker still holding the file — the state
    // "Clear workspace data" terminates the engine first to avoid.
    const handle = (await root.getFileHandle('t_a')) as { createSyncAccessHandle: () => Promise<unknown> };
    await handle.createSyncAccessHandle();

    const clear = await send('clear');
    expect(clear.response.ok).toBe(false);
    expect(clear.response.error?.name).toBe('NoModificationAllowedError');
  });

  it('probe answers from the scope it is given', async () => {
    expect((await driver(new FakeOpfsRoot())('probe')).response.value).toBe(true);
    expect((await driver(new FakeOpfsRoot(), UNSUPPORTED_SCOPE)('probe')).response.value).toBe(false);
  });
});
