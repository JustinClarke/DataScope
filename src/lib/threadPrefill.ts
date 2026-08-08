// Typed accessors over a ThreadConfig's `prefilledConfig` (D68e) — a
// deliberately open `Record<string, unknown>` (Action Broker → module, never
// module → module), so every consumer parses it defensively rather than
// trusting a shared shape across that boundary. Pure; no store access.

/** A `ThreadConfig.prefilledConfig` (or its absence) as handed to a consuming module. */
export type ModulePrefill = Record<string, unknown> | null;

export function prefillTableName(prefill: ModulePrefill): string | null {
  const value = prefill?.tableName;
  return typeof value === "string" ? value : null;
}

export function prefillColumns(prefill: ModulePrefill): string[] {
  const value = prefill?.columns;
  return Array.isArray(value)
    ? value.filter((c): c is string => typeof c === "string")
    : [];
}

export function prefillString(
  prefill: ModulePrefill,
  key: string,
): string | null {
  const value = prefill?.[key];
  return typeof value === "string" ? value : null;
}
