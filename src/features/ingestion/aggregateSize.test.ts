import { describe, expect, it } from "vitest";
import {
  AGGREGATE_WARN_THRESHOLD_BYTES,
  aggregateBytes,
  decideSizeTier,
  exceedsAggregateWarnThreshold,
  refusalMessage,
} from "./aggregateSize";

const MB = 1024 * 1024;

function fileOfSize(bytes: number): File {
  return new File([new Uint8Array(bytes)], "f");
}

describe("aggregateBytes", () => {
  it("sums file sizes", () => {
    expect(
      aggregateBytes([fileOfSize(10), fileOfSize(20), fileOfSize(5)]),
    ).toBe(35);
  });

  it("is 0 for an empty batch", () => {
    expect(aggregateBytes([])).toBe(0);
  });
});

describe("exceedsAggregateWarnThreshold", () => {
  it("is false at and below the 50MB threshold", () => {
    expect(exceedsAggregateWarnThreshold(AGGREGATE_WARN_THRESHOLD_BYTES)).toBe(
      false,
    );
    expect(
      exceedsAggregateWarnThreshold(AGGREGATE_WARN_THRESHOLD_BYTES - 1),
    ).toBe(false);
  });

  it("is true just over the threshold", () => {
    expect(
      exceedsAggregateWarnThreshold(AGGREGATE_WARN_THRESHOLD_BYTES + 1),
    ).toBe(true);
  });
});

// Boundary set matches 05-large-files' own test plan exactly.
describe("decideSizeTier", () => {
  it("49MB is full", () => {
    expect(decideSizeTier(49 * MB, false)).toBe("full");
  });

  it("51MB is warn", () => {
    expect(decideSizeTier(51 * MB, false)).toBe("warn");
  });

  it("99MB is still warn", () => {
    expect(decideSizeTier(99 * MB, false)).toBe("warn");
  });

  it("101MB is sampled", () => {
    expect(decideSizeTier(101 * MB, false)).toBe("sampled");
  });

  it("299MB is still sampled", () => {
    expect(decideSizeTier(299 * MB, false)).toBe("sampled");
  });

  it("301MB is refuse", () => {
    expect(decideSizeTier(301 * MB, false)).toBe("refuse");
  });

  it("headroom auto-downgrades an under-threshold file to sampled", () => {
    expect(decideSizeTier(10 * MB, true)).toBe("sampled");
    expect(decideSizeTier(60 * MB, true)).toBe("sampled");
  });

  it("headroom never escalates past sampled — refuse stays refuse regardless", () => {
    expect(decideSizeTier(301 * MB, true)).toBe("refuse");
  });

  it("headroom is moot once size alone already means sampled", () => {
    expect(decideSizeTier(150 * MB, true)).toBe("sampled");
    expect(decideSizeTier(150 * MB, false)).toBe("sampled");
  });
});

describe("refusalMessage", () => {
  it("names the rounded size and all three guidance options", () => {
    const message = refusalMessage(305 * MB);
    expect(message).toContain("~305 MB");
    expect(message).toContain("DuckDB CLI locally");
    expect(message).toContain("sampling the first 100K rows");
    expect(message).toContain("httpfs-readable object storage");
  });
});
