// The map's synthesis panel (S6, D73) — Suggested Explorations + Structural ‖
// Behavioral finding columns + the AI Dataset Synthesis card. UI only: no new
// AI composition logic. The card's real content today is the already-shipped
// D56/ADR-010 seam (`services/synthesis.ts`, wired in via `useDatasetBaseline`
// — same `headlineFact`/`tailored`/`paused` triple `VerdictBand` already
// renders), which degrades honestly to the deterministic Verdict headline
// whenever AI is off, unreachable, or paused. That headline is the swap
// point: whichever composition architecture the ideation round under
// `_implementation/_misc/_ideation/_experiments/` eventually settles on
// (nine candidates as of writing, none decided) plugs in by upgrading what
// `requestSynthesis` returns — this card doesn't change shape when it does.
import { useEffect, useMemo, useState } from 'react';
import { Activity, TrendingUp } from 'lucide-react';
import { rankNextActions } from '../../lib/capabilities';
import { RULE_LABEL, scoreOf, type InsightCandidate, type InsightRuleId, type TableInsights } from '../../lib/insights';
import { isDestinationReady, MODULE_LABELS, openDestination } from '../../services/navigation';
import { openQueryTab } from '../../services/queryTabs';
import { analystCore } from '../../services/analyst';
import { isOpError, type OpOutcome, type OpResult } from '../../lib/analyst/types';
import { Tooltip } from '../../components/Tooltip';
import type { FactRef, QueryResult, RankedAction, TableRegistryEntry } from '../../types';

const EXPLORATIONS_SHOWN = 3;

function AiSynthesisCard({ headline, paused }: { headline: FactRef | null; paused: boolean }) {
  return (
    <div
      data-testid="ai-synthesis-card"
      className="flex flex-col gap-2 rounded-(--radius-lg) border border-(--color-ai)/30 bg-(--color-ai-soft) p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-[length:var(--text-lg)] font-medium text-(--color-ink)">
          <span aria-hidden="true" className="text-(--color-ai-2)">✦</span>
          AI Dataset Synthesis
        </span>
        {paused && (
          <span
            className="font-mono text-[length:var(--text-2xs)] text-(--color-ink-3)"
            title="The cloud synthesis endpoint is temporarily paused by the operator. The statement below is the full deterministic Verdict."
          >
            paused
          </span>
        )}
      </div>
      <p data-testid="ai-synthesis-headline" className="text-[length:var(--text-base)] text-(--color-ink-2)">
        {headline ? headline.statement : 'Profiling…'}
      </p>
    </div>
  );
}

/**
 * The 4th-ranked action onward has no curated tab home the way the top 3 do
 * (§13.3's routing table only names the top 3's destinations) — "view more"
 * sends each of them to a disposable **pre-run query tab** instead (S5's
 * `openQueryTab`, D73), using the same `evidence.sql` `rankNextActions`
 * already attaches to every insight-derived action. An action with no query
 * behind it (a schema fact, `evidence.sql === ''`) has nothing to run, so it
 * stays disabled with a reason rather than opening an empty tab.
 */
function MoreExplorationRow({ action, index }: { action: RankedAction; index: number }) {
  const sql = action.evidence.sql.trim();
  const runnable = sql.length > 0;
  const row = (
    <button
      type="button"
      data-testid={`exploration-more-${index}`}
      disabled={!runnable}
      onClick={() => runnable && openQueryTab({ sql, name: action.verb, autoRun: true })}
      className={`flex w-full items-center justify-between gap-2 rounded-(--radius-md) border px-3 py-2 text-left font-mono text-[length:var(--text-md)] transition-colors ${
        !runnable
          ? 'cursor-not-allowed border-(--color-rule) text-(--color-ink-3) opacity-50'
          : 'border-(--color-rule) text-(--color-ink-2) hover:border-(--color-rule-hi) hover:text-(--color-ink)'
      }`}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="text-(--color-ink-3)">{'>_'}</span>
        {action.verb}
      </span>
      <span aria-hidden="true">→</span>
    </button>
  );
  if (runnable) return row;
  return <Tooltip content="No query behind this suggestion yet">{row}</Tooltip>;
}

interface PeriodOverPeriodTarget {
  table: TableRegistryEntry;
  dateColumn: string;
  metricColumn: string;
}

/** First table offering a Temporal + Quantitative pair — the same shape `querySuggester`'s own "period vs last" task looks for, but computed here by A1's `time_series` rather than a second hand-rolled query (D58). */
function findPeriodOverPeriodTarget(tables: TableRegistryEntry[]): PeriodOverPeriodTarget | null {
  for (const table of tables) {
    const dateColumn = table.columns?.find((c) => c.semanticType === 'Temporal')?.name;
    const metricColumn = table.columns?.find((c) => c.semanticType === 'Quantitative')?.name;
    if (dateColumn && metricColumn) return { table, dateColumn, metricColumn };
  }
  return null;
}

