// Selection-scoped Info panels backed directly by A1's operations (A2, master
// §11.5/§13.3, D74): the column scent's parameterized top-values display and
// its term-frequency panel for textual columns, and the edge scent's join
// coverage. Each renders its own `sql` and a Run action (S4) — never a second,
// separately-computed stat path (D58).
import { useEffect, useState } from 'react';
import { analystCore } from '../../services/analyst';
import { isOpError, type OpOutcome } from '../../lib/analyst/types';
import type { TextUnit } from '../../lib/analyst/operations';
import type { FkEdge } from '../../lib/relationshipInference';
import { RunSqlButton } from '../sql/RunSqlButton';

function PanelHeader({ label, sql }: { label: string; sql: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-[length:var(--text-2xs)] font-semibold tracking-[0.06em] text-(--color-ink-3) uppercase">
        {label}
      </span>
      {sql && <RunSqlButton sql={sql} />}
    </div>
  );
}

function PanelNote({ label, message, tone = 'muted' }: { label: string; message: string; tone?: 'muted' | 'error' }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-(--radius-md) border border-(--color-rule-2) bg-(--color-elev) p-2.5">
      <PanelHeader label={label} sql={null} />
      <p
        role={tone === 'error' ? 'alert' : undefined}
        className={`font-mono text-[length:var(--text-xs)] ${tone === 'error' ? 'text-(--color-error)' : 'text-(--color-ink-3)'}`}
      >
        {message}
      </p>
    </div>
  );
}

