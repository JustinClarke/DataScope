import { RunSqlButton } from '../../sql/RunSqlButton';
import type { InsightRuleId } from '../../../lib/insights';

const RULE_LABEL: Record<InsightRuleId, string> = {
  concentration: 'Concentration',
  'change-point': 'Change point',
  'outlier-group': 'Outlier group',
  'null-pattern': 'Null pattern',
  duplicates: 'Duplicates',
  leakage: 'Leakage flag',
  'id-exclusion': 'ID exclusion',
  'zero-variance': 'Zero variance',
};

export interface TopInsightRowProps {
  tableName: string;
  description: string;
  rule: InsightRuleId;
  sql: string;
}

export interface TopInsightsProps {
  insights: TopInsightRowProps[];
}

/** The fuller ranked insight band, below the fold (§13.1, D10) — across every table, not just the active one. */
export function TopInsights({ insights, onShowSql }: TopInsightsProps & { onShowSql: (label: string, sql: string) => void }) {
  if (insights.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-(--color-fg-muted)">Top insights</h2>
      <div className="flex flex-col gap-3">
        {insights.map((insight, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-lg border border-(--color-border) p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-(--color-accent)/10 px-1.5 py-0.5 text-xs font-medium text-(--color-accent)">
                  {RULE_LABEL[insight.rule]}
                </span>
                <span className="font-mono text-xs text-(--color-fg-muted)">{insight.tableName}</span>
              </div>
              {insight.sql && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onShowSql(RULE_LABEL[insight.rule], insight.sql)}
                    className="text-xs text-(--color-accent) hover:underline"
                  >
                    Show SQL
                  </button>
                  <RunSqlButton sql={insight.sql} />
                </div>
              )}
            </div>
            <p className="text-sm text-(--color-fg)">{insight.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
