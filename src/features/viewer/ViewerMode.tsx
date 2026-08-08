// The Workbench's viewer mode (W8, D62 Workbench amendment) — the read-only
// render of a dropped `.dsps` file (`useDspsReceiverStore`). Structure-forward
// by scope call (see `_implementation/build/12-workbench/10-viewer-cutover.md`):
// presents the StructureReport's existing shape (tables/columns/insights/
// relationships) rather than threading static data through the live
// DatasetMap/Erd, which assume a DuckDB-backed `useDatasetBaseline`. Mounted
// at `WorkbenchShell()`'s top level, ahead of act selection, so a dropped
// `.dsps` presents regardless of dataset state.
import { X } from "lucide-react";
import { useDspsReceiverStore } from "../../stores/dspsReceiver";
import {
  downloadStructureReport,
  type StructureReport,
  type StructureReportTable,
} from "../../lib/structureReport";
import { formatSnapshotLabel } from "../../lib/dsps";
import { TrustChromeBand } from "./TrustChromeBand";

function TableCard({
  table,
  insights,
}: {
  table: StructureReportTable;
  insights: StructureReport["insights"];
}) {
  const tableInsights = insights.filter(
    (insight) => insight.tableName === table.tableName,
  );

  return (
    <div className="rounded-lg border border-(--color-border) p-4">
      <h3 className="font-medium text-(--color-fg)">{table.tableName}</h3>
      <p className="mb-2 text-sm text-(--color-fg-muted)">
        {table.rowCount.toLocaleString()} rows × {table.columnCount} cols
      </p>
      <ul className="mb-3 flex flex-col gap-1">
        {table.columns.map((column) => (
          <li
            key={column.name}
            className="flex justify-between gap-2 font-mono text-xs text-(--color-fg-muted)"
          >
            <span>{column.name}</span>
            <span>
              {column.semanticType} · {column.physicalType}
              {column.nullPercentage != null
                ? ` · ${column.nullPercentage.toFixed(1)}% null`
                : ""}
            </span>
          </li>
        ))}
      </ul>
      {tableInsights.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-(--color-border) pt-2">
          {tableInsights.map((insight, index) => (
            <li key={index} className="text-xs text-(--color-fg-muted)">
              {insight.description}{" "}
              <span className="italic">
                — {insight.provenance}, {formatSnapshotLabel(insight.snapshot)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RelationshipsList({
  relationships,
}: {
  relationships: StructureReport["relationships"];
}) {
  if (!relationships || relationships.length === 0) {
    return (
      <p className="text-xs text-(--color-fg-muted)">
        No relationships in this report.
      </p>
    );
  }

  return (
    <div data-testid="viewer-relationships" className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {relationships.map((edge, index) => (
          <li
            key={index}
            className="rounded border border-(--color-border) p-2 text-xs text-(--color-fg-muted)"
          >
            <div className="font-mono">
              {edge.childTable}.{edge.childColumn} → {edge.parentTable}.
              {edge.parentColumn}
            </div>
            <div>
              {edge.confidence} · {edge.evidence}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ViewerModeProps {
  document: StructureReport | null;
  error: string | null;
}

export function ViewerMode({ document, error }: ViewerModeProps) {
  const close = () => useDspsReceiverStore.getState().close();

  return (
    <div data-act="viewer" className="flex h-svh flex-col">
      {error && (
        <div className="fixed inset-x-0 top-4 z-50 mx-auto w-fit max-w-lg rounded-lg border border-(--color-error)/40 bg-(--color-error)/5 px-4 py-2 text-sm text-(--color-error)">
          {error}{" "}
          <button type="button" onClick={close} className="underline">
            Dismiss
          </button>
        </div>
      )}
      {document && (
        <>
          <TrustChromeBand report={document} />
          <div className="flex flex-1 overflow-hidden">
            <div
              data-region="explorer"
              className="w-64 overflow-auto border-r border-(--color-border) p-2"
            >
              <ul className="flex flex-col gap-1 text-sm">
                {document.tables.map((table) => (
                  <li key={table.tableName} className="text-(--color-fg-muted)">
                    {table.tableName}{" "}
                    <span className="font-mono text-xs">
                      ({table.rowCount.toLocaleString()} × {table.columnCount})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div data-region="canvas" className="flex-1 overflow-auto p-4">
              <div className="flex flex-col gap-4">
                {document.tables.map((table) => (
                  <TableCard
                    key={table.tableName}
                    table={table}
                    insights={document.insights}
                  />
                ))}
              </div>
            </div>
          </div>
          <div
            data-region="inspector"
            className="border-t border-(--color-border) overflow-auto p-3"
          >
            <RelationshipsList relationships={document.relationships} />
          </div>
          <div
            data-region="status-bar"
            className="flex items-center gap-4 border-t border-(--color-border) px-4 py-1.5 text-xs text-(--color-fg-muted) font-mono"
          >
            <span>
              {document.tables.length} table
              {document.tables.length !== 1 ? "s" : ""}
            </span>
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() => downloadStructureReport(document)}
                className="text-(--color-accent) hover:underline"
              >
                Export report
              </button>
              <button
                type="button"
                onClick={close}
                className="flex items-center gap-1 text-(--color-accent) hover:underline"
              >
                <X size={12} aria-hidden="true" />
                Start my own session
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
