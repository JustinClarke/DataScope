// Manual overrides on the inferred join graph (D24 trust rule: override
// everywhere — add, remove, re-point). Session state, not persisted: it keys off
// stable child-side identity so it survives re-profiling (a fresh inference is
// re-merged over it), the same "persist for the session" contract the column
// classifier's own overrides carry. Separate from the datasets store because it
// records the user's assertions, not the engine's catalog.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { RelationshipOverrides } from '../lib/relationshipInference';
import { childKeyOf } from '../lib/relationshipInference';

export const RELATIONSHIPS_STORAGE_KEY = 'datascope-relationships';
const RELATIONSHIPS_PERSIST_VERSION = 1;

interface RelationshipsState extends RelationshipOverrides {
  removeEdge: (childTable: string, childColumn: string) => void;
  restoreEdge: (childTable: string, childColumn: string) => void;
  repointEdge: (childTable: string, childColumn: string, parentTable: string, parentColumn: string) => void;
  addEdge: (childTable: string, childColumn: string, parentTable: string, parentColumn: string) => void;
  removeManualEdge: (childTable: string, childColumn: string, parentTable: string, parentColumn: string) => void;
  clearOverrides: () => void;
}

export const useRelationshipsStore = create<RelationshipsState>()(
  persist(
    (set) => ({
      removed: [],
      repointed: {},
      added: [],

      removeEdge: (childTable, childColumn) =>
        set((state) => {
          const key = childKeyOf({ childTable, childColumn });
          // Removing supersedes a prior re-point on the same child column.
          const repointed = { ...state.repointed };
          delete repointed[key];
          return {
            removed: state.removed.includes(key) ? state.removed : [...state.removed, key],
            repointed,
          };
        }),

      restoreEdge: (childTable, childColumn) =>
        set((state) => {
          const key = childKeyOf({ childTable, childColumn });
          return { removed: state.removed.filter((k) => k !== key) };
        }),

      repointEdge: (childTable, childColumn, parentTable, parentColumn) =>
        set((state) => {
          const key = childKeyOf({ childTable, childColumn });
          return {
            // Re-pointing an edge un-removes it — the user is asserting a target, not hiding it.
            removed: state.removed.filter((k) => k !== key),
            repointed: { ...state.repointed, [key]: { parentTable, parentColumn } },
          };
        }),

      addEdge: (childTable, childColumn, parentTable, parentColumn) =>
        set((state) => {
          const exists = state.added.some(
            (e) =>
              e.childTable === childTable &&
              e.childColumn === childColumn &&
              e.parentTable === parentTable &&
              e.parentColumn === parentColumn,
          );
          if (exists) return state;
          return { added: [...state.added, { childTable, childColumn, parentTable, parentColumn }] };
        }),

      removeManualEdge: (childTable, childColumn, parentTable, parentColumn) =>
        set((state) => ({
          added: state.added.filter(
            (e) =>
              !(
                e.childTable === childTable &&
                e.childColumn === childColumn &&
                e.parentTable === parentTable &&
                e.parentColumn === parentColumn
              ),
          ),
        })),

      clearOverrides: () => set({ removed: [], repointed: {}, added: [] }),
    }),
    {
      name: RELATIONSHIPS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: RELATIONSHIPS_PERSIST_VERSION,
      partialize: (state): RelationshipOverrides => ({
        removed: state.removed,
        repointed: state.repointed,
        added: state.added,
      }),
      migrate: (persisted, version): RelationshipOverrides =>
        version === RELATIONSHIPS_PERSIST_VERSION
          ? (persisted as RelationshipOverrides)
          : { removed: [], repointed: {}, added: [] },
    },
  ),
);
