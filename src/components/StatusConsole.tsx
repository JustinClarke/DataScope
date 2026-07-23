import { useDatasetsStore, type WorkerStatus } from '../stores/datasets';
import { useQueryStore, type QueryStatus } from '../stores/query';
import { formatBytes } from '../lib/formatBytes';

/**
 * Bottom status bar showing dataset metadata, worker status, and query statistics.
 * Displays aggregate counts (table count, total rows, total memory), the most
 * recently executed query's timing (a placeholder until the first query of the
 * session runs), and a placeholder value for DuckDB version.
 */
export function StatusConsole() {
  const tables = useDatasetsStore((state) => state.tables);
  const workerStatus = useDatasetsStore((state) => state.workerStatus);
  const queryStatus = useQueryStore((state) => state.status);
  const queryResult = useQueryStore((state) => state.result);

  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);
  const totalMemoryBytes = tables.reduce((sum, t) => sum + t.memoryBytes, 0);
  const tableCount = tables.length;

  const workerStatusText = getWorkerStatusText(workerStatus);
  const queryTimeText = getQueryTimeText(queryStatus, queryResult?.executionTimeMs);

  return (
    <footer className="flex items-center gap-6 border-t border-(--color-border) bg-(--color-bg) px-6 py-3 text-sm text-(--color-fg-muted) font-mono">
      <div>DuckDB v—</div>
      <div>{tableCount} table{tableCount !== 1 ? 's' : ''} × {totalRows.toLocaleString()} rows</div>
      <div>{formatBytes(totalMemoryBytes)} total</div>
      <div>{queryTimeText}</div>
      <div>{workerStatusText}</div>
    </footer>
  );
}

function getQueryTimeText(status: QueryStatus, executionTimeMs?: number): string {
  if (status === 'running') return 'query running…';
  if (status === 'success' && executionTimeMs !== undefined) return `query ${executionTimeMs.toFixed(0)} ms`;
  return 'query — ms';
}

function getWorkerStatusText(status: WorkerStatus): string {
  switch (status) {
    case 'idle':
      return 'Web Worker: Idle';
    case 'loading':
      return 'Web Worker: Loading';
    case 'compiling':
      return 'Web Worker: Compiling';
    case 'ready':
      return 'Web Worker: Ready';
    case 'error':
      return 'Web Worker: Error';
    default:
      return 'Web Worker: Unknown';
  }
}
