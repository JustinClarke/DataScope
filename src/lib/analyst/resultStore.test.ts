import { describe, expect, it } from "vitest";
import {
  bytesPerRow,
  chargedBytes,
  estimateBytes,
  ResultStore,
  ResultTooLargeError,
} from "./resultStore";
import type { ExecutedStatement, Executor, OpSchemaField } from "./types";

// A scripted engine rather than a real one: eviction order, receipts and the
// "materialize once" property are decisions this file makes, and they are
// clearer to assert against a fake that records exactly which statements ran.
// The real engines are covered by `eval/analyst/conformance.test.ts`.
interface FakeTable {
  schema: OpSchemaField[];
  rows: unknown[][];
}

function fakeExecutor(
  source: FakeTable,
): Executor & { statements: string[]; live: Set<string> } {
  const tables = new Map<string, FakeTable>();
  const statements: string[] = [];
  const reply = (
    columnNames: string[],
    rows: unknown[][],
  ): ExecutedStatement => ({
    columnNames,
    rows,
    elapsedMs: 1,
  });

  return {
    engine: "duckdb-wasm",
    statements,
    live: new Set<string>(),
    async execute(sql: string) {
      statements.push(sql);
      // Below the pragma's one-decimal reporting resolution, which is the case
      // `chargedBytes` falls back to the type estimate for.
      if (sql === "PRAGMA database_size")
        return reply(["memory_usage"], [["0.0 MiB"]]);
      const created = sql.match(/^CREATE TEMP TABLE "([^"]+)" AS/);
      if (created) {
        tables.set(created[1]!, source);
        this.live.add(created[1]!);
        return reply(["Count"], [[source.rows.length]]);
      }
      const counted = sql.match(/^SELECT count\(\*\) FROM "([^"]+)"/);
      if (counted)
        return reply(
          ["count_star()"],
          [[tables.get(counted[1]!)!.rows.length]],
        );

      const described = sql.match(/table_name = '([^']+)'/);
      if (described) {
        return reply(
          ["column_name", "data_type"],
          tables
            .get(described[1]!)!
            .schema.map((field) => [field.name, field.type]),
        );
      }
      const paged = sql.match(
        /FROM "([^"]+)" ORDER BY "__ds_ord" LIMIT (\d+) OFFSET (\d+)/,
      );
      if (paged) {
        const table = tables.get(paged[1]!)!;
        const offset = Number(paged[3]);
        return reply(
          table.schema.map((f) => f.name),
          table.rows.slice(offset, offset + Number(paged[2])),
        );
      }
      const dropped = sql.match(/^DROP TABLE IF EXISTS "([^"]+)"/);
      if (dropped) {
        tables.delete(dropped[1]!);
        this.live.delete(dropped[1]!);
        return reply([], []);
      }
      throw new Error(`unscripted statement: ${sql}`);
    },
  };
}

const SCHEMA: OpSchemaField[] = [
  { name: "id", type: "BIGINT" },
  { name: "label", type: "VARCHAR" },
];

function dataset(rowCount: number): FakeTable {
  return {
    schema: SCHEMA,
    rows: Array.from({ length: rowCount }, (_, i) => [i, `row-${i}`]),
  };
}

describe("byte estimation", () => {
  it("charges fixed-width types their real width", () => {
    expect(bytesPerRow("BOOLEAN")).toBe(1);
    expect(bytesPerRow("INTEGER")).toBe(4);
    expect(bytesPerRow("BIGINT")).toBe(8);
    expect(bytesPerRow("TIMESTAMP")).toBe(8);
    expect(bytesPerRow("HUGEINT")).toBe(16);
  });

  it("scales DECIMAL by its precision", () => {
    expect(bytesPerRow("DECIMAL(4,2)")).toBe(2);
    expect(bytesPerRow("DECIMAL(9,2)")).toBe(4);
    expect(bytesPerRow("DECIMAL(18,4)")).toBe(8);
    expect(bytesPerRow("DECIMAL(38,4)")).toBe(16);
  });

  it("charges nested types a flat overestimate so a store full of them refuses early", () => {
    expect(bytesPerRow("INTEGER[]")).toBe(64);
    expect(bytesPerRow("STRUCT(a INTEGER)")).toBe(64);
    expect(bytesPerRow("MAP(VARCHAR, INTEGER)")).toBe(64);
  });

  it("includes the ordinal column the store adds", () => {
    // 8 (BIGINT) + 32 (VARCHAR) + 8 (ordinal) = 48 per row.
    expect(estimateBytes(SCHEMA, 10)).toBe(480);
  });

  it("charges the greater of the estimate and what the engine actually took", () => {
    // A0's measurement: the estimate over-charges ~24-char text (safe) and
    // under-charges ~120-char text by 4× (not safe), while the engine's own
    // figure rounds to zero below ~100 KB. The maximum is right both ways.
    expect(chargedBytes(130 * 1024 * 1024, 517 * 1024 * 1024)).toBe(
      517 * 1024 * 1024,
    );
    expect(chargedBytes(480, 0)).toBe(480);
  });
});

