// The tab's analyst core (A0, master §11.5, D74) — one instance per page.
//
// Same lazy-engine pattern as `services/sql.ts` and `services/ingestion.ts`:
// duckdb-wasm and its multi-MB payload are only pulled once an operation
// actually runs, so the core costs nothing at start-up.
//
// The `shared` authority profile is deliberate and is explained in
// `lib/analyst/authority.ts`: the full §11.5 lockdown is a whole-process
// posture, and this process is also DataScope's ingestion path.
import { createAnalystCore, type AnalystCore } from "../lib/analyst/core";
import { createWasmExecutor } from "../lib/analyst/executors/duckdbWasm";
import type { Catalog, CatalogObject, Workspace } from "../lib/analyst/types";
import { useDatasetsStore } from "../stores/datasets";
import { openQueryTab } from "./queryTabs";
import { runTransformDetailed } from "./transforms";

type EngineModule = typeof import("../workers/duckdb.worker");
let engineModule: Promise<EngineModule> | null = null;
function loadEngine(): Promise<EngineModule> {
  if (!engineModule) engineModule = import("../workers/duckdb.worker");
  return engineModule;
}

/**
 * The tab's catalog seam (A3) — the registry half of a derivation, which the
 * executor interface deliberately cannot express.
 *
 * **Why `runTransformDetailed` and not `runPath.requestRun`.** The guard is not
 * in `runPath`: `runPath` is the *UI* entrance to it, and what it adds on top —
 * hoisting the guard modal, and driving the console's Results/History panel —
 * is wrong for an operation, which has to return its outcome to a caller and
 * must not overwrite whatever the user has on screen. The interception itself
 * (`isSourceMutation` → `MutationGuardRequired`) lives in `transforms.ts`, so
 * calling the same function the console's run path calls is what "one path"
 * means here. A derive route that reached `duckDBEngine` directly would be the
 * data-loss path D73 legislated against, and `analyst.paths.test.ts` fails if
 * one appears.
 */
const tabCatalog: Catalog = {
  async objects(): Promise<CatalogObject[]> {
    return useDatasetsStore.getState().tables.map((table) => ({
      name: table.tableName,
      kind: table.kind ?? "table",
      origin: table.origin === "derived" ? "derived" : "source",
      ...(table.generatingSql === undefined
        ? {}
        : { generatingSql: table.generatingSql }),
    }));
  },

  async derive({ name, sql, kind }) {
    const { registered } = await runTransformDetailed(sql);
    if (!registered) {
      // Unreachable through the core, which only ever composes a CREATE
      // TABLE/VIEW AS here — but a silent `undefined` would register nothing
      // and still report success, which is the one outcome worth a throw.
      throw new Error(
        `"${name}" was not registered — the statement was not a derivation.`,
      );
    }
    return {
      name: registered.tableName,
      kind: registered.kind ?? kind,
      origin: "derived",
      ...(registered.generatingSql === undefined
        ? {}
        : { generatingSql: registered.generatingSql }),
    };
  },

  async drop({ sql }) {
    await runTransformDetailed(sql);
  },
};

/**
 * The tab's workspace seam (A6) — where a pinned result lands.
 *
 * **The whole implementation is one `openQueryTab` call, and that is the
 * requirement, not an economy.** S5 built query tabs with two producers
 * (pin-from-console, a chosen Suggested Exploration) behind that single creation
 * path; this is the third, and it is indistinguishable from the other two
 * because it *is* them. Per-instance, never deduped, its own editor and Run —
 * all of it inherited rather than re-established.
 *
 * The tab envelope is authored here, by app code, from this function's own typed
 * arguments (D55/D71). Nothing the model sent reaches it: `title` becomes the
 * tab's *name*, and the rest of the request is result data. `openQueryTab` has
 * no parameter that could take an envelope field even if one were passed.
 */
export const tabWorkspace: Workspace = {
  async pin({
    title,
    sql,
    resultId,
    schema,
    rows,
    rowCount,
    nextOffset,
    elapsedMs,
  }) {
    // A released body still pins — the SQL is what makes the tab useful — but it
    // adopts no result, so the tab opens empty with its query ready to run
    // rather than showing zero rows as though that were the answer.
    const result =
      rows.length > 0
        ? {
            columnNames: schema.map((f) => f.name),
            columnTypes: schema.map((f) => f.type),
            rows,
            rowCount,
            executionTimeMs: elapsedMs,
            resultId,
            nextOffset,
          }
        : undefined;
    return { id: openQueryTab({ sql, name: title, result, resultSql: sql }) };
  },
};

let core: AnalystCore | null = null;

export function analystCore(): AnalystCore {
  if (!core) {
    core = createAnalystCore(
      createWasmExecutor(async (sql, options) =>
        (await loadEngine()).duckDBEngine.execute(sql, options),
      ),
      { authority: "shared", catalog: tabCatalog, workspace: tabWorkspace },
    );
  }
  return core;
}

/** Drops every retained materialization — the engine-side half of "Clear workspace data". */
export async function resetAnalystCore(): Promise<void> {
  await core?.close();
  core = null;
}
