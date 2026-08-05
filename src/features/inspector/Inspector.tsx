// The Workbench's bottom inspector (W7, D71, master §13.3) — "scent, not
// dashboard." Fills from whichever selection kind was most recently made
// (`stores/selection.ts`'s `lastSelectionKind`): a table's name/rows/memory/
// quick stats, a column's classification scent, or a map edge's D24 evidence
// + confidence + override controls. Never a pedagogical surface — the
// EducationalPanel owns that; this only offers a click-through to the full
// tab.
//
// S3 (D73) re-homes this as the drawer's **Info** view — rung 2 of the detail
// ladder — and the charter above now scopes to this view rather than to the
// whole bottom region. What changes here is that every selection kind links
// onward, so rung 2 is never a dead end.
import { useMemo } from 'react';
import { useDatasetsStore } from '../../stores/datasets';
import { useSelectionStore } from '../../stores/selection';
import { useRelationshipsStore } from '../../stores/relationships';
import { useInferredEdgesStore } from '../../stores/inferredEdges';
import { useRehydrationStore, usableTableNames } from '../../stores/rehydration';
import { useDrawerStore } from '../../stores/drawer';
import { useQueryStore, getSession, CONSOLE_SESSION } from '../../stores/query';
import { applyOverrides, type RelationshipOverrides } from '../../lib/relationshipInference';
import { formatBytes } from '../../lib/formatBytes';
import { openDestination } from '../../services/navigation';
import { useTabsStore } from '../../stores/tabs';
import { MAP_TAB_SUBJECT } from '../../app/WorkbenchShell';
import { EdgeEvidencePanel, AddRelationshipForm, type ColumnRef } from '../charts/relationships/EdgeEvidencePanel';
import { DistinctValuesPanel, TextFrequencyPanel, JoinCoveragePanel } from './ColumnInfoPanels';

/**
 * §13.3's decided hand-off: Open table opens the table's tab *and* switches
 * the drawer to the console, "on the assumption the next move is to query what
 * was just opened."
 *
 * The seed (S3 scope call 10, closing the folder's open question 5) only ever
 * lands in an empty buffer. The console is a single shared scratchpad holding
 * user-typed text; replacing that text on what is a navigation click is the one
 * behaviour that would make it untrustworthy. Where there is nothing typed
 * there is nothing to lose. It is never run — running is S4's
 * run-from-anywhere, which is a different gesture.
 *
 * S6.5 retires `consoleActivated`, which used to be half of this condition. An
 * empty buffer was always the part that mattered: "never opened" only ever
 * implied it.
 */
function openTableFromInfo(tableId: string, tableName: string): void {
  openDestination('profile', tableId);
  if (getSession(CONSOLE_SESSION).sql.trim() === '') {
    useQueryStore.getState().setSql(CONSOLE_SESSION, `SELECT * FROM "${tableName}" LIMIT 100`);
  }
  useDrawerStore.getState().activateConsole();
}

function TableScent({ tableId }: { tableId: string }) {
  const table = useDatasetsStore((state) => state.tables.find((t) => t.id === tableId));
  if (!table) return <p className="text-sm text-(--color-fg-muted)">That table is no longer registered.</p>;

  // Wraps rather than clamping: since S6.5 this renders in a ~256px sidebar,
  // not across the drawer's full width. Same answer S1 gave the rail's rows.
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="font-medium text-(--color-fg)">{table.tableName}</span>
      <span className="font-mono text-(--color-fg-muted)">{table.rowCount.toLocaleString()} rows</span>
      <span className="font-mono text-(--color-fg-muted)">{table.columnCount} cols</span>
      <span className="font-mono text-(--color-fg-muted)">{formatBytes(table.memoryBytes)}</span>
      <button
        type="button"
        className="text-(--color-accent) hover:underline"
        onClick={() => openTableFromInfo(tableId, table.tableName)}
      >
        Open table →
      </button>
    </div>
  );
}

