// Checkpoint 3 — exact-duplicate identity (§ "The only build 15A requires"
// #2: "The five-relation ledger slice... plus exact-duplicate identity").
//
// Exact hashing only, deliberately: the deferred design-history packet's
// warning ("two different SQL statements that happen to mean the same thing
// remain distinct") is the ceiling 15A itself asks for — nothing here claims
// semantic equivalence.
import { createHash } from 'node:crypto';
import type { OpSchemaField } from '../../../src/lib/analyst/types';

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Stable across construction order — two objects with the same keys in a different order canonicalize identically. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * The pre-execution identity: same dataset revision, same operation, same
 * canonical parameters. Two attempts sharing this hash are exact duplicates
 * of *intent* — whether they'd also produce the same *result* is
 * `computeResultHash`'s question, not this one, because a changed dataset can
 * make an identical request hash produce a different result.
 */
export function computeRequestHash(input: { datasetRevision: string; operation: string; parameters: unknown }): string {
  return sha256Hex(canonicalJson(input));
}

/**
 * The observed-output identity. Order-sensitive by design: the deferred
 * packet flags that an unordered relation needs either a canonical-multiset
 * hash or an explicit note that the digest is materialization-order-specific.
 * This takes the second, simpler option — it hashes exactly the materialized
 * row order. Two runs of an unordered query returning rows in a different
 * order will not compare equal here; that is a false negative on semantic
 * equivalence, never a false positive, which is the safe direction for an
 * exact-duplicate-only mechanism.
 */
export function computeResultHash(input: { schema: readonly OpSchemaField[]; rows: readonly unknown[][] }): string {
  return sha256Hex(canonicalJson({ schema: input.schema, rows: input.rows }));
}
