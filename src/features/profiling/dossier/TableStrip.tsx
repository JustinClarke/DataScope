export interface TableStripProps {
  tables: Array<{ id: string; tableName: string; rowCount: number }>;
}

/**
 * The compact "customers 1.2K · orders 8.4K · …" line — always present
 * beneath the hero regardless of which hero variant is rendering (§13.1),
 * distinct from the richer per-table cards in HeroTableGrid.
 */
export function TableStrip({
  tables,
  onOpenTable,
}: TableStripProps & { onOpenTable: (tableId: string) => void }) {
  if (tables.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-(--color-fg-muted)">
      {tables.map((table, index) => (
        <span key={table.id} className="flex items-center gap-2">
          {index > 0 && <span aria-hidden="true">·</span>}
          <button
            type="button"
            onClick={() => onOpenTable(table.id)}
            className="hover:text-(--color-accent) hover:underline"
          >
            {table.tableName} {table.rowCount.toLocaleString()}
          </button>
        </span>
      ))}
    </div>
  );
}
