// Evidence and override controls for the join graph (D24 trust rules). Every
// edge shows its confidence tier and the evidence behind it, plus the runner-up
// when the match was a near-tie. Overrides are exhaustive: remove an edge,
// re-point it to a different parent, restore one you removed, or add a
// relationship by hand. Presentational — the module owns the override store.
import { useState } from 'react';
import type { FkEdge } from '../../../lib/relationshipInference';

export interface ColumnRef {
  table: string;
  column: string;
}

function refValue(ref: ColumnRef): string {
  return `${ref.table}.${ref.column}`;
}

function ConfidenceBadge({ confidence }: { confidence: FkEdge['confidence'] }) {
  const confident = confidence === 'confident';
  return (
    <span
      className={
        confident
          ? 'rounded bg-(--color-accent)/15 px-1.5 py-0.5 text-xs font-medium text-(--color-accent)'
          : 'rounded border border-dashed border-(--color-fg-muted) px-1.5 py-0.5 text-xs font-medium text-(--color-fg-muted)'
      }
    >
      {confident ? 'Confident' : 'Candidate'}
    </span>
  );
}

interface EdgeEvidencePanelProps {
  edge: FkEdge;
  allColumns: ColumnRef[];
  onRemove: (edge: FkEdge) => void;
  onRepoint: (edge: FkEdge, parent: ColumnRef) => void;
}

export function EdgeEvidencePanel({ edge, allColumns, onRemove, onRepoint }: EdgeEvidencePanelProps) {
  const [repointTarget, setRepointTarget] = useState('');

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-(--color-border) p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-(--color-fg)">
          {edge.childTable}.{edge.childColumn} → {edge.parentTable}.{edge.parentColumn}
        </span>
        <ConfidenceBadge confidence={edge.confidence} />
      </div>

      <p className="text-sm text-(--color-fg-muted)">{edge.evidence}</p>

      {edge.ambiguity && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Ambiguous: also matches {edge.ambiguity.parentTable}.{edge.ambiguity.parentColumn} (
          {(edge.ambiguity.scoreGap * 100).toFixed(0)}% apart).{' '}
          <button
            type="button"
            className="underline"
            onClick={() =>
              onRepoint(edge, { table: edge.ambiguity!.parentTable, column: edge.ambiguity!.parentColumn })
            }
          >
            Use that instead
          </button>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-(--color-border) pt-3">
        <button
          type="button"
          onClick={() => onRemove(edge)}
          className="rounded border border-(--color-border) px-2.5 py-1 text-xs text-(--color-fg) transition-colors hover:bg-(--color-border)/40"
        >
          Remove edge
        </button>

        <label className="flex items-center gap-1.5 text-xs text-(--color-fg-muted)">
          Re-point to
          <select
            aria-label="Re-point parent"
            value={repointTarget}
            onChange={(e) => {
              const value = e.target.value;
              setRepointTarget('');
              const ref = allColumns.find((c) => refValue(c) === value);
              if (ref) onRepoint(edge, ref);
            }}
            className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
          >
            <option value="">choose…</option>
            {allColumns.map((c) => (
              <option key={refValue(c)} value={refValue(c)}>
                {refValue(c)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

interface AddRelationshipFormProps {
  allColumns: ColumnRef[];
  onAdd: (child: ColumnRef, parent: ColumnRef) => void;
}

export function AddRelationshipForm({ allColumns, onAdd }: AddRelationshipFormProps) {
  const [child, setChild] = useState('');
  const [parent, setParent] = useState('');

  const canAdd = child !== '' && parent !== '' && child !== parent;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-(--color-border) p-3">
      <label className="flex flex-col gap-1 text-xs text-(--color-fg-muted)">
        Child column
        <select
          aria-label="Add child column"
          value={child}
          onChange={(e) => setChild(e.target.value)}
          className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
        >
          <option value="">choose…</option>
          {allColumns.map((c) => (
            <option key={refValue(c)} value={refValue(c)}>
              {refValue(c)}
            </option>
          ))}
        </select>
      </label>
      <span className="pb-1.5 text-(--color-fg-muted)">→</span>
      <label className="flex flex-col gap-1 text-xs text-(--color-fg-muted)">
        Parent column
        <select
          aria-label="Add parent column"
          value={parent}
          onChange={(e) => setParent(e.target.value)}
          className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
        >
          <option value="">choose…</option>
          {allColumns.map((c) => (
            <option key={refValue(c)} value={refValue(c)}>
              {refValue(c)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!canAdd}
        onClick={() => {
          const c = allColumns.find((x) => refValue(x) === child);
          const p = allColumns.find((x) => refValue(x) === parent);
          if (c && p) {
            onAdd(c, p);
            setChild('');
            setParent('');
          }
        }}
        className="rounded border border-(--color-border) px-2.5 py-1.5 text-xs text-(--color-fg) transition-colors hover:bg-(--color-border)/40 disabled:opacity-40"
      >
        Add relationship
      </button>
    </div>
  );
}
