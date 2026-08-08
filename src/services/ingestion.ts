// Ingestion service contract (§21.8). Implements 02-ingestion/01-file-drop
// (single-file drop, bundled samples) and 02-ingestion/04-multi-file
// (folder/multi-select/ZIP batches — one Dataset, many tables, per §7.5).
import type {
  ClassifiedColumn,
  ColumnProfile,
  Dataset,
  TableRegistryEntry,
} from "../types";
import { useDatasetsStore } from "../stores/datasets";
import { parseSummarizeResult } from "../lib/profile";
import { classifyColumns } from "../lib/classifier";
import { SAMPLE_MANIFEST } from "../features/ingestion/samples";
import {
  detectFormat,
  dedupeTableName,
  isFormatRejection,
  looksMalformed,
  readerCall,
  sanitizeTableName,
} from "../features/ingestion/formatPolicy";
import { expandZipFile, isZipFile } from "../features/ingestion/zip";
import {
  aggregateBytes,
  decideSizeTier,
  exceedsAggregateWarnThreshold,
  refusalMessage,
  SAMPLE_ROW_LIMIT,
} from "../features/ingestion/aggregateSize";
import { estimateHeadroomExceeded } from "../lib/memoryHeadroom";
import {
  ApiFetchError,
  fetchApiSource,
  fetchApiSourceViaRelay,
  tableNameFromUrl,
  type ApiFetchErrorCode,
} from "./apiIngestion";
import { RelayFetchError, type RelayFetchErrorCode } from "./relayClient";
import { getSharedObject } from "./export";
import type { StructureReport } from "../lib/structureReport";
import { hashBytesHex } from "../lib/dsps";
import { stageTable, unstageTable } from "./opfsStaging";
import type { PersistenceErrorCode } from "../../edge/protocol";

export class IngestionError extends Error {
  readonly code?: ApiFetchErrorCode | RelayFetchErrorCode;

  constructor(message: string, code?: ApiFetchErrorCode | RelayFetchErrorCode) {
    super(message);
    this.code = code;
  }
}

// One id per page load, shared across every relay call this tab makes —
// keys the relay's dual-keyed rate limiter (build/09-edge/02-cors-relay),
// same per-page-load-constant pattern AIChatModule.tsx's CLOUD_SESSION_ID uses.
const RELAY_SESSION_ID = crypto.randomUUID();

type EngineModule = typeof import("../workers/duckdb.worker");
let engineModule: Promise<EngineModule> | null = null;
function loadEngine(): Promise<EngineModule> {
  if (!engineModule) engineModule = import("../workers/duckdb.worker");
  return engineModule;
}

// Exported for the transformation layer (services/transforms.ts), which
// creates and re-profiles tables outside the ingest path but must go through
// the same identifier-quoting and profile/classify logic rather than a
// second implementation of either.
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// Exported for the restore path (services/workspace.ts), which rebuilds a
// staged table through the same reader call this file's ingest builds.
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// Decoding only a small slice is enough for a header line and avoids paying
// for a full-buffer decode on a large file just to sanity-check its shape.
function firstLineText(bytes: Uint8Array): string {
  const slice = bytes.subarray(0, 8192);
  const text = new TextDecoder().decode(slice);
  return text.split(/\r?\n/, 1)[0] ?? "";
}

// Same header sanity-check, but for the streaming-registration path: `File`
// has no bytes to subarray, and `Blob.slice()` is non-destructive (unlike
// `registerFileBuffer`, which transfers and detaches a Uint8Array's buffer),
// so read order relative to registration doesn't matter here.
async function firstLineTextFromFile(file: File): Promise<string> {
  const text = await file.slice(0, 8192).text();
  return text.split(/\r?\n/, 1)[0] ?? "";
}

function friendlyIngestError(error: unknown, fileName: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/no files found|IO Error/i.test(message)) {
    return `Couldn't read "${fileName}" — it may be empty or corrupted.`;
  }
  return `Couldn't parse "${fileName}": ${message}`;
}

interface IngestedTable {
  tableName: string;
  rowCount: number;
  columnCount: number;
  memoryBytes: number;
  createdAt: string;
  sampled: boolean;
  profile: ColumnProfile[];
  columns: ClassifiedColumn[];
  /** D45 snapshot's file-hash half — undefined for a sampled-tier (never fully buffered) source. */
  fileHash?: string;
}