function opResultToQueryResult(outcome: OpResult): QueryResult {
  return {
    columnNames: outcome.schema.map((field) => field.name),
    columnTypes: outcome.schema.map((field) => field.type),
    rows: outcome.rows,
    rowCount: outcome.rowCount,
    executionTimeMs: outcome.elapsedMs,
  };
}

/**
 * Period-over-period in the suggestion set (A2 leaf doc, D53 surface 4) —
 * calls `time_series` directly rather than pre-building its SQL by hand, so
 * this can never drift from what the operation itself computes. Clicking it
 * adopts the result already in hand (Pin's own pattern) instead of re-running
 * the query a second time.
 */
function PeriodOverPeriodRow({ target }: { target: PeriodOverPeriodTarget }) {
  const [outcome, setOutcome] = useState<OpOutcome | null>(null);

  useEffect(() => {
    let cancelled = false;
    analystCore()
      .call('time_series', {
        from: target.table.tableName,
        dateColumn: target.dateColumn,
        grain: 'month',
        metrics: [{ fn: 'sum', column: target.metricColumn }],
      })
      .then((result) => {
        if (!cancelled) setOutcome(result);
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  if (!outcome || isOpError(outcome) || outcome.rows.length === 0 || !outcome.sql) return null;

  const alias = outcome.schema[1]?.name ?? '';
  const deltaIndex = outcome.schema.findIndex((field) => field.name === `${alias}_delta_pct`);
  const gapIndex = outcome.schema.findIndex((field) => field.name === 'is_gap');
  const latest = outcome.rows[outcome.rows.length - 1]!;
  const delta = deltaIndex >= 0 ? (latest[deltaIndex] as number | null) : null;
  const isGap = gapIndex >= 0 ? Boolean(latest[gapIndex]) : false;
  const verb =
    delta !== null && !isGap
      ? `${target.metricColumn} by month — latest ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs. prior period`
      : `${target.metricColumn} by month — period-over-period`;

  return (
    <button
      type="button"
      data-testid="exploration-period-over-period"
      onClick={() =>
        openQueryTab({
          sql: outcome.sql!,
          name: 'Period over period',
          result: opResultToQueryResult(outcome),
          resultSql: outcome.sql!,
        })
      }
      className="flex w-full items-center justify-between gap-2 rounded-(--radius-md) border border-(--color-rule) px-3 py-2 text-left font-mono text-[length:var(--text-md)] text-(--color-ink-2) transition-colors hover:border-(--color-rule-hi) hover:text-(--color-ink)"
    >
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="text-(--color-ink-3)">{'>_'}</span>
        {verb}
      </span>
      <span aria-hidden="true">→</span>
    </button>
  );
}

function SuggestedExplorations({
  tables,
  tableInsights,
}: {
  tables: TableRegistryEntry[];
  tableInsights: TableInsights[] | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const allActions = useMemo(() => rankNextActions(tables, tableInsights ?? []), [tables, tableInsights]);
  const actions = allActions.slice(0, EXPLORATIONS_SHOWN);
  const more = allActions.slice(EXPLORATIONS_SHOWN);
  const periodTarget = useMemo(() => findPeriodOverPeriodTarget(tables), [tables]);

  return (
    <div
      data-testid="suggested-explorations"
      className="flex flex-col gap-2 rounded-(--radius-lg) border border-(--color-rule) bg-(--color-card) p-4"
    >
      <h3 className="font-mono text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.08em] text-(--color-ink-3)">
        Suggested Explorations
      </h3>
      {actions.length === 0 && !periodTarget ? (
        <p className="font-mono text-[length:var(--text-md)] text-(--color-ink-3)">No suggestions yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {actions.map((action: RankedAction, index) => {
            const ready = isDestinationReady(action.module);
            const key = `${action.module}-${action.tab ?? ''}-${index}`;
            const row = (
              <button
                type="button"
                data-testid={`exploration-${action.module}${action.tab ? `-${action.tab}` : ''}`}
                disabled={!ready}
                onClick={() => ready && openDestination(action.module, action.tab, action.prefill.prefilledConfig)}
                className={`flex w-full items-center justify-between gap-2 rounded-(--radius-md) border px-3 py-2 text-left font-mono text-[length:var(--text-md)] transition-colors ${
                  !ready
                    ? 'cursor-not-allowed border-(--color-rule) text-(--color-ink-3) opacity-50'
                    : 'border-(--color-rule) text-(--color-ink-2) hover:border-(--color-rule-hi) hover:text-(--color-ink)'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-(--color-ink-3)">{'>_'}</span>
                  {action.verb}
                </span>
                <span aria-hidden="true">→</span>
              </button>
            );
            if (ready) return <span key={key}>{row}</span>;
            return (
              <Tooltip key={key} content={`Arrives when ${MODULE_LABELS[action.module]} lands in the Workbench`}>
                {row}
              </Tooltip>
            );
          })}
          {periodTarget && <PeriodOverPeriodRow target={periodTarget} />}
        </div>
      )}
      {more.length > 0 && (
        <>
          <button
            type="button"
            data-testid="explorations-view-more"
            onClick={() => setExpanded((value) => !value)}
            className="self-start font-mono text-[length:var(--text-xs)] text-(--color-ink-3) underline-offset-2 hover:text-(--color-ink) hover:underline"
          >
            {expanded ? 'Show fewer' : `View ${more.length} more →`}
          </button>
          {expanded && (
            <div className="flex flex-col gap-1">
              {more.map((action, index) => (
                <MoreExplorationRow key={`${action.module}-${action.tab ?? ''}-${index}`} action={action} index={index} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const FINDINGS_CAP = 5;

function collectByRules(
  tableInsights: TableInsights[] | null,
  rules: InsightRuleId[],
): { table: TableRegistryEntry; insight: InsightCandidate }[] {
  if (!tableInsights) return [];
  return tableInsights
    .flatMap(({ table, insights }) =>
      insights.filter((insight) => rules.includes(insight.rule)).map((insight) => ({ table, insight })),
    )
    .sort((a, b) => scoreOf(b.insight) - scoreOf(a.insight))
    .slice(0, FINDINGS_CAP);
}

function FindingsColumn({
  testId,
  title,
  icon: Icon,
  items,
}: {
  testId: string;
  title: string;
  icon: typeof Activity;
  items: { table: TableRegistryEntry; insight: InsightCandidate }[];
}) {
  return (
    <div data-testid={testId} className="flex flex-col gap-3 rounded-(--radius-lg) border border-(--color-rule) bg-(--color-card) p-4">
      <h3 className="flex items-center gap-2 font-mono text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.08em] text-(--color-ink-3)">
        <Icon size={14} aria-hidden="true" />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="font-mono text-[length:var(--text-md)] text-(--color-ink-3)">No findings yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(({ table, insight }) => (
            <div key={insight.id} className="flex flex-col gap-1 rounded-(--radius-md) border border-(--color-rule-2) bg-(--color-elev) p-3">
              <div className="flex items-center gap-2">
                <span className="rounded bg-(--color-active)/10 px-1.5 py-0.5 font-mono text-[length:var(--text-2xs)] text-(--color-active)">
                  {RULE_LABEL[insight.rule]}
                </span>
                <span className="font-mono text-[length:var(--text-2xs)] text-(--color-ink-3)">{table.tableName}</span>
              </div>
              <p className="text-[length:var(--text-base)] text-(--color-ink-2)">{insight.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STRUCTURAL_RULES: InsightRuleId[] = ['null-pattern', 'id-exclusion', 'concentration'];
const BEHAVIORAL_RULES: InsightRuleId[] = ['change-point', 'outlier-group', 'leakage', 'duplicates'];

interface SynthesisPanelProps {
  tables: TableRegistryEntry[];
  tableInsights: TableInsights[] | null;
  baseline: { headlineFact: FactRef; actions: RankedAction[] } | null;
  /** Non-null only once the D56 edge synthesis upgrade has accepted a replacement headline. */
  headlineFact: FactRef | null;
  paused: boolean;
}

export function SynthesisPanel({ tables, tableInsights, baseline, headlineFact, paused }: SynthesisPanelProps) {
  const headline = headlineFact ?? baseline?.headlineFact ?? null;
  const structural = useMemo(() => collectByRules(tableInsights, STRUCTURAL_RULES), [tableInsights]);
  const behavioral = useMemo(() => collectByRules(tableInsights, BEHAVIORAL_RULES), [tableInsights]);

  return (
    <div data-testid="synthesis-panel" className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <AiSynthesisCard headline={headline} paused={paused} />
        <SuggestedExplorations tables={tables} tableInsights={tableInsights} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FindingsColumn testId="structural-patterns" title="Structural Patterns" icon={Activity} items={structural} />
        <FindingsColumn testId="behavioral-trends" title="Behavioral Trends" icon={TrendingUp} items={behavioral} />
      </div>
    </div>
  );
}
