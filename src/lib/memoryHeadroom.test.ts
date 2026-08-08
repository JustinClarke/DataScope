import { describe, expect, it } from "vitest";
import {
  ESTIMATED_MEMORY_MULTIPLIER,
  estimatedFootprintBytes,
  headroomExceeded,
  type MemorySignals,
} from "./memoryHeadroom";

const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

function signals(overrides: Partial<MemorySignals> = {}): MemorySignals {
  return {
    usedJSHeapSize: null,
    jsHeapSizeLimit: null,
    deviceMemoryGB: null,
    ...overrides,
  };
}

describe("estimatedFootprintBytes", () => {
  it("scales file size by the measured multiplier", () => {
    expect(estimatedFootprintBytes(100)).toBe(
      100 * ESTIMATED_MEMORY_MULTIPLIER,
    );
  });
});

// This is the "simulated" low-headroom-device acceptance criterion — a pure
// function over injected signals rather than a real device, exactly so it's
// unit-testable.
describe("headroomExceeded", () => {
  it("is false with no memory signal available at all — never downgrades on a guess", () => {
    expect(headroomExceeded(200 * MB, signals())).toBe(false);
  });

  it("uses jsHeapSizeLimit + usedJSHeapSize when Chrome exposes performance.memory", () => {
    const lowHeadroom = signals({
      usedJSHeapSize: 1 * GB,
      jsHeapSizeLimit: 2 * GB,
    });
    expect(headroomExceeded(0.9 * GB, lowHeadroom)).toBe(true); // (1 + 0.9) / 2 = 95%
    expect(headroomExceeded(0.1 * GB, lowHeadroom)).toBe(false); // (1 + 0.1) / 2 = 55%
  });

  it("sits exactly on the 70% line as false, just over as true", () => {
    const s = signals({ usedJSHeapSize: 0, jsHeapSizeLimit: 1000 });
    expect(headroomExceeded(700, s)).toBe(false);
    expect(headroomExceeded(701, s)).toBe(true);
  });

  it("falls back to deviceMemory, scaled against its own 8GB reference ceiling", () => {
    // A 4GB-reporting device gets half the ~2GB tab budget (~1GB); 70% of that is 700MB.
    const s = signals({ deviceMemoryGB: 4 });
    expect(headroomExceeded(0.8 * GB, s)).toBe(true);
    expect(headroomExceeded(0.5 * GB, s)).toBe(false);
  });

  it("prefers jsHeapSizeLimit over deviceMemory when both are present", () => {
    const s = signals({
      usedJSHeapSize: 0,
      jsHeapSizeLimit: 100,
      deviceMemoryGB: 999,
    });
    // With deviceMemory's (huge, capped) budget this would read as far under 70%.
    expect(headroomExceeded(71, s)).toBe(true);
  });
});