// §8 step 1 — SUMMARIZE extraction. Column order isn't assumed by the reduced
// column list here; parseSummarizeResult resolves each by name. Quoting the
// identifier lets this run against a table name SUMMARIZE would otherwise
// choke on unquoted (e.g. one containing a space).
export async function summarizeTable(
  engine: EngineModule,
  tableName: string,
): Promise<ColumnProfile[]> {
  const result = await engine.duckDBEngine.execute(
    `SELECT column_name, column_type, min, max, approx_unique, avg, std, null_percentage
     FROM (SUMMARIZE ${quoteIdentifier(tableName)})`,
  );
  return parseSummarizeResult(result);
}

// Exact distinct counts, one column per output column, in a single scan.
// SUMMARIZE's `approx_unique` is a HyperLogLog estimate whose error was
// measured overshooting the row count on real samples (e.g. a fare column at
// ~105% "unique") — enough to trip the classifier's near-unique identifier
// heuristic and mislabel a continuous numeric column as an ID. Classification
// uses these exact counts instead; `ColumnProfile.cardinality` keeps the raw
// SUMMARIZE estimate for display. Cheap at v0 local sizes (one pass, all
// columns at once).
async function exactDistinctCounts(
  engine: EngineModule,
  tableName: string,
  columnNames: string[],
): Promise<Map<string, number>> {
  if (columnNames.length === 0) return new Map();
  const projections = columnNames
    .map((name, i) => `COUNT(DISTINCT ${quoteIdentifier(name)}) AS d${i}`)
    .join(", ");
  const result = await engine.duckDBEngine.execute(
    `SELECT ${projections} FROM ${quoteIdentifier(tableName)}`,
  );
  const row = result.rows[0] ?? [];
  return new Map(columnNames.map((name, i) => [name, Number(row[i] ?? 0)]));
}

// Classify a table's profile into semantically-typed columns, substituting the
// exact distinct count for the display-oriented approx cardinality so the
// near-unique identifier rule is decided on an accurate number.
export async function classifyTable(
  engine: EngineModule,
  tableName: string,
  profile: ColumnProfile[],
  rowCount: number,
): Promise<ClassifiedColumn[]> {
  const exact = await exactDistinctCounts(
    engine,
    tableName,
    profile.map((p) => p.name),
  );
  const classifyInput = profile.map((p) => ({
    ...p,
    cardinality: exact.get(p.name) ?? p.cardinality,
  }));
  return classifyColumns(classifyInput, rowCount);
}

