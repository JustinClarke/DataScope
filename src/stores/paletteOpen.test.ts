import { beforeEach, describe, expect, it } from "vitest";
import { usePaletteOpenStore } from "./paletteOpen";

beforeEach(() => {
  usePaletteOpenStore.setState({ open: false });
});

describe("palette-open store", () => {
  it("defaults to closed", () => {
    expect(usePaletteOpenStore.getState().open).toBe(false);
  });

  it("setOpen sets the value directly", () => {
    usePaletteOpenStore.getState().setOpen(true);
    expect(usePaletteOpenStore.getState().open).toBe(true);
    usePaletteOpenStore.getState().setOpen(false);
    expect(usePaletteOpenStore.getState().open).toBe(false);
  });

  it("toggle flips the current value", () => {
    usePaletteOpenStore.getState().toggle();
    expect(usePaletteOpenStore.getState().open).toBe(true);
    usePaletteOpenStore.getState().toggle();
    expect(usePaletteOpenStore.getState().open).toBe(false);
  });
});
