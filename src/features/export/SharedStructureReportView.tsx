import { X } from 'lucide-react';
import type { StructureReport } from '../../lib/structureReport';

interface SharedStructureReportViewProps {
  report: StructureReport;
  onClose: () => void;
}

/**
 * Read-only viewer for an opened structure-only share link (§12.3, D20). A
 * structure-only artifact carries no rows, so there is nothing to register
 * as a queryable table — this renders the schema/types/aggregates/
 * relationships directly from the fetched JSON instead.
 */
export function SharedStructureReportView({ report, onClose }: SharedStructureReportViewProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shared structure report"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg) p-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-(--color-fg)">Shared structure report</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-(--color-fg-muted) hover:bg-(--color-border)"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="mb-4 text-xs text-(--color-fg-muted)">
          Structure only — no data rows included. Generated {new Date(report.generatedAt).toLocaleString()}.
        </p>

        <div className="flex flex-col gap-4 overflow-auto">
          {report.tables.map((table) => (
            <div key={table.tableName} className="rounded-lg border border-(--color-border) p-4">
              <h3 className="font-medium text-(--color-fg)">{table.tableName}</h3>
              <p className="mb-2 text-sm text-(--color-fg-muted)">
                {table.rowCount.toLocaleString()} rows × {table.columnCount} cols
              </p>
              <ul className="flex flex-col gap-1">
                {table.columns.map((column) => (
                  <li
                    key={column.name}
                    className="flex justify-between gap-2 font-mono text-xs text-(--color-fg-muted)"
                  >
                    <span>{column.name}</span>
                    <span>
                      {column.semanticType} · {column.physicalType}
                      {column.nullPercentage != null ? ` · ${column.nullPercentage.toFixed(1)}% null` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {report.insights.length > 0 && (
            <div className="rounded-lg border border-(--color-border) p-4">
              <h3 className="mb-2 font-medium text-(--color-fg)">Insights</h3>
              <ul className="flex flex-col gap-1 text-xs text-(--color-fg-muted)">
                {report.insights.map((insight, index) => (
                  <li key={index}>
                    <span className="font-medium text-(--color-fg)">{insight.tableName}</span> — {insight.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.relationships && report.relationships.length > 0 && (
            <div className="rounded-lg border border-(--color-border) p-4">
              <h3 className="mb-2 font-medium text-(--color-fg)">Relationships</h3>
              <ul className="flex flex-col gap-1 text-xs text-(--color-fg-muted)">
                {report.relationships.map((rel, index) => (
                  <li key={index}>
                    {rel.childTable}.{rel.childColumn} → {rel.parentTable}.{rel.parentColumn} ({rel.confidence})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
