import { copySql } from '../../sql/resultsExport';

/** The "SQL shown alongside the chart" panel (§10 Module 4) — same shape as time-series's own copy; each chart module keeps a local one rather than reaching into a sibling feature folder (PivotBuilder's own inline block is the existing precedent for this). */
export function GeneratedSql({ sql }: { sql: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-(--color-fg-muted)">Generated SQL</span>
        <button type="button" onClick={() => copySql(sql)} className="text-xs text-(--color-accent) hover:underline">
          Copy SQL
        </button>
      </div>
      <pre className="overflow-x-auto rounded bg-(--color-border)/40 p-2 font-mono text-xs text-(--color-fg)">{sql}</pre>
    </div>
  );
}
