import { RefreshCw, Trash2, Undo2 } from 'lucide-react';
import { useDatasetsStore } from '../../stores/datasets';
import { useSelectionStore } from '../../stores/selection';
import { formatBytes } from '../../lib/formatBytes';
import type { TableRegistryEntry } from '../../types';

const ORIGIN_LABEL: Record<TableRegistryEntry['origin'], string> = {
  file: 'file',
  sample: 'sample',
  api: 'API',
  derived: 'derived',
  shared: 'shared link',
};

interface TableListProps {
  onRemove: (tableId: string) => void;
  /** §7.4 "Refresh from source" — re-runs an API-sourced table's original pull and replaces it in place. */
  onRefresh: (tableId: string) => void;
  /** The table id a refresh is currently in flight for, if any — spins that row's icon and nothing else. */
  refreshingTableId: string | null;
  /** True while any ingest/refresh already has the engine busy — every refresh button is disabled together to avoid overlapping DuckDB writes. */
  refreshDisabled: boolean;
  /**
   * (Workbench W2, D68d) When provided, the table name becomes clickable —
   * the explorer's "click a table, land on its Profile tab" behavior. Omitted
   * by the flag-off `IngestionPanel` call site, whose rows render exactly as
   * before.
   */
  onSelectTable?: (tableId: string) => void;
  /**
   * (V3, `13-hallmark-replication/03-explorer-status-bar.md`) When true, omits the
   * "Registered tables" `<h2>`. Additive/default-false so `IngestionPanel`'s call site
   * (which needs its own section heading) renders exactly as before; only `ExplorerPanel`
   * passes it, since the Workbench explorer draws its own `.explorer__head` instead.
   */
  hideHeading?: boolean;
}

/**
 * The table registry's own view (§7.5, D58) — every registered table, independent
 * of the ingestion event that produced it, so a multi-table dataset (the ecommerce
 * sample; folder drop once 04-multi-file lands) can lose one table without its
 * siblings. Reads `stores/datasets.ts` directly, so it updates live with no
 * separate fetch or cache.
 */
export function TableList({
  onRemove,
  onRefresh,
  refreshingTableId,
  refreshDisabled,
  onSelectTable,
  hideHeading = false,
}: TableListProps) {
  const tables = useDatasetsStore((state) => state.tables);
  const selectedTableId = useSelectionStore((state) => state.selectedTableId);

  if (tables.length === 0) return null;

  return (
    <div>
      {!hideHeading && <h2 className="mb-3 text-sm font-medium text-(--color-fg-muted)">Registered tables</h2>}
      <ul className="flex flex-col gap-2">
        {tables.map((table) => {
          const isSelected = table.id === selectedTableId;
          return (
          <li
            key={table.id}
            className={`group flex items-center justify-between gap-2 rounded-(--radius-sm) px-4 py-2 outline outline-2 -outline-offset-2 outline-transparent ${
              isSelected
                ? 'bg-(--color-elev) shadow-[inset_2px_0_0_var(--color-active)]'
                : 'hover:bg-(--color-elev)'
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-(--radius-xs) bg-(--color-ink-3)" />
              {onSelectTable ? (
                <button
                  type="button"
                  onClick={() => onSelectTable(table.id)}
                  className="trow__name min-w-0 flex-auto truncate text-left font-mono text-[length:var(--text-base)] text-(--color-ink) underline-offset-2 hover:underline"
                >
                  {table.tableName}
                </button>
              ) : (
                <span className="trow__name min-w-0 flex-auto truncate font-mono text-[length:var(--text-base)] text-(--color-ink)">
                  {table.tableName}
                </span>
              )}
              <span className="font-mono text-[length:var(--text-xs)] text-(--color-ink-3)">
                {table.rowCount.toLocaleString()} rows × {table.columnCount} cols
              </span>
              <span className="font-mono text-[length:var(--text-2xs)] uppercase tracking-[0.1em] text-(--color-ink-3)">
                {ORIGIN_LABEL[table.origin]}
              </span>
              <span className="text-[length:var(--text-xs)] text-(--color-ink-3)">{formatBytes(table.memoryBytes)}</span>
              {table.origin === 'api' && table.lastFetchedAt && (
                <span className="text-[length:var(--text-xs)] text-(--color-ink-3)">
                  fetched {new Date(table.lastFetchedAt).toLocaleString()}
                </span>
              )}
              {table.origin === 'derived' && table.stale && (
                // No dismiss control, same reasoning as the sampled badge below —
                // stays visible for as long as the flag holds, straight from the store.
                <span className="ml-2 rounded bg-(--color-warn)/10 px-1.5 py-0.5 text-xs font-medium text-(--color-warn)">
                  possibly stale — a source table was refreshed
                </span>
              )}
              {table.sampled && (
                // No dismiss control — reads straight from the store, so it
                // stays visible for as long as this table does rather than
                // only for the ingestion moment.
                <span className="ml-2 rounded bg-(--color-warn)/10 px-1.5 py-0.5 text-xs font-medium text-(--color-warn)">
                  sampled — first {(table.sampleRowLimit ?? table.rowCount).toLocaleString()} rows
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {table.origin === 'api' && (
                <button
                  type="button"
                  onClick={() => onRefresh(table.id)}
                  disabled={refreshDisabled}
                  aria-label={`Refresh ${table.tableName} from source`}
                  className="rounded p-1 text-(--color-fg-muted) transition-colors hover:bg-(--color-border) hover:text-(--color-fg) disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    size={16}
                    aria-hidden="true"
                    className={refreshingTableId === table.id ? 'animate-spin' : undefined}
                  />
                </button>
              )}
              {/* A derived table's "remove" action *is* its undo (§12.1) —
                  dropping it and purging its registry entry is exactly what
                  undo means for a table that only exists because of a
                  transform, so this reuses the same onRemove callback under a
                  relabeled affordance rather than a second code path. */}
              <button
                type="button"
                onClick={() => onRemove(table.id)}
                aria-label={table.origin === 'derived' ? `Undo ${table.tableName}` : `Remove ${table.tableName}`}
                className="rounded p-1 text-(--color-fg-muted) transition-colors hover:bg-(--color-border) hover:text-(--color-fg)"
              >
                {table.origin === 'derived' ? (
                  <Undo2 size={16} aria-hidden="true" />
                ) : (
                  <Trash2 size={16} aria-hidden="true" />
                )}
              </button>
            </div>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
