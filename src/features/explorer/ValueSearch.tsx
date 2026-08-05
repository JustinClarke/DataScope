// Value search (A2, master §11.5/§13.3, D74) — "which column contains this?"
// answered directly by A1's `search_values` operation. The rail stays the
// lightest rung of the detail ladder: a result is structure only (table,
// column, match count) and clicking it links into the drawer by selecting
// the column, rather than rendering the operation's sample values here.
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { analystCore } from '../../services/analyst';
import { isOpError, type OpOutcome } from '../../lib/analyst/types';
import { useDatasetsStore } from '../../stores/datasets';
import { useSelectionStore } from '../../stores/selection';
import { openDestination } from '../../services/navigation';
import { RunSqlButton } from '../sql/RunSqlButton';

const DEBOUNCE_MS = 300;

interface SearchRow {
  table: string;
  column: string;
  matchCount: number;
}

function rowsFrom(outcome: OpOutcome): SearchRow[] {
  if (isOpError(outcome)) return [];
  return outcome.rows.map((row) => ({
    table: row[0] as string,
    column: row[1] as string,
    matchCount: row[2] as number,
  }));
}

export function ValueSearch() {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [outcome, setOutcome] = useState<OpOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const tables = useDatasetsStore((state) => state.tables);
  const selectColumn = useSelectionStore((state) => state.selectColumn);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (!debounced) {
      setOutcome(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    analystCore()
      .call('search_values', { term: debounced })
      .then((result) => {
        if (cancelled) return;
        setOutcome(result);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  function handleSelect(row: SearchRow) {
    const table = tables.find((t) => t.tableName === row.table);
    if (!table) return;
    selectColumn(table.id, row.column);
    openDestination('profile', table.id);
  }

  const rows = outcome ? rowsFrom(outcome) : [];

  return (
    <div className="shrink-0 border-b border-(--color-rule-2) px-3 py-2">
      <div className="relative">
        <Search
          size={12}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-(--color-ink-3)"
        />
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Which column contains…"
          aria-label="Search values across every table"
          data-testid="value-search-input"
          className="w-full rounded-(--radius-sm) border border-(--color-rule) bg-(--color-elev) py-1 pr-2 pl-6 font-mono text-[length:var(--text-xs)] text-(--color-ink) placeholder:text-(--color-ink-3)"
        />
      </div>

      {debounced && (
        <div data-testid="value-search-results" className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
          {loading ? (
            <p className="font-mono text-[length:var(--text-2xs)] text-(--color-ink-3)">Searching…</p>
          ) : outcome && isOpError(outcome) ? (
            <p role="alert" data-testid="value-search-error" className="font-mono text-[length:var(--text-2xs)] text-(--color-error)">
              {outcome.message}
            </p>
          ) : rows.length === 0 ? (
            <p data-testid="value-search-empty" className="font-mono text-[length:var(--text-2xs)] text-(--color-ink-3)">
              No column contains “{debounced}”.
            </p>
          ) : (
            <>
              {outcome && !isOpError(outcome) && outcome.sql && (
                <div className="flex items-center justify-between px-1.5">
                  <span className="font-mono text-[length:var(--text-2xs)] text-(--color-ink-3)">
                    {rows.length} column{rows.length === 1 ? '' : 's'} match
                  </span>
                  <RunSqlButton sql={outcome.sql} />
                </div>
              )}
              {rows.map((row) => {
                const known = tables.some((t) => t.tableName === row.table);
                return (
                  <button
                    key={`${row.table}.${row.column}`}
                    type="button"
                    data-testid="value-search-row"
                    disabled={!known}
                    onClick={() => handleSelect(row)}
                    className="flex items-center justify-between gap-2 rounded-(--radius-xs) px-1.5 py-1 text-left font-mono text-[length:var(--text-2xs)] text-(--color-ink-2) hover:bg-(--color-elev) hover:text-(--color-ink) disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="truncate">
                      {row.table}.{row.column}
                    </span>
                    <span className="shrink-0 text-(--color-ink-3)">{row.matchCount.toLocaleString()}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
