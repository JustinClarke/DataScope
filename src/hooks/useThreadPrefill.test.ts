import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useThreadPrefill } from "./useThreadPrefill";
import { useUIStore } from "../stores/ui";

beforeEach(() => {
  useUIStore.setState({
    activeModule: "ingestion",
    activeTabId: null,
    pendingPrefill: null,
  });
});

describe("useThreadPrefill", () => {
  it("with no argument, reads the old shell's global pendingPrefill once and clears it", () => {
    useUIStore
      .getState()
      .setActiveModule("sql", null, { tableName: "orders", columns: [] });

    const { result } = renderHook(() => useThreadPrefill());

    expect(result.current).toEqual({ tableName: "orders", columns: [] });
    expect(useUIStore.getState().pendingPrefill).toBeNull();
  });

  it("with no argument and nothing pending, returns null and never calls clearPendingPrefill", () => {
    const { result } = renderHook(() => useThreadPrefill());
    expect(result.current).toBeNull();
  });

  it("an explicit override (W7.5) wins outright and never reads or clears the global store", () => {
    useUIStore
      .getState()
      .setActiveModule("sql", null, { tableName: "customers", columns: [] });

    const { result } = renderHook(() =>
      useThreadPrefill({ tableName: "orders", columns: ["a"] }),
    );

    expect(result.current).toEqual({ tableName: "orders", columns: ["a"] });
    // The global store's own prefill is untouched.
    expect(useUIStore.getState().pendingPrefill).toEqual({
      tableName: "customers",
      columns: [],
    });
  });

  it("an explicit `null` override (a Workbench tab with genuinely no prefill) also wins, never falling through to the global", () => {
    useUIStore
      .getState()
      .setActiveModule("sql", null, { tableName: "customers", columns: [] });

    const { result } = renderHook(() => useThreadPrefill(null));

    expect(result.current).toBeNull();
    expect(useUIStore.getState().pendingPrefill).toEqual({
      tableName: "customers",
      columns: [],
    });
  });

  it("the override is captured once on mount — a later re-render with a different override does not change the returned value", () => {
    const { result, rerender } = renderHook(
      ({ prefill }) => useThreadPrefill(prefill),
      {
        initialProps: {
          prefill: { tableName: "orders", columns: [] } as Record<
            string,
            unknown
          > | null,
        },
      },
    );
    expect(result.current).toEqual({ tableName: "orders", columns: [] });

    rerender({ prefill: { tableName: "customers", columns: [] } });
    expect(result.current).toEqual({ tableName: "orders", columns: [] });
  });
});