// `source` is a `Uint8Array` for the ordinary in-memory path, or a `File`
// for the 100MB+ streaming path (registered as a handle, never fully read
// into JS memory — see registerFile in duckdb.worker.ts). `sampled` caps the
// ingested table at SAMPLE_ROW_LIMIT rows; it's independent of which
// `source` shape was passed, since a caller could in principle sample a
// small in-memory buffer too.
async function ingestBuffer(
  engine: EngineModule,
  vfsName: string,
  source: Uint8Array | File,
  tableName: string,
  sampled: boolean,
): Promise<IngestedTable> {
  const detected = detectFormat(vfsName);
  if (isFormatRejection(detected)) throw new IngestionError(detected.message);

  // Read before registering: duckdb-wasm's registerFileBuffer transfers the
  // underlying ArrayBuffer to the worker, detaching a Uint8Array `source` on
  // this side — any read of it afterward throws (verified live,
  // 01-file-drop). A File `source` isn't affected (Blob.slice is
  // non-destructive) but reading first either way keeps one code path.
  const headerLine =
    source instanceof File
      ? await firstLineTextFromFile(source)
      : firstLineText(source);
  // The D45 snapshot's file-hash half — only when `source` is already a fully
  // in-memory Uint8Array. A sampled-tier File is deliberately never read into
  // one (§7.5 memory headroom); hashing it here would re-introduce exactly the
  // full-buffer read that tier exists to avoid, so it stays unhashed (named
  // gap, `dsps.ts`'s DspsSnapshot.fileHash tolerates `null`).
  const fileHash =
    source instanceof Uint8Array ? await hashBytesHex(source) : undefined;
  await engine.duckDBEngine.registerFile(vfsName, source);

  const selectSql = `SELECT * FROM ${readerCall(detected, quoteLiteral(vfsName))}`;
  const createSql = `CREATE OR REPLACE TABLE ${quoteIdentifier(tableName)} AS ${
    sampled ? `${selectSql} LIMIT ${SAMPLE_ROW_LIMIT}` : selectSql
  }`;

  try {
    await engine.duckDBEngine.execute(createSql);
  } catch (error) {
    throw new IngestionError(friendlyIngestError(error, vfsName));
  }

  const describeResult = await engine.duckDBEngine.execute(
    `DESCRIBE ${quoteIdentifier(tableName)}`,
  );
  const columnCount = describeResult.rowCount;

  if (looksMalformed(detected, headerLine, columnCount)) {
    await engine.duckDBEngine.execute(
      `DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`,
    );
    throw new IngestionError(
      `"${vfsName}" has rows with a different number of columns than its header — check for a stray delimiter or malformed row.`,
    );
  }

  const [countResult, sizeResult, profile] = await Promise.all([
    engine.duckDBEngine.execute(
      `SELECT COUNT(*) AS n FROM ${quoteIdentifier(tableName)}`,
    ),
    engine.duckDBEngine.execute(
      `SELECT estimated_size FROM duckdb_tables() WHERE table_name = ${quoteLiteral(tableName)}`,
    ),
    summarizeTable(engine, tableName),
  ]);

  // Classify inline off the profile just computed (§8 step 2) so a table lands
  // in the registry already semantically typed — the broker and profile UI only
  // ever read the classified shape, never a bare profile.
  const rowCount = Number(countResult.rows[0]?.[0] ?? 0);
  const columns = await classifyTable(engine, tableName, profile, rowCount);

  return {
    tableName,
    rowCount,
    columnCount,
    memoryBytes: Number(sizeResult.rows[0]?.[0] ?? 0),
    createdAt: new Date().toISOString(),
    sampled,
    profile,
    columns,
    fileHash,
  };
}

/**
 * Stage a table's source bytes so it survives a refresh (S6.9 / 07b).
 *
 * Scope call 5 decides durability per origin, not uniformly: only a
 * **non-sampled `file`/`sample`** table is staged. A sampled-tier file is
 * never fully read into memory by design, so persisting its bytes would
 * re-introduce exactly the full buffer that tier exists to avoid; `api` tables
 * re-fetch and `derived` tables replay their `generatingSql` instead.
 *
 * Called after the ingest succeeds, so a file DuckDB refused never leaves
 * bytes behind, and passed the original `File` wherever one exists — a `Blob`
 * crosses `postMessage` by reference, so a large drop isn't copied just to be
 * persisted. Never throws: an undurable workspace is a reported state, not an
 * ingest failure.
 */
async function stageDurableSource(
  ingested: IngestedTable,
  fileName: string,
  source: Blob,
): Promise<void> {
  if (ingested.sampled) return;
  await stageTable(
    {
      tableName: ingested.tableName,
      fileName,
      fileHash: ingested.fileHash,
      stagedAt: ingested.createdAt,
    },
    source,
  );
}

function existingTableNames(): Set<string> {
  return new Set(useDatasetsStore.getState().tables.map((t) => t.tableName));
}

function toRegistryEntry(
  ingested: IngestedTable,
  datasetId: string,
  origin: TableRegistryEntry["origin"],
  sourceUrl?: string,
): TableRegistryEntry {
  return {
    id: crypto.randomUUID(),
    tableName: ingested.tableName,
    datasetId,
    origin,
    rowCount: ingested.rowCount,
    columnCount: ingested.columnCount,
    memoryBytes: ingested.memoryBytes,
    createdAt: ingested.createdAt,
    sampled: ingested.sampled,
    sampleRowLimit: ingested.sampled ? SAMPLE_ROW_LIMIT : undefined,
    profile: ingested.profile,
    columns: ingested.columns,
    sourceUrl,
    lastFetchedAt: sourceUrl ? ingested.createdAt : undefined,
    fileHash: ingested.fileHash,
  };
}

// Size-tier gate: nothing reaches `arrayBuffer()` without a tier decision
// first. `bytes` is checked with nothing more than `File.size` (no I/O)
// before any read is attempted, so a `refuse`-tier file never touches the
// engine, and a `sampled`-tier file never gets copied into a Uint8Array at
// all — it streams straight through registerFileHandle instead.
function sizeTierFor(bytes: number): ReturnType<typeof decideSizeTier> {
  return decideSizeTier(bytes, estimateHeadroomExceeded(bytes));
}

