import { useEffect, useMemo, useState } from 'react';
import { useDatasetsStore } from '../../../stores/datasets';
import type { ClassifiedColumn, TableRegistryEntry } from '../../../types';
import { prefillColumns, prefillTableName, type ModulePrefill } from '../../../lib/threadPrefill';
import { runChartQuery } from '../../../services/charts';
import { buildHistogramSql, parseHistogram, type HistogramBucket } from '../../../lib/columnStats';
import {
  buildMomentsSql,
  buildOutliersSql,
  buildQuartilesSql,
  buildWhiskersSql,
  computeIqrBounds,
  parseMoments,
  parseOutliers,
  parseQuartiles,
  parseWhiskers,
  type BoxPlotStats,
  type DistributionMoments,
} from '../../../lib/distributionSql';
import { Histogram } from './Histogram';
import { BoxPlot } from './BoxPlot';
import { StatsPanel } from './StatsPanel';
import { GeneratedSql } from './GeneratedSql';

type DistributionTable = TableRegistryEntry & { columns: ClassifiedColumn[] };

/**
 * The sidebar gates on the pooled broker flag (≥1 Quantitative across *all*
 * registered tables), so — same defensive shape `TimeSeriesModule`/
 * `CorrelationModule` already use for their own table lists — this module
 * re-checks per table.
 */
function hasDistributionShape(table: TableRegistryEntry): table is DistributionTable {
  if (!Array.isArray(table.columns)) return false;
  return table.columns.some((c) => c.semanticType === 'Quantitative');
}

const BIN_COUNTS = [5, 10, 20, 30] as const;
const RUN_DEBOUNCE_MS = 300;

interface SqlBlock {
  label: string;
  sql: string;
}

/**
 * §10 Module 5 — histogram, box plot, and descriptive-stats panel for one
 * numeric column at a time. `prefill` (D68e) is the Action Broker's generic
 * distribution fallback (no insight rule routes here directly) naming a
 * table/column; a bad or absent name falls through to the existing
 * first-eligible defaults below, same as a plain sidebar-reached open.
 */
export function DistributionModule({ prefill = null }: { prefill?: ModulePrefill }) {
  const tables = useDatasetsStore((state) => state.tables);
  const eligibleTables = useMemo(() => tables.filter(hasDistributionShape), [tables]);
  const prefillTable = prefillTableName(prefill);
  const prefillCols = prefillColumns(prefill);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(
    () => eligibleTables.find((t) => t.tableName === prefillTable)?.id ?? null,
  );
  const table = eligibleTables.find((t) => t.id === selectedTableId) ?? eligibleTables[0] ?? null;
  const numericColumns = useMemo(
    () => (table ? table.columns.filter((c) => c.semanticType === 'Quantitative') : []),
    [table],
  );

  const [selectedColumn, setSelectedColumn] = useState<string | null>(() => prefillCols[0] ?? null);
  const activeColumn = numericColumns.find((c) => c.name === selectedColumn) ?? numericColumns[0] ?? null;
  const [binCount, setBinCount] = useState<number>(10);

  const [histogram, setHistogram] = useState<HistogramBucket[] | null>(null);
  const [boxPlot, setBoxPlot] = useState<BoxPlotStats | null>(null);
  const [moments, setMoments] = useState<DistributionMoments | null>(null);
  const [sqlBlocks, setSqlBlocks] = useState<SqlBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!table || !activeColumn) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const min = Number(activeColumn.min);
        const max = Number(activeColumn.max);
        const histogramSql = buildHistogramSql(table.tableName, activeColumn.name, min, max, binCount);
        const quartilesSql = buildQuartilesSql(table.tableName, activeColumn.name);
        const momentsSql = buildMomentsSql(table.tableName, activeColumn.name);

        const [histogramResult, quartilesResult, momentsResult] = await Promise.all([
          histogramSql ? runChartQuery(histogramSql) : Promise.resolve(null),
          runChartQuery(quartilesSql),
          runChartQuery(momentsSql),
        ]);
        if (cancelled) return;

        const blocks: SqlBlock[] = [];
        if (histogramSql) blocks.push({ label: 'Histogram', sql: histogramSql });
        blocks.push({ label: 'Quartiles', sql: quartilesSql });

        let box: BoxPlotStats | null = null;
        const quartiles = parseQuartiles(quartilesResult);
        if (quartiles) {
          const bounds = computeIqrBounds(quartiles);
          const whiskersSql = buildWhiskersSql(table.tableName, activeColumn.name, bounds);
          const outliersSql = buildOutliersSql(table.tableName, activeColumn.name, bounds);
          const [whiskersResult, outliersResult] = await Promise.all([
            runChartQuery(whiskersSql),
            runChartQuery(outliersSql),
          ]);
          if (cancelled) return;
          blocks.push({ label: 'Whiskers', sql: whiskersSql }, { label: 'Outliers', sql: outliersSql });

          const whiskers = parseWhiskers(whiskersResult);
          if (whiskers) {
            box = {
              q1: quartiles.q1,
              median: quartiles.median,
              q3: quartiles.q3,
              whiskerLow: whiskers.low,
              whiskerHigh: whiskers.high,
              outliers: parseOutliers(outliersResult),
            };
          }
        }
        blocks.push({ label: 'Descriptive statistics', sql: momentsSql });

        setHistogram(histogramResult ? parseHistogram(histogramResult, min, max, binCount) : null);
        setBoxPlot(box);
        setMoments(parseMoments(momentsResult));
        setSqlBlocks(blocks);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not run the distribution queries.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, RUN_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table?.tableName, activeColumn?.name, binCount]);

  if (eligibleTables.length === 0) {
    return (
      <p className="text-sm text-(--color-fg-muted)">
        None of your tables have a numeric column — distribution analysis needs at least one.
      </p>
    );
  }
  if (!table || !activeColumn) return null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-(--color-border) p-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {eligibleTables.length > 1 && (
          <label className="flex items-center gap-1.5 text-(--color-fg-muted)">
            Table
            <select
              aria-label="Distribution table"
              value={table.id}
              onChange={(e) => {
                setSelectedTableId(e.target.value);
                setSelectedColumn(null);
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
            aria-label="Distribution column"
            value={activeColumn.name}
            onChange={(e) => setSelectedColumn(e.target.value)}
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
          Bins
          <select
            aria-label="Bin count"
            value={binCount}
            onChange={(e) => setBinCount(Number(e.target.value))}
            className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
          >
            {BIN_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n} bins
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-(--color-fg-muted)">Running query…</div>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-(--color-fg-muted)">Histogram</span>
            {histogram ? (
              <Histogram buckets={histogram} />
            ) : (
              <p className="text-sm text-(--color-fg-muted)">Not enough variation in {activeColumn.name} to bin.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-(--color-fg-muted)">Box plot</span>
            {boxPlot ? (
              <BoxPlot stats={boxPlot} />
            ) : (
              <p className="text-sm text-(--color-fg-muted)">Not enough data in {activeColumn.name} to plot.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-(--color-fg-muted)">Descriptive statistics</span>
            {moments && <StatsPanel moments={moments} />}
          </div>

          <div className="flex flex-col gap-3 border-t border-(--color-border) pt-4">
            {sqlBlocks.map((block) => (
              <GeneratedSql key={block.label} label={block.label} sql={block.sql} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
