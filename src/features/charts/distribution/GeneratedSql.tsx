import { copySql } from "../../sql/resultsExport";
import { RunSqlButton } from "../../sql/RunSqlButton";

/** The "SQL shown alongside the chart" panel (§10 Module 5) — same shape as time-series/correlation's own copy; each chart module keeps a local one rather than reaching into a sibling feature folder (PivotBuilder's own inline block is the existing precedent for this). This item shows three statements (histogram, box plot, moments), so a `label` distinguishes each block rather than concatenating them into one unlabeled panel. */
export function GeneratedSql({ label, sql }: { label: string; sql: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-(--color-fg-muted)">
          {label}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => copySql(sql)}
            className="text-xs text-(--color-accent) hover:underline"
          >
            Copy SQL
          </button>
          <RunSqlButton sql={sql} />
        </div>
      </div>
      <pre className="overflow-x-auto rounded bg-(--color-border)/40 p-2 font-mono text-xs text-(--color-fg)">
        {sql}
      </pre>
    </div>
  );
}
