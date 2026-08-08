import { describe, expect, it } from "vitest";
import { buildPaletteEntries } from "./paletteRegistry";
import type { TableRegistryEntry } from "../types";

function table(id: string, tableName: string): TableRegistryEntry {
  return {
    id,
    tableName,
    datasetId: "d1",
    origin: "sample",
    rowCount: 10,
    columnCount: 1,
    memoryBytes: 100,
    createdAt: new Date().toISOString(),
  };
}

describe("buildPaletteEntries", () => {
  it("always leads with the map entry, enabled", () => {
    const entries = buildPaletteEntries([]);
    expect(entries[0]).toMatchObject({
      id: "map",
      label: "Dataset map",
      enabled: true,
      action: { kind: "open-map" },
    });
  });

  it("names both SQL destinations, since the palette is the only cross-tab launcher (S5)", () => {
    const entries = buildPaletteEntries([]);
    expect(entries[1]).toMatchObject({
      id: "console",
      label: "SQL console",
      enabled: true,
      action: { kind: "open-console" },
    });
    expect(entries[2]).toMatchObject({
      id: "query-tab",
      label: "New query tab",
      enabled: true,
      action: { kind: "new-query-tab" },
    });
    expect(entries.some((e) => e.label === "SQL playground")).toBe(false);
  });

  it("adds one enabled profile entry per table, in table order", () => {
    const entries = buildPaletteEntries([
      table("o", "orders"),
      table("c", "customers"),
    ]);
    expect(entries[3]).toMatchObject({
      id: "profile:o",
      label: "Profile: orders",
      enabled: true,
      action: { kind: "open-profile", tableId: "o" },
    });
    expect(entries[4]).toMatchObject({
      id: "profile:c",
      label: "Profile: customers",
      enabled: true,
      action: { kind: "open-profile", tableId: "c" },
    });
  });

  it("lists the five wired module destinations (W7.5 + S1 ingestion, minus S5’s deleted sql tab), each enabled and real", () => {
    const entries = buildPaletteEntries([]);
    const wired = entries.filter((e) => e.action.kind === "open-module");
    expect(wired.map((e) => e.id).sort()).toEqual(
      ["charts", "correlation", "export", "ingestion", "pivot"].sort(),
    );
    for (const entry of wired) {
      expect(entry.enabled).toBe(true);
      expect(entry.disabledReason).toBeUndefined();
      expect(entry.action).toMatchObject({
        kind: "open-module",
        module: entry.id,
      });
    }
  });

  it("lists the one remaining not-yet-wired destination (ai), disabled with a non-empty reason", () => {
    const entries = buildPaletteEntries([]);
    const notYetWired = entries.filter((e) => e.action.kind === "unavailable");
    expect(notYetWired).toHaveLength(1);
    expect(notYetWired.map((e) => e.id)).toEqual(["ai"]);
    for (const entry of notYetWired) {
      expect(entry.enabled).toBe(false);
      expect(entry.disabledReason).toBeTruthy();
    }
  });

  it("never lists a separate dossier or relationships entry — both superseded by the map entry", () => {
    const entries = buildPaletteEntries([]);
    expect(entries.some((e) => e.id === "dossier")).toBe(false);
    expect(entries.some((e) => e.id === "relationships")).toBe(false);
  });
});
