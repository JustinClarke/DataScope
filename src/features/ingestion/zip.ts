// §7.5/D30 ZIP-archive ingestion. `fflate`'s async `unzip` offloads inflate
// work off the main thread where the browser supports it, so a large
// Takeout/Spotify export doesn't freeze the tab while it expands.
import { unzip } from "fflate";

// Filesystem/zip-tool noise that isn't a user file — silently dropped rather
// than counted in the "skipped unsupported" toast, which would otherwise
// misreport every macOS-zipped Takeout export as having skipped files.
function isArchiveNoise(path: string): boolean {
  return (
    path.endsWith("/") ||
    path.startsWith("__MACOSX/") ||
    path.split("/").pop() === ".DS_Store"
  );
}

/** Expands a ZIP File into its contained files, flattened (folder structure inside the archive is discarded — naming/de-dup happens downstream same as any other batch). */
export function expandZipFile(file: File): Promise<File[]> {
  return file.arrayBuffer().then(
    (buffer) =>
      new Promise<File[]>((resolve, reject) => {
        unzip(
          new Uint8Array(buffer),
          { filter: (entry) => !isArchiveNoise(entry.name) },
          (err, entries) => {
            if (err) {
              reject(err);
              return;
            }
            const files = Object.entries(entries).map(([path, bytes]) => {
              const name = path.split("/").pop() ?? path;
              return new File([bytes], name);
            });
            resolve(files);
          },
        );
      }),
  );
}

export function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".zip");
}
