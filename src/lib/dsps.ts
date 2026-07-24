// DSPS — the DataScope Profile Spec (D31; promoted to a first-class, open,
// versioned interface, D37; format-first, D64). The machine-readable artifact
// DataScope emits: schema, inferred types, profile aggregates, the insight
// feed, and — from the Join Graph onward (D24) — the relationship graph. Zero
// raw rows by construction (§5). `structureReport.ts` owns the concrete
// document shape (`StructureReport`, exported here as `DspsDocument`) and its
// three renderers; this module owns the spec contract layered on top of it:
// the version, the fact-provenance/snapshot vocabulary, the file-hash used in
// a snapshot label, and the compatibility-aware reader.
import { passesPhrasingGuard } from './producerValidators';

/** Current DSPS major.minor.patch (D37). Bump the major on any breaking change. */
export const DSPS_VERSION = '1.0.0';

/**
 * D45's fact-provenance vocabulary, specific to DSPS: was a fact computed this
 * run, asserted by a user, or carried over from an earlier run without
 * re-verification. (Distinct from `FactProvenance` in `types/actions.ts`, which
 * tags *which detector* produced a Verdict claim — a different axis of the same
 * D45 discipline.) v0 ships every DSPS fact `derived-this-run`; the other two
 * values are format-reserved for user-asserted/carried facts, not yet produced
 * by any module.
 */
export type DspsProvenance = 'derived-this-run' | 'user-asserted' | 'carried-unverified';

/**
 * D45's snapshot label: when a fact was computed, and — when the source is a
 * single ingested file already fully in memory — a SHA-256 hash of its bytes.
 * `fileHash` is `null` for a large (sampled-tier) file, whose bytes are
 * deliberately never fully buffered on the main thread (§7.5's memory
 * headroom), and for non-file origins (api/derived/shared tables) — a named
 * gap, not a silent omission.
 */
export interface DspsSnapshot {
  date: string;
  fileHash: string | null;
}

/** Hex-encoded SHA-256 of `bytes` — the D45 snapshot's file-hash half. */
export async function hashBytesHex(bytes: Uint8Array): Promise<string> {
  // A generic Uint8Array's buffer type-checks as ArrayBufferLike (which
  // includes SharedArrayBuffer), narrower than SubtleCrypto's BufferSource —
  // an arbitrary caller-supplied Uint8Array is never actually
  // SharedArrayBuffer-backed here, only TS's generic typing is imprecise.
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The "computed as of {snapshot}" label text (D45) — never "verified", never permanence-worded. */
export function formatSnapshotLabel(snapshot: DspsSnapshot): string {
  const date = new Date(snapshot.date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return snapshot.fileHash ? `computed as of ${date} (file sha256:${snapshot.fileHash.slice(0, 12)}…)` : `computed as of ${date}`;
}

/** D45's honesty guard, reused verbatim from the Verdict seam (ADR-010) — "verified" and permanence/invariant wording are banned in a fact label. */
export const passesFactWordingGuard = passesPhrasingGuard;

export type DspsParseResult<T> = { ok: true; doc: T } | { ok: false; seenVersion: string };

function majorOf(version: string): string | null {
  const match = /^(\d+)\.\d+\.\d+$/.exec(version);
  return match ? match[1] : null;
}

/**
 * The D37 compatibility-aware reader: forward-compatible (an older-major
 * consumer never reaches this far in practice, but a *newer*-major document
 * read here reports its version rather than being force-cast) and permissive
 * of unknown fields (nothing here strips or rejects extra keys — TypeScript's
 * structural typing plus this function's shape simply reads what it knows).
 * A missing/malformed `dspsVersion` is reported as `'unversioned'` rather than
 * thrown — "surfaces, never fails opaquely" per D37.
 */
export function parseDsps<T extends { dspsVersion?: unknown; tables?: unknown }>(json: unknown): DspsParseResult<T> {
  if (typeof json !== 'object' || json === null) {
    return { ok: false, seenVersion: 'unversioned' };
  }
  const candidate = json as T;
  const version = candidate.dspsVersion;
  if (typeof version !== 'string') {
    return { ok: false, seenVersion: 'unversioned' };
  }
  const seenMajor = majorOf(version);
  const currentMajor = majorOf(DSPS_VERSION);
  if (seenMajor === null || seenMajor !== currentMajor) {
    return { ok: false, seenVersion: version };
  }
  // A version match still isn't a shape guarantee for untrusted input (e.g.
  // the .dsps receiver, D62, reading an arbitrary dropped file) — `tables`
  // missing/malformed surfaces the same way a version mismatch does, never a
  // downstream crash trying to `.map` over it.
  if (!Array.isArray(candidate.tables)) {
    return { ok: false, seenVersion: version };
  }
  return { ok: true, doc: candidate };
}
