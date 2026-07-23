import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download } from 'lucide-react';
import type { QueryResult } from '../../types';
import type { QueryStatus } from '../../stores/query';
import { DataTable, type SortDirection } from '../../components/DataTable';
import { RESULT_ROW_CAP } from '../../services/sql';
import { formatCellText, truncateForDisplay } from './cellFormat';
import { downloadCsv, downloadXlsx, copySql } from './resultsExport';

interface ResultsGridProps {
  status: QueryStatus;
  result: QueryResult | null;
  error: string | null;
  sql: string;
}

const PAGE_SIZE = 1000;

function compareCells(a: unknown, b: unknown, direction: SortDirection): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1; // NULLs sort last regardless of direction
  if (bNull) return -1;

  const sign = direction === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign;
  if (a instanceof Date && b instanceof Date) return (a.getTime() - b.getTime()) * sign;
  return String(a).localeCompare(String(b)) * sign;
}

export function ResultsGrid({ status, result, error, sql }: ResultsGridProps) {
  const [sortColumnIndex, setSortColumnIndex] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(0);
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | 'sql' | null>(null);

  // A new result (different query) always starts back at page 1, unsorted —
  // stale sort/page state from the previous query's shape would otherwise
  // silently carry over.
  useEffect(() => {
    setSortColumnIndex(null);
    setSortDirection('asc');
    setPage(0);
    setExpandedCell(null);
  }, [sql, result]);

  const sortedRows = useMemo(() => {
    if (!result) return [];
    if (sortColumnIndex === null) return result.rows;
    return result.rows.slice().sort((a, b) => compareCells(a[sortColumnIndex], b[sortColumnIndex], sortDirection));
  }, [result, sortColumnIndex, sortDirection]);

  if (status === 'error' && error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-400/50 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400"
      >
        {error}
      </div>
    );
  }

  if (status === 'running') {
    return <p className="text-sm text-(--color-fg-muted)">Running…</p>;
  }

  if (!result) {
    return <p className="text-sm text-(--color-fg-muted)">Run a query to see results here.</p>;
  }

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = sortedRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const isCapped = result.rows.length < result.rowCount;

  const columns = result.columnNames.map((name, i) => ({ key: String(i), label: name, sortable: true }));

  function handleSortChange(columnKey: string) {
    const index = Number(columnKey);
    if (sortColumnIndex === index) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumnIndex(index);
      setSortDirection('asc');
    }
    setPage(0);
  }

  function renderCell(value: unknown, columnIndex: number, rowIndex: number) {
    if (value === null || value === undefined) {
      return <span className="italic text-(--color-fg-muted)/60">NULL</span>;
    }
    const columnType = result!.columnTypes[columnIndex] ?? '';
    const text = formatCellText(value, columnType);
    if (text === '') return null;

    const { display, isTruncated } = truncateForDisplay(text);
    if (!isTruncated) return <span className="min-w-0 truncate">{text}</span>;

    const cellId = `${rowIndex}:${columnIndex}`;
    const isExpanded = expandedCell === cellId;
    if (isExpanded) {
      return (
        <button
          type="button"
          onClick={() => setExpandedCell(null)}
          title="Click to collapse"
          className="h-full min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap bg-transparent p-0 py-1 text-left"
        >
          {text}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setExpandedCell(cellId)}
        title="Click to expand"
        className="min-w-0 flex-1 truncate bg-transparent p-0 text-left underline decoration-dotted underline-offset-2"
      >
        {display}
      </button>
    );
  }

  async function handleExport(kind: 'csv' | 'xlsx' | 'sql') {
    if (exporting || !result) return;
    setExporting(kind);
    try {
      if (kind === 'csv') downloadCsv(result);
      else if (kind === 'xlsx') await downloadXlsx(result);
      else await copySql(sql);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-(--color-fg-muted)">
          {result.rowCount.toLocaleString()} row{result.rowCount === 1 ? '' : 's'} in{' '}
          {result.executionTimeMs.toFixed(0)} ms
          {isCapped
            ? ` — showing first ${result.rows.length.toLocaleString()} (${RESULT_ROW_CAP.toLocaleString()}-row cap; refine your query to see the rest)`
            : ''}
        </p>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleExport('csv')}
            disabled={exporting !== null}
            className="flex items-center gap-1 rounded border border-(--color-border) px-2 py-1 font-medium text-(--color-fg) disabled:opacity-50"
          >
            <Download size={12} aria-hidden="true" /> CSV
          </button>
          <button
            type="button"
            onClick={() => handleExport('xlsx')}
            disabled={exporting !== null}
            className="flex items-center gap-1 rounded border border-(--color-border) px-2 py-1 font-medium text-(--color-fg) disabled:opacity-50"
          >
            <Download size={12} aria-hidden="true" /> {exporting === 'xlsx' ? 'Preparing…' : 'Excel'}
          </button>
          <button
            type="button"
            onClick={() => handleExport('sql')}
            disabled={exporting !== null}
            className="flex items-center gap-1 rounded border border-(--color-border) px-2 py-1 font-medium text-(--color-fg) disabled:opacity-50"
          >
            <Copy size={12} aria-hidden="true" /> {exporting === 'sql' ? 'Copying…' : 'Copy SQL'}
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rowCount={pageRows.length}
        getRow={(index) => pageRows[index]}
        renderCell={renderCell}
        sortColumn={sortColumnIndex === null ? null : String(sortColumnIndex)}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-(--color-fg-muted)">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="rounded p-1 disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <span>
            Page {currentPage + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="rounded p-1 disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
