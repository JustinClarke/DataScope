export interface HeroTableGridTable {
  id: string;
  tableName: string;
  rowCount: number;
  columnCount: number;
  keyColumns: string[];
  sharedWith: Array<{ column: string; otherTable: string }>;
}

export interface HeroTableGridProps {
  tables: HeroTableGridTable[];
}

/**
 * The hero region's graph-cut rendering (D24 hedge) — the table grid promoted
 * to the hero slot in place of the Join Graph thumbnail, since
 * 05-charting/05-join-graph-beta.md is unbuilt. Each card answers "how does
 * this table relate to the others?" at structural-only fidelity: its key/ID
 * columns and any column name it shares with a sibling table. No empty
 * frame, no "graph coming soon" copy — this is the permanent v0 rendering
 * until the graph slice lands, at which point it demotes to sit beneath the
 * thumbnail rather than disappearing.
 */
export function HeroTableGrid({
  tables,
  onOpenTable,
}: HeroTableGridProps & { onOpenTable: (tableId: string) => void }) {
  if (tables.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-(--color-fg-muted)">
        How the tables relate
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((table) => (
          <button
            key={table.id}
            type="button"
            onClick={() => onOpenTable(table.id)}
            className="flex flex-col gap-2 rounded-lg border border-(--color-border) p-4 text-left transition-colors hover:border-(--color-accent)"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-(--color-fg)">
                {table.tableName}
              </span>
              <span className="font-mono text-xs text-(--color-fg-muted)">
                {table.rowCount.toLocaleString()} × {table.columnCount}
              </span>
            </div>
            {table.keyColumns.length > 0 && (
              <p className="text-xs text-(--color-fg-muted)">
                Key: {table.keyColumns.join(", ")}
              </p>
            )}
            {table.sharedWith.length > 0 && (
              <ul className="flex flex-col gap-0.5">
                {table.sharedWith.map((ref) => (
                  <li
                    key={`${ref.column}:${ref.otherTable}`}
                    className="text-xs text-(--color-fg-muted)"
                  >
                    shares <span className="font-mono">{ref.column}</span> with{" "}
                    {ref.otherTable}
                  </li>
                ))}
              </ul>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
