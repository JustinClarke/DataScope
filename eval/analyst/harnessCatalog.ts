// The conformance harness's catalog seam (A3).
//
// The browser's implementation (`src/services/analyst.ts`) routes a derivation
// into the app registry through `services/transforms.ts`. Node has no registry
// and no store, so this supplies the one thing the core actually asks the seam
// for: which objects exist, who made them, and with what statement. It runs the
// statement the core composed and records the answer — nothing else.
//
// D74(d): `eval/` is exempt as a harness, not as precedent. This is deliberately
// *not* a second product path — it registers nothing, profiles nothing, and is
// unreachable from the app.
import type { Catalog, CatalogObject, Executor } from '../../src/lib/analyst/types';

export function createHarnessCatalog(executor: Executor, sourceNames: readonly string[]): Catalog {
  // Insertion-ordered, so `objects()` returns the same sequence on both engines
  // — the ordering is itself part of what conformance compares.
  const derived = new Map<string, CatalogObject>();

  return {
    async objects(): Promise<CatalogObject[]> {
      return [
        ...sourceNames.map((name): CatalogObject => ({ name, kind: 'table', origin: 'source' })),
        ...derived.values(),
      ];
    },

    async derive({ name, sql, kind }) {
      await executor.execute(sql);
      const object: CatalogObject = { name, kind, origin: 'derived', generatingSql: sql };
      derived.set(name, object);
      return object;
    },

    async drop({ name, sql }) {
      await executor.execute(sql);
      derived.delete(name);
    },
  };
}
