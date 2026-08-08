// Workspace-persistence state (S6.9 / 07b). Deliberately a UI state rather than
// a thrown error: a second tab holding the staging file, an evicted OPFS entry
// and a browser without sync access handles are all *outcomes* the app reports,
// never reasons an ingest fails (ADR-011 build rule 5, and rule 4 on
// evictability). Not persisted — it describes this tab's storage right now.
import { create } from "zustand";
import type { RestoreReport } from "../services/workspace";

export type StagingStatus =
  /** Nothing has touched storage yet this session. */
  | "unknown"
  /** Bytes are being staged to OPFS by design and the last attempt worked. */
  | "ready"
  /** No worker-side `createSyncAccessHandle` — this browser cannot stage at all. */
  | "unsupported"
  /** Another tab holds the file. The workspace still works; this drop just isn't durable. */
  | "locked"
  /** Anything else the staging worker reported. */
  | "failed";

interface PersistenceState {
  status: StagingStatus;
  /** The last failure in the user's terms — null whenever `status` is `'ready'`/`'unknown'`. */
  note: string | null;
  /**
   * What the load-time restore actually rebuilt in the engine. Null until the
   * bootstrap has run. 07d reconciles this against the persisted registry;
   * nothing renders it yet, by design (07b is engine-only).
   */
  restore: RestoreReport | null;
  setStatus: (status: StagingStatus, note?: string | null) => void;
  setRestore: (report: RestoreReport) => void;
}

export const usePersistenceStore = create<PersistenceState>((set) => ({
  status: "unknown",
  note: null,
  restore: null,
  setStatus: (status, note = null) => set({ status, note }),
  setRestore: (restore) => set({ restore }),
}));
