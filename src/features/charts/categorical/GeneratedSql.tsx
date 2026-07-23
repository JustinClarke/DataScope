import { copySql } from '../../sql/resultsExport';

/** The "SQL shown alongside the chart" panel (§10 Module 6) — same shape as every other chart module's own local copy (distribution's own docstring explains why this isn't a shared cross-folder import). */
export function GeneratedSql({ label, sql }: { label: string; sql: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-(--color-fg-muted)">{label}</span>
        <button type="button" onClick={() => copySql(sql)} className="text-xs text-(--color-accent) hover:underline">
          Copy SQL
        </button>
      </div>
      <pre className="overflow-x-auto rounded bg-(--color-border)/40 p-2 font-mono text-xs text-(--color-fg)">{sql}</pre>
    </div>
  );
}
