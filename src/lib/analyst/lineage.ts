// Lineage over derived objects (A3, master §11.5, §12.1).
//
// Deliberately **not** a seventeenth catalog entry. Master §11.5 enumerates the
// operation catalog and states it is near its practical ceiling — small models
// degrade as the tool list grows — so lineage is carried by the operations that
// already exist: `describe_table` notes where a derived object came from and
// what depends on it, and `drop_derived` names the dependents a drop would
// orphan. Nothing here queries the engine; the edge set is already implied by
// the `generatingSql` the registry records per derived object.

/**
 * Which known objects the SQL text mentions — matched against catalog names
 * rather than parsed from the plan, so the answer is identical on both engines
 * regardless of plan-formatting drift (verified in A1: DuckDB's `EXPLAIN`
 * output was byte-identical wasm vs native, but the plan is not a stable public
 * contract to build a required field on). `validate_sql` reports this set and
 * lineage is built from it — one matcher, two callers.
 */
export function findReferencedObjects(
  sql: string,
  knownNames: readonly string[],
): string[] {
  const found = new Set<string>();
  for (const name of knownNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const bare = new RegExp(`(?<![a-zA-Z0-9_])${escaped}(?![a-zA-Z0-9_])`, "i");
    if (bare.test(sql) || sql.includes(`"${name.replace(/"/g, '""')}"`))
      found.add(name);
  }
  return [...found].sort();
}

export interface LineageNode {
  name: string;
  generatingSql?: string;
}

export interface Lineage {
  /** Objects this one reads — direct inputs only, not the transitive closure. */
  sources: string[];
  /** Objects whose own `generatingSql` reads this one. Dropping this orphans them. */
  dependents: string[];
}

/**
 * One object's immediate neighbours in both directions.
 *
 * Direct edges only, and that is the useful answer rather than a shortcut: the
 * question undo has to make comprehensible is "what breaks if this goes away",
 * and what breaks first is exactly the set that reads it. A transitive closure
 * would report objects that break *because* those broke, which is a different
 * claim than the one being made.
 *
 * An object never counts as its own source, so a `CREATE TABLE x AS SELECT …
 * FROM x` rebuild is not reported as depending on itself.
 */
export function lineageOf(
  name: string,
  objects: readonly LineageNode[],
): Lineage {
  const names = objects.map((o) => o.name);
  const self = objects.find((o) => o.name === name);

  const sources = self?.generatingSql
    ? findReferencedObjects(self.generatingSql, names).filter((n) => n !== name)
    : [];

  const dependents = objects
    .filter((o) => o.name !== name && o.generatingSql !== undefined)
    .filter((o) => findReferencedObjects(o.generatingSql!, [name]).length > 0)
    .map((o) => o.name)
    .sort();

  return { sources, dependents };
}

/** The deterministic, factual sentence the derive operations and `describe_table` attach — never advice, per the `OpResult.note` contract. */
export function lineageNote(lineage: Lineage): string | undefined {
  const parts: string[] = [];
  if (lineage.sources.length > 0)
    parts.push(`Derived from ${lineage.sources.join(", ")}.`);
  if (lineage.dependents.length > 0) {
    parts.push(
      `${lineage.dependents.length} object(s) derive from this: ${lineage.dependents.join(", ")}.`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}
