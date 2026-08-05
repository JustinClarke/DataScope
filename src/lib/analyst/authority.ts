// Read-only as an engine and process property, not a parser property
// (A0, master §11.5, D74).
//
// The two profiles exist because the lockdown master §11.5 describes is a
// *process*-wide posture and DataScope's tab is not a dedicated process. Both
// halves were measured against DuckDB 1.4 (wasm and native) rather than
// assumed — see `00-analyst-core.md`:
//
//   - `enable_external_access = false` blocks reads through DuckDB's
//     filesystem layer, which is the same layer `read_csv_auto` uses to reach
//     a *registered* file buffer. Applying it in the tab would end ingestion
//     for the life of the page, so a user could not drop a second file.
//   - `lock_configuration = true` then freezes every option globally,
//     `memory_limit` included, for the life of the process.
//   - `ATTACH ... (READ_ONLY)` is rejected outright for an in-memory database
//     ("Cannot launch in-memory database in read-only mode"), and DataScope's
//     tables are in-memory, so a catalog-level read-only guarantee is not
//     available to the tab at all.
//
// So `sealed` is the profile master §11.5 specifies, and it is real wherever
// the core owns its own process (the eval harness, and any future companion).
// `shared` is what the tab can actually apply without breaking §7's ingestion.
// The difference is recorded rather than papered over: in `shared`, the
// statement gate in `core.ts` is what refuses a mutation at `run_sql`, and it
// is a clear error rather than a security boundary.
import type { Executor } from './types';

export type AuthorityProfile = 'shared' | 'sealed';

/**
 * Order is load-bearing: `enable_external_access` must be set *before*
 * `disabled_filesystems`, because once the local filesystem is disabled DuckDB
 * refuses the option write itself ("File system LocalFileSystem has been
 * disabled by configuration"). `lock_configuration` goes last for the same
 * reason — it forbids every option write after it.
 */
const SEALED: readonly string[] = [
  'SET enable_external_access = false',
  "SET disabled_filesystems = 'LocalFileSystem'",
  'SET autoinstall_known_extensions = false',
  'SET autoload_known_extensions = false',
  'SET lock_configuration = true',
];

/** The subset that does not disable the path ingestion reads through. */
const SHARED: readonly string[] = [
  'SET autoinstall_known_extensions = false',
  'SET autoload_known_extensions = false',
];

export const AUTHORITY_STATEMENTS: Record<AuthorityProfile, readonly string[]> = {
  shared: SHARED,
  sealed: SEALED,
};

export interface AuthorityReport {
  profile: AuthorityProfile;
  applied: string[];
  refused: Array<{ statement: string; message: string }>;
  /** False for every in-memory DuckDB — stated so no caller infers a guarantee the engine cannot give. */
  catalogReadOnly: boolean;
}

export async function applyAuthority(
  executor: Executor,
  profile: AuthorityProfile,
): Promise<AuthorityReport> {
  const applied: string[] = [];
  const refused: AuthorityReport['refused'] = [];
  for (const statement of AUTHORITY_STATEMENTS[profile]) {
    try {
      await executor.execute(statement);
      applied.push(statement);
    } catch (error) {
      refused.push({ statement, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { profile, applied, refused, catalogReadOnly: false };
}
