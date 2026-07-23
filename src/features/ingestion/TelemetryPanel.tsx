import { formatBytes } from '../../lib/formatBytes';

// Phase labels describe what's happening, not a fabricated percentage —
// QueryEngine.execute() is a single atomic call with no progress callback,
// so there is no real sub-step progress to report during 'parsing'.
export type TelemetryPhase = 'idle' | 'loading-engine' | 'parsing' | 'done' | 'error';

export interface TelemetryStats {
  label: string;
  sizeBytes: number;
  format: string;
  rowCount?: number;
  columnCount?: number;
  elapsedMs?: number;
  tabMemoryMB?: number | null;
}

interface TelemetryPanelProps {
  phase: TelemetryPhase;
  stats: TelemetryStats | null;
}

const PHASE_LABEL: Record<TelemetryPhase, string> = {
  idle: '',
  'loading-engine': 'Starting the query engine…',
  parsing: 'Parsing…',
  done: 'Done',
  error: 'Failed',
};

/** Live ingestion telemetry — reused for v0.5 API pagination progress. */
export function TelemetryPanel({ phase, stats }: TelemetryPanelProps) {
  if (phase === 'idle' || !stats) return null;

  return (
    <div className="rounded-lg border border-(--color-border) p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-(--color-fg)">{stats.label}</span>
        <span className="text-sm text-(--color-fg-muted)">{PHASE_LABEL[phase]}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm text-(--color-fg-muted) sm:grid-cols-4">
        <div>
          <dt className="inline">size </dt>
          <dd className="inline text-(--color-fg)">{formatBytes(stats.sizeBytes)}</dd>
        </div>
        <div>
          <dt className="inline">format </dt>
          <dd className="inline text-(--color-fg)">{stats.format}</dd>
        </div>
        {stats.rowCount !== undefined && (
          <div>
            <dt className="inline">rows </dt>
            <dd className="inline text-(--color-fg)">{stats.rowCount.toLocaleString()}</dd>
          </div>
        )}
        {stats.columnCount !== undefined && (
          <div>
            <dt className="inline">cols </dt>
            <dd className="inline text-(--color-fg)">{stats.columnCount}</dd>
          </div>
        )}
        {stats.elapsedMs !== undefined && (
          <div>
            <dt className="inline">elapsed </dt>
            <dd className="inline text-(--color-fg)">{stats.elapsedMs.toFixed(0)} ms</dd>
          </div>
        )}
        {stats.tabMemoryMB != null && (
          <div>
            <dt className="inline">tab memory </dt>
            <dd className="inline text-(--color-fg)">{stats.tabMemoryMB.toFixed(1)} MB</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
