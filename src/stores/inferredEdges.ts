// The raw, pre-override FK edges `useDatasetBaseline`'s `loadRelationships` call
// already fetches — mirrored here so a second consumer (the W7 inspector) can
// apply `applyOverrides` itself without a second concurrent `loadRelationships`
// DuckDB query firing while the map tab and the inspector are both visible.
// `useDatasetBaseline` stays the single fetch owner; this store only holds its
// result. Separate from `stores/relationships.ts` (the user's override
// assertions) — this is the engine's own inferred output, pre-override.
import { create } from "zustand";
import type { FkEdge } from "../lib/relationshipInference";

interface InferredEdgesState {
  edges: FkEdge[];
  setEdges: (edges: FkEdge[]) => void;
}

export const useInferredEdgesStore = create<InferredEdgesState>((set) => ({
  edges: [],
  setEdges: (edges) => set({ edges }),
}));
