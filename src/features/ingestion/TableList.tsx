import { useEffect, useState } from 'react';
import { RefreshCw, Trash2, Undo2, ChevronRight, ChevronDown } from 'lucide-react';
import { useDatasetsStore } from '../../stores/datasets';
import { useSelectionStore } from '../../stores/selection';
import { useRehydrationStore, type TableOutcome } from '../../stores/rehydration';
import { recoverTable } from '../../services/rehydration';
import { useEducationalPanel } from '../../app/useEducationalPanel';
import { formatBytes } from '../../lib/formatBytes';
import { keyColumnsFor } from '../../lib/dossier';
import { ColumnCard } from '../profiling/ColumnCard';
import { loadTableCardStats, type ColumnCardStats } from '../../services/profiling';
import type { FkEdge } from '../../lib/relationshipInference';
import type { TableRegistryEntry } from '../../types';

const ORIGIN_LABEL: Record<TableRegistryEntry['origin'], string> = {
  file: 'file',
  sample: 'sample',
  api: 'API',
  derived: 'derived',
  shared: 'shared link',
};

/**
 * A view says "view", not "derived" (A3). Both are derived by origin, but what
 * the reader needs from this badge is whether the rows are *there* — a view
 * re-runs its query on every read and stores nothing, which is also why its
 * size badge is 0 B rather than missing.
 */
function originLabel(table: TableRegistryEntry): string {
  return table.kind === 'view' ? 'view' : ORIGIN_LABEL[table.origin];
}

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
   * (S1, `14-workspace-streamline/01-explorer-rail-reflow.md`) Opens a disclosed column's Profile
   * tab with that column selected. Omitted wherever `reflow` is false — the disclosure that would
   * call it doesn't render there.
   */
  onSelectColumn?: (tableId: string, column: string) => void;
  /**
   * (V3, `13-hallmark-replication/03-explorer-status-bar.md`) When true, omits the
   * "Registered tables" `<h2>`. Additive/default-false so `IngestionPanel`'s call site
   * (which needs its own section heading) renders exactly as before; only `ExplorerPanel`
   * passes it, since the Workbench explorer draws its own `.explorer__head` instead.
   */
  hideHeading?: boolean;
  /**
   * (S1) Switches each row to the rail's two-line composition — name unclamped on its own line,
   * `rows × cols · origin` + badges demoted beneath — plus a chevron that discloses the table's
   * columns (structure only: key marker + type chip, rung 1 of the detail ladder). Additive/
   * default-false, same precedent as `hideHeading`: `IngestionPanel`'s call site renders the
   * original single-line row unchanged; only `ExplorerPanel` passes `reflow`.
   */
  reflow?: boolean;
  /** (S1) Dataset-wide inferred FK edges, override-applied — only meaningful with `reflow`; used to mark a disclosed column's FK role. Defaults to `[]`. */
  edges?: FkEdge[];
}

/**
 * The table registry's own view (§7.5, D58) — every registered table, independent
 * of the ingestion event that produced it, so a multi-table dataset (the ecommerce
 * sample; folder drop once 04-multi-file lands) can lose one table without its
 * siblings. Reads `stores/datasets.ts` directly, so it updates live with no
 * separate fetch or cache.
 */
/** The rows×cols/origin/memory/fetched/stale/sampled badges — identical content whether they sit inline (unreflowed) or demoted to their own line (S1's `reflow`). */
function RowMetadata({ table }: { table: TableRegistryEntry }) {
  return (
    <>
      <span className="font-mono text-[length:var(--text-xs)] text-(--color-ink-3)">
        {table.rowCount.toLocaleString()} rows × {table.columnCount} cols
      </span>
      <span className="font-mono text-[length:var(--text-2xs)] uppercase tracking-[0.1em] text-(--color-ink-3)">
        {originLabel(table)}
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
    </>
  );
}

