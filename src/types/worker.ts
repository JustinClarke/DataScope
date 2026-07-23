// Generic typed message envelope for app-owned workers (duckdb.worker.ts,
// ml.worker.ts). Worker termination/restart is first-class control flow, not
// an error (D58, §21.6) — WorkerResponse separates that from a thrown error.

export interface WorkerMessage<TPayload = unknown> {
  id: string;
  type: string;
  payload: TPayload;
}

export interface WorkerResponse<TResult = unknown> {
  id: string;
  ok: boolean;
  result?: TResult;
  error?: { message: string };
}
