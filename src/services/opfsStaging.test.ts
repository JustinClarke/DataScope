import { beforeEach, describe, expect, it } from "vitest";
import {
  clearStagingStorage,
  isStagingSupported,
  readStagedBytes,
  readStagedManifest,
  setStagingTransportForTests,
  stageTable,
  unstageTable,
  type StagingTransport,
} from "./opfsStaging";
import {
  handleStagingRequest,
  type StagingScope,
} from "../workers/opfsStaging.protocol";
import { usePersistenceStore } from "../stores/persistence";
import {
  FakeOpfsRoot,
  SUPPORTED_SCOPE,
  UNSUPPORTED_SCOPE,
} from "../test/fakeOpfs";

// The real request handler over a fake OPFS root: everything below exercises
// the actual protocol, not a mock of it.
function install(
  root: FakeOpfsRoot,
  scope: StagingScope = SUPPORTED_SCOPE,
): void {
  const transport: StagingTransport = {
    send: async (request) =>
      (
        await handleStagingRequest(
          request,
          async () => root as unknown as FileSystemDirectoryHandle,
          scope,
        )
      ).response,
    dispose: () => {},
  };
  setStagingTransportForTests(() => transport);
}

const staged = (tableName: string) => ({
  tableName,
  fileName: `${tableName}.csv`,
  fileHash: `hash-${tableName}`,
  stagedAt: "2026-07-29T00:00:00.000Z",
});

const csv = new Blob(["id,total\n1,9\n"]);

describe("OPFS staging client", () => {
  let root: FakeOpfsRoot;

  beforeEach(() => {
    root = new FakeOpfsRoot();
    install(root);
    usePersistenceStore.setState({
      status: "unknown",
      note: null,
      restore: null,
    });
  });

  it("stages bytes and records them in the manifest", async () => {
    expect(await stageTable(staged("orders"), csv)).toBe(true);

    expect(await readStagedManifest()).toEqual([staged("orders")]);
    expect(new TextDecoder().decode((await readStagedBytes("orders"))!)).toBe(
      "id,total\n1,9\n",
    );
    expect(usePersistenceStore.getState().status).toBe("ready");
  });

  it("re-staging the same table replaces its entry rather than duplicating it", async () => {
    await stageTable(staged("orders"), csv);
    await stageTable(
      { ...staged("orders"), fileHash: "hash-updated" },
      new Blob(["id\n2\n"]),
    );

    const manifest = await readStagedManifest();
    expect(manifest).toHaveLength(1);
    expect(manifest[0].fileHash).toBe("hash-updated");
    expect(new TextDecoder().decode((await readStagedBytes("orders"))!)).toBe(
      "id\n2\n",
    );
  });

  it("keeps table names with characters OPFS would choke on addressable", async () => {
    const awkward = staged("orders/2026 Q3");
    await stageTable(awkward, csv);

    expect(await readStagedManifest()).toEqual([awkward]);
    expect(await readStagedBytes("orders/2026 Q3")).not.toBeNull();
  });

  it("unstaging removes both the manifest entry and the bytes", async () => {
    await stageTable(staged("orders"), csv);
    await stageTable(staged("customers"), csv);

    await unstageTable("orders");

    expect(
      (await readStagedManifest()).map((entry) => entry.tableName),
    ).toEqual(["customers"]);
    expect(await readStagedBytes("orders")).toBeNull();
  });

  it("reports a contended handle as a locked workspace, not a thrown error", async () => {
    root.lockedError = "NoModificationAllowedError";

    await expect(stageTable(staged("orders"), csv)).resolves.toBe(false);
    expect(usePersistenceStore.getState().status).toBe("locked");
    expect(usePersistenceStore.getState().note).toMatch(
      /Another DataScope tab/,
    );
  });

  it("reports any other staging failure as failed, with the reason", async () => {
    root.lockedError = "QuotaExceededError";

    expect(await stageTable(staged("orders"), csv)).toBe(false);
    expect(usePersistenceStore.getState().status).toBe("failed");
    expect(usePersistenceStore.getState().note).toMatch(
      /Couldn’t store this table on disk/,
    );
  });

  it("a missing table reads back as null rather than an error", async () => {
    expect(await readStagedBytes("never-staged")).toBeNull();
  });

  it("a corrupted manifest degrades to an empty workspace instead of throwing", async () => {
    await stageTable(staged("orders"), csv);
    root.files.set("manifest.json", {
      bytes: new TextEncoder().encode("{not json"),
      open: false,
    });

    await expect(readStagedManifest()).resolves.toEqual([]);
  });

  it("does nothing at all on a browser without worker-side sync access handles", async () => {
    install(new FakeOpfsRoot(), UNSUPPORTED_SCOPE);

    expect(await isStagingSupported()).toBe(false);
    expect(await stageTable(staged("orders"), csv)).toBe(false);
    expect(await readStagedManifest()).toEqual([]);
    expect(await readStagedBytes("orders")).toBeNull();
    expect(usePersistenceStore.getState().status).toBe("unsupported");
  });

  it("clearing empties the staging directory", async () => {
    await stageTable(staged("orders"), csv);
    expect(root.files.size).toBeGreaterThan(0);

    expect(await clearStagingStorage()).toBe(true);
    expect(root.files.size).toBe(0);
    expect(await readStagedManifest()).toEqual([]);
  });
});
