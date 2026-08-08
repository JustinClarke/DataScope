import { describe, expect, it } from "vitest";
import {
  DSPS_VERSION,
  hashBytesHex,
  formatSnapshotLabel,
  passesFactWordingGuard,
  parseDsps,
} from "./dsps";
import { buildStructureReport } from "./structureReport";
import type { TableRegistryEntry } from "../types";

function table(overrides: Partial<TableRegistryEntry>): TableRegistryEntry {
  return {
    id: "t1",
    tableName: "orders",
    datasetId: "d1",
    origin: "file",
    rowCount: 10,
    columnCount: 1,
    memoryBytes: 100,
    createdAt: "2026-07-23T00:00:00.000Z",
    ...overrides,
  };
}

describe("hashBytesHex", () => {
  it("hashes the same bytes identically and different bytes differently", async () => {
    const a = await hashBytesHex(new TextEncoder().encode("hello"));
    const b = await hashBytesHex(new TextEncoder().encode("hello"));
    const c = await hashBytesHex(new TextEncoder().encode("goodbye"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("formatSnapshotLabel", () => {
  it("includes a truncated hash when one is present", () => {
    const label = formatSnapshotLabel({
      date: "2026-07-23T00:00:00.000Z",
      fileHash: "ab12cd34ef56gh78",
    });
    expect(label).toContain("computed as of");
    expect(label).toContain("sha256:ab12cd34ef56");
  });

  it("omits the hash clause entirely when null — a sampled-tier file, never fully buffered", () => {
    const label = formatSnapshotLabel({
      date: "2026-07-23T00:00:00.000Z",
      fileHash: null,
    });
    expect(label).toBe("computed as of Jul 23, 2026");
  });
});

describe("passesFactWordingGuard (D45 — reused from the Verdict seam)", () => {
  it('rejects "verified" and permanence wording', () => {
    expect(passesFactWordingGuard("order_id is verified unique")).toBe(false);
    expect(passesFactWordingGuard("order_id is always unique")).toBe(false);
  });

  it("accepts an honesty-guarded statistic", () => {
    expect(
      passesFactWordingGuard("order_id is 99.8% unique with 4 nulls"),
    ).toBe(true);
  });
});

describe("parseDsps", () => {
  function doc() {
    return buildStructureReport([table({})], []);
  }

  it("round-trips a well-formed document through JSON serialization", () => {
    const built = doc();
    const roundTripped = JSON.parse(JSON.stringify(built));
    const result = parseDsps(roundTripped);
    expect(result).toEqual({ ok: true, doc: built });
  });

  it("accepts a document with the relationships section omitted — the D24 schema-only cut path", () => {
    const built = doc();
    expect("relationships" in built).toBe(false);
    expect(parseDsps(built).ok).toBe(true);
  });

  it("reports the seen version on a major-version mismatch rather than failing opaquely", () => {
    const result = parseDsps({ ...doc(), dspsVersion: "2.0.0" });
    expect(result).toEqual({ ok: false, seenVersion: "2.0.0" });
  });

  it("accepts a newer minor/patch within the current major (forward-compatible)", () => {
    const [major] = DSPS_VERSION.split(".");
    const result = parseDsps({ ...doc(), dspsVersion: `${major}.99.0` });
    expect(result.ok).toBe(true);
  });

  it("tolerates an unknown extra field rather than rejecting it", () => {
    const result = parseDsps({ ...doc(), fromAFutureMinor: true });
    expect(result.ok).toBe(true);
  });

  it('reports "unversioned" when dspsVersion is missing', () => {
    const { dspsVersion, ...rest } = doc();
    void dspsVersion;
    expect(parseDsps(rest)).toEqual({ ok: false, seenVersion: "unversioned" });
  });

  it('reports "unversioned" for a non-object input', () => {
    expect(parseDsps(null)).toEqual({ ok: false, seenVersion: "unversioned" });
    expect(parseDsps("not a doc")).toEqual({
      ok: false,
      seenVersion: "unversioned",
    });
  });

  it("surfaces a malformed tables field even when the version matches — never a downstream crash", () => {
    const result = parseDsps({ ...doc(), tables: "not an array" });
    expect(result).toEqual({ ok: false, seenVersion: DSPS_VERSION });
  });
});