/** `buildTopValuesSql`'s parameterized generalization, given its home in Info (A2 leaf doc). */
export function DistinctValuesPanel({ table, column }: { table: string; column: string }) {
  const [outcome, setOutcome] = useState<OpOutcome | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    analystCore()
      .call('distinct_values', { table, column })
      .then((result) => {
        if (cancelled) return;
        setOutcome(result);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [table, column]);

  if (loading) return <PanelNote label="Top values" message="Computing…" />;
  if (!outcome || isOpError(outcome)) {
    return <PanelNote label="Top values" tone="error" message={outcome && isOpError(outcome) ? outcome.message : 'Could not load top values.'} />;
  }
  if (outcome.rows.length === 0) {
    return <PanelNote label="Top values" message="No values to show — every row is null." />;
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-(--radius-md) border border-(--color-rule-2) bg-(--color-elev) p-2.5">
      <PanelHeader label="Top values" sql={outcome.sql} />
      <ul className="flex flex-col gap-1">
        {outcome.rows.map(([value, count, share], i) => (
          <li key={i} className="flex items-center justify-between gap-2 font-mono text-[length:var(--text-xs)]">
            <span className="truncate text-(--color-ink-2)">
              {value === null ? <em className="text-(--color-ink-3)">NULL</em> : String(value)}
            </span>
            <span className="shrink-0 text-(--color-ink-3)">
              {Number(count).toLocaleString()} ({Math.round(Number(share) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TEXT_UNITS: { value: TextUnit; label: string }[] = [
  { value: 'word', label: 'Words' },
  { value: 'bigram', label: 'Bigrams' },
  { value: 'trigram', label: 'Trigrams' },
];
const TEXT_FREQUENCY_TOP = 15;

/** Turns "what do people say in this column" into a computation (A1) rather than a row dump — home: Info, textual columns only. */
export function TextFrequencyPanel({ table, column }: { table: string; column: string }) {
  const [unit, setUnit] = useState<TextUnit>('word');
  const [outcome, setOutcome] = useState<OpOutcome | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    analystCore()
      .call('text_frequency', { table, column, unit, top: TEXT_FREQUENCY_TOP })
      .then((result) => {
        if (cancelled) return;
        setOutcome(result);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [table, column, unit]);

  const sql = outcome && !isOpError(outcome) ? outcome.sql : null;
  const rows = outcome && !isOpError(outcome) ? outcome.rows : [];

  return (
    <div className="flex flex-col gap-1.5 rounded-(--radius-md) border border-(--color-rule-2) bg-(--color-elev) p-2.5">
      <PanelHeader label="Term frequency" sql={sql} />
      <div className="flex gap-1">
        {TEXT_UNITS.map((u) => (
          <button
            key={u.value}
            type="button"
            onClick={() => setUnit(u.value)}
            aria-pressed={unit === u.value}
            className={`rounded-(--radius-xs) px-1.5 py-0.5 font-mono text-[length:var(--text-2xs)] ${
              unit === u.value ? 'bg-(--color-active)/15 text-(--color-active)' : 'text-(--color-ink-3) hover:text-(--color-ink-2)'
            }`}
          >
            {u.label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="font-mono text-[length:var(--text-xs)] text-(--color-ink-3)">Computing…</p>
      ) : !outcome || isOpError(outcome) ? (
        <p role="alert" className="font-mono text-[length:var(--text-xs)] text-(--color-error)">
          {outcome && isOpError(outcome) ? outcome.message : 'Could not compute term frequency.'}
        </p>
      ) : rows.length === 0 ? (
        <p className="font-mono text-[length:var(--text-xs)] text-(--color-ink-3)">No terms found — every value is null or empty.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map(([term, count, , share], i) => (
            <li key={i} className="flex items-center justify-between gap-2 font-mono text-[length:var(--text-xs)]">
              <span className="truncate text-(--color-ink-2)">{String(term)}</span>
              <span className="shrink-0 text-(--color-ink-3)">
                {Number(count).toLocaleString()} ({Math.round(Number(share) * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Matched/unmatched/multiplicity for the selected edge — `on` is always the edge in hand, never re-inferred (A1's join_coverage). */
export function JoinCoveragePanel({ edge }: { edge: FkEdge }) {
  const [outcome, setOutcome] = useState<OpOutcome | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    analystCore()
      .call('join_coverage', {
        left: edge.childTable,
        right: edge.parentTable,
        on: { leftColumn: edge.childColumn, rightColumn: edge.parentColumn },
      })
      .then((result) => {
        if (cancelled) return;
        setOutcome(result);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [edge.childTable, edge.childColumn, edge.parentTable, edge.parentColumn]);

  if (loading) return <PanelNote label="Join coverage" message="Measuring…" />;
  if (!outcome || isOpError(outcome)) {
    return (
      <PanelNote
        label="Join coverage"
        tone="error"
        message={outcome && isOpError(outcome) ? outcome.message : 'Could not measure join coverage.'}
      />
    );
  }

  const [, , , , leftMatched, leftUnmatched, rightMatched, rightUnmatched, multiplicity, , , joinSql] = outcome.rows[0] ?? [];

  return (
    <div className="flex flex-col gap-1.5 rounded-(--radius-md) border border-(--color-rule-2) bg-(--color-elev) p-2.5">
      <PanelHeader label="Join coverage" sql={typeof joinSql === 'string' ? joinSql : null} />
      <span className="self-start rounded-full border border-(--color-rule-hi) px-1.5 py-0.5 font-mono text-[length:var(--text-2xs)] text-(--color-ink-2)">
        {String(multiplicity)}
      </span>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[length:var(--text-xs)]">
        <span className="truncate text-(--color-ink-3)">{edge.childTable}</span>
        <span className="truncate text-(--color-ink-3)">{edge.parentTable}</span>
        <span className="text-(--color-ink-2)">{Number(leftMatched).toLocaleString()} matched</span>
        <span className="text-(--color-ink-2)">{Number(rightMatched).toLocaleString()} matched</span>
        <span className={Number(leftUnmatched) > 0 ? 'text-(--color-active)' : 'text-(--color-ink-3)'}>
          {Number(leftUnmatched).toLocaleString()} unmatched
        </span>
        <span className={Number(rightUnmatched) > 0 ? 'text-(--color-active)' : 'text-(--color-ink-3)'}>
          {Number(rightUnmatched).toLocaleString()} unmatched
        </span>
      </div>
    </div>
  );
}
