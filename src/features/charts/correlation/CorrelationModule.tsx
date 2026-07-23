import { useEffect, useMemo, useRef, useState } from 'react';
import { useDatasetsStore } from '../../../stores/datasets';
import type { ClassifiedColumn, TableRegistryEntry } from '../../../types';
import { runChartQuery } from '../../../services/charts';
import { buildCorrelationMatrixSql, parseCorrelationMatrix, type CorrelationMatrix } from '../../../lib/correlationSql';
import { useThreadPrefill } from '../../../hooks/useThreadPrefill';
import { prefillColumns, prefillTableName } from '../../../lib/threadPrefill';
import { CorrelationHeatmap } from './CorrelationHeatmap';
import { ScatterDrillThrough } from './ScatterDrillThrough';
import { GeneratedSql } from './GeneratedSql';

type CorrelationTable = TableRegistryEntry & { columns: ClassifiedColumn[] };

/**
 * The sidebar gates on the pooled broker flag (≥2 Quantitative across *all*
 * registered tables), so — same defensive shape `TimeSeriesModule`/
 * `PivotBuilder` already use for their own table lists — this module
 * re-checks per table: a pathological split (one numeric column per table,
 * none with two) could satisfy the pooled gate with no single table actually
 * correlatable.
 */
function hasCorrelationShape(table: TableRegistryEntry): table is CorrelationTable {
  if (!Array.isArray(table.columns)) return false;
  return table.columns.filter((c) => c.semanticType === 'Quantitative').length >= 2;
}

/**
 * `prefill` (D68e) is a `leakage` finding's `[columnA, columnB]` pair (the
 * generic correlation fallback names no pair — see `capabilities.ts` — so
 * it just lands on the default table). Applied once, the first time this
 * table's matrix loads, so it survives the mount effect's own
 * `setSelectedPair(null)` reset below; a pair that doesn't actually appear
 * in this matrix (a stale/mismatched prefill) silently no-ops rather than
 * pointing the drill-through at a nonexistent column.
 */
export function CorrelationModule() {
  const tables = useDatasetsStore((state) => state.tables);
  const eligibleTables = useMemo(() => tables.filter(hasCorrelationShape), [tables]);
  const prefill = useThreadPrefill();
  const prefillTable = prefillTableName(prefill);
  const prefillPair = prefillColumns(prefill);
  const appliedPrefillPair = useRef(false);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(
    () => eligibleTables.find((t) => t.tableName === prefillTable)?.id ?? null,
  );
  const table = eligibleTables.find((t) => t.id === selectedTableId) ?? eligibleTables[0] ?? null;
  const numericColumns = useMemo(
    () => (table ? table.columns.filter((c) => c.semanticType === 'Quantitative') : []),
    [table],
  );

  const [matrix, setMatrix] = useState<CorrelationMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPair, setSelectedPair] = useState<[string, string] | null>(null);

  const sql = table ? buildCorrelationMatrixSql(table.tableName, numericColumns.map((c) => c.name)) : null;

  useEffect(() => {
    setSelectedPair(null);
    if (!table || !sql) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    runChartQuery(sql)
      .then((r) => {
        if (cancelled) return;
        const parsed = parseCorrelationMatrix(r, numericColumns.map((c) => c.name));
        setMatrix(parsed);
        if (!appliedPrefillPair.current && prefillPair.length === 2) {
          appliedPrefillPair.current = true;
          const [a, b] = prefillPair;
          if (parsed.columns.includes(a) && parsed.columns.includes(b)) setSelectedPair([a, b]);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not run the correlation query.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sql]);

  if (eligibleTables.length === 0) {
    return (
      <p className="text-sm text-(--color-fg-muted)">
        None of your tables have 2 or more numeric columns — correlation needs at least two on the same table.
      </p>
    );
  }
  if (!table || !sql) return null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-(--color-border) p-4">
      {eligibleTables.length > 1 && (
        <label className="flex items-center gap-1.5 text-xs text-(--color-fg-muted)">
          Table
          <select
            aria-label="Correlation table"
            value={table.id}
            onChange={(e) => setSelectedTableId(e.target.value)}
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

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-(--color-fg-muted)">Running query…</div>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : matrix ? (
        <>
          <CorrelationHeatmap matrix={matrix} selectedPair={selectedPair} onCellClick={(a, b) => setSelectedPair([a, b])} />
          <GeneratedSql sql={sql} />
          {selectedPair && (
            <div className="flex flex-col gap-2 border-t border-(--color-border) pt-4">
              <span className="text-xs font-medium text-(--color-fg-muted)">
                {selectedPair[0]} vs {selectedPair[1]}
              </span>
              <ScatterDrillThrough table={table.tableName} columnA={selectedPair[0]} columnB={selectedPair[1]} />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
