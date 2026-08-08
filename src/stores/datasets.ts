// Dataset registry + per-table schema (§21.7 state tree, D58 table registry).
// Owns everything the D58 registry contract implies (`loadDataset`/`removeDataset`/
// `profileDataset` in services/ingestion.ts write here) — actual row data never
// enters this store, only the catalog: names, shape, memory, and classified columns.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  ClassifiedColumn,
  ColumnProfile,
  Dataset,
  SemanticType,
  TableRegistryEntry,
} from "../types";
import { manualOverrideReason } from "../lib/classifier";

export type WorkerStatus = "idle" | "loading" | "compiling" | "ready" | "error";

export const DATASETS_STORAGE_KEY = "datascope-datasets";

/** The 07c whitelist: catalog metadata only, never `workerStatus`/`workerError` (a worker that doesn't exist yet at rehydration time). */
interface PersistedDatasetsState {
  datasets: Dataset[];
  tables: TableRegistryEntry[];
}
const DATASETS_PERSIST_VERSION = 1;

interface DatasetsState {
  datasets: Dataset[];
  tables: TableRegistryEntry[];
  workerStatus: WorkerStatus;
  workerError: string | null;

  registerDataset: (dataset: Dataset, tables: TableRegistryEntry[]) => void;
  removeDataset: (datasetId: string) => void;
  removeTable: (tableId: string) => void;
  setTableColumns: (tableId: string, columns: ClassifiedColumn[]) => void;
  reclassifyColumn: (
    tableId: string,
    columnName: string,
    semanticType: SemanticType,
  ) => void;
  setTableProfile: (tableId: string, profile: ColumnProfile[]) => void;
  setTableStats: (
    tableId: string,
    stats: { rowCount: number; columnCount: number; memoryBytes: number },
  ) => void;
  setTableRefreshMeta: (
    tableId: string,
    meta: { sampled: boolean; sampleRowLimit?: number; lastFetchedAt: string },
  ) => void;
  markTablesStale: (tableIds: string[]) => void;
  setWorkerStatus: (status: WorkerStatus, error?: string | null) => void;
}

export const useDatasetsStore = create<DatasetsState>()(
  persist(
    (set) => ({
      datasets: [],
      tables: [],
      workerStatus: "idle",
      workerError: null,

      registerDataset: (dataset, tables) =>
        set((state) => ({
          datasets: [...state.datasets, dataset],
          tables: [...state.tables, ...tables],
        })),

      removeDataset: (datasetId) =>
        set((state) => ({
          datasets: state.datasets.filter((d) => d.id !== datasetId),
          tables: state.tables.filter((t) => t.datasetId !== datasetId),
        })),

      // Table-level removal (§7.5 "dropping a table"), distinct from removeDataset:
      // a single ingestion event (folder/sample) can register several tables, so
      // dropping one must not touch its siblings. Removing a dataset's last table
      // also removes the now-empty dataset rather than leaving an orphan entry.
      removeTable: (tableId) =>
        set((state) => {
          const table = state.tables.find((t) => t.id === tableId);
          if (!table) return state;

          const tables = state.tables.filter((t) => t.id !== tableId);
          const hasSiblings = tables.some(
            (t) => t.datasetId === table.datasetId,
          );

          return {
            tables,
            datasets: hasSiblings
              ? state.datasets.map((d) =>
                  d.id === table.datasetId
                    ? {
                        ...d,
                        tableNames: d.tableNames.filter(
                          (name) => name !== table.tableName,
                        ),
                      }
                    : d,
                )
              : state.datasets.filter((d) => d.id !== table.datasetId),
          };
        }),

      setTableColumns: (tableId, columns) =>
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId ? { ...t, columns } : t,
          ),
        })),

      // Manual override (§17 misclassification mitigation): re-classify a single
      // column, keeping every other classified column untouched. Records a "Set
      // manually" reason so the reasoning tooltip stops showing the heuristic
      // rationale that no longer applies. A no-op if the table has no classified
      // columns yet or the name doesn't match — never fabricates a column entry.
      // Consumers (the capabilities broker, once built) re-read `columns` from the
      // store after this fires; overrides persist for the session.
      reclassifyColumn: (tableId, columnName, semanticType) =>
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId && t.columns
              ? {
                  ...t,
                  columns: t.columns.map((c) =>
                    c.name === columnName
                      ? {
                          ...c,
                          semanticType,
                          classificationReason:
                            manualOverrideReason(semanticType),
                        }
                      : c,
                  ),
                }
              : t,
          ),
        })),

      setTableProfile: (tableId, profile) =>
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId ? { ...t, profile } : t,
          ),
        })),

      // A mutation the transformation layer runs directly against a table
      // (a source's UPDATE/DELETE/ALTER once the user opts out of the guard, or
      // any transform target in general) can change row count, column count, or
      // memory footprint — this is the one action that refreshes those three
      // alongside the profile/classification setters above, which never touch
      // them.
      setTableStats: (tableId, stats) =>
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId ? { ...t, ...stats } : t,
          ),
        })),

      // §7.4 "Refresh from source": the sampled/sampleRowLimit/lastFetchedAt trio
      // a refresh can change, kept as its own setter since setTableStats already
      // owns row/column/memory and setTableProfile/setTableColumns own the
      // classified shape — this only ever touches the three refresh-specific
      // fields those don't.
      setTableRefreshMeta: (tableId, meta) =>
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId ? { ...t, ...meta } : t,
          ),
        })),

      // Flags every derived table built on a just-refreshed source as possibly
      // stale (§7.4/§12.1) — never auto-rebuilt, since the point is that a
      // derived table's recorded SQL already makes a manual re-run cheap.
      markTablesStale: (tableIds) =>
        set((state) => {
          const ids = new Set(tableIds);
          return {
            tables: state.tables.map((t) =>
              ids.has(t.id) ? { ...t, stale: true } : t,
            ),
          };
        }),

      setWorkerStatus: (status, error = null) =>
        set({ workerStatus: status, workerError: error }),
    }),
    {
      name: DATASETS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: DATASETS_PERSIST_VERSION,
      partialize: (state): PersistedDatasetsState => ({
        datasets: state.datasets,
        tables: state.tables,
      }),
      migrate: (persisted, version): PersistedDatasetsState =>
        version === DATASETS_PERSIST_VERSION
          ? (persisted as PersistedDatasetsState)
          : { datasets: [], tables: [] },
    },
  ),
);

// Sidebar table list + SQL autocomplete both scope to one dataset's tables.
export const useTablesForDataset = (datasetId: string): TableRegistryEntry[] =>
  useDatasetsStore((state) =>
    state.tables.filter((t) => t.datasetId === datasetId),
  );
