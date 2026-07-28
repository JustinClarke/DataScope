// Current query + windowed results, history, and chart specs (§21.7 state tree).
// Reducer-only: it holds the state transitions a `runQuery()` implementation
// (services/sql.ts, Phase 4) will drive — it never talks to the worker itself.
//
// S5 (D73, §13.3) keys it by **session**. A query tab is "independent,
// editable, re-runnable, per-instance": one `sql`/`status`/`result` for the
// whole app cannot express that. The console, Pivot and every query tab each
// own a session (a query tab's session id *is* its tab id), while `runQuery`
// stays the one execution path writing into whichever session it was asked for
// — D49 is one path, not one destination.
import { create } from 'zustand';
import type { ChartSpec, QueryResult } from '../types';

export type QueryStatus = 'idle' | 'running' | 'success' | 'error';

/** The console's session — the app's only free-typing surface, and every default. */
export const CONSOLE_SESSION = 'console';
/** Pivot's own results home (S5): its runs no longer land in the console's. */
export const PIVOT_SESSION = 'pivot';

export type QuerySessionId = string;

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  executedAt: string;
  result?: QueryResult;
  error?: string;
}

export interface QuerySession {
  sql: string;
  /**
   * The statement that produced `result`, which is not the same as `sql` the
   * moment the user edits the buffer after a run. The Parquet/auto-chart
   * decisions below it are about what ran, never about what is typed.
   */
  lastRunSql: string;
  status: QueryStatus;
  result: QueryResult | null;
  error: string | null;
  charts: ChartSpec[];
}

/** Stable identity, so a selector for an unknown session never loops a re-render. */
export const EMPTY_SESSION: QuerySession = {
  sql: '',
  lastRunSql: '',
  status: 'idle',
  result: null,
  error: null,
  charts: [],
};

interface QueryState {
  sessions: Record<QuerySessionId, QuerySession>;
  /**
   * Session-wide, not per-session: one log of what ran this session. The
   * console renders it because the console is the scratchpad; a query tab is
   * one query and its result, and N per-tab histories would be a second answer
   * to a question the console already answers.
   */
  history: QueryHistoryEntry[];
  /** The session that most recently started a run — what the status bar reports. */
  lastRunSession: QuerySessionId;

  setSql: (id: QuerySessionId, sql: string) => void;
  queryStarted: (id: QuerySessionId, sql: string) => void;
  querySucceeded: (id: QuerySessionId, result: QueryResult) => void;
  queryFailed: (id: QuerySessionId, error: string) => void;
  /**
   * Hands a result already in hand to another session, with no history entry:
   * Pin promotes what the console just ran, and that run is already logged.
   * Results are treated as immutable everywhere, so this shares the reference
   * rather than re-running or copying.
   */
  adoptResult: (id: QuerySessionId, result: QueryResult, lastRunSql: string) => void;
  addChart: (id: QuerySessionId, chart: ChartSpec) => void;
  removeChart: (id: QuerySessionId, index: number) => void;
  clearResult: (id: QuerySessionId) => void;
  /** Drops a closed query tab's state — otherwise the store keeps a result per closed tab. */
  dropSession: (id: QuerySessionId) => void;
}

function patch(
  state: QueryState,
  id: QuerySessionId,
  changes: Partial<QuerySession>,
): Record<QuerySessionId, QuerySession> {
  return { ...state.sessions, [id]: { ...(state.sessions[id] ?? EMPTY_SESSION), ...changes } };
}

export const useQueryStore = create<QueryState>((set) => ({
  sessions: {},
  history: [],
  lastRunSession: CONSOLE_SESSION,

  setSql: (id, sql) => set((state) => ({ sessions: patch(state, id, { sql }) })),

  queryStarted: (id, sql) =>
    set((state) => ({
      sessions: patch(state, id, { sql, lastRunSql: sql, status: 'running', error: null }),
      lastRunSession: id,
    })),

  querySucceeded: (id, result) =>
    set((state) => ({
      sessions: patch(state, id, { status: 'success', result }),
      history: [
        {
          id: crypto.randomUUID(),
          sql: state.sessions[id]?.sql ?? '',
          executedAt: new Date().toISOString(),
          result,
        },
        ...state.history,
      ],
    })),

  queryFailed: (id, error) =>
    set((state) => ({
      sessions: patch(state, id, { status: 'error', error }),
      history: [
        {
          id: crypto.randomUUID(),
          sql: state.sessions[id]?.sql ?? '',
          executedAt: new Date().toISOString(),
          error,
        },
        ...state.history,
      ],
    })),

  adoptResult: (id, result, lastRunSql) =>
    set((state) => ({ sessions: patch(state, id, { status: 'success', result, error: null, lastRunSql }) })),

  addChart: (id, chart) =>
    set((state) => ({
      sessions: patch(state, id, {
        charts: [...(state.sessions[id]?.charts ?? []), chart],
      }),
    })),

  removeChart: (id, index) =>
    set((state) => ({
      sessions: patch(state, id, {
        charts: (state.sessions[id]?.charts ?? []).filter((_, i) => i !== index),
      }),
    })),

  clearResult: (id) => set((state) => ({ sessions: patch(state, id, { result: null, status: 'idle', error: null }) })),

  dropSession: (id) =>
    set((state) => {
      if (!(id in state.sessions)) return state;
      const sessions = { ...state.sessions };
      delete sessions[id];
      return { sessions };
    }),
}));

/** Reads one session's state, falling back to the shared empty one. */
export function useQuerySession(id: QuerySessionId): QuerySession {
  return useQueryStore((state) => state.sessions[id] ?? EMPTY_SESSION);
}

/** Non-reactive read, for the service layer. */
export function getSession(id: QuerySessionId): QuerySession {
  return useQueryStore.getState().sessions[id] ?? EMPTY_SESSION;
}