async function loadFile(file: File): Promise<Dataset> {
  const tier = sizeTierFor(file.size);
  if (tier === "refuse") throw new IngestionError(refusalMessage(file.size));

  const engine = await loadEngine();
  const taken = existingTableNames();
  const base = sanitizeTableName(file.name.replace(/\.[^./]+$/, ""));
  const tableName = dedupeTableName(base, taken);

  const sampled = tier === "sampled";
  const source: Uint8Array | File = sampled
    ? file
    : new Uint8Array(await file.arrayBuffer());
  const ingested = await ingestBuffer(
    engine,
    file.name,
    source,
    tableName,
    sampled,
  );
  await stageDurableSource(ingested, file.name, file);

  const dataset: Dataset = {
    id: crypto.randomUUID(),
    name: file.name,
    sourceType: "file",
    tableNames: [ingested.tableName],
    ingestedAt: ingested.createdAt,
  };
  useDatasetsStore
    .getState()
    .registerDataset(dataset, [toRegistryEntry(ingested, dataset.id, "file")]);
  return dataset;
}

async function loadSample(sampleId: string): Promise<Dataset> {
  const manifestEntry = SAMPLE_MANIFEST.find((s) => s.id === sampleId);
  if (!manifestEntry)
    throw new IngestionError(`Unknown sample dataset "${sampleId}".`);

  const engine = await loadEngine();
  const taken = existingTableNames();
  const datasetId = crypto.randomUUID();
  const tableNames: string[] = [];
  const entries: TableRegistryEntry[] = [];

  for (const file of manifestEntry.files) {
    const response = await fetch(file.url);
    if (!response.ok)
      throw new IngestionError(`Couldn't load sample file "${file.url}".`);
    const buffer = new Uint8Array(await response.arrayBuffer());
    // Taken before ingest: `registerFileBuffer` transfers and detaches
    // `buffer`, so there would be nothing left to stage afterwards. Bundled
    // samples are small, which is what makes this copy free here and wrong on
    // the dropped-file path (which stages the `File` itself instead).
    const stageable = new Blob([buffer]);
    const vfsName = file.url.split("/").pop() ?? file.tableName;
    const tableName = dedupeTableName(file.tableName, taken);
    taken.add(tableName);

    // Bundled samples are fixed, developer-controlled assets, all well under
    // any tier boundary — no size-tier check needed here (unlike loadFile/
    // loadFiles below), always the ordinary in-memory path.
    const ingested = await ingestBuffer(
      engine,
      vfsName,
      buffer,
      tableName,
      false,
    );
    await stageDurableSource(ingested, vfsName, stageable);
    tableNames.push(ingested.tableName);
    entries.push(toRegistryEntry(ingested, datasetId, "sample"));
  }

  const dataset: Dataset = {
    id: datasetId,
    name: manifestEntry.label,
    sourceType: "sample",
    tableNames,
    ingestedAt: new Date().toISOString(),
  };
  useDatasetsStore.getState().registerDataset(dataset, entries);
  return dataset;
}

export function loadDataset(source: File | string): Promise<Dataset> {
  return source instanceof File ? loadFile(source) : loadSample(source);
}

export interface UrlIngestResult {
  dataset: Dataset;
  pagesFetched: number;
  bytesAccumulated: number;
  sizeTier: ReturnType<typeof decideSizeTier>;
  /** True when Tier 1 failed CORS and Tier 2 (the relay) carried the fetch instead — the §5.2 disclosure trigger. */
  usedRelay: boolean;
}

