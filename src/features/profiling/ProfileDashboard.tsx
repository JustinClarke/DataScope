import { useEffect, useState } from "react";
import { Table2 } from "lucide-react";
import { useDatasetsStore } from "../../stores/datasets";
import { useSelectionStore } from "../../stores/selection";
import { useEducationalPanel } from "../../app/useEducationalPanel";
import {
  loadTableCardStats,
  type ColumnCardStats,
} from "../../services/profiling";
import { ColumnCard } from "./ColumnCard";
import { InsightFeed } from "./InsightFeed";
import type { TableRegistryEntry } from "../../types";

function TablePicker({
  tables,
  activeId,
  onSelect,
}: {
  tables: TableRegistryEntry[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (tables.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tables.map((table) => (
        <button
          key={table.id}
          type="button"
          onClick={() => onSelect(table.id)}
          className={`rounded-full border px-3 py-1 text-sm transition-colors ${
            table.id === activeId
              ? "border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)"
              : "border-(--color-border) text-(--color-fg-muted) hover:text-(--color-fg)"
          }`}
        >
          {table.tableName}
        </button>
      ))}
    </div>
  );
}

interface ProfileDashboardProps {
  /** Opens directly on this table (the Dossier's "profile this table" links) rather than defaulting to the first. */
  initialTableId?: string | null;
  /** Present when reached from the Dossier (rung 4 of the §13.1 cut ladder still needs no back link — the sidebar always reaches this view directly too). */
  onBack?: () => void;
}

/**
 * The always-enabled profile view (§10 Module 1): row/column counts, one card
 * per column, and (below) the deterministic insight feed. Per-table (D13) —
 * a table picker appears once a dataset registers more than one.
 */
export function ProfileDashboard({
  initialTableId = null,
  onBack,
}: ProfileDashboardProps = {}) {
  const tables = useDatasetsStore((state) => state.tables);
  const selectedColumn = useSelectionStore((state) => state.selectedColumn);
  const selectColumn = useSelectionStore((state) => state.selectColumn);
  const { setContent } = useEducationalPanel();
  const [activeTableId, setActiveTableId] = useState<string | null>(
    initialTableId,
  );
  const [cardStats, setCardStats] = useState<Record<
    string,
    ColumnCardStats
  > | null>(null);

  const activeTable =
    tables.find((t) => t.id === activeTableId) ?? tables[0] ?? null;

  useEffect(() => {
    if (!activeTableId && tables.length > 0) setActiveTableId(tables[0].id);
  }, [activeTableId, tables]);

  // Re-syncs when the Dossier hands over a different table (initialTableId
  // changes) without this component remounting.
  useEffect(() => {
    if (initialTableId) setActiveTableId(initialTableId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTableId]);

  useEffect(() => {
    if (!activeTable?.columns) {
      setCardStats(null);
      return;
    }
    let cancelled = false;
    setCardStats(null);
    void loadTableCardStats(activeTable.tableName, activeTable.columns).then(
      (result) => {
        if (!cancelled) setCardStats(result);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeTable?.id, activeTable?.tableName, activeTable?.columns]);

  const handleShowSql = (label: string, sql: string) => {
    setContent(
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-(--color-fg)">{label}</p>
        <pre className="overflow-x-auto rounded bg-(--color-border)/40 p-3 font-mono text-xs text-(--color-fg)">
          {sql}
        </pre>
      </div>,
    );
  };

  if (tables.length === 0) {
    return (
      <p className="text-center text-(--color-fg-muted)">
        Drop a dataset to get started.
      </p>
    );
  }

  if (!activeTable) return null;

  return (
    <div className="flex flex-col gap-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="self-start text-sm text-(--color-accent) hover:underline"
        >
          ← Back to overview
        </button>
      )}
      <TablePicker
        tables={tables}
        activeId={activeTable.id}
        onSelect={setActiveTableId}
      />

      <div className="flex flex-col rounded-(--radius-md) border border-(--color-border)">
        <div className="flex items-center justify-between gap-2 border-b border-(--color-border) px-4 py-3">
          <div className="flex items-center gap-2">
            <Table2
              size={16}
              aria-hidden="true"
              className="shrink-0 text-(--color-fg-muted)"
            />
            <h2 className="font-semibold text-(--color-fg)">
              {activeTable.tableName}
            </h2>
          </div>
          <span className="rounded-(--radius-xs) bg-(--color-elev) px-2.5 py-1 font-mono text-xs text-(--color-fg-muted)">
            {activeTable.rowCount.toLocaleString()} rows
          </span>
        </div>

        {!activeTable.columns ? (
          <p className="p-4 text-sm text-(--color-fg-muted)">
            Classifying columns…
          </p>
        ) : (
          <div className="flex flex-col gap-1 p-2">
            {activeTable.columns.map((column) => (
              <ColumnCard
                key={column.name}
                column={column}
                stats={cardStats?.[column.name]}
                rowCount={activeTable.rowCount}
                onShowSql={handleShowSql}
                onSelect={() => selectColumn(activeTable.id, column.name)}
                selected={
                  selectedColumn?.tableId === activeTable.id &&
                  selectedColumn?.column === column.name
                }
              />
            ))}
          </div>
        )}
      </div>

      <InsightFeed table={activeTable} onShowSql={handleShowSql} />
    </div>
  );
}
