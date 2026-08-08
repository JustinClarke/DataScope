// Evidence and override controls for the join graph (D24 trust rules). Every
// edge shows its confidence tier and the evidence behind it, plus the runner-up
// when the match was a near-tie. Overrides are exhaustive: remove an edge,
// re-point it to a different parent, restore one you removed, or add a
// relationship by hand. Presentational — the module owns the override store.
import { useState } from "react";
import {
  CONTAINMENT_SOLID,
  MIN_STRUCTURE_COVERAGE,
  KEY_UNIQUENESS_MIN,
  type FkEdge,
} from "../../../lib/relationshipInference";

export interface ColumnRef {
  table: string;
  column: string;
}

function refValue(ref: ColumnRef): string {
  return `${ref.table}.${ref.column}`;
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function ConfidenceBadge({ confidence }: { confidence: FkEdge["confidence"] }) {
  const confident = confidence === "confident";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 font-mono text-[length:var(--text-2xs)] uppercase tracking-[0.04em] ${
        confident
          ? "border-(--color-active)/40 text-(--color-active)"
          : "border-(--color-rule-hi) text-(--color-ink-2)"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-0 w-5 border-t-[1.5px] ${confident ? "border-solid" : "border-dashed"}`}
      />
      {confident ? "Confident" : "Candidate"}
    </span>
  );
}

function EvidenceRow({ edge }: { edge: FkEdge }) {
  const items: { ok: boolean; label: string }[] = [
    {
      ok: edge.nameAgreement,
      label: `Name ${edge.nameAgreement ? "agrees" : "differs"}`,
    },
    {
      ok: edge.containment >= CONTAINMENT_SOLID,
      label: `Containment ${pct(edge.containment)}`,
    },
    {
      ok: edge.coverage >= MIN_STRUCTURE_COVERAGE,
      label: `Coverage ${pct(edge.coverage)}`,
    },
    {
      ok: edge.parentKeyUniqueness >= KEY_UNIQUENESS_MIN,
      label: `Parent key ${pct(edge.parentKeyUniqueness)} unique`,
    },
  ];
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1.5">
      {items.map((item) => (
        <span
          key={item.label}
          className="flex items-center gap-1.5 font-mono text-[length:var(--text-xs)] text-(--color-ink-2)"
        >
          <span
            aria-hidden="true"
            className={item.ok ? "text-(--color-ok)" : "text-(--color-active)"}
          >
            {item.ok ? "✓" : "⚠"}
          </span>
          {item.label}
        </span>
      ))}
    </div>
  );
}

interface EdgeEvidencePanelProps {
  edge: FkEdge;
  allColumns: ColumnRef[];
  onRemove: (edge: FkEdge) => void;
  onRepoint: (edge: FkEdge, parent: ColumnRef) => void;
}

export function EdgeEvidencePanel({
  edge,
  allColumns,
  onRemove,
  onRepoint,
}: EdgeEvidencePanelProps) {
  const [repointTarget, setRepointTarget] = useState("");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-(--color-border) p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-(--color-fg)">
          {edge.childTable}.{edge.childColumn} → {edge.parentTable}.
          {edge.parentColumn}
        </span>
        <ConfidenceBadge confidence={edge.confidence} />
      </div>

      <EvidenceRow edge={edge} />

      {edge.ambiguity && (
        <p className="text-xs text-(--color-active)">
          Ambiguous: also matches {edge.ambiguity.parentTable}.
          {edge.ambiguity.parentColumn} (
          {(edge.ambiguity.scoreGap * 100).toFixed(0)}% apart).{" "}
          <button
            type="button"
            className="underline"
            onClick={() =>
              onRepoint(edge, {
                table: edge.ambiguity!.parentTable,
                column: edge.ambiguity!.parentColumn,
              })
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
              setRepointTarget("");
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

export function AddRelationshipForm({
  allColumns,
  onAdd,
}: AddRelationshipFormProps) {
  const [child, setChild] = useState("");
  const [parent, setParent] = useState("");

  const canAdd = child !== "" && parent !== "" && child !== parent;

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
            setChild("");
            setParent("");
          }
        }}
        className="rounded border border-(--color-border) px-2.5 py-1.5 text-xs text-(--color-fg) transition-colors hover:bg-(--color-border)/40 disabled:opacity-40"
      >
        Add relationship
      </button>
    </div>
  );
}
