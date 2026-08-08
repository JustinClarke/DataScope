import { useEffect, useState } from "react";
import { KpiCard } from "../../../components/charts/KpiCard";
import { runChartQuery } from "../../../services/charts";
import {
  buildPeriodComparisonSql,
  parsePeriodComparison,
  type PeriodComparison,
  type TimeSeriesAggregate,
  type TimeSeriesGranularity,
} from "../../../lib/timeSeriesSql";
import { GeneratedSql } from "./GeneratedSql";

const GRANULARITIES: TimeSeriesGranularity[] = [
  "day",
  "week",
  "month",
  "quarter",
  "year",
];
const AGGREGATES: TimeSeriesAggregate[] = ["avg", "sum", "min", "max", "count"];

function formatValue(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

interface PeriodComparisonViewProps {
  table: string;
  dateColumn: string;
  valueColumn: string;
}

/** "This period vs last" (§10 Module 3) — the two most recent periods actually present in the data, not the calendar's literal current month. */
export function PeriodComparisonView({
  table,
  dateColumn,
  valueColumn,
}: PeriodComparisonViewProps) {
  const [granularity, setGranularity] =
    useState<TimeSeriesGranularity>("month");
  const [aggregate, setAggregate] = useState<TimeSeriesAggregate>("avg");

  const [comparison, setComparison] = useState<PeriodComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sql = buildPeriodComparisonSql({
    table,
    dateColumn,
    valueColumn,
    granularity,
    aggregate,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    runChartQuery(sql)
      .then((r) => {
        if (!cancelled) setComparison(parsePeriodComparison(r));
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Could not run the comparison query.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sql]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5 text-(--color-fg-muted)">
          Period
          <select
            aria-label="Comparison period"
            value={granularity}
            onChange={(e) =>
              setGranularity(e.target.value as TimeSeriesGranularity)
            }
            className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
          >
            {GRANULARITIES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-(--color-fg-muted)">
          Aggregate
          <select
            aria-label="Comparison aggregate"
            value={aggregate}
            onChange={(e) =>
              setAggregate(e.target.value as TimeSeriesAggregate)
            }
            className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
          >
            {AGGREGATES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-(--color-fg-muted)">Running query…</p>
      ) : error ? (
        <p className="text-sm text-(--color-error)">{error}</p>
      ) : !comparison ? (
        <p className="text-sm text-(--color-fg-muted)">
          No rows for this table.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <KpiCard
            label={`Latest ${granularity}`}
            value={formatValue(comparison.currentValue)}
          />
          {comparison.priorValue !== null ? (
            <>
              <KpiCard
                label={`Prior ${granularity}`}
                value={formatValue(comparison.priorValue)}
              />
              <span
                className={`text-sm font-medium ${
                  comparison.deltaPct === null
                    ? "text-(--color-fg-muted)"
                    : comparison.deltaPct >= 0
                      ? "text-(--color-ok)"
                      : "text-(--color-error)"
                }`}
              >
                {comparison.deltaPct === null
                  ? "No prior-period comparison available"
                  : `${comparison.deltaPct >= 0 ? "+" : ""}${comparison.deltaPct.toFixed(1)}%`}
              </span>
            </>
          ) : (
            <span className="text-sm text-(--color-fg-muted)">
              Only one {granularity} of data — nothing to compare against.
            </span>
          )}
        </div>
      )}

      <GeneratedSql sql={sql} />
    </div>
  );
}
