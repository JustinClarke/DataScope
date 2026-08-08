import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useDatasetsStore } from "../../../stores/datasets";
import type {
  ClassifiedColumn,
  QueryResult,
  TableRegistryEntry,
} from "../../../types";
import {
  prefillColumns,
  prefillTableName,
  type ModulePrefill,
} from "../../../lib/threadPrefill";
import { runChartQuery } from "../../../services/charts";
import {
  buildCategorySummarySql,
  buildFrequencySql,
  lumpTail,
  parseFrequency,
  type FrequencyRow,
} from "../../../lib/categoricalSql";
import { GeneratedSql } from "./GeneratedSql";

// Recharts rides in its own chunk, same lazy boundary GroupedBarView/TrendView use.
const FrequencyBar = lazy(() => import("./FrequencyBar"));
const Donut = lazy(() => import("./Donut"));
const GroupedBarView = lazy(() =>
  import("./GroupedBarView").then((m) => ({ default: m.GroupedBarView })),
);

type CategoricalTable = TableRegistryEntry & { columns: ClassifiedColumn[] };

/**
 * The sidebar gates on the pooled broker flag (≥1 Categorical across *all*
 * registered tables), so — same defensive shape `TimeSeriesModule`/
 * `CorrelationModule`/`DistributionModule` already use for their own table
 * lists — this module re-checks per table.
 */
function hasCategoricalShape(
  table: TableRegistryEntry,
): table is CategoricalTable {
  if (!Array.isArray(table.columns)) return false;
  return table.columns.some((c) => c.semanticType === "Categorical");
}

type ViewTab = "frequency" | "donut" | "grouped";

// A donut past this many real categories reads as a sliver farm, not a
// breakdown — the tab itself is only offered under this cardinality, same
// "reactively cap, no extra round trip" shape PivotBuilder's own top-N cap
// uses off a column's already-classified `cardinality`.
const DONUT_CARDINALITY_LIMIT = 15;
// Even under that offer-limit, cap visible slices and lump the remainder — at
// the palette's four categorical slots plus "Other" (design.md § Chart palette),
// so e.g. 15 distinct categories renders four wedges and one lumped tail rather
// than repeating a hue and claiming two categories are the same.
export const DONUT_MAX_SLICES = 5;
const RUN_DEBOUNCE_MS = 300;

const chartFallback = (
  <div className="flex h-48 items-center justify-center text-sm text-(--color-fg-muted)">
    Loading chart…
  </div>
);

/**
 * §10 Module 6 — frequency bar, donut, and grouped-bar views for one
 * categorical column, alone or against a quantitative measure. `prefill`
 * (D68e) is `[category, measure]` from a `concentration`/`outlier-group`
 * finding, or the Action Broker's generic fallback (category only). When a
 * measure is named, the module opens straight on the **Grouped bar** view —
 * that pairing *is* the finding those two rules describe, not the frequency
 * count Frequency alone would show.
 */
