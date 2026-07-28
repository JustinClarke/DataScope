// The left explorer (W2, D71, master §13.3) — `TableList` grown with a
// click-through to each table's Profile tab and shell-wide selection. The
// share-links list is still open scope for a later leaf (see
// build/12-workbench/03-left-explorer.md's scope call) — Add-data closed at
// S1 (`14-workspace-streamline/01-explorer-rail-reflow.md`).
import { useCallback, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { TableList } from '../ingestion/TableList';
import { DataQualityPanel } from './DataQualityPanel';
import { removeTable, refreshTableFromSource, IngestionError } from '../../services/ingestion';
import { useSelectionStore } from '../../stores/selection';
import { useDatasetsStore } from '../../stores/datasets';
import { useRelationshipsStore } from '../../stores/relationships';
import { useInferredEdgesStore } from '../../stores/inferredEdges';
import { applyOverrides, type RelationshipOverrides } from '../../lib/relationshipInference';
import { openDestination } from '../../services/navigation';
import type { TableRegistryEntry } from '../../types';

// The explorer's chrome-level header (V3, `.explorer__head`) — "Explorer" +
// a live table/row count, reusing the same reduction `StatusBar.tsx` already
// computes rather than a new derivation. Kept out of `TableList` itself
// (`hideHeading`), which stays shared with `IngestionPanel`'s own heading.
// The `+` (S1) opens a real `ingestion` tab — the same component Act 0/1
// already mounts, now reachable without leaving a loaded workspace.
function ExplorerHeader() {
  const tables = useDatasetsStore((state) => state.tables);
  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-(--color-rule-2) bg-(--color-panel) px-4 py-3">
      <span className="micro text-(--color-ink-3)">Explorer</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[length:var(--text-xs)] text-(--color-ink-3)">
          {tables.length} table{tables.length !== 1 ? 's' : ''} · {totalRows.toLocaleString()} rows
        </span>
        <button
          type="button"
          aria-label="Add data"
          data-testid="explorer-add-data"
          onClick={() => openDestination('ingestion')}
          className="rounded p-1 text-(--color-ink-3) hover:bg-(--color-elev) hover:text-(--color-ink-2)"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * Dataset-wide FK edges, override-applied (S1) — the identical pattern
 * `Inspector.tsx`'s `EdgeScent` already uses: read the raw inferred result
 * `useDatasetBaseline` (the map tab) mirrors into `useInferredEdgesStore`
 * rather than re-running `loadRelationships`, and apply the user's own
 * add/remove/repoint overrides locally so the rail's PK/FK markers agree
 * with what the ERD and inspector already show.
 */
function useExplorerEdges(tables: TableRegistryEntry[]) {
  const inferredEdges = useInferredEdgesStore((state) => state.edges);
  const removed = useRelationshipsStore((state) => state.removed);
  const repointed = useRelationshipsStore((state) => state.repointed);
  const added = useRelationshipsStore((state) => state.added);

  const overrides = useMemo<RelationshipOverrides>(() => ({ removed, repointed, added }), [removed, repointed, added]);
  const liveTableNames = useMemo(() => tables.map((t) => t.tableName), [tables]);
  return useMemo(() => applyOverrides(inferredEdges, overrides, liveTableNames), [inferredEdges, overrides, liveTableNames]);
}

export function ExplorerPanel() {
  const [refreshingTableId, setRefreshingTableId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tables = useDatasetsStore((state) => state.tables);
  const selectTable = useSelectionStore((state) => state.selectTable);
  const selectColumn = useSelectionStore((state) => state.selectColumn);
  const edges = useExplorerEdges(tables);

  const handleSelectTable = useCallback(
    (tableId: string) => {
      selectTable(tableId);
      openDestination('profile', tableId);
    },
    [selectTable],
  );

  const handleSelectColumn = useCallback(
    (tableId: string, column: string) => {
      selectColumn(tableId, column);
      openDestination('profile', tableId);
    },
    [selectColumn],
  );

  const handleRemove = useCallback((tableId: string) => {
    void removeTable(tableId);
  }, []);

  const handleRefresh = useCallback(async (tableId: string) => {
    setError(null);
    setRefreshingTableId(tableId);
    try {
      await refreshTableFromSource(tableId);
    } catch (err) {
      setError(err instanceof IngestionError ? err.message : "Couldn't refresh — the previous data is unchanged.");
    } finally {
      setRefreshingTableId(null);
    }
  }, []);

  return (
    <div data-testid="explorer-panel" className="flex h-full min-h-0 flex-col overflow-hidden">
      <ExplorerHeader />
      {error && <p role="alert">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TableList
          onRemove={handleRemove}
          onRefresh={handleRefresh}
          refreshingTableId={refreshingTableId}
          refreshDisabled={refreshingTableId !== null}
          onSelectTable={handleSelectTable}
          onSelectColumn={handleSelectColumn}
          hideHeading
          reflow
          edges={edges}
        />
      </div>
      <DataQualityPanel tables={tables} />
    </div>
  );
}
