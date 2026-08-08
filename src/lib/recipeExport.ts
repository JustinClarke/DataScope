// Reproducible transform recipe (§12.1, D53) — every derived table already
// records its generating SQL (03-table-registry's `generatingSql` field), so
// a session's sequence of transforms *is* a recipe for free; this just
// orders and formats it as a re-runnable `.sql` artifact. One-click re-run
// against a freshly dropped file is v0.5 — v0 ships the export only.
import type { TableRegistryEntry } from "../types";

export function buildRecipeScript(tables: TableRegistryEntry[]): string {
  const derived = tables
    .filter(
      (t): t is TableRegistryEntry & { generatingSql: string } =>
        t.origin === "derived" && !!t.generatingSql,
    )
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (derived.length === 0) return "-- No transforms recorded this session.\n";

  const statements = derived.map(
    (t) => `-- ${t.tableName}\n${t.generatingSql.trim().replace(/;\s*$/, "")};`,
  );
  return (
    `-- DataScope transform recipe — ${derived.length} statement${derived.length === 1 ? "" : "s"}, ` +
    `in the order they ran.\n\n${statements.join("\n\n")}\n`
  );
}
