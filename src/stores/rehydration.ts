// Rehydration outcomes (S6.9 / 07d) — what the load-time reconciliation
// concluded about each persisted registry entry.
//
// Deliberately its own store rather than a field on `TableRegistryEntry`: the
// registry is the *claim* and this is the engine's *answer*, so it must never
// be persisted. A restored `'restored'` read back from localStorage next load
// would be exactly the dangling-entry lie 07d exists to make impossible.
import { create } from 'zustand';
import type { TableRegistryEntry } from '../types';

export type RehydrationStatus =
  /** The table is present in the engine and its identity checks out. Normal, queryable, silent. */
  | 'restored'
  /** The entry survived, the table didn't, and something can rebuild it — never automatically. */
  | 'recoverable'
  /** Nothing can rebuild it. Shown as needing a re-drop, with the reason; never a normal row. */
  | 'lost';

export interface TableOutcome {
  tableId: string;
  tableName: string;
  status: RehydrationStatus;
  /** Why it isn't restored, in the user's terms. Null when it is. */
  reason: string | null;
  /** The action that recovers it — only ever set when `status` is `'recoverable'`. */
  recovery?: 'refetch' | 'replay';
}

interface RehydrationState {
  /** Keyed by table id. Empty until the bootstrap runs, and on a cold workspace. */
  outcomes: Record<string, TableOutcome>;
  setOutcomes: (outcomes: TableOutcome[]) => void;
  /** A recovery that worked — the entry becomes an ordinary row again. */
  markRestored: (tableId: string) => void;
  clearOutcome: (tableId: string) => void;
}

export const useRehydrationStore = create<RehydrationState>((set) => ({
  outcomes: {},
  setOutcomes: (outcomes) =>
    set({ outcomes: Object.fromEntries(outcomes.map((outcome) => [outcome.tableId, outcome])) }),
  markRestored: (tableId) =>
    set((state) => {
      const outcome = state.outcomes[tableId];
      if (!outcome) return state;
      return { outcomes: { ...state.outcomes, [tableId]: { ...outcome, status: 'restored', reason: null, recovery: undefined } } };
    }),
  clearOutcome: (tableId) =>
    set((state) => {
      if (!(tableId in state.outcomes)) return state;
      const { [tableId]: _dropped, ...rest } = state.outcomes;
      return { outcomes: rest };
    }),
}));

/**
 * True for a table nothing has said anything bad about — i.e. everything in an
 * ordinary session (no outcome recorded at all) plus what reconciliation
 * actually restored. Every consumer that treats a registry entry as queryable
 * goes through this, so "usable" has one definition rather than each caller
 * re-deriving it from `outcomes`.
 */
export function isTableUsable(outcomes: Record<string, TableOutcome>, tableId: string): boolean {
  const outcome = outcomes[tableId];
  return outcome === undefined || outcome.status === 'restored';
}

/** The table *names* the relationship layer may still reason about — a lost table's edges go inert, not deleted. */
export function usableTableNames(
  outcomes: Record<string, TableOutcome>,
  tables: TableRegistryEntry[],
): string[] {
  return tables.filter((t) => isTableUsable(outcomes, t.id)).map((t) => t.tableName);
}
