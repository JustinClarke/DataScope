// The OPFS staging worker (S6.9 / 07b). Exists for one reason: OPFS sync
// access handles — the only write path Safari 18.6 exposes — are worker-only
// (ADR-011). All the logic is in `opfsStaging.protocol.ts`; this is the adapter.
import {
  handleStagingRequest,
  type StagingRequest,
} from "./opfsStaging.protocol";

// A DataScope subdirectory, not the OPFS root itself: "Clear workspace data"
// empties it wholesale, and it must not take anything another part of the
// origin stored (e.g. a future cache) with it.
const STAGING_DIR = "datascope-workspace";

let rootPromise: Promise<FileSystemDirectoryHandle> | null = null;
function getRoot(): Promise<FileSystemDirectoryHandle> {
  if (!rootPromise) {
    rootPromise = navigator.storage
      .getDirectory()
      .then((root) => root.getDirectoryHandle(STAGING_DIR, { create: true }));
  }
  return rootPromise;
}

self.addEventListener("message", (event: MessageEvent<StagingRequest>) => {
  void handleStagingRequest(event.data, getRoot, self).then(
    ({ response, transfer }) => {
      self.postMessage(response, { transfer });
    },
  );
});
