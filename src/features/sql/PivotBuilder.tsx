import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useDatasetsStore } from '../../stores/datasets';
import { useQueryStore, PIVOT_SESSION } from '../../stores/query';
import { runQuery } from '../../services/sql';
import { copySql } from './resultsExport';
import {
  buildPivotSql,
  pivotOutputColumns,
  type PivotAggregate,
  type PivotSpec,
  type PivotValueField,
} from '../../lib/pivotCompiler';
import { useThreadPrefill } from '../../hooks/useThreadPrefill';
import { prefillColumns, prefillTableName, type ModulePrefill } from '../../lib/threadPrefill';
import type { ClassifiedColumn, TableRegistryEntry } from '../../types';

type WellKind = 'rows' | 'columns' | 'values';
type Mode = 'builder' | 'guided';

const AGGREGATES: PivotAggregate[] = ['sum', 'avg', 'count', 'min', 'max'];
// Above this many distinct values a grouping field is capped to its top values
// (ranked by the first value field's aggregate, or row count) with a "Show
// all" affordance — cardinality is already known from classification
// (03-capability-engine), so this needs no extra discovery query.
const DEFAULT_TOP_N = 20;
const RUN_DEBOUNCE_MS = 300;

function dragPayload(field: string, from: WellKind | 'available'): string {
  return JSON.stringify({ field, from });
}

function parseDragPayload(raw: string): { field: string; from: WellKind | 'available' } | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.field === 'string' && typeof parsed?.from === 'string') return parsed;
  } catch {
    // Not a payload this drop target understands (e.g. a stray external drag).
  }
  return null;
}

function FieldChip({ name, onRemove, from, extra }: { name: string; onRemove: () => void; from: WellKind; extra?: ReactNode }) {
  return (
    <div
      draggable
      onDragStart={(event: DragEvent<HTMLDivElement>) => event.dataTransfer.setData('application/json', dragPayload(name, from))}
      className="flex items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-border)/40 py-1 pl-2.5 pr-1.5 text-xs"
    >
      <span className="cursor-grab font-medium text-(--color-fg)">{name}</span>
      {extra}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="rounded-full p-0.5 text-(--color-fg-muted) hover:text-(--color-fg)"
      >
        <X size={10} aria-hidden="true" />
      </button>
    </div>
  );
}

interface WellProps {
  label: string;
  kind: WellKind;
  fields: string[];
  onDropField: (field: string, from: WellKind | 'available') => void;
  onRemoveField: (field: string) => void;
  renderExtra?: (field: string) => ReactNode;
}

function Well({ label, kind, fields, onDropField, onRemoveField, renderExtra }: WellProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const payload = parseDragPayload(event.dataTransfer.getData('application/json'));
    if (payload) onDropField(payload.field, payload.from);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-xs font-medium text-(--color-fg-muted)">{label}</span>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        data-testid={`well-${kind}`}
        className={`flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border-2 border-dashed p-2 transition-colors ${
          isDragOver ? 'border-(--color-accent) bg-(--color-accent)/5' : 'border-(--color-border)'
        }`}
      >
        {fields.length === 0 && <span className="text-xs text-(--color-fg-muted)">Drag or add a field</span>}
        {fields.map((field) => (
          <FieldChip key={field} name={field} from={kind} onRemove={() => onRemoveField(field)} extra={renderExtra?.(field)} />
        ))}
      </div>
    </div>
  );
}

/**
 * The no-SQL pivot/cross-tab builder (§10 Module 7, D53): drag (or click-add)
 * fields into rows/columns/values wells, compile via `lib/pivotCompiler.ts`
 * (pure), and run the result through the ordinary `runQuery` path — it lands
 * in the query store exactly like a hand-typed SELECT, so SqlModule's
 * existing Results grid, History, and `AutoChartPanel` render it with no new
 * display code (D49: no new execution path). Renders nothing without a
 * classified table, matching `QuerySuggestions.tsx`'s early-return
 * convention.
 *
 * `prefill` (D68e) — no live route names `module: 'pivot'` today (master
 * §"Thread pre-configuration" lists Pivot among the six modules regardless,
 * for contract completeness and the v0.5+ AI producer), so this consumption
 * is exercised by tests, not yet by a real ranked action. A named column is
 * classified the same way `addToWell` already classifies a manually-added
 * one — Quantitative goes to Values (summed by default), everything else to
 * Rows — rather than guessing at rows/columns/values placement.
 */
