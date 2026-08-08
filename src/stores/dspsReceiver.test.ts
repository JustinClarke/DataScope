import { beforeEach, describe, expect, it } from "vitest";
import { useDspsReceiverStore } from "./dspsReceiver";
import type { StructureReport } from "../lib/structureReport";

const doc: StructureReport = {
  dspsVersion: "1.0.0",
  generatedAt: "2026-07-23T00:00:00.000Z",
  tables: [],
  insights: [],
};

describe("useDspsReceiverStore (D62 .dsps receiver)", () => {
  beforeEach(() => {
    useDspsReceiverStore.setState({ document: null, error: null });
  });

  it("open() sets the document and clears any prior error", () => {
    useDspsReceiverStore.getState().fail("stale error");
    useDspsReceiverStore.getState().open(doc);
    expect(useDspsReceiverStore.getState()).toMatchObject({
      document: doc,
      error: null,
    });
  });

  it("fail() sets the error and clears any prior document", () => {
    useDspsReceiverStore.getState().open(doc);
    useDspsReceiverStore.getState().fail("not a DSPS document");
    expect(useDspsReceiverStore.getState()).toMatchObject({
      document: null,
      error: "not a DSPS document",
    });
  });

  it("close() clears both", () => {
    useDspsReceiverStore.getState().open(doc);
    useDspsReceiverStore.getState().close();
    expect(useDspsReceiverStore.getState()).toMatchObject({
      document: null,
      error: null,
    });
  });

  // S6.9 / 07d: viewer mode neither persists nor rehydrates. An open .dsps is
  // someone else's document held for as long as it's on screen — a reload
  // that reopened it would resurrect a share the user had already dismissed.
  it("writes nothing to localStorage — viewer mode never persists", () => {
    localStorage.clear();
    useDspsReceiverStore.getState().open(doc);
    expect(localStorage.length).toBe(0);
  });
});
