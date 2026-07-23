export interface TimeCoverageRowProps {
  tableName: string;
  columnName: string;
  earliest: string;
  latest: string;
  gapDescription: string;
}

export interface TimeCoverageProps {
  rows: TimeCoverageRowProps[];
}

/** Span + per-temporal-column gap summary, below the fold (§13.1). */
export function TimeCoverage({ rows }: TimeCoverageProps) {
  if (rows.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-(--color-fg-muted)">Time coverage</h2>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={`${row.tableName}.${row.columnName}`} className="text-sm text-(--color-fg)">
            <span className="font-mono text-(--color-fg-muted)">
              {row.tableName}.{row.columnName}
            </span>{' '}
            {row.earliest} → {row.latest} · {row.gapDescription}
          </li>
        ))}
      </ul>
    </div>
  );
}