interface PivotBuilderProps {
  /** The Workbench tab's own initializer (W7.5) — see `useThreadPrefill`'s `override` doc. */
  prefill?: ModulePrefill;
}

export function PivotBuilder({ prefill: prefillOverride }: PivotBuilderProps = {}) {
  const tables = useDatasetsStore((state) => state.tables);
  const classifiedTables = useMemo(() => tables.filter((t): t is TableRegistryEntry & { columns: ClassifiedColumn[] } => Array.isArray(t.columns) && t.columns.length > 0), [tables]);
  const prefill = useThreadPrefill(prefillOverride);
  const prefillTable = prefillTableName(prefill);
  const prefillFields = prefillColumns(prefill);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(
    () => classifiedTables.find((t) => t.tableName === prefillTable)?.id ?? null,
  );
  const table = classifiedTables.find((t) => t.id === selectedTableId) ?? classifiedTables[0] ?? null;

  const isPrefillValueField = (field: string): boolean =>
    table?.columns.find((c) => c.name === field)?.semanticType === 'Quantitative';

  const [mode, setMode] = useState<Mode>('builder');
  const [rows, setRows] = useState<string[]>(() => prefillFields.filter((f) => !isPrefillValueField(f)));
  const [columns, setColumns] = useState<string[]>([]);
  const [values, setValues] = useState<PivotValueField[]>(() =>
    prefillFields.filter(isPrefillValueField).map((field) => ({ field, aggregate: 'sum' as PivotAggregate })),
  );
  // Guided mode's own select slots — kept separate from `rows` so an
  // in-progress empty slot (a select the user hasn't picked a field for yet)
  // never leaks a placeholder `''` into the compiled spec. Committed into
  // `rows` on every change via `commitGuidedRows`.
  const [guidedRows, setGuidedRows] = useState<string[]>(rows.length > 0 ? rows : ['']);
  const [subtotals, setSubtotals] = useState(false);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const resetFields = () => {
    setRows([]);
    setColumns([]);
    setValues([]);
    setGuidedRows(['']);
    setExpandedFields(new Set());
    setSortField(null);
  };

  const commitGuidedRows = (next: string[]) => {
    setGuidedRows(next);
    setRows(next.filter((f) => f !== ''));
  };

  const handleSelectTable = (id: string) => {
    setSelectedTableId(id);
    resetFields();
  };

  const handleModeChange = (next: Mode) => {
    setMode(next);
    // Guided mode has no columns well — clearing it keeps the two surfaces'
    // state genuinely identical, not merely "ignored", so the AC's
    // cut-line-parity claim holds by construction.
    if (next === 'guided') {
      setColumns([]);
      setGuidedRows(rows.length > 0 ? rows : ['']);
    }
  };

  const addToWell = (kind: WellKind, field: string) => {
    if (kind === 'rows') setRows((r) => (r.includes(field) ? r : [...r, field]));
    else if (kind === 'columns') setColumns((c) => (c.includes(field) ? c : [...c, field]));
    else
      setValues((v) => {
        if (v.some((value) => value.field === field)) return v;
        const column = table?.columns.find((c) => c.name === field);
        const defaultAggregate: PivotAggregate = column?.semanticType === 'Quantitative' ? 'sum' : 'count';
        return [...v, { field, aggregate: defaultAggregate }];
      });
  };

  const removeFromWell = (kind: WellKind, field: string) => {
    if (kind === 'rows') setRows((r) => r.filter((f) => f !== field));
    else if (kind === 'columns') setColumns((c) => c.filter((f) => f !== field));
    else setValues((v) => v.filter((value) => value.field !== field));
  };

  const moveField = (field: string, from: WellKind | 'available', to: WellKind) => {
    if (from !== 'available') removeFromWell(from, field);
    addToWell(to, field);
  };

  // Cardinality is already known from classification (03-capability-engine) —
  // no discovery query needed to decide the top-N cap.
  const cardinalityOf = (name: string): number => table?.columns.find((c) => c.name === name)?.cardinality ?? 0;
  const groupingFields = [...rows, ...columns];
  const highCardinalityField = groupingFields.reduce<{ field: string; cardinality: number } | null>((best, field) => {
    const cardinality = cardinalityOf(field);
    if (cardinality <= DEFAULT_TOP_N) return best;
    if (!best || cardinality > best.cardinality) return { field, cardinality };
    return best;
  }, null);
  const cappedField =
    highCardinalityField && !expandedFields.has(highCardinalityField.field) ? highCardinalityField : null;

  const baseSpec: PivotSpec | null = table
    ? {
        table: table.tableName,
        rows,
        columns: mode === 'guided' ? [] : columns,
        values,
        subtotals,
        topN: cappedField ? { field: cappedField.field, n: DEFAULT_TOP_N } : undefined,
      }
    : null;

  const outputColumns = baseSpec ? pivotOutputColumns(baseSpec) : [];
  const sortColumnIndex = sortField ? outputColumns.indexOf(sortField) : -1;

  const spec: PivotSpec | null =
    baseSpec && sortColumnIndex >= 0 ? { ...baseSpec, sort: { columnIndex: sortColumnIndex, direction: sortDirection } } : baseSpec;

  const isSpecFillable = spec !== null && (spec.rows.length + spec.columns.length + spec.values.length > 0);
  const sql = isSpecFillable && spec ? buildPivotSql(spec) : null;

  useEffect(() => {
    if (!sql) return;
    const timer = setTimeout(() => {
      // Pivot's own session (S5): a pivot re-run no longer clobbers the
      // console's results or pushes the console's buffer around.
      useQueryStore.getState().setSql(PIVOT_SESSION, sql);
      runQuery(sql, PIVOT_SESSION).catch(() => {});
    }, RUN_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [sql]);

  if (classifiedTables.length === 0 || !table) return null;

  return (
    <div data-testid="pivot-builder" className="flex flex-col gap-3 rounded-lg border border-(--color-border) p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-(--color-fg)">Pivot</h3>
        <div className="flex items-center gap-2">
          {classifiedTables.length > 1 && (
            <select
              aria-label="Pivot table"
              value={table.id}
              onChange={(event) => handleSelectTable(event.target.value)}
              className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-xs text-(--color-fg)"
            >
              {classifiedTables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tableName}
                </option>
              ))}
            </select>
          )}
          <div className="flex overflow-hidden rounded-full border border-(--color-border) text-xs">
            {(['builder', 'guided'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                aria-pressed={mode === m}
                className={`px-2.5 py-1 font-medium capitalize ${mode === m ? 'bg-(--color-accent) text-(--color-accent-fg)' : 'text-(--color-fg-muted)'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-(--color-fg-muted)">Fields</span>
        <div className="flex flex-wrap gap-1.5">
          {table.columns.map((column) => (
            <div
              key={column.name}
              draggable
              onDragStart={(event: DragEvent<HTMLDivElement>) => event.dataTransfer.setData('application/json', dragPayload(column.name, 'available'))}
              className="flex cursor-grab items-center gap-1 rounded-full border border-(--color-border) py-0.5 pl-2 pr-1 text-xs text-(--color-fg-muted)"
            >
              <span>{column.name}</span>
              <button type="button" onClick={() => addToWell('rows', column.name)} className="rounded px-1 hover:text-(--color-fg)" title={`Add ${column.name} to rows`}>
                +Row
              </button>
              {mode === 'builder' && (
                <button type="button" onClick={() => addToWell('columns', column.name)} className="rounded px-1 hover:text-(--color-fg)" title={`Add ${column.name} to columns`}>
                  +Col
                </button>
              )}
              <button type="button" onClick={() => addToWell('values', column.name)} className="rounded px-1 hover:text-(--color-fg)" title={`Add ${column.name} to values`}>
                +Value
              </button>
            </div>
          ))}
        </div>
      </div>

      {mode === 'builder' ? (
        <div className="flex flex-wrap gap-3">
          <Well
            label="Rows"
            kind="rows"
            fields={rows}
            onDropField={(field, from) => moveField(field, from, 'rows')}
            onRemoveField={(field) => removeFromWell('rows', field)}
          />
          <Well
            label="Columns"
            kind="columns"
            fields={columns}
            onDropField={(field, from) => moveField(field, from, 'columns')}
            onRemoveField={(field) => removeFromWell('columns', field)}
          />
          <Well
            label="Values"
            kind="values"
            fields={values.map((v) => v.field)}
            onDropField={(field, from) => moveField(field, from, 'values')}
            onRemoveField={(field) => removeFromWell('values', field)}
            renderExtra={(field) => {
              const value = values.find((v) => v.field === field);
              if (!value) return null;
              return (
                <select
                  aria-label={`Aggregation for ${field}`}
                  value={value.aggregate}
                  onChange={(event) =>
                    setValues((v) => v.map((entry) => (entry.field === field ? { ...entry, aggregate: event.target.value as PivotAggregate } : entry)))
                  }
                  className="rounded border border-(--color-border) bg-transparent text-xs text-(--color-fg)"
                >
                  {AGGREGATES.map((agg) => (
                    <option key={agg} value={agg}>
                      {agg}
                    </option>
                  ))}
                </select>
              );
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {guidedRows.map((field, index) => (
            <div key={index} className="flex items-center gap-2">
              <label className="w-20 text-xs text-(--color-fg-muted)">{index === 0 ? 'Group by' : 'and'}</label>
              <select
                aria-label={index === 0 ? 'Group by field' : `Group by field ${index + 1}`}
                value={field}
                onChange={(event) => {
                  const next = [...guidedRows];
                  next[index] = event.target.value;
                  commitGuidedRows(next);
                }}
                className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-xs text-(--color-fg)"
              >
                <option value="">Select a field…</option>
                {table.columns.map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name}
                  </option>
                ))}
              </select>
              {guidedRows.length > 1 && (
                <button
                  type="button"
                  onClick={() => commitGuidedRows(guidedRows.filter((_, i) => i !== index))}
                  aria-label="Remove group-by field"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setGuidedRows([...guidedRows, ''])}
            className="self-start text-xs text-(--color-accent) hover:underline"
          >
            + Add group-by field
          </button>

          <div className="flex items-center gap-2">
            <label className="w-20 text-xs text-(--color-fg-muted)">Measure</label>
            <select
              aria-label="Measure field"
              value={values[0]?.field ?? ''}
              onChange={(event) => {
                const field = event.target.value;
                if (!field) {
                  setValues([]);
                  return;
                }
                setValues([{ field, aggregate: values[0]?.aggregate ?? 'sum' }]);
              }}
              className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-xs text-(--color-fg)"
            >
              <option value="">None</option>
              {table.columns.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Measure aggregate"
              value={values[0]?.aggregate ?? 'sum'}
              disabled={!values[0]}
              onChange={(event) => setValues((v) => (v[0] ? [{ ...v[0], aggregate: event.target.value as PivotAggregate }] : v))}
              className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-xs text-(--color-fg) disabled:opacity-50"
            >
              {AGGREGATES.map((agg) => (
                <option key={agg} value={agg}>
                  {agg}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-(--color-fg-muted)">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={subtotals} onChange={(event) => setSubtotals(event.target.checked)} />
          Subtotals
        </label>
        {outputColumns.length > 0 && (
          <label className="flex items-center gap-1.5">
            Sort by
            <select
              aria-label="Sort by"
              value={sortField ?? ''}
              onChange={(event) => setSortField(event.target.value || null)}
              className="rounded border border-(--color-border) bg-transparent px-1.5 py-0.5 text-xs text-(--color-fg)"
            >
              <option value="">None</option>
              {outputColumns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
            {sortField && (
              <button type="button" onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))} className="underline">
                {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
              </button>
            )}
          </label>
        )}
      </div>

      {cappedField && (
        <p className="text-xs text-(--color-fg-muted)">
          "{cappedField.field}" has {cappedField.cardinality.toLocaleString()} distinct values — showing top {DEFAULT_TOP_N}.{' '}
          <button
            type="button"
            onClick={() => setExpandedFields((s) => new Set(s).add(cappedField.field))}
            className="text-(--color-accent) hover:underline"
          >
            Show all
          </button>
        </p>
      )}

      {sql && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-(--color-fg-muted)">Generated SQL</span>
            <button type="button" onClick={() => copySql(sql)} className="text-xs text-(--color-accent) hover:underline">
              Copy SQL
            </button>
          </div>
          <pre className="overflow-x-auto rounded bg-(--color-border)/40 p-2 font-mono text-xs text-(--color-fg)">{sql}</pre>
        </div>
      )}
    </div>
  );
}
