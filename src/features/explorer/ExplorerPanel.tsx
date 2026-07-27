// The left explorer (W2, D71, master §13.3) — `TableList` grown with a
// click-through to each table's Profile tab and shell-wide selection. Add
// data and the share-links list are open scope for a later leaf (see
// build/12-workbench/03-left-explorer.md's scope call) — this phase only
// mounts the table list + its per-table actions.
import { useCallback, useState } from 'react';
import { TableList } from '../ingestion/TableList';
import { removeTable, refreshTableFromSource, IngestionError } from '../../services/ingestion';
import { useSelectionStore } from '../../stores/selection';
import { useDatasetsStore } from '../../stores/datasets';
import { openDestination } from '../../services/navigation';

// The explorer's chrome-level header (V3, `.explorer__head`) — "Explorer" +
// a live table/row count, reusing the same reduction `StatusBar.tsx` already
// computes rather than a new derivation. Kept out of `TableList` itself
// (`hideHeading`), which stays shared with `IngestionPanel`'s own heading.
function ExplorerHeader() {
  const tables = useDatasetsStore((state) => state.tables);
  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);

  return (
    <div className="flex items-center justify-between border-b border-(--color-rule-2) px-4 py-3">
      <span className="micro text-(--color-ink-3)">Explorer</span>
      <span className="font-mono text-[length:var(--text-xs)] text-(--color-ink-3)">
        {tables.length} table{tables.length !== 1 ? 's' : ''} · {totalRows.toLocaleString()} rows
      </span>
    </div>
  );
}

export function ExplorerPanel() {
  const [refreshingTableId, setRefreshingTableId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectTable = useSelectionStore((state) => state.selectTable);

  const handleSelectTable = useCallback(
    (tableId: string) => {
      selectTable(tableId);
      openDestination('profile', tableId);
    },
    [selectTable],
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
    <div data-testid="explorer-panel">
      <ExplorerHeader />
      {error && <p role="alert">{error}</p>}
      <TableList
        onRemove={handleRemove}
        onRefresh={handleRefresh}
        refreshingTableId={refreshingTableId}
        refreshDisabled={refreshingTableId !== null}
        onSelectTable={handleSelectTable}
        hideHeading
      />
    </div>
  );
}