// Tier 1 API ingestion (§7.4, build/07-connectivity/01-api-tier1-fetch) — a
// separate entry point from loadDataset rather than a third branch on its
// `File | string` union, since a URL and a sample id are both plain strings
// with no shared shape to dispatch on; the two arrive from different UI
// controls (UrlInputForm vs SamplePicker) that already know which is which.
// `onProgress` reports page-by-page telemetry while the fetch loop runs;
// unlike the file-size gate (checked before any read), the size tier here can
// only be known once bytes have actually arrived, so it's returned alongside
// the dataset for the caller to render the same warn/sampled banners the file
// path shows pre-emptively.
//
// Tier 1 → Tier 2 handoff (§7.4, build/07-connectivity/02-api-tier2-relay):
// a `cors-suspected` failure retries transparently through the relay rather
// than surfacing an error — the seam 01-api-tier1-fetch.md's own CORS
// acceptance criterion named as open pending Tier 2's existence. Tier 1
// fails on its very first fetch attempt when CORS-blocked (fetch() rejects
// before any response reaches JS), so there's never partial multi-page
// state to reconcile before retrying from scratch via the relay.
export async function loadUrl(
  rawUrl: string,
  onProgress?: (pagesFetched: number, bytesAccumulated: number) => void,
): Promise<UrlIngestResult> {
  let fetchResult;
  let usedRelay = false;
  try {
    fetchResult = await fetchApiSource(rawUrl, { onProgress });
  } catch (error) {
    if (!(error instanceof ApiFetchError)) throw error;
    if (error.code !== "cors-suspected")
      throw new IngestionError(error.message, error.code);

    usedRelay = true;
    try {
      fetchResult = await fetchApiSourceViaRelay(rawUrl, RELAY_SESSION_ID, {
        onProgress,
      });
    } catch (relayError) {
      if (relayError instanceof RelayFetchError)
        throw new IngestionError(relayError.message, relayError.code);
      if (relayError instanceof ApiFetchError)
        throw new IngestionError(relayError.message, relayError.code);
      throw relayError;
    }
  }

  const engine = await loadEngine();
  const taken = existingTableNames();
  const base = sanitizeTableName(tableNameFromUrl(rawUrl));
  const tableName = dedupeTableName(base, taken);
  const sampled = fetchResult.sizeTier === "sampled";

  const ingested = await ingestBuffer(
    engine,
    `${tableName}.json`,
    fetchResult.buffer,
    tableName,
    sampled,
  );

  const dataset: Dataset = {
    id: crypto.randomUUID(),
    name: rawUrl,
    sourceType: "api",
    tableNames: [ingested.tableName],
    ingestedAt: ingested.createdAt,
  };
  useDatasetsStore
    .getState()
    .registerDataset(dataset, [
      toRegistryEntry(ingested, dataset.id, "api", rawUrl),
    ]);

  return {
    dataset,
    pagesFetched: fetchResult.pagesFetched,
    bytesAccumulated: fetchResult.bytesAccumulated,
    sizeTier: fetchResult.sizeTier,
    usedRelay,
  };
}

/** True when `sql` references `tableName` as a bare or double-quoted identifier — the only trace of a derived table's sources this codebase keeps (no explicit dependency graph). */
export function referencesTableName(sql: string, tableName: string): boolean {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`"${escaped}"|\\b${escaped}\\b`).test(sql);
}

export interface RefreshResult {
  pagesFetched: number;
  bytesAccumulated: number;
  sizeTier: ReturnType<typeof decideSizeTier>;
  /** True when Tier 1 failed CORS and Tier 2 (the relay) carried this refresh instead — same §5.2 disclosure trigger as the original ingest. */
  usedRelay: boolean;
}

