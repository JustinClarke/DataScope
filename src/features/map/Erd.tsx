// The dataset map's multi-table ERD (W4, D71, master §13.3) — a re-skin of
// the Join Graph over the same D24 data (`lib/relationshipInference`), not
// new analysis. Ports the hallmark mock's algorithm/interaction pattern
// (`dataset-map.html`, formerly `_misc/ideation/hallmark/`, deleted
// post-v0.69): columns from
// `layout.ts`, field-row-anchored connectors measured via
// `getBoundingClientRect` (hand-rolled SVG, same no-dependency approach
// `JoinGraph.tsx` already takes), solid/dashed strictly from `edge.confidence`
// (the D24 guardrail — never a name/presence matcher, never a computed
// cardinality). Read-only display + selection; edge evidence/override editing
// wires into the bottom inspector (W7) as click targets here.
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { TableRegistryEntry } from '../../types';
import type { FkEdge } from '../../lib/relationshipInference';
import { keyColumnsFor } from '../../lib/dossier';
import { layoutColumns } from './layout';

interface ErdProps {
  tables: TableRegistryEntry[];
  edges: FkEdge[];
  selectedTableId: string | null;
  onSelectTable: (tableId: string) => void;
  selectedEdgeId?: string | null;
  onSelectEdge?: (edgeId: string) => void;
  onSelectColumn?: (tableId: string, column: string) => void;
}

interface Wire {
  edgeId: string;
  d: string;
  confidence: FkEdge['confidence'];
}

function fieldRowId(tableId: string, columnName: string): string {
  return `erd-field-${tableId}-${columnName}`;
}

function fkColumnsFor(table: TableRegistryEntry, edges: FkEdge[]): Set<string> {
  const columns = new Set<string>();
  for (const edge of edges) {
    if (edge.childTable === table.tableName) columns.add(edge.childColumn);
  }
  return columns;
}

export function Erd({
  tables,
  edges,
  selectedTableId,
  onSelectTable,
  selectedEdgeId = null,
  onSelectEdge,
  onSelectColumn,
}: ErdProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [wires, setWires] = useState<Wire[]>([]);

  const byName = new Map(tables.map((t) => [t.tableName, t]));
  const columns = layoutColumns(
    tables.map((t) => t.tableName),
    edges,
  ).map((column) => column.map((name) => byName.get(name)).filter((t): t is TableRegistryEntry => t !== undefined));

  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      if (!container) return;
      const box = container.getBoundingClientRect();
      const next: Wire[] = [];
      for (const edge of edges) {
        const childTable = byName.get(edge.childTable);
        const parentTable = byName.get(edge.parentTable);
        if (!childTable || !parentTable) continue;
        const fromEl = document.getElementById(fieldRowId(childTable.id, edge.childColumn));
        const toEl = document.getElementById(fieldRowId(parentTable.id, edge.parentColumn));
        if (!fromEl || !toEl) continue;
        const from = fromEl.getBoundingClientRect();
        const to = toEl.getBoundingClientRect();
        const sx = from.left + from.width / 2 - box.left;
        const sy = from.top + from.height / 2 - box.top;
        const ex = to.left + to.width / 2 - box.left;
        const ey = to.top + to.height / 2 - box.top;
        const dx = Math.max(24, Math.abs(ex - sx) * 0.4);
        next.push({
          edgeId: edge.id,
          d: `M ${sx} ${sy} C ${sx + dx} ${sy}, ${ex - dx} ${ey}, ${ex} ${ey}`,
          confidence: edge.confidence,
        });
      }
      setWires(next);
    }

    measure();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      observer = new ResizeObserver(measure);
      observer.observe(containerRef.current);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, edges]);

  return (
    <div
      ref={containerRef}
      data-testid="erd"
      className="relative flex items-center justify-center gap-16 overflow-auto p-8"
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {wires.map((wire) => (
          <path
            key={wire.edgeId}
            d={wire.d}
            data-testid={`erd-wire-${wire.edgeId}`}
            data-confidence={wire.confidence}
            data-selected={wire.edgeId === selectedEdgeId}
            fill="none"
            stroke={wire.edgeId === selectedEdgeId ? 'var(--color-accent)' : 'var(--color-fg-muted)'}
            strokeWidth={wire.edgeId === selectedEdgeId ? 2.25 : 1.25}
            strokeDasharray={wire.confidence === 'candidate' ? '5 4' : undefined}
            {...(onSelectEdge
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': `Edge ${wire.edgeId}`,
                  className: 'pointer-events-auto cursor-pointer outline-none',
                  onClick: () => onSelectEdge(wire.edgeId),
                  onKeyDown: (e: KeyboardEvent<SVGPathElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectEdge(wire.edgeId);
                    }
                  },
                }
              : {})}
          />
        ))}
      </svg>
      {columns.map((column, i) => (
        <div key={i} className="relative z-10 flex flex-col gap-6">
          {column.map((table) => (
            <ErdCard
              key={table.id}
              table={table}
              edges={edges}
              selected={table.id === selectedTableId}
              onSelect={() => onSelectTable(table.id)}
              onSelectColumn={onSelectColumn ? (column) => onSelectColumn(table.id, column) : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function ErdCard({
  table,
  edges,
  selected,
  onSelect,
  onSelectColumn,
}: {
  table: TableRegistryEntry;
  edges: FkEdge[];
  selected: boolean;
  onSelect: () => void;
  onSelectColumn?: (column: string) => void;
}) {
  const pkColumns = new Set(keyColumnsFor(table));
  const fkColumns = fkColumnsFor(table, edges);

  return (
    <div
      data-testid={`erd-card-${table.id}`}
      data-selected={selected}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`w-48 cursor-pointer rounded-lg border bg-(--color-bg) shadow-sm outline-none ${
        selected ? 'border-(--color-accent) ring-1 ring-(--color-accent)' : 'border-(--color-border)'
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-(--color-border) px-3 py-1.5">
        <span className="truncate text-sm font-semibold text-(--color-fg)">{table.tableName}</span>
        <span className="flex-none text-xs text-(--color-fg-muted)">{table.rowCount.toLocaleString()}</span>
      </div>
      <div className="flex flex-col p-1">
        {(table.columns ?? []).map((column) => {
          const isPk = pkColumns.has(column.name);
          const isFk = fkColumns.has(column.name);
          return (
            <div
              key={column.name}
              id={fieldRowId(table.id, column.name)}
              data-testid={fieldRowId(table.id, column.name)}
              data-key={isPk ? 'pk' : isFk ? 'fk' : undefined}
              role={onSelectColumn ? 'button' : undefined}
              tabIndex={onSelectColumn ? 0 : undefined}
              onClick={onSelectColumn ? () => onSelectColumn(column.name) : undefined}
              onKeyDown={
                onSelectColumn
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectColumn(column.name);
                      }
                    }
                  : undefined
              }
              className={`flex items-center justify-between gap-2 rounded px-2 py-0.5 text-xs ${onSelectColumn ? 'cursor-pointer outline-none hover:bg-(--color-border)/40' : ''}`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 flex-none rounded-full ${
                    isPk || isFk ? 'bg-(--color-accent)' : 'bg-transparent'
                  }`}
                />
                <span className="truncate text-(--color-fg-muted)">{column.name}</span>
              </span>
              <span className="flex-none text-(--color-fg-muted)">{column.physicalType}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
