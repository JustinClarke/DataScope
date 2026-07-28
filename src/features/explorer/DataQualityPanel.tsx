// The rail's Data Quality & Health panel (S2, `14-workspace-streamline/
// 02-data-quality-health.md`) — a dataset-wide, ambient answer to "is this
// data trustworthy?" (README's J2 journey), previously only visible per-table
// and only for `duplicates`. Beneath `TableList` (`ExplorerPanel.tsx`), its
// own independently-scrolling region so a long warnings list never pushes the
// table list off-screen.
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useEducationalPanel } from '../../app/useEducationalPanel';
import {
  loadDatasetQualityReport,
  type DatasetQualityReport,
  type QualityFinding,
  type QualityRuleId,
} from '../../services/dataQuality';
import { RunSqlButton } from '../sql/RunSqlButton';
import type { TableRegistryEntry } from '../../types';

const PASSED_LABEL: Record<QualityRuleId, string> = {
  'null-pattern': 'No significant null concentrations detected.',
  duplicates: 'No duplicate rows detected.',
  'zero-variance': 'No zero-variance columns detected.',
};

function FindingRow({ finding, onShowSql }: { finding: QualityFinding; onShowSql: (label: string, sql: string) => void }) {
  return (
    <li className="flex items-start justify-between gap-2 py-1">
      <span className="text-[length:var(--text-xs)] text-(--color-ink-2)">{finding.description}</span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onShowSql(finding.description, finding.sql)}
          className="text-[length:var(--text-2xs)] text-(--color-accent) hover:underline"
        >
          Show SQL
        </button>
        {/* §13.3's ranked-action routing: a dataset-wide quality finding carrying a
            query runs in the console — where D68e's `duplicates` insight lands now
            that the standalone SQL page is gone. */}
        <RunSqlButton sql={finding.sql} />
      </div>
    </li>
  );
}

interface DataQualityPanelProps {
  tables: TableRegistryEntry[];
}

/**
 * Expanded by default — this is an ambient health signal, meant to be seen —
 * collapsible only so a long warnings list doesn't dominate a narrow rail.
 */
export function DataQualityPanel({ tables }: DataQualityPanelProps) {
  const { setContent } = useEducationalPanel();
  const [expanded, setExpanded] = useState(true);
  const [report, setReport] = useState<DatasetQualityReport | null>(null);

  useEffect(() => {
    if (tables.length === 0) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setReport(null);
    void loadDatasetQualityReport(tables).then((result) => {
      if (!cancelled) setReport(result);
    });
    return () => {
      cancelled = true;
    };
  }, [tables]);

  if (tables.length === 0) return null;

  const handleShowSql = (label: string, sql: string) => {
    setContent(
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-(--color-fg)">{label}</p>
        <pre className="overflow-x-auto rounded bg-(--color-border)/40 p-3 font-mono text-xs text-(--color-fg)">{sql}</pre>
      </div>,
    );
  };

  return (
    <div data-testid="data-quality-panel" className="flex max-h-[40%] shrink-0 flex-col overflow-y-auto border-t border-(--color-rule-2)">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="sticky top-0 z-10 flex items-center gap-2 border-b border-(--color-rule-2) bg-(--color-panel) px-4 py-2"
      >
        {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        <ShieldAlert size={14} aria-hidden="true" className="text-(--color-ink-3)" />
        <span className="micro text-(--color-ink-3)">Data Quality &amp; Health</span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-3 px-4 py-2">
          {report === null ? (
            <p className="text-[length:var(--text-xs)] text-(--color-ink-3)">Checking data quality…</p>
          ) : (
            <>
              {report.warnings.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-(--color-warn)">
                    <ShieldAlert size={12} aria-hidden="true" />
                    <span className="text-[length:var(--text-2xs)] font-medium uppercase tracking-[0.08em]">Quality Warnings</span>
                  </div>
                  <ul data-testid="quality-warnings" className="flex flex-col divide-y divide-(--color-rule-2)">
                    {report.warnings.map((finding) => (
                      <FindingRow key={finding.id} finding={finding} onShowSql={handleShowSql} />
                    ))}
                  </ul>
                </div>
              )}
              {report.passedRules.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-(--color-ok)">
                    <ShieldCheck size={12} aria-hidden="true" />
                    <span className="text-[length:var(--text-2xs)] font-medium uppercase tracking-[0.08em]">Health Checks Passed</span>
                  </div>
                  <ul data-testid="quality-passed" className="flex flex-col gap-1">
                    {report.passedRules.map((rule) => (
                      <li key={rule} className="text-[length:var(--text-xs)] text-(--color-ink-2)">
                        {PASSED_LABEL[rule]}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
