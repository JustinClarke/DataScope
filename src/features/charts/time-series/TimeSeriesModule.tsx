import { useMemo, useState } from 'react';
import { useDatasetsStore } from '../../../stores/datasets';
import type { ClassifiedColumn, TableRegistryEntry } from '../../../types';
import { prefillColumns, prefillTableName, type ModulePrefill } from '../../../lib/threadPrefill';
import { TrendView } from './TrendView';
import { PeriodComparisonView } from './PeriodComparisonView';
import { SeasonalityHeatmap } from './SeasonalityHeatmap';

type SubView = 'trend' | 'compare' | 'seasonality';
const SUB_VIEWS: { id: SubView; label: string }[] = [
  { id: 'trend', label: 'Trend' },
  { id: 'compare', label: 'Compare periods' },
  { id: 'seasonality', label: 'Seasonality' },
];

type TimeSeriesTable = TableRegistryEntry & { columns: ClassifiedColumn[] };

function hasTimeSeriesShape(table: TableRegistryEntry): table is TimeSeriesTable {
  if (!Array.isArray(table.columns) || table.columns.length === 0) return false;
  const hasTemporal = table.columns.some((c) => c.semanticType === 'Temporal');
  const hasQuantitative = table.columns.some((c) => c.semanticType === 'Quantitative');
  return hasTemporal && hasQuantitative;
}

/**
 * §10 Module 3, gate `canDoTimeSeries`. The sidebar gates on the pooled
 * broker flag (≥1 Temporal + ≥1 Quantitative across *all* registered
 * tables), so this module re-checks per table — a pathological split (dates
 * in one table, numbers in another, no table with both) is possible in
 * principle and gets a clear message rather than a broken query, same
 * defensive shape `PivotBuilder` uses for its own table list.
 *
 * `prefill` (D68e) opens this "on the answer": a `change-point` finding's
 * `[dateColumn, valueColumn]` pair, or the Action Broker's generic
 * time-series fallback. Read once via lazy `useState` initializers — a plain
 * default of `null` (sidebar-reached, no prefill) is silently indistinguishable
 * from "prefill named a table/column that doesn't exist," and both correctly
 * fall through to the existing first-eligible defaults below.
 */
export function TimeSeriesModule({ prefill = null }: { prefill?: ModulePrefill }) {
  const tables = useDatasetsStore((state) => state.tables);
  const eligibleTables = useMemo(() => tables.filter(hasTimeSeriesShape), [tables]);
  const prefillTable = prefillTableName(prefill);
  const prefillCols = prefillColumns(prefill);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(
    () => eligibleTables.find((t) => t.tableName === prefillTable)?.id ?? null,
  );
  const table = eligibleTables.find((t) => t.id === selectedTableId) ?? eligibleTables[0] ?? null;

  const dateColumns = table ? table.columns.filter((c) => c.semanticType === 'Temporal') : [];
  const numericColumns = table ? table.columns.filter((c) => c.semanticType === 'Quantitative') : [];

  const [dateColumn, setDateColumn] = useState<string | null>(() => prefillCols[0] ?? null);
  const [valueColumn, setValueColumn] = useState<string | null>(() => prefillCols[1] ?? null);
  const [subView, setSubView] = useState<SubView>('trend');

  const activeDateColumn = dateColumns.find((c) => c.name === dateColumn)?.name ?? dateColumns[0]?.name ?? null;
  const activeValueColumn = numericColumns.find((c) => c.name === valueColumn)?.name ?? numericColumns[0]?.name ?? null;

  if (eligibleTables.length === 0) {
    return (
      <p className="text-sm text-(--color-fg-muted)">
        None of your tables have both a date column and a numeric column together — time-series analysis needs both on the same table.
      </p>
    );
  }
  if (!table || !activeDateColumn || !activeValueColumn) return null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-(--color-border) p-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {eligibleTables.length > 1 && (
          <label className="flex items-center gap-1.5 text-(--color-fg-muted)">
            Table
            <select
              aria-label="Time-series table"
              value={table.id}
              onChange={(e) => {
                setSelectedTableId(e.target.value);
                setDateColumn(null);
                setValueColumn(null);
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
          Date column
          <select
            aria-label="Date column"
            value={activeDateColumn}
            onChange={(e) => setDateColumn(e.target.value)}
            className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
          >
            {dateColumns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-(--color-fg-muted)">
          Value column
          <select
            aria-label="Value column"
            value={activeValueColumn}
            onChange={(e) => setValueColumn(e.target.value)}
            className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
          >
            {numericColumns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex overflow-hidden self-start rounded-full border border-(--color-border) text-xs">
        {SUB_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => setSubView(view.id)}
            aria-pressed={subView === view.id}
            className={`px-3 py-1.5 font-medium ${subView === view.id ? 'bg-(--color-accent) text-(--color-accent-fg)' : 'text-(--color-fg-muted)'}`}
          >
            {view.label}
          </button>
        ))}
      </div>

      {subView === 'trend' && <TrendView table={table.tableName} dateColumn={activeDateColumn} valueColumn={activeValueColumn} />}
      {subView === 'compare' && (
        <PeriodComparisonView table={table.tableName} dateColumn={activeDateColumn} valueColumn={activeValueColumn} />
      )}
      {subView === 'seasonality' && (
        <SeasonalityHeatmap table={table.tableName} dateColumn={activeDateColumn} valueColumn={activeValueColumn} />
      )}
    </div>
  );
}
