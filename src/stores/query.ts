// Current query + windowed results, history, and chart specs (§21.7 state tree).
// Reducer-only: it holds the state transitions a `runQuery()` implementation
// (services/sql.ts, Phase 4) will drive — it never talks to the worker itself.
import { create } from 'zustand';
import type { ChartSpec, QueryResult } from '../types';

export type QueryStatus = 'idle' | 'running' | 'success' | 'error';

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  executedAt: string;
  result?: QueryResult;
  error?: string;
}

interface QueryState {
  sql: string;
  status: QueryStatus;
  result: QueryResult | null;
  error: string | null;
  history: QueryHistoryEntry[];
  charts: ChartSpec[];

  setSql: (sql: string) => void;
  queryStarted: (sql: string) => void;
  querySucceeded: (result: QueryResult) => void;
  queryFailed: (error: string) => void;
  addChart: (chart: ChartSpec) => void;
  removeChart: (index: number) => void;
  clearResult: () => void;
}

export const useQueryStore = create<QueryState>((set) => ({
  sql: '',
  status: 'idle',
  result: null,
  error: null,
  history: [],
  charts: [],

  setSql: (sql) => set({ sql }),

  queryStarted: (sql) => set({ sql, status: 'running', error: null }),

  querySucceeded: (result) =>
    set((state) => ({
      status: 'success',
      result,
      history: [
        { id: crypto.randomUUID(), sql: state.sql, executedAt: new Date().toISOString(), result },
        ...state.history,
      ],
    })),

  queryFailed: (error) =>
    set((state) => ({
      status: 'error',
      error,
      history: [
        { id: crypto.randomUUID(), sql: state.sql, executedAt: new Date().toISOString(), error },
        ...state.history,
      ],
    })),

  addChart: (chart) => set((state) => ({ charts: [...state.charts, chart] })),

  removeChart: (index) => set((state) => ({ charts: state.charts.filter((_, i) => i !== index) })),

  clearResult: () => set({ result: null, status: 'idle', error: null }),
}));
