import { beforeEach, describe, expect, it } from "vitest";
import { SELECTION_STORAGE_KEY, useSelectionStore } from "./selection";

beforeEach(() => {
  localStorage.clear();
  useSelectionStore.setState({
    selectedTableId: null,
    selectedColumn: null,
    selectedEdgeId: null,
    lastSelectionKind: null,
  });
});

describe("selection store", () => {
  it("defaults to no selected table", () => {
    expect(useSelectionStore.getState().selectedTableId).toBeNull();
  });

  it("selectTable sets the selected table id", () => {
    useSelectionStore.getState().selectTable("t-1");
    expect(useSelectionStore.getState().selectedTableId).toBe("t-1");
  });

  it("selectTable overwrites a previous selection", () => {
    useSelectionStore.getState().selectTable("t-1");
    useSelectionStore.getState().selectTable("t-2");
    expect(useSelectionStore.getState().selectedTableId).toBe("t-2");
  });

  it("clearSelection resets to null", () => {
    useSelectionStore.getState().selectTable("t-1");
    useSelectionStore.getState().clearSelection();
    expect(useSelectionStore.getState().selectedTableId).toBeNull();
  });

  it("selectTable sets lastSelectionKind to table", () => {
    useSelectionStore.getState().selectTable("t-1");
    expect(useSelectionStore.getState().lastSelectionKind).toBe("table");
  });

  it("selectColumn sets the selected column and lastSelectionKind, independent of the table slot", () => {
    useSelectionStore.getState().selectTable("t-1");
    useSelectionStore.getState().selectColumn("t-1", "amount");
    expect(useSelectionStore.getState().selectedColumn).toEqual({
      tableId: "t-1",
      column: "amount",
    });
    expect(useSelectionStore.getState().lastSelectionKind).toBe("column");
    // Selecting a column never blanks the table slot other consumers (Erd, DatasetMap) rely on.
    expect(useSelectionStore.getState().selectedTableId).toBe("t-1");
  });

  it("selectEdge sets the selected edge id and lastSelectionKind, independent of the other slots", () => {
    useSelectionStore.getState().selectTable("t-1");
    useSelectionStore.getState().selectEdge("edge-1");
    expect(useSelectionStore.getState().selectedEdgeId).toBe("edge-1");
    expect(useSelectionStore.getState().lastSelectionKind).toBe("edge");
    expect(useSelectionStore.getState().selectedTableId).toBe("t-1");
  });

  it("clearSelection resets every slot and lastSelectionKind", () => {
    useSelectionStore.getState().selectTable("t-1");
    useSelectionStore.getState().selectColumn("t-1", "amount");
    useSelectionStore.getState().selectEdge("edge-1");
    useSelectionStore.getState().clearSelection();
    expect(useSelectionStore.getState()).toMatchObject({
      selectedTableId: null,
      selectedColumn: null,
      selectedEdgeId: null,
      lastSelectionKind: null,
    });
  });

  describe("persistence (07c)", () => {
    it("persists all four slots — 07d reconciles them against tables that came back", () => {
      useSelectionStore.getState().selectTable("t-1");
      useSelectionStore.getState().selectColumn("t-1", "amount");

      const raw = localStorage.getItem(SELECTION_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.state).toEqual({
        selectedTableId: "t-1",
        selectedColumn: { tableId: "t-1", column: "amount" },
        selectedEdgeId: null,
        lastSelectionKind: "column",
      });
    });

    it("a persisted payload from an old schema version rehydrates to a safe, cleared default rather than crashing", async () => {
      localStorage.setItem(
        SELECTION_STORAGE_KEY,
        JSON.stringify({
          state: { selectedTableId: 123, lastSelectionKind: "not-a-real-kind" },
          version: 0,
        }),
      );

      await useSelectionStore.persist.rehydrate();

      expect(useSelectionStore.getState()).toMatchObject({
        selectedTableId: null,
        selectedColumn: null,
        selectedEdgeId: null,
        lastSelectionKind: null,
      });
    });
  });
});