export function CategoricalModule({
  prefill = null,
}: {
  prefill?: ModulePrefill;
}) {
  const tables = useDatasetsStore((state) => state.tables);
  const eligibleTables = useMemo(
    () => tables.filter(hasCategoricalShape),
    [tables],
  );
  const prefillTable = prefillTableName(prefill);
  const prefillCols = prefillColumns(prefill);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(
    () => eligibleTables.find((t) => t.tableName === prefillTable)?.id ?? null,
  );
  const table =
    eligibleTables.find((t) => t.id === selectedTableId) ??
    eligibleTables[0] ??
    null;

  const categoricalColumns = useMemo(
    () =>
      table
        ? table.columns.filter((c) => c.semanticType === "Categorical")
        : [],
    [table],
  );
  const numericColumns = useMemo(
    () =>
      table
        ? table.columns.filter((c) => c.semanticType === "Quantitative")
        : [],
    [table],
  );

  const [selectedColumn, setSelectedColumn] = useState<string | null>(
    () => prefillCols[0] ?? null,
  );
  const activeColumn =
    categoricalColumns.find((c) => c.name === selectedColumn) ??
    categoricalColumns[0] ??
    null;

  const [selectedQuantColumn, setSelectedQuantColumn] = useState<string | null>(
    () => prefillCols[1] ?? null,
  );
  const activeQuantColumn =
    numericColumns.find((c) => c.name === selectedQuantColumn) ??
    numericColumns[0] ??
    null;

  const [aggregate, setAggregate] = useState<"total" | "mean">("mean");
  const [tab, setTab] = useState<ViewTab>(() =>
    prefillCols[1] ? "grouped" : "frequency",
  );

  const donutEligible =
    activeColumn !== null &&
    activeColumn.cardinality <= DONUT_CARDINALITY_LIMIT;

  const [frequencyRows, setFrequencyRows] = useState<FrequencyRow[]>([]);
  const [frequencySql, setFrequencySql] = useState("");
  const [groupedResult, setGroupedResult] = useState<QueryResult | null>(null);
  const [groupedSql, setGroupedSql] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!table || !activeColumn) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const freqSql = buildFrequencySql(table.tableName, activeColumn.name);
        const grpSql = activeQuantColumn
          ? buildCategorySummarySql(
              table.tableName,
              activeColumn.name,
              activeQuantColumn.name,
            )
          : null;

        const [freqResult, grpResult] = await Promise.all([
          runChartQuery(freqSql),
          grpSql ? runChartQuery(grpSql) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        setFrequencyRows(parseFrequency(freqResult));
        setFrequencySql(freqSql);
        setGroupedResult(grpResult);
        setGroupedSql(grpSql ?? "");
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Could not run the categorical queries.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, RUN_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table?.tableName, activeColumn?.name, activeQuantColumn?.name]);

  if (eligibleTables.length === 0) {
    return (
      <p className="text-sm text-(--color-fg-muted)">
        None of your tables have a categorical column — breakdown needs at least
        one.
      </p>
    );
  }
  if (!table || !activeColumn) return null;

  const donutRows = lumpTail(frequencyRows, DONUT_MAX_SLICES);
  const tabClass = (active: boolean) =>
    `px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 ${
      active
        ? "border-b-2 border-(--color-accent) text-(--color-fg)"
        : "text-(--color-fg-muted)"
    }`;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-(--color-border) p-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {eligibleTables.length > 1 && (
          <label className="flex items-center gap-1.5 text-(--color-fg-muted)">
            Table
            <select
              aria-label="Categorical table"
              value={table.id}
              onChange={(e) => {
                setSelectedTableId(e.target.value);
                setSelectedColumn(null);
                setSelectedQuantColumn(null);
              }}
              className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
            >
              {eligibleTables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tableName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5 text-(--color-fg-muted)">
          Column
          <select
            aria-label="Categorical column"
            value={activeColumn.name}
            onChange={(e) => setSelectedColumn(e.target.value)}
            className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
          >
            {categoricalColumns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-1 border-b border-(--color-border) text-xs">
        <button
          type="button"
          onClick={() => setTab("frequency")}
          aria-pressed={tab === "frequency"}
          className={tabClass(tab === "frequency")}
        >
          Frequency
        </button>
        <button
          type="button"
          onClick={() => donutEligible && setTab("donut")}
          aria-pressed={tab === "donut"}
          disabled={!donutEligible}
          title={
            donutEligible
              ? undefined
              : `Too many categories for a donut (${activeColumn.cardinality})`
          }
          className={tabClass(tab === "donut")}
        >
          Donut
        </button>
        <button
          type="button"
          onClick={() => numericColumns.length > 0 && setTab("grouped")}
          aria-pressed={tab === "grouped"}
          disabled={numericColumns.length === 0}
          title={
            numericColumns.length > 0 ? undefined : "Needs a numeric column"
          }
          className={tabClass(tab === "grouped")}
        >
          Grouped bar
        </button>
      </div>

      {tab === "grouped" && activeQuantColumn && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-(--color-fg-muted)">
            Measure
            <select
              aria-label="Grouped bar measure"
              value={activeQuantColumn.name}
              onChange={(e) => setSelectedQuantColumn(e.target.value)}
              className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
            >
              {numericColumns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-(--color-fg-muted)">
            Aggregate
            <select
              aria-label="Grouped bar aggregate"
              value={aggregate}
              onChange={(e) => setAggregate(e.target.value as "total" | "mean")}
              className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
            >
              <option value="mean">Average</option>
              <option value="total">Sum</option>
            </select>
          </label>
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-(--color-fg-muted)">
          Running query…
        </div>
      ) : error ? (
        <p className="text-sm text-(--color-error)">{error}</p>
      ) : (
        <>
          <Suspense fallback={chartFallback}>
            {tab === "frequency" &&
              (frequencyRows.length > 0 ? (
                <FrequencyBar rows={frequencyRows} />
              ) : (
                <p className="text-sm text-(--color-fg-muted)">
                  No values in {activeColumn.name} to chart.
                </p>
              ))}
            {tab === "donut" &&
              (donutRows.length > 0 ? (
                <Donut rows={donutRows} />
              ) : (
                <p className="text-sm text-(--color-fg-muted)">
                  No values in {activeColumn.name} to chart.
                </p>
              ))}
            {tab === "grouped" &&
              (groupedResult && activeQuantColumn ? (
                <GroupedBarView
                  result={groupedResult}
                  catColumn={activeColumn.name}
                  quantColumn={activeQuantColumn.name}
                  aggregate={aggregate}
                />
              ) : (
                <p className="text-sm text-(--color-fg-muted)">
                  Pick a numeric column to group by {activeColumn.name}.
                </p>
              ))}
          </Suspense>

          <div className="flex flex-col gap-3 border-t border-(--color-border) pt-4">
            <GeneratedSql
              label={tab === "grouped" ? "Grouped bar" : "Frequency"}
              sql={tab === "grouped" ? groupedSql : frequencySql}
            />
          </div>
        </>
      )}
    </div>
  );
}