function RowActions({
  table,
  onRemove,
  onRefresh,
  refreshingTableId,
  refreshDisabled,
}: {
  table: TableRegistryEntry;
  onRemove: (tableId: string) => void;
  onRefresh: (tableId: string) => void;
  refreshingTableId: string | null;
  refreshDisabled: boolean;
}) {
  return (
    <>
      {table.origin === 'api' && (
        <button
          type="button"
          onClick={() => onRefresh(table.id)}
          disabled={refreshDisabled}
          aria-label={`Refresh ${table.tableName} from source`}
          className="rounded p-1 text-(--color-fg-muted) transition-colors hover:bg-(--color-border) hover:text-(--color-fg) disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={16} aria-hidden="true" className={refreshingTableId === table.id ? 'animate-spin' : undefined} />
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
        {table.origin === 'derived' ? <Undo2 size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
      </button>
    </>
  );
}

/**
 * A reconciled row that didn't come back (S6.9 / 07d). The whole point is that
 * it is *not* the row above: no name button, no column disclosure, no stats —
 * nothing that invites a click that would query a table the engine doesn't
 * have. It states the reason, and offers the recovery only where one exists
 * (never fired on load, always by this button).
 */
function UnavailableRow({
  table,
  outcome,
  onRemove,
}: {
  table: TableRegistryEntry;
  outcome: TableOutcome;
  onRemove: (tableId: string) => void;
}) {
  const [recovering, setRecovering] = useState(false);

  return (
    <li
      data-testid={`trow-unavailable-${table.id}`}
      data-rehydration={outcome.status}
      className="group flex flex-col gap-1 rounded-(--radius-sm) px-4 py-2 opacity-70"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="trow__name min-w-0 font-mono text-[length:var(--text-base)] text-(--color-ink-3) line-through">
          {table.tableName}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {outcome.status === 'recoverable' && (
            <button
              type="button"
              disabled={recovering}
              onClick={() => {
                setRecovering(true);
                void recoverTable(table.id).finally(() => setRecovering(false));
              }}
              className="rounded px-1.5 py-0.5 text-[length:var(--text-xs)] text-(--color-accent) hover:underline disabled:opacity-50"
            >
              {outcome.recovery === 'refetch' ? 'Refresh from source' : 'Rebuild'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(table.id)}
            aria-label={`Remove ${table.tableName}`}
            className="rounded p-1 text-(--color-fg-muted) transition-colors hover:bg-(--color-border) hover:text-(--color-fg)"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="pl-0 text-[length:var(--text-xs)] text-(--color-warn)">{outcome.reason}</p>
    </li>
  );
}

function fkColumnsFor(table: TableRegistryEntry, edges: FkEdge[]): Set<string> {
  const columns = new Set<string>();
  for (const edge of edges) {
    if (edge.childTable === table.tableName) columns.add(edge.childColumn);
  }
  return columns;
}

/**
 * The rail's rung-1 column disclosure (S1) — each column is itself a `ColumnCard` (`compact`,
 * collapsed by default), so opening a table now surfaces the same computed cardinality/null/
 * distribution content the Profile tab shows, without leaving the rail. `compact` forces
 * `ColumnCard`'s stat grid to stay single-column at rail width; `defaultExpanded={false}` keeps
 * a freshly-opened table's column list scannable instead of dumping every column's stats at
 * once. Stats load lazily, once per table, only while its disclosure is mounted (i.e. only after
 * the table's own chevron is opened) — same lazy-per-active-table shape as `ProfileDashboard`.
 * `onOpenProfile` is undefined wherever `onSelectTable` is (the plain-`<span>` name fallback);
 * the "View full profile →" link is the only thing gated on it now — a column row is useful on
 * its own (chevron + stats) even with no tab to jump to.
 */
function ColumnDisclosure({
  table,
  edges,
  onSelectColumn,
  onOpenProfile,
}: {
  table: TableRegistryEntry;
  edges: FkEdge[];
  onSelectColumn?: (tableId: string, column: string) => void;
  onOpenProfile?: () => void;
}) {
  const columns = table.columns ?? [];
  const { setContent } = useEducationalPanel();
  const [cardStats, setCardStats] = useState<Record<string, ColumnCardStats> | null>(null);

  useEffect(() => {
    if (columns.length === 0) {
      setCardStats(null);
      return;
    }
    let cancelled = false;
    setCardStats(null);
    void loadTableCardStats(table.tableName, columns).then((result) => {
      if (!cancelled) setCardStats(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.tableName, columns]);

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

  if (columns.length === 0) {
    return (
      <div
        data-testid={`trow-columns-${table.id}`}
        className="pl-8 py-2 font-mono text-[length:var(--text-xs)] text-(--color-ink-3)"
      >
        Profiling…
      </div>
    );
  }

  const pkColumns = new Set(keyColumnsFor(table));
  const fkColumns = fkColumnsFor(table, edges);

  return (
    <div data-testid={`trow-columns-${table.id}`} className="flex flex-col gap-0.5 pb-2 pl-6 pr-2">
      {columns.map((column) => {
        const isPk = pkColumns.has(column.name);
        const isFk = fkColumns.has(column.name);
        return (
          <div key={column.name} data-testid={`trow-column-${table.id}-${column.name}`} data-key={isPk ? 'pk' : isFk ? 'fk' : undefined}>
            <ColumnCard
              column={column}
              stats={cardStats?.[column.name]}
              rowCount={table.rowCount}
              compact
              defaultExpanded={false}
              isForeignKey={isFk}
              onShowSql={handleShowSql}
              onSelect={onSelectColumn ? () => onSelectColumn(table.id, column.name) : undefined}
            />
          </div>
        );
      })}
      {onOpenProfile && (
        <button
          type="button"
          onClick={onOpenProfile}
          className="px-2 py-1 text-left font-mono text-[length:var(--text-2xs)] text-(--color-ink-3) hover:text-(--color-ink-2)"
        >
          View full profile →
        </button>
      )}
    </div>
  );
}

export function TableList({
  onRemove,
  onRefresh,
  refreshingTableId,
  refreshDisabled,
  onSelectTable,
  onSelectColumn,
  hideHeading = false,
  reflow = false,
  edges = [],
}: TableListProps) {
  const tables = useDatasetsStore((state) => state.tables);
  const selectedTableId = useSelectionStore((state) => state.selectedTableId);
  const outcomes = useRehydrationStore((state) => state.outcomes);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  if (tables.length === 0) return null;

  function toggleExpanded(tableId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId);
      else next.add(tableId);
      return next;
    });
  }

  return (
    <div>
      {!hideHeading && <h2 className="mb-3 text-sm font-medium text-(--color-fg-muted)">Registered tables</h2>}
      <ul className="flex flex-col gap-2">
        {tables.map((table) => {
          // 07d: reconciliation's answer comes first — a row the engine can't
          // back never reaches the ordinary compositions below, reflowed or not.
          const outcome = outcomes[table.id];
          if (outcome && outcome.status !== 'restored') {
            return <UnavailableRow key={table.id} table={table} outcome={outcome} onRemove={onRemove} />;
          }

          const isSelected = table.id === selectedTableId;
          const rowClassName = `group flex items-center justify-between gap-2 rounded-(--radius-sm) px-4 py-2 outline outline-2 -outline-offset-2 outline-transparent ${
            isSelected ? 'bg-(--color-elev) shadow-[inset_2px_0_0_var(--color-active)]' : 'hover:bg-(--color-elev)'
          }`;
          const name = onSelectTable ? (
            <button
              type="button"
              onClick={() => onSelectTable(table.id)}
              className={`trow__name min-w-0 text-left font-mono text-[length:var(--text-base)] text-(--color-ink) underline-offset-2 hover:underline ${reflow ? '' : 'flex-auto truncate'}`}
            >
              {table.tableName}
            </button>
          ) : (
            <span
              className={`trow__name min-w-0 font-mono text-[length:var(--text-base)] text-(--color-ink) ${reflow ? '' : 'flex-auto truncate'}`}
            >
              {table.tableName}
            </span>
          );

          if (!reflow) {
            return (
              <li key={table.id} className={rowClassName}>
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-(--radius-xs) bg-(--color-ink-3)" />
                  {name}
                  <RowMetadata table={table} />
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <RowActions
                    table={table}
                    onRemove={onRemove}
                    onRefresh={onRefresh}
                    refreshingTableId={refreshingTableId}
                    refreshDisabled={refreshDisabled}
                  />
                </div>
              </li>
            );
          }

          const isExpanded = expanded.has(table.id);
          // Same first-click-expands, second-click-opens pattern as the disclosed
          // columns below (`ColumnCard`'s `handleRowClick`) — the whole strip is the
          // hit target instead of just the name, and a single click never jumps
          // straight to the Profile tab before the row has had a chance to disclose.
          const handleRowClick = () => {
            if (!isExpanded) {
              toggleExpanded(table.id);
              return;
            }
            if (onSelectTable) {
              onSelectTable(table.id);
              return;
            }
            toggleExpanded(table.id);
          };
          return (
            <li key={table.id} className={`${rowClassName} flex-col items-stretch gap-0`}>
              <div
                className="flex cursor-pointer flex-col gap-0 rounded-(--radius-sm) outline-none focus-visible:bg-(--color-elev)"
                role="button"
                tabIndex={0}
                onClick={handleRowClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleRowClick();
                  }
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(table.id);
                      }}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${table.tableName}'s columns`}
                      aria-expanded={isExpanded}
                      data-testid={`trow-chevron-${table.id}`}
                      className="shrink-0 rounded p-0.5 text-(--color-ink-3) hover:bg-(--color-elev) hover:text-(--color-ink-2)"
                    >
                      {isExpanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                    </button>
                    <span className="trow__name min-w-0 font-mono text-[length:var(--text-base)] text-(--color-ink)">
                      {table.tableName}
                    </span>
                  </div>
                  <div
                    className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <RowActions
                      table={table}
                      onRemove={onRemove}
                      onRefresh={onRefresh}
                      refreshingTableId={refreshingTableId}
                      refreshDisabled={refreshDisabled}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 py-1 pl-6">
                  <RowMetadata table={table} />
                </div>
              </div>
              {isExpanded && (
                <ColumnDisclosure
                  table={table}
                  edges={edges}
                  onSelectColumn={onSelectColumn}
                  onOpenProfile={onSelectTable ? () => onSelectTable(table.id) : undefined}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
