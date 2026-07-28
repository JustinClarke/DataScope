// The run action every SQL-displaying surface gets (S4, D73, master §13.3) —
// one component, not a per-folder copy like `GeneratedSql`. That duplication is
// a choice about a panel's layout; this is the entry to a data-safety
// mechanism, and copying it into six files is how one of them ends up calling
// `runQuery` directly later.
//
// Never disabled while a query is running: a remote surface has no view of the
// running state, and a new run supersedes the old one (`services/runPath.ts`).
import { Play } from 'lucide-react';
import { runInConsole } from '../../services/runPath';

export function RunSqlButton({ sql }: { sql: string }) {
  return (
    <button
      type="button"
      onClick={() => runInConsole(sql)}
      disabled={sql.trim().length === 0}
      title="Run this query in the SQL console"
      className="flex items-center gap-1 text-xs text-(--color-accent) hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:no-underline"
    >
      <Play size={12} aria-hidden="true" />
      Run
    </button>
  );
}