describe("materialize once, page from that materialization", () => {
  it("runs the caller SQL exactly once, however many pages are read", async () => {
    const executor = fakeExecutor(dataset(25));
    const store = new ResultStore(executor);
    const { entry } = await store.materialize("run_sql", "SELECT * FROM t");

    await store.page(entry.id, 0, 10);
    await store.page(entry.id, 10, 10);
    await store.page(entry.id, 20, 10);

    const creates = executor.statements.filter((s) =>
      s.startsWith("CREATE TEMP TABLE"),
    );
    expect(creates).toHaveLength(1);
    expect(creates[0]).toContain("row_number() OVER ()");
    expect(creates[0]).toContain("SELECT * FROM t");
  });

  it("pages a stable window and stops at the end", async () => {
    const store = new ResultStore(fakeExecutor(dataset(25)));
    const { entry } = await store.materialize("run_sql", "SELECT * FROM t");
    expect(entry.rowCount).toBe(25);
    expect(entry.schema).toEqual(SCHEMA);

    const first = await store.page(entry.id, 0, 10);
    expect(first!.rows[0]).toEqual([0, "row-0"]);
    expect(first!.nextOffset).toBe(10);

    const last = await store.page(entry.id, 20, 10);
    expect(last!.rows).toHaveLength(5);
    expect(last!.nextOffset).toBeNull();
  });

  it("never loops when a caller asks past the end", async () => {
    const store = new ResultStore(fakeExecutor(dataset(5)));
    const { entry } = await store.materialize("run_sql", "SELECT * FROM t");
    const page = await store.page(entry.id, 500, 10);
    expect(page!.rows).toHaveLength(0);
    expect(page!.nextOffset).toBeNull();
  });

  it("refuses a result that cannot fit an empty store, and leaves nothing behind", async () => {
    const executor = fakeExecutor(dataset(1000));
    const store = new ResultStore(executor, 1000);
    await expect(
      store.materialize("run_sql", "SELECT * FROM t"),
    ).rejects.toBeInstanceOf(ResultTooLargeError);
    expect(executor.live.size).toBe(0);
  });
});

describe("compaction", () => {
  it("replaces the body with a receipt that read_result can still reach", async () => {
    // Two results of 480 bytes each; the ceiling admits one.
    const executor = fakeExecutor(dataset(10));
    const store = new ResultStore(executor, 600);

    const first = await store.materialize("run_sql", "SELECT 1");
    const second = await store.materialize("run_sql", "SELECT 2");

    const compacted = store.receipt(first.entry.id)!;
    expect(compacted.materialized).toBe(false);
    expect(compacted.sql).toBe("SELECT 1");
    expect(compacted.schema).toEqual(SCHEMA);
    expect(compacted.rowCount).toBe(10);
    expect(await store.page(first.entry.id, 0, 10)).toBeNull();

    expect(store.receipt(second.entry.id)!.materialized).toBe(true);
    expect(executor.live.size).toBe(1);
  });

  it("retains a result that contributed to a statement ahead of a merely recent one", async () => {
    const store = new ResultStore(fakeExecutor(dataset(10)), 1100);
    const contributing = await store.materialize("run_sql", "SELECT 1");
    const recent = await store.materialize("run_sql", "SELECT 2");
    store.markContributed(contributing.entry.id);

    // A third result forces one eviction; the contributing one must survive it
    // even though it is the older and less recently read of the two.
    await store.materialize("run_sql", "SELECT 3");

    expect(store.receipt(contributing.entry.id)!.materialized).toBe(true);
    expect(store.receipt(recent.entry.id)!.materialized).toBe(false);
  });

  it("evicts the least recently read first when contribution does not separate them", async () => {
    const store = new ResultStore(fakeExecutor(dataset(10)), 1100);
    const older = await store.materialize("run_sql", "SELECT 1");
    const newer = await store.materialize("run_sql", "SELECT 2");
    // Reading the older one makes the newer one the least recently read.
    await new Promise((resolve) => setTimeout(resolve, 2));
    await store.page(older.entry.id, 0, 1);

    await store.materialize("run_sql", "SELECT 3");

    expect(store.receipt(older.entry.id)!.materialized).toBe(true);
    expect(store.receipt(newer.entry.id)!.materialized).toBe(false);
  });

  it("drops every body on reset", async () => {
    const executor = fakeExecutor(dataset(10));
    const store = new ResultStore(executor);
    await store.materialize("run_sql", "SELECT 1");
    await store.materialize("run_sql", "SELECT 2");
    expect(store.usedBytes()).toBeGreaterThan(0);

    await store.reset();
    expect(executor.live.size).toBe(0);
    expect(store.usedBytes()).toBe(0);
    expect(store.inventory()).toEqual([]);
  });
});
