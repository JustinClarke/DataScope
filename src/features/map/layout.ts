// Dataset map auto-layout (W4, D71, master §13.3) — ports the longest-path
// layering + barycenter algorithm designed and signed off in the hallmark
// mock dataset-map.html (formerly _misc/ideation/hallmark/, deleted post-v0.69
// — see .hallmark/log.json). Pure, no
// React/DOM: given the registered table names and the (override-applied) FK
// edges, produces columns of table names. depth(node) = longest path
// following FK edges child -> parent; column = maxDepth - depth, so
// FK-heavy children land left and referenced dimensions land right, edges
// flowing left to right. A second barycenter pass reorders each column so
// connected nodes line up, reducing connector crossings.
import type { FkEdge } from '../../lib/relationshipInference';

/** Longest-path layering. A self-reference or FK cycle is guarded, not an error — it terminates with a finite depth rather than looping. */
export function computeColumns(tableNames: string[], edges: FkEdge[]): string[][] {
  const parentsOf = new Map<string, string[]>();
  for (const name of tableNames) parentsOf.set(name, []);
  for (const edge of edges) {
    parentsOf.get(edge.childTable)?.push(edge.parentTable);
  }

  const depth = new Map<string, number>();
  function longestPath(id: string, seen: Set<string>): number {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0; // cycle guard — this path contributes no further depth
    seen.add(id);
    let d = 0;
    for (const parent of parentsOf.get(id) ?? []) {
      d = Math.max(d, 1 + longestPath(parent, seen));
    }
    seen.delete(id);
    depth.set(id, d);
    return d;
  }
  for (const name of tableNames) longestPath(name, new Set());

  const maxDepth = tableNames.reduce((max, name) => Math.max(max, depth.get(name) ?? 0), 0);
  const columns: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const name of tableNames) {
    columns[maxDepth - (depth.get(name) ?? 0)].push(name);
  }
  return columns;
}

/**
 * Barycenter reordering: each pass snapshots every column's current index
 * *before* any resort in that pass, then sorts every column by the average
 * index of its connected neighbors under that frozen snapshot — matching the
 * mock's `pass()` exactly (both columns move simultaneously off one shared
 * snapshot, not off each other's mid-pass updates). Three passes
 * (forward/backward/forward), same as the mock.
 */
export function orderColumns(columns: string[][], edges: FkEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const column of columns) for (const name of column) adjacency.set(name, []);
  for (const edge of edges) {
    adjacency.get(edge.childTable)?.push(edge.parentTable);
    adjacency.get(edge.parentTable)?.push(edge.childTable);
  }

  const ordered = columns.map((column) => [...column]);

  function snapshotIndex(): Map<string, number> {
    const index = new Map<string, number>();
    for (const column of ordered) column.forEach((name, i) => index.set(name, i));
    return index;
  }

  function barycenter(name: string, index: Map<string, number>): number {
    const neighborPositions = (adjacency.get(name) ?? [])
      .map((neighbor) => index.get(neighbor))
      .filter((position): position is number => position !== undefined);
    if (neighborPositions.length === 0) return index.get(name) ?? 0;
    return neighborPositions.reduce((sum, position) => sum + position, 0) / neighborPositions.length;
  }

  function pass(order: number[]): void {
    const index = snapshotIndex();
    for (const columnIndex of order) {
      ordered[columnIndex] = [...ordered[columnIndex]].sort(
        (a, b) => barycenter(a, index) - barycenter(b, index),
      );
    }
  }

  const forward = ordered.map((_, i) => i);
  const backward = [...forward].reverse();
  pass(forward);
  pass(backward);
  pass(forward);

  return ordered;
}

/** The full layout: layering then reordering. The single entry point `DatasetMap`/`Erd` call. */
export function layoutColumns(tableNames: string[], edges: FkEdge[]): string[][] {
  return orderColumns(computeColumns(tableNames, edges), edges);
}
