// Workbench act assembly (W1, D71, master §13.3 "state model" paragraph) — the
// deterministic shell *skeleton* is a pure function of session state. Act 2 (AI
// defaults) gets no branch of its own: §13.3 is explicit it's "no forced gate,"
// and the fold record superseded the old blocking Act-2 gate in favor of mode
// switches living inside the assembled shell (W7). Viewer mode is W8 scope, not
// scaffold scope.
import type { WorkerStatus } from '../stores/datasets';

export type WorkbenchAct = 'act0' | 'act1' | 'shell';

export interface WorkbenchSession {
  hasDatasets: boolean;
  workerStatus: WorkerStatus;
}

const INGEST_IN_PROGRESS: ReadonlySet<WorkerStatus> = new Set(['loading', 'compiling']);

export function selectWorkbenchAct(session: WorkbenchSession): WorkbenchAct {
  if (session.hasDatasets) return 'shell';
  return INGEST_IN_PROGRESS.has(session.workerStatus) ? 'act1' : 'act0';
}
