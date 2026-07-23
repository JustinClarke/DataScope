import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronUp, ChevronDown } from 'lucide-react';

export interface DataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
}

export type SortDirection = 'asc' | 'desc';

interface DataTableProps {
  columns: DataTableColumn[];
  rowCount: number;
  getRow: (index: number) => unknown[];
  renderCell: (value: unknown, columnIndex: number, rowIndex: number) => ReactNode;
  sortColumn?: string | null;
  sortDirection?: SortDirection;
  onSortChange?: (columnKey: string) => void;
  rowHeightPx?: number;
  maxHeightPx?: number;
  emptyMessage?: string;
}

/**
 * Generic virtualized, sortable data grid — one row is rendered per pixel
 * range the virtualizer reports, never the full `rowCount`, so this scales to
 * however many rows the caller has actually loaded into memory. Presentation
 * only: sorting and cell formatting are owned by the caller (`renderCell`,
 * `onSortChange`) so results-grid, chart drill-throughs, and the AI
 * transcript can each format cells their own way over the same primitive.
 */
export function DataTable({
  columns,
  rowCount,
  getRow,
  renderCell,
  sortColumn = null,
  sortDirection = 'asc',
  onSortChange,
  rowHeightPx = 32,
  maxHeightPx = 480,
  emptyMessage = 'No rows.',
}: DataTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeightPx,
    overscan: 12,
  });

  const gridTemplateColumns = columns.map(() => 'minmax(120px, 1fr)').join(' ');

  return (
    <div
      ref={scrollRef}
      role="table"
      className="overflow-auto rounded-lg border border-(--color-border)"
      style={{ maxHeight: maxHeightPx }}
    >
      <div
        role="row"
        className="sticky top-0 z-10 grid border-b border-(--color-border) bg-(--color-border)/40"
        style={{ gridTemplateColumns }}
      >
        {columns.map((column) => {
          const isSorted = sortColumn === column.key;
          return (
            <button
              key={column.key}
              type="button"
              role="columnheader"
              disabled={!column.sortable}
              onClick={() => onSortChange?.(column.key)}
              className="flex items-center gap-1 truncate whitespace-nowrap px-3 py-2 text-left text-sm font-medium text-(--color-fg) disabled:cursor-default enabled:cursor-pointer"
              aria-sort={isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <span className="truncate">{column.label}</span>
              {isSorted &&
                (sortDirection === 'asc' ? (
                  <ChevronUp size={12} aria-hidden="true" />
                ) : (
                  <ChevronDown size={12} aria-hidden="true" />
                ))}
            </button>
          );
        })}
      </div>

      {rowCount === 0 ? (
        <p className="px-3 py-4 text-sm text-(--color-fg-muted)">{emptyMessage}</p>
      ) : (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = getRow(virtualRow.index);
            return (
              <div
                key={virtualRow.key}
                role="row"
                className="absolute left-0 top-0 grid w-full border-t border-(--color-border) first:border-t-0"
                style={{
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns,
                }}
              >
                {row.map((cell, columnIndex) => (
                  <div
                    key={columnIndex}
                    role="cell"
                    className="flex items-center truncate whitespace-nowrap px-3 text-sm text-(--color-fg-muted)"
                  >
                    {renderCell(cell, columnIndex, virtualRow.index)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