function ColumnScent({ tableId, column }: { tableId: string; column: string }) {
  const table = useDatasetsStore((state) => state.tables.find((t) => t.id === tableId));
  const classified = table?.columns?.find((c) => c.name === column);
  if (!table || !classified) {
    return <p className="text-sm text-(--color-fg-muted)">That column is no longer available.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-(--color-fg)">
          {table.tableName}.{classified.name}
        </span>
        <span className="text-(--color-fg-muted)">{classified.semanticType}</span>
        <span className="font-mono text-(--color-fg-muted)">{classified.physicalType}</span>
        <button
          type="button"
          className="text-(--color-accent) hover:underline"
          onClick={() => openDestination('profile', tableId)}
        >
          Open profile →
        </button>
      </div>
      <DistinctValuesPanel table={table.tableName} column={classified.name} />
      {classified.semanticType === 'Textual' && <TextFrequencyPanel table={table.tableName} column={classified.name} />}
    </div>
  );
}

function EdgeScent({ edgeId }: { edgeId: string }) {
  const tables = useDatasetsStore((state) => state.tables);
  const inferredEdges = useInferredEdgesStore((state) => state.edges);
  const removed = useRelationshipsStore((state) => state.removed);
  const repointed = useRelationshipsStore((state) => state.repointed);
  const added = useRelationshipsStore((state) => state.added);
  const removeEdge = useRelationshipsStore((state) => state.removeEdge);
  const repointEdge = useRelationshipsStore((state) => state.repointEdge);
  const outcomes = useRehydrationStore((state) => state.outcomes);

  const overrides = useMemo<RelationshipOverrides>(() => ({ removed, repointed, added }), [removed, repointed, added]);
  // Same 07d reading of "live" as the rail's `useExplorerEdges` — a reconciled
  // registry means registered no longer implies queryable.
  const liveTableNames = useMemo(() => usableTableNames(outcomes, tables), [outcomes, tables]);
  const edges = useMemo(
    () => applyOverrides(inferredEdges, overrides, liveTableNames),
    [inferredEdges, overrides, liveTableNames],
  );
  const allColumns: ColumnRef[] = useMemo(
    () => tables.flatMap((t) => (t.columns ?? []).map((c) => ({ table: t.tableName, column: c.name }))),
    [tables],
  );

  const edge = edges.find((e) => e.id === edgeId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {edge ? (
        <>
          <EdgeEvidencePanel
            edge={edge}
            allColumns={allColumns}
            onRemove={(e) => removeEdge(e.childTable, e.childColumn)}
            onRepoint={(e, parent) => repointEdge(e.childTable, e.childColumn, parent.table, parent.column)}
          />
          <JoinCoveragePanel edge={edge} />
        </>
      ) : (
        <p className="text-sm text-(--color-fg-muted)">
          That relationship changed or was removed — select another edge on the map.
        </p>
      )}
      <AddRelationshipForm
        allColumns={allColumns}
        onAdd={(child, parent) =>
          useRelationshipsStore.getState().addEdge(child.table, child.column, parent.table, parent.column)
        }
      />
      {/* Rung 2 never dead-ends (§13.3): an edge's full depth is the map. */}
      <button
        type="button"
        className="self-start text-sm text-(--color-accent) hover:underline"
        onClick={() => useTabsStore.getState().openTab('map', MAP_TAB_SUBJECT)}
      >
        Open map →
      </button>
    </div>
  );
}

export function Inspector() {
  const lastSelectionKind = useSelectionStore((state) => state.lastSelectionKind);
  const selectedTableId = useSelectionStore((state) => state.selectedTableId);
  const selectedColumn = useSelectionStore((state) => state.selectedColumn);
  const selectedEdgeId = useSelectionStore((state) => state.selectedEdgeId);

  return (
    <div data-testid="inspector" className="flex flex-col gap-2 px-4 py-3">
      {lastSelectionKind === 'table' && selectedTableId && <TableScent tableId={selectedTableId} />}
      {lastSelectionKind === 'column' && selectedColumn && (
        <ColumnScent tableId={selectedColumn.tableId} column={selectedColumn.column} />
      )}
      {lastSelectionKind === 'edge' && selectedEdgeId && <EdgeScent edgeId={selectedEdgeId} />}
      {lastSelectionKind === null && (
        <p className="text-sm text-(--color-fg-muted)">Select a table, column, or relationship to inspect it.</p>
      )}
    </div>
  );
}
