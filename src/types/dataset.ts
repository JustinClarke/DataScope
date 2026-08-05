import type { ClassifiedColumn, ColumnProfile } from './schema';

/** One ingestion event — a dropped file, folder, API fetch, or bundled sample (§7.5). */
export interface Dataset {
  id: string;
  name: string;
  sourceType: 'file' | 'folder' | 'api' | 'sample' | 'derived' | 'shared';
  /** Table names this ingestion registered — one for a single file, several for a folder drop. */
  tableNames: string[];
  ingestedAt: string;
}

/**
 * One row in the sidebar table list (§7.5) — the `QueryEngine`-managed catalog
 * every downstream module reads (profiling, classification, capabilities,
 * export, AI, drift; D49/D58). The engine executes; the registry owns loaded
 * and derived tables, their metadata, memory accounting, origin, replacement,
 * and removal.
 */
export interface TableRegistryEntry {
  id: string;
  tableName: string;
  datasetId: string;
  origin: 'file' | 'derived' | 'api' | 'sample' | 'shared';
  /**
   * What the object actually is in DuckDB (A3, §11.5). Absent means `'table'` —
   * every entry written before views existed is one, and a default here beats
   * a migration that rewrites persisted rows to say what they already implied.
   * A `'view'` is always `origin: 'derived'`: it stores no rows, so its
   * `memoryBytes` is 0 and its `generatingSql` is the whole of it.
   */
  kind?: 'table' | 'view';
  rowCount: number;
  columnCount: number;
  memoryBytes: number;
  createdAt: string;
  /** Present once §8 step 1 (SUMMARIZE extraction) has run for this table. */
  profile?: ColumnProfile[];
  /** Present once §8 step 2 (semantic classification) has run for this table. */
  columns?: ClassifiedColumn[];
  /** Present for `origin: 'derived'` tables — the `CREATE TABLE AS` that produced it (§12.1). Powers undo/redo/replay. */
  generatingSql?: string;
  /** True when the source exceeded the sampled-preview size tier — this table holds `sampleRowLimit` rows, not the full source. */
  sampled?: boolean;
  /** Row cap applied at ingest when `sampled` is true. */
  sampleRowLimit?: number;
  /** Present for `origin: 'api'` tables — the URL "Refresh from source" (§7.4) re-fetches. */
  sourceUrl?: string;
  /** ISO timestamp of the most recent successful fetch — set at ingest and updated by each "Refresh from source" (§7.4). */
  lastFetchedAt?: string;
  /** True when this `origin: 'derived'` table's `generatingSql` references a table that has since been refreshed from its source (§7.4) — not auto-rebuilt, just flagged (§12.1). */
  stale?: boolean;
  /**
   * SHA-256 hex of the source file's bytes (D45's DSPS snapshot label) — only
   * for a non-sampled `origin: 'file'`/`'sample'` table, whose bytes are
   * already fully in memory at ingest time. `undefined` for a sampled-tier
   * file (never fully buffered, by design) and for api/derived/shared origins.
   */
  fileHash?: string;
}
