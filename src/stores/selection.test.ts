import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from './selection';

beforeEach(() => {
  useSelectionStore.setState({
    selectedTableId: null,
    selectedColumn: null,
    selectedEdgeId: null,
    lastSelectionKind: null,
  });
});

describe('selection store', () => {
  it('defaults to no selected table', () => {
    expect(useSelectionStore.getState().selectedTableId).toBeNull();
  });

  it('selectTable sets the selected table id', () => {
    useSelectionStore.getState().selectTable('t-1');
    expect(useSelectionStore.getState().selectedTableId).toBe('t-1');
  });

  it('selectTable overwrites a previous selection', () => {
    useSelectionStore.getState().selectTable('t-1');
    useSelectionStore.getState().selectTable('t-2');
    expect(useSelectionStore.getState().selectedTableId).toBe('t-2');
  });

  it('clearSelection resets to null', () => {
    useSelectionStore.getState().selectTable('t-1');
    useSelectionStore.getState().clearSelection();
    expect(useSelectionStore.getState().selectedTableId).toBeNull();
  });

  it('selectTable sets lastSelectionKind to table', () => {
    useSelectionStore.getState().selectTable('t-1');
    expect(useSelectionStore.getState().lastSelectionKind).toBe('table');
  });

  it('selectColumn sets the selected column and lastSelectionKind, independent of the table slot', () => {
    useSelectionStore.getState().selectTable('t-1');
    useSelectionStore.getState().selectColumn('t-1', 'amount');
    expect(useSelectionStore.getState().selectedColumn).toEqual({ tableId: 't-1', column: 'amount' });
    expect(useSelectionStore.getState().lastSelectionKind).toBe('column');
    // Selecting a column never blanks the table slot other consumers (Erd, DatasetMap) rely on.
    expect(useSelectionStore.getState().selectedTableId).toBe('t-1');
  });

  it('selectEdge sets the selected edge id and lastSelectionKind, independent of the other slots', () => {
    useSelectionStore.getState().selectTable('t-1');
    useSelectionStore.getState().selectEdge('edge-1');
    expect(useSelectionStore.getState().selectedEdgeId).toBe('edge-1');
    expect(useSelectionStore.getState().lastSelectionKind).toBe('edge');
    expect(useSelectionStore.getState().selectedTableId).toBe('t-1');
  });

  it('clearSelection resets every slot and lastSelectionKind', () => {
    useSelectionStore.getState().selectTable('t-1');
    useSelectionStore.getState().selectColumn('t-1', 'amount');
    useSelectionStore.getState().selectEdge('edge-1');
    useSelectionStore.getState().clearSelection();
    expect(useSelectionStore.getState()).toMatchObject({
      selectedTableId: null,
      selectedColumn: null,
      selectedEdgeId: null,
      lastSelectionKind: null,
    });
  });
});
