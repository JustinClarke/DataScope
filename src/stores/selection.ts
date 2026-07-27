// Shell-wide selection (W2, D71, master §13.3/§16) — what a later region (the
// options strip, W5; the inspector, W7) acts on. The three slots are
// independent on purpose: selecting a column from a Profile tab must not blank
// out the map's `selectedTableId`-driven side panel, and vice versa — the same
// reason W2 left column/map-edge slots to their first reader rather than
// inventing a single unified selection value up front. `lastSelectionKind`
// says which slot is current, for the inspector (W7) to render.
import { create } from 'zustand';

export type SelectionKind = 'table' | 'column' | 'edge';

interface SelectionState {
  selectedTableId: string | null;
  selectedColumn: { tableId: string; column: string } | null;
  selectedEdgeId: string | null;
  lastSelectionKind: SelectionKind | null;
  selectTable: (tableId: string) => void;
  selectColumn: (tableId: string, column: string) => void;
  selectEdge: (edgeId: string) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedTableId: null,
  selectedColumn: null,
  selectedEdgeId: null,
  lastSelectionKind: null,
  selectTable: (tableId) => set({ selectedTableId: tableId, lastSelectionKind: 'table' }),
  selectColumn: (tableId, column) => set({ selectedColumn: { tableId, column }, lastSelectionKind: 'column' }),
  selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, lastSelectionKind: 'edge' }),
  clearSelection: () =>
    set({ selectedTableId: null, selectedColumn: null, selectedEdgeId: null, lastSelectionKind: null }),
}));
