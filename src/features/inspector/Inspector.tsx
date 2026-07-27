// The Workbench's bottom inspector (W7, D71, master §13.3) — "scent, not
// dashboard." Fills from whichever selection kind was most recently made
// (`stores/selection.ts`'s `lastSelectionKind`): a table's name/rows/memory/
// quick stats, a column's classification scent, or a map edge's D24 evidence
// + confidence + override controls. Never a pedagogical surface — the
// EducationalPanel owns that; this only offers a click-through to the full
// tab.
import { useMemo } from 'react';
import { useDatasetsStore } from '../../stores/datasets';
import { useSelectionStore } from '../../stores/selection';
import { useRelationshipsStore } from '../../stores/relationships';
import { useInferredEdgesStore } from '../../stores/inferredEdges';
import { applyOverrides, type RelationshipOverrides } from '../../lib/relationshipInference';
import { formatBytes } from '../../lib/formatBytes';
import { openDestination } from '../../services/navigation';
import { EdgeEvidencePanel, AddRelationshipForm, type ColumnRef } from '../charts/relationships/EdgeEvidencePanel';

function TableScent({ tableId }: { tableId: string }) {
  const table = useDatasetsStore((state) => state.tables.find((t) => t.id === tableId));
  if (!table) return <p className="text-sm text-(--color-fg-muted)">That table is no longer registered.</p>;

  return (
    <div className="flex items-center gap-6 text-sm">
      <span className="font-medium text-(--color-fg)">{table.tableName}</span>
      <span className="font-mono text-(--color-fg-muted)">{table.rowCount.toLocaleString()} rows</span>
      <span className="font-mono text-(--color-fg-muted)">{table.columnCount} cols</span>
      <span className="font-mono text-(--color-fg-muted)">{formatBytes(table.memoryBytes)}</span>
      <button
        type="button"
        className="text-(--color-accent) hover:underline"
        onClick={() => openDestination('profile', tableId)}
      >
        Open profile →
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
    <div className="flex items-center gap-6 text-sm">
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

  const overrides = useMemo<RelationshipOverrides>(() => ({ removed, repointed, added }), [removed, repointed, added]);
  const liveTableNames = useMemo(() => tables.map((t) => t.tableName), [tables]);
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
        <EdgeEvidencePanel
          edge={edge}
          allColumns={allColumns}
          onRemove={(e) => removeEdge(e.childTable, e.childColumn)}
          onRepoint={(e, parent) => repointEdge(e.childTable, e.childColumn, parent.table, parent.column)}
        />
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
    </div>
  );
}

export function Inspector() {
  const lastSelectionKind = useSelectionStore((state) => state.lastSelectionKind);
  const selectedTableId = useSelectionStore((state) => state.selectedTableId);
  const selectedColumn = useSelectionStore((state) => state.selectedColumn);
  const selectedEdgeId = useSelectionStore((state) => state.selectedEdgeId);

  return (
    <div data-testid="inspector" className="flex h-full items-center overflow-x-auto px-4 py-2">
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
