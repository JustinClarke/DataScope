// The thin interactive join graph (D24) — nodes are tables, edges are FK
// candidates. Confident (name-agreeing) edges draw solid; structure-only
// candidates draw dashed. Deterministic circular layout, hand-rolled SVG (the
// same custom-SVG approach BoxPlot/CorrelationHeatmap take), so there is no
// graph-layout dependency and the render is stable across runs. Reused compact
// and non-interactive for the Dossier thumbnail.
import type { FkEdge } from '../../../lib/relationshipInference';

export interface JoinGraphNode {
  tableName: string;
  rowCount: number;
}

interface JoinGraphProps {
  nodes: JoinGraphNode[];
  edges: FkEdge[];
  selectedEdgeId?: string | null;
  onSelectEdge?: (id: string) => void;
  compact?: boolean;
}

interface Point {
  x: number;
  y: number;
}

function layout(count: number, width: number, height: number, radius: number): Point[] {
  const cx = width / 2;
  const cy = height / 2;
  if (count === 1) return [{ x: cx, y: cy }];
  return Array.from({ length: count }, (_, i) => {
    const theta = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return { x: cx + radius * Math.cos(theta), y: cy + radius * Math.sin(theta) };
  });
}

/** Trim a segment's endpoints inward by `pad` so an edge stops at the node edge, not its center. */
function trim(a: Point, b: Point, pad: number): { x1: number; y1: number; x2: number; y2: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return { x1: a.x + ux * pad, y1: a.y + uy * pad, x2: b.x - ux * pad, y2: b.y - uy * pad };
}

function arrowHead(x: number, y: number, fromX: number, fromY: number, size: number): string {
  const angle = Math.atan2(y - fromY, x - fromX);
  const a1 = angle + Math.PI - Math.PI / 7;
  const a2 = angle + Math.PI + Math.PI / 7;
  const p1 = `${x + size * Math.cos(a1)},${y + size * Math.sin(a1)}`;
  const p2 = `${x + size * Math.cos(a2)},${y + size * Math.sin(a2)}`;
  return `${x},${y} ${p1} ${p2}`;
}

export function JoinGraph({ nodes, edges, selectedEdgeId, onSelectEdge, compact = false }: JoinGraphProps) {
  const width = compact ? 320 : 540;
  const height = compact ? 200 : 380;
  const nodeW = compact ? 92 : 132;
  const nodeH = compact ? 26 : 34;
  const radius = Math.min(width, height) / 2 - (compact ? 40 : 66);

  const positions = layout(nodes.length, width, height, radius);
  const indexByName = new Map(nodes.map((n, i) => [n.tableName, i]));

  const confidentColor = 'var(--color-accent)';
  const candidateColor = 'var(--color-fg-muted)';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label={`Join graph: ${nodes.length} tables, ${edges.length} relationships`}
    >
      {/* Edges first, so nodes render on top of the lines. */}
      {edges.map((edge) => {
        const ci = indexByName.get(edge.childTable);
        const pi = indexByName.get(edge.parentTable);
        if (ci === undefined || pi === undefined) return null;

        const isConfident = edge.confidence === 'confident';
        const color = isConfident ? confidentColor : candidateColor;
        const selected = edge.id === selectedEdgeId;

        if (ci === pi) {
          // Self-referencing key — a small loop above the node.
          const p = positions[ci];
          const r = compact ? 10 : 16;
          const loop = `M ${p.x - r} ${p.y - nodeH / 2} C ${p.x - r * 2} ${p.y - nodeH / 2 - r * 3}, ${p.x + r * 2} ${p.y - nodeH / 2 - r * 3}, ${p.x + r} ${p.y - nodeH / 2}`;
          return (
            <path
              key={edge.id}
              d={loop}
              fill="none"
              stroke={color}
              strokeWidth={selected ? 3 : 1.5}
              strokeDasharray={isConfident ? undefined : '5 4'}
              data-testid={`edge-${edge.id}`}
              data-confidence={edge.confidence}
            />
          );
        }

        const line = trim(positions[ci], positions[pi], compact ? 46 : 62);

        return (
          <g
            key={edge.id}
            role={onSelectEdge ? 'button' : undefined}
            tabIndex={onSelectEdge ? 0 : undefined}
            aria-label={`${edge.childTable}.${edge.childColumn} to ${edge.parentTable}.${edge.parentColumn}, ${edge.confidence}`}
            className={onSelectEdge ? 'cursor-pointer outline-none' : undefined}
            onClick={onSelectEdge ? () => onSelectEdge(edge.id) : undefined}
            onKeyDown={
              onSelectEdge
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectEdge(edge.id);
                    }
                  }
                : undefined
            }
            data-testid={`edge-${edge.id}`}
            data-confidence={edge.confidence}
          >
            {/* Wide invisible hit target for easier clicking. */}
            {onSelectEdge && (
              <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="transparent" strokeWidth={14} />
            )}
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={color}
              strokeWidth={selected ? 3 : 1.5}
              strokeDasharray={isConfident ? undefined : '5 4'}
            />
            <polygon
              points={arrowHead(line.x2, line.y2, line.x1, line.y1, compact ? 6 : 8)}
              fill={color}
            />
          </g>
        );
      })}

      {/* Nodes */}
      {nodes.map((node, i) => {
        const p = positions[i];
        return (
          <g key={node.tableName}>
            <rect
              x={p.x - nodeW / 2}
              y={p.y - nodeH / 2}
              width={nodeW}
              height={nodeH}
              rx={6}
              className="fill-(--color-bg) stroke-(--color-border)"
              strokeWidth={1}
            />
            <text
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-(--color-fg)"
              fontSize={compact ? 10 : 12}
            >
              {node.tableName.length > (compact ? 12 : 18)
                ? `${node.tableName.slice(0, compact ? 11 : 17)}…`
                : node.tableName}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
