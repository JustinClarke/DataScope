import { BarChart3 } from 'lucide-react';
import { useDatasetsStore } from '../../stores/datasets';
import { useQueryStore, CONSOLE_SESSION } from '../../stores/query';
import { useEducationalPanel } from '../../app/useEducationalPanel';
import { runQuery } from '../../services/sql';
import { buildTaskSuggestions, buildTemplateSuggestions, type QuerySuggestion, type QueryTask } from '../../lib/querySuggester';

// This list only ever renders inside the console (S5), so it writes the
// console's session explicitly rather than relying on a default.
function insertSql(sql: string): void {
  useQueryStore.getState().setSql(CONSOLE_SESSION, sql);
}

function runTask(sql: string): void {
  insertSql(sql);
  // Fire-and-forget, same rationale as SqlModule's own Run button: runQuery
  // already records the failure into the query store before it rejects.
  runQuery(sql, CONSOLE_SESSION).catch(() => {});
}

function TemplateCard({ suggestion, onShowTooltip }: { suggestion: QuerySuggestion; onShowTooltip: (label: string, text: string) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-(--color-border) p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-(--color-fg)">{suggestion.label}</span>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => onShowTooltip(suggestion.label, suggestion.tooltip)}
            className="text-(--color-accent) hover:underline"
          >
            Why?
          </button>
          <button type="button" onClick={() => insertSql(suggestion.sql)} className="text-(--color-accent) hover:underline">
            Insert
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto rounded bg-(--color-border)/40 p-2 font-mono text-xs text-(--color-fg)">{suggestion.sql}</pre>
    </div>
  );
}

function TaskCard({ task }: { task: QueryTask }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-(--color-border) p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-(--color-fg)">{task.label}</span>
        <div className="flex items-center gap-3 text-xs">
          <button type="button" onClick={() => runTask(task.sql)} className="text-(--color-accent) hover:underline">
            Run
          </button>
          {/* Runs the task's query so the playground's auto-chart panel below
              renders the translator's recommended chart for it — one-click from
              a plain-language task to a query and its chart. */}
          <button
            type="button"
            onClick={() => runTask(task.sql)}
            className="flex items-center gap-1 text-(--color-accent) hover:underline"
          >
            <BarChart3 size={12} aria-hidden="true" />
            Chart
          </button>
        </div>
      </div>
      <p className="text-sm text-(--color-fg-muted)">{task.description}</p>
      <pre className="overflow-x-auto rounded bg-(--color-border)/40 p-2 font-mono text-xs text-(--color-fg)">{task.sql}</pre>
    </div>
  );
}

/**
 * The "what do I even ask?" on-ramp (§10 Module 2) plus the D53 guided
 * task-shaped answers — both read live off the table registry so a table
 * added, dropped, or reclassified mid-session updates the rail on the very
 * next render, no separate fetch. Renders nothing once no registered table
 * has classified columns yet, so this never appears as an empty shell before
 * ingestion.
 */
export function QuerySuggestions() {
  const tables = useDatasetsStore((state) => state.tables);
  const { setContent } = useEducationalPanel();

  const templateGroups = buildTemplateSuggestions(tables).filter((group) => group.suggestions.length > 0);
  const taskGroups = buildTaskSuggestions(tables).filter((group) => group.tasks.length > 0);

  if (templateGroups.length === 0 && taskGroups.length === 0) return null;

  const handleShowTooltip = (label: string, text: string) => {
    setContent(
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-(--color-fg)">{label}</p>
        <p className="text-sm text-(--color-fg-muted)">{text}</p>
      </div>,
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {taskGroups.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-(--color-fg-muted)">Guided answers</h3>
          {taskGroups.map((group) => (
            <div key={group.tableId} className="flex flex-col gap-2">
              {taskGroups.length > 1 && (
                <p className="text-xs font-medium tracking-wide text-(--color-fg-muted) uppercase">{group.tableName}</p>
              )}
              {group.tasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          ))}
        </div>
      )}

      {templateGroups.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-(--color-fg-muted)">Suggested queries</h3>
          {templateGroups.map((group) => (
            <div key={group.tableId} className="flex flex-col gap-2">
              {templateGroups.length > 1 && (
                <p className="text-xs font-medium tracking-wide text-(--color-fg-muted) uppercase">{group.tableName}</p>
              )}
              {group.suggestions.map((suggestion) => (
                <TemplateCard key={suggestion.id} suggestion={suggestion} onShowTooltip={handleShowTooltip} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
