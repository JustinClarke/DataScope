import { describe, expect, it } from "vitest";
import { applyAuthority, AUTHORITY_STATEMENTS } from "./authority";
import type { Executor } from "./types";

function recordingExecutor(refuse: RegExp = /$^/) {
  const statements: string[] = [];
  const executor: Executor = {
    engine: "duckdb-native",
    async execute(sql) {
      statements.push(sql);
      if (refuse.test(sql))
        throw new Error(`Invalid Input Error: cannot set ${sql}`);
      return { columnNames: [], rows: [], elapsedMs: 0 };
    },
  };
  return { executor, statements };
}

describe("the sealed profile", () => {
  it("applies the full §11.5 lockdown", async () => {
    const { executor, statements } = recordingExecutor();
    const report = await applyAuthority(executor, "sealed");

    expect(statements).toEqual([...AUTHORITY_STATEMENTS.sealed]);
    expect(report.refused).toEqual([]);
    expect(report.applied).toHaveLength(5);
  });

  it("sets external access before disabling the filesystem, and locks last", () => {
    const order = AUTHORITY_STATEMENTS.sealed;
    // Measured, not assumed: with `disabled_filesystems` applied first, DuckDB
    // refuses the `enable_external_access` write itself; and every option write
    // after `lock_configuration` fails.
    expect(
      order.findIndex((s) => s.includes("enable_external_access")),
    ).toBeLessThan(order.findIndex((s) => s.includes("disabled_filesystems")));
    expect(order.at(-1)).toContain("lock_configuration");
  });

  it("records what an engine refused rather than throwing", async () => {
    const { executor } = recordingExecutor(/lock_configuration/);
    const report = await applyAuthority(executor, "sealed");

    expect(report.applied).toHaveLength(4);
    expect(report.refused).toHaveLength(1);
    expect(report.refused[0]!.statement).toContain("lock_configuration");
  });
});

describe("the shared profile", () => {
  /**
   * The regression guard for §7 ingestion. `enable_external_access = false`
   * disables the filesystem layer `read_csv_auto` uses to reach a *registered*
   * buffer, so applying it in the tab would mean no second file drop for the
   * life of the page; `lock_configuration = true` would freeze `memory_limit`
   * with it. Both are measured behaviours of DuckDB 1.4, not guesses.
   */
  it("never applies a setting that would end ingestion or freeze the engine", () => {
    const joined = AUTHORITY_STATEMENTS.shared.join(" ");
    expect(joined).not.toContain("enable_external_access");
    expect(joined).not.toContain("lock_configuration");
    expect(joined).not.toContain("disabled_filesystems");
  });

  it("still disables extension autoload and autoinstall", async () => {
    const { executor, statements } = recordingExecutor();
    await applyAuthority(executor, "shared");
    expect(statements).toEqual([
      "SET autoinstall_known_extensions = false",
      "SET autoload_known_extensions = false",
    ]);
  });
});

describe("what the engine cannot promise", () => {
  it("never claims a read-only catalog", async () => {
    const { executor } = recordingExecutor();
    // `ATTACH ... (READ_ONLY)` is rejected outright for an in-memory database,
    // and DataScope's tables are in-memory. Saying so here keeps a caller from
    // inferring a guarantee no profile delivers.
    expect((await applyAuthority(executor, "sealed")).catalogReadOnly).toBe(
      false,
    );
    expect((await applyAuthority(executor, "shared")).catalogReadOnly).toBe(
      false,
    );
  });
});
