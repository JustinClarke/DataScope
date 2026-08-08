// The Dossier's join-graph thumbnail (D48, §13.1) — the hero rendering when the
// Join Graph (beta) is enabled and found relationships. A compact, static
// version of the interactive graph; the full add/remove/re-point experience
// lives in the Join Graph module. Plain serializable props, no callbacks, per
// the ViewSpec contract.
import {
  JoinGraph,
  type JoinGraphNode,
} from "../../charts/relationships/JoinGraph";
import type { FkEdge } from "../../../lib/relationshipInference";

export interface HeroJoinGraphProps {
  nodes: JoinGraphNode[];
  edges: FkEdge[];
}

export function HeroJoinGraph({ nodes, edges }: HeroJoinGraphProps) {
  const confident = edges.filter((e) => e.confidence === "confident").length;
  const candidates = edges.length - confident;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-(--color-fg-muted)">
          How the tables relate
        </h2>
        <span className="text-xs text-(--color-fg-muted)">
          {confident} confident
          {candidates > 0
            ? ` · ${candidates} candidate${candidates === 1 ? "" : "s"}`
            : ""}{" "}
          · beta
        </span>
      </div>
      <div className="rounded-lg border border-(--color-border) p-3">
        <JoinGraph nodes={nodes} edges={edges} compact />
      </div>
    </div>
  );
}
