import type { ClassifiedColumn, ColumnProfile } from './schema';

/** One ingestion event — a dropped file, folder, API fetch, or bundled sample (§7.5). */
export interface Dataset {
  id: string;
  name: string;
  sourceType: 'file' | 'folder' | 'api' | 'sample' | 'derived';
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
  origin: 'file' | 'derived' | 'api' | 'sample';
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
}