// §7.4 "Refresh from source" (build/07-connectivity/03-refresh-from-source):
// re-runs the same Tier 1 → Tier 2 cascade loadUrl used originally, against
// the table's recorded sourceUrl, then swaps the result in under the
// existing table name. The new data is ingested under a scratch name first
// via the unmodified ingestBuffer path — every format/malformed-row check it
// already runs — so a failure at any point (network, parse, malformed rows)
// never touches the table currently registered: DROP+RENAME only happens
// once ingestBuffer has fully succeeded, satisfying "old table stays
// queryable until the new ingest succeeds" without needing DuckDB
// transaction semantics this app doesn't otherwise use.
export async function refreshTableFromSource(
  tableId: string,
  onProgress?: (pagesFetched: number, bytesAccumulated: number) => void,
): Promise<RefreshResult> {
  const table = useDatasetsStore
    .getState()
    .tables.find((t) => t.id === tableId);
  if (!table) throw new IngestionError(`Unknown table id "${tableId}".`);
  if (table.origin !== "api" || !table.sourceUrl) {
    throw new IngestionError(
      `"${table.tableName}" has no recorded source URL to refresh from.`,
    );
  }

  let fetchResult;
  let usedRelay = false;
  try {
    fetchResult = await fetchApiSource(table.sourceUrl, { onProgress });
  } catch (error) {
    if (!(error instanceof ApiFetchError)) throw error;
    if (error.code !== "cors-suspected")
      throw new IngestionError(error.message, error.code);

    usedRelay = true;
    try {
      fetchResult = await fetchApiSourceViaRelay(
        table.sourceUrl,
        RELAY_SESSION_ID,
        { onProgress },
      );
    } catch (relayError) {
      if (relayError instanceof RelayFetchError)
        throw new IngestionError(relayError.message, relayError.code);
      if (relayError instanceof ApiFetchError)
        throw new IngestionError(relayError.message, relayError.code);
      throw relayError;
    }
  }

  const engine = await loadEngine();
  const taken = existingTableNames();
  const stagingName = dedupeTableName(
    sanitizeTableName(`${table.tableName}_refresh`),
    taken,
  );
  const sampled = fetchResult.sizeTier === "sampled";

  const ingested = await ingestBuffer(
    engine,
    `${stagingName}.json`,
    fetchResult.buffer,
    stagingName,
    sampled,
  );

  await engine.duckDBEngine.execute(
    `DROP TABLE IF EXISTS ${quoteIdentifier(table.tableName)}`,
  );
  await engine.duckDBEngine.execute(
    `ALTER TABLE ${quoteIdentifier(stagingName)} RENAME TO ${quoteIdentifier(table.tableName)}`,
  );

  const store = useDatasetsStore.getState();
  store.setTableStats(tableId, {
    rowCount: ingested.rowCount,
    columnCount: ingested.columnCount,
    memoryBytes: ingested.memoryBytes,
  });
  store.setTableProfile(tableId, ingested.profile);
  store.setTableColumns(tableId, ingested.columns);
  store.setTableRefreshMeta(tableId, {
    sampled: ingested.sampled,
    sampleRowLimit: ingested.sampled ? SAMPLE_ROW_LIMIT : undefined,
    lastFetchedAt: new Date().toISOString(),
  });

  // Dependent derived tables aren't auto-rebuilt (§12.1 — their recorded SQL
  // makes a manual re-run cheap); this just flags them so the UI can say so.
  const dependentIds = store.tables
    .filter(
      (t) =>
        t.origin === "derived" &&
        t.generatingSql &&
        referencesTableName(t.generatingSql, table.tableName),
    )
    .map((t) => t.id);
  if (dependentIds.length > 0) store.markTablesStale(dependentIds);

  return {
    pagesFetched: fetchResult.pagesFetched,
    bytesAccumulated: fetchResult.bytesAccumulated,
    sizeTier: fetchResult.sizeTier,
    usedRelay,
  };
}

export interface SkippedFile {
  name: string;
  /**
   * `'unsupported'` — format rejected before ingest ever ran; `'failed'` —
   * malformed content or a DuckDB error mid-ingest; `'refused'` — over the
   * 300MB ingest ceiling, rejected on `File.size` alone before any read.
   */
  kind: "unsupported" | "failed" | "refused";
  reason: string;
}

export interface BatchIngestResult {
  dataset: Dataset;
  skipped: SkippedFile[];
  aggregateBytes: number;
  aggregateWarning: boolean;
}

// One level of ZIP expansion only — a zip nested inside an extracted zip is
// left as an unsupported-format entry rather than recursed into, so a
// maliciously nested archive can't blow up expansion work unboundedly.
async function expandBatch(files: File[]): Promise<File[]> {
  const expanded = await Promise.all(
    files.map((file) => (isZipFile(file) ? expandZipFile(file) : [file])),
  );
  return expanded.flat();
}

/**
 * Folder drop, multi-select, and ZIP ingestion (§7.5, D13/D30) — one Dataset,
 * one table per supported file. Unsupported files and per-file ingest
 * failures are both collected into `skipped` rather than aborting the batch,
 * so one bad file in a folder doesn't sink the rest.
 */
