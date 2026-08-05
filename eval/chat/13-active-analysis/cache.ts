import { sha256 } from '../12-verified-claims/artifactWriter';
import type { CompactEvidencePacket, DatasetPassport, ProbeCandidate } from './contracts';

/** Bumped whenever candidate compilation or resolution semantics change; part of the cache key. */
export const COMPILER_VERSION = '13.1.0';

export function datasetContentHash(passport: DatasetPassport): string {
  return sha256(JSON.stringify(passport));
}

/**
 * Cache identity per § Cache and context rules: dataset content hash + normalized candidate
 * definition + compiler version. `repeatId` is the Checkpoint-5-only repeat-isolation key; it
 * must be omitted for the product-shaped (repeat-blind) identity used by Checkpoints 1-4.
 */
export interface CandidateCacheKeyParts {
  datasetHash: string;
  candidate: ProbeCandidate;
  compilerVersion?: string;
  repeatId?: string;
}

export function candidateCacheKey(parts: CandidateCacheKeyParts): string {
  const normalizedCandidate = JSON.stringify(parts.candidate);
  const base = `${parts.datasetHash}|${normalizedCandidate}|${parts.compilerVersion ?? COMPILER_VERSION}`;
  return parts.repeatId === undefined ? sha256(base) : sha256(`${base}|repeat:${parts.repeatId}`);
}

/** A plain deterministic key/value store. Hit/miss bookkeeping belongs to the caller (analysisLoop), which already logs cache events through the artifact writer. */
export class EvidenceCache {
  private readonly store = new Map<string, CompactEvidencePacket>();

  has(key: string): boolean {
    return this.store.has(key);
  }

  get(key: string): CompactEvidencePacket | undefined {
    return this.store.get(key);
  }

  set(key: string, packet: CompactEvidencePacket): void {
    this.store.set(key, packet);
  }

  get size(): number {
    return this.store.size;
  }
}
