// §7.5 folder traversal via the legacy File and Directory Entries API
// (`webkitGetAsEntry()`), distinct from the File System Access API's
// `FileSystemDirectoryHandle`/`showDirectoryPicker()` — that API needs a user
// gesture per call and isn't what a plain drag-drop `DataTransfer` exposes.

function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDirectoryBatch(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

// readEntries() is not guaranteed to return the full listing in one call —
// per spec it must be called repeatedly until an empty array comes back.
async function collectFromDirectory(
  entry: FileSystemDirectoryEntry,
): Promise<File[]> {
  const reader = entry.createReader();
  const files: File[] = [];
  let batch = await readDirectoryBatch(reader);
  while (batch.length > 0) {
    for (const child of batch) {
      files.push(...(await collectFromEntry(child)));
    }
    batch = await readDirectoryBatch(reader);
  }
  return files;
}

async function collectFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isDirectory)
    return collectFromDirectory(entry as FileSystemDirectoryEntry);
  return [await readEntryFile(entry as FileSystemFileEntry)];
}

/**
 * Flattens a drag-drop `DataTransfer` into its full file list, recursing into
 * dropped folders. Falls back to `dataTransfer.files` (no recursion) when
 * `webkitGetAsEntry` isn't available — Firefox before 50 and any future
 * engine that drops the API — so drag-drop of individual files still works.
 */
export async function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<File[]> {
  const items = dataTransfer.items;
  const supportsEntries =
    items &&
    items.length > 0 &&
    typeof items[0]?.webkitGetAsEntry === "function";
  if (!supportsEntries) return Array.from(dataTransfer.files);

  const entries = Array.from(items)
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (entries.length === 0) return Array.from(dataTransfer.files);

  const nested = await Promise.all(entries.map(collectFromEntry));
  return nested.flat();
}
