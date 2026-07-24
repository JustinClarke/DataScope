import { RefreshCw, Trash2, Undo2 } from 'lucide-react';
import { useDatasetsStore } from '../../stores/datasets';
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
}

/**
 * The table registry's own view (§7.5, D58) — every registered table, independent
 * of the ingestion event that produced it, so a multi-table dataset (the ecommerce
 * sample; folder drop once 04-multi-file lands) can lose one table without its
 * siblings. Reads `stores/datasets.ts` directly, so it updates live with no
 * separate fetch or cache.
 */
export function TableList({ onRemove, onRefresh, refreshingTableId, refreshDisabled }: TableListProps) {
  const tables = useDatasetsStore((state) => state.tables);

  if (tables.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-(--color-fg-muted)">Registered tables</h2>
      <ul className="flex flex-col gap-2">
        {tables.map((table) => (
          <li
            key={table.id}
            className="flex items-center justify-between rounded-lg border border-(--color-border) px-4 py-2"
          >
            <div>
              <span className="font-medium text-(--color-fg)">{table.tableName}</span>
              <span className="ml-2 font-mono text-sm text-(--color-fg-muted)">
                {table.rowCount.toLocaleString()} rows × {table.columnCount} cols
              </span>
              <span className="ml-2 text-sm text-(--color-fg-muted)">
                {ORIGIN_LABEL[table.origin]} · {formatBytes(table.memoryBytes)}
              </span>
              {table.origin === 'api' && table.lastFetchedAt && (
                <span className="ml-2 text-sm text-(--color-fg-muted)">
                  fetched {new Date(table.lastFetchedAt).toLocaleString()}
                </span>
              )}
              {table.origin === 'derived' && table.stale && (
                // No dismiss control, same reasoning as the sampled badge below —
                // stays visible for as long as the flag holds, straight from the store.
                <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  possibly stale — a source table was refreshed
                </span>
              )}
              {table.sampled && (
                // No dismiss control — reads straight from the store, so it
                // stays visible for as long as this table does rather than
                // only for the ingestion moment.
                <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  sampled — first {(table.sampleRowLimit ?? table.rowCount).toLocaleString()} rows
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
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
        ))}
      </ul>
    </div>
  );
}