export async function loadFiles(rawFiles: File[]): Promise<BatchIngestResult> {
  if (rawFiles.length === 0) throw new IngestionError("No files to ingest.");

  const files = await expandBatch(rawFiles);

  const skipped: SkippedFile[] = [];
  const supported: File[] = [];
  for (const file of files) {
    const detected = detectFormat(file.name);
    if (isFormatRejection(detected)) {
      skipped.push({
        name: file.name,
        kind: "unsupported",
        reason: detected.message,
      });
    } else {
      supported.push(file);
    }
  }

  // Pre-scan sizes across the whole batch before ingesting anything.
  const totalBytes = aggregateBytes(supported);
  const aggregateWarning = exceedsAggregateWarnThreshold(totalBytes);

  if (supported.length === 0) {
    throw new IngestionError(
      skipped.length > 0
        ? `None of the ${skipped.length} file${skipped.length === 1 ? "" : "s"} dropped are in a supported format.`
        : "No files to ingest.",
    );
  }

  const engine = await loadEngine();
  const taken = existingTableNames();
  const datasetId = crypto.randomUUID();
  const tableNames: string[] = [];
  const entries: TableRegistryEntry[] = [];

  for (const file of supported) {
    // Size tiers apply per file within the batch, not just to the aggregate
    // above — the aggregate banner is a separate, additive warning; one
    // oversized file in an otherwise-small folder still gets its own
    // sampled/refuse treatment. Headroom is re-read per file rather than
    // once up front so it reflects whatever the batch has already consumed
    // by the time this file's turn comes up.
    const tier = decideSizeTier(file.size, estimateHeadroomExceeded(file.size));
    if (tier === "refuse") {
      skipped.push({
        name: file.name,
        kind: "refused",
        reason: refusalMessage(file.size),
      });
      continue;
    }

    const base = sanitizeTableName(file.name.replace(/\.[^./]+$/, ""));
    const tableName = dedupeTableName(base, taken);
    taken.add(tableName);

    try {
      const sampled = tier === "sampled";
      const source: Uint8Array | File = sampled
        ? file
        : new Uint8Array(await file.arrayBuffer());
      const ingested = await ingestBuffer(
        engine,
        file.name,
        source,
        tableName,
        sampled,
      );
      await stageDurableSource(ingested, file.name, file);
      tableNames.push(ingested.tableName);
      entries.push(toRegistryEntry(ingested, datasetId, "file"));
    } catch (error) {
      skipped.push({
        name: file.name,
        kind: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (tableNames.length === 0) {
    throw new IngestionError(
      "None of the dropped files could be ingested — see the summary for why.",
    );
  }

  const dataset: Dataset = {
    id: datasetId,
    name:
      rawFiles.length === 1 ? rawFiles[0].name : `${tableNames.length} files`,
    sourceType: "folder",
    tableNames,
    ingestedAt: new Date().toISOString(),
  };
  useDatasetsStore.getState().registerDataset(dataset, entries);

  return { dataset, skipped, aggregateBytes: totalBytes, aggregateWarning };
}

export async function removeDataset(datasetId: string): Promise<void> {
  const store = useDatasetsStore.getState();
  const dataset = store.datasets.find((d) => d.id === datasetId);
  if (!dataset) return;

  const engine = await loadEngine();
  for (const tableName of dataset.tableNames) {
    await engine.duckDBEngine.execute(
      `DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`,
    );
    // Without this the table would reappear on the next reload, restored from
    // bytes whose registry entry the user just deleted (S6.9 / 07b).
    await unstageTable(tableName);
  }
  store.removeDataset(datasetId);
}

// Removes one table independent of its dataset siblings — the ecommerce
// sample (one dataset, four tables) is the case this matters for until
// 04-multi-file adds folder drop as a second multi-table ingest path.
export async function removeTable(tableId: string): Promise<void> {
  const store = useDatasetsStore.getState();
  const table = store.tables.find((t) => t.id === tableId);
  if (!table) return;

  const engine = await loadEngine();
  // `DROP TABLE` does not drop a view (A3) — issuing the wrong keyword would
  // leave the object in DuckDB with no registry row pointing at it, which is
  // the S6.9 "registry is a claim" failure running in the other direction.
  const keyword = table.kind === "view" ? "VIEW" : "TABLE";
  await engine.duckDBEngine.execute(
    `DROP ${keyword} IF EXISTS ${quoteIdentifier(table.tableName)}`,
  );
  await unstageTable(table.tableName);
  store.removeTable(tableId);
}

// Re-profile hook: ingestion already profiles and classifies every table
// atomically at creation (ingestBuffer, above) as part of satisfying "profile
// within 500ms of ingest" without a second store write. This standalone entry
// point re-profiles *and re-classifies* an existing table after it changes
// shape — the "derived tables re-profile automatically" requirement
// 05-transformation-layer's `CREATE TABLE AS` will call after building a
// derived table; nothing calls it yet. Re-classification drops any prior
// per-column manual override, since a reshaped table's columns may no longer
// correspond to the ones that were overridden.
const SHARE_OPEN_ERROR_MESSAGE: Partial<
  Record<PersistenceErrorCode | "unreachable", string>
> = {
  "not-found": "This share link doesn't exist or has expired.",
  paused: "Save/share is temporarily paused — try again later.",
  unavailable: "Save/share is temporarily unavailable — try again later.",
  unreachable: "Couldn't reach the server to open this share link.",
};

export interface OpenShareResult {
  kind: "dataset" | "structure-report";
  /** Present when `kind === 'dataset'` — a full-dataset share, ingested and registered like any other table. */
  dataset?: Dataset;
  /** Present when `kind === 'structure-report'` — the structure-only default artifact, which carries no rows to register as a table. */
  structureReport?: StructureReport;
}

// Opening a share link (§12.3, build/08-persistence/02-r2-save-share). A
// full-dataset share is a Parquet buffer — ingested through the same
// ingestBuffer path every other source uses (registry → profile → broker),
// tagged `origin: 'shared'` so TableList/the Dossier can say so. The
// structure-only default artifact is JSON with no rows at all, so there is
// nothing to register as a queryable table — it's returned for a read-only
// viewer instead.
export async function loadSharedDataset(
  token: string,
): Promise<OpenShareResult> {
  const result = await getSharedObject(token);
  if (!result.ok) {
    throw new IngestionError(
      SHARE_OPEN_ERROR_MESSAGE[result.code] ?? "Couldn't open this share link.",
    );
  }

  if (result.contentType.includes("json")) {
    let structureReport: StructureReport;
    try {
      structureReport = JSON.parse(
        new TextDecoder().decode(result.buffer),
      ) as StructureReport;
    } catch {
      throw new IngestionError(
        "This share link's structure report is corrupted or not valid JSON.",
      );
    }
    return { kind: "structure-report", structureReport };
  }

  const engine = await loadEngine();
  const taken = existingTableNames();
  const tableName = dedupeTableName("shared_dataset", taken);
  const ingested = await ingestBuffer(
    engine,
    `${tableName}.parquet`,
    result.buffer,
    tableName,
    false,
  );

  const dataset: Dataset = {
    id: crypto.randomUUID(),
    name: "Shared dataset",
    sourceType: "shared",
    tableNames: [ingested.tableName],
    ingestedAt: ingested.createdAt,
  };
  useDatasetsStore
    .getState()
    .registerDataset(dataset, [
      toRegistryEntry(ingested, dataset.id, "shared"),
    ]);
  return { kind: "dataset", dataset };
}

export async function profileTable(tableId: string): Promise<ColumnProfile[]> {
  const store = useDatasetsStore.getState();
  const table = store.tables.find((t) => t.id === tableId);
  if (!table) throw new IngestionError(`Unknown table id "${tableId}".`);

  const engine = await loadEngine();
  // Row/column count and memory footprint are re-read alongside the profile
  // rather than reusing the entry's existing values — the transformation
  // layer (05-transformation-layer, this function's first real caller) can
  // reshape a table's row count via UPDATE/DELETE, so `table.rowCount` here
  // may already be stale by the time this runs.
  const [describeResult, countResult, sizeResult] = await Promise.all([
    engine.duckDBEngine.execute(`DESCRIBE ${quoteIdentifier(table.tableName)}`),
    engine.duckDBEngine.execute(
      `SELECT COUNT(*) AS n FROM ${quoteIdentifier(table.tableName)}`,
    ),
    engine.duckDBEngine.execute(
      `SELECT estimated_size FROM duckdb_tables() WHERE table_name = ${quoteLiteral(table.tableName)}`,
    ),
  ]);
  const rowCount = Number(countResult.rows[0]?.[0] ?? 0);
  const profile = await summarizeTable(engine, table.tableName);
  const columns = await classifyTable(
    engine,
    table.tableName,
    profile,
    rowCount,
  );

  store.setTableStats(tableId, {
    rowCount,
    columnCount: describeResult.rowCount,
    memoryBytes: Number(sizeResult.rows[0]?.[0] ?? 0),
  });
  store.setTableProfile(tableId, profile);
  store.setTableColumns(tableId, columns);
  return profile;
}
