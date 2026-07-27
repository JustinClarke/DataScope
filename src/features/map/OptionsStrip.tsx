// The options strip — above the multi-table map only (W5, D71, master
// §13.3). A client-side, subject-scoped filter of the dataset-wide
// `RankedAction[]`, never a second ranker (D58) — see
// build/12-workbench/06-options-strip-palette.md for the full scope call.
import { useMemo } from 'react';
import { rankNextActions } from '../../lib/capabilities';
import type { TableInsights } from '../../lib/insights';
import { isDestinationReady, MODULE_LABELS, openDestination } from '../../services/navigation';
import { Tooltip } from '../../components/Tooltip';
import type { RankedAction, TableRegistryEntry } from '../../types';

interface OptionsStripProps {
  tables: TableRegistryEntry[];
  tableInsights: TableInsights[] | null;
  selectedTableId: string | null;
}

function subjectScopedActions(
  actions: RankedAction[],
  tables: TableRegistryEntry[],
  selectedTableId: string | null,
): RankedAction[] {
  const subjectTableName = tables.find((t) => t.id === selectedTableId)?.tableName ?? null;
  if (!subjectTableName) return actions;
  return actions.filter((action) => {
    const tableName = action.prefill.prefilledConfig.tableName;
    return tableName === undefined || tableName === subjectTableName;
  });
}

export function OptionsStrip({ tables, tableInsights, selectedTableId }: OptionsStripProps) {
  const actions = useMemo(() => rankNextActions(tables, tableInsights ?? []), [tables, tableInsights]);
  const visible = useMemo(
    () => subjectScopedActions(actions, tables, selectedTableId),
    [actions, tables, selectedTableId],
  );

  return (
    <div data-testid="options-strip" className="flex flex-wrap items-center gap-2 border-b border-(--color-rule-2) bg-(--color-panel) px-4 py-2">
      {visible.length === 0 && (
        <p className="font-mono text-[length:var(--text-md)] text-(--color-ink-3)">No suggested actions for this selection.</p>
      )}
      {visible.map((action, index) => {
        const ready = isDestinationReady(action.module);
        const isTop = ready && index === 0;
        const key = `${action.module}-${action.tab ?? ''}-${index}`;
        const button = (
          <button
            type="button"
            data-testid={`strip-action-${action.module}${action.tab ? `-${action.tab}` : ''}`}
            disabled={!ready}
            onClick={() => ready && openDestination(action.module, action.tab, action.prefill.prefilledConfig)}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-(--radius-md) border px-[0.7rem] py-[0.4rem] font-mono text-[length:var(--text-md)] tracking-[0.02em] transition-colors active:translate-y-px ${
              !ready
                ? 'cursor-not-allowed border-(--color-rule) bg-(--color-card) text-(--color-ink-3) opacity-50'
                : isTop
                  ? 'border-(--color-active) bg-(--color-active)/12 text-(--color-active) hover:bg-(--color-active)/15'
                  : 'border-(--color-rule) bg-(--color-card) text-(--color-ink-2) hover:border-(--color-rule-hi) hover:text-(--color-ink)'
            }`}
          >
            {isTop && (
              <span aria-hidden="true" className="text-[length:var(--text-2xs)] text-(--color-active)">
                ▲ top
              </span>
            )}
            {action.verb}
          </button>
        );
        if (ready) return <span key={key}>{button}</span>;
        return (
          <Tooltip key={key} content={`Arrives when ${MODULE_LABELS[action.module]} lands in the Workbench`}>
            {button}
          </Tooltip>
        );
      })}
    </div>
  );
}
