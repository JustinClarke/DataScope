// Join Graph (beta) module (§19 Phase 3 / D24) — the last v0 chart module.
// Runs FK inference across the registered tables, renders the confidence-labeled
// graph, and lets the user correct it (add / remove / re-point edges). Gated on
// ≥2 registered tables. Explicitly labeled beta: this is an honest, thin slice
// of the Studio-arc relationship engine, not the full ER experience.
import { useEffect, useMemo, useState } from 'react';
import { useDatasetsStore } from '../../../stores/datasets';
import { useRelationshipsStore } from '../../../stores/relationships';
import { loadRelationships } from '../../../services/relationships';
import { applyOverrides, type FkEdge, type RelationshipOverrides } from '../../../lib/relationshipInference';
import { JoinGraph, type JoinGraphNode } from './JoinGraph';
import { AddRelationshipForm, EdgeEvidencePanel, type ColumnRef } from './EdgeEvidencePanel';

export function JoinGraphModule() {
  const tables = useDatasetsStore((state) => state.tables);
  // Select stable fields individually — a selector returning a fresh object each
  // render would loop under Zustand v5's Object.is equality.
  const removed = useRelationshipsStore((s) => s.removed);
  const repointed = useRelationshipsStore((s) => s.repointed);
  const added = useRelationshipsStore((s) => s.added);
  const overrides = useMemo<RelationshipOverrides>(() => ({ removed, repointed, added }), [removed, repointed, added]);
  const removeEdge = useRelationshipsStore((s) => s.removeEdge);
  const restoreEdge = useRelationshipsStore((s) => s.restoreEdge);
  const repointEdge = useRelationshipsStore((s) => s.repointEdge);
  const addEdge = useRelationshipsStore((s) => s.addEdge);

  const classifiedTables = useMemo(() => tables.filter((t) => t.columns && t.columns.length > 0), [tables]);

  const [inferred, setInferred] = useState<FkEdge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Re-infer whenever the classified-table set changes shape (same proxy the
  // Dossier uses). Overrides live in their own store, so re-inference re-merges
  // over them — they survive re-profiling.
  const shapeKey = tables.map((t) => `${t.id}:${t.columns?.length ?? 0}`).join(',');
  useEffect(() => {
    if (classifiedTables.length < 2) {
      setInferred(null);
      return;
    }
    let cancelled = false;
    setInferred(null);
    setError(null);
    loadRelationships(tables)
      .then((edges) => {
        if (!cancelled) setInferred(edges);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not infer relationships.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeKey]);

  const liveTableNames = useMemo(() => tables.map((t) => t.tableName), [tables]);
  const edges = useMemo(
    () => (inferred ? applyOverrides(inferred, overrides, liveTableNames) : []),
    [inferred, overrides, liveTableNames],
  );

  const nodes: JoinGraphNode[] = useMemo(
    () => tables.map((t) => ({ tableName: t.tableName, rowCount: t.rowCount })),
    [tables],
  );

  const allColumns: ColumnRef[] = useMemo(
    () =>
      classifiedTables.flatMap((t) => (t.columns ?? []).map((c) => ({ table: t.tableName, column: c.name }))),
    [classifiedTables],
  );

  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;

  const confidentCount = edges.filter((e) => e.confidence === 'confident').length;
  const candidateCount = edges.length - confidentCount;

  if (tables.length < 2) {
    return (
      <p className="text-sm text-(--color-fg-muted)">
        The join graph needs at least two tables — drop a folder or multiple files to infer how they relate.
      </p>
    );
  }

  if (classifiedTables.length < 2) {
    return <p className="text-sm text-(--color-fg-muted)">Profiling tables…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-(--color-fg)">Join Graph</h2>
        <span className="rounded bg-(--color-fg-muted)/15 px-1.5 py-0.5 text-xs font-medium text-(--color-fg-muted)">
          beta
        </span>
      </div>
      <p className="text-sm text-(--color-fg-muted)">
        Inferred foreign-key relationships. Solid edges are confident (the column name matches the target);
        dashed edges are structure-only candidates — confirm or correct them. Nothing here leaves your machine.
      </p>

      {error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : inferred === null ? (
        <div className="flex h-40 items-center justify-center text-sm text-(--color-fg-muted)">
          Inferring relationships…
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-(--color-border) p-4">
            {edges.length === 0 ? (
              <p className="py-8 text-center text-sm text-(--color-fg-muted)">
                No relationship candidates found. You can still add one by hand below.
              </p>
            ) : (
              <>
                <JoinGraph
                  nodes={nodes}
                  edges={edges}
                  selectedEdgeId={selectedEdgeId}
                  onSelectEdge={(id) => setSelectedEdgeId(id === selectedEdgeId ? null : id)}
                />
                <div className="mt-2 flex items-center justify-center gap-4 text-xs text-(--color-fg-muted)">
                  <span className="flex items-center gap-1.5">
                    <svg width="20" height="6" aria-hidden="true">
                      <line x1="0" y1="3" x2="20" y2="3" stroke="var(--color-accent)" strokeWidth="2" />
                    </svg>
                    Confident ({confidentCount})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg width="20" height="6" aria-hidden="true">
                      <line
                        x1="0"
                        y1="3"
                        x2="20"
                        y2="3"
                        stroke="var(--color-fg-muted)"
                        strokeWidth="2"
                        strokeDasharray="4 3"
                      />
                    </svg>
                    Candidate ({candidateCount})
                  </span>
                </div>
              </>
            )}
          </div>

          {selectedEdge && (
            <EdgeEvidencePanel
              edge={selectedEdge}
              allColumns={allColumns}
              onRemove={(edge) => {
                removeEdge(edge.childTable, edge.childColumn);
                setSelectedEdgeId(null);
              }}
              onRepoint={(edge, parent) => {
                repointEdge(edge.childTable, edge.childColumn, parent.table, parent.column);
                setSelectedEdgeId(null);
              }}
            />
          )}

          {edges.length > 0 && !selectedEdge && (
            <p className="text-xs text-(--color-fg-muted)">Select an edge to see its evidence and correct it.</p>
          )}

          {overrides.removed.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-(--color-border) p-3">
              <span className="text-xs font-medium text-(--color-fg-muted)">Removed edges</span>
              {overrides.removed.map((key) => {
                const [childTable, childColumn] = key.split('.');
                return (
                  <div key={key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-(--color-fg-muted)">{key}</span>
                    <button
                      type="button"
                      className="underline text-(--color-fg)"
                      onClick={() => restoreEdge(childTable, childColumn)}
                    >
                      Restore
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <AddRelationshipForm
            allColumns={allColumns}
            onAdd={(child, parent) => addEdge(child.table, child.column, parent.table, parent.column)}
          />
        </>
      )}
    </div>
  );
}
