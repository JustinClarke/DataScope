import { describe, expect, it } from "vitest";
import { collectFilesFromDataTransfer } from "./folderTraversal";

// jsdom doesn't implement the File and Directory Entries API
// (`webkitGetAsEntry`), so entries/items are duck-typed plain objects here
// rather than real `DataTransferItem`/`FileSystemEntry` instances — exactly
// the shape the browser API provides, just constructed by hand.
function fileEntry(file: File): FileSystemFileEntry {
  return {
    isDirectory: false,
    isFile: true,
    name: file.name,
    file: (success: (f: File) => void) => success(file),
  } as unknown as FileSystemFileEntry;
}

function directoryEntry(
  name: string,
  children: FileSystemEntry[],
): FileSystemDirectoryEntry {
  let delivered = false;
  return {
    isDirectory: true,
    isFile: false,
    name,
    createReader: () => ({
      readEntries: (success: (entries: FileSystemEntry[]) => void) => {
        // Real readEntries() must be called repeatedly until it yields [] —
        // this fake mirrors that contract instead of returning everything in one call.
        success(delivered ? [] : children);
        delivered = true;
      },
    }),
  } as unknown as FileSystemDirectoryEntry;
}

function dataTransferWithEntries(entries: FileSystemEntry[]): DataTransfer {
  const items = entries.map((entry) => ({ webkitGetAsEntry: () => entry }));
  return { items, files: [] } as unknown as DataTransfer;
}

describe("collectFilesFromDataTransfer", () => {
  it("returns flat files unchanged", async () => {
    const a = new File(["a"], "a.csv");
    const b = new File(["b"], "b.csv");
    const result = await collectFilesFromDataTransfer(
      dataTransferWithEntries([fileEntry(a), fileEntry(b)]),
    );
    expect(result.map((f) => f.name).sort()).toEqual(["a.csv", "b.csv"]);
  });

  it("recurses into a dropped folder", async () => {
    const customers = new File(["c"], "customers.csv");
    const orders = new File(["o"], "orders.csv");
    const folder = directoryEntry("ecommerce", [
      fileEntry(customers),
      fileEntry(orders),
    ]);
    const result = await collectFilesFromDataTransfer(
      dataTransferWithEntries([folder]),
    );
    expect(result.map((f) => f.name).sort()).toEqual([
      "customers.csv",
      "orders.csv",
    ]);
  });

  it("recurses into nested subfolders", async () => {
    const leaf = new File(["x"], "deep.csv");
    const inner = directoryEntry("inner", [fileEntry(leaf)]);
    const outer = directoryEntry("outer", [inner]);
    const result = await collectFilesFromDataTransfer(
      dataTransferWithEntries([outer]),
    );
    expect(result.map((f) => f.name)).toEqual(["deep.csv"]);
  });

  it("falls back to dataTransfer.files when webkitGetAsEntry is unavailable", async () => {
    const a = new File(["a"], "a.csv");
    const dataTransfer = { items: [], files: [a] } as unknown as DataTransfer;
    const result = await collectFilesFromDataTransfer(dataTransfer);
    expect(result).toEqual([a]);
  });
});
